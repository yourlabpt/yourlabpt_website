/**
 * What a persona is told before it starts.
 *
 * The policy already knows what a stage must produce and what changing it puts in
 * doubt. None of it reached the agent, which had to infer the method from the prompt —
 * and inferring the method is how an agent ends up building something plausible that
 * nobody asked for.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const briefing = require('../lib/persona-briefing');
const personas = require('../lib/agent-personas');
const workItems = require('../lib/work-items');

const project = { id: 'prj_1', productType: 'web_app' };

function persona(id, overrides = {}) {
  return personas.resolvePersona(id, { [id]: overrides });
}

test('a persona is told what its stage must produce and when it is done', () => {
  const brief = briefing.buildBriefing(project, persona('ux'), { stageId: 'discovery' });
  assert.match(brief.doneWhen, /mockup aprovado/);
  assert.ok(brief.mustProduce.includes('ux_mockup'));
  assert.ok(brief.mustProduce.includes('screen_inventory'));
});

test('it is told its output is not final until a person accepts it', () => {
  const brief = briefing.buildBriefing(project, persona('ux'), { stageId: 'discovery' });
  assert.equal(brief.approvalTransforms.ux_mockup, 'ux_mockup_approved');
  assert.match(briefing.briefingToMarkdown(brief), /Nao assuma que esta aceite/);
});

test('it is warned, up front, what changing its own output would put in doubt', () => {
  const brief = briefing.buildBriefing(project, persona('ux'), { stageId: 'discovery' });
  const toIdea = brief.consequences.find((entry) => entry.thenReconsider === 'intention');
  assert.ok(toIdea, 'mexer no mockup tem consequencias na ideia');
  assert.equal(toIdea.ifYouChange, 'ux_mockup');
  assert.equal(toIdea.owner, 'product_owner');
  // The policy's own sentence, not a paraphrase of it.
  assert.match(toIdea.rule, /capacidade nova/);
});

test('a reconciliation says why it is running out of sequence', () => {
  const brief = briefing.buildBriefing(project, persona('product_owner'), {
    stageId: 'idea',
    reconcile: {
      artifact: 'intention',
      sourceArtifact: 'ux_mockup',
      direction: 'upstream',
      rule: 'Um ecra novo que a ideia nao previa e uma capacidade nova.',
    },
  });
  assert.equal(brief.reconcile.changed, 'ux_mockup');
  assert.equal(brief.reconcile.reconsider, 'intention');

  const markdown = briefing.briefingToMarkdown(brief);
  assert.match(markdown, /Porque esta a correr agora/);
  // And told to increment rather than redo, which is the whole point of a refinamento.
  assert.match(markdown, /nao mais do que isso/);
});

test('knowledge the operator attached travels with the persona', () => {
  const brief = briefing.buildBriefing(
    project,
    persona('ux', { knowledge: [{ title: 'Estilo', markdown: 'Mobile primeiro.' }] }),
    { stageId: 'discovery' },
  );
  assert.deepEqual(brief.knowledge.map((entry) => entry.title), ['Estilo']);
  assert.match(briefing.briefingToMarkdown(brief), /Mobile primeiro/);
});

test('knowledge is data: an empty note is dropped, an untitled one still counts', () => {
  const resolved = persona('developer', {
    knowledge: [
      { title: 'Commits', markdown: 'Portugues, imperativo.' },
      { markdown: 'sem titulo' },
      { markdown: '   ' },
    ],
  });
  assert.equal(resolved.knowledge.length, 2);
  assert.equal(resolved.knowledge[1].title, 'Nota 2');
  // And it survives storage, so adding knowledge is not lost on the next load.
  const reloaded = personas.normalizeKnowledge(JSON.parse(JSON.stringify(resolved.knowledge)));
  assert.deepEqual(reloaded, resolved.knowledge);
});

test('the reason a reconciliation task exists is stored on the task itself', () => {
  const item = workItems.normalizeWorkItem({
    id: 'task_1',
    title: 'Reconciliar',
    reconcile: { artifact: 'intention', sourceArtifact: 'ux_mockup', direction: 'upstream', rule: 'porque sim' },
  }, {});
  assert.equal(item.reconcile.sourceArtifact, 'ux_mockup');
  // Dropping it on load would leave the task unable to explain itself later.
  const reloaded = workItems.normalizeWorkItem(JSON.parse(JSON.stringify(item)), {});
  assert.deepEqual(reloaded.reconcile, item.reconcile);
});

test('the briefing reaches the runtime as prose and as data', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agent-runtime-routes.js'), 'utf8');
  assert.match(source, /personaBriefing\.buildBriefing\(project, runningPersona/);
  // Appended to the instructions...
  assert.match(source, /briefingMarkdown \? `\\n\\n\$\{briefingMarkdown\}` : ''/);
  // ...and carried as structure, so a runtime can act on the rules rather than parse them.
  assert.match(source, /\.\.\.\(briefing \? \{ policy: briefing \} : \{\}\)/);
});
