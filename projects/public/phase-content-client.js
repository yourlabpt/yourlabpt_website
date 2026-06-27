(function () {
  const DEFAULT_STAGES = ['idea', 'discovery', 'requirements', 'architecture', 'implementation', 'testing', 'deployment', 'handover'];

  function stageOrder() {
    return window.state?.config?.stageOrder || DEFAULT_STAGES;
  }

  function normalizeStageId(value, fallback = 'requirements') {
    const sid = String(value || fallback).trim().toLowerCase();
    return stageOrder().includes(sid) ? sid : fallback;
  }

  function resolveMeetingStageId(minute) {
    return normalizeStageId(minute?.targetStageId || minute?.impactScope, 'requirements');
  }

  // Atas are global — one ata can impact multiple phases.
  function meetingImpactedStageIds(minute) {
    const ids = (Array.isArray(minute?.impactedStageIds) ? minute.impactedStageIds : [])
      .map((id) => normalizeStageId(id, ''))
      .filter((id) => stageOrder().includes(id));
    if (ids.length) return Array.from(new Set(ids));
    return [resolveMeetingStageId(minute)];
  }

  function resolveRequirementStageId(req) {
    return normalizeStageId(req?.deliveryStageId, 'requirements');
  }

  function resolveDocumentStageId(doc) {
    return normalizeStageId(doc?.deliveryStageId, 'discovery');
  }

  function getStageContentSummary(project, stageId) {
    const sid = normalizeStageId(stageId, 'requirements');
    const requirements = (project?.requirements || []).filter((r) => resolveRequirementStageId(r) === sid);
    const minutes = (project?.meetingMinutes || []).filter((m) => meetingImpactedStageIds(m).includes(sid));
    const documents = (project?.documents || []).filter((d) => resolveDocumentStageId(d) === sid);
    const questions = (project?.clarificationQuestions || []).filter(
      (q) => normalizeStageId(q?.deliveryStageId, 'requirements') === sid
    );
    const informationEntries = (project?.informationEntries || []).filter(
      (e) => normalizeStageId(e?.stageId, 'requirements') === sid
    );
    const artifacts = (project?.artifacts || []).filter(
      (a) => normalizeStageId(a?.stageId, 'requirements') === sid
    );
    const promptRuns = (project?.promptRuns || []).filter(
      (p) => normalizeStageId(p?.stageId, 'requirements') === sid
    );
    const isAiDocument = (d) => {
      const docType = String(d?.docType || 'attachment');
      const origin = String(d?.origin || '');
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
    const text = (v, fb = '') => String(v || fb).trim();

    for (const entry of summary.items.artifacts) {
      items.push({
        id: entry.id,
        kind: 'artifact',
        title: text(entry.name, 'Artefacto'),
        typeLabel: text(entry.type, 'artefacto'),
        stageId: entry.stageId,
        status: text(entry.status, 'draft'),
        updatedAt: text(entry.updatedAt, entry.createdAt),
        preview: text(entry.description || entry.bodyMarkdown).slice(0, 180),
        contentMarkdown: text(entry.bodyMarkdown || entry.description),
        editable: true,
        raw: entry,
      });
    }

    for (const run of summary.items.promptRuns) {
      items.push({
        id: run.id,
        kind: 'prompt_run',
        title: text(run.agentType, 'Execução IA'),
        typeLabel: text(run.agentType, 'agente IA'),
        stageId: run.stageId,
        status: text(run.status, 'pending_review'),
        updatedAt: text(run.createdAt),
        preview: text(run.summaryMarkdown || run.rawOutput).slice(0, 180),
        contentMarkdown: text(run.summaryMarkdown || run.rawOutput),
        fullPrompt: text(run.fullPrompt),
        editable: true,
        raw: run,
      });
    }

    for (const entry of summary.items.informationEntries) {
      items.push({
        id: entry.id,
        kind: 'information_entry',
        title: text(entry.type, 'Informação'),
        typeLabel: 'Nota de fase',
        stageId: entry.stageId,
        status: text(entry.status, 'stored'),
        updatedAt: text(entry.createdAt),
        preview: text(entry.bodyMarkdown).slice(0, 180),
        contentMarkdown: text(entry.bodyMarkdown),
        editable: true,
        raw: entry,
      });
    }

    for (const doc of summary.items.aiDocuments) {
      items.push({
        id: doc.id,
        kind: 'document',
        title: text(doc.title, doc.originalName, 'Documento IA'),
        typeLabel: text(doc.docType, 'documento'),
        stageId: doc.deliveryStageId,
        status: text(doc.origin, 'ai'),
        updatedAt: text(doc.updatedAt, doc.uploadedAt, doc.createdAt),
        preview: text(doc.contentMarkdown || doc.extractedText).slice(0, 180),
        contentMarkdown: text(doc.contentMarkdown || doc.extractedText),
        diagramFormat: text(doc.diagramFormat),
        editable: true,
        raw: doc,
      });
    }

    return items.sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
  }

  window.PhaseContent = {
    normalizeStageId,
    resolveMeetingStageId,
    meetingImpactedStageIds,
    resolveRequirementStageId,
    resolveDocumentStageId,
    getStageContentSummary,
    collectAiArtifacts,
  };
})();
