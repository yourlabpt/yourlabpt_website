/**
 * The OpenSpec markdown convention: read it, write it, round-trip it.
 *
 *   openspec/project.md
 *   openspec/specs/<capability>/spec.md
 *   openspec/changes/<change-id>/{proposal.md,tasks.md,design.md,specs/<cap>/spec.md}
 *
 * A spec.md holds requirements and the scenarios that verify them:
 *
 *   ## Requirements
 *   ### Requirement: <title>
 *   The system SHALL ...
 *   #### Scenario: <name>
 *   - **WHEN** ...
 *   - **THEN** ...
 *
 * Platform identity travels in an HTML comment under each heading. It is invisible in
 * rendered markdown but survives a round-trip, which is what makes two-way sync safe:
 * without a stable id every pull would look like "delete everything, add everything".
 */

const ears = require('./ears');

const SPEC_ROOT = 'openspec';

const GENERATED_NOTE = '<!-- Gerado pela plataforma a partir do estado do projecto. '
  + 'Edite na plataforma, nao aqui: uma alteracao feita neste ficheiro e substituida na '
  + 'proxima sincronizacao. -->';

const DELTA_SECTIONS = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'];

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function slugify(value, fallback = 'capability') {
  const slug = text(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function specPath(capability) {
  return `${SPEC_ROOT}/specs/${slugify(capability)}/spec.md`;
}

function changePath(changeId, file) {
  return `${SPEC_ROOT}/changes/${slugify(changeId, 'change')}/${file}`;
}

/** `<!-- yourlab: key=value; key=value -->` */
function serializeMeta(meta = {}) {
  const pairs = Object.entries(meta)
    .filter(([, value]) => text(value))
    .map(([key, value]) => `${key}=${String(value).replace(/[;>]/g, ' ').trim()}`);
  return pairs.length ? `<!-- yourlab: ${pairs.join('; ')} -->` : '';
}

function parseMeta(line) {
  const match = String(line || '').match(/^<!--\s*yourlab:\s*(.+?)\s*-->$/);
  if (!match) return null;
  const meta = {};
  for (const pair of match[1].split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) meta[key] = value;
  }
  return meta;
}

/**
 * Scenario bodies are bullet lists of WHEN/THEN/AND. Returns the parts separately so
 * the platform can map them onto a test case's condition and expected result.
 */
function parseScenarioBody(lines) {
  const when = [];
  const then = [];
  const rest = [];
  for (const line of lines) {
    const bullet = line.replace(/^\s*[-*]\s*/, '');
    const keyword = bullet.match(/^\*\*(WHEN|THEN|AND|GIVEN)\*\*\s*(.*)$/i);
    if (!keyword) {
      if (text(line)) rest.push(text(line));
      continue;
    }
    const word = keyword[1].toUpperCase();
    const value = text(keyword[2]);
    if (!value) continue;
    if (word === 'WHEN' || word === 'GIVEN') when.push(value);
    else if (word === 'THEN') then.push(value);
    else (then.length ? then : when).push(value);
  }
  return {
    when: when.join(' e '),
    then: then.join(' e '),
    notes: rest.join('\n'),
  };
}

function serializeScenario(scenario) {
  const lines = [`#### Scenario: ${text(scenario.title, 'Cenario')}`];
  const meta = serializeMeta({ id: scenario.id, requirementId: scenario.requirementId });
  if (meta) lines.push(meta);
  if (text(scenario.when)) lines.push(`- **WHEN** ${text(scenario.when)}`);
  if (text(scenario.then)) lines.push(`- **THEN** ${text(scenario.then)}`);
  if (!text(scenario.when) && !text(scenario.then) && text(scenario.notes)) {
    lines.push(`- ${text(scenario.notes)}`);
  }
  return lines.join('\n');
}

function serializeRequirement(requirement) {
  const lines = [`### Requirement: ${text(requirement.title, 'Requisito')}`];
  const meta = serializeMeta({
    id: requirement.id,
    type: requirement.type,
    priority: requirement.priority,
    module: requirement.module,
    // The shape it is written in, so a pull recovers it exactly rather than guessing
    // from the prose. Guessing is the fallback, not the mechanism.
    ears: requirement.earsPattern,
  });
  if (meta) lines.push(meta);
  // The EARS sentence when the requirement declares a shape, the bare statement
  // otherwise — a requirement half-written should still read as something.
  const statement = ears.toSentence(requirement) || text(requirement.shall);
  if (statement) lines.push('', statement);
  if (text(requirement.rationale)) lines.push('', `_Porque:_ ${text(requirement.rationale)}`);
  for (const scenario of requirement.scenarios || []) {
    lines.push('', serializeScenario(scenario));
  }
  return lines.join('\n');
}

/**
 * Serializes one capability into a spec.md.
 */
function serializeSpec(spec) {
  const lines = [`# ${text(spec.title, text(spec.capability, 'Capacidade'))} Specification`];
  const meta = serializeMeta({ capability: spec.capability, module: spec.module });
  if (meta) lines.push(meta);
  lines.push('', '## Purpose', '', text(spec.purpose, 'Por definir.'), '', '## Requirements');
  for (const requirement of spec.requirements || []) {
    lines.push('', serializeRequirement(requirement));
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/**
 * Parses a spec.md back into capability + requirements + scenarios.
 * Tolerant by design: hand-edited files must not throw, they lose only the metadata
 * the author did not write.
 */
function parseSpec(markdown, { capability = '' } = {}) {
  const lines = String(markdown || '').split(/\r?\n/);
  const spec = {
    capability: slugify(capability),
    title: '',
    module: '',
    purpose: '',
    requirements: [],
  };

  let section = '';
  let requirement = null;
  let scenario = null;
  let purposeLines = [];
  let bodyLines = [];
  let scenarioLines = [];

  const closeScenario = () => {
    if (!scenario || !requirement) return;
    const parsed = parseScenarioBody(scenarioLines);
    requirement.scenarios.push({ ...scenario, ...parsed });
    scenario = null;
    scenarioLines = [];
  };
  const closeRequirement = () => {
    closeScenario();
    if (!requirement) return;
    const body = bodyLines.join('\n').trim();
    const rationaleMatch = body.match(/_Porque:_\s*(.+)/);
    const statementText = body.replace(/_Porque:_\s*.+/, '').trim();
    // Split the sentence back into trigger and response, so the structured fields
    // survive a pull rather than only the prose. A sentence that is not in an EARS
    // shape is kept exactly as written — that is a requirement too, just not one the
    // layer rules can check.
    const parsed = ears.parseSentence(statementText);
    if (parsed) {
      requirement.shall = parsed.shall;
      requirement.condition = parsed.condition;
      requirement.earsPattern = requirement.earsPattern || parsed.earsPattern;
    } else {
      requirement.shall = statementText;
      // Always present, even when empty: a caller checking the shape should not have to
      // distinguish "no shape" from "field absent".
      requirement.earsPattern = requirement.earsPattern || '';
    }
    requirement.rationale = rationaleMatch ? text(rationaleMatch[1]) : '';
    spec.requirements.push(requirement);
    requirement = null;
    bodyLines = [];
  };

  for (const line of lines) {
    const meta = parseMeta(line.trim());
    if (meta) {
      if (scenario) Object.assign(scenario, meta);
      else if (requirement) Object.assign(requirement, meta);
      else {
        if (meta.capability) spec.capability = slugify(meta.capability);
        if (meta.module) spec.module = meta.module;
      }
      continue;
    }

    const h1 = line.match(/^#\s+(.+?)(?:\s+Specification)?\s*$/);
    if (h1 && !spec.title) { spec.title = text(h1[1]); continue; }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      closeRequirement();
      section = text(h2[1]).toLowerCase();
      continue;
    }

    const h3 = line.match(/^###\s+Requirement:\s*(.+)$/i);
    if (h3) {
      closeRequirement();
      requirement = {
        id: '', type: 'functional', priority: '', module: '',
        title: text(h3[1]), shall: '', rationale: '', scenarios: [],
      };
      continue;
    }

    const h4 = line.match(/^####\s+Scenario:\s*(.+)$/i);
    if (h4 && requirement) {
      closeScenario();
      scenario = { id: '', title: text(h4[1]) };
      continue;
    }

    if (scenario) scenarioLines.push(line);
    else if (requirement) bodyLines.push(line);
    else if (section.startsWith('purpose')) purposeLines.push(line);
  }
  closeRequirement();

  spec.purpose = purposeLines.join('\n').trim();
  if (!spec.title) spec.title = spec.capability;
  return spec;
}

/**
 * A change proposal's spec delta, grouped by operation.
 */
function serializeDelta(capability, delta = {}) {
  const lines = [`## ${text(delta.capabilityTitle, capability)} delta`];
  for (const section of DELTA_SECTIONS) {
    const entries = delta[section.toLowerCase()] || [];
    if (!entries.length) continue;
    lines.push('', `## ${section} Requirements`);
    for (const requirement of entries) lines.push('', serializeRequirement(requirement));
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

function parseDelta(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const result = { added: [], modified: [], removed: [], renamed: [] };
  let current = '';
  let buffer = [];
  const flush = () => {
    if (!current || !buffer.length) { buffer = []; return; }
    const parsed = parseSpec(`# delta\n\n## Requirements\n${buffer.join('\n')}`);
    result[current].push(...parsed.requirements);
    buffer = [];
  };
  for (const line of lines) {
    const header = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/i);
    if (header) {
      flush();
      current = header[1].toLowerCase();
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return result;
}

/**
 * `openspec/vision.md` — Camada 1, as the repository sees it.
 *
 * A rendering of platform state, never a second copy of it: the platform is where this
 * is edited, and the file exists so an agent with `repo.read` and a person reading the
 * repo see the same thing. It says so in the file, because a generated document that
 * does not announce itself gets edited by hand and then silently overwritten.
 */
function serializeVisionDoc(project) {
  const vision = project?.vision && typeof project.vision === 'object' ? project.vision : {};
  const lines = [
    `# ${text(project?.name, 'Projecto')} — Visao`,
    '',
    GENERATED_NOTE,
    '',
    '## Para que serve isto',
    '',
    text(vision.mainIdeaMarkdown, 'Por definir.'),
  ];
  if (text(vision.problemMarkdown)) {
    lines.push('', '## O problema', '', text(vision.problemMarkdown));
  }
  const users = Array.isArray(vision.targetUsers) ? vision.targetUsers.filter(Boolean) : [];
  if (users.length) {
    lines.push('', '## Quem usa', '', ...users.map((entry) => `- ${text(entry)}`));
  }
  if (text(vision.valuePropositionMarkdown)) {
    lines.push('', '## O que muda para quem usa', '', text(vision.valuePropositionMarkdown));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * `openspec/constitution.md` — the rules that hold whatever gets built.
 *
 * Separate from the vision on purpose: a vision is a direction, a constitution is an
 * invariant. Written one per line so a requirement can be checked against it.
 */
function serializeConstitutionDoc(project) {
  const rules = String(project?.constitution || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [
    `# ${text(project?.name, 'Projecto')} — Constituicao`,
    '',
    GENERATED_NOTE,
    '',
    'Regras que valem para tudo o que for construido. Um requisito que viole uma delas',
    'ou nao se faz, ou a regra nunca foi mesmo uma regra — e as duas coisas sao decisoes.',
    '',
    ...(rules.length ? rules.map((rule) => `- ${rule}`) : ['_Nenhuma regra definida._']),
    '',
  ].join('\n');
}

/**
 * `openspec/decisions.md` — what changed, and what it put in doubt.
 *
 * A serializer over decisions that already live on tasks and phases. Ordered newest
 * first, and open decisions come with their own heading: a reader of the repository
 * should see what is still unresolved without cross-referencing the platform.
 */
function serializeDecisionsDoc(project, entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const pending = rows.filter((entry) => entry.status === 'proposed');
  const ruled = rows.filter((entry) => entry.status !== 'proposed');

  const render = (entry) => {
    const when = text(entry.decidedAt || entry.raisedAt).slice(0, 10);
    const head = [when, entry.artifact ? `\`${entry.artifact}\`` : '', Number.isInteger(entry.camada) ? `Camada ${entry.camada}` : '']
      .filter(Boolean)
      .join(' · ');
    const out = [`### ${text(entry.proposal, 'Sem proposta')}`, '', head];
    if ((entry.affects || []).length) {
      out.push('', `Poe em causa: ${entry.affects.map((a) => `\`${a}\``).join(', ')}`);
    }
    if (text(entry.rationale)) out.push('', text(entry.rationale));
    if (text(entry.decidedBy)) out.push('', `_Decidida por ${text(entry.decidedBy)}._`);
    return out.join('\n');
  };

  const lines = [`# ${text(project?.name, 'Projecto')} — Decisoes`, '', GENERATED_NOTE, ''];
  if (pending.length) {
    lines.push('## Por decidir', '', ...pending.map(render).flatMap((block) => [block, '']));
  }
  lines.push('## Decididas', '');
  lines.push(...(ruled.length ? ruled.map(render).flatMap((block) => [block, '']) : ['_Nenhuma ainda._', '']));
  return lines.join('\n');
}

function serializeProjectDoc(project) {
  return [
    `# ${text(project.name, 'Projecto')}`,
    '',
    serializeMeta({ projectId: project.id, stage: project.deliveryStageId }),
    '',
    '## Contexto',
    '',
    text(project.description, 'Por definir.'),
    '',
    '## Como este repositorio esta organizado',
    '',
    '- `openspec/specs/` — o que o sistema faz hoje, uma pasta por capacidade.',
    '- `openspec/changes/` — propostas de alteracao ainda nao integradas.',
    '',
    'Cada requisito tem pelo menos um cenario WHEN/THEN executavel. Um requisito sem',
    'cenario nao esta pronto para desenvolvimento.',
    '',
    '## Fluxo',
    '',
    '1. UX aprova os ecras e fluxos.',
    '2. Product Owner escreve os requisitos e criterios de aceitacao aqui.',
    '3. Module Architect parte em modulos; Orchestrator fixa os contratos.',
    '4. Developer implementa um modulo; Tester valida contra os cenarios.',
    '',
  ].join('\n');
}

function serializeProposal(change) {
  return [
    `# ${text(change.title, 'Proposta de alteracao')}`,
    '',
    serializeMeta({ id: change.id, projectId: change.projectId }),
    '',
    '## Porque',
    '',
    text(change.why, 'Por definir.'),
    '',
    '## O que muda',
    '',
    ...(change.whatChanges?.length
      ? change.whatChanges.map((entry) => `- ${text(entry)}`)
      : ['- Por definir.']),
    '',
    '## Impacto',
    '',
    ...(change.affectedCapabilities?.length
      ? change.affectedCapabilities.map((entry) => `- \`${slugify(entry)}\``)
      : ['- Por definir.']),
    '',
  ].join('\n');
}

function serializeTasks(tasks = []) {
  const lines = ['# Tarefas', ''];
  if (!tasks.length) lines.push('- [ ] Por definir.');
  for (const task of tasks) {
    lines.push(`- [${task.done ? 'x' : ' '}] ${text(task.title)}${task.module ? ` (\`${slugify(task.module)}\`)` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseTasks(markdown) {
  return String(markdown || '')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      done: match[1].toLowerCase() === 'x',
      title: text(match[2]).replace(/\s*\(`[^`]+`\)\s*$/, ''),
      module: (text(match[2]).match(/\(`([^`]+)`\)\s*$/) || [])[1] || '',
    }));
}

module.exports = {
  DELTA_SECTIONS,
  SPEC_ROOT,
  changePath,
  parseDelta,
  parseMeta,
  parseScenarioBody,
  parseSpec,
  parseTasks,
  serializeDelta,
  serializeMeta,
  serializeConstitutionDoc,
  serializeDecisionsDoc,
  serializeProjectDoc,
  serializeVisionDoc,
  serializeProposal,
  serializeRequirement,
  serializeSpec,
  serializeTasks,
  slugify,
  specPath,
};
