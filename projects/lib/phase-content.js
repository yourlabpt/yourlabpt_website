/**
 * Contagem e filtragem de conteúdo por fase da Linha de Entrega.
 */
const { STAGE_ORDER } = require('./delivery-os');

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDeliveryStageId(value, fallback = 'requirements') {
  const stageId = textOr(value, fallback).toLowerCase();
  return STAGE_ORDER.includes(stageId) ? stageId : fallback;
}

function resolveMeetingStageId(minute) {
  return normalizeDeliveryStageId(
    minute?.targetStageId || minute?.impactScope,
    'requirements'
  );
}

// Atas are a global field — one ata can impact multiple phases. Returns every
// phase this ata touches (AI-classified impactedStageIds, with legacy fallback).
function meetingImpactedStageIds(minute) {
  const ids = ensureArray(minute?.impactedStageIds)
    .map((id) => normalizeDeliveryStageId(id, ''))
    .filter((id) => STAGE_ORDER.includes(id));
  if (ids.length) return [...new Set(ids)];
  return [resolveMeetingStageId(minute)];
}

function resolveRequirementStageId(req) {
  return normalizeDeliveryStageId(req?.deliveryStageId, 'requirements');
}

function resolveDocumentStageId(doc) {
  return normalizeDeliveryStageId(doc?.deliveryStageId, 'discovery');
}

function getStageContentSummary(project, stageId) {
  const sid = normalizeDeliveryStageId(stageId, 'requirements');
  const requirements = ensureArray(project?.requirements).filter(
    (r) => resolveRequirementStageId(r) === sid
  );
  const minutes = ensureArray(project?.meetingMinutes).filter(
    (m) => meetingImpactedStageIds(m).includes(sid)
  );
  const documents = ensureArray(project?.documents).filter(
    (d) => resolveDocumentStageId(d) === sid
  );
  const questions = ensureArray(project?.clarificationQuestions).filter(
    (q) => normalizeDeliveryStageId(q?.deliveryStageId, 'requirements') === sid
  );
  const informationEntries = ensureArray(project?.informationEntries).filter(
    (e) => normalizeDeliveryStageId(e?.stageId, 'requirements') === sid
  );
  const artifacts = ensureArray(project?.artifacts).filter(
    (a) => normalizeDeliveryStageId(a?.stageId, 'requirements') === sid
  );
  const promptRuns = ensureArray(project?.promptRuns).filter(
    (p) => normalizeDeliveryStageId(p?.stageId, 'requirements') === sid
  );
  const isAiDocument = (d) => {
    const docType = textOr(d?.docType, 'attachment');
    const origin = textOr(d?.origin);
    return origin === 'ai' || ['diagram', 'ai_response', 'architecture'].includes(docType);
  };
  const uploadDocuments = documents.filter((d) => !isAiDocument(d));
  const aiDocuments = documents.filter((d) => isAiDocument(d));
  const aiArtifacts = informationEntries.length + artifacts.length + promptRuns.length + aiDocuments.length;
  const diagrams = aiDocuments.filter(
    (d) => d.docType === 'diagram' || d.diagramFormat || String(d.contentType || '').includes('mermaid')
  );

  return {
    stageId: sid,
    counts: {
      requirements: requirements.length,
      minutes: minutes.length,
      documents: uploadDocuments.length,
      questions: questions.length,
      aiArtifacts,
      diagrams: diagrams.length,
    },
    items: {
      requirements,
      minutes,
      documents: uploadDocuments,
      aiDocuments,
      questions,
      informationEntries,
      artifacts,
      promptRuns,
      diagrams,
    },
  };
}

function collectAiArtifacts(project, stageId) {
  const summary = getStageContentSummary(project, stageId);
  const items = [];

  for (const entry of summary.items.artifacts) {
    items.push({
      id: entry.id,
      kind: 'artifact',
      title: textOr(entry.name, 'Artefacto'),
      typeLabel: textOr(entry.type, 'artefacto'),
      stageId: entry.stageId,
      status: textOr(entry.status, 'draft'),
      updatedAt: textOr(entry.updatedAt, entry.createdAt),
      preview: textOr(entry.description || entry.bodyMarkdown).slice(0, 180),
      contentMarkdown: textOr(entry.bodyMarkdown || entry.description),
      editable: true,
      raw: entry,
    });
  }

  for (const run of summary.items.promptRuns) {
    items.push({
      id: run.id,
      kind: 'prompt_run',
      title: textOr(run.agentType, 'Execução IA'),
      typeLabel: textOr(run.agentType, 'agente IA'),
      stageId: run.stageId,
      status: textOr(run.status, 'pending_review'),
      updatedAt: textOr(run.createdAt),
      preview: textOr(run.summaryMarkdown || run.rawOutput).slice(0, 180),
      contentMarkdown: textOr(run.summaryMarkdown || run.rawOutput),
      fullPrompt: textOr(run.fullPrompt),
      editable: true,
      raw: run,
    });
  }

  for (const entry of summary.items.informationEntries) {
    items.push({
      id: entry.id,
      kind: 'information_entry',
      title: textOr(entry.type, 'Informação'),
      typeLabel: 'Nota de fase',
      stageId: entry.stageId,
      status: textOr(entry.status, 'stored'),
      updatedAt: textOr(entry.createdAt),
      preview: textOr(entry.bodyMarkdown).slice(0, 180),
      contentMarkdown: textOr(entry.bodyMarkdown),
      editable: true,
      raw: entry,
    });
  }

  for (const doc of summary.items.aiDocuments) {
    items.push({
      id: doc.id,
      kind: 'document',
      title: textOr(doc.title, doc.originalName, 'Documento IA'),
      typeLabel: textOr(doc.docType, 'documento'),
      stageId: doc.deliveryStageId,
      status: textOr(doc.origin, 'ai'),
      updatedAt: textOr(doc.updatedAt, doc.uploadedAt, doc.createdAt),
      preview: textOr(doc.contentMarkdown || doc.extractedText).slice(0, 180),
      contentMarkdown: textOr(doc.contentMarkdown || doc.extractedText),
      diagramFormat: textOr(doc.diagramFormat),
      editable: true,
      raw: doc,
    });
  }

  return items.sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
}

function normalizeProjectDocument(raw) {
  const diagramFormat = textOr(raw?.diagramFormat).toLowerCase();
  const docType = textOr(raw?.docType, 'attachment');
  return {
    id: textOr(raw?.id, `doc_${require('crypto').randomUUID()}`),
    title: textOr(raw?.title || raw?.originalName, 'Documento'),
    originalName: textOr(raw?.originalName),
    storedName: textOr(raw?.storedName),
    absolutePath: textOr(raw?.absolutePath),
    uploadedAt: textOr(raw?.uploadedAt, new Date().toISOString()),
    uploadedBy: textOr(raw?.uploadedBy),
    updatedAt: textOr(raw?.updatedAt, raw?.uploadedAt || new Date().toISOString()),
    contentType: textOr(raw?.contentType, 'text/plain'),
    size: Number(raw?.size) || 0,
    extractedText: typeof raw?.extractedText === 'string' ? raw.extractedText : '',
    contentMarkdown: textOr(raw?.contentMarkdown || raw?.extractedText || raw?.bodyMarkdown),
    deliveryStageId: normalizeDeliveryStageId(raw?.deliveryStageId, 'discovery'),
    docType: ['attachment', 'diagram', 'ai_response', 'architecture', 'minutes', 'clarification', 'log', 'other'].includes(docType)
      ? docType
      : 'attachment',
    origin: textOr(raw?.origin, raw?.uploadedBy ? 'upload' : 'manual'),
    diagramFormat: ['mermaid', 'plantuml', 'markdown', 'json', 'yaml'].includes(diagramFormat)
      ? diagramFormat
      : (docType === 'diagram' ? 'mermaid' : ''),
    createdAt: textOr(raw?.createdAt, raw?.uploadedAt || new Date().toISOString()),
  };
}

function normalizeProjectDocuments(list) {
  return ensureArray(list).map((entry) => normalizeProjectDocument(entry));
}

function createPhaseDiagramDocument({ title, contentMarkdown, diagramFormat, deliveryStageId, origin, userId }) {
  return normalizeProjectDocument({
    title,
    contentMarkdown,
    diagramFormat: diagramFormat || 'mermaid',
    docType: 'diagram',
    deliveryStageId: deliveryStageId || 'architecture',
    origin: origin || 'ai',
    contentType: 'text/markdown',
    uploadedBy: userId,
    uploadedAt: new Date().toISOString(),
  });
}

module.exports = {
  normalizeDeliveryStageId,
  resolveMeetingStageId,
  meetingImpactedStageIds,
  resolveRequirementStageId,
  resolveDocumentStageId,
  getStageContentSummary,
  normalizeProjectDocument,
  normalizeProjectDocuments,
  createPhaseDiagramDocument,
  collectAiArtifacts,
};
