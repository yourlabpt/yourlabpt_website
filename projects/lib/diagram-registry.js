/**
 * Extensible registry of diagram types for the architecture phase.
 * Each entry defines notation, inputs, validation hints and lifecycle scope.
 */

const NOTATIONS = [
  'mermaid',
  'plantuml',
  'openapi',
  'asyncapi',
  'json_schema',
  'bpmn_xml',
  'dmn_yaml',
  'dot',
  'yaml_meta',
];

const ARCHITECTURE_PHASES = ['architecture'];

function defineType(type, overrides = {}) {
  return {
    type,
    label: overrides.label || type,
    description: overrides.description || '',
    recommendedNotation: overrides.recommendedNotation || 'mermaid',
    requiredInputs: overrides.requiredInputs || ['requirements'],
    optionalInputs: overrides.optionalInputs || [],
    outputRules: overrides.outputRules || [],
    validationRules: overrides.validationRules || [],
    exampleSourceText: overrides.exampleSourceText || '',
    allowedLifecyclePhases: overrides.allowedLifecyclePhases || ARCHITECTURE_PHASES,
    suggestedAudience: overrides.suggestedAudience || 'technical',
  };
}

const DIAGRAM_TYPE_REGISTRY = {
  product_scope_map: defineType('product_scope_map', {
    label: 'Product Scope Map',
    description: 'Visão de alto nível do âmbito do produto e limites.',
    recommendedNotation: 'mermaid',
    requiredInputs: ['projectSummary', 'requirements'],
    optionalInputs: ['businessObjectives'],
    outputRules: ['Must show in-scope vs out-of-scope boundaries', 'Must link to at least one requirement or business goal'],
    exampleSourceText: 'flowchart TB\n  Product[Product Scope]\n  InScope[In scope features]\n  OutScope[Out of scope]',
    suggestedAudience: 'product',
  }),
  stakeholder_actor_map: defineType('stakeholder_actor_map', {
    label: 'Stakeholder / Actor Map',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'actors'],
    outputRules: ['Must list actors/stakeholders explicitly'],
  }),
  user_journey_map: defineType('user_journey_map', {
    label: 'User Journey Map',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'actors'],
    optionalInputs: ['capabilities'],
    exampleSourceText: 'journey\n  title User journey\n  section Discover\n    Browse: 5: User',
  }),
  bpmn_process: defineType('bpmn_process', {
    label: 'BPMN Process Diagram',
    recommendedNotation: 'bpmn_xml',
    requiredInputs: ['requirements', 'actors'],
    outputRules: ['Must show roles and hand-offs when approvals exist'],
  }),
  dmn_decision: defineType('dmn_decision', {
    label: 'DMN Decision Model',
    recommendedNotation: 'dmn_yaml',
    requiredInputs: ['requirements'],
    outputRules: ['Decision tables must reference business rules from requirements'],
  }),
  requirements_diagram: defineType('requirements_diagram', {
    label: 'Requirements Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements'],
    outputRules: ['Must show requirement IDs that exist in the project'],
  }),
  traceability_matrix: defineType('traceability_matrix', {
    label: 'Traceability Matrix',
    recommendedNotation: 'yaml_meta',
    requiredInputs: ['requirements'],
    optionalInputs: ['tests', 'apis', 'entities'],
  }),
  uml_use_case: defineType('uml_use_case', {
    label: 'UML Use Case Diagram',
    recommendedNotation: 'plantuml',
    requiredInputs: ['requirements', 'actors'],
    exampleSourceText: '@startuml\nactor User\nrectangle System {\n  User --> (Use case)\n}\n@enduml',
  }),
  c4_context: defineType('c4_context', {
    label: 'C4 System Context',
    recommendedNotation: 'plantuml',
    requiredInputs: ['requirements', 'systemComponents'],
    outputRules: ['Must show system boundary and external dependencies', 'Mark proposed external systems as proposed'],
    exampleSourceText: '@startuml\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml\nPerson(user, "User")\nSystem(system, "System")\nRel(user, system, "Uses")\n@enduml',
  }),
  c4_container: defineType('c4_container', {
    label: 'C4 Container Diagram',
    recommendedNotation: 'plantuml',
    requiredInputs: ['requirements', 'systemComponents'],
    optionalInputs: ['dataEntities'],
  }),
  c4_component: defineType('c4_component', {
    label: 'C4 Component Diagram',
    recommendedNotation: 'plantuml',
    requiredInputs: ['requirements', 'systemComponents'],
    optionalInputs: ['apiOperations'],
  }),
  deployment: defineType('deployment', {
    label: 'Deployment Diagram',
    recommendedNotation: 'plantuml',
    requiredInputs: ['systemComponents'],
    optionalInputs: ['integrations'],
  }),
  infrastructure_topology: defineType('infrastructure_topology', {
    label: 'Infrastructure / Network Topology',
    recommendedNotation: 'dot',
    requiredInputs: ['systemComponents'],
  }),
  archimate_view: defineType('archimate_view', {
    label: 'ArchiMate-like EA View',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'systemComponents'],
  }),
  sequence: defineType('sequence', {
    label: 'Sequence Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'actors', 'systemComponents'],
    optionalInputs: ['apiOperations', 'dataEntities'],
    outputRules: [
      'Must show actors and system participants',
      'Must include success path',
      'Must include at least one failure path when requirements mention errors',
      'Must not invent external systems without marking them as proposed',
    ],
    exampleSourceText: 'sequenceDiagram\n  actor User\n  participant API\n  User->>API: Request\n  API-->>User: Response',
  }),
  activity_flow: defineType('activity_flow', {
    label: 'Activity / Functional Flow',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements'],
    exampleSourceText: 'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]',
  }),
  state_machine: defineType('state_machine', {
    label: 'State Machine Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements'],
    outputRules: ['Use for lifecycle-heavy objects (orders, sessions, devices)'],
    exampleSourceText: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Active\n  Active --> [*]',
  }),
  timing: defineType('timing', {
    label: 'Timing Diagram',
    recommendedNotation: 'plantuml',
    requiredInputs: ['requirements'],
  }),
  event_storming: defineType('event_storming', {
    label: 'Event Storming Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'capabilities'],
  }),
  event_driven_architecture: defineType('event_driven_architecture', {
    label: 'Event-Driven Architecture',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'systemComponents'],
    optionalInputs: ['apiOperations'],
  }),
  api_flow: defineType('api_flow', {
    label: 'API Flow Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['apiOperations', 'requirements'],
  }),
  uml_class_domain: defineType('uml_class_domain', {
    label: 'UML Class / Domain Model',
    recommendedNotation: 'plantuml',
    requiredInputs: ['requirements', 'dataEntities'],
    exampleSourceText: '@startuml\nclass Order {\n  +id: UUID\n  +status: String\n}\n@enduml',
  }),
  erd: defineType('erd', {
    label: 'Entity Relationship Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['dataEntities', 'requirements'],
    exampleSourceText: 'erDiagram\n  USER ||--o{ ORDER : places\n  ORDER {\n    string id\n    string status\n  }',
  }),
  data_flow: defineType('data_flow', {
    label: 'Data Flow Diagram',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'dataEntities'],
  }),
  openapi_spec: defineType('openapi_spec', {
    label: 'OpenAPI Specification',
    recommendedNotation: 'openapi',
    requiredInputs: ['apiOperations', 'requirements'],
    exampleSourceText: 'openapi: 3.0.3\ninfo:\n  title: API\n  version: 1.0.0\npaths:\n  /health:\n    get:\n      summary: Health check',
  }),
  asyncapi_spec: defineType('asyncapi_spec', {
    label: 'AsyncAPI Specification',
    recommendedNotation: 'asyncapi',
    requiredInputs: ['apiOperations', 'requirements'],
    exampleSourceText: 'asyncapi: 2.6.0\ninfo:\n  title: Events\n  version: 1.0.0\nchannels:\n  order/created:\n    publish:\n      message:\n        name: OrderCreated',
  }),
  json_schema_contract: defineType('json_schema_contract', {
    label: 'JSON Schema / Data Contract',
    recommendedNotation: 'json_schema',
    requiredInputs: ['dataEntities'],
    exampleSourceText: '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": {\n    "id": { "type": "string" }\n  }\n}',
  }),
  roadmap_gantt: defineType('roadmap_gantt', {
    label: 'Roadmap / Gantt',
    recommendedNotation: 'mermaid',
    requiredInputs: ['roadmapPhases'],
    optionalInputs: ['requirements'],
    exampleSourceText: 'gantt\n  title Roadmap\n  section Phase 1\n  Task A :a1, 2026-01-01, 30d',
  }),
  kanban_board: defineType('kanban_board', {
    label: 'Kanban / Delivery Board',
    recommendedNotation: 'yaml_meta',
    requiredInputs: ['roadmapPhases'],
  }),
  dependency_graph: defineType('dependency_graph', {
    label: 'Dependency Graph',
    recommendedNotation: 'dot',
    requiredInputs: ['requirements', 'systemComponents'],
    exampleSourceText: 'digraph G {\n  A -> B\n  B -> C\n}',
  }),
  test_coverage: defineType('test_coverage', {
    label: 'Test Coverage / Verification',
    recommendedNotation: 'yaml_meta',
    requiredInputs: ['requirements', 'tests'],
  }),
  observability: defineType('observability', {
    label: 'Observability / Monitoring',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements'],
    optionalInputs: ['systemComponents'],
  }),
  security_threat_model: defineType('security_threat_model', {
    label: 'Security Threat Model',
    recommendedNotation: 'mermaid',
    requiredInputs: ['requirements', 'systemComponents'],
    outputRules: ['Must show trust boundaries'],
  }),
};

const DIAGRAM_TYPES = Object.keys(DIAGRAM_TYPE_REGISTRY);

const NOTATION_LABELS = {
  mermaid: 'Mermaid',
  plantuml: 'PlantUML',
  openapi: 'OpenAPI YAML',
  asyncapi: 'AsyncAPI YAML',
  json_schema: 'JSON Schema',
  bpmn_xml: 'BPMN XML',
  dmn_yaml: 'DMN YAML',
  dot: 'Graphviz DOT',
  yaml_meta: 'YAML (metadata)',
};

function getDiagramType(type) {
  return DIAGRAM_TYPE_REGISTRY[type] || null;
}

function isSupportedDiagramType(type) {
  return Boolean(DIAGRAM_TYPE_REGISTRY[type]);
}

function isSupportedNotation(notation) {
  return NOTATIONS.includes(notation);
}

function listDiagramTemplates() {
  return DIAGRAM_TYPES.map((type) => DIAGRAM_TYPE_REGISTRY[type]);
}

function getRecommendedNotation(type) {
  return getDiagramType(type)?.recommendedNotation || 'mermaid';
}

module.exports = {
  NOTATIONS,
  NOTATION_LABELS,
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_REGISTRY,
  getDiagramType,
  isSupportedDiagramType,
  isSupportedNotation,
  listDiagramTemplates,
  getRecommendedNotation,
  ARCHITECTURE_PHASES,
};
