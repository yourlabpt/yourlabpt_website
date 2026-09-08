const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDriver } = require('../lib/orchestration-driver');
const loop = require('../lib/orchestration-loop');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-driver-'));

function harness() {
  const project = { id: 'prj_1', name: 'Reservas', workItems: [], agentJobs: [], execucoes: [] };
  const store = { projects: [project], activity: [] };
  const started = [];
  const control = { failWith: 0 };

  const driver = createDriver({
    updateStore: async (fn) => { await fn(store); },
    appendActivity: (s, e) => { s.activity.push(e); },
    startAgentRun: async (input) => {
      started.push(input);
      if (control.failWith) {
        const status = control.failWith;
        control.failWith = 0;
        return { status, body: { message: 'runtime indisponivel' } };
      }
      return { status: 201, body: { agentJob: { id: `job_${started.length}` } } };
    },
    dataDir,
    nowIso: () => new Date().toISOString(),
  });

  return { project, store, started, control, driver };
}

/** Completes whatever is in flight, which is what advances the chain. */
async function finishCurrent(h, extra = {}) {
  const current = loop.activeExecucao(h.project);
  return h.driver.recordAndAdvance('prj_1', {
    personaId: current.currentPersonaId,
    workItemId: current.currentWorkItemId,
    outcome: 'completed',
    costUsd: 0.4,
    ...extra,
  }, 'u1');
}

describe('the chain runs without a click', () => {
  let h;
  beforeEach(() => { h = harness(); });

  it('dispatches through the extracted run-start, not a second path', async () => {
    loop.startExecucao(h.project, { goal: 'Construir reservas', maxCostUsd: 20, maxHours: 4 });
    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.action, 'dispatch');
    assert.equal(result.dispatch.personaId, 'product_owner');
    assert.equal(h.started.length, 1);
    assert.equal(h.started[0].agentType, 'spec_authoring');
    assert.equal(h.started[0].workItemId, result.dispatch.workItemId);
  });

  it('advances itself when a run finishes', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 20 });
    await h.driver.advanceOnce('prj_1', 'u1');
    const result = await finishCurrent(h);
    assert.equal(result.advanced, true);
    assert.equal(result.dispatch.personaId, 'ux', 'the next persona starts on its own');
    assert.equal(h.started.length, 2);
  });

  it('stops at the mockup question and dispatches nothing further', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 20 });
    await h.driver.advanceOnce('prj_1', 'u1');
    await finishCurrent(h);
    const startedBefore = h.started.length;
    await finishCurrent(h);

    const exec = loop.activeExecucao(h.project);
    assert.equal(exec.status, 'waiting_human');
    assert.equal(exec.question.kind, 'mockup_acceptance');
    assert.equal(h.started.length, startedBefore, 'nothing dispatched while it waits');
    assert.equal(exec.budget.runningSince, '', 'the clock is frozen while it waits');
  });

  it('resumes unattended once the question is answered', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 20 });
    await h.driver.advanceOnce('prj_1', 'u1');
    await finishCurrent(h);
    await finishCurrent(h);
    loop.answerQuestion(h.project, { accepted: true });

    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.dispatch.personaId, 'module_architect');
  });

  it('accumulates spend across the whole Execução, not per persona', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 20 });
    await h.driver.advanceOnce('prj_1', 'u1');
    await finishCurrent(h, { costUsd: 1 });
    await finishCurrent(h, { costUsd: 2 });
    assert.equal(loop.activeExecucao(h.project).budget.spentUsd, 3);
  });
});

describe('the chain stops itself', () => {
  let h;
  beforeEach(() => { h = harness(); });

  it('dispatches nothing once the money cap is hit', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 1 });
    await h.driver.advanceOnce('prj_1', 'u1');
    const startedBefore = h.started.length;
    await finishCurrent(h, { costUsd: 5 });

    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.action, 'paused_budget');
    assert.equal(h.started.length, startedBefore, 'an exhausted budget starts no more runs');
    assert.equal(loop.activeExecucao(h.project).status, 'paused_budget');
  });

  it('records a runtime failure instead of losing it', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 20 });
    h.control.failWith = 502;
    const result = await h.driver.advanceOnce('prj_1', 'u1');

    assert.equal(result.action, 'dispatch_failed');
    const history = loop.activeExecucao(h.project).history;
    const last = history[history.length - 1];
    assert.equal(last.outcome, 'failed');
    assert.ok(last.failureSignature, 'a signature is needed for repeat detection');
  });

  it('halts rather than retrying when the same dispatch keeps failing', async () => {
    loop.startExecucao(h.project, { goal: 'x', maxCostUsd: 50 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      h.control.failWith = 502;
      await h.driver.advanceOnce('prj_1', 'u1');
    }
    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.action, 'halt');
    assert.equal(loop.activeExecucao(h.project).status, 'halted');
  });

  it('does nothing on a project with no Execução started', async () => {
    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.action, 'idle');
    assert.equal(h.started.length, 0);
  });

  it('does not advance a project whose Execução is not running', async () => {
    const result = await h.driver.recordAndAdvance('prj_1', {
      personaId: 'developer', outcome: 'completed',
    }, 'u1');
    assert.equal(result.advanced, false);
    assert.equal(h.started.length, 0);
  });

  it('leaves a halted Execução halted', async () => {
    loop.startExecucao(h.project, { goal: 'x' });
    loop.haltChain(h.project, 'motivo');
    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.action, 'halt');
    assert.equal(h.started.length, 0);
  });

  it('resuming a halted Execução by raising its cap lets it dispatch again', async () => {
    loop.startExecucao(h.project, { goal: 'x' });
    loop.haltChain(h.project, 'motivo');
    loop.startExecucao(h.project, { maxCostUsd: 50 });
    const result = await h.driver.advanceOnce('prj_1', 'u1');
    assert.equal(result.action, 'dispatch');
  });
});
