/**
 * How the platform knows something moved.
 *
 * A snapshot is what an agent saw; a fingerprint is a cheap way to ask whether it has
 * changed since. This started life inside stage transitions and is shared now because
 * the same question — *is what I built on still true?* — belongs to the persona chain
 * too, and to any future regeneration.
 *
 * The point that makes it worth sharing: **a human edit and an agent edit are the same
 * event.** Both move the snapshot. Nothing here asks who changed something, which is
 * exactly why a hand-edited idea is picked up on the next run instead of being
 * overwritten by whatever the AI last produced.
 */
const crypto = require('crypto');

function ensureArray(value) { return Array.isArray(value) ? value : []; }

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

/** Key order is not a change, so sort before hashing. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => { out[key] = stable(value[key]); return out; }, {});
  }
  return value;
}

function fingerprint(value) {
  return hash(JSON.stringify(stable(value)));
}

/**
 * What each stage reads and writes, as far as change detection is concerned.
 *
 * Only fields a person or a persona can actually change belong here. Adding a field
 * makes the platform newly sensitive to it; leaving one out means an edit to it is
 * invisible, and work built on it will not be recognised as stale.
 */
function stageSources(project) {
  return {
    idea: {
      originalIdeaText: project.originalIdeaText,
      vision: project.vision,
      ideaBriefMarkdown: project.ideaBriefMarkdown,
      // The answers that define the project are part of the idea. Editing one is an
      // edit to the brief, so everything derived from it becomes suspect — which is
      // the whole reason the intake and the chain have to share a snapshot.
      intake: ensureArray(project.intake?.answers)
        .map((row) => ({ questionId: row.questionId, answer: row.answer }))
        .sort((left, right) => left.questionId.localeCompare(right.questionId)),
    },
    discovery: {
      discovery: project.discovery,
      businessObjectives: project.businessObjectives,
      stakeholders: project.stakeholders,
      // The mockup is what Discovery exists to produce. Without it here, changing a
      // mockup would be invisible — and that is precisely the change the policy sends
      // back up into the idea.
      //
      // Only *approved* mockups count. A Camada 0 session iterates many times and is
      // meant to be free to do so; if every turn moved this fingerprint, iterating on
      // the next Epic would mark the current Execução's personas stale and halt it at
      // STALE_RERUN_LIMIT. Approval is the one moment the rest of the chain should
      // notice, and it is also exactly the ux_mockup → ux_mockup_approved transform the
      // build policy already declares.
      mockups: ensureArray(project.diagramArtifacts)
        .filter((row) => String(row?.kind || '') === 'mockup' && row?.mockupIterationId)
        .map((row) => ({ id: row.id, title: row.title, iterationId: row.mockupIterationId }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    },
    requirements: {
      requirements: ensureArray(project.requirements).map((row) => ({
        id: row.id, type: row.type, title: row.title, shall: row.shall,
        status: row.status, updatedAt: row.updatedAt,
        phase: row.implementationPhase || row.phase,
      })),
    },
    architecture: {
      diagrams: project.diagramArtifacts,
      capabilities: project.capabilities,
      technicalApproach: project.technicalApproach,
    },
    roadmap: { roadmap: project.roadmap, phases: project.phases },
    implementation: { implementation: project.implementation },
    validation: {
      validation: project.validation,
      testCases: ensureArray(project.requirements).filter((row) => row.type === 'test_case'),
    },
    delivery: {
      documents: ensureArray(project.documents)
        .map((row) => ({ id: row.id, title: row.title, stageId: row.deliveryStageId, updatedAt: row.updatedAt })),
    },
    operations: { operations: project.operations },
  };
}

/**
 * Includes `updatedAt`, so any save counts as a change. Correct for a stage transition,
 * which asks "has anything at all moved since the last request?".
 */
function projectIdentity(project) {
  return { id: project.id, name: project.name, updatedAt: project.updatedAt };
}

/**
 * Content only — deliberately without `updatedAt`.
 *
 * Staleness asks a narrower question: *has what I read actually changed?* A write
 * timestamp moves on every save, including the save that records the run itself, so
 * including it would mark every persona stale the instant it finished and re-dispatch
 * it forever. Content is the only honest signal.
 */
function contentIdentity(project) {
  return { id: project.id, name: project.name };
}

/** One stage's content. */
function stageSnapshot(project, stageId) {
  return stable({
    project: contentIdentity(project),
    stage: stageSources(project)[stageId] || {},
  });
}

/** Several stages at once — what a reader that spans stages depends on. */
function stagesSnapshot(project, stageIds = []) {
  const sources = stageSources(project);
  const stages = {};
  for (const stageId of [...new Set(ensureArray(stageIds))].sort()) {
    stages[stageId] = sources[stageId] || {};
  }
  return stable({ project: contentIdentity(project), stages });
}

/**
 * The two-stage shape stage transitions have always used. Kept exactly as it was: this
 * is shared code now, not changed code.
 */
function contextSnapshot(project, fromStageId, toStageId) {
  const source = stageSources(project);
  return stable({
    project: projectIdentity(project),
    from: source[fromStageId] || {},
    to: source[toStageId] || {},
  });
}

/** Which lines went and which arrived. Bounded, because this is shown to a person. */
function promptDiff(previous, current) {
  const before = String(previous || '').split('\n');
  const after = String(current || '').split('\n');
  if (previous === current) return '';
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const lines = [];
  before.filter((line) => !afterSet.has(line)).slice(0, 30).forEach((line) => lines.push(`- ${line}`));
  after.filter((line) => !beforeSet.has(line)).slice(0, 30).forEach((line) => lines.push(`+ ${line}`));
  return lines.join('\n').slice(0, 12000);
}

module.exports = {
  contextSnapshot,
  fingerprint,
  hash,
  promptDiff,
  stable,
  stageSnapshot,
  stageSources,
  stagesSnapshot,
};
