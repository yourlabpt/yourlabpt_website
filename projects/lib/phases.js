/**
 * The five phases every project moves through, and which of the nine delivery stages —
 * still the stored vocabulary (`deliveryStageId`) — belongs to which.
 *
 * A read-side view, not a migration: nothing here renames a stored stage or changes what
 * `stage-transition-requests.js` enforces, and Notion's `Stage` field is untouched. It
 * exists so a UI can group by phase today, without the stage-id rename and Notion-sync
 * cutover that waits for a pilot project.
 *
 *   Discovery   idea, discovery       — the problem, and what's already known about it
 *   Planning    requirements,         — mockup, requirements, plan, diagrams: the first
 *               architecture, roadmap   versions of what gets built
 *   Build       implementation        — tests written against requirements, code written
 *                                        until they pass, feature by feature after
 *   Delivery    validation, delivery  — staged, MVP to final, client tests and approves
 *   Operations  operations            — deployed, running, maintained
 *
 * No standalone TDD phase: a TC (test-case requirement) already states how a requirement
 * is verified, and writing the coded test that checks it is Build's job — see the
 * "Escrever teste" action in the artifact drawer, public/delivery-os-ui.js.
 */
const PHASES = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'planning', label: 'Planning' },
  { id: 'build', label: 'Build' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'operations', label: 'Operations' },
];

const PHASE_FOR_STAGE = {
  idea: 'discovery',
  discovery: 'discovery',
  requirements: 'planning',
  architecture: 'planning',
  roadmap: 'planning',
  implementation: 'build',
  validation: 'delivery',
  delivery: 'delivery',
  operations: 'operations',
  unclassified: 'discovery',
};

/** Which phase a stage (old, stored vocabulary) belongs to. Unknown stages read as Discovery — the safest place for something not yet classified to surface, not a guess buried in Build or Delivery. */
function phaseForStage(stageId) {
  const id = String(stageId || '').trim().toLowerCase();
  return PHASE_FOR_STAGE[id] || 'discovery';
}

module.exports = { PHASES, PHASE_FOR_STAGE, phaseForStage };
