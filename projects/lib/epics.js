/**
 * Camada 2 — an Epic: a coherent slice of the vision, weeks wide.
 *
 * This is the only new entity the layered model needs, and it exists because an Epic and
 * an Execução are genuinely different things. An Epic is a **scope**; an Execução is a
 * **budgeted run** against part of one. A medium-to-large Epic is broken down and built
 * by several Execuções over weeks, which is why the Execução carries an `epicId` rather
 * than being the Epic.
 *
 * Everything below it reuses what already exists:
 *   Camada 3, a Feature — a coordination work item carrying this epic's id
 *   Camada 4, a Tarefa  — an execution work item under that feature
 *
 * That keeps the work-item tree two levels deep, which is not an accident: at three
 * levels `deriveParentStatuses` and `relevantWorkItems` both behave differently, and
 * making Epic a work item too would have bought a third level for nothing.
 */
const crypto = require('crypto');

const STATUSES = new Set(['draft', 'refining', 'active', 'done', 'dropped']);

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEpic(raw = {}, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = text(src.id);
  const title = text(src.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    summary: text(src.summary),
    status: STATUSES.has(text(src.status)) ? text(src.status) : 'draft',
    // The Camada 0 session whose mockup this epic was agreed from. An epic may not reach
    // a formal spec without one — see `specGap`.
    mockupSessionId: text(src.mockupSessionId),
    // The OpenSpec change that holds this epic's spec.md, proposal.md and tasks.md.
    changeId: text(src.changeId),
    order: Number.isFinite(Number(src.order)) ? Number(src.order) : index,
    createdAt: text(src.createdAt),
    updatedAt: text(src.updatedAt),
    createdBy: text(src.createdBy),
  };
}

function listEpics(project) {
  return ensureArray(project?.epics)
    .map((entry, index) => normalizeEpic(entry, index))
    .filter(Boolean)
    .sort((left, right) => left.order - right.order);
}

function findEpic(project, epicId) {
  return listEpics(project).find((epic) => epic.id === text(epicId)) || null;
}

function writeEpics(project, epics) {
  project.epics = epics.map((entry, index) => normalizeEpic(entry, index)).filter(Boolean);
  return project.epics;
}

function createEpic(project, input = {}, nowIso = new Date().toISOString()) {
  const title = text(input.title);
  if (!title) throw new Error('Dê um nome a esta epic — uma fatia da visão que se reconheça.');
  const existing = listEpics(project);
  const epic = normalizeEpic({
    id: `epic_${crypto.randomUUID()}`,
    title,
    summary: input.summary,
    status: 'draft',
    mockupSessionId: input.mockupSessionId,
    changeId: input.changeId,
    order: existing.length,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: input.actorUserId,
  }, existing.length);
  writeEpics(project, [...existing, epic]);
  return epic;
}

function updateEpic(project, epicId, patch = {}, nowIso = new Date().toISOString()) {
  const epic = findEpic(project, epicId);
  if (!epic) throw new Error('Epic não encontrada.');
  const next = normalizeEpic({
    ...epic,
    ...(patch.title !== undefined ? { title: text(patch.title, epic.title) } : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.mockupSessionId !== undefined ? { mockupSessionId: patch.mockupSessionId } : {}),
    ...(patch.changeId !== undefined ? { changeId: patch.changeId } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
    updatedAt: nowIso,
  }, epic.order);
  writeEpics(project, listEpics(project).map((entry) => (entry.id === epic.id ? next : entry)));
  return next;
}

/**
 * Why this epic may not have a formal spec yet, or empty.
 *
 * The one rule stated outright in the methodology: no epic reaches a formal spec without
 * first passing Camada 0. The reason is the whole point of the layered model — a spec
 * written against an intention nobody has looked at is a spec that gets rewritten.
 */
function specGap(project, epic, approvedSessionIds) {
  if (!epic) return 'Epic não encontrada.';
  if (!epic.mockupSessionId) {
    return 'Esta epic ainda não passou pela Camada 0. Refine a intenção contra um ecrã antes de escrever a especificação.';
  }
  if (!approvedSessionIds.has(epic.mockupSessionId)) {
    return 'O mockup desta epic ainda não foi aprovado. Aprove-o na Camada 0 antes de escrever a especificação.';
  }
  return '';
}

module.exports = {
  STATUSES,
  createEpic,
  findEpic,
  listEpics,
  normalizeEpic,
  specGap,
  updateEpic,
  writeEpics,
};
