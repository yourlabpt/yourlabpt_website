/**
 * Prompt packs: small AI calls that each do one job.
 *
 * Every call is built from the same four blocks, in this order:
 *
 *   1. skill     — the stable method, from skills/_packs/<pack>/SKILL.md
 *   2. slice     — only what this job needs from the project, capped
 *   3. change    — what the person just did
 *   4. contract  — the exact JSON to answer with
 *
 * One job per call, never a chain. The answer is checked against the project before it
 * is shown (a named file must exist), and nothing is ever applied: a person reads it and
 * decides. Same runtime contract as lib/mockup-runner.js — no work item, no persona
 * history.
 */
const agentPersonas = require('./agent-personas');
const agentPlatformSettings = require('./agent-platform-settings');
const llmOptions = require('./llm-options');
const skills = require('./skills');
const openspecFormat = require('./openspec-format');
const { REQUIREMENT_TYPES } = require('./workspace-format');
const { normalizeRepoPath, buildScope, isInScope } = require('./agent-code-commit');
const posix = require('path').posix;

// ~2k tokens of project context. A job that needs more is a job to split.
// ponytail: fixed cap; size it from MODEL_PROFILES if packs start running on bigger engines.
const MAX_SLICE_CHARS = 8000;
const MAX_CHANGE_CHARS = 6000;

function cap(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}\n… (cortado em ${max} caracteres)` : value;
}

/** What the project holds, as one line per file — names and headings, never full text. */
function projectOutline(snapshot) {
  const lines = [];
  for (const phase of snapshot?.phases || []) {
    const features = phase.features.map((feature) => `${feature.title}${feature.requirements.length ? ` [${feature.requirements.join(', ')}]` : ''}`);
    lines.push(`${phase.file} — fase ${phase.number}: ${phase.title}${features.length ? ` · features: ${features.join('; ')}` : ''}`);
  }
  for (const spec of snapshot?.requirements || []) {
    lines.push(`openspec/specs/${spec.capability}/spec.md — requisitos: ${spec.requirements.map((r) => r.title).join('; ')}`);
  }
  for (const diagram of snapshot?.diagrams || []) lines.push(`${diagram.file} — diagrama: ${diagram.title}`);
  if (snapshot?.database?.entities?.length) {
    lines.push(`yourlab/database.md — entidades: ${snapshot.database.entities.map((entity) => entity.name).join(', ')}`);
  }
  for (const workflow of snapshot?.workflows || []) lines.push(`${workflow.file} — workflow: ${workflow.title}`);
  for (const screen of snapshot?.mockup?.screens || []) lines.push(`yourlab/mockup/${screen.file} — ecrã: ${screen.title}`);
  if (snapshot?.project) lines.push(`yourlab/project.md — propósito: ${String(snapshot.project.purpose).split('\n')[0]}`);
  return lines.join('\n');
}

function knownPaths(snapshot) {
  return new Set((snapshot?.files || []).map((file) => file.path));
}

const PACKS = {
  impact: {
    // Our own packs live under skills/_packs/, apart from the vendored persona skills.
    skill: '_packs/impact',
    // Whose engine settings the call borrows. Personas are on hold; this is plumbing.
    personaId: 'module_architect',
    camada: 2,
    slice: ({ snapshot }) => projectOutline(snapshot),
    change: ({ input }) => `Ficheiro alterado: ${input.path}\n\n${input.diff}`,
    contract: [
      'Responda APENAS com este JSON, sem texto antes ou depois:',
      '{"artefacts":[{"path":"<caminho da lista>","why":"<uma frase>"}],',
      ' "codeAreas":[{"area":"<parte do código>","why":"<uma frase>"}],',
      ' "summary":"<uma frase>"}',
      'No máximo 8 itens em cada lista. Listas vazias se nada for afectado.',
    ].join('\n'),
    validate(answer, { snapshot, input }) {
      const paths = knownPaths(snapshot);
      const artefacts = Array.isArray(answer?.artefacts) ? answer.artefacts : [];
      // A path the project does not have is a hallucination; it is dropped and counted.
      const kept = artefacts.filter((entry) => paths.has(String(entry?.path)) && entry.path !== input.path).slice(0, 8);
      return {
        result: {
          artefacts: kept.map((entry) => ({ path: String(entry.path), why: String(entry.why || '').slice(0, 300) })),
          codeAreas: (Array.isArray(answer?.codeAreas) ? answer.codeAreas : []).slice(0, 8)
            .map((entry) => ({ area: String(entry?.area || '').slice(0, 120), why: String(entry?.why || '').slice(0, 300) }))
            .filter((entry) => entry.area),
          summary: String(answer?.summary || '').slice(0, 300),
        },
        dropped: artefacts.length - kept.length,
      };
    },
    inputError: ({ input, snapshot }) => {
      if (!snapshot?.initialized) return 'O projecto ainda não foi lido do repositório. Toque em Actualizar em Artefactos.';
      return !input?.path || !input?.diff ? 'Falta o ficheiro e a alteração a analisar.' : '';
    },
  },

  split_task: {
    skill: '_packs/split-task',
    sliceLabel: 'A tarefa:',
    personaId: 'module_architect',
    camada: 3,
    // The task itself is the slice: nothing else is needed to cut it.
    slice: ({ task }) => [
      `Título: ${task.title}`,
      task.descriptionMarkdown ? `Descrição:\n${task.descriptionMarkdown}` : '',
      task.acceptanceCriteriaMarkdown ? `Critérios de aceitação:\n${task.acceptanceCriteriaMarkdown}` : '',
    ].filter(Boolean).join('\n\n'),
    change: () => 'Divida esta tarefa em tarefas mais pequenas.',
    contract: [
      'Responda APENAS com este JSON, sem texto antes ou depois:',
      '{"tasks":[{"title":"<imperativo curto>","goal":"<uma frase>"}],"summary":"<uma frase>"}',
      'Entre 2 e 6 tarefas, pela ordem em que devem ser feitas.',
    ].join('\n'),
    validate(answer) {
      const raw = Array.isArray(answer?.tasks) ? answer.tasks : [];
      const seen = new Set();
      const tasks = [];
      for (const entry of raw) {
        const title = String(entry?.title || '').trim().slice(0, 140);
        if (!title || seen.has(title.toLowerCase())) continue;
        seen.add(title.toLowerCase());
        tasks.push({ title, goal: String(entry?.goal || '').trim().slice(0, 400) });
      }
      const kept = tasks.slice(0, 6);
      return { result: { tasks: kept, summary: String(answer?.summary || '').slice(0, 300) }, dropped: raw.length - kept.length };
    },
    inputError: ({ task }) => (!task ? 'Tarefa não encontrada.' : ''),
  },
};

/**
 * Writing down what existing code already does, one area at a time. The files are read
 * by the route (only from an area the survey found), not by the model.
 */
PACKS.artefacts_from_code = {
  skill: '_packs/artefacts-from-code',
  sliceLabel: 'O código desta parte:',
  needsCode: true,
  personaId: 'product_owner',
  camada: 3,
  slice: ({ code }) => (code || []).map((file) => `### ${file.path}\n${file.content}`).join('\n\n'),
  change: ({ input }) => `Parte do código: ${input.area}. Escreva os requisitos que este código já cumpre.`,
  contract: [
    'Responda APENAS com este JSON, sem texto antes ou depois:',
    '{"capability":"<slug>","summary":"<uma frase>",',
    ' "requirements":[{"title":"<curto>","type":"functional|non_functional|stakeholder|undefined",',
    '   "shall":"O sistema SHALL …","scenarios":[{"title":"…","when":"…","then":"…"}]}]}',
    'No máximo 12 requisitos e 3 cenários por requisito.',
  ].join('\n'),
  validate(answer, { input }) {
    const raw = Array.isArray(answer?.requirements) ? answer.requirements : [];
    const requirements = raw
      .map((entry) => ({
        title: String(entry?.title || '').trim().slice(0, 140),
        // A type the platform does not know is not guessed into one it does.
        type: REQUIREMENT_TYPES.includes(String(entry?.type)) && entry.type !== 'test_case' && entry.type !== 'out_of_scope' ? entry.type : 'undefined',
        shall: String(entry?.shall || '').trim().slice(0, 600),
        module: input.area,
        scenarios: (Array.isArray(entry?.scenarios) ? entry.scenarios : []).slice(0, 3).map((scenario) => ({
          title: String(scenario?.title || '').trim().slice(0, 140),
          when: String(scenario?.when || '').trim().slice(0, 300),
          then: String(scenario?.then || '').trim().slice(0, 300),
        })).filter((scenario) => scenario.title),
      }))
      .filter((entry) => entry.title && entry.shall)
      .slice(0, 12);
    const capability = openspecFormat.slugify(String(answer?.capability || input.area.split('/').pop() || 'codigo')) || 'codigo';
    const spec = openspecFormat.serializeSpec({
      capability,
      title: capability,
      module: input.area,
      purpose: `Gerado do código em ${input.area}, por rever. ${String(answer?.summary || '').slice(0, 300)}`.trim(),
      requirements,
    });
    return {
      result: { capability, path: `openspec/specs/${capability}/spec.md`, requirements, summary: String(answer?.summary || '').slice(0, 300), spec },
      dropped: raw.length - requirements.length,
    };
  },
  inputError: ({ input, code }) => {
    if (!input?.area) return 'Escolha uma parte do código.';
    return code?.length ? '' : 'Não encontrei ficheiros de código nessa parte.';
  },
};

// Where a test file may live. Anything else a pack returns is not a test and is dropped.
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)\/.+\.[a-z]+$|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/i;
const MAX_TEST_FILE_CHARS = 20000;

/** A safe, test-shaped repository path, or '' when it is not one. */
function testPath(raw) {
  const clean = normalizeRepoPath(raw);
  return clean && TEST_PATH.test(clean) && !clean.startsWith('yourlab/') ? clean : '';
}

// The frameworks whose name in package.json says how tests are run here.
const TEST_FRAMEWORKS = ['vitest', 'jest', 'mocha', 'ava', 'tap', '@playwright/test', 'cypress', 'supertest'];

PACKS.tests_from_artefacts = {
  skill: '_packs/tests-from-artefacts',
  sliceLabel: 'Os requisitos a testar:',
  needsTestContext: true,
  personaId: 'tester',
  camada: 4,
  slice: ({ snapshot, input, framework, existingTests }) => {
    const spec = (snapshot?.requirements || []).find((entry) => entry.capability === input.capability);
    const requirements = (spec?.requirements || []).map((requirement) => [
      `- ${requirement.id ? `[${requirement.id}] ` : ''}${requirement.title} (${requirement.type}): ${requirement.shall}`,
      ...requirement.scenarios.map((scenario) => `  - Cenário «${scenario.title}»: QUANDO ${scenario.when} ENTÃO ${scenario.then}`),
    ].join('\n'));
    return [
      `Capacidade: ${input.capability} (openspec/specs/${input.capability}/spec.md)`,
      `Framework de testes: ${framework || 'não detectado — use o runner padrão da linguagem'}`,
      existingTests?.length ? `Testes que já existem: ${existingTests.join(', ')}` : 'Ainda não há testes no repositório.',
      '',
      ...requirements,
    ].join('\n');
  },
  change: () => 'Escreva os testes que verificam estes requisitos e cenários, antes do código.',
  contract: [
    'Responda APENAS com este JSON, sem texto antes ou depois:',
    '{"files":[{"path":"tests/…","content":"<ficheiro completo>"}],',
    ' "covers":[{"requirement":"<título>","scenario":"<título ou vazio>"}],"summary":"<uma frase>"}',
    'No máximo 3 ficheiros, só de testes.',
  ].join('\n'),
  validate(answer) {
    const raw = Array.isArray(answer?.files) ? answer.files : [];
    const seen = new Set();
    const files = [];
    for (const entry of raw) {
      const path = testPath(entry?.path);
      const content = String(entry?.content || '');
      if (!path || seen.has(path) || !content.trim() || content.length > MAX_TEST_FILE_CHARS) continue;
      seen.add(path);
      files.push({ path, content });
    }
    const kept = files.slice(0, 3);
    return {
      result: {
        files: kept,
        covers: (Array.isArray(answer?.covers) ? answer.covers : []).slice(0, 40)
          .map((entry) => ({ requirement: String(entry?.requirement || '').slice(0, 140), scenario: String(entry?.scenario || '').slice(0, 140) }))
          .filter((entry) => entry.requirement),
        summary: String(answer?.summary || '').slice(0, 300),
      },
      dropped: raw.length - kept.length,
    };
  },
  inputError: ({ snapshot, input }) => {
    if (!snapshot?.initialized) return 'O projecto ainda não foi lido do repositório. Toque em Actualizar em Artefactos.';
    const spec = (snapshot.requirements || []).find((entry) => entry.capability === input?.capability);
    return spec?.requirements?.length ? '' : 'Essa capacidade não tem requisitos para testar.';
  },
};

// Files a code pack never writes, whatever the scope says.
const NEVER_CODE = /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|\.env[^/]*)$|^(yourlab|openspec)\//i;
const MAX_CODE_FILE_CHARS = 40000;

/**
 * The code files a test file imports by relative path, resolved even when they do not
 * exist yet — tests come first. JS/TS only.
 * ponytail: relative require/import only; add language-specific resolvers when a Python or Go project needs it.
 */
function importTargets(testFilePath, content) {
  const dir = posix.dirname(testFilePath);
  const found = new Set();
  const patterns = [/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, /from\s+['"](\.{1,2}\/[^'"]+)['"]/g, /import\s+['"](\.{1,2}\/[^'"]+)['"]/g];
  for (const pattern of patterns) {
    for (const match of String(content || '').matchAll(pattern)) {
      let target = normalizeRepoPath(posix.join(dir, match[1]));
      if (!target) continue;
      if (!/\.[a-z]+$/i.test(target)) target += posix.extname(testFilePath).replace(/^\.(test|spec)/, '') || '.js';
      if (!testPath(target) && !NEVER_CODE.test(target)) found.add(target);
    }
  }
  return [...found].sort();
}

/** Where a code pack may write: the folders of what the tests import. Empty = nowhere. */
function codeScopeFor(targets) {
  return buildScope({ modulePaths: [...new Set(targets.map((target) => posix.dirname(target)).filter((dir) => dir && dir !== '.'))] });
}

PACKS.code_from_tests = {
  skill: '_packs/code-from-tests',
  sliceLabel: 'Os testes e o código que eles usam:',
  needsTestsAndCode: true,
  personaId: 'developer',
  camada: 4,
  slice: ({ testFiles = [], codeFiles = [], scope }) => [
    `Pode escrever em: ${(scope?.prefixes || []).join(', ')}`,
    '',
    ...testFiles.map((file) => `### ${file.path} (teste — não alterar)\n${file.content}`),
    ...codeFiles.map((file) => `### ${file.path}${file.content ? '' : ' (ainda não existe)'}\n${file.content}`),
  ].join('\n\n'),
  change: ({ input }) => (input.failure
    ? `Estes testes falham com:\n${String(input.failure).slice(0, 3000)}`
    : 'Escreva o código que faz estes testes passar.'),
  contract: [
    'Responda APENAS com este JSON, sem texto antes ou depois:',
    '{"files":[{"path":"<caminho>","content":"<ficheiro completo>"}],"summary":"<uma frase>"}',
    'No máximo 4 ficheiros, só dentro de «Pode escrever em».',
  ].join('\n'),
  validate(answer, { scope }) {
    const raw = Array.isArray(answer?.files) ? answer.files : [];
    const seen = new Set();
    const files = [];
    for (const entry of raw) {
      const path = normalizeRepoPath(entry?.path);
      const content = String(entry?.content || '');
      if (!path || seen.has(path) || testPath(path) || NEVER_CODE.test(path)) continue;
      if (!content.trim() || content.length > MAX_CODE_FILE_CHARS || !isInScope(path, scope)) continue;
      seen.add(path);
      files.push({ path, content });
    }
    const kept = files.slice(0, 4);
    return { result: { files: kept, summary: String(answer?.summary || '').slice(0, 400) }, dropped: raw.length - kept.length };
  },
  inputError: ({ testFiles, scope }) => {
    if (!testFiles?.length) return 'Escolha os testes a fazer passar.';
    // Fail closed: with nowhere declared, nothing is written.
    return scope && !scope.unrestricted ? '' : 'Os testes não importam código que eu consiga localizar (import/require relativo). Acrescente o import e tente de novo.';
  },
};

/**
 * From code back to the artefacts: which written artefacts the new code makes untrue,
 * and a short edit for each. Proposals only — a person makes the edit in Artefactos,
 * and saving it leaves a task like any other edit.
 */
PACKS.sync_back = {
  skill: '_packs/sync-back',
  personaId: 'product_owner',
  camada: 3,
  slice: ({ snapshot }) => projectOutline(snapshot),
  change: ({ input }) => (input.changes || []).slice(0, 4)
    .map((change) => `### ${change.path}\n${cap(change.diff, 2000)}`).join('\n\n'),
  contract: [
    'Responda APENAS com este JSON, sem texto antes ou depois:',
    '{"proposals":[{"path":"<caminho da lista>","why":"<o que deixou de ser verdade>","suggestion":"<o que mudar, 1–2 frases>"}],',
    ' "summary":"<uma frase>"}',
    'No máximo 6 propostas. Lista vazia se os artefactos continuam certos.',
  ].join('\n'),
  validate(answer, { snapshot }) {
    const paths = knownPaths(snapshot);
    const raw = Array.isArray(answer?.proposals) ? answer.proposals : [];
    const seen = new Set();
    const proposals = [];
    for (const entry of raw) {
      const path = String(entry?.path || '');
      const suggestion = String(entry?.suggestion || '').trim().slice(0, 600);
      // Only a real, editable artefact; never the guide; one proposal per file.
      if (!paths.has(path) || path === 'yourlab/GUIDE.md' || seen.has(path) || !suggestion) continue;
      seen.add(path);
      proposals.push({ path, why: String(entry?.why || '').trim().slice(0, 300), suggestion });
    }
    const kept = proposals.slice(0, 6);
    return { result: { proposals: kept, summary: String(answer?.summary || '').slice(0, 300) }, dropped: raw.length - kept.length };
  },
  inputError: ({ snapshot, input }) => {
    if (!snapshot?.initialized) return 'O projecto ainda não foi lido do repositório. Toque em Actualizar em Artefactos.';
    return (input?.changes || []).some((change) => change.path && change.diff) ? '' : 'Falta a alteração de código a comparar.';
  },
};

/** Which test framework the project already uses, read from its package.json. */
function detectTestFramework(survey) {
  const deps = survey?.packageJson?.dependencies || [];
  return TEST_FRAMEWORKS.find((name) => deps.includes(name)) || '';
}

/**
 * The child tasks a split creates, in order. Each depends on the one before it, so the
 * sequence the AI proposed is the sequence the work follows. Pure, so it can be tested.
 */
function splitDrafts(parent, tasks, { now, actorUserId, newId }) {
  const drafts = [];
  for (const [index, entry] of tasks.entries()) {
    const id = newId();
    drafts.push({
      id,
      title: entry.title,
      descriptionMarkdown: [entry.goal, '', `Parte ${index + 1} de ${tasks.length} de «${parent.title}».`].join('\n').trim(),
      complexity: 'low',
      status: 'planned',
      origin: 'platform',
      executorMode: parent.executorMode || 'both',
      deliveryStageId: parent.deliveryStageId || 'unclassified',
      parentTaskId: parent.id,
      dependencyTaskIds: drafts.length ? [drafts[drafts.length - 1].id] : [],
      sourceRefs: [{ type: 'split_from', id: parent.id, label: parent.title }],
      createdAt: now,
      updatedAt: now,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
  }
  return drafts;
}

/** The four blocks, joined. Pure, so what is sent can be read and tested. */
function buildInstructions(packId, context) {
  const pack = PACKS[packId];
  if (!pack) throw new Error(`Pacote desconhecido: ${packId}`);
  const method = skills.readBody(pack.skill);
  if (!method) throw new Error(`Falta skills/${pack.skill}/SKILL.md.`);
  return [
    method,
    '---',
    pack.sliceLabel || 'O projecto (só nomes e títulos):',
    cap(pack.slice(context), MAX_SLICE_CHARS),
    '---',
    'A alteração:',
    cap(pack.change(context), MAX_CHANGE_CHARS),
    '---',
    pack.contract,
  ].join('\n\n');
}

/** Pulls the JSON object out of whatever came back — fenced, prefixed, or bare. */
function parseAnswer(raw) {
  const text = String(raw || '');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Builds the runner the route calls. Same connection rules as the mockup runner. */
function createPackRunner(deps) {
  const { dataDir, runtime, connectorStore, agentConnectionMode } = deps;

  return async function runPack(packId, context) {
    const pack = PACKS[packId];
    if (!pack) return { error: `Pacote desconhecido: ${packId}`, status: 404 };
    const inputError = pack.inputError?.(context);
    if (inputError) return { error: inputError, status: 400 };
    if (agentConnectionMode === 'disabled') {
      return { error: 'Execução por agente desactivada nesta instalação.', status: 503 };
    }
    if (agentConnectionMode === 'remote_pull' && !connectorStore?.activeConnector()) {
      return { error: 'Nenhum Agent Runtime emparelhado. Emparelhe um em Definições da plataforma → Agent Runtime.', status: 409 };
    }

    const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
    const persona = agentPersonas.resolvePersona(pack.personaId, settings.personas);
    const routed = agentPlatformSettings.routeForPersona(settings, { personaId: pack.personaId, camada: pack.camada });
    if (!routed.option) {
      return { error: 'Nenhum modelo activo. Active um em Definições da plataforma → Modelos.', status: 409 };
    }

    let instructions;
    try {
      instructions = buildInstructions(packId, context);
    } catch (error) {
      return { error: error.message, status: 500 };
    }

    try {
      const created = await runtime.createJob({
        agentId: persona.id,
        agentType: persona.taskTypes[0],
        instructions,
        llm: llmOptions.wireSpec(routed.option),
        options: {
          modelProfileId: routed.profileId,
          llmOptionId: routed.option.id,
          // One job, one pass.
          planningWaveSize: 1,
          enableWebSearch: false,
        },
      });
      const answer = parseAnswer(created?.output ?? created?.result ?? created?.text);
      if (!answer) return { error: 'O modelo não devolveu o JSON pedido.', status: 502 };
      const { result, dropped } = pack.validate(answer, context);
      return {
        result,
        dropped,
        costUsd: Math.max(0, Number(created?.costUsed) || 0),
        llmOptionId: routed.option.id,
      };
    } catch (error) {
      return { error: `O Agent Runtime não respondeu: ${error.message}`, status: 502 };
    }
  };
}

module.exports = { PACKS, buildInstructions, parseAnswer, projectOutline, splitDrafts, testPath, detectTestFramework, importTargets, codeScopeFor, createPackRunner, MAX_SLICE_CHARS, MAX_TEST_FILE_CHARS, MAX_CODE_FILE_CHARS };
