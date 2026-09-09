/**
 * What a persona is told before it starts.
 *
 * The policy already says what each stage must produce, when it counts as done, and
 * what a change to its output puts in doubt. None of that reached the agent, which had
 * to infer the method from the prompt — and inferring the method is exactly how an agent
 * ends up building something plausible that nobody asked for.
 *
 * This assembles it: the rule for the stage being worked, the consequences of changing
 * what it produces, and whatever knowledge the operator has attached to that persona.
 * Facts and rules only — no instructions about *how* to think, which is the persona's
 * own business.
 */
const buildPolicies = require('./build-policies');
const changePropagation = require('./change-propagation');

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function textOr(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

/**
 * The structured briefing. Sent as data so a runtime can use it however it likes; the
 * markdown below is for runtimes that just want prose.
 */
function buildBriefing(project, persona, { stageId = '', reconcile = null } = {}) {
  if (!persona) return null;
  const productType = buildPolicies.normalizeProductType(project?.productType);
  const stage = textOr(stageId, persona.deliveryStages[0]);
  const rule = buildPolicies.stageRule(productType, stage);

  // What happens if this persona changes what it is here to produce. Telling it up
  // front is what turns "I changed the mockup" into "I changed the mockup, and the idea
  // now has to say so".
  const consequences = [];
  for (const artifact of rule?.produces || []) {
    for (const entry of changePropagation.impactOf(productType, artifact).upstream) {
      consequences.push({
        ifYouChange: artifact,
        thenReconsider: entry.artifact,
        owner: entry.personaId,
        rule: entry.rule,
      });
    }
  }

  return {
    productType,
    stage,
    // What this stage is for, in the policy's own words.
    doneWhen: rule?.doneWhen || '',
    mustProduce: rule?.produces || [],
    // Approving turns one artifact into another; the persona should know its output is
    // not final until a person says so.
    approvalTransforms: rule?.approvalTransforms || {},
    consequences,
    // Present only on a refinamento: why this persona is running out of sequence.
    reconcile: reconcile
      ? {
        changed: reconcile.sourceArtifact || reconcile.artifact,
        reconsider: reconcile.artifact,
        direction: reconcile.direction,
        rule: reconcile.rule,
      }
      : null,
    knowledge: ensureArray(persona.knowledge),
  };
}

/** The same thing as prose, for a runtime that would rather be told than parse. */
function briefingToMarkdown(briefing) {
  if (!briefing) return '';
  const lines = [];

  if (briefing.reconcile) {
    lines.push('## Porque esta a correr agora');
    lines.push(`\`${briefing.reconcile.changed}\` mudou, e isso poe \`${briefing.reconcile.reconsider}\` em causa.`);
    lines.push('');
    lines.push(briefing.reconcile.rule);
    lines.push('');
    lines.push('Ajuste o que for preciso e nao mais do que isso. O resto do que ja esta construido fica como esta.');
    lines.push('');
  }

  if (briefing.doneWhen) {
    lines.push('## Quando e que esta fase esta concluida');
    lines.push(briefing.doneWhen);
    lines.push('');
  }

  if (briefing.mustProduce.length) {
    lines.push('## O que esta fase tem de produzir');
    for (const artifact of briefing.mustProduce) lines.push(`- \`${artifact}\``);
    lines.push('');
  }

  const approvals = Object.entries(briefing.approvalTransforms);
  if (approvals.length) {
    lines.push('## Aprovacao');
    for (const [from, to] of approvals) {
      lines.push(`- \`${from}\` so se torna \`${to}\` depois de uma pessoa o aceitar. Nao assuma que esta aceite.`);
    }
    lines.push('');
  }

  if (briefing.consequences.length) {
    lines.push('## Se mudar alguma destas coisas');
    for (const entry of briefing.consequences) {
      lines.push(`- Mexer em \`${entry.ifYouChange}\` obriga a reconsiderar \`${entry.thenReconsider}\` (${entry.owner}).`);
      lines.push(`  ${entry.rule}`);
    }
    lines.push('');
  }

  if (briefing.knowledge.length) {
    lines.push('## O que ja sabemos');
    for (const entry of briefing.knowledge) {
      lines.push(`### ${entry.title}`);
      lines.push(entry.markdown);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

module.exports = { buildBriefing, briefingToMarkdown };
