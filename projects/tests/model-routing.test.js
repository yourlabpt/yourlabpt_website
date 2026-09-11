/**
 * The Agent Controller: the persona is fixed, the engine is not.
 *
 * The claim that has to hold for any of this to mean anything is asserted directly
 * below — routing two different models at the same persona must leave the persona's
 * tools, write scope and instructions byte-identical. Otherwise "we compared two models
 * on this job" is really "we ran two different jobs".
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const routing = require('../lib/model-routing');
const llmOptions = require('../lib/llm-options');
const agentPersonas = require('../lib/agent-personas');
const buildPolicies = require('../lib/build-policies');

const CATALOGUE = [
  { id: 'cheap', label: 'Cheap', provider: 'ollama', model: 'llama3.1:8b', profileId: 'small', pricing: { inputPer1M: 0, outputPer1M: 0 } },
  { id: 'mid', label: 'Mid', provider: 'deepinfra', model: 'deepseek-ai/DeepSeek-V3', profileId: 'medium', pricing: { inputPer1M: 0.27, outputPer1M: 1.1 } },
  { id: 'strong', label: 'Strong', provider: 'deepinfra', model: 'deepseek-ai/DeepSeek-V3', profileId: 'high', pricing: { inputPer1M: 0.27, outputPer1M: 1.1 } },
  { id: 'top', label: 'Top', provider: 'deepinfra', model: 'deepseek-ai/DeepSeek-R1', profileId: 'max', pricing: { inputPer1M: 0.55, outputPer1M: 2.19 } },
];

describe('routing changes the engine and nothing else', () => {
  it('leaves the persona contract untouched whichever model is chosen', () => {
    const cheap = routing.route({ personaId: 'developer', camada: 0, options: CATALOGUE });
    const dear = routing.route({ personaId: 'developer', camada: 4, options: CATALOGUE });
    assert.notEqual(cheap.optionId, dear.optionId);

    // The persona is resolved the same way regardless — routing never feeds into it.
    const persona = agentPersonas.resolvePersona('developer', {});
    assert.equal(persona.writeScope, 'module_code');
    assert.deepEqual(persona.produces, ['code_change', 'module_tests']);
    assert.deepEqual(persona.taskTypes, ['code_implementation']);
    // And nothing in a routing result carries tools, scope or instructions at all.
    for (const result of [cheap, dear]) {
      assert.equal(result.allowedTools, undefined);
      assert.equal(result.writeScope, undefined);
      assert.equal(result.instructions, undefined);
    }
  });

  it('is a pure function of its inputs', () => {
    const input = { personaId: 'tech_lead', camada: 3, options: CATALOGUE, stats: {} };
    assert.deepEqual(routing.route(input), routing.route(input));
  });
});

describe('the refinement layers run cheap', () => {
  it('drops to the cheap profile for camadas 0 to 2', () => {
    for (const camada of [0, 1, 2]) {
      const result = routing.route({ personaId: 'tech_lead', camada, options: CATALOGUE });
      assert.equal(result.profileId, routing.CHEAP_PROFILE, `camada ${camada}`);
      assert.match(result.reason, /refinamento/);
    }
  });

  it('stops doing that from camada 3, where the weighting is the usual one', () => {
    const result = routing.route({ personaId: 'tech_lead', camada: 3, options: CATALOGUE });
    assert.notEqual(result.profileId, routing.CHEAP_PROFILE);
  });

  it('never uses cheapness as an excuse to downgrade a persona already set lower', () => {
    const result = routing.route({
      personaId: 'product_owner', camada: 1, options: CATALOGUE, personaProfileId: 'small',
    });
    assert.equal(result.profileId, 'small');
  });

  it('has a camada for every stage the policy declares', () => {
    for (const rule of buildPolicies.policyFor('web_app').STAGES) {
      const camada = buildPolicies.camadaForStage('web_app', rule.stage);
      assert.ok(Number.isInteger(camada), `${rule.stage} has no camada`);
      assert.ok(camada >= 0 && camada <= 4, `${rule.stage} camada out of range`);
    }
    // An unknown stage is not silently treated as the cheapest layer.
    assert.equal(buildPolicies.camadaForStage('web_app', 'nao-existe'), null);
  });
});

describe('a model that keeps failing one persona stops getting that job', () => {
  it('moves up a step after the same failure twice, and says so', () => {
    const persona = 'developer';
    let stats = {};
    const first = routing.route({ personaId: persona, camada: 4, options: CATALOGUE, stats });
    assert.equal(first.escalated, false);

    for (let i = 0; i < routing.ESCALATE_AFTER; i += 1) {
      stats = routing.recordOutcome(stats, {
        personaId: persona, optionId: first.optionId,
        outcome: 'failed', failureSignature: 'developer:sem-saida',
      });
    }

    const after = routing.route({ personaId: persona, camada: 4, options: CATALOGUE, stats });
    assert.equal(after.escalated, true);
    assert.notEqual(after.optionId, first.optionId);
    assert.match(after.reason, /falhas iguais seguidas/);

    // The persona is still the persona.
    assert.deepEqual(
      agentPersonas.resolvePersona(persona, {}).produces,
      ['code_change', 'module_tests'],
    );
  });

  it('counts a repeat only when the failure is the same one', () => {
    let stats = {};
    stats = routing.recordOutcome(stats, { personaId: 'ux', optionId: 'mid', outcome: 'failed', failureSignature: 'a' });
    stats = routing.recordOutcome(stats, { personaId: 'ux', optionId: 'mid', outcome: 'failed', failureSignature: 'b' });
    assert.equal(routing.statsFor(stats, 'ux', 'mid').consecutiveFailures, 1);
    assert.equal(routing.statsFor(stats, 'ux', 'mid').failures, 2);
  });

  it('a success clears the streak', () => {
    let stats = {};
    stats = routing.recordOutcome(stats, { personaId: 'ux', optionId: 'mid', outcome: 'failed', failureSignature: 'a' });
    stats = routing.recordOutcome(stats, { personaId: 'ux', optionId: 'mid', outcome: 'failed', failureSignature: 'a' });
    stats = routing.recordOutcome(stats, { personaId: 'ux', optionId: 'mid', outcome: 'completed' });
    assert.equal(routing.statsFor(stats, 'ux', 'mid').consecutiveFailures, 0);
  });
});

describe('the engine catalogue', () => {
  it('always offers something runnable rather than nothing', () => {
    assert.ok(llmOptions.listOptions([]).length > 0);
    assert.ok(llmOptions.fallbackOption([], 'medium'));
  });

  it('skips a disabled option rather than dispatching to it', () => {
    const withDisabled = CATALOGUE.map((option) => (
      option.id === 'mid' ? { ...option, enabled: false } : option
    ));
    const enabled = llmOptions.listOptions(withDisabled, { enabledOnly: true });
    assert.equal(enabled.find((option) => option.id === 'mid'), undefined);
  });

  it('says plainly when a hosted model has no price, because the cap then never fires', () => {
    const unpriced = llmOptions.normalizeOption({
      id: 'x', model: 'm', provider: 'deepinfra', profileId: 'medium',
    });
    assert.match(llmOptions.optionWarnings(unpriced).join(' '), /limite nunca trava/);
    // Local inference is genuinely free per token; that is not the same warning.
    const local = llmOptions.normalizeOption({ id: 'y', model: 'm', provider: 'ollama' });
    assert.deepEqual(llmOptions.optionWarnings(local), []);
  });

  it('names the model on the wire instead of a tier label', () => {
    const spec = llmOptions.wireSpec(llmOptions.findOption(CATALOGUE, 'top'));
    assert.equal(spec.model, 'deepseek-ai/DeepSeek-R1');
    assert.equal(spec.provider, 'deepinfra');
    assert.equal(spec.pricing.outputPer1M, 2.19);
    // Nothing chosen means nothing sent, so the runtime falls back to its own table.
    assert.equal(llmOptions.wireSpec(null), null);
  });
});

describe('an engine id is identity, not a label', () => {
  it('survives an edit to everything else about it', () => {
    const edited = llmOptions.normalizeOptions([{
      id: 'deepinfra-v3',
      label: 'Outro nome',
      provider: 'outro',
      model: 'outro/modelo',
      profileId: 'max',
      pricing: { inputPer1M: 9 },
    }]);
    // The persona × engine record and every dispatched task point at this id. Minting a
    // new one on save would silently orphan all of them.
    assert.equal(edited[0].id, 'deepinfra-v3');
    assert.equal(edited[0].model, 'outro/modelo');
  });

  it('refuses an entry with no id or no model rather than inventing one', () => {
    assert.equal(llmOptions.normalizeOption({ model: 'sem-id' }), null);
    assert.equal(llmOptions.normalizeOption({ id: 'sem-modelo' }), null);
  });

  it('drops a duplicate id instead of keeping two engines under one name', () => {
    const options = llmOptions.normalizeOptions([
      { id: 'a', model: 'primeiro' },
      { id: 'a', model: 'segundo' },
    ]);
    assert.equal(options.length, 1);
    assert.equal(options[0].model, 'primeiro');
  });
});

describe('the chosen engine survives the settings whitelist', () => {
  it('keeps llmOptionId through a work-item round trip', () => {
    const workItems = require('../lib/work-items');
    const settings = workItems.normalizeExecutionSettings({ llmOptionId: 'top', modelProfileId: 'max' });
    assert.equal(settings.llmOptionId, 'top');
    assert.equal(workItems.normalizeExecutionSettings(settings).llmOptionId, 'top');
  });
});
