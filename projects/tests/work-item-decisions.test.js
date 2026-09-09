/**
 * Decisions recorded on a task.
 *
 * The point is human control: a persona may propose that an earlier phase is no longer
 * true, but nothing counts until a person rules on it — and what they ruled on must
 * still say the same thing afterwards.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workItems = require('../lib/work-items');

const DECISION = {
  artifact: 'ux_mockup',
  affects: ['intention'],
  proposal: 'Passar a ideia a incluir takeaway, que o mockup ja assume.',
  rationale: 'O mockup tem um ecra de takeaway que a ideia original nao previa.',
  changedBy: 'human',
};

function task() { return { id: 'task_1', updates: [] }; }

test('a decision travels in the ordinary update feed, not beside it', () => {
  const { item, update } = workItems.addWorkItemDecision(task(), DECISION, { actorUserId: 'u1' });
  assert.equal(item.updates.length, 1);
  assert.equal(update.kind, 'decision');
  // It reads as its proposal, so the timeline never shows an empty entry.
  assert.equal(update.bodyMarkdown, DECISION.proposal);
  assert.equal(update.decision.status, 'proposed');
  // A plain note is still a plain note.
  const note = workItems.addWorkItemUpdate(task(), 'so um comentario', { actorUserId: 'u1' });
  assert.equal(note.updates[0].kind, 'note');
  assert.equal(note.updates[0].decision, undefined);
});

test('a decision with nothing proposed is not a decision', () => {
  assert.equal(workItems.normalizeDecision({ artifact: 'ux_mockup' }), null);
  assert.throws(
    () => workItems.addWorkItemDecision(task(), { artifact: 'ux_mockup' }, {}),
    /precisa de dizer o que propoe/,
  );
});

test('nothing counts until a person rules on it', () => {
  const { item, update } = workItems.addWorkItemDecision(task(), DECISION, { actorUserId: 'agent' });
  assert.equal(workItems.pendingDecisions(item).length, 1);

  const ruled = workItems.decideWorkItemUpdate(item, update.id, { accepted: true, actorUserId: 'tulio' });
  assert.equal(ruled.update.decision.status, 'accepted');
  assert.equal(ruled.update.decision.decidedBy, 'tulio');
  assert.ok(ruled.update.decision.decidedAt);
  assert.equal(workItems.pendingDecisions(ruled.item).length, 0);
});

test('rejecting is a real outcome, recorded like any other', () => {
  const { item, update } = workItems.addWorkItemDecision(task(), DECISION, {});
  const ruled = workItems.decideWorkItemUpdate(item, update.id, { accepted: false, actorUserId: 'tulio' });
  assert.equal(ruled.update.decision.status, 'rejected');
  assert.equal(workItems.pendingDecisions(ruled.item).length, 0);
});

test('what you accepted keeps saying what it said', () => {
  const { item, update } = workItems.addWorkItemDecision(task(), DECISION, {});
  const ruled = workItems.decideWorkItemUpdate(item, update.id, { accepted: true, actorUserId: 'tulio' });

  // Rewriting a decided record would mean the thing you accepted is not what stands.
  assert.throws(() => workItems.patchWorkItemUpdate(ruled.item, update.id, 'outra coisa'), /nao pode ser reescrita/);
  // And it cannot be quietly decided twice.
  assert.throws(() => workItems.decideWorkItemUpdate(ruled.item, update.id, { accepted: false }), /ja foi decidida/);

  // A proposed one is still editable, because it has not been agreed yet.
  const open = workItems.addWorkItemDecision(task(), DECISION, {});
  const edited = workItems.patchWorkItemUpdate(open.item, open.update.id, 'proposta reescrita');
  assert.equal(edited.updates[0].bodyMarkdown, 'proposta reescrita');
});

test('a decision survives storage with its ruling intact', () => {
  const { item, update } = workItems.addWorkItemDecision(task(), DECISION, {});
  const ruled = workItems.decideWorkItemUpdate(item, update.id, { accepted: true, actorUserId: 'tulio' });
  const reloaded = workItems.normalizeUpdates(JSON.parse(JSON.stringify(ruled.item.updates)));
  assert.equal(reloaded[0].decision.status, 'accepted');
  assert.equal(reloaded[0].decision.decidedBy, 'tulio');
  assert.deepEqual(reloaded[0].decision.affects, ['intention']);
});

test('deciding is exposed and only for people who can edit the project', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'lib', 'work-items-routes.js'), 'utf8');
  assert.match(routes, /work-items\/:workItemId\/decisions', authMiddleware, loadProjectLiteForUser, requireProjectEditor/);
  assert.match(routes, /work-items\/:workItemId\/decisions\/:updateId', authMiddleware, loadProjectLiteForUser, requireProjectEditor/);
  assert.match(routes, /work_item_decision_accepted/);

  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'work-items-ui.js'), 'utf8');
  // A pending decision offers both outcomes, and says what it puts in doubt.
  assert.match(ui, /data-ado-decide=/);
  assert.match(ui, /Põe em causa/);
  // A ruled decision loses its edit affordance rather than erroring on click.
  assert.match(ui, /!\(decision && decision\.status !== 'proposed'\)/);
});
