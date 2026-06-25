const crypto = require('crypto');
const { renderMarkdownToHtml, extractMermaidBlocks } = require('./markdown');
// Required lazily to avoid a circular dependency (phase-content requires this module for STAGE_ORDER).
function getPhaseContent() {
  return require('./phase-content');
}

const MODULE_TAGS = [
  'CustomerNeed',
  'Frontend',
  'Backend',
  'Database',
  'API',
  'Integration',
  'Tests',
  'Operations',
];

const TRACE_NODE_TYPES = [
  'client_request',
  'business_objective',
  'capability',
  'cluster',
  'stakeholder_requirement',
  'technical_requirement',
  'requirement',
  'artifact',
  'architecture_object',
  'data_entity',
  'api_endpoint',
  'test_case',
  'deliverable',
  'monitoring_signal',
];

const INFORMATION_TYPES = [
  'audio_meeting',
  'free_text',
  'meeting_minutes',
  'client_feedback',
  'new_requirement',
  'requirement_change',
  'functional_diagram',
  'technical_document',
  'ai_response',
  'bug_incident',
  'improvement_idea',
];

const AGENT_TYPES = [
  'requirement_grouping',
  'reverse_idea',
  'diagram_to_requirements',
  'requirements_to_architecture',
  'prompt_builder',
  'alternative_output_parser',
  'impact_regeneration',
];

const ONION_LAYERS = [
  { id: 'client_request', label: 'Pedido do cliente' },
  { id: 'business_objective', label: 'Objetivo de negócio' },
  { id: 'capability', label: 'Funcionalidade do produto' },
  { id: 'cluster', label: 'Grupo de requisitos' },
  { id: 'stakeholder_requirement', label: 'Requisito de negócio' },
  { id: 'technical_requirement', label: 'Requisito técnico' },
  { id: 'architecture_object', label: 'Componente de arquitectura' },
  { id: 'implementation_module', label: 'Módulo de implementação' },
  { id: 'api_entity', label: 'API, entidade ou ecrã' },
  { id: 'test_case', label: 'Caso de teste' },
  { id: 'deliverable', label: 'Entregável' },
  { id: 'monitoring_signal', label: 'Monitorização' },
];

/** Explicações em linguagem simples — expostas na UI */
const PLATFORM_CONCEPTS = {
  stage: {
    title: 'Fase de entrega',
    short: 'Etapa do projecto: ideia → descoberta → requisitos → arquitectura → construção → entrega.',
  },
  capability: {
    title: 'Funcionalidade do produto',
    short: 'Bloco de valor que o utilizador reconhece — algo que o sistema «sabe fazer» de ponta a ponta.',
    example: 'City Pass: «Comprar plano», «Gerar cupom», «Validar cupom no restaurante».',
  },
  cluster: {
    title: 'Grupo de requisitos',
    short: 'Requisitos relacionados dentro de uma funcionalidade — como um epic ou história agrupada.',
    example: 'Grupo «Login social» com os requisitos de Google, Apple e e-mail.',
  },
  requirement: {
    title: 'Requisito',
    short: 'Descrição verificável do que o sistema deve fazer (negócio) ou como deve ser feito (técnico).',
  },
  module: {
    title: 'Módulo técnico',
    short: 'Onde o trabalho é implementado: ecrãs (Frontend), serviços (Backend) ou dados (Base de dados).',
  },
  architecturePack: {
    title: 'Pacote de arquitectura',
    short: 'Desenho técnico: componentes, tabelas de dados, APIs e riscos para um módulo.',
  },
  artifact: {
    title: 'Artefacto',
    short: 'Documento ou resultado produzido numa fase — diagrama, pacote técnico, nota de reunião.',
  },
  humanReview: {
    title: 'Revisão humana',
    short: 'Antes de gravar o que a IA propôs, alguém da equipa lê, valida e aprova as alterações.',
  },
  traceLink: {
    title: 'Ligação de rastreabilidade',
    short: 'Liga duas peças do projecto — ex.: «este requisito vem deste pedido do cliente».',
  },
  snapshot: {
    title: 'Snapshot de versão',
    short: 'Cópia do projecto num momento — para comparar ou voltar atrás com segurança.',
  },
  promptRun: {
    title: 'Execução de agente',
    short: 'Prompt enviado à IA + resposta colada. Submetes para revisão antes de aplicar ao projecto.',
  },
};

const STAGE_CONCEPT_KEYS = {
  idea: ['stage', 'artifact'],
  discovery: ['stage', 'requirement'],
  requirements: ['capability', 'cluster', 'requirement', 'humanReview'],
  architecture: ['architecturePack', 'module', 'artifact'],
  roadmap: ['stage', 'artifact'],
  implementation: ['module', 'requirement'],
  validation: ['requirement', 'artifact'],
  delivery: ['artifact', 'stage'],
  operations: ['artifact', 'traceLink'],
};

const STAGE_FOCUS = {
  idea: 'Clarificar o problema, para quem é a solução e o que entra no primeiro release.',
  discovery: 'Recolher contexto do cliente, atas e pedidos antes de escrever requisitos.',
  requirements: 'Organizar requisitos por funcionalidade do produto e validar o que falta clarificar.',
  architecture: 'Definir componentes, dados e APIs por módulo técnico (Frontend, Backend, etc.).',
  roadmap: 'Ordenar fases e dependências — o que se constrói primeiro.',
  implementation: 'Construir em partes pequenas, ligadas aos requisitos aprovados.',
  validation: 'Confirmar com testes que o sistema cumpre o acordado.',
  delivery: 'Preparar documentação e entrega ao cliente.',
  operations: 'Acompanhar em produção e registar melhorias ou incidentes.',
};

const STAGE_NEXT_HINT = {
  idea: 'Completa o resumo da ideia (Idea Brief) e avança para Descoberta para mapear o contexto.',
  discovery: 'Consolida atas e feedback; depois agrupa requisitos por funcionalidade do produto.',
  requirements: 'Aprova os grupos de requisitos e gera o pacote de arquitectura por módulo.',
  architecture: 'Valida o desenho técnico e monta o roadmap de implementação.',
  roadmap: 'Divide a fase actual em tarefas pequenas para desenvolvimento.',
  implementation: 'Implementa e liga cada entrega aos requisitos correspondentes.',
  validation: 'Confirma aceitação e prepara o pacote de entrega.',
  delivery: 'Entrega ao cliente e define o que monitorizar em produção.',
  operations: 'Regista métricas e incidentes como novos pedidos de alteração.',
};

const STAGE_ORDER = [
  'idea', 'discovery', 'requirements', 'architecture', 'roadmap',
  'implementation', 'validation', 'delivery', 'operations',
];

const STAGE_TAB_LINKS = {
  idea: [
    { tab: 'projeto', label: 'Visão do projecto', hint: 'Alterações afectam a ideia inicial' },
    { tab: 'documentos', label: 'Documentos base', hint: 'Contexto de negócio' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Ideia' },
  ],
  discovery: [
    { tab: 'documentos', label: 'Documentos', hint: 'Material de descoberta' },
    { tab: 'atas', label: 'Atas', hint: 'Reuniões de alinhamento' },
    { tab: 'perguntas', label: 'Perguntas', hint: 'Lacunas a clarificar' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Descoberta' },
  ],
  requirements: [
    { tab: 'requisitos', label: 'Requisitos', hint: 'Propaga para arquitectura' },
    { tab: 'perguntas', label: 'Clarificações', hint: 'Dúvidas sobre requisitos' },
    { tab: 'atas', label: 'Atas', hint: 'Decisões que mudam requisitos' },
    { tab: 'documentos', label: 'Texto base', hint: 'Importar e gerar' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Requisitos' },
  ],
  architecture: [
    { tab: 'deliveryos', label: 'Explorador de arquitectura', hint: 'Diagramas e componentes' },
    { tab: 'requisitos', label: 'Requisitos ligados', hint: 'Rastrear origem' },
    { tab: 'fases', label: 'Riscos técnicos', hint: 'Impacto no plano' },
    { tab: 'atas', label: 'Atas', hint: 'Mudanças de arquitectura' },
  ],
  roadmap: [
    { tab: 'fases', label: 'Fases & Riscos', hint: 'Roadmap comercial' },
    { tab: 'requisitos', label: 'Requisitos', hint: 'Priorização' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Roadmap' },
  ],
  implementation: [
    { tab: 'requisitos', label: 'Requisitos', hint: 'Critérios de implementação' },
    { tab: 'gerar', label: 'Gerar documentação', hint: 'Docs técnicos' },
    { tab: 'fases', label: 'Plano', hint: 'Fases de execução' },
  ],
  validation: [
    { tab: 'requisitos', label: 'Requisitos', hint: 'Verificação SMART' },
    { tab: 'perguntas', label: 'Perguntas abertas', hint: 'Bloqueios' },
    { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fase Validação' },
  ],
  delivery: [
    { tab: 'gerar', label: 'Documentação final', hint: 'Pacotes de entrega' },
    { tab: 'projeto', label: 'Estado do projecto', hint: 'Fecho' },
    { tab: 'atas', label: 'Atas', hint: 'Aceitação e scope final' },
  ],
  operations: [
    { tab: 'atividade', label: 'Actividade', hint: 'Histórico' },
    { tab: 'deliveryos', label: 'Operações', hint: 'Monitorização' },
  ],
};

const TAB_STAGE_AFFINITY = {
  projeto: 'idea',
  documentos: 'discovery',
  atas: 'requirements',
  perguntas: 'requirements',
  requisitos: 'requirements',
  fases: 'roadmap',
  gerar: 'delivery',
  deliveryos: null,
  atividade: 'operations',
  definicoes: null,
};

const MEETING_IMPACT_SCOPES = [
  { id: 'discovery', label: 'Descoberta / alinhamento', stageId: 'discovery' },
  { id: 'idea', label: 'Ideia / visão', stageId: 'idea' },
  { id: 'requirements', label: 'Requisitos', stageId: 'requirements' },
  { id: 'architecture', label: 'Arquitectura', stageId: 'architecture' },
  { id: 'delivery', label: 'Entrega final', stageId: 'delivery' },
];

const MEETING_IMPACT_PROPAGATION = {
  discovery: {
    upstream: ['idea'],
    downstream: ['requirements', 'architecture', 'roadmap'],
    hint: 'Alinhamentos iniciais — pode afectar ideia (atrás) e requisitos/arquitectura (frente).',
  },
  idea: {
    upstream: [],
    downstream: ['discovery', 'requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery'],
    hint: 'Mudança de visão — propaga por quase todas as fases posteriores.',
  },
  requirements: {
    upstream: ['idea', 'discovery'],
    downstream: ['architecture', 'roadmap', 'implementation', 'validation', 'delivery'],
    hint: 'Decisões de requisitos — rever descoberta e actualizar arquitectura e entrega.',
  },
  architecture: {
    upstream: ['requirements', 'discovery'],
    downstream: ['roadmap', 'implementation', 'validation', 'delivery'],
    hint: 'Mudança técnica — validar requisitos de origem e plano de implementação.',
  },
  delivery: {
    upstream: ['validation', 'implementation', 'requirements', 'architecture'],
    downstream: ['operations'],
    hint: 'Aceitação ou scope final — pode exigir revisão de fases anteriores.',
  },
};

function buildMinutePropagationPlan(minutes) {
  const list = ensureArray(minutes);
  const primaryStageIds = new Set();
  const upstreamStageIds = new Set();
  const downstreamStageIds = new Set();
  const hints = [];

  for (const minute of list) {
    const scope = textOr(minute?.impactScope, 'requirements');
    primaryStageIds.add(textOr(minute?.targetStageId, scope));
    const map = MEETING_IMPACT_PROPAGATION[scope] || MEETING_IMPACT_PROPAGATION.requirements;
    map.upstream.forEach((id) => upstreamStageIds.add(id));
    map.downstream.forEach((id) => downstreamStageIds.add(id));
    if (map.hint) hints.push(map.hint);
  }

  const allAffectedStageIds = [...new Set([
    ...primaryStageIds,
    ...upstreamStageIds,
    ...downstreamStageIds,
  ])].filter((id) => STAGE_ORDER.includes(id));

  return {
    primaryStageIds: [...primaryStageIds],
    upstreamStageIds: [...upstreamStageIds].filter((id) => STAGE_ORDER.includes(id)),
    downstreamStageIds: [...downstreamStageIds].filter((id) => STAGE_ORDER.includes(id)),
    allAffectedStageIds,
    hints: [...new Set(hints)],
  };
}

function buildMinutePropagationPrompt(project, minutes, plan) {
  const minuteBlock = ensureArray(minutes).map((entry, idx) => {
    const scope = textOr(entry.impactScope, 'requirements');
    return `### Ata ${idx + 1} (${entry.meetingDate || entry.createdAt})
Impacto declarado: ${scope}
Fase alvo: ${textOr(entry.targetStageId, scope)}

${entry.rawText || entry.bodyMarkdown || ''}`;
  }).join('\n\n');

  const stageLine = (ids) => ids.map((id) => `- ${id}: ${STAGE_FOCUS[id] || id}`).join('\n');

  return `# Propagação de alterações de atas na linha de entrega

## Projecto
${project.name} (${project.clientName || 'cliente'})

## Fases afectadas (plano automático)
**Fase principal:** ${plan.primaryStageIds.join(', ')}
**Rever para trás (upstream):**
${stageLine(plan.upstreamStageIds) || '- (nenhuma)'}
**Actualizar para a frente (downstream):**
${stageLine(plan.downstreamStageIds) || '- (nenhuma)'}

## Instruções
Analise as atas abaixo. Para cada fase afectada, indique:
1. O que deve ser actualizado (requisitos, arquitectura, roadmap, etc.)
2. Se a alteração é obrigatória ou recomendada
3. Riscos se não propagar

Responda em JSON:
\`\`\`json
{
  "summaryMarkdown": "",
  "stageUpdates": [
    { "stageId": "requirements", "direction": "downstream", "priority": "high", "changesMarkdown": "", "linkedRequirementIds": [] }
  ],
  "openQuestions": [],
  "suggestedHumanReview": true
}
\`\`\`

## Atas
${minuteBlock}
`;
}

const STAGE_TRANSITION_AGENTS = {
  'idea->discovery': { forward: 'Expandir contexto e stakeholders a partir da ideia', backward: null },
  'discovery->requirements': { forward: 'Gerar requisitos de negócio e técnicos', backward: 'Resumir ideia a partir da descoberta' },
  'requirements->architecture': { forward: 'Gerar pacote de arquitectura por funcionalidade/módulo', backward: 'Derivar requisitos a partir da arquitectura' },
  'architecture->roadmap': { forward: 'Gerar roadmap e fases', backward: 'Actualizar arquitectura com base no roadmap' },
  'roadmap->implementation': { forward: 'Gerar plano de implementação por unidade', backward: 'Actualizar roadmap com progresso' },
  'implementation->validation': { forward: 'Gerar casos de teste e critérios de aceitação', backward: 'Identificar gaps de implementação' },
  'validation->delivery': { forward: 'Gerar pacote de entrega e documentação', backward: 'Regenerar validação' },
  'delivery->operations': { forward: 'Definir monitorização e operação', backward: 'Actualizar entrega' },
};

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeModuleTags(raw, fallbackModule) {
  const fromArray = ensureArray(raw).map((t) => String(t || '').trim()).filter(Boolean);
  if (fromArray.length) {
    return fromArray.filter((t) => MODULE_TAGS.includes(t) || ['Frontend', 'Backend', 'Database'].includes(t));
  }
  const mod = textOr(fallbackModule);
  if (mod && MODULE_TAGS.includes(mod)) return [mod];
  if (mod === 'Frontend' || mod === 'Backend' || mod === 'Database') return [mod];
  return mod ? [mod] : [];
}

function normalizeCapability(raw) {
  return {
    id: textOr(raw?.id, `cap_${crypto.randomUUID().slice(0, 8)}`),
    name: textOr(raw?.name, 'Nova funcionalidade'),
    summaryMarkdown: textOr(raw?.summaryMarkdown || raw?.summary),
    status: textOr(raw?.status, 'draft'),
    moduleIds: normalizeModuleTags(raw?.moduleIds),
    requirementIds: ensureArray(raw?.requirementIds).map(String),
    clusterIds: ensureArray(raw?.clusterIds).map(String),
    risks: ensureArray(raw?.risks).map((r) => (typeof r === 'string' ? r : textOr(r?.text || r?.description))),
    openQuestions: ensureArray(raw?.openQuestions).map((q) => (typeof q === 'string' ? q : textOr(q?.text || q?.question))),
    nextAction: textOr(raw?.nextAction),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeCluster(raw) {
  return {
    id: textOr(raw?.id, `clu_${crypto.randomUUID().slice(0, 8)}`),
    capabilityId: textOr(raw?.capabilityId),
    name: textOr(raw?.name, 'Novo grupo'),
    summaryMarkdown: textOr(raw?.summaryMarkdown || raw?.summary),
    requirementIds: ensureArray(raw?.requirementIds).map(String),
    clientRequestText: textOr(raw?.clientRequestText),
    createdAt: textOr(raw?.createdAt, nowIso()),
    updatedAt: textOr(raw?.updatedAt, nowIso()),
  };
}

function normalizeClientRequest(raw) {
  return {
    id: textOr(raw?.id, `cr_${crypto.randomUUID().slice(0, 8)}`),
    text: textOr(raw?.text),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.text),
    source: textOr(raw?.source, 'manual'),
    capabilityIds: ensureArray(raw?.capabilityIds).map(String),
    createdAt: textOr(raw?.createdAt, nowIso()),
  };
}

function normalizeBusinessObjective(raw) {
  return {
    id: textOr(raw?.id, `bo_${crypto.randomUUID().slice(0, 8)}`),
    text: textOr(raw?.text),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.text),
    clientRequestId: textOr(raw?.clientRequestId),
    capabilityIds: ensureArray(raw?.capabilityIds).map(String),
    createdAt: textOr(raw?.createdAt, nowIso()),
  };
}

function normalizePromptRun(raw) {
  return {
    id: textOr(raw?.id, `prun_${crypto.randomUUID().slice(0, 8)}`),
    agentType: textOr(raw?.agentType, 'prompt_builder'),
    stageId: textOr(raw?.stageId),
    capabilityId: textOr(raw?.capabilityId),
    moduleTag: textOr(raw?.moduleTag),
    targetOutput: textOr(raw?.targetOutput),
    systemPrompt: textOr(raw?.systemPrompt),
    stageInstruction: textOr(raw?.stageInstruction),
    contextPack: raw?.contextPack && typeof raw.contextPack === 'object' ? raw.contextPack : {},
    taskPrompt: textOr(raw?.taskPrompt),
    outputSchema: textOr(raw?.outputSchema),
    fullPrompt: textOr(raw?.fullPrompt || raw?.prompt),
    modelUsed: textOr(raw?.modelUsed, 'manual'),
    rawOutput: textOr(raw?.rawOutput),
    parsedOutput: raw?.parsedOutput ?? null,
    summaryMarkdown: textOr(raw?.summaryMarkdown),
    status: textOr(raw?.status, 'pending_review'),
    version: numberOr(raw?.version, 1),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
    reviewedAt: textOr(raw?.reviewedAt),
    reviewedBy: textOr(raw?.reviewedBy),
  };
}

function normalizeHumanReview(raw) {
  const status = textOr(raw?.status, 'pending');
  return {
    id: textOr(raw?.id, `hr_${crypto.randomUUID().slice(0, 8)}`),
    type: textOr(raw?.type, 'agent_output'),
    title: textOr(raw?.title),
    summaryMarkdown: textOr(raw?.summaryMarkdown),
    bodyMarkdown: textOr(raw?.bodyMarkdown),
    sourceType: textOr(raw?.sourceType),
    sourceId: textOr(raw?.sourceId),
    promptRunId: textOr(raw?.promptRunId),
    suggestedChanges: raw?.suggestedChanges ?? null,
    status: ['pending', 'approved', 'changes_requested', 'rejected'].includes(status) ? status : 'pending',
    readingTimeMinutes: numberOr(raw?.readingTimeMinutes, 5),
    decisionsCount: numberOr(raw?.decisionsCount, 0),
    createdAt: textOr(raw?.createdAt, nowIso()),
    resolvedAt: textOr(raw?.resolvedAt),
    resolvedBy: textOr(raw?.resolvedBy),
    resolutionNotes: textOr(raw?.resolutionNotes),
  };
}

function normalizeVersionSnapshot(raw) {
  return {
    id: textOr(raw?.id, `snap_${crypto.randomUUID().slice(0, 8)}`),
    label: textOr(raw?.label, 'Snapshot'),
    description: textOr(raw?.description),
    stageId: textOr(raw?.stageId),
    snapshotData: raw?.snapshotData ?? {},
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeAlternativeResponse(raw) {
  return {
    id: textOr(raw?.id, `alt_${crypto.randomUUID().slice(0, 8)}`),
    promptRunId: textOr(raw?.promptRunId),
    modelName: textOr(raw?.modelName, 'external'),
    rawOutput: textOr(raw?.rawOutput),
    parsedOutput: raw?.parsedOutput ?? null,
    diffSummary: textOr(raw?.diffSummary),
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function normalizeInformationEntry(raw) {
  return {
    id: textOr(raw?.id, `info_${crypto.randomUUID().slice(0, 8)}`),
    type: INFORMATION_TYPES.includes(textOr(raw?.type)) ? textOr(raw?.type) : 'free_text',
    stageId: textOr(raw?.stageId, 'requirements'),
    bodyMarkdown: textOr(raw?.bodyMarkdown || raw?.content || raw?.text),
    analyzeWithAgent: raw?.analyzeWithAgent === true,
    status: textOr(raw?.status, 'stored'),
    classification: raw?.classification ?? null,
    createdAt: textOr(raw?.createdAt, nowIso()),
    createdBy: textOr(raw?.createdBy),
  };
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProjectV3Fields(project) {
  return {
    capabilities: ensureArray(project.capabilities).map(normalizeCapability),
    requirementClusters: ensureArray(project.requirementClusters).map(normalizeCluster),
    clientRequests: ensureArray(project.clientRequests).map(normalizeClientRequest),
    businessObjectives: ensureArray(project.businessObjectives).map(normalizeBusinessObjective),
    promptRuns: ensureArray(project.promptRuns).map(normalizePromptRun),
    humanReviews: ensureArray(project.humanReviews).map(normalizeHumanReview),
    versionSnapshots: ensureArray(project.versionSnapshots).map(normalizeVersionSnapshot),
    alternativeResponses: ensureArray(project.alternativeResponses).map(normalizeAlternativeResponse),
    informationEntries: ensureArray(project.informationEntries).map(normalizeInformationEntry),
    nextDecision: textOr(project.nextDecision),
    ideaBriefMarkdown: textOr(project.ideaBriefMarkdown),
  };
}

function enrichRequirementWithModuleTags(requirement) {
  if (!requirement) return requirement;
  const tags = normalizeModuleTags(requirement.moduleTags, requirement.module);
  return { ...requirement, moduleTags: tags.length ? tags : normalizeModuleTags([], requirement.module) };
}

function autoDeriveTraceLinks(project) {
  const links = [];
  const seen = new Set();
  const add = (sourceType, sourceId, targetType, targetId, relationshipType, confidence = 0.9) => {
    if (!sourceId || !targetId) return;
    const key = `${sourceType}:${sourceId}:${relationshipType}:${targetType}:${targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      id: `tl_${crypto.randomUUID().slice(0, 8)}`,
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      confidence,
      validatedByHuman: false,
      autoDerived: true,
      createdAt: nowIso(),
    });
  };

  for (const cap of ensureArray(project.capabilities)) {
    for (const reqId of cap.requirementIds) {
      add('capability', cap.id, 'requirement', reqId, 'contains', 1);
    }
    for (const cluId of cap.clusterIds) {
      add('capability', cap.id, 'cluster', cluId, 'contains', 1);
    }
  }

  for (const clu of ensureArray(project.requirementClusters)) {
    for (const reqId of clu.requirementIds) {
      add('cluster', clu.id, 'requirement', reqId, 'contains', 1);
    }
    if (clu.capabilityId) add('capability', clu.capabilityId, 'cluster', clu.id, 'contains', 1);
  }

  for (const req of ensureArray(project.requirements)) {
    const type = String(req.type || '');
    const nodeType = type === 'stakeholder' ? 'stakeholder_requirement' : type === 'functional' ? 'technical_requirement' : 'requirement';
    if (req.stakeholderRequirementLink) {
      add(nodeType, req.id, 'stakeholder_requirement', req.stakeholderRequirementLink, 'satisfies', 0.95);
    }
    for (const relId of ensureArray(req.relatedRequirementIds)) {
      add(nodeType, req.id, 'requirement', relId, 'depends_on', 0.8);
    }
  }

  for (const cr of ensureArray(project.clientRequests)) {
    for (const capId of cr.capabilityIds) {
      add('client_request', cr.id, 'capability', capId, 'derives_from', 0.85);
    }
  }

  for (const bo of ensureArray(project.businessObjectives)) {
    if (bo.clientRequestId) add('business_objective', bo.id, 'client_request', bo.clientRequestId, 'derives_from', 0.9);
    for (const capId of bo.capabilityIds) {
      add('business_objective', bo.id, 'capability', capId, 'derives_from', 0.85);
    }
  }

  for (const art of ensureArray(project.artifacts)) {
    for (const reqId of ensureArray(art.relatedRequirementIds)) {
      add('artifact', art.id, 'requirement', reqId, 'implements', 0.85);
    }
  }

  return links;
}

function mergeTraceLinks(existing, derived) {
  const manual = ensureArray(existing).filter((l) => !l.autoDerived);
  const manualKeys = new Set(manual.map((l) => `${l.sourceType}:${l.sourceId}:${l.relationshipType}:${l.targetType}:${l.targetId}`));
  const merged = [...manual];
  for (const d of derived) {
    const key = `${d.sourceType}:${d.sourceId}:${d.relationshipType}:${d.targetType}:${d.targetId}`;
    if (!manualKeys.has(key)) merged.push(d);
  }
  return merged;
}

/**
 * Deterministic, human-readable coverage report describing how requirements,
 * architecture and development connect to the ideia/descoberta upstream and the
 * monitorização downstream. Used as a reviewable log when re-applying links.
 */
function buildPhaseLinkReport(project, { previousLinkCount = 0, currentLinkCount = 0 } = {}) {
  const phaseContent = getPhaseContent();
  const requirements = ensureArray(project.requirements);
  const capabilities = ensureArray(project.capabilities);
  const clusters = ensureArray(project.requirementClusters);
  const artifacts = ensureArray(project.artifacts);

  const linkedToCapability = new Set();
  for (const cap of capabilities) {
    for (const id of ensureArray(cap.requirementIds)) linkedToCapability.add(id);
  }
  for (const clu of clusters) {
    for (const id of ensureArray(clu.requirementIds)) linkedToCapability.add(id);
  }

  const linkedToArtifact = new Set();
  const archArtifacts = [];
  for (const art of artifacts) {
    const reqIds = ensureArray(art.relatedRequirementIds);
    for (const id of reqIds) linkedToArtifact.add(id);
    if (['architecture', 'diagram', 'data_model', 'api_spec'].includes(String(art.type || ''))) {
      archArtifacts.push(art);
    }
  }

  const orphans = requirements.filter((r) => !linkedToCapability.has(r.id) && !linkedToArtifact.has(r.id));
  const withoutDownstream = requirements.filter((r) => !linkedToArtifact.has(r.id));

  const byStage = {};
  for (const r of requirements) {
    const sid = phaseContent.resolveRequirementStageId(r);
    byStage[sid] = (byStage[sid] || 0) + 1;
  }

  const added = Math.max(0, currentLinkCount - previousLinkCount);
  const ts = nowIso();
  const lines = [];
  lines.push(`# Log de ligações entre fases`);
  lines.push('');
  lines.push(`Gerado automaticamente em ${ts} por código determinístico (sem IA).`);
  lines.push('');
  lines.push(`## Resumo`);
  lines.push(`- Requisitos no projeto: **${requirements.length}**`);
  lines.push(`- Ligações de rastreabilidade totais: **${currentLinkCount}** (${added} nova(s) nesta execução)`);
  lines.push(`- Requisitos ligados a uma funcionalidade/ideia: **${linkedToCapability.size}/${requirements.length}**`);
  lines.push(`- Requisitos com arquitetura/desenvolvimento associado: **${linkedToArtifact.size}/${requirements.length}**`);
  lines.push(`- Artefactos de arquitetura/diagramas: **${archArtifacts.length}**`);
  lines.push('');
  lines.push(`## Distribuição de requisitos por fase`);
  const stageOrder = ['idea', 'discovery', 'requirements', 'architecture', 'implementation', 'testing', 'deployment', 'handover', 'monitoring', 'validation', 'delivery', 'roadmap'];
  const sortedStages = Object.keys(byStage).sort((a, b) => {
    const ia = stageOrder.indexOf(a);
    const ib = stageOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  if (sortedStages.length) {
    for (const sid of sortedStages) lines.push(`- ${sid}: ${byStage[sid]}`);
  } else {
    lines.push('- (sem requisitos)');
  }
  lines.push('');
  lines.push(`## A rever`);
  if (orphans.length) {
    lines.push(`### Requisitos sem ligação a ideia nem a arquitetura (${orphans.length})`);
    for (const r of orphans.slice(0, 40)) {
      lines.push(`- \`${r.id}\` — ${textOr(r.title, r.shall || r.need || 'sem título')}`);
    }
    if (orphans.length > 40) lines.push(`- … e mais ${orphans.length - 40}.`);
  } else {
    lines.push(`- Todos os requisitos estão ligados a, pelo menos, uma funcionalidade ou artefacto.`);
  }
  lines.push('');
  if (withoutDownstream.length) {
    lines.push(`### Requisitos ainda sem arquitetura/desenvolvimento (${withoutDownstream.length})`);
    for (const r of withoutDownstream.slice(0, 40)) {
      lines.push(`- \`${r.id}\` — ${textOr(r.title, r.shall || r.need || 'sem título')}`);
    }
    if (withoutDownstream.length > 40) lines.push(`- … e mais ${withoutDownstream.length - 40}.`);
  }
  lines.push('');
  lines.push(`> Reveja este log e aprove para registar que a rastreabilidade entre ideia → requisitos → arquitetura → desenvolvimento → monitorização foi reaplicada.`);

  const markdown = lines.join('\n');
  const summary = `Ligações reaplicadas: ${currentLinkCount} ligações (${added} nova(s)). ${linkedToCapability.size}/${requirements.length} requisitos ligados a funcionalidades, ${linkedToArtifact.size}/${requirements.length} com arquitetura. ${orphans.length} requisito(s) por rever.`;

  return {
    markdown,
    summary,
    stats: {
      requirements: requirements.length,
      totalLinks: currentLinkCount,
      addedLinks: added,
      linkedToCapability: linkedToCapability.size,
      linkedToArtifact: linkedToArtifact.size,
      orphans: orphans.length,
    },
  };
}

function buildContextPack(project, options = {}) {
  const { stageId, capabilityId, maxRequirements = 30 } = options;
  const cap = capabilityId ? ensureArray(project.capabilities).find((c) => c.id === capabilityId) : null;
  const reqIds = cap ? new Set(cap.requirementIds) : null;
  const reqs = ensureArray(project.requirements)
    .filter((r) => !reqIds || reqIds.has(r.id))
    .slice(0, maxRequirements);

  return {
    ideaBrief: textOr(project.ideaBriefMarkdown).slice(0, 2000),
    projectSummary: {
      name: project.name,
      clientName: project.clientName,
      description: textOr(project.description).slice(0, 500),
    },
    capability: cap ? { id: cap.id, name: cap.name, summary: cap.summaryMarkdown } : null,
    requirementsSummary: reqs.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      shall: textOr(r.shall).slice(0, 200),
      status: r.status,
      moduleTags: r.moduleTags || [],
    })),
    openQuestions: ensureArray(project.clarificationQuestions)
      .filter((q) => ['open', 'sent', 'blocked'].includes(q.status))
      .slice(0, 15)
      .map((q) => q.question),
    recentDecisions: ensureArray(project.humanReviews)
      .filter((r) => r.status === 'approved')
      .slice(0, 5)
      .map((r) => r.title),
    stageId: stageId || null,
  };
}

function buildGroupingPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 80 });
  return `Tu és um analista de systems engineering. Agrupa requisitos em capabilities e clusters humanos.

Projeto: ${project.name} (${project.clientName})

Requisitos existentes:
${JSON.stringify(ctx.requirementsSummary, null, 2)}

Responde APENAS com JSON válido:
{
  "capabilities": [{ "name": "", "summaryMarkdown": "", "moduleIds": [], "requirementIds": [], "risks": [], "openQuestions": [], "nextAction": "" }],
  "requirementClusters": [{ "capabilityName": "", "name": "", "summaryMarkdown": "", "requirementIds": [], "clientRequestText": "" }],
  "moduleMappings": [{ "requirementId": "", "moduleTags": ["Frontend","Backend"] }],
  "openQuestions": [],
  "assumptions": []
}`;
}

function buildReverseIdeaPrompt(project) {
  const ctx = buildContextPack(project, { maxRequirements: 50 });
  return `Gera Idea Brief a partir dos requisitos aprovados. Marca como "generated backwards".

Contexto:
${JSON.stringify(ctx, null, 2)}

Responde APENAS com JSON:
{
  "ideaBriefMarkdown": "",
  "problemStatement": "",
  "targetUsers": [],
  "businessValue": "",
  "initialScope": "",
  "requiresHumanConfirmation": true
}`;
}

function buildDiagramToRequirementsPrompt(project, bodyMarkdown) {
  return `Analisa o diagrama/fluxo e gera requisitos.

Diagrama:
${textOr(bodyMarkdown).slice(0, 8000)}

Responde APENAS com JSON:
{
  "stakeholderRequirements": [{ "title": "", "need": "", "shall": "" }],
  "technicalRequirements": [{ "title": "", "shall": "", "moduleTags": [] }],
  "actors": [],
  "flows": [],
  "openQuestions": [],
  "assumptions": []
}`;
}

function buildArchitecturePackPrompt(project, capabilityId, moduleTag) {
  const ctx = buildContextPack(project, { capabilityId, maxRequirements: 40 });
  return `Gera architecture pack para capability "${ctx.capability?.name || capabilityId}" módulo "${moduleTag}".

Contexto:
${JSON.stringify(ctx, null, 2)}

Responde APENAS com JSON:
{
  "architectureObjects": [{ "name": "", "type": "", "descriptionMarkdown": "" }],
  "dataEntities": [{ "name": "", "fields": [] }],
  "apiEndpoints": [{ "method": "", "path": "", "description": "" }],
  "modules": [],
  "risks": [],
  "artifacts": [{ "type": "architecture", "name": "", "description": "", "stageId": "architecture" }]
}`;
}

function buildCapabilityRequirementsPrompt(project, capabilityId) {
  const cap = ensureArray(project.capabilities).find((c) => c.id === capabilityId);
  const ctx = buildContextPack(project, { capabilityId, maxRequirements: 20 });
  return `Gera stakeholder e technical requirements APENAS para capability "${cap?.name || capabilityId}".

Context pack:
${JSON.stringify(ctx, null, 2)}

Responde APENAS com JSON:
{
  "stakeholderRequirements": [{ "title": "", "need": "", "shall": "", "moduleTags": [] }],
  "technicalRequirements": [{ "title": "", "shall": "", "condition": "", "measure": "", "moduleTags": [] }],
  "assumptions": [],
  "risks": [],
  "openQuestions": []
}`;
}

function buildStageTransitionPrompt(project, fromStageId, toStageId, direction = 'forward') {
  const fromLabel = STAGE_FOCUS[fromStageId] || fromStageId;
  const toLabel = STAGE_FOCUS[toStageId] || toStageId;
  const ctx = buildContextPack(project, { stageId: toStageId, maxRequirements: 40 });
  const transitionKey = `${fromStageId}->${toStageId}`;
  const reverseKey = `${toStageId}->${fromStageId}`;
  const hint = direction === 'forward'
    ? (STAGE_TRANSITION_AGENTS[transitionKey]?.forward || `Avançar de ${fromStageId} para ${toStageId}`)
    : (STAGE_TRANSITION_AGENTS[reverseKey]?.backward || `Retroceder: gerar ${fromStageId} a partir de ${toStageId}`);

  return `Tu és um agente de systems engineering YourLab.

Transição de fase (${direction === 'forward' ? 'AVANÇAR' : 'RETROCEDER'}):
- De: ${fromStageId} (${fromLabel})
- Para: ${toStageId} (${toLabel})
- Acção: ${hint}

Context pack (nunca enviar projecto inteiro):
${JSON.stringify(ctx, null, 2)}

Responde APENAS com JSON válido:
{
  "transitionSummaryMarkdown": "",
  "direction": "${direction}",
  "fromStageId": "${fromStageId}",
  "toStageId": "${toStageId}",
  "artifacts": [{ "type": "", "name": "", "description": "", "bodyMarkdown": "", "stageId": "${toStageId}" }],
  "stakeholderRequirements": [],
  "technicalRequirements": [],
  "capabilities": [],
  "requirementClusters": [],
  "openQuestions": [],
  "risks": [],
  "nextDecision": "",
  "requiresHumanConfirmation": true
}`;
}

function buildPromptRunFull(systemPrompt, stageInstruction, contextPack, taskPrompt, outputSchema) {
  return [systemPrompt, stageInstruction, `Context Pack:\n${JSON.stringify(contextPack, null, 2)}`, taskPrompt, outputSchema].filter(Boolean).join('\n\n---\n\n');
}

function applyGroupingResult(project, parsed, userId) {
  const caps = ensureArray(parsed.capabilities).map((c, i) => normalizeCapability({
    ...c,
    id: c.id || `cap_${String(i + 1).padStart(2, '0')}`,
    updatedAt: nowIso(),
  }));
  const capByName = new Map(caps.map((c) => [c.name.toLowerCase(), c]));
  const clusters = ensureArray(parsed.requirementClusters).map((cl, i) => {
    const cap = capByName.get(String(cl.capabilityName || '').toLowerCase());
    const normalized = normalizeCluster({
      ...cl,
      id: cl.id || `clu_${String(i + 1).padStart(2, '0')}`,
      capabilityId: cap?.id || cl.capabilityId || '',
    });
    if (cap && !cap.clusterIds.includes(normalized.id)) cap.clusterIds.push(normalized.id);
    return normalized;
  });

  for (const mapping of ensureArray(parsed.moduleMappings)) {
    const req = ensureArray(project.requirements).find((r) => r.id === mapping.requirementId);
    if (req) req.moduleTags = normalizeModuleTags(mapping.moduleTags, req.module);
  }

  return { capabilities: caps, requirementClusters: clusters };
}

function itemLabel(item, fallback = 'Item') {
  return textOr(item?.title || item?.name || item?.id, fallback);
}

function pushSection(sections, section) {
  if (!section) return;
  if (Array.isArray(section.items) && !section.items.length && !section.before && !section.after) return;
  sections.push(section);
}

function buildHumanReviewPayload(project, run, parsed, rawOutput) {
  const agentType = textOr(run?.agentType, 'agent');
  const sections = [];
  let decisionsCount = 0;

  if (!parsed) {
    if (rawOutput && rawOutput.trim()) {
      return {
        bodyMarkdown: [
          '## Output recebido (sem JSON estruturado)',
          '',
          'A resposta foi colada como texto. Revise o conteúdo bruto antes de aprovar.',
          '',
          '```',
          rawOutput.trim().slice(0, 14000),
          '```',
        ].join('\n'),
        suggestedChanges: { agentType, parsed: null, rawOutput, sections: [] },
        decisionsCount: 1,
        summaryMarkdown: `Revisão pendente: output textual de **${agentType}**.`,
      };
    }
    return {
      bodyMarkdown: [
        '## Aguarda output da IA',
        '',
        'Nenhum output foi colado ainda.',
        '',
        '1. Abra o **Prompt Workbench**',
        '2. Cole a resposta do agente',
        '3. Clique em **Submeter para revisão**',
      ].join('\n'),
      suggestedChanges: null,
      decisionsCount: 0,
      summaryMarkdown: `Aguarda output de **${agentType}**.`,
    };
  }

  const existingCapNames = new Set(ensureArray(project.capabilities).map((c) => String(c.name || '').toLowerCase()));
  const existingClusterNames = new Set(ensureArray(project.requirementClusters).map((c) => String(c.name || '').toLowerCase()));
  const existingReqIds = new Set(ensureArray(project.requirements).map((r) => r.id));
  const existingArtifactNames = new Set(ensureArray(project.artifacts).map((a) => String(a.name || '').toLowerCase()));

  if (parsed.ideaBriefMarkdown) {
    const had = Boolean(textOr(project.ideaBriefMarkdown));
    pushSection(sections, {
      kind: had ? 'updated' : 'created',
      entityType: 'ideaBrief',
      label: had ? 'Idea Brief (melhoria)' : 'Idea Brief (criado)',
      before: had ? project.ideaBriefMarkdown.slice(0, 2000) : null,
      after: parsed.ideaBriefMarkdown.slice(0, 4000),
    });
    decisionsCount += 1;
  }

  if (parsed.transitionSummaryMarkdown || parsed.nextDecision) {
    pushSection(sections, {
      kind: project.nextDecision ? 'updated' : 'created',
      entityType: 'stageTransition',
      label: `Transição de fase (${textOr(parsed.fromStageId, run?.stageId)} → ${textOr(parsed.toStageId, '?')})`,
      after: textOr(parsed.transitionSummaryMarkdown, parsed.nextDecision),
      before: textOr(project.nextDecision) || null,
    });
    if (parsed.nextDecision) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'nextDecision',
        label: 'Próxima decisão',
        after: parsed.nextDecision,
      });
    }
    decisionsCount += 1;
  }

  const newCaps = ensureArray(parsed.capabilities);
  if (newCaps.length) {
    const created = newCaps.filter((c) => !existingCapNames.has(String(c.name || '').toLowerCase()));
    const updated = newCaps.filter((c) => existingCapNames.has(String(c.name || '').toLowerCase()));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'capability',
        label: 'Funcionalidades novas',
        items: created.map((c) => ({ name: c.name, summary: shortText(c.summaryMarkdown, 160) })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'capability',
        label: 'Funcionalidades melhoradas',
        items: updated.map((c) => ({ name: c.name, summary: shortText(c.summaryMarkdown, 160) })),
      });
      decisionsCount += updated.length;
    }
  }

  const newClusters = ensureArray(parsed.requirementClusters);
  if (newClusters.length) {
    const created = newClusters.filter((c) => !existingClusterNames.has(String(c.name || '').toLowerCase()));
    const updated = newClusters.filter((c) => existingClusterNames.has(String(c.name || '').toLowerCase()));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'requirementCluster',
        label: 'Grupos de requisitos (novos)',
        items: created.map((c) => ({
          name: c.name,
          capability: c.capabilityName || c.capabilityId,
          requirements: ensureArray(c.requirementIds).length,
        })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'requirementCluster',
        label: 'Grupos de requisitos (melhorados)',
        items: updated.map((c) => ({ name: c.name, capability: c.capabilityName || c.capabilityId })),
      });
      decisionsCount += updated.length;
    }
  }

  const stakeholderReqs = ensureArray(parsed.stakeholderRequirements);
  const technicalReqs = ensureArray(parsed.technicalRequirements);
  if (stakeholderReqs.length || technicalReqs.length) {
    const allReqs = [
      ...stakeholderReqs.map((r) => ({ ...r, type: 'stakeholder' })),
      ...technicalReqs.map((r) => ({ ...r, type: 'functional' })),
    ];
    const created = allReqs.filter((r) => !r.id || !existingReqIds.has(r.id));
    const updated = allReqs.filter((r) => r.id && existingReqIds.has(r.id));
    if (created.length) {
      pushSection(sections, {
        kind: 'created',
        entityType: 'requirement',
        label: 'Requisitos (novos)',
        items: created.map((r) => ({ id: r.id || '(auto)', title: itemLabel(r), type: r.type, shall: shortText(r.shall, 120) })),
      });
      decisionsCount += created.length;
    }
    if (updated.length) {
      pushSection(sections, {
        kind: 'updated',
        entityType: 'requirement',
        label: 'Requisitos (alterados)',
        items: updated.map((r) => ({ id: r.id, title: itemLabel(r), shall: shortText(r.shall, 120) })),
      });
      decisionsCount += updated.length;
    }
  }

  const archObjects = ensureArray(parsed.architectureObjects);
  if (archObjects.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'architectureObject',
      label: 'Objectos de arquitectura',
      items: archObjects.map((o) => ({ name: o.name, type: o.type, description: shortText(o.descriptionMarkdown || o.description, 140) })),
    });
    decisionsCount += archObjects.length;
  }

  const dataEntities = ensureArray(parsed.dataEntities);
  if (dataEntities.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'dataEntity',
      label: 'Entidades de dados',
      items: dataEntities.map((e) => ({ name: e.name, fields: ensureArray(e.fields).length })),
    });
    decisionsCount += dataEntities.length;
  }

  const apiEndpoints = ensureArray(parsed.apiEndpoints);
  if (apiEndpoints.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'apiEndpoint',
      label: 'API endpoints',
      items: apiEndpoints.map((e) => ({ name: `${textOr(e.method, 'GET')} ${textOr(e.path, '/')}`, description: shortText(e.description, 100) })),
    });
    decisionsCount += apiEndpoints.length;
  }

  const artifacts = ensureArray(parsed.artifacts);
  if (artifacts.length) {
    const created = artifacts.filter((a) => !existingArtifactNames.has(String(a.name || '').toLowerCase()));
    pushSection(sections, {
      kind: 'created',
      entityType: 'artifact',
      label: 'Artefactos',
      items: created.map((a) => ({ name: a.name, type: a.type, stageId: a.stageId, description: shortText(a.description || a.bodyMarkdown, 120) })),
    });
    decisionsCount += created.length || artifacts.length;
  }

  const moduleMappings = ensureArray(parsed.moduleMappings);
  if (moduleMappings.length) {
    pushSection(sections, {
      kind: 'updated',
      entityType: 'moduleMapping',
      label: 'Mapeamento de módulos',
      items: moduleMappings.map((m) => ({ requirementId: m.requirementId, moduleTags: ensureArray(m.moduleTags).join(', ') })),
    });
    decisionsCount += moduleMappings.length;
  }

  if (ensureArray(parsed.openQuestions).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'openQuestion',
      label: 'Questões em aberto',
      items: ensureArray(parsed.openQuestions).map((q) => ({ text: typeof q === 'string' ? q : textOr(q.question || q.text) })),
    });
  }

  if (ensureArray(parsed.risks).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'risk',
      label: 'Riscos identificados',
      items: ensureArray(parsed.risks).map((r) => ({ text: typeof r === 'string' ? r : textOr(r.description || r.title) })),
    });
  }

  if (ensureArray(parsed.assumptions).length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'assumption',
      label: 'Assunções',
      items: ensureArray(parsed.assumptions).map((a) => ({ text: typeof a === 'string' ? a : textOr(a.text || a.description) })),
    });
  }

  if (!sections.length) {
    pushSection(sections, {
      kind: 'created',
      entityType: 'rawOutput',
      label: 'Output JSON',
      after: JSON.stringify(parsed, null, 2).slice(0, 8000),
    });
    decisionsCount = 1;
  }

  const kindLabel = { created: 'Criado', updated: 'Alterado / melhoria' };
  const bodyLines = [
    `## Revisão: ${agentType}`,
    '',
    `**Agente:** ${agentType}`,
    `**Destino:** ${textOr(run?.targetOutput, '—')}`,
    '',
  ];

  for (const section of sections) {
    bodyLines.push(`### ${kindLabel[section.kind] || section.kind}: ${section.label}`);
    if (section.before) {
      bodyLines.push('', '**Antes:**', '```', String(section.before).slice(0, 3000), '```');
    }
    if (section.after) {
      bodyLines.push('', '**Depois / conteúdo:**', '```', String(section.after).slice(0, 4000), '```');
    }
    if (section.items?.length) {
      bodyLines.push('');
      for (const item of section.items) {
        const parts = Object.entries(item).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `**${k}:** ${v}`);
        bodyLines.push(`- ${parts.join(' · ')}`);
      }
    }
    bodyLines.push('');
  }

  const summaryMarkdown = decisionsCount
    ? `Revisão pendente: **${agentType}** — ${decisionsCount} alteração(ões) proposta(s).`
    : `Revisão pendente: **${agentType}**.`;

  return {
    bodyMarkdown: bodyLines.join('\n'),
    suggestedChanges: { agentType, parsed, sections, rawOutput: textOr(rawOutput).slice(0, 50000) },
    decisionsCount,
    summaryMarkdown,
  };
}

function normalizeJsonInput(raw) {
  if (raw == null) return '';
  const text = String(raw)
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'")
    .trim();
  return text;
}

function parseAgentJsonOutput(raw) {
  const normalized = normalizeJsonInput(raw);
  if (!normalized) return { parsed: null, rawOutput: '', normalized: '' };
  try {
    return { parsed: JSON.parse(normalized), rawOutput: normalized, normalized };
  } catch {
    return { parsed: null, rawOutput: normalized, normalized };
  }
}

function shortText(value, max = 120) {
  const s = textOr(value);
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function buildArchitecturePackMarkdown(parsed, moduleTag = 'Backend') {
  const lines = [`# Architecture Pack — ${moduleTag}`, ''];
  for (const obj of ensureArray(parsed.architectureObjects)) {
    lines.push(`## ${obj.name} (${obj.type || 'component'})`, '', textOr(obj.descriptionMarkdown || obj.description), '');
  }
  if (ensureArray(parsed.dataEntities).length) {
    lines.push('## Entidades de dados', '');
    for (const entity of parsed.dataEntities) {
      lines.push(`### ${entity.name}`, `- ${ensureArray(entity.fields).join('\n- ')}`, '');
    }
  }
  if (ensureArray(parsed.apiEndpoints).length) {
    lines.push('## API Endpoints', '');
    for (const ep of parsed.apiEndpoints) {
      lines.push(`- **${textOr(ep.method, 'GET')} ${textOr(ep.path, '/')}** — ${textOr(ep.description)}`);
    }
    lines.push('');
  }
  if (ensureArray(parsed.modules).length) {
    lines.push('## Módulos', '');
    for (const mod of parsed.modules) {
      lines.push(`- **${mod.name}**${mod.submodules?.length ? `: ${mod.submodules.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  if (ensureArray(parsed.risks).length) {
    lines.push('## Riscos técnicos', '');
    for (const risk of parsed.risks) {
      const label = typeof risk === 'string' ? risk : `${risk.id || ''} ${risk.title || ''}`.trim();
      const desc = typeof risk === 'string' ? '' : textOr(risk.description);
      lines.push(`- **${label}**${desc ? `: ${desc}` : ''}`);
    }
  }
  return lines.join('\n');
}

function applyArchitecturePack(project, parsed, run, userId) {
  const moduleTag = textOr(run?.moduleTag, 'Backend');
  const capabilityId = textOr(run?.capabilityId);
  const cap = ensureArray(project.capabilities).find((c) => c.id === capabilityId);
  const packLabel = cap?.name || moduleTag;
  const packBody = buildArchitecturePackMarkdown(parsed, packLabel);
  const packName = textOr(
    ensureArray(parsed.artifacts)[0]?.name,
    `Architecture Pack — ${packLabel}`
  );
  const now = nowIso();

  project.technicalApproach = project.technicalApproach || {};
  project.technicalApproach.architectureSummary = [
    `${ensureArray(parsed.architectureObjects).length} componentes/serviços`,
    `${ensureArray(parsed.dataEntities).length} entidades`,
    `${ensureArray(parsed.apiEndpoints).length} endpoints`,
    `módulo ${moduleTag}`,
  ].join(' · ');

  const packArtifact = {
    id: `art_${crypto.randomUUID().slice(0, 8)}`,
    type: 'architecture',
    name: packName,
    description: textOr(ensureArray(parsed.artifacts)[0]?.description, packBody.slice(0, 280)),
    bodyMarkdown: packBody,
    stageId: 'architecture',
    status: 'approved',
    metadata: {
      moduleTag,
      capabilityId,
      architectureObjects: parsed.architectureObjects,
      dataEntities: parsed.dataEntities,
      apiEndpoints: parsed.apiEndpoints,
      modules: parsed.modules,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };

  const detailArtifacts = [
    ...ensureArray(parsed.architectureObjects).map((o) => ({
      id: `art_${crypto.randomUUID().slice(0, 8)}`,
      type: 'architecture_object',
      name: o.name,
      description: textOr(o.descriptionMarkdown || o.description),
      bodyMarkdown: textOr(o.descriptionMarkdown || o.description),
      stageId: 'architecture',
      status: 'approved',
      metadata: { componentType: o.type, moduleTag, packId: packArtifact.id },
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    })),
    ...ensureArray(parsed.dataEntities).map((e) => ({
      id: `art_${crypto.randomUUID().slice(0, 8)}`,
      type: 'data_entity',
      name: e.name,
      description: `Campos: ${ensureArray(e.fields).join(', ')}`,
      bodyMarkdown: ensureArray(e.fields).map((f) => `- ${f}`).join('\n'),
      stageId: 'architecture',
      status: 'approved',
      metadata: { fields: e.fields, moduleTag, packId: packArtifact.id },
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    })),
    ...ensureArray(parsed.apiEndpoints).map((e) => ({
      id: `art_${crypto.randomUUID().slice(0, 8)}`,
      type: 'api_endpoint',
      name: `${textOr(e.method, 'GET')} ${textOr(e.path, '/')}`,
      description: textOr(e.description),
      bodyMarkdown: textOr(e.description),
      stageId: 'architecture',
      status: 'approved',
      metadata: { method: e.method, path: e.path, moduleTag, packId: packArtifact.id },
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    })),
  ];

  project.artifacts = [packArtifact, ...detailArtifacts, ...ensureArray(project.artifacts)];

  const diagramSources = [];
  const mermaidMain = textOr(parsed.architectureMermaid || parsed.mermaid || project.technicalApproach?.architectureMermaid);
  if (mermaidMain) diagramSources.push({ title: `Diagrama — ${packLabel}`, content: mermaidMain, format: 'mermaid' });
  for (const d of ensureArray(parsed.diagrams)) {
    const content = textOr(d.content || d.source || d.body);
    if (!content) continue;
    diagramSources.push({
      title: textOr(d.title || d.name, `Diagrama — ${packLabel}`),
      content,
      format: textOr(d.format || d.type, 'mermaid').toLowerCase(),
    });
  }
  if (diagramSources.length) {
    const { createPhaseDiagramDocument } = require('./phase-content');
    project.documents = ensureArray(project.documents);
    for (const src of diagramSources) {
      project.documents.push(createPhaseDiagramDocument({
        title: src.title,
        contentMarkdown: src.content,
        diagramFormat: src.format,
        deliveryStageId: 'architecture',
        origin: 'ai',
        userId,
      }));
    }
  }

  for (const risk of ensureArray(parsed.risks)) {
    const entry = typeof risk === 'string'
      ? risk
      : `[${textOr(risk.id, 'RISK')}] ${textOr(risk.title)}: ${textOr(risk.description)}`.trim();
    if (!entry) continue;
    project.risks = ensureArray(project.risks);
    const exists = project.risks.some((r) => {
      const text = typeof r === 'string' ? r : `${r.title || ''} ${r.description || ''}`;
      return text.includes(entry.slice(0, 40));
    });
    if (!exists) project.risks.push(entry);
  }
}

function applyPromptRunOutput(project, run, parsed, userId, deps = {}) {
  const normalizeRequirementRecord = deps.normalizeRequirementRecord || ((r) => r);
  if (!parsed || !run) return;

  const isArchitecturePack = run.agentType === 'requirements_to_architecture'
    || (parsed.architectureObjects || parsed.dataEntities || parsed.apiEndpoints);

  if (isArchitecturePack) {
    applyArchitecturePack(project, parsed, run, userId);
    project.traceLinks = mergeTraceLinks(project.traceLinks, autoDeriveTraceLinks(project));
    return;
  }

  if (run.agentType === 'requirement_grouping' || parsed.capabilities || parsed.requirementClusters) {
    const applied = applyGroupingResult(project, parsed, userId);
    if (applied.capabilities?.length) project.capabilities = applied.capabilities;
    if (applied.requirementClusters?.length) project.requirementClusters = applied.requirementClusters;
  }

  if (parsed.ideaBriefMarkdown) project.ideaBriefMarkdown = parsed.ideaBriefMarkdown;

  if (parsed.transitionSummaryMarkdown) {
    project.nextDecision = textOr(parsed.nextDecision, parsed.transitionSummaryMarkdown.slice(0, 200));
  } else if (parsed.nextDecision) {
    project.nextDecision = parsed.nextDecision;
  }

  if (parsed.stakeholderRequirements || parsed.technicalRequirements) {
    const newReqs = [];
    for (const sr of ensureArray(parsed.stakeholderRequirements)) {
      newReqs.push(normalizeRequirementRecord({ ...sr, type: 'stakeholder' }));
    }
    for (const tr of ensureArray(parsed.technicalRequirements)) {
      newReqs.push(normalizeRequirementRecord({ ...tr, type: 'functional' }));
    }
    project.requirements = [...ensureArray(project.requirements), ...newReqs];
  }

  if (parsed.artifacts) {
    project.artifacts = [...ensureArray(project.artifacts), ...ensureArray(parsed.artifacts).map((a) => ({
      ...a,
      id: a.id || `art_${crypto.randomUUID().slice(0, 8)}`,
      bodyMarkdown: a.bodyMarkdown || a.descriptionMarkdown || a.description,
    }))];
  }

  project.traceLinks = mergeTraceLinks(project.traceLinks, autoDeriveTraceLinks(project));
}

function syncHumanReviewFromPromptRun(project, run, parsed, rawOutput) {
  const payload = buildHumanReviewPayload(project, run, parsed, rawOutput);
  const review = ensureArray(project.humanReviews).find(
    (r) => r.promptRunId === run.id || (r.sourceType === 'prompt_run' && r.sourceId === run.id)
  );
  if (!review) return payload;

  review.bodyMarkdown = payload.bodyMarkdown;
  review.suggestedChanges = payload.suggestedChanges;
  review.decisionsCount = payload.decisionsCount;
  review.summaryMarkdown = payload.summaryMarkdown;
  review.title = parsed
    ? `Revisão: ${textOr(run.agentType, 'agent')}`
    : review.title;
  if (parsed && review.status === 'approved') {
    review.status = 'pending';
    review.resolvedAt = '';
    review.resolvedBy = '';
  }
  return payload;
}

function createProjectSnapshot(project, label, userId, stageId) {
  return normalizeVersionSnapshot({
    label,
    stageId,
    createdBy: userId,
    snapshotData: {
      requirements: project.requirements,
      capabilities: project.capabilities,
      requirementClusters: project.requirementClusters,
      artifacts: project.artifacts,
      traceLinks: project.traceLinks,
      stages: project.stages,
      ideaBriefMarkdown: project.ideaBriefMarkdown,
    },
  });
}

function exportImpactReportMarkdown(report, project) {
  const lines = [
    `# Impact Report`,
    ``,
    `**Projecto:** ${project.name}`,
    `**Origem:** ${report.sourceType} / ${report.sourceId}`,
    `**Gerado:** ${report.createdAt}`,
    ``,
    `## Nós afectados (${ensureArray(report.impactedNodes).length})`,
    ...ensureArray(report.impactedNodes).map((n) => `- ${n.nodeType}: ${n.nodeId}`),
    ``,
    `## Resumo`,
    textOr(report.summary),
  ];
  return lines.join('\n');
}

function registerDeliveryOsRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    loadProjectForUser,
    readStore,
    updateStore,
    appendActivity,
    sanitizeProject,
    normalizeArtifacts,
    normalizeTraceLinks,
    normalizeApprovals,
    normalizeMeetingMinutes,
    normalizeRequirementRecord,
    numberOr: numOr,
  } = deps;
  const phaseContent = getPhaseContent();

  app.post('/api/projects/markdown/render', authMiddleware, async (req, res) => {
    try {
      const markdown = String(req.body?.markdown || '');
      const html = renderMarkdownToHtml(markdown);
      const mermaidBlocks = extractMermaidBlocks(markdown);
      return res.json({ html, mermaidBlocks });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/projects/config/delivery-os', authMiddleware, async (req, res) => {
    return res.json({
      moduleTags: MODULE_TAGS,
      traceNodeTypes: TRACE_NODE_TYPES,
      informationTypes: INFORMATION_TYPES,
      agentTypes: AGENT_TYPES,
      onionLayers: ONION_LAYERS,
      stageFocus: STAGE_FOCUS,
      stageNextHint: STAGE_NEXT_HINT,
      stageOrder: STAGE_ORDER,
      stageTransitionAgents: STAGE_TRANSITION_AGENTS,
      platformConcepts: PLATFORM_CONCEPTS,
      stageConceptKeys: STAGE_CONCEPT_KEYS,
    });
  });

  app.get('/api/projects/projects/:projectId/capabilities', authMiddleware, loadProjectForUser, async (req, res) => {
    const p = req.loadedProject;
    return res.json({
      capabilities: ensureArray(p.capabilities).map(normalizeCapability),
      requirementClusters: ensureArray(p.requirementClusters).map(normalizeCluster),
    });
  });

  app.post('/api/projects/projects/:projectId/capabilities', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        if (body.capabilities) project.capabilities = ensureArray(body.capabilities).map(normalizeCapability);
        if (body.requirementClusters) project.requirementClusters = ensureArray(body.requirementClusters).map(normalizeCluster);
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId, action: 'capabilities_updated', details: {} });
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({ project: sanitizeProject(updated, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/add-information', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const entry = normalizeInformationEntry({
        ...body,
        createdBy: req.auth.user.id,
      });

      let review = null;
      if (entry.analyzeWithAgent) {
        review = normalizeHumanReview({
          type: 'information_classification',
          title: `Nova informação: ${entry.type}`,
          summaryMarkdown: `Informação recebida para classificação na fase ${entry.stageId}.`,
          bodyMarkdown: entry.bodyMarkdown,
          sourceType: 'information_entry',
          sourceId: entry.id,
          status: 'pending',
          readingTimeMinutes: Math.max(1, Math.ceil(entry.bodyMarkdown.length / 800)),
        });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.informationEntries = ensureArray(project.informationEntries);
        project.informationEntries.unshift(entry);
        if (entry.type === 'meeting_minutes') {
          project.meetingMinutes = normalizeMeetingMinutes(project.meetingMinutes);
          project.meetingMinutes.unshift({
            id: `min_${crypto.randomUUID().slice(0, 8)}`,
            meetingDate: nowIso().slice(0, 10),
            rawText: entry.bodyMarkdown,
            bodyMarkdown: entry.bodyMarkdown,
            createdAt: nowIso(),
            createdBy: req.auth.user.id,
          });
        }
        if (review) {
          review.sourceId = entry.id;
          project.humanReviews = ensureArray(project.humanReviews);
          project.humanReviews.unshift(review);
        }
        project.updatedAt = nowIso();
        appendActivity(store, { actorUserId: req.auth.user.id, projectId, action: 'information_added', details: { type: entry.type } });
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({ project: sanitizeProject(updated, req.auth.user), entry, review });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/human-reviews', authMiddleware, loadProjectForUser, async (req, res) => {
    const reviews = ensureArray(req.loadedProject.humanReviews).map(normalizeHumanReview);
    return res.json({ reviews });
  });

  app.post('/api/projects/projects/:projectId/human-reviews/:reviewId/enrich', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, reviewId } = req.params;
      let enriched = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const review = ensureArray(project.humanReviews).find((r) => r.id === reviewId);
        if (!review) throw new Error('Review nao encontrada.');
        const run = ensureArray(project.promptRuns).find(
          (r) => r.id === review.promptRunId || r.id === review.sourceId
        );
        if (run && (run.parsedOutput || run.rawOutput)) {
          enriched = syncHumanReviewFromPromptRun(project, run, run.parsedOutput, run.rawOutput);
          project.updatedAt = nowIso();
        }
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      const review = normalizeHumanReview(ensureArray(updated?.humanReviews).find((r) => r.id === reviewId));
      return res.json({ review, enriched: Boolean(enriched) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/human-reviews/:reviewId/resolve', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, reviewId } = req.params;
      const { status, resolutionNotes, applyChanges } = req.body || {};
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const review = ensureArray(project.humanReviews).find((r) => r.id === reviewId);
        if (!review) throw new Error('Review nao encontrada.');
        review.status = ['approved', 'changes_requested', 'rejected'].includes(status) ? status : 'approved';
        review.resolvedAt = nowIso();
        review.resolvedBy = req.auth.user.id;
        review.resolutionNotes = textOr(resolutionNotes);
        const approved = review.status === 'approved';
        if (approved && applyChanges !== false) {
          let parsed = review.suggestedChanges?.parsed || null;
          const linkedRun = ensureArray(project.promptRuns).find(
            (r) => r.id === review.promptRunId || r.id === review.sourceId
          );
          if (!parsed && review.suggestedChanges?.rawOutput) {
            parsed = parseAgentJsonOutput(review.suggestedChanges.rawOutput).parsed;
          }
          if (!parsed && linkedRun?.parsedOutput) parsed = linkedRun.parsedOutput;
          if (!parsed && linkedRun?.rawOutput) {
            parsed = parseAgentJsonOutput(linkedRun.rawOutput).parsed;
          }
          if (parsed) {
            if (linkedRun && linkedRun.status !== 'applied') {
              applyPromptRunOutput(project, linkedRun, parsed, req.auth.user.id, { normalizeRequirementRecord });
              linkedRun.status = 'applied';
              linkedRun.reviewedAt = nowIso();
              linkedRun.reviewedBy = req.auth.user.id;
            } else if (!linkedRun) {
              applyPromptRunOutput(project, {
                agentType: textOr(review.suggestedChanges?.agentType, 'agent_output'),
                stageId: 'architecture',
                moduleTag: 'Backend',
              }, parsed, req.auth.user.id, { normalizeRequirementRecord });
            }
            project.traceLinks = mergeTraceLinks(project.traceLinks, autoDeriveTraceLinks(project));
          }
        }
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/stages/:stageId/approve', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, stageId } = req.params;
      const notes = textOr(req.body?.notes);
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.stages = ensureArray(project.stages).map((s) => {
          if (s.id !== stageId) return s;
          return { ...s, status: 'approved' };
        });
        project.approvals = normalizeApprovals(project.approvals);
        project.approvals.unshift({
          id: `appr_${crypto.randomUUID().slice(0, 8)}`,
          stageId,
          status: 'approved',
          notes,
          approvedAt: nowIso(),
          approvedBy: req.auth.user.id,
        });
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/stages/:stageId', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, stageId } = req.params;
      const { status } = req.body || {};
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        project.stages = ensureArray(project.stages).map((s) => (s.id === stageId ? { ...s, status: textOr(status, s.status) } : s));
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/snapshots', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const label = textOr(req.body?.label, `Snapshot ${nowIso().slice(0, 10)}`);
      let snapshot = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        snapshot = createProjectSnapshot(project, label, req.auth.user.id, req.body?.stageId);
        project.versionSnapshots = ensureArray(project.versionSnapshots);
        project.versionSnapshots.unshift(snapshot);
        project.versionSnapshots = project.versionSnapshots.slice(0, 30);
        project.updatedAt = nowIso();
      });
      return res.json({ snapshot });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/snapshots/:snapshotId/restore', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, snapshotId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const snap = ensureArray(project.versionSnapshots).find((s) => s.id === snapshotId);
        if (!snap?.snapshotData) throw new Error('Snapshot nao encontrado.');
        const data = snap.snapshotData;
        if (data.requirements) project.requirements = data.requirements;
        if (data.capabilities) project.capabilities = data.capabilities;
        if (data.requirementClusters) project.requirementClusters = data.requirementClusters;
        if (data.artifacts) project.artifacts = data.artifacts;
        if (data.traceLinks) project.traceLinks = data.traceLinks;
        if (data.stages) project.stages = data.stages;
        if (data.ideaBriefMarkdown) project.ideaBriefMarkdown = data.ideaBriefMarkdown;
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/trace-links/sync', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const derived = autoDeriveTraceLinks(project);
        project.traceLinks = mergeTraceLinks(project.traceLinks, derived);
        project.updatedAt = nowIso();
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        traceLinks: normalizeTraceLinks(updated.traceLinks, updated.requirements, updated.artifacts),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/relink-phases', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      let report = null;
      let document = null;
      let review = null;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');

        const previousLinkCount = ensureArray(project.traceLinks).length;
        const derived = autoDeriveTraceLinks(project);
        project.traceLinks = mergeTraceLinks(project.traceLinks, derived);
        const currentLinkCount = ensureArray(project.traceLinks).length;

        report = buildPhaseLinkReport(project, { previousLinkCount, currentLinkCount });

        document = phaseContent.normalizeProjectDocument({
          title: `Log de ligações — ${nowIso().slice(0, 16).replace('T', ' ')}`,
          contentMarkdown: report.markdown,
          docType: 'log',
          deliveryStageId: 'monitoring',
          origin: 'system',
          contentType: 'text/markdown',
          uploadedBy: req.auth.user.id,
          uploadedAt: nowIso(),
        });
        project.documents = ensureArray(project.documents);
        project.documents.unshift(document);

        review = normalizeHumanReview({
          type: 'phase_link_sync',
          title: 'Reaplicação de ligações entre fases',
          summaryMarkdown: report.summary,
          bodyMarkdown: report.markdown,
          sourceType: 'document',
          sourceId: document.id,
          status: 'pending',
          decisionsCount: report.stats.addedLinks,
          readingTimeMinutes: Math.max(1, Math.ceil(report.markdown.length / 800)),
        });
        project.humanReviews = ensureArray(project.humanReviews);
        project.humanReviews.unshift(review);

        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'phase_links_reapplied',
          details: { documentId: document.id, reviewId: review.id, ...report.stats },
        });
      });
      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        report,
        documentId: document?.id,
        reviewId: review?.id,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/projects/:projectId/meeting-minutes/:minuteId', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, minuteId } = req.params;
      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const minute = ensureArray(project.meetingMinutes).find((m) => m.id === minuteId);
        if (!minute) throw new Error('Ata nao encontrada.');
        if (req.body?.targetStageId !== undefined) {
          const sid = phaseContent.normalizeDeliveryStageId(req.body.targetStageId, 'requirements');
          minute.targetStageId = sid;
          minute.impactScope = sid;
        }
        if (typeof req.body?.title === 'string') minute.title = req.body.title.trim();
        minute.updatedAt = nowIso();
        project.updatedAt = nowIso();
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId,
          action: 'meeting_minutes_moved',
          details: { minuteId, targetStageId: minute.targetStageId },
        });
      });
      const store = await readStore();
      return res.json({ project: sanitizeProject(store.projects.find((e) => e.id === projectId), req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/prompt-runs', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const body = req.body || {};
      const agentType = textOr(body.agentType, 'prompt_builder');
      const project = req.loadedProject;
      let fullPrompt = '';
      let contextPack = {};
      let targetOutput = textOr(body.targetOutput);

      if (agentType === 'requirement_grouping') {
        fullPrompt = buildGroupingPrompt(project);
        targetOutput = 'grouping_json';
      } else if (agentType === 'reverse_idea') {
        fullPrompt = buildReverseIdeaPrompt(project);
        targetOutput = 'idea_brief';
      } else if (agentType === 'diagram_to_requirements') {
        fullPrompt = buildDiagramToRequirementsPrompt(project, body.bodyMarkdown);
        targetOutput = 'requirements_from_diagram';
      } else if (agentType === 'requirements_to_architecture') {
        fullPrompt = buildArchitecturePackPrompt(project, body.capabilityId, body.moduleTag);
        targetOutput = 'architecture_pack';
      } else if (agentType === 'capability_requirements') {
        fullPrompt = buildCapabilityRequirementsPrompt(project, body.capabilityId);
        targetOutput = 'capability_requirements';
      } else if (agentType === 'stage_transition') {
        const fromStageId = textOr(body.fromStageId);
        const toStageId = textOr(body.toStageId);
        const direction = textOr(body.direction, 'forward');
        fullPrompt = buildStageTransitionPrompt(project, fromStageId, toStageId, direction);
        targetOutput = `stage_transition_${direction}`;
      } else {
        contextPack = buildContextPack(project, { stageId: body.stageId, capabilityId: body.capabilityId });
        fullPrompt = buildPromptRunFull(
          textOr(body.systemPrompt, 'Tu és um agente de systems engineering YourLab.'),
          textOr(body.stageInstruction, `Stage: ${body.stageId || 'requirements'}`),
          contextPack,
          textOr(body.taskPrompt, body.task || ''),
          textOr(body.outputSchema, 'JSON válido apenas.')
        );
      }

      const run = normalizePromptRun({
        agentType,
        stageId: body.stageId,
        capabilityId: body.capabilityId,
        moduleTag: body.moduleTag,
        targetOutput,
        contextPack,
        fullPrompt,
        createdBy: req.auth.user.id,
        summaryMarkdown: `Prompt gerado para ${agentType}. Tempo estimado de leitura: ${Math.max(1, Math.ceil(fullPrompt.length / 1200))} min.`,
      });

      let review = normalizeHumanReview({
        type: 'agent_output',
        title: `Aguarda output: ${agentType}`,
        summaryMarkdown: `Prompt gerado para **${agentType}**. Cole a resposta no Prompt Workbench e submeta para revisão.`,
        bodyMarkdown: buildHumanReviewPayload(project, run, null, '').bodyMarkdown,
        promptRunId: run.id,
        sourceType: 'prompt_run',
        sourceId: run.id,
        status: 'pending',
        readingTimeMinutes: Math.max(1, Math.ceil(fullPrompt.length / 1200)),
      });

      await updateStore(async (store) => {
        const p = store.projects.find((e) => e.id === projectId);
        if (!p) throw new Error('Projeto nao encontrado.');
        p.promptRuns = ensureArray(p.promptRuns);
        p.promptRuns.unshift(run);
        p.promptRuns = p.promptRuns.slice(0, 100);
        p.humanReviews = ensureArray(p.humanReviews);
        p.humanReviews.unshift(review);
        p.updatedAt = nowIso();
      });

      return res.json({ promptRun: run, review, prompt: fullPrompt });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/prompt-runs/:runId/apply', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, runId } = req.params;
      const rawInput = String(req.body?.rawOutput || (req.body?.parsedOutput ? JSON.stringify(req.body.parsedOutput) : ''));
      const parsedFromRaw = parseAgentJsonOutput(rawInput);
      const parsed = req.body?.parsedOutput || parsedFromRaw.parsed;
      const rawOutput = parsedFromRaw.rawOutput || rawInput;
      const deferApply = req.body?.deferApply !== false;

      if (rawOutput && !parsed) {
        return res.status(400).json({
          message: 'JSON inválido. Verifique aspas rectas (" ") e vírgulas. O sistema corrige aspas tipográficas automaticamente, mas a estrutura deve ser JSON válido.',
        });
      }

      await updateStore(async (store) => {
        const project = store.projects.find((e) => e.id === projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const run = ensureArray(project.promptRuns).find((r) => r.id === runId);
        if (!run) throw new Error('Prompt run nao encontrado.');

        run.rawOutput = rawOutput;
        run.parsedOutput = parsed;
        run.status = deferApply ? 'pending_review' : 'applied';
        if (!deferApply) {
          run.reviewedAt = nowIso();
          run.reviewedBy = req.auth.user.id;
        }

        syncHumanReviewFromPromptRun(project, run, parsed, rawOutput);

        if (!deferApply && parsed) {
          applyPromptRunOutput(project, run, parsed, req.auth.user.id, { normalizeRequirementRecord });
        }

        project.updatedAt = nowIso();
      });

      const store = await readStore();
      const updated = store.projects.find((e) => e.id === projectId);
      const review = ensureArray(updated?.humanReviews).find(
        (r) => r.promptRunId === runId || r.sourceId === runId
      );
      return res.json({
        project: sanitizeProject(updated, req.auth.user),
        review: review ? normalizeHumanReview(review) : null,
        deferred: deferApply,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/projects/:projectId/prompt-runs/:runId/alternative', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const { projectId, runId } = req.params;
      const alt = normalizeAlternativeResponse({
        promptRunId: runId,
        modelName: req.body?.modelName,
        rawOutput: req.body?.rawOutput,
        createdBy: req.auth.user.id,
      });
      let parsed = null;
      try { parsed = JSON.parse(alt.rawOutput); } catch { /* ignore */ }
      alt.parsedOutput = parsed;

      const store = await readStore();
      const project = store.projects.find((e) => e.id === projectId);
      const original = ensureArray(project?.promptRuns).find((r) => r.id === runId);
      if (original?.parsedOutput && parsed) {
        alt.diffSummary = `Campos originais vs alternativos: ${Object.keys(parsed).length} vs ${Object.keys(original.parsedOutput || {}).length} top-level keys`;
      }

      await updateStore(async (s) => {
        const p = s.projects.find((e) => e.id === projectId);
        p.alternativeResponses = ensureArray(p.alternativeResponses);
        p.alternativeResponses.unshift(alt);
      });

      return res.json({ alternative: alt, original: original ? { rawOutput: original.rawOutput, parsedOutput: original.parsedOutput } : null });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/projects/:projectId/onion/:nodeType/:nodeId', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    const { nodeType, nodeId } = req.params;
    const layers = [];
    const links = ensureArray(project.traceLinks);

    const walkUp = (type, id, depth = 0) => {
      if (depth > 12) return;
      layers.unshift({ nodeType: type, nodeId: id, depth });
      links.filter((l) => l.targetType === type && l.targetId === id).forEach((l) => {
        walkUp(l.sourceType, l.sourceId, depth + 1);
      });
    };
    walkUp(nodeType, nodeId);

    return res.json({ layers, onionLayers: ONION_LAYERS });
  });

  app.get('/api/projects/projects/:projectId/impact-reports/:reportId/markdown', authMiddleware, loadProjectForUser, async (req, res) => {
    const report = ensureArray(req.loadedProject.impactReports).find((r) => r.id === req.params.reportId);
    if (!report) return res.status(404).json({ message: 'Report nao encontrado.' });
    const md = exportImpactReportMarkdown(report, req.loadedProject);
    return res.json({ markdown: md, html: renderMarkdownToHtml(md) });
  });
}

module.exports = {
  MODULE_TAGS,
  TRACE_NODE_TYPES,
  INFORMATION_TYPES,
  AGENT_TYPES,
  ONION_LAYERS,
  PLATFORM_CONCEPTS,
  STAGE_CONCEPT_KEYS,
  STAGE_FOCUS,
  STAGE_NEXT_HINT,
  STAGE_ORDER,
  STAGE_TRANSITION_AGENTS,
  STAGE_TAB_LINKS,
  TAB_STAGE_AFFINITY,
  MEETING_IMPACT_SCOPES,
  MEETING_IMPACT_PROPAGATION,
  buildMinutePropagationPlan,
  buildMinutePropagationPrompt,
  normalizeProjectV3Fields,
  enrichRequirementWithModuleTags,
  autoDeriveTraceLinks,
  mergeTraceLinks,
  buildContextPack,
  buildGroupingPrompt,
  buildReverseIdeaPrompt,
  buildDiagramToRequirementsPrompt,
  buildArchitecturePackPrompt,
  buildCapabilityRequirementsPrompt,
  buildStageTransitionPrompt,
  applyGroupingResult,
  buildHumanReviewPayload,
  applyPromptRunOutput,
  applyArchitecturePack,
  parseAgentJsonOutput,
  normalizeJsonInput,
  syncHumanReviewFromPromptRun,
  normalizeCapability,
  normalizeCluster,
  normalizePromptRun,
  normalizeHumanReview,
  normalizeVersionSnapshot,
  registerDeliveryOsRoutes,
  renderMarkdownToHtml,
};
