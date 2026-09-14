/**
 * Every decision this project has taken, in one place, newest first.
 *
 * There is **no decisions store**, deliberately. Decisions already exist in two forms,
 * and they are genuinely different things:
 *
 *   on a task    a change put something else in doubt; this is the proposal and the
 *                ruling on it (`workItem.updates[].decision`)
 *   on a phase   a decision taken in the work itself, often promoted from a meeting
 *                minute (`project.decisions`)
 *
 * Reading both and presenting one chronological log is the right shape. A third store
 * would be a third definition of the same word — and the two that exist are each already
 * written to by something that owns them.
 */
const workItems = require('./work-items');
const camadas = require('./camadas');
const buildPolicies = require('./build-policies');
const changePropagation = require('./change-propagation');

function ensureArray(value) { return Array.isArray(value) ? value : []; }

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

/** When this entry last moved — the ruling if it has one, otherwise when it was raised. */
function movedAt(entry) {
  return entry.decidedAt || entry.raisedAt || '';
}

/**
 * Decisions attached to tasks: a change happened, and something else may no longer hold.
 *
 * These carry the layer they belong to, because "what changed" is only half of it — a
 * decision that moves the vision is a different weight from one that moves a task.
 */
function fromTasks(project) {
  const out = [];
  for (const item of workItems.getWorkItems(project)) {
    for (const update of ensureArray(item.updates)) {
      const decision = update.decision;
      if (!decision) continue;
      out.push({
        id: update.id,
        source: 'task',
        workItemId: item.id,
        taskTitle: item.title,
        camada: camadas.camadaOfWorkItem(item),
        // What moved, and what it puts in doubt.
        artifact: decision.artifact,
        affects: decision.affects,
        proposal: decision.proposal,
        rationale: decision.rationale,
        changedBy: decision.changedBy,
        status: decision.status,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
        raisedAt: update.createdAt,
      });
    }
  }
  return out;
}

/** Decisions recorded against a phase, including those promoted from a meeting minute. */
function fromPhases(project) {
  return ensureArray(project?.decisions).map((decision) => ({
    id: decision.id,
    source: 'phase',
    stageId: decision.phaseId,
    camada: buildPolicies.camadaForStage(project?.productType, decision.phaseId),
    proposal: decision.text,
    rationale: decision.notes,
    affects: ensureArray(decision.linkedRequirementIds),
    status: decision.status,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
    raisedAt: decision.createdAt,
    sourceRef: decision.sourceRef,
  }));
}

/**
 * The whole log, newest first.
 *
 * Sorted by when the entry last moved rather than when it was raised: a decision ruled
 * on today matters more than one raised today and still open, and the point of this
 * screen is what changed since you last looked.
 */
function collect(project) {
  const productType = project?.productType;
  return [...fromTasks(project), ...fromPhases(project)]
    .filter((entry) => text(entry.proposal))
    .map((entry) => {
      // Accepting a decision is itself a change, so it opens a second hop. Attached here
      // rather than left implicit: "what did saying yes to this actually put in motion"
      // is the question the log exists to answer.
      const hop = changePropagation.nextHop(productType, entry);
      return hop.steps.length
        ? { ...entry, opened: hop.steps.map((step) => step.personaId), openedWhy: hop.because }
        : { ...entry, opened: [], openedWhy: '' };
    })
    .sort((left, right) => String(movedAt(right)).localeCompare(String(movedAt(left))));
}

/**
 * What is new since a given moment, and what is still waiting on a person.
 *
 * `since` empty means everything is new — the first visit should not claim a quiet log.
 */
function summarise(entries, since = '') {
  const cutoff = text(since);
  const unread = entries.filter((entry) => !cutoff || String(movedAt(entry)) > cutoff);
  return {
    total: entries.length,
    unread: unread.length,
    // Open decisions are the ones that actually need someone; unread is only novelty.
    pending: entries.filter((entry) => entry.status === 'proposed').length,
    latestAt: entries.length ? movedAt(entries[0]) : '',
  };
}

module.exports = { collect, fromPhases, fromTasks, movedAt, summarise };
