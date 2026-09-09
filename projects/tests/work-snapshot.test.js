/**
 * Snapshots and fingerprints: how the platform knows something moved.
 *
 * The first block characterises what `stage-transition-requests` did before this became
 * shared code. It exists so "the extraction changed no behaviour" is something the suite
 * proves rather than something a commit message claims.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const transitions = require('../lib/stage-transition-requests');

function project(overrides = {}) {
  return {
    id: 'prj_1',
    name: 'Sistema de Reservas',
    updatedAt: '2026-09-01T10:00:00.000Z',
    originalIdeaText: 'Reservas de restaurante',
    vision: 'Acabar com o caderno de papel',
    requirements: [
      { id: 'FR-1', type: 'functional', title: 'Criar reserva', shall: 'O sistema deve...', status: 'approved', updatedAt: '2026-09-01T10:00:00.000Z' },
    ],
    ...overrides,
  };
}

test('a fingerprint ignores key order but not values', () => {
  const a = transitions.fingerprint({ b: 2, a: 1 });
  const b = transitions.fingerprint({ a: 1, b: 2 });
  assert.equal(a, b, 'key order must not count as a change');
  assert.notEqual(a, transitions.fingerprint({ a: 1, b: 3 }));
});

test('the snapshot moves when a human edits the idea', () => {
  const before = transitions.contextSnapshot(project(), 'idea', 'discovery');
  const after = transitions.contextSnapshot(
    project({ originalIdeaText: 'Reservas, e tambem takeaway' }),
    'idea',
    'discovery',
  );
  assert.notEqual(transitions.fingerprint(before), transitions.fingerprint(after));
});

test('the snapshot ignores what the two stages do not read', () => {
  const before = transitions.contextSnapshot(project(), 'idea', 'discovery');
  // `operations` belongs to neither stage, so touching it is not a change here.
  const after = transitions.contextSnapshot(project({ operations: 'algo novo' }), 'idea', 'discovery');
  assert.equal(transitions.fingerprint(before), transitions.fingerprint(after));
});

test('a requirement edited by hand changes the requirements snapshot', () => {
  const base = project();
  const edited = project({
    requirements: [{ ...base.requirements[0], shall: 'O sistema deve, de outra maneira...' }],
  });
  assert.notEqual(
    transitions.fingerprint(transitions.contextSnapshot(base, 'requirements', 'architecture')),
    transitions.fingerprint(transitions.contextSnapshot(edited, 'requirements', 'architecture')),
  );
});

test('promptDiff reports both directions and nothing when equal', () => {
  assert.equal(transitions.promptDiff('a\nb', 'a\nb'), '');
  const diff = transitions.promptDiff('a\nb', 'a\nc');
  assert.match(diff, /^- b$/m);
  assert.match(diff, /^\+ c$/m);
});

/* ------------------------------------------------------------------ the chain */

const loop = require('../lib/orchestration-loop');
const snapshot = require('../lib/work-snapshot');

function reservas(overrides = {}) {
  return {
    id: 'prj_1',
    name: 'Reservas',
    productType: 'web_app',
    originalIdeaText: 'Reservas de restaurante',
    intake: { answers: [{ questionId: 'quem-usa', answer: 'gerente' }] },
    workItems: [],
    execucoes: [],
    ...overrides,
  };
}

/** Drives the chain, accepting every question, and returns what ran. */
function drive(project, steps = 8) {
  const seen = [];
  for (let i = 0; i < steps; i += 1) {
    const decision = loop.decideNext(project);
    if (decision.action === 'wait_human') { loop.answerQuestion(project, { accepted: true }); continue; }
    if (decision.action !== 'dispatch') break;
    seen.push(decision.persona.id + (decision.reason === 'inputs-changed' ? '*' : ''));
    loop.markDispatched(project, decision.persona, { id: `t${i}` });
    loop.recordResult(project, { personaId: decision.persona.id, workItemId: `t${i}`, outcome: 'completed' });
  }
  return seen;
}

test('the intake is part of the idea, so editing an answer is a change', () => {
  const before = reservas();
  const after = reservas({ intake: { answers: [{ questionId: 'quem-usa', answer: 'gerente e empregados' }] } });
  assert.notEqual(
    snapshot.fingerprint(snapshot.stageSnapshot(before, 'idea')),
    snapshot.fingerprint(snapshot.stageSnapshot(after, 'idea')),
  );
  // But the order answers happen to be stored in is not a change.
  const a = reservas({ intake: { answers: [{ questionId: 'b', answer: '2' }, { questionId: 'a', answer: '1' }] } });
  const b = reservas({ intake: { answers: [{ questionId: 'a', answer: '1' }, { questionId: 'b', answer: '2' }] } });
  assert.equal(
    snapshot.fingerprint(snapshot.stageSnapshot(a, 'idea')),
    snapshot.fingerprint(snapshot.stageSnapshot(b, 'idea')),
  );
});

test('a persona depends on what it reads, not on where it writes', () => {
  const buildPolicies = require('../lib/build-policies');
  const personas = require('../lib/agent-personas');
  const byId = new Map(personas.listPersonas().map((p) => [p.id, p]));

  // UX consumes `intention`, which the intake produces — so it reads the idea.
  assert.deepEqual(buildPolicies.stagesFeedingPersona('web_app', byId.get('ux')), ['idea']);
  // The Product Owner also reads discovery, which is the mockup → idea case.
  assert.ok(buildPolicies.stagesFeedingPersona('web_app', byId.get('product_owner')).includes('discovery'));
  // It writes to `requirements`, but writing there does not make it depend on it.
  assert.equal(buildPolicies.stagesFeedingPersona('web_app', byId.get('product_owner')).includes('requirements'), false);
});

test('every run records what it was built on, and it survives storage', () => {
  const project = reservas();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  drive(project);

  const history = loop.activeExecucao(project).history;
  assert.ok(history.length >= 3);
  assert.ok(history.every((entry) => entry.inputFingerprint), 'cada passo grava o que leu');

  // Dropping it on load would silently disable staleness detection.
  const reloaded = loop.normalizeExecucoes(JSON.parse(JSON.stringify(project)))[0];
  assert.deepEqual(
    reloaded.history.map((entry) => entry.inputFingerprint),
    history.map((entry) => entry.inputFingerprint),
  );
});

test('a human edit brings the chain back, and it resumes rather than restarting', () => {
  const project = reservas();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  const first = drive(project);
  assert.deepEqual(first.slice(0, 2), ['product_owner', 'ux']);

  // Edited by hand, by a person, long after the agents ran.
  project.originalIdeaText = 'Reservas de restaurante e takeaway';

  const decision = loop.decideNext(project);
  assert.equal(decision.action, 'dispatch');
  assert.equal(decision.persona.id, 'product_owner');
  assert.equal(decision.reason, 'inputs-changed');

  // It picks up the human's text — it is not stuck on what the AI last produced.
  const buildPolicies = require('../lib/build-policies');
  const personas = require('../lib/agent-personas');
  const po = personas.listPersonas().find((p) => p.id === 'product_owner');
  const stages = buildPolicies.stagesFeedingPersona('web_app', po);
  assert.match(JSON.stringify(snapshot.stagesSnapshot(project, stages)), /takeaway/);
});

test('a change nothing depends on starts nothing', () => {
  const project = reservas();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  drive(project);
  const before = loop.decideNext(project).action;

  project.operations = 'notas de operacao, que nenhuma persona le';
  assert.equal(loop.decideNext(project).action, before, 'nao deve acordar ninguem');
});

test('work finished before fingerprints existed is left alone, not declared stale', () => {
  const project = reservas();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  drive(project);

  // An older record carries no fingerprint. Staleness is unknowable, so it is not claimed.
  const execucao = loop.normalizeExecucoes(project)[0];
  execucao.history = execucao.history.map((entry) => ({ ...entry, inputFingerprint: '' }));
  project.execucoes = [execucao];
  project.originalIdeaText = 'mudou tudo';

  const decision = loop.decideNext(project);
  assert.notEqual(decision.reason, 'inputs-changed');
});

test('a project that keeps oscillating stops and asks for a person', () => {
  const project = reservas();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  drive(project);

  let halted = null;
  for (let round = 0; round < loop.STALE_RERUN_LIMIT + 2; round += 1) {
    project.originalIdeaText = `ideia versao ${round}`;
    const decision = loop.decideNext(project);
    if (decision.action === 'halt') { halted = decision; break; }
    if (decision.action !== 'dispatch') break;
    loop.markDispatched(project, decision.persona, { id: `r${round}` });
    loop.recordResult(project, { personaId: decision.persona.id, workItemId: `r${round}`, outcome: 'completed' });
  }
  assert.ok(halted, 'devia parar em vez de refazer para sempre');
  assert.match(halted.reason, /continua a mudar/);
});

test('saving the project is not a content change', () => {
  // The trap: `updatedAt` moves on every write, including the write that records the
  // run itself. Counting it as a change marks a persona stale the instant it finishes
  // and re-dispatches it forever.
  const before = reservas({ updatedAt: '2026-09-01T10:00:00.000Z' });
  const after = reservas({ updatedAt: '2026-09-09T18:00:00.000Z' });
  assert.equal(
    snapshot.fingerprint(snapshot.stagesSnapshot(before, ['idea', 'discovery'])),
    snapshot.fingerprint(snapshot.stagesSnapshot(after, ['idea', 'discovery'])),
  );
  assert.equal(
    snapshot.fingerprint(snapshot.stageSnapshot(before, 'idea')),
    snapshot.fingerprint(snapshot.stageSnapshot(after, 'idea')),
  );

  // Stage transitions keep their own meaning of "changed", which does include a save.
  assert.notEqual(
    transitions.fingerprint(transitions.contextSnapshot(before, 'idea', 'discovery')),
    transitions.fingerprint(transitions.contextSnapshot(after, 'idea', 'discovery')),
  );
});

test('a persona that just finished is not immediately stale', () => {
  const project = reservas();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  const decision = loop.decideNext(project);
  loop.markDispatched(project, decision.persona, { id: 't0' });
  // Recording a result writes to the project, which is exactly when the trap fires.
  project.updatedAt = new Date().toISOString();
  loop.recordResult(project, { personaId: decision.persona.id, workItemId: 't0', outcome: 'completed' });
  project.updatedAt = new Date(Date.now() + 1000).toISOString();

  const next = loop.decideNext(project);
  assert.notEqual(next.persona?.id, decision.persona.id, 'nao se pode redespachar a si proprio');
});
