/**
 * Skills — what a persona knows how to *do*.
 *
 * Two properties matter most here and are easy to lose later: a skill must never gate a
 * dispatch (that was the "no compatible agent" failure wearing a different label), and
 * the bundle must stay inside a budget that scales with the model it is going to.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skills = require('../lib/skills');
const personas = require('../lib/agent-personas');
const briefing = require('../lib/persona-briefing');
const stageTransitions = require('../lib/stage-transition-requests');
const { assessCompatibility } = require('../lib/agent-connector-contract');
const { MODEL_PROFILES } = require('../lib/execution-plans');

describe('the catalogue and what is on disk agree', () => {
  it('every entry resolves to a file with a body', () => {
    for (const skill of skills.listSkills()) {
      const body = skills.readBody(skill.id);
      assert.ok(body.length > 200, `${skill.id} has no usable body`);
      assert.doesNotMatch(body, /^---\n/, `${skill.id} still carries its frontmatter`);
    }
  });

  it('every vendored folder is in the catalogue, so nothing ships unreferenced', () => {
    const known = new Set(skills.listSkills().map((entry) => entry.id));
    const onDisk = fs.readdirSync(skills.SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name);
    for (const id of onDisk) assert.ok(known.has(id), `${id} is vendored but not in the catalogue`);
    assert.equal(onDisk.length, known.size);
  });

  it('keeps the licence it was vendored under', () => {
    const licence = fs.readFileSync(path.join(skills.SKILLS_DIR, 'LICENSE'), 'utf8');
    assert.match(licence, /MIT/);
    assert.match(licence, /Addy Osmani/);
    assert.equal(skills.SOURCE, 'addyosmani/agent-skills');
  });

  it('binds every skill to at least one persona and one layer', () => {
    for (const skill of skills.listSkills()) {
      assert.ok(skill.personas.length, `${skill.id} belongs to nobody`);
      assert.ok(skill.camadas.length, `${skill.id} belongs to no layer`);
      for (const personaId of skill.personas) {
        assert.ok(personas.isPersonaId(personaId), `${skill.id} names an unknown persona: ${personaId}`);
      }
    }
  });

  it('degrades on an unknown id instead of throwing, so the catalogue can grow', () => {
    const unknown = skills.describeSkill('nao-existe-ainda');
    assert.equal(unknown.known, false);
    assert.equal(unknown.id, 'nao-existe-ainda');
    assert.deepEqual(skills.skillBundle('nao_existe').included, []);
  });
});

describe('a persona carries the method for the layer it is working at', () => {
  it('gives the tech lead task breakdown at Camada 3', () => {
    assert.deepEqual(skills.skillsFor('tech_lead', 3).map((s) => s.id), ['planning-and-task-breakdown']);
  });

  it('does not hand it the launch checklist while it is cutting work', () => {
    const atThree = skills.skillsFor('tech_lead', 3).map((s) => s.id);
    assert.ok(!atThree.includes('shipping-and-launch'));
  });

  it('gives the refinement layers the interviewing methods', () => {
    const atZero = skills.skillsFor('product_owner', 0).map((s) => s.id);
    assert.ok(atZero.includes('interview-me'));
    assert.ok(atZero.includes('idea-refine'));
  });

  it('an unscoped request returns everything the persona owns', () => {
    assert.ok(skills.skillsFor('developer').length > skills.skillsFor('developer', 3).length);
  });
});

describe('the bundle stays inside its budget', () => {
  it('scales with the model profile rather than being one fixed size', () => {
    const small = skills.budgetForProfile(MODEL_PROFILES.small);
    const max = skills.budgetForProfile(MODEL_PROFILES.max);
    assert.ok(max > small, 'a bigger context should buy more method');
    assert.ok(small >= skills.MIN_BUDGET_BYTES, 'every run gets at least one method');
  });

  it('never exceeds the budget it is given', () => {
    for (const personaId of ['developer', 'tester', 'orchestrator']) {
      const bundle = skills.skillBundle(personaId, 4, 20000);
      assert.ok(bundle.bytes <= 20000, `${personaId} overran its budget: ${bundle.bytes}`);
    }
  });

  it('lists in full what it could not send in full', () => {
    const bundle = skills.skillBundle('developer', 4, 16000);
    assert.ok(bundle.summarised.length, 'this budget should not fit nine methods');
    // The index is the point: a method the persona was not given the text of is still a
    // method it should know exists, by name.
    for (const id of bundle.summarised) assert.match(bundle.markdown, new RegExp(id));
    for (const id of bundle.included) assert.match(bundle.markdown, new RegExp(id));
    assert.match(bundle.markdown, /sem o texto completo/);
  });

  it('caps the checklists too, and says where the rest live', () => {
    const bundle = skills.referenceBundle('validation', 5000);
    assert.ok(bundle.bytes <= 5000);
    assert.ok(bundle.summarised.length);
    assert.match(bundle.markdown, /skills\/_references\//);
  });

  it('keeps a real briefing proportionate to the model it is going to', () => {
    const project = { id: 'p', name: 'R', productType: 'web_app' };
    for (const [personaId, stage] of [['developer', 'implementation'], ['tester', 'validation'], ['ux', 'discovery']]) {
      const persona = personas.resolvePersona(personaId, {});
      const text = briefing.briefingToMarkdown(briefing.buildBriefing(project, persona, { stageId: stage }));
      const budget = skills.budgetForProfile(MODEL_PROFILES[persona.modelProfileId]);
      // Methods + checklists + the briefing's own prose. Generous, but bounded — the
      // point is that it cannot grow without limit as the catalogue does.
      assert.ok(text.length < budget * 1.6, `${personaId} briefing is ${text.length}b against a ${budget}b budget`);
      assert.match(text, /Como trabalhar/, `${personaId} received no method at all`);
    }
  });
});

describe('a skill never blocks a dispatch', () => {
  const capabilities = {
    protocol: { id: 'yourlab.agent-dispatch', versions: [1, 2] },
    tools: ['repo.read'],
    skills: [],
    agents: [],
  };

  it('dispatches a task naming a skill the runtime has never heard of', () => {
    const result = assessCompatibility({
      contract: { id: 'yourlab.agent-dispatch', version: 2 },
      requirements: { skills: ['spec-driven-development', 'inventado'], tools: ['repo.read'] },
    }, capabilities);
    assert.equal(result.compatible, true);
    assert.deepEqual(result.reasons, []);
  });

  it('still refuses when a tool is genuinely absent, which is a real thing to fix', () => {
    const result = assessCompatibility({
      contract: { id: 'yourlab.agent-dispatch', version: 2 },
      requirements: { skills: [], tools: ['repo.patch'] },
    }, capabilities);
    assert.equal(result.compatible, false);
    assert.deepEqual(result.reasons, ['tool:repo.patch']);
  });
});

describe('there is one skills vocabulary, not two', () => {
  it('every stage names real skills instead of abstract tags', () => {
    const known = new Set(skills.listSkills().map((entry) => entry.id));
    const source = fs.readFileSync(require.resolve('../lib/stage-transition-requests'), 'utf8');
    const block = source.match(/const SKILLS_BY_STAGE = \{[\s\S]*?\n\};/)[0];
    const ids = [...block.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]).filter((id) => id.includes('-'));
    assert.ok(ids.length >= 9);
    for (const id of ids) assert.ok(known.has(id), `stage names an unknown skill: ${id}`);
    // The tags that used to live here meant nothing and were checked against nothing.
    for (const legacy of ['product_discovery', 'solution_architecture', 'quality_assurance']) {
      assert.doesNotMatch(block, new RegExp(legacy), `${legacy} is still a stage skill`);
    }
  });
});

describe('skill is not knowledge', () => {
  it('they are separate fields with separate meanings', () => {
    const persona = personas.resolvePersona('developer', {
      developer: {
        knowledge: [{ id: 'k1', title: 'Regras da casa', markdown: 'Sem jQuery.' }],
        skills: ['test-driven-development'],
      },
    });
    assert.equal(persona.knowledge.length, 1);
    assert.deepEqual(persona.skills, ['test-driven-development']);
  });

  it('an explicit list wins, and an empty one means the usual ones', () => {
    const pinned = personas.resolvePersona('developer', { developer: { skills: ['code-simplification'] } });
    assert.deepEqual(personas.effectiveSkills(pinned).map((s) => s.id), ['code-simplification']);

    const untouched = personas.resolvePersona('developer', {});
    assert.ok(personas.effectiveSkills(untouched).length > 1, 'leaving it alone must not mean none');
  });
});
