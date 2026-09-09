/**
 * What else a change puts in doubt.
 *
 * Two directions, and only one of them is declarable.
 *
 * **Downstream** is derived. If an artifact changes, everything built on it may no
 * longer hold, and `consumes`/`produces` already says who built on it. Nobody has to
 * write that down.
 *
 * **Upstream** is judgement. No graph can tell you that a new screen means the idea was
 * incomplete rather than the screen being wrong — so those rules are written by hand in
 * the build policy, each carrying the sentence that explains it. The persona receives
 * the sentence, not just an instruction.
 *
 * Nothing here decides anything or writes anything. It answers "who has to look at
 * this, and why", and the answer becomes a decision on a task for a person to rule on.
 */
const agentPersonas = require('./agent-personas');
const buildPolicies = require('./build-policies');

function ensureArray(value) { return Array.isArray(value) ? value : []; }

/**
 * The names one artifact travels under. Approving a mockup produces
 * `ux_mockup_approved`, and the personas downstream consume that name, not the original
 * — so a change to `ux_mockup` has to follow the transform to find them.
 */
function formsOf(policy, artifact) {
  const forms = new Set([artifact]);
  for (const stage of policy.STAGES) {
    const transforms = stage.approvalTransforms || {};
    if (transforms[artifact]) forms.add(transforms[artifact]);
  }
  return forms;
}

/** The stage that brings this artifact into existence, if any does. */
function stageProducing(policy, artifact) {
  return policy.STAGES.find((stage) => (
    stage.produces.includes(artifact)
    || Object.values(stage.approvalTransforms || {}).includes(artifact)
  )) || null;
}

/** The persona accountable for it — the owner of the stage that produces it. */
function producerOf(productType, artifact) {
  const stage = stageProducing(buildPolicies.policyFor(productType), artifact);
  return stage ? stage.owner : '';
}

/**
 * Everything a change to this artifact touches.
 *
 * `upstream` is what may no longer be true behind it; `downstream` is what was built on
 * it. Both name a persona, because an impact nobody owns is not going to be reconciled.
 */
function impactOf(productType, artifact) {
  const policy = buildPolicies.policyFor(productType);
  const forms = formsOf(policy, artifact);
  const personas = agentPersonas.listPersonas().filter((persona) => persona.enabled);

  const upstream = policy.PROPAGATION
    .filter((rule) => rule.when === artifact)
    .map((rule) => ({
      personaId: rule.owner,
      artifact: rule.reconcile,
      // What moved, as distinct from what it puts in doubt. A decision needs both.
      sourceArtifact: artifact,
      direction: 'upstream',
      rule: rule.rule,
    }));

  const downstream = personas
    .filter((persona) => persona.consumes.some((entry) => forms.has(entry)))
    // Whoever produced the artifact is not downstream of their own change.
    .filter((persona) => persona.id !== producerOf(productType, artifact))
    .map((persona) => ({
      personaId: persona.id,
      artifact,
      sourceArtifact: artifact,
      direction: 'downstream',
      rule: `${persona.label} construiu sobre ${artifact}. Verifique se o que produziu continua a servir depois desta alteracao.`,
    }));

  return { artifact, producer: producerOf(productType, artifact), upstream, downstream };
}

/**
 * Who has to run, in what order, to absorb a change to this artifact — and why each of
 * them is in the list.
 *
 * The producer goes first because the change is theirs to make. Then reconciliation
 * before rebuilding: correcting the idea and then building on the corrected idea is the
 * point, and doing it the other way round rebuilds on something already known to be
 * wrong. Within each group, the pipeline's own order.
 */
function reconcilePlan(productType, artifact) {
  const impact = impactOf(productType, artifact);
  const order = new Map(agentPersonas.listPersonas().map((persona) => [persona.id, persona.order]));
  const byOrder = (left, right) => (order.get(left.personaId) || 0) - (order.get(right.personaId) || 0);

  const steps = [];
  const seen = new Set();
  const push = (step) => {
    if (!step.personaId || seen.has(step.personaId)) return;
    seen.add(step.personaId);
    steps.push(step);
  };

  if (impact.producer) {
    push({
      personaId: impact.producer,
      artifact,
      direction: 'produces',
      rule: `A alteracao a ${artifact} e sua para fazer.`,
    });
  }
  [...impact.upstream].sort(byOrder).forEach(push);
  [...impact.downstream].sort(byOrder).forEach(push);
  return steps;
}

/**
 * Is this artifact part of a stage a human already signed off?
 *
 * That is the one case where reconciliation stops and asks, instead of recording and
 * carrying on: rewriting something already approved without saying so would make the
 * approval meaningless.
 */
function isArtifactApproved(project, productType, artifact) {
  const stage = stageProducing(buildPolicies.policyFor(productType), artifact);
  if (!stage) return false;
  const record = ensureArray(project?.stages).find((entry) => entry.id === stage.stage);
  return Boolean(record?.approvedAt);
}

module.exports = {
  formsOf,
  impactOf,
  isArtifactApproved,
  producerOf,
  reconcilePlan,
  stageProducing,
};
