/**
 * What happened while nobody was looking.
 *
 * The engineer opens the platform after hours away, and the first thing they need is
 * not a list of projects: it is what the agents did, what is waiting on them, and what
 * broke. This turns the raw project records into exactly that, per project.
 *
 * Read-only. Nothing here decides or changes anything.
 */
const loop = require('./orchestration-loop');
const workItems = require('./work-items');
const gitRepositories = require('./git-repositories');

// An Execução in one of these is stopped and will not move without a person.
const STOPPED_STATUSES = new Set(['halted', 'paused_budget']);

function textOr(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

/** Most recent timestamp among the values given; empty when there is none. */
function latest(...values) {
  return values
    .map((value) => textOr(value))
    .filter(Boolean)
    .sort()
    .pop() || '';
}

/**
 * The three things a person acts on. Kept separate rather than lumped into one
 * "needs attention" number, because each one is a different action: answer, wait, fix.
 */
function summarizeProject(project) {
  const execucao = loop.activeExecucao(project);
  const items = workItems.getWorkItems(project);

  let awaitingReview = 0;
  let failed = 0;
  for (const item of items) {
    const chip = workItems.executionStatusChip(item);
    if (chip.tone === 'review') awaitingReview += 1;
    else if (chip.tone === 'failed') failed += 1;
  }

  // An Execução holding a question is itself something to answer.
  const question = execucao?.status === 'waiting_human' ? execucao.question : null;
  if (question) awaitingReview += 1;

  const stopped = execucao && STOPPED_STATUSES.has(execucao.status) ? execucao : null;
  if (stopped) failed += 1;

  return {
    projectId: project.id,
    name: textOr(project.name),
    clientName: textOr(project.clientName),
    // Empty when the project cannot execute at all — the resume says so rather than
    // showing a project that looks idle when it is actually unable to start.
    hasRepository: Boolean(gitRepositories.normalizeProjectRepository(project.repository)),
    running: execucao?.status === 'running' ? 1 : 0,
    awaitingReview,
    failed,
    execucao: execucao ? {
      id: execucao.id,
      goal: textOr(execucao.goal),
      status: execucao.status,
      currentPersonaId: textOr(execucao.currentPersonaId),
      question: question ? { text: textOr(question.text), personaId: textOr(question.personaId) } : null,
      haltReason: textOr(stopped?.haltReason),
    } : null,
    lastActivityAt: latest(
      project.updatedAt,
      execucao?.history?.[execucao.history.length - 1]?.at,
      ...items.map((item) => item.updatedAt),
    ),
  };
}

/**
 * The whole picture, newest movement first — a project that moved an hour ago matters
 * more than one untouched for a month.
 */
function buildResume(projects) {
  const entries = projects.map(summarizeProject);
  entries.sort((a, b) => {
    // Anything asking for a decision floats above anything that is merely busy.
    const weight = (entry) => (entry.awaitingReview ? 3 : 0) + (entry.failed ? 2 : 0) + (entry.running ? 1 : 0);
    const byWeight = weight(b) - weight(a);
    if (byWeight) return byWeight;
    return String(b.lastActivityAt).localeCompare(String(a.lastActivityAt));
  });

  return {
    projects: entries,
    totals: {
      projects: entries.length,
      running: entries.reduce((sum, entry) => sum + entry.running, 0),
      awaitingReview: entries.reduce((sum, entry) => sum + entry.awaitingReview, 0),
      failed: entries.reduce((sum, entry) => sum + entry.failed, 0),
      withoutRepository: entries.filter((entry) => !entry.hasRepository).length,
    },
    observedAt: new Date().toISOString(),
  };
}

module.exports = { buildResume, summarizeProject };
