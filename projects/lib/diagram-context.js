const {
  getDiagramType,
  getRecommendedNotation,
  listDiagramTemplates,
} = require('./diagram-registry');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function shortText(value, max = 400) {
  const s = textOr(value);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    description: shortText(project.description || project.summary?.scopeInPlainLanguage, 600),
    goals: ensureArray(project.summary?.goals).slice(0, 8),
    architectureSummary: textOr(project.technicalApproach?.architectureSummary),
  };
}

function filterRequirements(project, { module, submodule, phase, requirementIds } = {}) {
  let reqs = ensureArray(project.requirements);
  if (requirementIds?.length) {
    const set = new Set(requirementIds);
    reqs = reqs.filter((r) => set.has(r.id));
  }
  if (module) {
    reqs = reqs.filter((r) => {
      const tags = ensureArray(r.moduleTags);
      return tags.includes(module) || r.module === module;
    });
  }
  if (submodule) {
    reqs = reqs.filter((r) => textOr(r.submodule) === submodule);
  }
  if (phase) {
    reqs = reqs.filter((r) => textOr(r.deliveryStageId, 'requirements') === phase || r.deliveryStageId === phase);
  }
  return reqs.slice(0, 40).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    shall: shortText(r.shall || r.need, 200),
    module: r.module,
    moduleTags: r.moduleTags,
    status: r.status,
  }));
}

function filterClarifications(project, limit = 15) {
  return ensureArray(project.clarificationQuestions)
    .filter((q) => ['open', 'sent', 'blocked', 'answered'].includes(q.status))
    .slice(0, limit)
    .map((q) => ({
      id: q.id,
      question: shortText(q.question || q.title, 180),
      status: q.status,
      answer: shortText(q.answer, 180),
    }));
}

function filterApiOperations(project, module) {
  return ensureArray(project.artifacts)
    .filter((a) => a.type === 'api_endpoint')
    .filter((a) => !module || a.metadata?.moduleTag === module)
    .slice(0, 30)
    .map((a) => ({
      id: a.id,
      name: a.name,
      method: a.metadata?.method,
      path: a.metadata?.path,
      description: shortText(a.description, 160),
    }));
}

function filterEntities(project, module) {
  return ensureArray(project.artifacts)
    .filter((a) => a.type === 'data_entity')
    .filter((a) => !module || a.metadata?.moduleTag === module)
    .slice(0, 30)
    .map((a) => ({
      id: a.id,
      name: a.name,
      fields: ensureArray(a.metadata?.fields).slice(0, 12),
    }));
}

function filterRoadmapPhases(project) {
  return ensureArray(project.phases).slice(0, 20).map((p, idx) => ({
    id: p.id || `phase_${idx + 1}`,
    name: p.name || p.title || `Fase ${idx + 1}`,
    description: shortText(p.description || p.summary, 160),
  }));
}

function filterTests(project) {
  return ensureArray(project.requirements)
    .filter((r) => r.type === 'test_case')
    .slice(0, 25)
    .map((r) => ({ id: r.id, title: r.title, shall: shortText(r.shall, 120) }));
}

function filterDependencyDiagrams(project, diagramType) {
  const deps = {
    c4_container: ['c4_context'],
    c4_component: ['c4_container', 'c4_context'],
    sequence: ['c4_container', 'uml_class_domain'],
    erd: ['uml_class_domain'],
    api_flow: ['openapi_spec', 'sequence'],
    deployment: ['c4_container'],
  };
  const wanted = deps[diagramType] || [];
  if (!wanted.length) return [];
  return ensureArray(project.diagramArtifacts)
    .filter((d) => wanted.includes(d.type) && d.status !== 'deprecated')
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      notation: d.notation,
      summary: shortText(d.description, 120),
    }));
}

function buildOutputSchema(diagramType) {
  const template = getDiagramType(diagramType);
  return {
    title: 'string',
    type: diagramType,
    notation: template?.recommendedNotation || getRecommendedNotation(diagramType),
    summary: 'string',
    sourceText: 'string — diagram source in the chosen notation',
    linkedRequirementIds: ['existing requirement IDs only'],
    linkedApiOperationIds: ['existing api_endpoint artifact IDs or proposed:Name'],
    linkedEntityIds: ['existing data_entity artifact IDs or proposed:Name'],
    linkedRoadmapPhaseIds: ['optional phase IDs'],
    linkedTestIds: ['optional test_case requirement IDs'],
    assumptions: ['string'],
    openQuestions: ['string'],
    validationNotes: ['string'],
  };
}

function buildMinimalContextPack(project, options = {}) {
  const {
    diagramType,
    phase = 'architecture',
    module = null,
    submodule = null,
    requirementIds = [],
    dependencyDiagramIds = [],
  } = options;

  const template = getDiagramType(diagramType);
  if (!template) {
    throw new Error(`Tipo de diagrama desconhecido: ${diagramType}`);
  }

  const pack = {
    projectSummary: projectSummary(project),
    phase,
    module,
    submodule,
    targetDiagramType: diagramType,
    targetNotation: template.recommendedNotation,
    template: {
      label: template.label,
      description: template.description,
      outputRules: template.outputRules,
      validationRules: template.validationRules,
      exampleSourceText: template.exampleSourceText,
    },
    requirements: filterRequirements(project, { module, submodule, phase, requirementIds }),
    clarifications: filterClarifications(project),
    apiOperations: template.optionalInputs.includes('apiOperations') || template.requiredInputs.includes('apiOperations')
      ? filterApiOperations(project, module)
      : [],
    dataEntities: template.optionalInputs.includes('dataEntities') || template.requiredInputs.includes('dataEntities')
      ? filterEntities(project, module)
      : [],
    roadmapPhases: template.requiredInputs.includes('roadmapPhases')
      ? filterRoadmapPhases(project)
      : [],
    tests: template.requiredInputs.includes('tests') ? filterTests(project) : [],
    dependencyDiagrams: [
      ...filterDependencyDiagrams(project, diagramType),
      ...ensureArray(project.diagramArtifacts)
        .filter((d) => dependencyDiagramIds.includes(d.id))
        .map((d) => ({
          id: d.id,
          title: d.title,
          type: d.type,
          notation: d.notation,
          sourceText: shortText(d.sourceText, 800),
        })),
    ],
    outputSchema: buildOutputSchema(diagramType),
  };

  return pack;
}

function buildDiagramGenerationPrompt(contextPack) {
  const lines = [
    'You are a software architecture assistant. Generate ONE diagram artifact for a system project.',
    'Return ONLY valid JSON matching outputSchema. No markdown fences.',
    '',
    '## Rules',
    '- Do NOT invent requirement IDs — use only IDs from requirements[]',
    '- Mark proposed APIs/entities with proposed: prefix in linked arrays',
    '- sourceText must be complete and valid for the target notation',
    '- phase is architecture only',
    '',
    '## outputSchema',
    JSON.stringify(contextPack.outputSchema, null, 2),
    '',
    '## Context pack (minimal — do not assume data not listed here)',
    JSON.stringify({
      projectSummary: contextPack.projectSummary,
      phase: contextPack.phase,
      module: contextPack.module,
      submodule: contextPack.submodule,
      targetDiagramType: contextPack.targetDiagramType,
      targetNotation: contextPack.targetNotation,
      template: contextPack.template,
      requirements: contextPack.requirements,
      clarifications: contextPack.clarifications,
      apiOperations: contextPack.apiOperations,
      dataEntities: contextPack.dataEntities,
      roadmapPhases: contextPack.roadmapPhases,
      tests: contextPack.tests,
      dependencyDiagrams: contextPack.dependencyDiagrams,
    }, null, 2),
  ];
  return lines.join('\n');
}

module.exports = {
  buildMinimalContextPack,
  buildDiagramGenerationPrompt,
  listDiagramTemplates,
  projectSummary,
};
