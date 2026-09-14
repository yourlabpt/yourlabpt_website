/**
 * What a persona knows how to *do*.
 *
 * A persona already has a role (what it may write, what it reads, what it produces),
 * tools, and optionally knowledge. What it did not have is a **method** — how to
 * interview for requirements, how to cut a task, how to review code, how to ship. That
 * is what a skill is, and the distinction is worth keeping sharp:
 *
 *   knowledge  what this persona knows      reference material, your house rules
 *   skill      how this persona works       a procedure with steps and exit criteria
 *
 * Skills are **content the platform ships inside the task package**, not a capability
 * the runtime must advertise. That is deliberate: a name the runtime happens not to
 * declare must never block a dispatch, which is the same mistake the agent-name lookup
 * made before it was removed.
 *
 * Vendored from addyosmani/agent-skills (MIT — see skills/LICENSE). Adding your own is
 * a folder plus an entry here; nothing else needs to change.
 */
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const SOURCE = 'addyosmani/agent-skills';

/**
 * Which persona gets which method, and at which layer.
 *
 * A persona does not carry all of its skills at once. `tech_lead` at Camada 3 is cutting
 * work into tasks; the same persona has no business reading the launch checklist. The
 * pairing matters as much as the list, because every skill shipped is tokens spent on
 * every dispatch.
 */
const CATALOGUE = [
  // --- Camada 0: refining an intention against something you can look at ------------
  { id: 'interview-me', personas: ['product_owner'], camadas: [0, 1],
    title: 'Perguntar uma coisa de cada vez',
    why: 'Tira o que a pessoa quer mesmo, em vez do que acha que devia querer.' },
  { id: 'idea-refine', personas: ['ux', 'product_owner'], camadas: [0],
    title: 'Afinar uma ideia vaga',
    why: 'Abrir e fechar opções até a intenção estabilizar — que é exactamente o ciclo da Camada 0.' },

  // --- Camada 1: what must stay true ------------------------------------------------
  { id: 'constraint-driven-development', personas: ['product_owner'], camadas: [1],
    title: 'Escrever a barra de qualidade',
    why: 'Transforma "tem de ser bom" em regras que se verificam — a constituição do projecto.' },

  // --- Camada 2: the epic's spec ----------------------------------------------------
  { id: 'spec-driven-development', personas: ['product_owner'], camadas: [2],
    title: 'Especificar antes de construir',
    why: 'Objectivos, estrutura e fronteiras de uma epic, antes de existir código.' },

  // --- Camada 3: cutting the epic into features and tasks ---------------------------
  { id: 'planning-and-task-breakdown', personas: ['tech_lead', 'orchestrator'], camadas: [3],
    title: 'Partir em tarefas verificáveis',
    why: 'Cada tarefa pequena o suficiente para ser feita e verificada numa só passagem — o teste de corte da Camada 4.' },
  { id: 'api-and-interface-design', personas: ['orchestrator', 'module_architect'], camadas: [3],
    title: 'Desenhar contratos primeiro',
    why: 'As fronteiras entre módulos são contratos; mudá-las depois custa mais do que escrevê-las bem.' },
  { id: 'frontend-ui-engineering', personas: ['ux'], camadas: [3, 4],
    title: 'Construir interfaces utilizáveis',
    why: 'Arquitectura de componentes, design system e acessibilidade.' },

  // --- Camada 4: doing the work -----------------------------------------------------
  { id: 'incremental-implementation', personas: ['developer'], camadas: [4],
    title: 'Entregar em fatias finas',
    why: 'Uma fatia verificável de cada vez, em vez de um salto que ninguém consegue rever.' },
  { id: 'test-driven-development', personas: ['developer', 'tester'], camadas: [4],
    title: 'Vermelho, verde, refactor',
    why: 'O teste primeiro é o que torna o critério de aceitação verificável em vez de opinável.' },
  { id: 'context-engineering', personas: ['developer', 'tech_lead'], camadas: [4],
    title: 'Dar o contexto certo',
    why: 'A informação certa no momento certo — a diferença entre um agente que acerta e um que adivinha.' },
  { id: 'source-driven-development', personas: ['developer', 'module_architect'], camadas: [3, 4],
    title: 'Confirmar na documentação oficial',
    why: 'Decisões sobre uma framework assentes no que ela diz, não no que o modelo se lembra.' },
  { id: 'doubt-driven-development', personas: ['developer', 'tech_lead'], camadas: [4],
    title: 'Duvidar antes de assentar',
    why: 'Uma revisão adversarial das decisões que custam caro a desfazer.' },

  // --- Camada 4: checking it ---------------------------------------------------------
  { id: 'debugging-and-error-recovery', personas: ['developer', 'tester'], camadas: [4],
    title: 'Reproduzir, isolar, corrigir, proteger',
    why: 'Um método para a causa real, em vez de tentativas até passar.' },
  { id: 'browser-testing-with-devtools', personas: ['tester'], camadas: [4],
    title: 'Testar no browser a sério',
    why: 'O que o utilizador vê, verificado onde ele o vê.' },
  { id: 'code-review-and-quality', personas: ['tester'], camadas: [4],
    title: 'Rever por eixos',
    why: 'Uma revisão com eixos e severidade, em vez de uma leitura de cima a baixo.' },
  { id: 'code-simplification', personas: ['tester', 'developer'], camadas: [4],
    title: 'Simplificar sem mudar comportamento',
    why: 'Reduzir complexidade com a cerca de Chesterton à mão: perceber porque lá está antes de a tirar.' },
  { id: 'security-and-hardening', personas: ['tester'], camadas: [4],
    title: 'Endurecer contra o óbvio',
    why: 'OWASP Top 10, autenticação e dependências — o que falha primeiro, verificado primeiro.' },
  { id: 'performance-optimization', personas: ['tester'], camadas: [4],
    title: 'Medir antes de optimizar',
    why: 'Optimizar sem medir é adivinhar com mais passos.' },

  // --- Delivery and operations -------------------------------------------------------
  { id: 'git-workflow-and-versioning', personas: ['developer', 'orchestrator'], camadas: [4],
    title: 'Commits atómicos',
    why: 'Uma alteração por commit é o que torna possível reverter uma coisa sem reverter tudo.' },
  { id: 'ci-cd-and-automation', personas: ['orchestrator'], camadas: [4],
    title: 'Portões automáticos',
    why: 'O que se verifica sempre não devia depender de alguém se lembrar.' },
  { id: 'documentation-and-adrs', personas: ['orchestrator', 'module_architect'], camadas: [3, 4],
    title: 'Registar decisões',
    why: 'Uma decisão sem o porquê escrito volta a ser discutida daqui a três meses.' },
  { id: 'observability-and-instrumentation', personas: ['orchestrator', 'developer'], camadas: [4],
    title: 'Ver o que acontece em produção',
    why: 'Um sistema que não se consegue observar não se consegue manter.' },
  { id: 'deprecation-and-migration', personas: ['orchestrator', 'module_architect'], camadas: [3, 4],
    title: 'Tirar coisas com segurança',
    why: 'Código é passivo: remover bem é tão trabalho como acrescentar.' },
  { id: 'shipping-and-launch', personas: ['orchestrator'], camadas: [4],
    title: 'Pôr no ar sem susto',
    why: 'Lista de verificação, lançamento por fases, e um caminho de volta.' },
];

/**
 * Shared checklists, bound to the stage whose exit test they sharpen.
 *
 * `doneWhen` in the build policy is one sentence per stage. A checklist is that sentence
 * made checkable — which is the difference between a persona interpreting the exit test
 * and verifying it.
 */
const STAGE_REFERENCES = {
  implementation: ['definition-of-done', 'testing-patterns'],
  validation: ['definition-of-done', 'testing-patterns', 'security-checklist', 'accessibility-checklist'],
  delivery: ['definition-of-done'],
};

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

/** The SKILL.md body, minus its frontmatter — the frontmatter is metadata, not method. */
function readBody(id) {
  try {
    const raw = fs.readFileSync(path.join(SKILLS_DIR, id, 'SKILL.md'), 'utf8');
    const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return (match ? match[1] : raw).trim();
  } catch {
    return '';
  }
}

function describeSkill(id) {
  const entry = CATALOGUE.find((skill) => skill.id === text(id));
  if (!entry) {
    // An unknown id is not an error: the catalogue is meant to grow, and a persona
    // configured with a skill that has not landed yet should degrade, not break.
    return { id: text(id), title: text(id), why: '', personas: [], camadas: [], source: '', known: false };
  }
  return { ...entry, source: SOURCE, known: true };
}

function listSkills() {
  return CATALOGUE.map((entry) => describeSkill(entry.id));
}

/**
 * The methods this persona should be working from, at this layer.
 *
 * A null camada means "not layer-scoped" and returns everything the persona owns —
 * used by the Agentes screen, which is showing what a persona *can* do rather than what
 * it is doing now.
 */
function skillsFor(personaId, camada = null) {
  const persona = text(personaId);
  return CATALOGUE
    .filter((entry) => entry.personas.includes(persona))
    .filter((entry) => camada === null || entry.camadas.includes(camada))
    .map((entry) => describeSkill(entry.id));
}

/**
 * The bytes that actually travel with a task.
 *
 * Capped on purpose. Twenty-four skills at ~300 lines each is far more than any single
 * task should carry, and it is billed on every dispatch — so only the matched skills go,
 * body only, and the total is bounded. Supporting files stay on disk and are named
 * rather than inlined.
 */
const MAX_INJECTED_BYTES = 60000;

/**
 * How many bytes of method a run can afford, given the shape it is running in.
 *
 * A skill bundle is not free: it is tokens on every dispatch, and the profiles range
 * from a 6k input target to 120k. Injecting the same 60KB into both would blow the
 * cheap one's entire budget before the task itself is described — which matters most at
 * Camadas 0-2, where the whole point of routing is that the loop stays fast.
 *
 * Just under half the input budget, at roughly four characters per token. That sounds
 * generous until you measure the bodies: the median is ~13KB, so a smaller share means
 * no method travels at all and the persona is left with a list of names — which is
 * strictly worse than the prose it replaced.
 */
const BUDGET_SHARE = 0.45;

/** Enough for one median method, so every run gets at least the one that matters most. */
const MIN_BUDGET_BYTES = 15000;

function budgetForProfile(profile) {
  const targetTokens = Number(profile?.targetInputTokens) || 0;
  if (!targetTokens) return MAX_INJECTED_BYTES;
  return Math.max(
    MIN_BUDGET_BYTES,
    Math.min(MAX_INJECTED_BYTES * 2, Math.round(targetTokens * 4 * BUDGET_SHARE)),
  );
}

function skillBundle(personaId, camada = null, maxBytes = MAX_INJECTED_BYTES) {
  const matched = skillsFor(personaId, camada);
  if (!matched.length) return { markdown: '', bytes: 0, included: [], summarised: [] };

  // The index always travels in full: it is one line each, and a method the persona is
  // not given the text of is still a method it should know exists. Only the bodies are
  // capped — so a truncated bundle says what was left out instead of quietly shrinking.
  const index = matched.map((skill) => `- **${skill.title}** (\`${skill.id}\`) — ${skill.why}`);

  const bodies = [];
  const included = [];
  const summarised = [];
  let used = 0;
  for (const skill of matched) {
    const body = readBody(skill.id);
    if (!body) { summarised.push(skill.id); continue; }
    const block = `## ${skill.title}\n\n_${skill.why}_\n\n${body}`;
    if (used + block.length > maxBytes) { summarised.push(skill.id); continue; }
    bodies.push(block);
    included.push(skill.id);
    used += block.length;
  }

  const note = summarised.length
    ? `\n\n_Métodos listados acima sem o texto completo nesta tarefa: ${summarised.join(', ')}. `
      + 'Se um deles for o que esta tarefa precisa, diga-o em vez de improvisar._'
    : '';

  return {
    markdown: `### Como trabalhar\n\n${index.join('\n')}${note}\n\n${bodies.join('\n\n---\n\n')}`.trim(),
    bytes: used,
    included,
    summarised,
  };
}

function referencesForStage(stageId) {
  return (STAGE_REFERENCES[text(stageId)] || []).map((id) => ({
    id,
    path: `skills/_references/${id}.md`,
  }));
}

/**
 * The checklists for a stage, within a budget.
 *
 * Same discipline as the skill bundle, for the same reason: the security checklist alone
 * is 14KB, and four of these would be most of a medium run's input budget spent before
 * the task is described. What does not fit is still *named*, with its path — an agent
 * with `repo.read` can open it, and a person can see what was left out.
 */
function referenceBundle(stageId, maxBytes = MAX_INJECTED_BYTES) {
  const wanted = referencesForStage(stageId);
  if (!wanted.length) return { markdown: '', bytes: 0, included: [], summarised: [] };

  const parts = [];
  const included = [];
  const summarised = [];
  let used = 0;
  for (const entry of wanted) {
    const body = readReference(entry.id);
    if (!body || used + body.length > maxBytes) { summarised.push(entry); continue; }
    parts.push(body);
    included.push(entry.id);
    used += body.length;
  }

  const note = summarised.length
    ? `\n\n_Listas que nao cabem nesta tarefa: ${summarised.map((e) => `${e.id} (\`${e.path}\`)`).join(', ')}._`
    : '';

  return { markdown: `${parts.join('\n\n')}${note}`.trim(), bytes: used, included, summarised };
}

function readReference(id) {
  try {
    return fs.readFileSync(path.join(SKILLS_DIR, '_references', `${text(id)}.md`), 'utf8').trim();
  } catch {
    return '';
  }
}

module.exports = {
  CATALOGUE,
  MAX_INJECTED_BYTES,
  BUDGET_SHARE,
  MIN_BUDGET_BYTES,
  budgetForProfile,
  SKILLS_DIR,
  SOURCE,
  STAGE_REFERENCES,
  describeSkill,
  listSkills,
  readBody,
  readReference,
  referenceBundle,
  referencesForStage,
  skillBundle,
  skillsFor,
};
