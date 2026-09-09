/**
 * What a change puts in doubt, and who has to look at it.
 *
 * The case this exists for: changing a mockup means the idea it came from may no longer
 * be true. That must reach the right persona, become a decision on a task, and — where
 * the idea was already approved — stop and ask before touching it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const propagation = require('../lib/change-propagation');
const loop = require('../lib/orchestration-loop');

function project(stages = []) {
  return {
    id: 'prj_1',
    name: 'Reservas',
    productType: 'web_app',
    originalIdeaText: 'Reservas de restaurante',
    intake: { answers: [{ questionId: 'quem-usa', answer: 'gerente' }] },
    stages,
    workItems: [],
    execucoes: [],
  };
}

/** Runs a refinement to the end, accepting every question, and reports what happened. */
function drive(project, steps = 12) {
  const seen = [];
  for (let i = 0; i < steps; i += 1) {
    const decision = loop.decideNext(project);
    if (decision.action === 'wait_human') {
      const question = loop.activeExecucao(project)?.question || decision.question;
      seen.push(`ask:${question.kind}${question.artifact ? `:${question.artifact}` : ''}`);
      if (!loop.activeExecucao(project)?.question) loop.raiseQuestion(project, decision.question);
      loop.answerQuestion(project, { accepted: true });
      continue;
    }
    if (decision.action !== 'dispatch') { seen.push(decision.action); break; }
    seen.push(`${decision.persona.id}:${decision.reconcile.direction}`);
    loop.markDispatched(project, decision.persona, { id: `t${i}` });
    loop.recordResult(project, { personaId: decision.persona.id, workItemId: `t${i}`, outcome: 'completed' });
  }
  return seen;
}

test('downstream impact is derived, following the approval transform', () => {
  const impact = propagation.impactOf('web_app', 'ux_mockup');
  // Nobody consumes `ux_mockup`; three personas consume what approving it produces, and
  // the impact has to follow that rename to find them.
  const ids = impact.downstream.map((entry) => entry.personaId);
  assert.ok(ids.includes('module_architect'));
  assert.ok(ids.includes('tech_lead'));
  // The persona that made the change is not downstream of itself.
  assert.equal(ids.includes('ux'), false);
  assert.equal(impact.producer, 'ux');
});

test('upstream impact is declared, and arrives with the sentence that explains it', () => {
  const impact = propagation.impactOf('web_app', 'ux_mockup');
  const toIdea = impact.upstream.find((entry) => entry.artifact === 'intention');
  assert.ok(toIdea, 'mudar o mockup tem de chegar a ideia');
  assert.equal(toIdea.personaId, 'product_owner');
  assert.match(toIdea.rule, /capacidade nova/);
  assert.equal(toIdea.sourceArtifact, 'ux_mockup');
});

test('the plan fixes the idea before rebuilding on it', () => {
  const steps = propagation.reconcilePlan('web_app', 'ux_mockup');
  const ids = steps.map((step) => step.personaId);
  assert.equal(ids[0], 'ux', 'a alteracao e de quem produz o artefacto');
  assert.ok(ids.indexOf('product_owner') < ids.indexOf('module_architect'),
    'reconciliar antes de reconstruir, ou reconstroi-se sobre algo ja errado');
  // And nobody is asked twice, however many ways they are affected.
  assert.equal(new Set(ids).size, ids.length);
});

test('a refinement runs the few who must reconcile, and nobody else', () => {
  const p = project();
  loop.startExecucao(p, { goal: 'Mudar o mockup', kind: 'refinamento', targetArtifact: 'ux_mockup', maxCostUsd: 99, maxHours: 99 });
  const seen = drive(p);

  assert.deepEqual(seen, [
    'ux:produces', 'ask:mockup_acceptance',
    'product_owner:upstream', 'module_architect:downstream', 'tech_lead:downstream',
    'complete',
  ]);
  // The whole point: it increments instead of redoing everything.
  const ran = seen.join(' ');
  for (const untouched of ['orchestrator', 'developer', 'tester']) {
    assert.equal(ran.includes(untouched), false, `${untouched} nao devia correr`);
  }
});

test('touching something already approved stops and asks first', () => {
  const p = project([{ id: 'idea', status: 'approved', approvedAt: '2026-09-01T10:00:00.000Z' }]);
  loop.startExecucao(p, { goal: 'Mudar o mockup', kind: 'refinamento', targetArtifact: 'ux_mockup', maxCostUsd: 99, maxHours: 99 });
  const seen = drive(p);

  assert.ok(seen.includes('ask:approved_artifact_change:intention'),
    'reescrever algo aprovado sem avisar tornaria a aprovacao inutil');
  // Asked before the reconciliation, never after it.
  assert.ok(seen.indexOf('ask:approved_artifact_change:intention') < seen.indexOf('product_owner:upstream'));
  // And agreeing is remembered, so it is not asked again on the next pass.
  assert.deepEqual(loop.activeExecucao(p)?.acknowledged ?? [], ['intention']);
});

test('the acknowledgement survives storage', () => {
  const p = project([{ id: 'idea', status: 'approved', approvedAt: '2026-09-01T10:00:00.000Z' }]);
  loop.startExecucao(p, { goal: 'x', kind: 'refinamento', targetArtifact: 'ux_mockup', maxCostUsd: 99, maxHours: 99 });
  drive(p, 4);
  const reloaded = loop.normalizeExecucoes(JSON.parse(JSON.stringify(p)))[0];
  assert.deepEqual(reloaded.acknowledged, ['intention']);
  assert.equal(reloaded.targetArtifact, 'ux_mockup');
});

test('refining something nothing depends on says so instead of running nothing', () => {
  const p = project();
  loop.startExecucao(p, { goal: 'x', kind: 'refinamento', targetArtifact: 'inexistente', maxCostUsd: 99, maxHours: 99 });
  const decision = loop.decideNext(p);
  assert.equal(decision.action, 'halt');
  assert.match(decision.reason, /Nada depende de/);
});

test('the other kinds are untouched by any of this', () => {
  const p = project();
  loop.startExecucao(p, { goal: 'Construir', maxCostUsd: 99, maxHours: 99 });
  const decision = loop.decideNext(p);
  assert.equal(decision.action, 'dispatch');
  assert.equal(decision.persona.id, 'product_owner');
  assert.equal(decision.reconcile, undefined, 'uma construcao nao reconcilia nada');
});

test('a reconciliation arrives as a decision on its task, awaiting a ruling', async () => {
  const { createDriver } = require('../lib/orchestration-driver');
  const workItems = require('../lib/work-items');

  const store = { projects: [project()] };
  const p = store.projects[0];
  loop.startExecucao(p, { goal: 'Mudar o mockup', kind: 'refinamento', targetArtifact: 'ux_mockup', maxCostUsd: 99, maxHours: 99 });

  // Past the producer and its mockup question, to the first reconciliation.
  const first = loop.decideNext(p);
  loop.markDispatched(p, first.persona, { id: 't0' });
  loop.recordResult(p, { personaId: first.persona.id, workItemId: 't0', outcome: 'completed' });
  loop.answerQuestion(p, { accepted: true });

  const driver = createDriver({
    updateStore: async (fn) => fn(store),
    appendActivity: () => {},
    startAgentRun: async () => ({ status: 200, body: {} }),
    dataDir: '/tmp',
    nowIso: () => new Date().toISOString(),
  });
  await driver.advanceOnce('prj_1', 'tulio');

  const items = workItems.getWorkItems(p);
  const task = items[items.length - 1];
  assert.match(task.title, /reconciliar intention/);

  const decision = (task.updates || []).find((entry) => entry.decision)?.decision;
  assert.ok(decision, 'a reconciliacao tem de ficar registada na tarefa');
  assert.equal(decision.artifact, 'ux_mockup', 'o que mudou');
  assert.deepEqual(decision.affects, ['intention'], 'o que isso poe em causa');
  assert.equal(decision.status, 'proposed', 'nada conta ate alguem decidir');
  // The policy's own sentence reaches the person, not a paraphrase of it.
  assert.match(decision.rationale, /capacidade nova/);
});
