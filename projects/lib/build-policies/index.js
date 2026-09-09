/**
 * Build policies by product type, and the checks that keep one honest.
 *
 * A policy is only useful while it agrees with the persona registry and the intake it
 * references. `validatePolicy` is what stops the two drifting apart silently — it is the
 * check that would have caught `ux_mockup_approved` being consumed by three personas and
 * produced by nobody.
 */
const agentPersonas = require('../agent-personas');
const webApp = require('./web-app');
const webAppIntake = require('../intake/web-app');

const POLICIES = { [webApp.PRODUCT_TYPE]: webApp };
const INTAKES = { [webApp.PRODUCT_TYPE]: webAppIntake };

const DEFAULT_PRODUCT_TYPE = webApp.PRODUCT_TYPE;

function normalizeProductType(value) {
  const raw = String(value || '').trim();
  return POLICIES[raw] ? raw : DEFAULT_PRODUCT_TYPE;
}

function policyFor(productType) {
  return POLICIES[normalizeProductType(productType)];
}

function intakeFor(productType) {
  return INTAKES[normalizeProductType(productType)];
}

function stageRule(productType, stageId) {
  return policyFor(productType).STAGES.find((entry) => entry.stage === String(stageId || '')) || null;
}

/** Every artifact this policy can bring into existence, however it is produced. */
function producibleArtifacts(policy) {
  const produced = new Set(policy.ROOT_ARTIFACTS);
  for (const stage of policy.STAGES) {
    for (const artifact of stage.produces) produced.add(artifact);
    // Approval is a producer too: it is what turns `ux_mockup` into `ux_mockup_approved`.
    for (const artifact of Object.values(stage.approvalTransforms || {})) produced.add(artifact);
  }
  return produced;
}

/**
 * Reasons this policy does not hold together. Empty means it does. Run as a test, not
 * at boot: a policy that fails these is a bug to fix, not a condition to handle.
 */
function validatePolicy(productType = DEFAULT_PRODUCT_TYPE) {
  const policy = policyFor(productType);
  const intake = intakeFor(productType);
  const problems = [];

  const personaIds = new Set(agentPersonas.listPersonas().map((persona) => persona.id));
  const producible = producibleArtifacts(policy);
  const questionIds = new Set(intake.QUESTIONS.map((entry) => entry.id));

  for (const stage of policy.STAGES) {
    if (!personaIds.has(stage.owner)) {
      problems.push(`fase ${stage.stage}: dono desconhecido "${stage.owner}"`);
    }
    if (!stage.doneWhen) problems.push(`fase ${stage.stage}: sem definicao de concluido`);
    for (const questionId of stage.requiresAnswered) {
      if (!questionIds.has(questionId)) {
        problems.push(`fase ${stage.stage}: exige a pergunta inexistente "${questionId}"`);
      }
    }
  }

  // Every artifact a persona expects must be able to exist. This is the drift check.
  for (const persona of agentPersonas.listPersonas()) {
    for (const artifact of persona.consumes) {
      if (!producible.has(artifact)) {
        problems.push(`${persona.id} consome "${artifact}", que nada produz`);
      }
    }
  }

  for (const rule of policy.PROPAGATION) {
    if (!producible.has(rule.when)) problems.push(`propagacao: "${rule.when}" nao existe`);
    if (!producible.has(rule.reconcile)) problems.push(`propagacao: "${rule.reconcile}" nao existe`);
    if (!personaIds.has(rule.owner)) problems.push(`propagacao ${rule.when}: dono desconhecido "${rule.owner}"`);
    if (!rule.rule) problems.push(`propagacao ${rule.when}: sem regra escrita`);
  }

  for (const question of intake.QUESTIONS) {
    const stage = policy.STAGES.find((entry) => entry.stage === question.feeds?.stage);
    if (!stage) problems.push(`pergunta ${question.id}: alimenta a fase inexistente "${question.feeds?.stage}"`);
    if (!question.why) problems.push(`pergunta ${question.id}: nao diz para que serve`);
  }

  return problems;
}

/**
 * Which required questions are still unanswered. The Execução gate, and the only place
 * an unanswered question blocks anything.
 */
function unansweredRequired(productType, answers = []) {
  const intake = intakeFor(productType);
  const answered = new Set(
    (Array.isArray(answers) ? answers : [])
      .filter((entry) => String(entry?.answer || '').trim())
      .map((entry) => entry.questionId),
  );
  return intake.QUESTIONS
    .filter((entry) => entry.required && !answered.has(entry.id))
    .map((entry) => ({ id: entry.id, question: entry.question, stage: entry.feeds?.stage || '' }));
}

module.exports = {
  DEFAULT_PRODUCT_TYPE,
  intakeFor,
  normalizeProductType,
  policyFor,
  producibleArtifacts,
  stageRule,
  unansweredRequired,
  validatePolicy,
};
