/**
 * One list of everything that exists to be built or changed in a project — a mockup, a
 * requirement, a diagram, a plan, a test, a piece of code. A task exists because one of
 * these needs to be produced or changed; this module is where "all of them, together" is
 * answered from.
 *
 * There is no separate requirement-artifact store here. STK/FR/RNF/TC records
 * (`project.requirements`, normalized by `normalizeRequirementRecord` in api.js — already
 * EARS-wired via `lib/ears.js`, already hierarchy-linked via `lib/requirement-hierarchy.js`)
 * already are the requirement artifact. Duplicating them into `project.artifacts` would be
 * a second definition of the same thing, so this module views them as one list instead —
 * the same choice `lib/decisions-log.js` made for decisions.
 */
const { phaseForStage } = require('./phases');

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}
function movedAt(entry) { return entry.updatedAt || entry.createdAt || ''; }

const REQUIREMENT_SUBTYPES = {
  stakeholder: 'stakeholder',
  functional: 'functional',
  non_functional: 'non_functional',
  test_case: 'test_case',
};

/**
 * project.requirements, viewed as artifacts — not copied. Editing what this returns is
 * not how a requirement changes; go through `normalizeRequirementRecord` for that. This
 * exists so a requirement sits in the same list, sorted the same way, as a mockup.
 */
function requirementsAsArtifacts(project) {
  return ensureArray(project?.requirements).map((req) => ({
    id: req.id,
    type: 'requirement',
    subtype: REQUIREMENT_SUBTYPES[req.type] || req.type,
    name: textOr(req.title, req.shall),
    description: textOr(req.shall),
    status: textOr(req.status, 'draft'),
    stageId: textOr(req.deliveryStageId, 'requirements'),
    version: textOr(req.versionRevision, '1'),
    linkedArtifacts: ensureArray(req.linkedDiagramIds),
    producedByTaskId: '',
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    // A view, not a copy: this row is not a project.artifacts record, so an edit form
    // must not try to save it through the artifacts endpoint — it would create a
    // duplicate under the requirement's own id. Editing goes through the requirement.
    editableAsArtifact: false,
  }));
}

/** Every artifact in the project, one list, newest first — the generic store plus requirements. */
function allArtifacts(project) {
  return [...ensureArray(project?.artifacts), ...requirementsAsArtifacts(project)]
    .map((entry) => ({ ...entry, phase: phaseForStage(entry.stageId) }))
    .sort((a, b) => String(movedAt(b)).localeCompare(String(movedAt(a))));
}

// The task shape for "write the coded test that verifies this TC" lives in
// public/delivery-os-ui.js's artifact drawer (the "Escrever teste" action) — the only
// caller, so it is the definition. Not duplicated here; see that file's isTestCase branch.

module.exports = {
  requirementsAsArtifacts,
  allArtifacts,
};
