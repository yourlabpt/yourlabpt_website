/**
 * The decisions log, and the bound on how far a change is allowed to travel.
 *
 * Two claims worth pinning: the log is a *reader* over the two decision stores that
 * already exist rather than a third one, and reconciliation covers exactly one artifact
 * hop unless somebody rules on it.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const decisionsLog = require('../lib/decisions-log');
const changePropagation = require('../lib/change-propagation');
const workItems = require('../lib/work-items');

function project(over = {}) {
  const base = { id: 'prj_1', name: 'R', productType: 'web_app', workItems: [], decisions: [], ...over };
  workItems.setWorkItems(base, workItems.getWorkItems(base));
  return base;
}

function taskWithDecision(decision, { createdAt = '2026-09-11T09:00:00Z', title = 'Reconciliar' } = {}) {
  return {
    id: `w_${Math.random().toString(36).slice(2, 8)}`,
    title,
    taskRole: 'execution',
    updates: [{ id: `u_${Math.random().toString(36).slice(2, 8)}`, createdAt, decision }],
  };
}

describe('the log reads what already exists', () => {
  it('collects decisions from tasks and from phases into one chronology', () => {
    const p = project({
      workItems: [taskWithDecision({ artifact: 'ux_mockup', affects: ['intention'], proposal: 'A ideia passa a incluir o ecrã de mesas', status: 'proposed' })],
      decisions: [{ id: 'dec_1', text: 'Usar Stripe', status: 'accepted', phaseId: 'architecture', decidedAt: '2026-09-10T10:00:00Z' }],
    });
    const log = decisionsLog.collect(p);
    assert.equal(log.length, 2);
    assert.deepEqual(log.map((entry) => entry.source), ['task', 'phase']);
  });

  it('orders by when an entry last moved, not when it was raised', () => {
    const p = project({
      workItems: [
        taskWithDecision({ proposal: 'Antiga, decidida hoje', status: 'accepted', decidedAt: '2026-09-12T10:00:00Z' }, { createdAt: '2026-09-01T09:00:00Z' }),
        taskWithDecision({ proposal: 'Recente, ainda aberta', status: 'proposed' }, { createdAt: '2026-09-11T09:00:00Z' }),
      ],
    });
    // A decision ruled on today is what changed today, whenever it was first raised.
    assert.match(decisionsLog.collect(p)[0].proposal, /decidida hoje/);
  });

  it('ignores an update that is only a note', () => {
    const p = project({
      workItems: [{ id: 'w1', title: 'X', updates: [{ id: 'u1', bodyMarkdown: 'só uma nota', createdAt: '2026-09-11T09:00:00Z' }] }],
    });
    assert.deepEqual(decisionsLog.collect(p), []);
  });

  it('carries the layer, so a vision change does not read like a task change', () => {
    const p = project({
      workItems: [taskWithDecision({ proposal: 'X', status: 'proposed' })],
      decisions: [{ id: 'd1', text: 'Y', status: 'proposed', phaseId: 'idea' }],
    });
    const log = decisionsLog.collect(p);
    assert.equal(log.find((entry) => entry.source === 'task').camada, 4);
    assert.equal(log.find((entry) => entry.source === 'phase').camada, 1);
  });
});

describe('what is new since you last looked', () => {
  const p = project({
    workItems: [
      taskWithDecision({ proposal: 'Velha', status: 'accepted', decidedAt: '2026-09-09T10:00:00Z' }),
      taskWithDecision({ proposal: 'Nova', status: 'proposed' }, { createdAt: '2026-09-11T09:00:00Z' }),
    ],
  });
  const log = decisionsLog.collect(p);

  it('counts everything on a first visit rather than claiming a quiet log', () => {
    assert.equal(decisionsLog.summarise(log, '').unread, 2);
  });

  it('counts only what moved after the cutoff', () => {
    assert.equal(decisionsLog.summarise(log, '2026-09-10T00:00:00Z').unread, 1);
    assert.equal(decisionsLog.summarise(log, '2026-09-30T00:00:00Z').unread, 0);
  });

  it('keeps pending separate from unread — novelty is not the same as needing you', () => {
    const summary = decisionsLog.summarise(log, '2026-09-30T00:00:00Z');
    assert.equal(summary.unread, 0);
    assert.equal(summary.pending, 1, 'an old open decision still needs a person');
  });
});

describe('a change travels exactly one artifact hop', () => {
  it('covers what the change touches directly, and stops', () => {
    const plan = changePropagation.reconcilePlan('web_app', 'ux_mockup');
    const personas = plan.map((step) => step.personaId);
    assert.deepEqual(personas, ['ux', 'product_owner', 'module_architect', 'tech_lead']);
    // `intention` is reconciled by this plan, but nothing built on `intention` is pulled
    // in — that is the difference between revising the layer and revising the project.
    assert.ok(plan.every((step) => step.artifact !== 'project_context'));
  });

  it('puts the producer first and reconciliation before rebuilding', () => {
    const plan = changePropagation.reconcilePlan('web_app', 'module_spec');
    assert.equal(plan[0].direction, 'produces');
    const upstreamAt = plan.findIndex((step) => step.direction === 'upstream');
    const downstreamAt = plan.findIndex((step) => step.direction === 'downstream');
    assert.ok(upstreamAt < downstreamAt, 'correct the spec before rebuilding on it');
  });
});

describe('the second hop has to be earned', () => {
  const decision = { artifact: 'ux_mockup', affects: ['intention'], proposal: 'x' };

  it('offers nothing while nobody has ruled', () => {
    assert.deepEqual(changePropagation.nextHop('web_app', { ...decision, status: 'proposed' }).steps, []);
  });

  it('offers nothing on a rejection, which changed nothing', () => {
    assert.deepEqual(changePropagation.nextHop('web_app', { ...decision, status: 'rejected' }).steps, []);
  });

  it('opens what was built on the reconciled artifact once accepted, and says why', () => {
    const hop = changePropagation.nextHop('web_app', { ...decision, status: 'accepted' });
    assert.ok(hop.steps.length);
    assert.match(hop.because, /Aceitar isto altera intention/);
    for (const step of hop.steps) {
      assert.equal(step.hop, 2);
      assert.equal(step.becauseOf, 'ux_mockup');
      // The producer already made this change by accepting it.
      assert.notEqual(step.direction, 'produces');
    }
  });

  it('offers nothing when there was no decision at all', () => {
    assert.deepEqual(changePropagation.nextHop('web_app', null).steps, []);
    assert.deepEqual(changePropagation.nextHop('web_app', { status: 'accepted' }).steps, []);
  });
});

describe('a ruled decision stays ruled', () => {
  it('cannot be rewritten once accepted, so the log is a record', () => {
    let item = workItems.normalizeWorkItem({ id: 'w1', title: 'X' });
    const added = workItems.addWorkItemDecision(item, {
      artifact: 'ux_mockup', affects: ['intention'], proposal: 'A ideia muda', rationale: 'porque sim',
    });
    item = added.item;
    const ruling = workItems.decideWorkItemUpdate(item, added.update.id, { accepted: true, actorUserId: 'u1' });
    item = ruling.item;

    const ruled = item.updates.find((entry) => entry.id === added.update.id);
    assert.equal(ruled.decision.status, 'accepted');
    assert.equal(ruled.decision.decidedBy, 'u1');
    assert.ok(ruled.decision.decidedAt);
    assert.throws(() => workItems.decideWorkItemUpdate(item, added.update.id, { accepted: false }));
  });
});

describe('the repository renders what the platform holds', () => {
  const openspecSync = require('../lib/openspec-sync');

  const full = {
    id: 'p1',
    name: 'Reservas',
    productType: 'web_app',
    vision: { mainIdeaMarkdown: 'Gerir o dia sem papel.', targetUsers: ['Recepção'] },
    constitution: 'O sistema deve sempre registar quem alterou uma reserva.',
    workItems: [taskWithDecision({
      artifact: 'ux_mockup', affects: ['intention'], proposal: 'A ideia passa a incluir takeaway',
      status: 'accepted', decidedBy: 'tulio', decidedAt: '2026-09-11T10:00:00Z',
    })],
    decisions: [],
  };

  it('writes the layer-1 documents and the decisions log beside the specs', () => {
    const paths = openspecSync.buildRepositoryFiles(full, []).files.map((file) => file.path);
    assert.ok(paths.includes('openspec/vision.md'));
    assert.ok(paths.includes('openspec/constitution.md'));
    assert.ok(paths.includes('openspec/decisions.md'));
  });

  it('separates what is still open from what was ruled on', () => {
    const withPending = {
      ...full,
      workItems: [...full.workItems, taskWithDecision({ artifact: 'code_change', proposal: 'Mover o total', status: 'proposed' })],
    };
    const doc = openspecSync.buildRepositoryFiles(withPending, []).files
      .find((file) => file.path.endsWith('decisions.md')).content;
    assert.match(doc, /## Por decidir/);
    assert.match(doc, /## Decididas/);
    // Someone reading the repo should see the open one without opening the platform.
    assert.ok(doc.indexOf('Mover o total') < doc.indexOf('## Decididas'));
  });

  it('says who ruled, so the record is attributable', () => {
    const doc = openspecSync.buildRepositoryFiles(full, []).files
      .find((file) => file.path.endsWith('decisions.md')).content;
    assert.match(doc, /Decidida por tulio/);
    assert.match(doc, /Poe em causa: `intention`/);
  });
});
