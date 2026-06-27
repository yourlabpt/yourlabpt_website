/**
 * Bidirectional traceability between diagramArtifacts and requirements.
 * Source of truth: diagram.linkedRequirementIds → synced to requirement.linkedDiagramIds.
 */

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => textOr(v)).filter(Boolean);
  return textOr(value).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function mergeUniqueIds(existing, incoming) {
  const output = [];
  const seen = new Set();
  for (const raw of [...ensureArray(existing), ...ensureArray(incoming)]) {
    const id = textOr(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  return output;
}

function collectValidRequirementIds(project) {
  return new Set(ensureArray(project.requirements).map((r) => r.id).filter(Boolean));
}

function filterValidRequirementIds(project, ids) {
  const valid = collectValidRequirementIds(project);
  return mergeUniqueIds([], ensureArray(ids).filter((id) => valid.has(id)));
}

function requirementsForModule(project, moduleTag) {
  const mod = textOr(moduleTag).toLowerCase();
  if (!mod) return [];
  return ensureArray(project.requirements)
    .filter((r) => {
      const tags = ensureArray(r.moduleTags).map((t) => textOr(t).toLowerCase());
      const module = textOr(r.module).toLowerCase();
      return tags.includes(mod) || module === mod;
    })
    .map((r) => r.id);
}

function inferRequirementIdsForDiagram(project, diagram, context = {}) {
  const explicit = filterValidRequirementIds(project, diagram.linkedRequirementIds);
  if (explicit.length) return explicit;

  const fromContext = filterValidRequirementIds(project, context.requirementIds);
  if (fromContext.length) return fromContext;

  const capId = textOr(context.capabilityId);
  if (capId) {
    const cap = ensureArray(project.capabilities).find((c) => c.id === capId);
    const capReqs = filterValidRequirementIds(project, cap?.requirementIds);
    if (capReqs.length) return capReqs;
  }

  const moduleTag = textOr(diagram.module || context.moduleTag);
  const moduleReqs = filterValidRequirementIds(project, requirementsForModule(project, moduleTag));
  return moduleReqs.slice(0, 12);
}

function syncRequirementDiagramIds(project) {
  const diagramIdsByReq = new Map();
  for (const diagram of ensureArray(project.diagramArtifacts)) {
    for (const reqId of ensureArray(diagram.linkedRequirementIds)) {
      if (!diagramIdsByReq.has(reqId)) diagramIdsByReq.set(reqId, []);
      diagramIdsByReq.get(reqId).push(diagram.id);
    }
  }

  project.requirements = ensureArray(project.requirements).map((req) => ({
    ...req,
    linkedDiagramIds: mergeUniqueIds([], diagramIdsByReq.get(req.id) || []),
  }));
}

function ensureDiagramRequirementLinks(project, diagram, context = {}) {
  const resolved = inferRequirementIdsForDiagram(project, diagram, context);
  diagram.linkedRequirementIds = filterValidRequirementIds(
    project,
    mergeUniqueIds(diagram.linkedRequirementIds, resolved),
  );
  return diagram;
}

function backfillDiagramRequirementLinks(project, context = {}) {
  for (const diagram of ensureArray(project.diagramArtifacts)) {
    ensureDiagramRequirementLinks(project, diagram, {
      ...context,
      moduleTag: context.moduleTag || diagram.module,
    });
  }
  syncRequirementDiagramIds(project);
}

function linkRequirementsToDiagram(project, diagramId, requirementIds, { merge = true } = {}) {
  const diagram = ensureArray(project.diagramArtifacts).find((d) => d.id === diagramId);
  if (!diagram) return null;
  const incoming = filterValidRequirementIds(project, requirementIds);
  diagram.linkedRequirementIds = merge
    ? mergeUniqueIds(diagram.linkedRequirementIds, incoming)
    : incoming;
  syncRequirementDiagramIds(project);
  return diagram;
}

function applyDiagramToRequirementsResult(project, run, parsed, { newRequirementIds = [] } = {}) {
  const diagramId = textOr(parsed?.linkedDiagramId || run?.contextPack?.diagramArtifactId);
  if (!diagramId) return null;

  const diagram = ensureArray(project.diagramArtifacts).find((d) => d.id === diagramId);
  if (!diagram) return null;

  const affected = new Set(filterValidRequirementIds(project, newRequirementIds));
  for (const patch of ensureArray(parsed?.updates)) {
    if (patch.id) affected.add(patch.id);
  }
  for (const entry of [
    ...ensureArray(parsed?.stakeholderRequirements),
    ...ensureArray(parsed?.technicalRequirements),
  ]) {
    if (entry.id) affected.add(entry.id);
    for (const relId of ensureArray(entry.relatedRequirementIds)) {
      if (relId) affected.add(relId);
    }
  }

  diagram.linkedRequirementIds = filterValidRequirementIds(
    project,
    mergeUniqueIds(diagram.linkedRequirementIds, [...affected]),
  );
  syncRequirementDiagramIds(project);
  return diagram;
}

function removeRequirementFromDiagrams(project, requirementId) {
  for (const diagram of ensureArray(project.diagramArtifacts)) {
    diagram.linkedRequirementIds = ensureArray(diagram.linkedRequirementIds).filter((id) => id !== requirementId);
  }
  syncRequirementDiagramIds(project);
}

function resolveDefaultPackRequirementIds(project, capabilityId, moduleTag) {
  const cap = ensureArray(project.capabilities).find((c) => c.id === textOr(capabilityId));
  const capReqs = filterValidRequirementIds(project, cap?.requirementIds);
  if (capReqs.length) return capReqs;
  return filterValidRequirementIds(project, requirementsForModule(project, moduleTag));
}

module.exports = {
  mergeUniqueIds,
  filterValidRequirementIds,
  inferRequirementIdsForDiagram,
  syncRequirementDiagramIds,
  ensureDiagramRequirementLinks,
  backfillDiagramRequirementLinks,
  linkRequirementsToDiagram,
  applyDiagramToRequirementsResult,
  removeRequirementFromDiagrams,
  resolveDefaultPackRequirementIds,
  normalizeStringArray,
};
