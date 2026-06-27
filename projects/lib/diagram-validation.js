const {
  isSupportedNotation,
  getDiagramType,
  isSupportedDiagramType,
} = require('./diagram-registry');

const MERMAID_STARTERS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'gantt', 'journey', 'pie', 'gitGraph',
  'mindmap', 'timeline', 'C4Context', 'block-beta',
];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function parseJsonSafe(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function validateMermaid(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O diagrama está vazio — adicione código Mermaid.' });
    return { valid: false, errors, warnings };
  }
  const firstLine = src.split('\n').map((l) => l.trim()).find(Boolean) || '';
  const startsOk = MERMAID_STARTERS.some((s) => firstLine.startsWith(s));
  if (!startsOk) {
    warnings.push({
      code: 'unknown_mermaid_type',
      message: 'Não reconhecemos o tipo de diagrama Mermaid na primeira linha. Verifique a sintaxe.',
    });
  }
  if (src.includes('```')) {
    errors.push({ code: 'fenced_block', message: 'Remova os delimitadores ``` — cole apenas o código Mermaid.' });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validatePlantUml(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O diagrama PlantUML está vazio.' });
    return { valid: false, errors, warnings };
  }
  if (!/@startuml/i.test(src)) {
    errors.push({ code: 'missing_start', message: 'PlantUML deve começar com @startuml.' });
  }
  if (!/@enduml/i.test(src)) {
    warnings.push({ code: 'missing_end', message: 'PlantUML deve terminar com @enduml.' });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateOpenApi(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'A especificação OpenAPI está vazia.' });
    return { valid: false, errors, warnings };
  }
  const json = parseJsonSafe(src);
  if (json.ok) {
    if (!json.value.openapi && !json.value.swagger) {
      errors.push({ code: 'missing_openapi', message: 'JSON válido mas falta o campo openapi ou swagger.' });
    }
    return { valid: errors.length === 0, errors, warnings };
  }
  if (!/^openapi\s*:/m.test(src) && !/^swagger\s*:/m.test(src)) {
    errors.push({ code: 'missing_openapi', message: 'OpenAPI YAML deve conter a chave openapi: ou swagger:.' });
  }
  if (!/^\s*info\s*:/m.test(src)) {
    warnings.push({ code: 'missing_info', message: 'Recomendado incluir secção info: com título e versão.' });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateAsyncApi(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'A especificação AsyncAPI está vazia.' });
    return { valid: false, errors, warnings };
  }
  const json = parseJsonSafe(src);
  if (json.ok) {
    if (!json.value.asyncapi) {
      errors.push({ code: 'missing_asyncapi', message: 'JSON válido mas falta o campo asyncapi.' });
    }
    return { valid: errors.length === 0, errors, warnings };
  }
  if (!/^asyncapi\s*:/m.test(src)) {
    errors.push({ code: 'missing_asyncapi', message: 'AsyncAPI YAML deve conter asyncapi:.' });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateJsonSchema(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O JSON Schema está vazio.' });
    return { valid: false, errors, warnings };
  }
  const json = parseJsonSafe(src);
  if (!json.ok) {
    errors.push({ code: 'invalid_json', message: `JSON inválido: ${json.error}` });
    return { valid: false, errors, warnings };
  }
  if (!json.value.$schema && !json.value.type && !json.value.properties) {
    warnings.push({ code: 'weak_schema', message: 'Schema sem $schema, type ou properties — pode ser incompleto.' });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateBpmnXml(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O BPMN XML está vazio.' });
    return { valid: false, errors, warnings };
  }
  if (!/<(\w+:)?definitions/i.test(src) && !/<bpmn/i.test(src)) {
    errors.push({ code: 'invalid_bpmn', message: 'BPMN XML deve conter elemento definitions ou bpmn.' });
  }
  warnings.push({ code: 'bpmn_stub', message: 'Validação BPMN completa pendente — verifique visualmente no editor.' });
  return { valid: errors.length === 0, errors, warnings };
}

function validateDmnYaml(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O modelo DMN está vazio.' });
    return { valid: false, errors, warnings };
  }
  if (!/decision/i.test(src) && !/decisions/i.test(src)) {
    warnings.push({ code: 'missing_decision', message: 'DMN deve referenciar decisões (decision/decisions).' });
  }
  warnings.push({ code: 'dmn_stub', message: 'Validação DMN completa pendente.' });
  return { valid: errors.length === 0, errors, warnings };
}

function validateDot(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O ficheiro DOT está vazio.' });
    return { valid: false, errors, warnings };
  }
  if (!/digraph|graph\s+/i.test(src)) {
    errors.push({ code: 'invalid_dot', message: 'DOT deve começar com digraph ou graph.' });
  }
  warnings.push({ code: 'dot_stub', message: 'Renderização Graphviz pendente no servidor — use exportação manual se necessário.' });
  return { valid: errors.length === 0, errors, warnings };
}

function validateYamlMeta(sourceText) {
  const src = textOr(sourceText);
  const errors = [];
  const warnings = [];
  if (!src) {
    errors.push({ code: 'empty_source', message: 'O YAML está vazio.' });
    return { valid: false, errors, warnings };
  }
  if (!/:\s/.test(src)) {
    warnings.push({ code: 'yaml_structure', message: 'YAML deve conter pares chave: valor.' });
  }
  return { valid: errors.length === 0, errors, warnings };
}

const NOTATION_VALIDATORS = {
  mermaid: validateMermaid,
  plantuml: validatePlantUml,
  openapi: validateOpenApi,
  asyncapi: validateAsyncApi,
  json_schema: validateJsonSchema,
  bpmn_xml: validateBpmnXml,
  dmn_yaml: validateDmnYaml,
  dot: validateDot,
  yaml_meta: validateYamlMeta,
};

function validateDiagramSource({ notation, sourceText, type }) {
  const errors = [];
  const warnings = [];

  if (!isSupportedNotation(notation)) {
    errors.push({ code: 'unsupported_notation', message: `Notação «${notation}» não suportada.` });
    return { valid: false, errors, warnings, validationStatus: 'invalid' };
  }

  const validator = NOTATION_VALIDATORS[notation];
  const result = validator ? validator(sourceText) : { valid: true, errors: [], warnings: [] };
  errors.push(...ensureArray(result.errors));
  warnings.push(...ensureArray(result.warnings));

  if (type && isSupportedDiagramType(type)) {
    const template = getDiagramType(type);
    for (const rule of ensureArray(template.outputRules)) {
      warnings.push({ code: 'template_rule', message: rule });
    }
  }

  const validationStatus = errors.length ? 'invalid' : (warnings.length ? 'warning' : 'valid');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validationStatus,
  };
}

function collectRequirementIds(project) {
  return new Set(ensureArray(project.requirements).map((r) => r.id).filter(Boolean));
}

function collectApiOperationIds(project) {
  const ids = new Set();
  for (const art of ensureArray(project.artifacts)) {
    if (art.type === 'api_endpoint' && art.id) ids.add(art.id);
  }
  for (const d of ensureArray(project.diagramArtifacts)) {
    if (d.type === 'openapi_spec' || d.type === 'asyncapi_spec') {
      if (d.id) ids.add(d.id);
    }
  }
  return ids;
}

function collectEntityIds(project) {
  const ids = new Set();
  for (const art of ensureArray(project.artifacts)) {
    if (art.type === 'data_entity' && art.id) ids.add(art.id);
  }
  return ids;
}

function validateDiagramLinks(project, artifact, { allowProposed = false, strictTraceability = false } = {}) {
  const errors = [];
  const warnings = [];
  const reqIds = collectRequirementIds(project);
  const apiIds = collectApiOperationIds(project);
  const entityIds = collectEntityIds(project);
  const meta = artifact.metadata || {};

  for (const reqId of ensureArray(artifact.linkedRequirementIds)) {
    if (!reqIds.has(reqId)) {
      errors.push({ code: 'unknown_requirement', message: `Requisito «${reqId}» não existe no projecto.` });
    }
  }

  for (const apiId of ensureArray(artifact.linkedApiOperationIds)) {
    if (!apiIds.has(apiId) && !meta.proposedApiIds?.includes(apiId)) {
      if (allowProposed || String(apiId).startsWith('proposed:')) {
        warnings.push({ code: 'proposed_api', message: `API «${apiId}» marcada como proposta.` });
      } else {
        errors.push({ code: 'unknown_api', message: `API «${apiId}» não existe — use prefixo proposed: ou metadata.proposedApiIds.` });
      }
    }
  }

  for (const entityId of ensureArray(artifact.linkedEntityIds)) {
    if (!entityIds.has(entityId) && !meta.proposedEntityIds?.includes(entityId)) {
      if (allowProposed || String(entityId).startsWith('proposed:')) {
        warnings.push({ code: 'proposed_entity', message: `Entidade «${entityId}» marcada como proposta.` });
      } else {
        errors.push({ code: 'unknown_entity', message: `Entidade «${entityId}» não existe.` });
      }
    }
  }

  const template = getDiagramType(artifact.type);
  const isDiscovery = ['product_scope_map', 'stakeholder_actor_map', 'user_journey_map'].includes(artifact.type);
  const hasTrace = ensureArray(artifact.linkedRequirementIds).length
    || ensureArray(artifact.linkedApiOperationIds).length
    || ensureArray(artifact.linkedEntityIds).length
    || ensureArray(artifact.linkedRoadmapPhaseIds).length
    || ensureArray(artifact.linkedTestIds).length;

  if (template && !isDiscovery && !hasTrace) {
    const msg = 'Diagramas de arquitectura devem ligar-se a pelo menos um requisito, API, entidade, fase ou teste.';
    if (strictTraceability) {
      errors.push({ code: 'missing_traceability', message: msg });
    } else {
      warnings.push({ code: 'missing_traceability', message: msg });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateDiagramArtifact(project, artifact, { strictTraceability = false } = {}) {
  const sourceResult = validateDiagramSource({
    notation: artifact.notation,
    sourceText: artifact.sourceText,
    type: artifact.type,
  });
  const linkResult = validateDiagramLinks(project, artifact, { allowProposed: true, strictTraceability });

  const errors = [...sourceResult.errors, ...linkResult.errors];
  const warnings = [...sourceResult.warnings, ...linkResult.warnings];
  let validationStatus = 'valid';
  if (errors.length) validationStatus = 'invalid';
  else if (warnings.length) validationStatus = 'warning';

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validationStatus,
  };
}

const AI_OUTPUT_REQUIRED_FIELDS = ['title', 'type', 'notation', 'sourceText'];

function validateAiDiagramOutput(project, payload) {
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ code: 'invalid_payload', message: 'Output da IA deve ser JSON object.' }], warnings };
  }

  for (const field of AI_OUTPUT_REQUIRED_FIELDS) {
    if (!textOr(payload[field])) {
      errors.push({ code: 'missing_field', message: `Campo obrigatório em falta: ${field}.` });
    }
  }

  if (payload.type && !isSupportedDiagramType(payload.type)) {
    errors.push({ code: 'unsupported_type', message: `Tipo de diagrama «${payload.type}» não suportado.` });
  }

  if (payload.notation && !isSupportedNotation(payload.notation)) {
    errors.push({ code: 'unsupported_notation', message: `Notação «${payload.notation}» não suportada.` });
  }

  const draftArtifact = {
    type: payload.type,
    notation: payload.notation,
    sourceText: payload.sourceText,
    linkedRequirementIds: ensureArray(payload.linkedRequirementIds),
    linkedApiOperationIds: ensureArray(payload.linkedApiOperationIds),
    linkedEntityIds: ensureArray(payload.linkedEntityIds),
    linkedRoadmapPhaseIds: ensureArray(payload.linkedRoadmapPhaseIds),
    linkedTestIds: ensureArray(payload.linkedTestIds),
    metadata: { assumptions: payload.assumptions, openQuestions: payload.openQuestions },
  };

  const sourceResult = validateDiagramSource({
    notation: draftArtifact.notation,
    sourceText: draftArtifact.sourceText,
    type: draftArtifact.type,
  });
  if (!sourceResult.valid) {
    errors.push(...sourceResult.errors.filter((e) => e.code === 'empty_source' || e.code === 'invalid_json' || e.code === 'missing_openapi'));
  }

  const linkResult = validateDiagramLinks(project, draftArtifact);
  errors.push(...linkResult.errors);

  if (ensureArray(payload.validationNotes).length) {
    for (const note of payload.validationNotes) {
      warnings.push({ code: 'ai_note', message: String(note) });
    }
  }

  return { valid: errors.length === 0, errors, warnings, parsed: payload };
}

module.exports = {
  validateDiagramSource,
  validateDiagramLinks,
  validateDiagramArtifact,
  validateAiDiagramOutput,
  NOTATION_VALIDATORS,
};
