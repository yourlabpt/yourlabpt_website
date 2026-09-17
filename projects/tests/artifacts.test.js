/**
 * Artifacts as one list, and requirements are viewed into it rather than copied.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const artifacts = require('../lib/artifacts');

function project(over = {}) {
  return { id: 'prj_1', name: 'R', artifacts: [], requirements: [], ...over };
}

describe('requirements viewed as artifacts', () => {
  it('projects each requirement into the common artifact shape without copying it', () => {
    const p = project({
      requirements: [{
        id: 'TC-001', type: 'test_case', title: 'Login falha com password errada',
        shall: 'rejeitar credenciais inválidas', status: 'draft',
        deliveryStageId: 'requirements', versionRevision: '1.0',
        createdAt: '2026-09-10T09:00:00Z', updatedAt: '2026-09-11T09:00:00Z',
      }],
    });
    const [view] = artifacts.requirementsAsArtifacts(p);
    assert.equal(view.id, 'TC-001');
    assert.equal(view.type, 'requirement');
    assert.equal(view.subtype, 'test_case');
    assert.equal(view.name, 'Login falha com password errada');
    assert.equal(view.editableAsArtifact, false, 'a requirement view must not be saveable through the artifacts endpoint');
  });

  it('does not require a title or hierarchy field to still appear', () => {
    const p = project({ requirements: [{ id: 'STK-001', type: 'stakeholder', shall: 'poder reservar mesa' }] });
    const [view] = artifacts.requirementsAsArtifacts(p);
    assert.equal(view.name, 'poder reservar mesa');
    assert.equal(view.subtype, 'stakeholder');
  });
});

describe('all artifacts, one list', () => {
  it('merges the generic artifact store with the requirements view, newest first', () => {
    const p = project({
      artifacts: [{ id: 'art_1', type: 'mockup', name: 'Ecrã de mesas', updatedAt: '2026-09-12T09:00:00Z' }],
      requirements: [{ id: 'FR-001', type: 'functional', shall: 'listar mesas', updatedAt: '2026-09-13T09:00:00Z' }],
    });
    const all = artifacts.allArtifacts(p);
    assert.equal(all.length, 2);
    assert.equal(all[0].id, 'FR-001');
    assert.equal(all[1].id, 'art_1');
  });

  it('tags every row with its phase, generic artifacts included', () => {
    const p = project({
      artifacts: [{ id: 'art_1', type: 'mockup', name: 'Ecrã de mesas', stageId: 'requirements' }],
      requirements: [{ id: 'FR-001', type: 'functional', shall: 'listar mesas', deliveryStageId: 'implementation' }],
    });
    const all = artifacts.allArtifacts(p);
    const mockup = all.find((a) => a.id === 'art_1');
    const req = all.find((a) => a.id === 'FR-001');
    assert.equal(mockup.phase, 'planning');
    assert.equal(req.phase, 'build');
  });
});
