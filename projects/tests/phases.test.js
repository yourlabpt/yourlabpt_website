/**
 * The five phases, and the read-side mapping from the nine stored stages — not a
 * migration, nothing here renames what stage-transition-requests.js enforces.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const phases = require('../lib/phases');

describe('mapping a stored stage to a phase', () => {
  it('groups requirements, architecture and roadmap into Planning', () => {
    assert.equal(phases.phaseForStage('requirements'), 'planning');
    assert.equal(phases.phaseForStage('architecture'), 'planning');
    assert.equal(phases.phaseForStage('roadmap'), 'planning');
  });

  it('groups validation and delivery into Delivery', () => {
    assert.equal(phases.phaseForStage('validation'), 'delivery');
    assert.equal(phases.phaseForStage('delivery'), 'delivery');
  });

  it('is case-insensitive and tolerant of blank input', () => {
    assert.equal(phases.phaseForStage('IMPLEMENTATION'), 'build');
    assert.equal(phases.phaseForStage(''), 'discovery');
    assert.equal(phases.phaseForStage(undefined), 'discovery');
  });

  it('reads an unknown stage as Discovery rather than guessing further downstream', () => {
    assert.equal(phases.phaseForStage('some-future-stage'), 'discovery');
  });
});
