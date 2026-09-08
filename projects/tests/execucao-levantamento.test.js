/**
 * Two ways into the factory. A levantamento describes an app that already exists, so
 * it runs a shorter chain and must not be accepted without a person looking at it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const loop = require('../lib/orchestration-loop');

function newProject() {
  return { id: 'prj_1', name: 'App existente', workItems: [], execucoes: [] };
}

/** Drives the chain, answering nothing, and returns the sequence of decisions. */
function runChain(project, { answer = false, steps = 14 } = {}) {
  const seen = [];
  for (let i = 0; i < steps; i += 1) {
    const decision = loop.decideNext(project);
    seen.push(decision.action + (decision.persona ? `:${decision.persona.id}` : ''));
    if (decision.action === 'wait_human') {
      if (!answer) break;
      loop.answerQuestion(project, { accepted: true });
      continue;
    }
    if (decision.action !== 'dispatch') break;
    loop.markDispatched(project, decision.persona, { id: `t${i}` });
    loop.recordResult(project, { personaId: decision.persona.id, workItemId: `t${i}`, outcome: 'completed' });
  }
  return seen;
}

test('an Execução is a construção unless it says otherwise', () => {
  const project = newProject();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 10, maxHours: 2 });
  assert.equal(loop.activeExecucao(project).kind, 'construcao');
});

test('an unknown kind falls back to construção rather than running no personas', () => {
  const project = newProject();
  loop.startExecucao(project, { goal: 'x', kind: 'inventado', maxCostUsd: 10, maxHours: 2 });
  assert.equal(loop.activeExecucao(project).kind, 'construcao');
});

test('a levantamento runs only the personas that read and describe', () => {
  const project = newProject();
  loop.startExecucao(project, { goal: 'Levantar', kind: 'levantamento', maxCostUsd: 10, maxHours: 2 });

  const seen = runChain(project);

  // No UX step: there is nothing to mock up for an app that already runs.
  assert.deepEqual(seen, ['dispatch:product_owner', 'dispatch:module_architect', 'wait_human']);
});

test('a levantamento is never accepted just because the chain finished', () => {
  const project = newProject();
  loop.startExecucao(project, { goal: 'Levantar', kind: 'levantamento', maxCostUsd: 10, maxHours: 2 });
  runChain(project);

  const execucao = loop.activeExecucao(project);
  assert.equal(execucao.status, 'waiting_human');
  assert.equal(execucao.question.kind, 'survey_acceptance');
  assert.match(execucao.question.text, /requisitos e este mapa de modulos/);

  // Only the person's answer completes it.
  loop.answerQuestion(project, { accepted: true });
  assert.equal(loop.decideNext(project).action, 'complete');
});

test('the construção chain still starts from the idea and keeps the mockup gate', () => {
  const project = newProject();
  loop.startExecucao(project, { goal: 'Construir', maxCostUsd: 50, maxHours: 10 });

  const seen = runChain(project, { answer: true });

  assert.deepEqual(seen.slice(0, 4), [
    'dispatch:product_owner', 'dispatch:ux', 'wait_human', 'dispatch:module_architect',
  ]);
});

test('the kind survives a round-trip through storage', () => {
  const project = newProject();
  loop.startExecucao(project, { goal: 'Levantar', kind: 'levantamento', maxCostUsd: 10, maxHours: 2 });
  const reloaded = loop.normalizeExecucoes(JSON.parse(JSON.stringify(project)));
  assert.equal(reloaded[0].kind, 'levantamento');
});

test('a persona that only reads gets the repository without any write rules', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agent-runtime-routes.js'), 'utf8');

  // Read access follows the declared tool, not the ability to write code.
  assert.match(source, /readsRepository = ensureArray\(runningPersona\?\.defaultTools\)\.includes\('repo\.read'\)/);
  assert.match(source, /const linkedRepository = \(codePersona \|\| readsRepository\)/);
  // The survey travels with it: that is what makes deriving requirements possible.
  assert.match(source, /survey: project\.repositorySurvey \|\| null/);
  // A reader is told not to invent, and never handed the commit instructions.
  assert.match(source, /Nao escreves codigo/);
  assert.match(source, /nao inventes funcionalidades/);

  // Writing still depends on canWriteCode, which read access does not grant.
  const commit = fs.readFileSync(path.join(__dirname, '..', 'lib', 'work-items-routes.js'), 'utf8');
  assert.match(commit, /if \(!persona\?\.canWriteCode\) return null;/);
});
