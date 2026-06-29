/**
 * V-cycle requirement hierarchy: stakeholder-driven decomposition tree.
 */
const crypto = require('crypto');

const V_LEVELS = [
  { id: 'stakeholder', label: 'Stakeholder', level: 0, prefix: 'STK' },
  { id: 'functional', label: 'Funcional', level: 1, prefix: 'FR' },
  { id: 'non_functional', label: 'Não funcional', level: 2, prefix: 'RNF' },
  { id: 'test_case', label: 'Teste / Aceite', level: 3, prefix: 'TC' },
];

const LINK_TYPES = {
  decomposes_from: 'decomposes_from',
  constrains: 'constrains',
  verified_by: 'verified_by',
  peer: 'peer',
};

const STAKEHOLDER_CHILD_TYPES = new Set(['functional', 'non_functional', 'undefined', 'out_of_scope']);
const REQUIRES_STK = new Set(['functional', 'non_functional', 'test_case', 'undefined']);

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRequirementType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'functional' || value === 'functional_requirement' || value === 'fr') return 'functional';
  if (value === 'non_functional' || value === 'nonfunctional' || value === 'non-functional' || value === 'nfr') return 'non_functional';
  if (value === 'stakeholder' || value === 'stakeholder_requirement' || value === 'sr') return 'stakeholder';
  if (value === 'test_case' || value === 'testcase' || value === 'test-case') return 'test_case';
  if (value === 'undefined') return 'undefined';
  if (value === 'out_of_scope' || value === 'out-of-scope') return 'out_of_scope';
  return null;
}

function normalizeRequirementIdToken(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function vLevelForType(type) {
  const t = normalizeRequirementType(type) || type;
  const row = V_LEVELS.find((entry) => entry.id === t);
  if (row) return row.level;
  if (t === 'undefined' || t === 'out_of_scope') return 1;
  return 1;
}

function prefixForType(type) {
  const t = normalizeRequirementType(type) || 'functional';
  return V_LEVELS.find((entry) => entry.id === t)?.prefix || 'REQ';
}

function buildIdIndex(requirements) {
  const byId = new Map();
  const aliasToId = new Map();
  for (const req of ensureArray(requirements)) {
    const id = normalizeRequirementIdToken(req?.id);
    if (!id) continue;
    byId.set(id, req);
    aliasToId.set(id, id);
    // SR-001 -> also match STK-01 style
    const m = id.match(/^(STK|SR|FR|RNF|TC|UQ|OOS)-(\d+)$/i);
    if (m) {
      const num = String(Number(m[2]));
      aliasToId.set(`${m[1]}-${m[2]}`, id);
      aliasToId.set(`${m[1]}-${num.padStart(2, '0')}`, id);
      if (m[1].toUpperCase() === 'SR') {
        aliasToId.set(`STK-${m[2]}`, id);
        aliasToId.set(`STK-${num.padStart(2, '0')}`, id);
      }
      if (m[1].toUpperCase() === 'STK') {
        aliasToId.set(`SR-${m[2]}`, id);
        aliasToId.set(`SR-${num.padStart(2, '0')}`, id);
      }
    }
  }
  return { byId, aliasToId };
}

function resolveRequirementId(rawId, index) {
  const token = normalizeRequirementIdToken(rawId);
  if (!token) return '';
  if (index.byId.has(token)) return token;
  if (index.aliasToId.has(token)) return index.aliasToId.get(token);
  return token;
}

function normalizeHierarchyLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const targetId = normalizeRequirementIdToken(raw.targetId);
  if (!targetId) return null;
  const linkType = textOr(raw.linkType, raw.role === 'parent' ? LINK_TYPES.decomposes_from : LINK_TYPES.peer);
  return {
    role: textOr(raw.role, linkType === LINK_TYPES.peer ? 'peer' : 'parent'),
    targetId,
    linkType,
  };
}

function hierarchyLinksFromLegacy(req) {
  const type = normalizeRequirementType(req?.type) || 'functional';
  const links = ensureArray(req?.hierarchyLinks).map(normalizeHierarchyLink).filter(Boolean);

  const parentStk = textOr(req?.stakeholderRequirementLink);
  const parentFr = textOr(req?.linkedFunctionalRequirement);

  if (parentStk) {
    links.push({ role: 'parent', targetId: normalizeRequirementIdToken(parentStk), linkType: LINK_TYPES.decomposes_from });
  }
  if (parentFr && type === 'test_case') {
    links.push({ role: 'parent', targetId: normalizeRequirementIdToken(parentFr), linkType: LINK_TYPES.verified_by });
  }

  const seen = new Set();
  const deduped = [];
  for (const link of links) {
    const key = `${link.role}:${link.linkType}:${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(link);
  }
  return deduped;
}

function parentLinkForType(links, type) {
  const t = normalizeRequirementType(type) || type;
  if (t === 'test_case') {
    return links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.verified_by)
      || links.find((l) => l.role === 'parent');
  }
  return links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.decomposes_from)
    || links.find((l) => l.role === 'parent');
}

function peerIdsFromRelated(relatedIds, parentIds) {
  const parentSet = new Set(parentIds.map(normalizeRequirementIdToken));
  return ensureArray(relatedIds)
    .map(normalizeRequirementIdToken)
    .filter((id) => id && !parentSet.has(id));
}

function syncRequirementHierarchyFields(req, index) {
  const type = normalizeRequirementType(req?.type) || 'functional';
  let links = hierarchyLinksFromLegacy(req).map((link) => ({
    ...link,
    targetId: resolveRequirementId(link.targetId, index) || link.targetId,
  }));

  const parent = parentLinkForType(links, type);
  const parentIds = links.filter((l) => l.role === 'parent').map((l) => l.targetId);
  const peers = peerIdsFromRelated(req?.relatedRequirementIds, [
    ...parentIds,
    textOr(req?.stakeholderRequirementLink),
    textOr(req?.linkedFunctionalRequirement),
  ]);

  links = [
    ...links.filter((l) => l.role === 'parent'),
    ...peers.map((targetId) => ({ role: 'peer', targetId, linkType: LINK_TYPES.peer })),
  ];

  const stakeholderRequirementLink = type === 'functional' || type === 'non_functional' || type === 'undefined'
    ? (links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.decomposes_from)?.targetId || '')
    : textOr(req?.stakeholderRequirementLink);
  const linkedFunctionalRequirement = type === 'test_case'
    ? (links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.verified_by)?.targetId || '')
    : textOr(req?.linkedFunctionalRequirement);

  const relatedRequirementIds = [
    ...peers,
    ...(stakeholderRequirementLink ? [stakeholderRequirementLink] : []),
    ...(linkedFunctionalRequirement ? [linkedFunctionalRequirement] : []),
  ].filter((id, i, arr) => arr.indexOf(id) === i && normalizeRequirementIdToken(id) !== normalizeRequirementIdToken(req?.id));

  return {
    ...req,
    type,
    hierarchyLinks: links,
    stakeholderRequirementLink,
    linkedFunctionalRequirement,
    relatedRequirementIds,
    vLevel: vLevelForType(type),
    parentId: parent?.targetId || '',
    parentLinkType: parent?.linkType || '',
  };
}

function getStakeholderAncestorId(req, index, depth = 0) {
  if (depth > 8) return '';
  const type = normalizeRequirementType(req?.type);
  if (type === 'stakeholder') return normalizeRequirementIdToken(req?.id);
  const links = hierarchyLinksFromLegacy(req);
  const parent = parentLinkForType(links, type);
  if (!parent?.targetId) return '';
  const parentReq = index.byId.get(resolveRequirementId(parent.targetId, index));
  if (!parentReq) return '';
  const pType = normalizeRequirementType(parentReq.type);
  if (pType === 'stakeholder') return normalizeRequirementIdToken(parentReq.id);
  if (pType === 'functional' && type === 'test_case') {
    return getStakeholderAncestorId(parentReq, index, depth + 1);
  }
  if (pType === 'functional' && type === 'non_functional') {
    return getStakeholderAncestorId(parentReq, index, depth + 1);
  }
  return getStakeholderAncestorId(parentReq, index, depth + 1);
}

function analyzeRequirementHierarchy(project) {
  const requirements = ensureArray(project?.requirements);
  const index = buildIdIndex(requirements);
  const synced = requirements.map((req) => syncRequirementHierarchyFields(req, index));

  for (const req of synced) {
    index.byId.set(normalizeRequirementIdToken(req.id), req);
  }

  const stats = {
    stakeholder: 0,
    functional: 0,
    non_functional: 0,
    test_case: 0,
    other: 0,
    withStakeholderRoot: 0,
    orphans: 0,
  };

  const orphans = [];
  const invalidLinks = [];
  const nodes = [];

  for (const req of synced) {
    const type = normalizeRequirementType(req.type) || 'other';
    if (stats[type] !== undefined) stats[type] += 1;
    else stats.other += 1;

    const stkRoot = getStakeholderAncestorId(req, index);
    const needsStk = REQUIRES_STK.has(type);
    if (needsStk && !stkRoot) {
      stats.orphans += 1;
      orphans.push({
        id: req.id,
        type: req.type,
        title: req.title,
        reason: type === 'test_case' && !req.linkedFunctionalRequirement
          ? 'missing_functional_or_stakeholder_parent'
          : 'missing_stakeholder_parent',
      });
    } else if (stkRoot) {
      stats.withStakeholderRoot += 1;
    }

    for (const link of ensureArray(req.hierarchyLinks)) {
      const resolved = resolveRequirementId(link.targetId, index);
      if (!index.byId.has(resolved)) {
        invalidLinks.push({ requirementId: req.id, targetId: link.targetId, resolved, linkType: link.linkType });
      }
    }

    nodes.push({
      id: req.id,
      type: req.type,
      vLevel: req.vLevel,
      title: req.title,
      status: req.status,
      parentId: req.parentId,
      parentLinkType: req.parentLinkType,
      stakeholderRootId: stkRoot,
      moduleTags: req.moduleTags || [],
      hierarchyLinks: req.hierarchyLinks,
    });
  }

  const suggestedStakeholders = orphans
    .filter((o) => o.type !== 'stakeholder')
    .map((o) => suggestStakeholderForOrphan(synced.find((r) => r.id === o.id), project, index));

  const coveragePct = requirements.length
    ? Math.round((stats.withStakeholderRoot / requirements.length) * 100)
    : 100;

  return {
    stats: { ...stats, total: requirements.length, coveragePct },
    nodes,
    orphans,
    invalidLinks,
    suggestedStakeholders,
    levels: V_LEVELS,
  };
}

function suggestStakeholderForOrphan(req, project, index) {
  if (!req) return null;
  const requirements = ensureArray(project?.requirements);
  const prefix = 'STK';
  let max = 0;
  for (const r of requirements) {
    const id = String(r?.id || '');
    if (!id.startsWith(`${prefix}-`)) continue;
    const n = Number(id.split('-')[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  const newId = `${prefix}-${String(max + 1).padStart(2, '0')}`;
  const title = textOr(req.need, req.title, req.shall, `Obrigação de sistema para ${req.id}`);
  return {
    draftId: newId,
    forRequirementId: req.id,
    synthesized: true,
    record: {
      id: newId,
      type: 'stakeholder',
      title: title.slice(0, 120),
      need: textOr(req.need, title),
      shall: textOr(req.shall, `The system shall address: ${textOr(req.title, req.id)}`),
      status: 'draft',
      priority: req.priority || 'medium',
      phase: req.phase || 'Backlog',
      synthesized: true,
      synthesizedForRequirementId: req.id,
    },
  };
}

function buildHierarchyTree(project, options = {}) {
  const analysis = analyzeRequirementHierarchy(project);
  const focusStakeholderId = textOr(options.focusStakeholderId);
  const focusRequirementId = textOr(options.focusRequirementId);
  const byLevel = {};
  for (const level of V_LEVELS) {
    byLevel[level.id] = [];
  }
  byLevel.other = [];

  let nodes = analysis.nodes;
  if (focusStakeholderId) {
    const focus = normalizeRequirementIdToken(focusStakeholderId);
    nodes = nodes.filter((n) => n.stakeholderRootId === focus || n.id === focus);
  }
  if (focusRequirementId) {
    const focus = normalizeRequirementIdToken(focusRequirementId);
    const allowed = new Set([focus]);
    for (const n of analysis.nodes) {
      if (n.parentId === focus) allowed.add(n.id);
    }
    nodes = nodes.filter((n) => allowed.has(n.id) || n.parentId === focus);
  }

  for (const node of nodes) {
    const type = normalizeRequirementType(node.type);
    if (byLevel[type]) byLevel[type].push(node);
    else byLevel.other.push(node);
  }

  return { ...analysis, byLevel, tree: nodes };
}

function applyHierarchyMove(requirement, patch, project) {
  const requirements = ensureArray(project?.requirements);
  const index = buildIdIndex(requirements);
  const type = normalizeRequirementType(patch.type || requirement.type) || normalizeRequirementType(requirement.type);
  let parentId = textOr(patch.parentId);
  if (patch.parentId === null) parentId = '';

  const resolvedParent = parentId ? resolveRequirementId(parentId, index) : '';
  const parentReq = resolvedParent ? index.byId.get(resolvedParent) : null;

  if (parentId && !parentReq) {
    throw new Error(`Requisito pai "${parentId}" não encontrado.`);
  }

  const links = [];
  if (type === 'test_case' && parentReq) {
    const pType = normalizeRequirementType(parentReq.type);
    if (pType !== 'functional') {
      throw new Error('Casos de teste devem ligar a um requisito funcional (FR).');
    }
    links.push({ role: 'parent', targetId: resolvedParent, linkType: LINK_TYPES.verified_by });
  } else if (parentReq && normalizeRequirementType(parentReq.type) === 'stakeholder') {
    links.push({ role: 'parent', targetId: resolvedParent, linkType: LINK_TYPES.decomposes_from });
  } else if (parentReq && type === 'non_functional') {
    const pType = normalizeRequirementType(parentReq.type);
    links.push({
      role: 'parent',
      targetId: resolvedParent,
      linkType: pType === 'stakeholder' ? LINK_TYPES.constrains : LINK_TYPES.decomposes_from,
    });
  }

  const peerLinks = ensureArray(requirement.hierarchyLinks)
    .filter((l) => l.role === 'peer')
    .map(normalizeHierarchyLink)
    .filter(Boolean);

  const merged = {
    ...requirement,
    type,
    hierarchyLinks: [...links, ...peerLinks],
    stakeholderRequirementLink: type !== 'stakeholder' && links.find((l) => l.linkType === LINK_TYPES.decomposes_from)
      ? links.find((l) => l.linkType === LINK_TYPES.decomposes_from).targetId
      : '',
    linkedFunctionalRequirement: type === 'test_case' && links.find((l) => l.linkType === LINK_TYPES.verified_by)
      ? links.find((l) => l.linkType === LINK_TYPES.verified_by).targetId
      : '',
  };

  return syncRequirementHierarchyFields(merged, index);
}

function repairHierarchyOrphans(project, selections = []) {
  const requirements = ensureArray(project?.requirements).slice();
  const index = buildIdIndex(requirements);
  const analysis = analyzeRequirementHierarchy({ ...project, requirements });
  const toApply = selections.length
    ? analysis.suggestedStakeholders.filter((s) => selections.includes(s.forRequirementId))
    : analysis.suggestedStakeholders;

  const created = [];
  const undo = { created: [], unlinked: [] };
  for (const suggestion of toApply) {
    if (!suggestion?.record) continue;
    const orphan = requirements.find((r) => r.id === suggestion.forRequirementId);
    if (!orphan) continue;
    if (requirements.some((r) => r.id === suggestion.draftId)) continue;

    undo.unlinked.push({
      requirementId: orphan.id,
      stakeholderRequirementLink: textOr(orphan.stakeholderRequirementLink),
      hierarchyLinks: ensureArray(orphan.hierarchyLinks).map((link) => ({ ...link })),
      parentId: textOr(orphan.parentId),
    });

    const stk = {
      ...suggestion.record,
      id: suggestion.draftId,
      hierarchyLinks: [],
      relatedRequirementIds: [],
      synthesized: true,
      synthesizedForRequirementId: orphan.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    requirements.push(stk);
    index.byId.set(stk.id, stk);
    created.push(stk.id);
    undo.created.push(stk.id);

    const idx = requirements.findIndex((r) => r.id === orphan.id);
    if (idx >= 0) {
      requirements[idx] = applyHierarchyMove(orphan, {
        type: orphan.type,
        parentId: stk.id,
      }, { ...project, requirements });
    }
  }

  return { requirements, created, repaired: toApply.length, undo };
}

function collectRepairCreatedStakeholderIds(project, activityLog = []) {
  const projectId = textOr(project?.id);
  const created = new Set();
  for (const act of ensureArray(activityLog)) {
    if (textOr(act?.projectId) !== projectId) continue;
    if (textOr(act?.action) !== 'requirement_hierarchy_repaired') continue;
    for (const id of ensureArray(act?.details?.created)) {
      const token = normalizeRequirementIdToken(id);
      if (token) created.add(token);
    }
    for (const id of ensureArray(act?.details?.undo?.created)) {
      const token = normalizeRequirementIdToken(id);
      if (token) created.add(token);
    }
  }
  for (const req of ensureArray(project?.requirements)) {
    if (normalizeRequirementType(req?.type) !== 'stakeholder') continue;
    if (req?.synthesized || textOr(req?.synthesizedForRequirementId)) {
      created.add(normalizeRequirementIdToken(req.id));
    }
  }
  return created;
}

function unlinkRequirementFromStakeholders(req, stakeholderIds, index) {
  const stkSet = stakeholderIds instanceof Set ? stakeholderIds : new Set(stakeholderIds);
  const filteredLinks = ensureArray(req?.hierarchyLinks).filter((link) => {
    if (textOr(link?.role) !== 'parent') return true;
    const targetId = normalizeRequirementIdToken(link?.targetId);
    if (textOr(link?.linkType) === LINK_TYPES.decomposes_from && stkSet.has(targetId)) return false;
    return true;
  });
  const stakeholderRequirementLink = stkSet.has(normalizeRequirementIdToken(req?.stakeholderRequirementLink))
    ? ''
    : textOr(req?.stakeholderRequirementLink);
  return syncRequirementHierarchyFields({
    ...req,
    hierarchyLinks: filteredLinks,
    stakeholderRequirementLink,
  }, index);
}

function revertStakeholderRepairs(project, options = {}) {
  const requirements = ensureArray(project?.requirements).slice();
  let stakeholderIds = options.stakeholderIds;
  if (!stakeholderIds?.length) {
    stakeholderIds = [...collectRepairCreatedStakeholderIds(project, options.activity || [])];
  }
  stakeholderIds = stakeholderIds.map(normalizeRequirementIdToken).filter(Boolean);
  const stkSet = new Set(stakeholderIds);
  if (!stkSet.size) {
    return { requirements, removed: [], unlinked: [] };
  }

  const unlinked = [];
  let index = buildIdIndex(requirements);
  for (let i = 0; i < requirements.length; i += 1) {
    const req = requirements[i];
    if (stkSet.has(normalizeRequirementIdToken(req.id))) continue;
    const before = normalizeRequirementIdToken(req.stakeholderRequirementLink);
    const updated = unlinkRequirementFromStakeholders(req, stkSet, index);
    const after = normalizeRequirementIdToken(updated.stakeholderRequirementLink);
    if (before !== after || JSON.stringify(req.hierarchyLinks) !== JSON.stringify(updated.hierarchyLinks)) {
      unlinked.push(req.id);
      requirements[i] = updated;
    }
  }

  index = buildIdIndex(requirements);
  const filtered = requirements.filter((req) => !stkSet.has(normalizeRequirementIdToken(req.id)));
  return { requirements: filtered, removed: [...stkSet], unlinked };
}

function getRevertableStakeholderRepairs(project, activityLog = []) {
  const ids = collectRepairCreatedStakeholderIds(project, activityLog);
  const index = buildIdIndex(ensureArray(project?.requirements));
  const existing = [...ids].filter((id) => index.byId.has(id));
  return {
    count: existing.length,
    stakeholderIds: existing,
    canRevert: existing.length > 0,
  };
}

function nextRequirementNumber(requirements, prefix) {
  let max = 0;
  for (const req of ensureArray(requirements)) {
    const id = String(req?.id || '');
    if (!id.startsWith(`${prefix}-`)) continue;
    const parsed = Number(id.split('-')[1]);
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  }
  return max + 1;
}

function chainNodesForStakeholder(project, focusStakeholderId) {
  const focus = normalizeRequirementIdToken(focusStakeholderId);
  if (!focus) return [];
  const analysis = analyzeRequirementHierarchy(project);
  return analysis.nodes.filter((n) => n.stakeholderRootId === focus || n.id === focus);
}

function findDefaultParentForZone(project, zoneType, focusStakeholderId) {
  const focus = normalizeRequirementIdToken(focusStakeholderId);
  if (zoneType === 'stakeholder') return focus || '';
  const chain = chainNodesForStakeholder(project, focus);
  const frs = chain.filter((n) => n.type === 'functional');
  if (zoneType === 'functional') return focus;
  if (zoneType === 'non_functional') return frs[0]?.id || focus;
  if (zoneType === 'test_case') return frs[0]?.id || '';
  return focus;
}

function normalizeTypeForZoneDrop(sourceType, zoneType) {
  const src = normalizeRequirementType(sourceType) || sourceType;
  if (zoneType === 'functional') {
    if (src === 'undefined') return 'functional';
    if (['functional', 'non_functional'].includes(src)) return src;
  }
  if (zoneType === 'non_functional' && src === 'undefined') return 'non_functional';
  if (zoneType === 'test_case') return 'test_case';
  return src;
}

function canLinkRequirements(source, target) {
  const sourceType = normalizeRequirementType(source?.type);
  const targetType = normalizeRequirementType(target?.type);
  if (!sourceType || !targetType) return false;
  if (targetType === 'stakeholder') {
    return STAKEHOLDER_CHILD_TYPES.has(sourceType) || sourceType === 'functional' || sourceType === 'non_functional';
  }
  if (targetType === 'functional' && sourceType === 'test_case') return true;
  if (targetType === 'functional' && sourceType === 'non_functional') return true;
  if (targetType === 'stakeholder' && sourceType === 'test_case') return false;
  return false;
}

function createStakeholderForOrphan(orphan, project, requirements, index) {
  const suggestion = suggestStakeholderForOrphan(orphan, { ...project, requirements }, index);
  const stkNum = nextRequirementNumber(requirements, 'STK');
  const stkId = `STK-${String(stkNum).padStart(2, '0')}`;
  const stk = {
    ...(suggestion?.record || {}),
    id: stkId,
    type: 'stakeholder',
    hierarchyLinks: [],
    relatedRequirementIds: [],
    synthesized: true,
    synthesizedForRequirementId: orphan.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  requirements.push(stk);
  index.byId.set(stk.id, stk);
  return stkId;
}

function applyHierarchyDrop(project, requirementId, drop = {}) {
  const requirements = ensureArray(project?.requirements).slice();
  let index = buildIdIndex(requirements);
  const reqId = resolveRequirementId(requirementId, index);
  const requirement = index.byId.get(reqId);
  if (!requirement) throw new Error(`Requisito "${requirementId}" não encontrado.`);

  const zoneType = normalizeRequirementType(drop.zoneType) || textOr(drop.zoneType);
  const targetRequirementId = textOr(drop.targetRequirementId);
  const focusStakeholderId = normalizeRequirementIdToken(drop.focusStakeholderId);
  let createdStakeholderId = '';

  if (normalizeRequirementType(requirement.type) === 'stakeholder') {
    if (zoneType !== 'stakeholder') {
      throw new Error('Requisitos stakeholder (L0) só podem ser colocados na coluna STK.');
    }
    return { requirements, createdStakeholderId: '', movedRequirementId: reqId };
  }

  if (targetRequirementId) {
    const targetId = resolveRequirementId(targetRequirementId, index);
    const target = index.byId.get(targetId);
    if (!target) throw new Error(`Alvo "${targetRequirementId}" não encontrado.`);
    if (!canLinkRequirements(requirement, target)) {
      throw new Error('Ligação inválida entre estes tipos.');
    }
    const idx = requirements.findIndex((r) => r.id === reqId);
    requirements[idx] = applyHierarchyMove(requirement, {
      type: requirement.type,
      parentId: targetId,
    }, { ...project, requirements });
    return { requirements, createdStakeholderId: '', movedRequirementId: reqId };
  }

  if (!zoneType) throw new Error('Zona de destino inválida.');

  let parentId = findDefaultParentForZone({ ...project, requirements }, zoneType, focusStakeholderId);
  const needsNewStakeholder = zoneType === 'stakeholder' && !parentId;

  if (needsNewStakeholder) {
    createdStakeholderId = createStakeholderForOrphan(requirement, project, requirements, index);
    parentId = createdStakeholderId;
    index = buildIdIndex(requirements);
  } else if (!parentId) {
    throw new Error('Não foi possível determinar o requisito pai. Arraste sobre um cartão ou escolha um STK.');
  }

  const nextType = normalizeTypeForZoneDrop(requirement.type, zoneType);
  const idx = requirements.findIndex((r) => r.id === reqId);
  requirements[idx] = applyHierarchyMove(requirement, {
    type: nextType,
    parentId,
  }, { ...project, requirements });

  return { requirements, createdStakeholderId, movedRequirementId: reqId };
}

module.exports = {
  V_LEVELS,
  LINK_TYPES,
  normalizeRequirementType,
  normalizeRequirementIdToken,
  vLevelForType,
  buildIdIndex,
  resolveRequirementId,
  syncRequirementHierarchyFields,
  analyzeRequirementHierarchy,
  buildHierarchyTree,
  suggestStakeholderForOrphan,
  applyHierarchyMove,
  applyHierarchyDrop,
  repairHierarchyOrphans,
  revertStakeholderRepairs,
  getRevertableStakeholderRepairs,
  collectRepairCreatedStakeholderIds,
  hierarchyLinksFromLegacy,
  getStakeholderAncestorId,
  nextRequirementNumber,
};
