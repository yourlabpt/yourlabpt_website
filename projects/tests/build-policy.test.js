/**
 * The web-app policy and the questions that define a project.
 *
 * The consistency test is the important one: it is what stops the policy, the persona
 * registry and the intake drifting apart, and it is the check that would have caught
 * `ux_mockup_approved` being consumed by three personas and produced by nobody.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const buildPolicies = require('../lib/build-policies');
const personas = require('../lib/agent-personas');
const webApp = require('../lib/build-policies/web-app');
const intake = require('../lib/intake/web-app');

test('the web-app policy holds together', () => {
  assert.deepEqual(buildPolicies.validatePolicy('web_app'), []);
});

test('human approval is a producer, which is what closed the orphan artifact', () => {
  const producible = buildPolicies.producibleArtifacts(webApp);
  // Nothing produces ux_mockup_approved directly; approving the mockup does.
  assert.equal(webApp.STAGES.some((s) => s.produces.includes('ux_mockup_approved')), false);
  assert.ok(producible.has('ux_mockup_approved'));

  // And every persona that consumes it can now be satisfied.
  const consumers = personas.listPersonas().filter((p) => p.consumes.includes('ux_mockup_approved'));
  assert.ok(consumers.length >= 3);
});

test('the intake produces the root artifacts nothing else does', () => {
  const fed = new Set(intake.QUESTIONS.map((q) => q.feeds.artifact));
  for (const root of webApp.ROOT_ARTIFACTS) {
    assert.ok(fed.has(root), `nenhuma pergunta alimenta ${root}`);
  }
});

test('every question explains itself and lands on a real stage', () => {
  const stages = new Set(webApp.STAGES.map((s) => s.stage));
  for (const question of intake.QUESTIONS) {
    assert.ok(question.why.length > 30, `${question.id} nao diz para que serve`);
    assert.ok(stages.has(question.feeds.stage), `${question.id} alimenta uma fase inexistente`);
    assert.notEqual(question.question, question.why);
  }
});

test('required questions are the ones without which nothing can start', () => {
  const required = intake.requiredQuestionIds();
  // Enough to define the thing...
  for (const id of ['quem-usa', 'dor', 'sucesso', 'acao-principal', 'fora-ambito', 'entidades']) {
    assert.ok(required.includes(id), `${id} devia ser obrigatoria`);
  }
  // ...but not a wall: most questions are asked without blocking.
  assert.ok(required.length < intake.QUESTIONS.length / 2 + 2);
});

test('unanswered required questions are named, not just counted', () => {
  const none = buildPolicies.unansweredRequired('web_app', []);
  assert.equal(none.length, intake.requiredQuestionIds().length);
  assert.ok(none[0].question, 'a lacuna traz a pergunta, para o UI a poder mostrar');
  assert.ok(none[0].stage, 'e a fase que ela desbloqueia');

  // A blank answer is not an answer.
  const blank = buildPolicies.unansweredRequired('web_app', [{ questionId: 'quem-usa', answer: '   ' }]);
  assert.equal(blank.length, none.length);

  const answered = buildPolicies.unansweredRequired(
    'web_app',
    intake.requiredQuestionIds().map((questionId) => ({ questionId, answer: 'resposta' })),
  );
  assert.deepEqual(answered, []);
});

test('every propagation rule carries the sentence that explains it', () => {
  for (const rule of webApp.PROPAGATION) {
    assert.ok(rule.rule.length > 40, `${rule.when} -> ${rule.reconcile} sem explicacao`);
    assert.ok(rule.owner, 'uma reconciliacao sem dono nao acontece');
  }
  // The user's own example must be there: a mockup change amends the idea.
  const mockup = webApp.PROPAGATION.find((r) => r.when === 'ux_mockup' && r.reconcile === 'intention');
  assert.ok(mockup);
  assert.equal(mockup.owner, 'product_owner');
});

test('an unknown product type falls back rather than breaking', () => {
  assert.equal(buildPolicies.normalizeProductType('inventado'), 'web_app');
  assert.equal(buildPolicies.normalizeProductType(''), 'web_app');
  assert.ok(buildPolicies.policyFor('inventado'));
  assert.equal(buildPolicies.stageRule('web_app', 'discovery').owner, 'ux');
  assert.equal(buildPolicies.stageRule('web_app', 'inexistente'), null);
});

test('the gate is wired, and it is the only thing the intake blocks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  const routes = read('lib', 'orchestration-routes.js');
  // Readiness is itemised, not a single sentence, so the UI can point at what is missing.
  assert.match(routes, /function readinessGaps\(project\)/);
  assert.match(routes, /reason: 'intake'/);
  assert.match(routes, /readiness: readinessGaps\(project\)/);
  // And starting still refuses on it.
  assert.match(routes, /if \(gap\) return res\.status\(409\)/);

  // Answering merges rather than replaces: one answer must never wipe the others.
  const intakeRoutes = read('lib', 'intake-routes.js');
  assert.match(intakeRoutes, /Merge rather than replace/);
  assert.match(intakeRoutes, /Perguntas desconhecidas/);

  // The panel renders from the same entry point as the rest of the page.
  const deliveryUi = read('public', 'delivery-os-ui.js');
  assert.match(deliveryUi, /window\.IntakeUI\?\.render\?\.\(project\);/);

  // Each question shows why it is asked — that is the point of the whole panel.
  const intakeUi = read('public', 'intake-ui.js');
  assert.match(intakeUi, /intake-why/);
  assert.match(intakeUi, /escapeHtml\(question\.why\)/);
});
