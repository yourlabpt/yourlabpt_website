const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const loop = require('../lib/orchestration-loop');
const budget = require('../lib/project-budget');
const workItems = require('../lib/work-items');

const HOUR = 3600 * 1000;

function project(over = {}) {
  const base = { id: 'prj_1', name: 'Reservas', workItems: [], execucoes: [], ...over };
  workItems.setWorkItems(base, workItems.getWorkItems(base));
  return base;
}

function started(project, goal = 'Construir reservas', caps = { maxCostUsd: 10, maxHours: 4 }, now = Date.now()) {
  loop.startExecucao(project, { goal, ...caps }, now);
  return project;
}

function done(personaId, extra = {}) {
  return { personaId, outcome: 'completed', at: new Date().toISOString(), ...extra };
}

/** Injects history directly onto the active Execução, for tests that just need state. */
function withHistory(project, history) {
  const exec = loop.activeExecucao(project);
  exec.history = history;
  project.execucoes = [exec];
  return project;
}

describe('project budget', () => {
  it('counts nothing until the clock starts', () => {
    const state = budget.budgetState({ maxHours: 1 }, Date.now());
    assert.equal(state.elapsedSeconds, 0);
    assert.equal(state.running, false);
    assert.equal(state.exhausted, false);
  });

  it('accumulates only while running, and stops when paused', () => {
    const t0 = Date.now();
    const startedBudget = budget.startClock({ maxHours: 4 }, t0);
    assert.equal(budget.elapsedSeconds(startedBudget, t0 + HOUR), 3600);

    const paused = budget.stopClock(startedBudget, t0 + HOUR);
    assert.equal(paused.elapsedSeconds, 3600);
    assert.equal(budget.elapsedSeconds(paused, t0 + 10 * HOUR), 3600,
      'waiting for a human must not consume the hour budget');
  });

  it('exhausts on money and names the reason', () => {
    const state = budget.budgetState({ maxCostUsd: 5, spentUsd: 5.01 });
    assert.equal(state.costExhausted, true);
    assert.match(state.reason, /custo/);
  });

  it('treats a zero cap as unlimited', () => {
    const state = budget.budgetState({ maxCostUsd: 0, maxHours: 0, spentUsd: 9999, elapsedSeconds: 999999 });
    assert.equal(state.exhausted, false);
  });
});

describe('Execução lifecycle', () => {
  it('has no active Execução until one is started', () => {
    assert.equal(loop.activeExecucao(project()), null);
    assert.equal(loop.decideNext(project()).action, 'idle');
  });

  it('creates one with its own goal, budget and clock', () => {
    const p = started(project());
    const exec = loop.activeExecucao(p);
    assert.equal(exec.goal, 'Construir reservas');
    assert.equal(exec.status, 'running');
    assert.equal(exec.budget.maxCostUsd, 10);
    assert.ok(exec.budget.runningSince);
  });

  it('refuses to start a second Execução while one is active', () => {
    const p = started(project());
    assert.throws(() => loop.startExecucao(p, { goal: 'outra coisa' }), /Ja existe uma execucao activa/);
  });

  it('keeps every finished Execução as a record', () => {
    const p = started(project());
    loop.stopChain(p, 'completed');
    const second = loop.startExecucao(p, { goal: 'Nova funcionalidade', maxCostUsd: 5 });
    assert.equal(loop.normalizeExecucoes(p).length, 2);
    assert.equal(loop.activeExecucao(p).id, second.id);
  });

  it('raising the cap on a paused Execução resumes it — it does not create a new one', () => {
    const p = started(project(), 'Construir reservas', { maxCostUsd: 5 });
    const originalId = loop.activeExecucao(p).id;
    loop.stopChain(p, 'paused_budget');
    loop.startExecucao(p, { maxCostUsd: 50 });
    assert.equal(loop.normalizeExecucoes(p).length, 1, 'must not create a second Execução');
    assert.equal(loop.activeExecucao(p).id, originalId);
    assert.equal(loop.activeExecucao(p).status, 'running');
    assert.equal(loop.activeExecucao(p).budget.maxCostUsd, 50);
  });

  it('the project rolls up spend across every Execução it has ever run', () => {
    const p = started(project());
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 2 });
    loop.stopChain(p, 'completed');
    loop.startExecucao(p, { goal: 'Outra coisa', maxCostUsd: 5 });
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 3 });
    const rollup = loop.projectSpendRollup(p);
    assert.equal(rollup.totalSpentUsd, 5);
    assert.equal(rollup.count, 2);
    assert.equal(rollup.completed, 1);
  });
});

describe('chain sequencing within the active Execução', () => {
  it('starts at the first persona', () => {
    const decision = loop.decideNext(started(project()));
    assert.equal(decision.action, 'dispatch');
    assert.equal(decision.persona.id, 'product_owner');
  });

  it('advances to the next persona once the previous completed', () => {
    const p = withHistory(started(project()), [done('product_owner')]);
    const decision = loop.decideNext(p);
    assert.equal(decision.persona.id, 'ux');
  });

  it('does not skip an upstream persona that has not run', () => {
    const p = withHistory(started(project()), [done('ux')]);
    assert.equal(loop.decideNext(p).persona.id, 'product_owner');
  });

  it('waits while something is in flight', () => {
    const p = started(project());
    loop.markDispatched(p, { id: 'ux' }, { id: 'task_1' });
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'running');
    assert.equal(decision.personaId, 'ux');
  });

  it('skips a disabled persona rather than stalling', () => {
    const p = withHistory(started(project()), [done('product_owner')]);
    const decision = loop.decideNext(p, { personaOverrides: { ux: { enabled: false } } });
    assert.equal(decision.persona.id, 'module_architect');
  });
});

describe('the chain stops only for a question, a budget, or a repeat', () => {
  it('stops while a question is open and reports it', () => {
    const p = started(project());
    loop.raiseQuestion(p, { personaId: 'ux', kind: 'mockup_acceptance', text: 'Aceita?' });
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'wait_human');
    assert.equal(decision.question.kind, 'mockup_acceptance');
  });

  it('pauses when the money cap is hit', () => {
    const p = started(project(), 'x', { maxCostUsd: 5 });
    // product_owner has no standing question, so the Execução is still running.
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 5 });
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'paused_budget');
  });

  it('halts when the same failure repeats, instead of retrying forever', () => {
    const signature = loop.failureSignature('developer', 'cannot resolve import Foo');
    const history = [
      done('product_owner'),
      { personaId: 'developer', outcome: 'failed', failureSignature: signature },
      { personaId: 'developer', outcome: 'failed', failureSignature: signature },
      { personaId: 'developer', outcome: 'failed', failureSignature: signature },
    ];
    const p = withHistory(started(project()), history);
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'halt');
    assert.equal(decision.repeated.personaId, 'developer');
  });

  it('keeps going when failures differ — those are progress, not a loop', () => {
    const history = [
      { personaId: 'developer', outcome: 'failed', failureSignature: loop.failureSignature('developer', 'missing import') },
      { personaId: 'developer', outcome: 'failed', failureSignature: loop.failureSignature('developer', 'type mismatch') },
      { personaId: 'developer', outcome: 'failed', failureSignature: loop.failureSignature('developer', 'null pointer') },
    ];
    assert.equal(loop.repeatedFailure(history), null);
  });

  it('refuses to call it complete when the Tech Lead produced nothing to build', () => {
    const history = ['product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead'].map((id) => done(id));
    const p = withHistory(started(project()), history);
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'halt');
    assert.match(decision.reason, /nenhuma unidade de implementacao/);
  });

  it('completes once the implementation units are all finished', () => {
    const history = [
      ...['product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead'].map((id) => done(id)),
      done('developer'),
    ];
    const p = withHistory(started(project()), history);
    workItems.setWorkItems(p, [workItems.normalizeWorkItem({
      id: 'task_0', title: 'Unidade', status: 'completed',
      executorMode: 'agent', agentType: 'code_implementation',
    }, { project: p })]);
    assert.equal(loop.decideNext(p).action, 'complete');
  });
});

describe('state transitions', () => {
  it('a persona that needs an answer stops the Execução and the clock', () => {
    const t0 = Date.now();
    const p = started(project(), 'x', { maxHours: 4 }, t0);
    loop.recordResult(p, { personaId: 'ux', outcome: 'completed', costUsd: 0.5 }, t0 + HOUR);

    const exec = loop.activeExecucao(p);
    assert.equal(exec.status, 'waiting_human');
    assert.equal(exec.question.kind, 'mockup_acceptance');
    assert.equal(budget.budgetState(exec.budget, t0 + 11 * HOUR).hours, 1);
  });

  it('answering resumes the clock and the chain', () => {
    const t0 = Date.now();
    const p = started(project(), 'x', { maxHours: 4 }, t0);
    loop.recordResult(p, { personaId: 'ux', outcome: 'completed' }, t0 + HOUR);
    loop.answerQuestion(p, { accepted: true }, t0 + 10 * HOUR);
    const exec = loop.activeExecucao(p);
    assert.equal(exec.status, 'running');
    assert.equal(exec.question, null);
    assert.equal(budget.budgetState(exec.budget, t0 + 11 * HOUR).hours, 2, 'only worked hours count');
  });

  it('rejecting sends the persona back rather than halting', () => {
    const p = started(project());
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed' });
    loop.recordResult(p, { personaId: 'ux', outcome: 'completed' });
    loop.answerQuestion(p, { accepted: false });
    const exec = loop.activeExecucao(p);
    assert.equal(exec.status, 'running');
    assert.equal(exec.history.some((entry) => entry.personaId === 'ux'), false);
    assert.equal(loop.decideNext(p).persona.id, 'ux');
  });

  it('halting and stopping both bank the clock', () => {
    const t0 = Date.now();
    const p = started(project(), 'x', { maxHours: 8 }, t0);
    loop.haltChain(p, 'motivo', t0 + HOUR);
    const exec = loop.activeExecucao(p);
    assert.equal(exec.status, 'halted');
    assert.equal(budget.budgetState(exec.budget, t0 + 9 * HOUR).hours, 1);
    assert.equal(loop.decideNext(p, { now: t0 + 9 * HOUR }).action, 'halt');
  });

  it('refuses to answer a question that was never asked', () => {
    assert.throws(() => loop.answerQuestion(started(project()), { accepted: true }), /pergunta em aberto/);
  });

  it('a halted Execução can be resumed by raising its cap', () => {
    const p = started(project(), 'x', { maxCostUsd: 5 });
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 5 });
    assert.equal(loop.decideNext(p).action, 'paused_budget');
    loop.stopChain(p, 'paused_budget');
    loop.startExecucao(p, { maxCostUsd: 20 });
    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'dispatch', 'raising the cap resumes the Execução');
    assert.equal(loop.activeExecucao(p).budget.spentUsd, 5, 'spend already incurred is not forgotten');
  });
});

describe('implementation units fan out to developer and tester', () => {
  function withUnits(statuses) {
    const p = withHistory(started(project()), ['product_owner', 'ux', 'module_architect', 'orchestrator', 'tech_lead'].map((id) => done(id)));
    workItems.setWorkItems(p, statuses.map((status, index) => workItems.normalizeWorkItem({
      id: `task_${index}`, title: `Unidade ${index}`, status,
      executorMode: 'agent', agentType: 'code_implementation',
      moduleName: 'Reservas', repositoryPaths: ['src/reservas'],
    }, { project: p })));
    return p;
  }

  it('dispatches the next pending unit to the developer', () => {
    const decision = loop.decideNext(withUnits(['ready', 'ready']));
    assert.equal(decision.persona.id, 'developer');
    assert.equal(decision.workItem.id, 'task_0');
    assert.equal(decision.remainingUnits, 2);
  });

  it('does not re-dispatch a unit already waiting for review', () => {
    const decision = loop.decideNext(withUnits(['waiting_review', 'ready']));
    assert.equal(decision.workItem.id, 'task_1');
  });

  it('moves on once every unit is finished', () => {
    assert.equal(loop.decideNext(withUnits(['completed', 'completed'])).action, 'complete');
  });

  it('raises the right question per persona', () => {
    const personas = require('../lib/agent-personas').listPersonas();
    const ux = personas.find((p) => p.id === 'ux');
    const developer = personas.find((p) => p.id === 'developer');
    assert.equal(loop.questionFor(ux).kind, 'mockup_acceptance');
    assert.match(loop.questionFor(ux).text, /frontend/);
    assert.equal(loop.questionFor(developer).kind, 'result_review');
  });
});
