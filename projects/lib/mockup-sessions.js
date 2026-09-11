/**
 * Camada 0 — refining intention against something you can look at.
 *
 * Two or three sentences go in, one static screen comes back, and the person says
 * approve / change this / throw it away. It repeats until the screen stops moving. It
 * is meant to be fast, cheap and disposable, and it runs at the start of every Epic
 * rather than once at the start of a project.
 *
 * **It deliberately lives outside the Execução**, for three reasons that are not style:
 *
 *  1. Only one Execução runs at a time (`startExecucao` throws otherwise). Camada 0 has
 *     to be usable on the next Epic while the current one builds.
 *  2. A `refinamento` targeting `ux_mockup` resolves to ux → product_owner →
 *     module_architect → tech_lead. That is the most expensive chain in the system,
 *     fired on every turn of a loop whose whole premise is being cheap.
 *  3. Iterations that land in project state move the `discovery` fingerprint, which is
 *     project-global per stage. Every downstream persona would go stale, burn its
 *     stale-rerun budget, and halt the Execução at STALE_RERUN_LIMIT.
 *
 * So an iteration is throwaway in *storage*, not merely in spirit: bodies go to the blob
 * store and nothing the staleness snapshot reads is touched until a person approves.
 */
const crypto = require('crypto');
const blobStore = require('./blob-store');
const workSnapshot = require('./work-snapshot');

const STATUSES = new Set(['iterating', 'approved', 'discarded']);
const VERDICTS = new Set(['', 'approved', 'changes', 'discarded']);

/** A loop that never ends is not a loop, it is a bill. Both are per session. */
const DEFAULT_MAX_ITERATIONS = 12;
const DEFAULT_MAX_COST_USD = 2;

/**
 * Below this many changed lines between one iteration and the next, the screen has
 * stopped moving in any way a person would call meaningful. It is shown as a hint, never
 * acted on: leaving Camada 0 is a human decision, the same way Camada 1 is never derived
 * from Camada 0 without one.
 */
const SETTLED_DIFF_LINES = 6;

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeIteration(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = text(src.id);
  if (!id) return null;
  return {
    id,
    // The body lives in the blob store; this record holds only how to find it.
    blobId: text(src.blobId, id),
    // What the person asked for that produced this turn. Empty on the first.
    requestText: text(src.requestText),
    summary: text(src.summary),
    verdict: VERDICTS.has(text(src.verdict)) ? text(src.verdict) : '',
    // How much of the screen actually moved since the previous turn.
    changedLines: Math.max(0, Number(src.changedLines) || 0),
    costUsd: Math.max(0, Number(src.costUsd) || 0),
    llmOptionId: text(src.llmOptionId),
    createdAt: text(src.createdAt),
  };
}

function normalizeSession(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = text(src.id);
  if (!id) return null;
  const iterations = ensureArray(src.iterations).map(normalizeIteration).filter(Boolean);
  const status = STATUSES.has(text(src.status)) ? text(src.status) : 'iterating';
  return {
    id,
    // Which Epic this refines. Empty while the project has no epics yet — Camada 0 runs
    // before Camada 2 exists, which is the whole point of it being first.
    epicId: text(src.epicId),
    title: text(src.title),
    promptText: text(src.promptText),
    status,
    maxIterations: positive(src.maxIterations, DEFAULT_MAX_ITERATIONS),
    maxCostUsd: positive(src.maxCostUsd, DEFAULT_MAX_COST_USD),
    llmOptionId: text(src.llmOptionId),
    iterations,
    spentUsd: iterations.reduce((total, entry) => total + entry.costUsd, 0),
    // Which iteration the person accepted. Only this one ever reaches project state.
    approvedIterationId: text(src.approvedIterationId),
    createdAt: text(src.createdAt),
    updatedAt: text(src.updatedAt),
    createdBy: text(src.createdBy),
  };
}

function listSessions(project) {
  return ensureArray(project?.mockupSessions).map(normalizeSession).filter(Boolean);
}

function findSession(project, sessionId) {
  return listSessions(project).find((session) => session.id === text(sessionId)) || null;
}

function writeSessions(project, sessions) {
  project.mockupSessions = sessions.map(normalizeSession).filter(Boolean);
  return project.mockupSessions;
}

function startSession(project, input = {}, nowIso = new Date().toISOString()) {
  const promptText = text(input.promptText);
  if (!promptText) {
    throw new Error('Descreva em duas ou três frases o que quer ver.');
  }
  const session = normalizeSession({
    id: `mock_${crypto.randomUUID()}`,
    epicId: input.epicId,
    title: text(input.title, promptText.slice(0, 60)),
    promptText,
    status: 'iterating',
    maxIterations: input.maxIterations,
    maxCostUsd: input.maxCostUsd,
    llmOptionId: input.llmOptionId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: text(input.actorUserId),
  });
  writeSessions(project, [session, ...listSessions(project)]);
  return session;
}

/**
 * Why this session cannot run another turn, or empty.
 *
 * Said as a sentence naming the limit that was reached, because "no" with no reason is
 * the thing the interface rules exist to prevent.
 */
function blockedReason(session) {
  if (!session) return 'Esta sessão já não existe.';
  if (session.status === 'approved') return 'Esta sessão já foi aprovada.';
  if (session.status === 'discarded') return 'Esta sessão foi descartada.';
  if (session.iterations.length >= session.maxIterations) {
    return `Já foram ${session.iterations.length} tentativas. Se ainda não está perto, o problema está no pedido, não no ecrã — reescreva a intenção e comece outra sessão.`;
  }
  if (session.maxCostUsd > 0 && session.spentUsd >= session.maxCostUsd) {
    return `Esta sessão já gastou $${session.spentUsd.toFixed(2)} de $${session.maxCostUsd.toFixed(2)}.`;
  }
  return '';
}

/**
 * Records one turn of the loop.
 *
 * `changedLines` is computed here rather than supplied, so the settling signal always
 * describes the two bodies actually stored.
 */
function addIteration(project, sessionId, iteration = {}, previousHtml = '', nowIso = new Date().toISOString()) {
  const session = findSession(project, sessionId);
  const blocked = blockedReason(session);
  if (blocked) throw new Error(blocked);

  const html = String(iteration.html || '');
  if (!html.trim()) throw new Error('O agente devolveu um mockup vazio.');

  const diff = workSnapshot.promptDiff(previousHtml, html);
  const changedLines = String(diff || '')
    .split('\n')
    .filter((line) => line.startsWith('+') || line.startsWith('-'))
    .length;

  const entry = normalizeIteration({
    id: `iter_${crypto.randomUUID()}`,
    requestText: iteration.requestText,
    summary: iteration.summary,
    changedLines: session.iterations.length ? changedLines : 0,
    costUsd: iteration.costUsd,
    llmOptionId: iteration.llmOptionId || session.llmOptionId,
    createdAt: nowIso,
  });

  const next = { ...session, iterations: [...session.iterations, entry], updatedAt: nowIso };
  writeSessions(project, listSessions(project).map((s) => (s.id === session.id ? next : s)));
  return { session: normalizeSession(next), iteration: entry };
}

/** Approve / ask for changes / throw away — the only three verdicts this screen offers. */
function recordVerdict(project, sessionId, iterationId, verdict, nowIso = new Date().toISOString()) {
  const session = findSession(project, sessionId);
  if (!session) throw new Error('Sessão não encontrada.');
  if (!VERDICTS.has(verdict) || !verdict) throw new Error('Decisão desconhecida.');
  const iteration = session.iterations.find((entry) => entry.id === text(iterationId));
  if (!iteration) throw new Error('Iteração não encontrada.');

  const next = {
    ...session,
    iterations: session.iterations.map((entry) => (
      entry.id === iteration.id ? { ...entry, verdict } : entry
    )),
    status: verdict === 'approved' ? 'approved' : (verdict === 'discarded' ? 'discarded' : 'iterating'),
    approvedIterationId: verdict === 'approved' ? iteration.id : '',
    updatedAt: nowIso,
  };
  writeSessions(project, listSessions(project).map((s) => (s.id === session.id ? next : s)));
  return normalizeSession(next);
}

/** Where a session's body is kept. One function so the layout is stated once. */
function blobKeyFor(iterationId) {
  return text(iterationId);
}

async function saveIterationHtml(deps, projectId, iterationId, html) {
  return blobStore.saveBlob(
    deps.dataDir, projectId, blobStore.KIND.MOCKUP, blobKeyFor(iterationId),
    { html: String(html || ''), savedAt: new Date().toISOString() },
    deps.writeJson,
  );
}

async function loadIterationHtml(deps, projectId, iterationId) {
  const blob = await blobStore.loadBlob(
    deps.dataDir, projectId, blobStore.KIND.MOCKUP, blobKeyFor(iterationId), deps.readJson,
  );
  return typeof blob?.html === 'string' ? blob.html : '';
}

/**
 * What the Camada 0 screen shows, and the one number that tells you when to stop.
 *
 * The settling hint is descriptive, never a gate: it reports that the last turn barely
 * moved, and leaves the decision where it belongs.
 */
function sessionView(session) {
  if (!session) return null;
  const latest = session.iterations[session.iterations.length - 1] || null;
  const settled = Boolean(latest)
    && session.iterations.length > 1
    && latest.changedLines <= SETTLED_DIFF_LINES;
  return {
    ...session,
    latestIterationId: latest?.id || '',
    iterationsUsed: session.iterations.length,
    settled,
    settledHint: settled
      ? 'Esta versão mudou pouco em relação à anterior. Normalmente é o sinal de que a intenção estabilizou.'
      : '',
    blockedReason: blockedReason(session),
  };
}

module.exports = {
  DEFAULT_MAX_COST_USD,
  DEFAULT_MAX_ITERATIONS,
  SETTLED_DIFF_LINES,
  STATUSES,
  VERDICTS,
  addIteration,
  blobKeyFor,
  blockedReason,
  findSession,
  listSessions,
  loadIterationHtml,
  normalizeIteration,
  normalizeSession,
  recordVerdict,
  saveIterationHtml,
  sessionView,
  startSession,
  writeSessions,
};
