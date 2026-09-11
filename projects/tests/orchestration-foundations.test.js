/**
 * The five things that were quietly broken underneath the chain.
 *
 * Each of these looked like it worked: a budget cap that was displayed and never
 * enforced, a coordination container that read as dispatchable work, an origin that was
 * silently rewritten, a parent status that depended on array order. None of them fail
 * loudly, which is why they need tests rather than a careful reading.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const loop = require('../lib/orchestration-loop');
const workItems = require('../lib/work-items');
const agentPersonas = require('../lib/agent-personas');

function project(over = {}) {
  const base = { id: 'prj_1', name: 'Reservas', workItems: [], execucoes: [], ...over };
  workItems.setWorkItems(base, workItems.getWorkItems(base));
  return base;
}

describe('spend reaches the budget', () => {
  it('accumulates what each run reports, so the cap can actually be reached', () => {
    const p = project();
    loop.startExecucao(p, { goal: 'Construir', maxCostUsd: 5, maxHours: 0 });
    loop.markDispatched(p, { personaId: 'product_owner', workItemId: 'w1' });
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 2.5, seconds: 30 });

    const exec = loop.activeExecucao(p);
    assert.equal(exec.budget.spentUsd, 2.5);
    assert.equal(exec.history.at(-1).costUsd, 2.5);
    assert.equal(exec.history.at(-1).seconds, 30);
  });

  it('pauses the Execução once reported spend passes the cap', () => {
    const p = project();
    loop.startExecucao(p, { goal: 'Construir', maxCostUsd: 3, maxHours: 0 });
    loop.markDispatched(p, { personaId: 'product_owner', workItemId: 'w1' });
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed', costUsd: 4 });

    const decision = loop.decideNext(p);
    assert.equal(decision.action, 'paused_budget');
    assert.match(decision.budget.reason, /custo/);
  });

  it('a run that reports nothing costs nothing rather than guessing', () => {
    const p = project();
    loop.startExecucao(p, { goal: 'Construir', maxCostUsd: 5, maxHours: 0 });
    loop.markDispatched(p, { personaId: 'product_owner', workItemId: 'w1' });
    loop.recordResult(p, { personaId: 'product_owner', outcome: 'completed' });

    assert.equal(loop.activeExecucao(p).budget.spentUsd, 0);
  });
});

describe('which engine ran survives a round trip', () => {
  it('records the model and provider on the history entry', () => {
    const p = project();
    loop.startExecucao(p, { goal: 'Construir' });
    loop.markDispatched(p, { personaId: 'developer', workItemId: 'w1' });
    loop.recordResult(p, {
      personaId: 'developer',
      outcome: 'failed',
      failureMessage: 'sem saida',
      modelProfileId: 'small',
      llmProvider: 'ollama',
    });

    // Re-normalising is where a field that is not in the whitelist disappears.
    const reloaded = loop.normalizeExecucao(loop.activeExecucao(p));
    const entry = reloaded.history.at(-1);
    assert.equal(entry.modelProfileId, 'small');
    assert.equal(entry.llmProvider, 'ollama');
  });

  it('falls back to the persona profile when the caller does not say', () => {
    const p = project();
    loop.startExecucao(p, { goal: 'Construir' });
    loop.markDispatched(p, { personaId: 'tech_lead', workItemId: 'w1' });
    loop.recordResult(p, { personaId: 'tech_lead', outcome: 'completed' });

    const expected = agentPersonas.resolvePersona('tech_lead', {}).modelProfileId;
    assert.equal(loop.activeExecucao(p).history.at(-1).modelProfileId, expected);
  });
});

describe('a coordination item is a container, not work', () => {
  it('is never offered as a unit to dispatch', () => {
    const developer = agentPersonas.resolvePersona('developer', {});
    const p = project({
      workItems: [
        {
          id: 'parent', title: 'Plano', taskRole: 'coordination',
          agentType: developer.taskTypes[0], status: 'ready', executorMode: 'agent',
        },
        {
          id: 'child', title: 'Unidade', taskRole: 'execution', parentTaskId: 'parent',
          agentType: developer.taskTypes[0], status: 'ready', executorMode: 'agent',
        },
      ],
    });

    const units = loop.pendingUnitsFor(p, developer);
    assert.deepEqual(units.map((item) => item.id), ['child']);
  });
});

describe('tasks the chain creates are not filed as human work', () => {
  it('uses a real origin instead of one that gets silently rewritten', () => {
    const item = workItems.normalizeWorkItem({ id: 't1', title: 'X', origin: 'platform' });
    assert.equal(item.origin, 'platform');
    // The bug: an unknown origin does not throw, it becomes 'human'.
    assert.equal(workItems.normalizeWorkItem({ id: 't2', title: 'X', origin: 'orchestration' }).origin, 'human');
  });
});

describe('parent status does not depend on array order', () => {
  const tree = [
    { id: 'epic', title: 'Epic', taskRole: 'coordination', executorMode: 'agent' },
    { id: 'feature', title: 'Feature', taskRole: 'coordination', parentTaskId: 'epic', executorMode: 'agent' },
    { id: 'task-a', title: 'A', taskRole: 'execution', parentTaskId: 'feature', status: 'completed' },
    { id: 'task-b', title: 'B', taskRole: 'execution', parentTaskId: 'feature', status: 'completed' },
  ];

  function statuses(order) {
    const items = workItems.normalizeWorkItems(order.map((id) => tree.find((entry) => entry.id === id)));
    return Object.fromEntries(items.map((item) => [item.id, item.status]));
  }

  it('settles on the same answer at three levels whichever way the list is sorted', () => {
    const parentsFirst = statuses(['epic', 'feature', 'task-a', 'task-b']);
    const childrenFirst = statuses(['task-a', 'task-b', 'feature', 'epic']);

    assert.deepEqual(parentsFirst, childrenFirst);
    // And the answer is the correct one: both tasks are done, so everything above is.
    assert.equal(parentsFirst.feature, 'completed');
    assert.equal(parentsFirst.epic, 'completed');
  });
});
