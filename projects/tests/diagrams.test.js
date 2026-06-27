const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../lib/diagram-registry');
const validation = require('../lib/diagram-validation');
const {
  normalizeDiagramArtifact,
  createDiagramArtifact,
  approveDiagram,
  normalizeProjectDiagramFields,
  compareDiagramVersions,
} = require('../lib/diagrams');

function mockProject(overrides = {}) {
  return {
    id: 'prj_test',
    name: 'Test Project',
    clientName: 'Client',
    description: 'Summary',
    requirements: [
      { id: 'FR-01', type: 'functional', title: 'Login', module: 'Backend' },
      { id: 'TC-01', type: 'test_case', title: 'Login test' },
    ],
    artifacts: [
      { id: 'art_api_1', type: 'api_endpoint', name: 'GET /health' },
      { id: 'art_ent_1', type: 'data_entity', name: 'User' },
    ],
    phases: [{ id: 'phase_1', name: 'MVP' }],
    diagramArtifacts: [],
    diagramVersions: [],
    diagramReviews: [],
    diagramGenerationJobs: [],
    documents: [],
    ...overrides,
  };
}

describe('diagram registry', () => {
  it('includes sequence type with mermaid notation', () => {
    const t = registry.getDiagramType('sequence');
    assert.ok(t);
    assert.equal(t.recommendedNotation, 'mermaid');
  });

  it('rejects unsupported types', () => {
    assert.equal(registry.isSupportedDiagramType('not_a_type'), false);
  });
});

describe('mermaid validation', () => {
  it('accepts valid sequence diagram', () => {
    const r = validation.validateDiagramSource({
      notation: 'mermaid',
      sourceText: 'sequenceDiagram\n  A->>B: hi',
    });
    assert.equal(r.valid, true);
  });

  it('rejects empty mermaid', () => {
    const r = validation.validateDiagramSource({ notation: 'mermaid', sourceText: '' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.code === 'empty_source'));
  });
});

describe('AI output validation', () => {
  it('rejects empty sourceText', () => {
    const project = mockProject();
    const r = validation.validateAiDiagramOutput(project, {
      title: 'X',
      type: 'sequence',
      notation: 'mermaid',
      sourceText: '',
      linkedRequirementIds: ['FR-01'],
    });
    assert.equal(r.valid, false);
  });

  it('rejects unknown requirement IDs', () => {
    const project = mockProject();
    const r = validation.validateAiDiagramOutput(project, {
      title: 'X',
      type: 'sequence',
      notation: 'mermaid',
      sourceText: 'sequenceDiagram\n  A->>B: ok',
      linkedRequirementIds: ['FR-999'],
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.code === 'unknown_requirement'));
  });

  it('accepts valid AI output with existing requirement', () => {
    const project = mockProject();
    const r = validation.validateAiDiagramOutput(project, {
      title: 'Login flow',
      type: 'sequence',
      notation: 'mermaid',
      sourceText: 'sequenceDiagram\n  User->>API: Login',
      linkedRequirementIds: ['FR-01'],
    });
    assert.equal(r.valid, true);
  });
});

describe('diagram CRUD and approval', () => {
  it('creates diagram artifact in architecture phase', () => {
    const project = mockProject();
    normalizeProjectDiagramFields(project);
    const diagram = createDiagramArtifact(project, {
      title: 'Context',
      type: 'c4_context',
      notation: 'plantuml',
      sourceText: '@startuml\n@enduml',
      linkedRequirementIds: ['FR-01'],
    }, 'usr_1');
    assert.ok(diagram.id);
    assert.equal(diagram.phase, 'architecture');
    assert.equal(project.diagramArtifacts.length, 1);
    assert.equal(project.diagramVersions.length, 1);
  });

  it('blocks approval when validation invalid', () => {
    const project = mockProject();
    const diagram = createDiagramArtifact(project, {
      title: 'Bad',
      type: 'sequence',
      notation: 'mermaid',
      sourceText: '',
      linkedRequirementIds: ['FR-01'],
    }, 'usr_1');
    assert.throws(
      () => approveDiagram(project, diagram.id, 'usr_1', 'ok'),
      /validação/i,
    );
  });

  it('approves valid diagram with traceability', () => {
    const project = mockProject();
    const diagram = createDiagramArtifact(project, {
      title: 'Flow',
      type: 'sequence',
      notation: 'mermaid',
      sourceText: 'sequenceDiagram\n  A->>B: ok',
      linkedRequirementIds: ['FR-01'],
      status: 'needs_review',
    }, 'usr_1');
    const approved = approveDiagram(project, diagram.id, 'usr_1', 'LGTM');
    assert.equal(approved.status, 'approved');
    assert.ok(approved.approvedAt);
  });

  it('creates version on update path via versions list', () => {
    const project = mockProject();
    const diagram = createDiagramArtifact(project, {
      title: 'V1',
      type: 'erd',
      notation: 'mermaid',
      sourceText: 'erDiagram\n  A ||--o{ B : rel',
      linkedRequirementIds: ['FR-01'],
    }, 'usr_1');
    project.diagramVersions.unshift({
      id: 'dv1',
      diagramArtifactId: diagram.id,
      version: 1,
      sourceText: diagram.sourceText,
      metadata: {},
      createdAt: new Date().toISOString(),
      createdBy: 'usr_1',
      changeSummary: 'v1',
    });
    project.diagramVersions.unshift({
      id: 'dv2',
      diagramArtifactId: diagram.id,
      version: 2,
      sourceText: 'erDiagram\n  A ||--|| B : rel',
      metadata: {},
      createdAt: new Date().toISOString(),
      createdBy: 'usr_1',
      changeSummary: 'v2',
    });
    const diff = compareDiagramVersions(project, diagram.id, 1, 2);
    assert.ok(diff.sourceDiff.some((l) => l.type === 'changed' || l.type === 'same'));
  });
});

describe('normalizeProjectDiagramFields migration', () => {
  it('migrates architecture diagram documents to diagramArtifacts', () => {
    const project = mockProject({
      documents: [{
        id: 'doc_1',
        title: 'Legacy diagram',
        docType: 'diagram',
        diagramFormat: 'mermaid',
        deliveryStageId: 'architecture',
        contentMarkdown: 'flowchart LR\n  A --> B',
      }],
    });
    normalizeProjectDiagramFields(project);
    assert.equal(project.diagramArtifacts.length, 1);
    assert.equal(project.diagramArtifacts[0].metadata.documentId, 'doc_1');
  });
});

describe('diagram-requirement traceability', () => {
  const traceability = require('../lib/diagram-traceability');
  const deliveryOs = require('../lib/delivery-os');

  it('syncs linkedDiagramIds on requirements from diagrams', () => {
    const project = mockProject();
    createDiagramArtifact(project, {
      title: 'Login',
      type: 'sequence',
      notation: 'mermaid',
      sourceText: 'sequenceDiagram\n  A->>B: ok',
      linkedRequirementIds: ['FR-01'],
      module: 'Backend',
    }, 'usr_1');
    traceability.syncRequirementDiagramIds(project);
    const req = project.requirements.find((r) => r.id === 'FR-01');
    assert.deepEqual(req.linkedDiagramIds, [project.diagramArtifacts[0].id]);
  });

  it('links diagram to new requirements after diagram_to_requirements apply', () => {
    const project = mockProject({
      diagramArtifacts: [{
        id: 'diag_abc',
        projectId: 'prj_test',
        title: 'Auth',
        type: 'sequence',
        notation: 'mermaid',
        sourceText: 'sequenceDiagram\n  A->>B: ok',
        phase: 'architecture',
        linkedRequirementIds: ['FR-01'],
        status: 'draft',
        version: 1,
        generatedBy: 'human',
        validationStatus: 'valid',
        validationErrors: [],
        metadata: {},
      }],
    });
    project.requirements.push({
      id: 'FR-02',
      type: 'functional',
      title: 'OAuth',
      module: 'Backend',
    });
    traceability.applyDiagramToRequirementsResult(
      project,
      { agentType: 'diagram_to_requirements', contextPack: { diagramArtifactId: 'diag_abc' } },
      { linkedDiagramId: 'diag_abc', updates: [{ id: 'FR-01' }] },
      { newRequirementIds: ['FR-02'] },
    );
    const diagram = project.diagramArtifacts[0];
    assert.ok(diagram.linkedRequirementIds.includes('FR-01'));
    assert.ok(diagram.linkedRequirementIds.includes('FR-02'));
    const fr02 = project.requirements.find((r) => r.id === 'FR-02');
    assert.deepEqual(fr02.linkedDiagramIds, ['diag_abc']);
  });

  it('derives trace links between diagrams and requirements', () => {
    const project = mockProject({
      diagramArtifacts: [{
        id: 'diag_x',
        projectId: 'prj_test',
        title: 'Flow',
        type: 'sequence',
        notation: 'mermaid',
        sourceText: 'sequenceDiagram\n  A->>B: ok',
        phase: 'architecture',
        linkedRequirementIds: ['FR-01'],
        status: 'approved',
        version: 1,
        generatedBy: 'human',
        validationStatus: 'valid',
        validationErrors: [],
        metadata: {},
      }],
    });
    traceability.syncRequirementDiagramIds(project);
    const links = deliveryOs.autoDeriveTraceLinks(project);
    assert.ok(links.some((l) => l.sourceType === 'diagram' && l.sourceId === 'diag_x' && l.targetId === 'FR-01'));
    assert.ok(links.some((l) => l.sourceType === 'requirement' && l.sourceId === 'FR-01' && l.targetId === 'diag_x'));
  });
});
