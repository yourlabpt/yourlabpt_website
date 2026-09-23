/**
 * The yourlab/ folder: how a project documents itself in its own repository.
 *
 * The repository is the single source of truth for everything written about a project —
 * purpose, context, ideas, questions and answers, fases, diagrams, database, workflows,
 * the mockup — and any person or AI may edit those files. The platform only reads them.
 * This module is that reading, and it is deliberately boring:
 *
 *   - pure: files in, snapshot out. No model, no network, no clock.
 *   - deterministic: the same files give the same snapshot, whatever order they came in.
 *   - forgiving and loud: a malformed file still yields what can be read, plus a finding
 *     that names the file, the line and what to write instead.
 *
 * The rules a writer follows live in workspace-guide.md, copied into every repository as
 * yourlab/GUIDE.md. A test keeps the two in step: every path read here is named there.
 *
 * It also writes the starting folder from what the platform already knows about a
 * project, so a project documented before this existed moves over without retyping.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const openspecFormat = require('./openspec-format');
const { promptDiff } = require('./work-snapshot');

const ROOT = 'yourlab';
const SPEC_PREFIX = 'openspec/specs/';
const GUIDE_PATH = `${ROOT}/GUIDE.md`;
const SNAPSHOT_VERSION = 1;
const MAX_TEXT_BYTES = 200 * 1024;

const STAGES = ['idea', 'discovery', 'requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery', 'operations'];
const TYPES = { ideia: 'ideia', resgate: 'resgate', consolidacao: 'consolidacao' };
const PHASE_STATUS = { planeada: 'planned', 'em curso': 'in_progress', concluida: 'done' };
const PHASE_STATUS_WORD = { planned: 'planeada', in_progress: 'em curso', done: 'concluída' };
const QUESTION_STATE = { aberta: 'open', respondida: 'answered' };
const QUESTION_AUDIENCE = { cliente: 'client', equipa: 'team' };
const IDEA_STATE = { nova: 'new', 'a explorar': 'exploring', aceite: 'accepted', rejeitada: 'rejected' };

// The requirement types the platform already works in — same ids as REQUIREMENT_TYPE_META
// in api.js, which serves their labels and prefixes to the browser. A requirement whose
// block carries no type= lands in 'undefined', so the gap is visible instead of guessed.
const REQUIREMENT_TYPES = ['stakeholder', 'functional', 'non_functional', 'test_case', 'undefined', 'out_of_scope'];

// Where each kind of file lives. The guide names every one of these.
const PATHS = {
  project: /^yourlab\/project\.md$/,
  ideas: /^yourlab\/ideas\.md$/,
  questions: /^yourlab\/questions\.md$/,
  database: /^yourlab\/database\.md$/,
  phase: /^yourlab\/phases\/(\d{2})-[a-z0-9-]+\.md$/,
  diagram: /^yourlab\/diagrams\/[a-z0-9-]+\.mmd$/,
  workflow: /^yourlab\/workflows\/[a-z0-9-]+\.md$/,
  mockup: /^yourlab\/mockup\/[a-z0-9-]+\.html$/,
  spec: /^openspec\/specs\/([^/]+)\/spec\.md$/,
};

/* ------------------------------------------------------------------ small readers */

function clean(value) {
  return String(value ?? '').trim();
}

/** Lowercase, accents off: «Propósito», «proposito» and «PROPÓSITO» are the same key. */
function key(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function linesOf(content) {
  return String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
}

function baseName(filePath) {
  return path.posix.basename(filePath).replace(/\.[^.]+$/, '');
}

function humanize(slug) {
  const words = String(slug).replace(/^\d+-/, '').replace(/-/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

function frontmatter(content) {
  const all = linesOf(content);
  if (all[0]?.trim() !== '---') return { data: {}, body: all, offset: 0, present: false, broken: false };
  const end = all.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return { data: {}, body: all, offset: 0, present: true, broken: true };
  const data = {};
  for (const line of all.slice(1, end)) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (match) data[key(match[1])] = clean(match[2]);
  }
  return { data, body: all.slice(end + 1), offset: end + 1, present: true, broken: false };
}

/** Splits lines on headings of one level. `line` is 1-based, in the whole file. */
function sectionsOf(lines, offset, level) {
  const marker = `${'#'.repeat(level)} `;
  const sections = [];
  const before = [];
  let current = null;
  lines.forEach((line, index) => {
    if (line.startsWith(marker)) {
      current = { title: clean(line.slice(marker.length)), line: offset + index + 1, lines: [], offset: offset + index + 1 };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      before.push(line);
    }
  });
  return { sections, before };
}

function byTitle(sections) {
  const map = new Map();
  for (const section of sections) if (!map.has(key(section.title))) map.set(key(section.title), section);
  return map;
}

const FIELD = /^\s*[-*]\s+([^:]+):\s*(.*)$/;

function fieldsOf(lines = []) {
  const out = {};
  for (const line of lines) {
    const match = line.match(FIELD);
    if (match && !(key(match[1]) in out)) out[key(match[1])] = clean(match[2]);
  }
  return out;
}

function proseOf(lines = []) {
  return lines.filter((line) => !FIELD.test(line)).join('\n').trim();
}

function bulletsOf(lines = []) {
  return lines
    .map((line) => line.match(/^\s*[-*]\s+(.*)$/))
    .filter(Boolean)
    .map((match) => clean(match[1]))
    .filter(Boolean);
}

function listOf(value) {
  return String(value || '').split(',').map((entry) => openspecFormat.slugify(clean(entry))).filter(Boolean);
}

/* ------------------------------------------------------------------ one reader per kind */

function readProject(file, content, note) {
  const fm = frontmatter(content);
  if (!fm.present) note(file, 1, 'error', 'Falta o bloco inicial --- com name, client, type e stage ---.');
  if (fm.broken) note(file, 1, 'error', 'O bloco inicial --- não fecha. Termine-o com uma linha só com ---.');

  const type = TYPES[key(fm.data.type)] || '';
  if (!type) note(file, 1, 'warning', 'type deve ser ideia, resgate ou consolidacao.');
  const stage = STAGES.includes(key(fm.data.stage)) ? key(fm.data.stage) : '';
  if (!stage) note(file, 1, 'warning', `stage deve ser um de: ${STAGES.join(', ')}.`);

  const { sections } = sectionsOf(fm.body, fm.offset, 2);
  const map = byTitle(sections);
  const purpose = proseOf(map.get('proposito')?.lines);
  if (!purpose) note(file, 1, 'error', 'Falta a secção ## Propósito: um parágrafo sobre porque esta app existe e para quem.');

  return {
    name: clean(fm.data.name),
    client: clean(fm.data.client),
    type,
    stage,
    purpose,
    context: proseOf(map.get('contexto')?.lines),
    risks: bulletsOf(map.get('riscos')?.lines),
    assumptions: bulletsOf(map.get('assuncoes')?.lines),
  };
}

function readIdeas(file, content, note) {
  const { sections } = sectionsOf(linesOf(content), 0, 2);
  return sections.map((section) => {
    const fields = fieldsOf(section.lines);
    const state = IDEA_STATE[key(fields.estado)] || '';
    if (fields.estado && !state) note(file, section.line, 'warning', 'Estado deve ser nova, a explorar, aceite ou rejeitada.');
    return { title: section.title, state: state || 'new', text: proseOf(section.lines), line: section.line };
  });
}

function readQuestions(file, content, note) {
  const { sections } = sectionsOf(linesOf(content), 0, 2);
  return sections.map((section) => {
    const fields = fieldsOf(section.lines);
    const answer = clean(fields.resposta);
    const state = QUESTION_STATE[key(fields.estado)] || (answer ? 'answered' : 'open');
    if (fields.estado && !QUESTION_STATE[key(fields.estado)]) {
      note(file, section.line, 'warning', 'Estado deve ser aberta ou respondida.');
    }
    if (state === 'answered' && !answer) note(file, section.line, 'warning', 'Está respondida mas falta - Resposta: …');
    return {
      question: section.title,
      audience: QUESTION_AUDIENCE[key(fields.para)] || 'team',
      state,
      answer,
      notes: proseOf(section.lines),
      line: section.line,
    };
  });
}

function readPhase(file, content, note) {
  const number = Number(file.match(PATHS.phase)[1]);
  const fm = frontmatter(content);
  if (!fm.present || fm.broken) note(file, 1, 'error', 'Falta o bloco inicial --- com title, weeks e status ---.');

  const title = clean(fm.data.title) || humanize(baseName(file));
  if (!clean(fm.data.title)) note(file, 1, 'warning', 'Falta title: — usei o nome do ficheiro.');

  const weeks = Number(fm.data.weeks);
  const weeksValid = Number.isInteger(weeks) && weeks > 0;
  if (fm.data.weeks !== undefined && !weeksValid) note(file, 1, 'warning', 'weeks deve ser um número inteiro de semanas.');

  const status = PHASE_STATUS[key(fm.data.status)] || '';
  if (fm.data.status && !status) note(file, 1, 'warning', 'status deve ser planeada, em curso ou concluída.');

  const { sections } = sectionsOf(fm.body, fm.offset, 2);
  const map = byTitle(sections);
  const featureSection = map.get('features');
  const features = featureSection
    ? sectionsOf(featureSection.lines, featureSection.offset, 3).sections.map((feature) => ({
      title: feature.title,
      requirements: listOf(fieldsOf(feature.lines).requisitos),
      text: proseOf(feature.lines),
      line: feature.line,
    }))
    : [];

  return {
    number,
    file,
    title,
    weeks: weeksValid ? weeks : 0,
    status: status || 'planned',
    objective: proseOf(map.get('objetivo')?.lines),
    features,
    deliverables: bulletsOf(map.get('entregaveis')?.lines),
  };
}

const MERMAID_START = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|C4Context|quadrantChart|gitGraph)\b/;

function readDiagram(file, content, note) {
  const lines = linesOf(content);
  const titleLine = lines.find((line) => /^%%\s*/.test(line.trim()));
  const titleMatch = titleLine?.trim().match(/^%%\s*(?:title:\s*)?(.+)$/i);
  const firstStatement = lines.map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) || '';
  if (!MERMAID_START.test(firstStatement)) note(file, 1, 'warning', 'Não parece Mermaid: a primeira linha deve ser flowchart, sequenceDiagram, erDiagram…');
  return { file, title: clean(titleMatch?.[1]) || humanize(baseName(file)), source: String(content).trim() };
}

function readDatabase(file, content, note) {
  const { sections } = sectionsOf(linesOf(content), 0, 2);
  const entities = sections.map((section) => {
    const name = clean(section.title.replace(/^entidade:\s*/i, ''));
    const rows = section.lines.filter((line) => line.trim().startsWith('|'));
    const fields = rows
      .map((row) => row.trim().replace(/^\||\|$/g, '').split('|').map(clean))
      .filter((cells) => cells.length && !cells.every((cell) => /^:?-{2,}:?$/.test(cell)))
      .slice(1)
      .map(([field = '', type = '', notes = '']) => ({ name: field, type, notes }))
      .filter((field) => field.name);
    if (!fields.length) note(file, section.line, 'warning', `A entidade ${name} não tem a tabela | Campo | Tipo | Notas |.`);
    return {
      name,
      fields,
      notes: section.lines.filter((line) => !line.trim().startsWith('|')).join('\n').trim(),
      line: section.line,
    };
  });
  if (!entities.length) note(file, 1, 'warning', 'Sem entidades: cada uma é uma secção ## Entidade: Nome.');
  return { entities };
}

function readWorkflow(file, content, note) {
  const lines = linesOf(content);
  const titleLine = lines.find((line) => line.startsWith('# '));
  const steps = lines.map((line) => line.match(/^\s*\d+[.)]\s+(.*)$/)).filter(Boolean).map((match) => clean(match[1]));
  if (!steps.length) note(file, 1, 'warning', 'Sem passos: escreva-os como lista numerada 1. 2. 3.');
  return { file, title: clean(titleLine?.slice(2)) || humanize(baseName(file)), steps, text: String(content).trim() };
}

function readMockupScreen(file, content, note) {
  const title = clean(String(content).match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  if (/<script\b/i.test(content)) note(file, 1, 'warning', 'Os scripts não correm no mockup: fica só o ecrã estático.');
  if (/(src|href)\s*=\s*["']https?:/i.test(content)) {
    note(file, 1, 'warning', 'Nada é carregado da internet no mockup: use SVG inline ou data: URIs.');
  }
  const name = path.posix.basename(file);
  return { file: name, title: title || humanize(baseName(file)), entry: name === 'index.html' };
}

function readSpec(file, content, note) {
  const capability = file.match(PATHS.spec)[1];
  const spec = openspecFormat.parseSpec(content, { capability });
  // parseSpec defaults a typeless requirement to functional. The blocks say what was
  // actually written, so an untyped one is reported as such rather than assumed.
  const declaresType = String(content).split(/^### Requirement:/m).slice(1)
    .map((block) => /<!--\s*yourlab:[^>]*\btype=/.test(block));

  return {
    capability: spec.capability || capability,
    title: spec.title || humanize(capability),
    requirements: spec.requirements.map((requirement, index) => {
      const declared = declaresType[index] === true;
      const type = declared && REQUIREMENT_TYPES.includes(key(requirement.type)) ? key(requirement.type) : 'undefined';
      if (!declared) {
        note(file, 0, 'warning', `«${clean(requirement.title)}» não diz o tipo. Acrescente <!-- yourlab: type=functional --> (ou stakeholder, non_functional, test_case, out_of_scope).`);
      }
      return {
        id: clean(requirement.id),
        title: clean(requirement.title) || clean(requirement.shall).slice(0, 120),
        type,
        module: clean(requirement.module),
        priority: clean(requirement.priority),
        shall: clean(requirement.shall),
        rationale: clean(requirement.rationale),
        scenarios: (requirement.scenarios || []).map((scenario) => ({
          title: clean(scenario.title),
          when: clean(scenario.when),
          then: clean(scenario.then),
        })),
      };
    }),
  };
}

/* ------------------------------------------------------------------ the whole folder */

function kindOf(filePath) {
  if (filePath === GUIDE_PATH) return 'guide';
  for (const [kind, pattern] of Object.entries(PATHS)) if (pattern.test(filePath)) return kind;
  return '';
}

/** The one file the platform owns; a person edits everything else. */
function isWritablePath(filePath) {
  const kind = kindOf(filePath);
  return Boolean(kind) && kind !== 'guide';
}

/** Whether a path is one the platform reads — used to decide what to fetch at all. */
function isReadablePath(filePath) {
  return Boolean(kindOf(filePath)) || filePath.startsWith(`${ROOT}/`);
}

function digest(content) {
  return crypto.createHash('sha256').update(String(content)).digest('hex').slice(0, 12);
}

/**
 * Reads a set of files into the project's snapshot.
 *
 * @param files  [{ path, content }] — any order; only yourlab/ and openspec/specs/ matter
 */
function readWorkspace(files = []) {
  const unique = new Map();
  for (const file of files) if (file && file.path) unique.set(String(file.path), String(file.content ?? ''));
  const ordered = [...unique.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const findings = [];
  const note = (file, line, level, message) => findings.push({ file, line, level, message });

  const snapshot = {
    version: SNAPSHOT_VERSION,
    initialized: false,
    project: null,
    ideas: [],
    questions: [],
    phases: [],
    diagrams: [],
    database: null,
    workflows: [],
    mockup: { entry: '', screens: [] },
    requirements: [],
    files: [],
    findings,
    contentHash: '',
  };

  for (const [filePath, content] of ordered) {
    const kind = kindOf(filePath);
    if (!kind && !filePath.startsWith(`${ROOT}/`)) continue;
    const bytes = Buffer.byteLength(content, 'utf8');
    snapshot.files.push({ path: filePath, bytes, sha: digest(content) });

    if (!kind) {
      note(filePath, 0, 'warning', 'Ficheiro ignorado: não é um dos ficheiros do GUIDE.md (nome em minúsculas, palavras com -).');
      continue;
    }
    if (kind === 'guide') continue;
    if (bytes > MAX_TEXT_BYTES) {
      note(filePath, 0, 'warning', `Ficheiro ignorado: tem mais de ${Math.round(MAX_TEXT_BYTES / 1024)} KB.`);
      continue;
    }

    if (kind === 'project') snapshot.project = readProject(filePath, content, note);
    else if (kind === 'ideas') snapshot.ideas = readIdeas(filePath, content, note);
    else if (kind === 'questions') snapshot.questions = readQuestions(filePath, content, note);
    else if (kind === 'database') snapshot.database = readDatabase(filePath, content, note);
    else if (kind === 'phase') snapshot.phases.push(readPhase(filePath, content, note));
    else if (kind === 'diagram') snapshot.diagrams.push(readDiagram(filePath, content, note));
    else if (kind === 'workflow') snapshot.workflows.push(readWorkflow(filePath, content, note));
    else if (kind === 'mockup') snapshot.mockup.screens.push(readMockupScreen(filePath, content, note));
    else if (kind === 'spec') snapshot.requirements.push(readSpec(filePath, content, note));
  }

  const hasFolder = snapshot.files.some((file) => file.path.startsWith(`${ROOT}/`));
  snapshot.initialized = Boolean(snapshot.project);
  if (!hasFolder) {
    note(ROOT, 0, 'info', 'Este repositório ainda não tem a pasta yourlab/. Crie-a a partir da plataforma ou siga o GUIDE.md.');
  } else if (!snapshot.project) {
    note(`${ROOT}/project.md`, 0, 'error', 'Falta yourlab/project.md — é o ficheiro que diz o que a app é.');
  }

  // Order that does not depend on how the files arrived.
  snapshot.phases.sort((a, b) => a.number - b.number || (a.file < b.file ? -1 : 1));
  const seen = new Map();
  for (const phase of snapshot.phases) {
    if (seen.has(phase.number)) note(phase.file, 0, 'warning', `Dois ficheiros com o número ${String(phase.number).padStart(2, '0')}: ${seen.get(phase.number)} e este.`);
    else seen.set(phase.number, phase.file);
  }
  snapshot.mockup.screens.sort((a, b) => (b.entry - a.entry) || (a.file < b.file ? -1 : 1));
  snapshot.mockup.entry = snapshot.mockup.screens.find((screen) => screen.entry)?.file || '';
  if (snapshot.mockup.screens.length && !snapshot.mockup.entry) {
    note(`${ROOT}/mockup`, 0, 'warning', 'O mockup não tem index.html — é o primeiro ecrã que a plataforma abre.');
  }

  // A feature pointing at a capability that does not exist is a broken link.
  const capabilities = new Set(snapshot.requirements.map((spec) => spec.capability));
  for (const phase of snapshot.phases) {
    for (const feature of phase.features) {
      for (const capability of feature.requirements) {
        if (!capabilities.has(capability)) {
          note(phase.file, feature.line, 'warning', `Requisitos: ${capability} não existe em openspec/specs/.`);
        }
      }
    }
  }

  const levelOrder = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
    || a.line - b.line
    || levelOrder[a.level] - levelOrder[b.level]
    || (a.message < b.message ? -1 : 1));

  snapshot.contentHash = digest(snapshot.files.map((file) => `${file.path}:${file.sha}`).join('\n'));
  return snapshot;
}

/* ------------------------------------------------------------------ an edit becomes a task */

// What an edit to each kind of file asks of the code. The artefact side comes from the
// snapshot's own links; this is the rest.
const CODE_AREA = {
  mockup: 'Interface: os ecrãs e a navegação entre eles.',
  diagram: 'Estrutura dos módulos e as ligações entre eles.',
  database: 'Modelo de dados e as migrações.',
  workflow: 'O fluxo descrito neste workflow.',
};

/**
 * What else an edit puts in doubt, read from the links the files already declare: a
 * requirement file is used by the fases whose features name its capability; a fase uses
 * the capabilities its features name. Nothing is guessed.
 */
function impactOfEdit(filePath, snapshot) {
  const kind = kindOf(filePath);
  const phases = snapshot?.phases || [];
  if (kind === 'spec') {
    const capability = filePath.match(PATHS.spec)[1];
    return {
      artefacts: phases.filter((phase) => phase.features.some((feature) => feature.requirements.includes(capability))).map((phase) => phase.file),
      code: [`Código e testes da capacidade ${capability}.`],
    };
  }
  if (kind === 'phase') {
    const phase = phases.find((entry) => entry.file === filePath);
    const capabilities = [...new Set((phase?.features || []).flatMap((feature) => feature.requirements))].sort();
    return {
      artefacts: capabilities.map((capability) => `openspec/specs/${capability}/spec.md`),
      code: capabilities.length ? ['Código das features desta fase.'] : [],
    };
  }
  return { artefacts: [], code: CODE_AREA[kind] ? [CODE_AREA[kind]] : [] };
}

/**
 * The task a saved edit leaves behind: the diff, and what it puts in doubt. Null when
 * the text did not actually change, so saving twice never makes two tasks.
 */
function taskFromEdit({ filePath, before, after, snapshot }) {
  const diff = promptDiff(String(before ?? ''), String(after ?? ''));
  if (!diff) return null;
  const impact = impactOfEdit(filePath, snapshot);
  const lines = [`Alteração guardada em \`${filePath}\`.`, '', '```diff', diff, '```'];
  if (impact.artefacts.length) lines.push('', 'Artefactos a rever:', ...impact.artefacts.map((entry) => `- \`${entry}\``));
  if (impact.code.length) lines.push('', 'No código:', ...impact.code.map((entry) => `- ${entry}`));
  if (!impact.artefacts.length && !impact.code.length) lines.push('', 'Rever se isto muda fases ou requisitos.');
  return {
    title: `Aplicar: ${path.posix.basename(filePath)}`,
    descriptionMarkdown: lines.join('\n'),
    impact,
    diff,
  };
}

/* ------------------------------------------------------------------ writing the starting folder */

function guide() {
  return fs.readFileSync(path.join(__dirname, 'workspace-guide.md'), 'utf8');
}

function frontmatterBlock(entries) {
  return ['---', ...entries.filter(([, value]) => value !== '' && value !== undefined).map(([k, v]) => `${k}: ${v}`), '---'].join('\n');
}

function bulletLines(items) {
  return items.map((item) => `- ${clean(item)}`).join('\n');
}

function serializeProject(project = {}) {
  const parts = [
    frontmatterBlock([
      ['name', clean(project.name)],
      ['client', clean(project.clientName || project.client)],
      ['type', TYPES[key(project.type)] || 'ideia'],
      ['stage', STAGES.includes(key(project.stage)) ? key(project.stage) : 'idea'],
    ]),
    '',
    '## Propósito',
    clean(project.purpose || project.description) || 'Porque esta app existe e para quem — um parágrafo.',
  ];
  if (clean(project.context)) parts.push('', '## Contexto', clean(project.context));
  const risks = (project.risks || []).map((risk) => (typeof risk === 'string' ? risk : risk?.description || risk?.title)).filter(Boolean);
  if (risks.length) parts.push('', '## Riscos', bulletLines(risks));
  const assumptions = (project.assumptions || []).map((entry) => (typeof entry === 'string' ? entry : entry?.description || entry?.title)).filter(Boolean);
  if (assumptions.length) parts.push('', '## Assunções', bulletLines(assumptions));
  return `${parts.join('\n')}\n`;
}

function serializePhase(phase = {}) {
  const parts = [
    frontmatterBlock([
      ['title', clean(phase.title || phase.name).replace(/^\s*fase\s*\d+\s*[-–·:]\s*/i, '')],
      ['weeks', Number(phase.weeks || phase.durationWeeks) > 0 ? Math.round(Number(phase.weeks || phase.durationWeeks)) : ''],
      ['status', PHASE_STATUS_WORD[phase.status] || 'planeada'],
    ]),
    '',
    '## Objetivo',
    clean(phase.objective) || 'O que fica verdade para o cliente quando esta fase é entregue.',
  ];
  const features = phase.features || [];
  if (features.length) {
    parts.push('', '## Features');
    for (const feature of features) {
      parts.push('', `### ${clean(feature.title)}`);
      if ((feature.requirements || []).length) parts.push(`- Requisitos: ${feature.requirements.join(', ')}`);
      if (clean(feature.text)) parts.push(clean(feature.text));
    }
  }
  const deliverables = (phase.deliverables || []).map(clean).filter(Boolean);
  if (deliverables.length) parts.push('', '## Entregáveis', bulletLines(deliverables));
  return `${parts.join('\n')}\n`;
}

function serializeQuestions(questions = []) {
  const blocks = questions.map((entry) => {
    const answered = Boolean(clean(entry.answer));
    const lines = [
      `## ${clean(entry.question || entry.title)}`,
      `- Para: ${entry.audience === 'client' || key(entry.targetRole) === 'client' ? 'cliente' : 'equipa'}`,
      `- Estado: ${answered ? 'respondida' : 'aberta'}`,
    ];
    if (answered) lines.push(`- Resposta: ${clean(entry.answer).replace(/\s*\n\s*/g, ' ')}`);
    return lines.join('\n');
  });
  return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}

// Marks what was read off the code rather than decided by a person.
const GENERATED_MARK = 'gerado do código, por rever';

function firstParagraph(text) {
  return String(text || '').split(/\n\s*\n/).map((part) => part.replace(/^#+\s.*$/gm, '').trim()).find(Boolean) || '';
}

/** What the survey found, as the Contexto of project.md. Facts only. */
function surveyContext(survey) {
  const lines = [];
  if (survey.languages?.length) lines.push(`Linguagens: ${survey.languages.slice(0, 6).map((entry) => `${entry.language} (${entry.files})`).join(', ')}.`);
  if (survey.packageJson?.dependencies?.length) lines.push(`Pacotes: ${survey.packageJson.dependencies.slice(0, 15).join(', ')}.`);
  if (survey.modules?.length) lines.push(`Estrutura: ${survey.modules.slice(0, 12).map((entry) => `${entry.name} (${entry.files})`).join(', ')}.`);
  if (survey.routes?.length) lines.push(`Rotas: ${survey.routes.slice(0, 20).join(', ')}${survey.routes.length > 20 ? `, e mais ${survey.routes.length - 20}` : ''}.`);
  if (survey.schema?.length) lines.push(`Esquema de dados em: ${survey.schema.slice(0, 6).join(', ')}.`);
  return lines.join('\n');
}

/** The top-level modules as a Mermaid flowchart; nesting becomes the only edges. */
function modulesDiagram(modules) {
  const names = modules.map((entry) => entry.name);
  const id = (name) => `m${names.indexOf(name)}`;
  const lines = ['%% title: Módulos', `%% ${GENERATED_MARK}`, 'flowchart TD'];
  for (const entry of modules) lines.push(`  ${id(entry.name)}["${entry.name.replace(/"/g, "'")} · ${entry.files} ficheiros"]`);
  for (const entry of modules) {
    const parent = entry.name.includes('/') ? entry.name.slice(0, entry.name.lastIndexOf('/')) : '';
    if (parent && names.includes(parent)) lines.push(`  ${id(parent)} --> ${id(entry.name)}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The files that start a project's folder, from what the platform already holds.
 * With a survey of existing code, the gaps are filled from the code instead: the
 * purpose from the manifest or README, the context from what is actually there, and a
 * diagram of the modules. Everything taken from the code is marked for review. Only
 * files the repository does not have yet are returned — except GUIDE.md, which the
 * platform owns and always refreshes.
 */
function skeletonFiles(project = {}, { existing = new Set(), survey = null } = {}) {
  const files = [{ path: GUIDE_PATH, content: guide() }];
  const add = (filePath, content) => {
    if (content && !existing.has(filePath)) files.push({ path: filePath, content });
  };

  if (survey) {
    const projectMd = serializeProject({
      ...project,
      type: project.type || 'resgate',
      stage: project.stage || 'implementation',
      purpose: clean(project.description) || clean(survey.packageJson?.description) || firstParagraph(survey.readme),
      context: [clean(project.context), surveyContext(survey)].filter(Boolean).join('\n\n'),
    });
    add(`${ROOT}/project.md`, projectMd.replace('---\n\n## Propósito', `---\n\n<!-- ${GENERATED_MARK} -->\n\n## Propósito`));
    if (survey.modules?.length) add(`${ROOT}/diagrams/modulos.mmd`, modulesDiagram(survey.modules));
  } else {
    add(`${ROOT}/project.md`, serializeProject(project));
  }

  const questions = (project.clarificationQuestions || []).map((question) => ({
    question: question.question || question.title,
    answer: question.answer || question.resolution || '',
    targetRole: question.targetRole,
  })).filter((question) => clean(question.question));
  add(`${ROOT}/questions.md`, serializeQuestions(questions));

  (project.phases || []).forEach((phase, index) => {
    const title = clean(phase.name).replace(/^\s*fase\s*\d+\s*[-–·:]\s*/i, '') || `Fase ${index + 1}`;
    const slug = openspecFormat.slugify(title).slice(0, 40).replace(/-+$/, '') || 'fase';
    add(`${ROOT}/phases/${String(index + 1).padStart(2, '0')}-${slug}.md`, serializePhase({
      title,
      weeks: phase.durationWeeks,
      objective: phase.objective || phase.description,
      deliverables: phase.deliverables || [],
    }));
  });

  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

module.exports = {
  ROOT,
  SPEC_PREFIX,
  GUIDE_PATH,
  PATHS,
  STAGES,
  REQUIREMENT_TYPES,
  guide,
  isReadablePath,
  isWritablePath,
  kindOf,
  fileSha: digest,
  readWorkspace,
  impactOfEdit,
  taskFromEdit,
  skeletonFiles,
  GENERATED_MARK,
  serializeProject,
  serializePhase,
  serializeQuestions,
};
