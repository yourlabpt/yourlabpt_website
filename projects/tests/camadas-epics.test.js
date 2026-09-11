/**
 * Camadas 1 to 4: the vision, the epics under it, the features under those, and the
 * test that keeps a task small enough for one agent run.
 *
 * The structural claim worth pinning is that this costs exactly one new entity. Epic is
 * a record; Feature is a coordination work item with an epicId; Tarefa is its child. The
 * work-item tree therefore stays two deep, which is what the rest of the system expects.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const epics = require('../lib/epics');
const camadas = require('../lib/camadas');
const workItems = require('../lib/work-items');
const workSnapshot = require('../lib/work-snapshot');
const buildPolicies = require('../lib/build-policies');

function project(over = {}) {
  const base = { id: 'prj_1', name: 'Reservas', epics: [], workItems: [], mockupSessions: [], ...over };
  workItems.setWorkItems(base, workItems.getWorkItems(base));
  return base;
}

describe('an epic is a scope, not a run', () => {
  it('is created in draft and keeps its order', () => {
    const p = project();
    const first = epics.createEpic(p, { title: 'Gestão de mesas' });
    const second = epics.createEpic(p, { title: 'Entregas ao cliente' });
    assert.equal(first.status, 'draft');
    assert.deepEqual(epics.listEpics(p).map((e) => e.title), ['Gestão de mesas', 'Entregas ao cliente']);
    assert.equal(second.order, 1);
  });

  it('refuses a nameless epic rather than storing one', () => {
    assert.throws(() => epics.createEpic(project(), { title: '   ' }), /nome a esta epic/);
  });

  it('survives a round trip through the normalizer', () => {
    const p = project();
    const epic = epics.createEpic(p, { title: 'Gestão de mesas', summary: 'As mesas do dia.' });
    epics.updateEpic(p, epic.id, { status: 'active', changeId: 'chg_1', mockupSessionId: 'mock_1' });
    const reloaded = epics.listEpics({ epics: p.epics })[0];
    assert.equal(reloaded.status, 'active');
    assert.equal(reloaded.changeId, 'chg_1');
    assert.equal(reloaded.mockupSessionId, 'mock_1');
  });
});

describe('no epic reaches a spec without passing Camada 0', () => {
  it('says so when there is no mockup session at all', () => {
    const p = project();
    const epic = epics.createEpic(p, { title: 'Gestão de mesas' });
    assert.match(epics.specGap(p, epic, new Set()), /ainda não passou pela Camada 0/);
  });

  it('still says so when the mockup exists but was not approved', () => {
    const p = project();
    const epic = epics.createEpic(p, { title: 'X', mockupSessionId: 'mock_1' });
    assert.match(epics.specGap(p, epic, new Set()), /ainda não foi aprovado/);
  });

  it('clears once that session is approved', () => {
    const p = project();
    const epic = epics.createEpic(p, { title: 'X', mockupSessionId: 'mock_1' });
    assert.equal(epics.specGap(p, epic, new Set(['mock_1'])), '');
  });
});

describe('a feature is a work item, which keeps the tree two deep', () => {
  it('reads as Camada 3, and its children as Camada 4', () => {
    const feature = workItems.normalizeWorkItem({ id: 'f1', title: 'Marcar', taskRole: 'coordination', epicId: 'epic_1' });
    const task = workItems.normalizeWorkItem({ id: 't1', title: 'Botão', parentTaskId: 'f1' });
    assert.equal(camadas.camadaOfWorkItem(feature), 3);
    assert.equal(camadas.camadaOfWorkItem(task), 4);
  });

  it('keeps epicId through a round trip', () => {
    const once = workItems.normalizeWorkItem({ id: 'f1', title: 'X', taskRole: 'coordination', epicId: 'epic_1' });
    assert.equal(workItems.normalizeWorkItem(once).epicId, 'epic_1');
  });

  it('a regenerated feature with the same stable key stays deleted', () => {
    const original = workItems.normalizeWorkItem({
      id: 'f_old', title: 'Marcar', taskRole: 'coordination', epicId: 'epic_1', stableTaskKey: 'marcar',
    });
    const regenerated = workItems.normalizeWorkItem({
      id: 'f_new', title: 'Marcar', taskRole: 'coordination', epicId: 'epic_1', stableTaskKey: 'marcar',
    });
    const keys = workItems.stableKeysForWorkItem(original);
    assert.ok(keys.includes('stable:epic_1:marcar'));
    // A fresh uuid must not be enough to bring a deleted feature back.
    assert.ok(workItems.stableKeysForWorkItem(regenerated).includes('stable:epic_1:marcar'));
  });

  it('does not collide two unrelated items that share a stable key', () => {
    const a = workItems.normalizeWorkItem({ id: 'a', title: 'A', parentTaskId: 'plan_1', stableTaskKey: 'step_1' });
    const b = workItems.normalizeWorkItem({ id: 'b', title: 'B', parentTaskId: 'plan_2', stableTaskKey: 'step_1' });
    const shared = workItems.stableKeysForWorkItem(a)
      .filter((key) => workItems.stableKeysForWorkItem(b).includes(key));
    assert.deepEqual(shared, [], 'step_1 in two different plans must not be the same thing');
  });
});

describe('the Camada 4 cut test', () => {
  const base = { id: 't1', title: 'X', descriptionMarkdown: 'Faça isto.', taskRole: 'execution' };
  const item = (over) => workItems.normalizeWorkItem({ ...base, ...over });

  it('passes a task with one testable criterion', () => {
    assert.deepEqual(camadas.cutTestFindings(item({ acceptanceCriteriaMarkdown: 'O botão grava a reserva.' })), []);
  });

  it('sends a task with several criteria back to Camada 3, and says so', () => {
    const findings = camadas.cutTestFindings(item({
      acceptanceCriteriaMarkdown: '- Grava a reserva.\n- Envia o email.\n- Actualiza a lista.',
    }));
    assert.equal(findings[0].code, 'criterios-a-mais');
    assert.match(findings[0].message, /volte à Camada 3/);
    assert.equal(findings[0].fixWhere, 'Camada 3');
  });

  it('counts prose sentences as well as lists, so the shape does not decide', () => {
    assert.equal(camadas.countCriteria('Grava a reserva. Envia o email.'), 2);
    assert.equal(camadas.countCriteria('1. Grava\n2. Envia'), 2);
    assert.equal(camadas.countCriteria('- [ ] Grava\n- [x] Envia'), 2);
    assert.equal(camadas.countCriteria(''), 0);
  });

  it('says when nothing says how the task is verified', () => {
    assert.equal(camadas.cutTestFindings(item({ acceptanceCriteriaMarkdown: '' }))[0].code, 'sem-criterio');
  });

  it('says when an agent would be guessing', () => {
    const findings = camadas.cutTestFindings(item({
      descriptionMarkdown: '', acceptanceCriteriaMarkdown: 'Grava.',
    }));
    assert.ok(findings.some((entry) => entry.code === 'sem-descricao'));
  });

  it('refuses a task that crosses a module boundary', () => {
    const findings = camadas.cutTestFindings(item({
      acceptanceCriteriaMarkdown: 'Grava.',
      repositoryPaths: ['reservas/api.js', 'faturacao/total.js'],
    }));
    assert.equal(findings[0].code, 'multi-modulo');
  });

  it('never applies to a Feature, which is meant to hold several things', () => {
    assert.deepEqual(camadas.cutTestFindings(item({ taskRole: 'coordination', acceptanceCriteriaMarkdown: '' })), []);
  });
});

describe('Camada 1 is visible to the rest of the chain', () => {
  it('notices a hand edit to the constitution', () => {
    const before = workSnapshot.fingerprint(workSnapshot.stageSnapshot(project(), 'idea'));
    const after = workSnapshot.fingerprint(
      workSnapshot.stageSnapshot(project({ constitution: 'O sistema deve sempre registar quem alterou o quê.' }), 'idea'),
    );
    assert.notEqual(before, after, 'editing the constitution must not land silently');
  });

  it('declares vision and constitution as artifacts something produces', () => {
    const producible = buildPolicies.producibleArtifacts(buildPolicies.policyFor('web_app'));
    assert.ok(producible.has('vision'));
    assert.ok(producible.has('constitution'));
  });

  it('sends a spec change back up to both of them', () => {
    const rules = buildPolicies.policyFor('web_app').PROPAGATION
      .filter((rule) => rule.when === 'openspec_change')
      .map((rule) => rule.reconcile);
    assert.ok(rules.includes('vision'));
    assert.ok(rules.includes('constitution'));
  });
});

describe('Camada 1 writes through the vision the platform already owns', () => {
  const deliveryOs = require('../lib/delivery-os');

  it('the long-run statement is a field of the existing vision, not a new one', () => {
    // `project.vision` is a structured record — headline, problem, target users,
    // principles — normalized by delivery-os. Camada 1's text is one field of it.
    // Writing a bare string here would drop the rest, and the next normalize would turn
    // that string back into an empty object without complaining.
    const normalized = deliveryOs.normalizeVision({ headline: 'Reservas', targetUsers: ['Recepção'] }, {});
    assert.ok('mainIdeaMarkdown' in normalized);

    const merged = {
      ...normalized,
      mainIdeaMarkdown: 'Um sistema onde a recepção gere o dia inteiro sem papel.',
    };
    assert.equal(merged.headline, 'Reservas');
    assert.deepEqual(merged.targetUsers, ['Recepção']);
    assert.match(merged.mainIdeaMarkdown, /sem papel/);
  });

  it('a bare string in that slot loses everything, which is why the route merges', () => {
    assert.deepEqual(deliveryOs.normalizeVision('apenas texto', {}).headline, '');
    assert.equal(deliveryOs.normalizeVision('apenas texto', {}).mainIdeaMarkdown, '');
  });
});

describe('an Execução points at the epic it serves', () => {
  it('keeps epicId and featureId through a round trip', () => {
    const loop = require('../lib/orchestration-loop');
    const p = project();
    loop.startExecucao(p, { goal: 'Construir', epicId: 'epic_1', featureId: 'f1' });
    const reloaded = loop.normalizeExecucao(loop.activeExecucao(p));
    assert.equal(reloaded.epicId, 'epic_1');
    assert.equal(reloaded.featureId, 'f1');
  });
});
