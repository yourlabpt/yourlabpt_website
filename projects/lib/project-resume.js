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
const agentPersonas = require('./agent-personas');

// An Execução in one of these is stopped and will not move without a person.
const STOPPED_STATUSES = new Set(['halted', 'paused_budget']);

// A delivery stage in one of these is behind the project, not where it stands.
const PASSED_STAGE_STATUSES = new Set(['approved', 'done']);

// How many waiting or failed tasks the entry screen names. Beyond this it is a count.
const ATTENTION_LIMIT = 5;

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

/** A persona's name as people read it; the id when the registry does not know it. */
function personaLabel(personaId) {
  const id = textOr(personaId);
  if (!id) return '';
  return agentPersonas.listPersonas().find((persona) => persona.id === id)?.label || id;
}

/** The first delivery stage not yet approved — where the project actually stands. */
function currentStage(project) {
  const stages = Array.isArray(project.stages) ? project.stages : [];
  if (!stages.length) return { id: '', index: -1, total: 0 };
  const index = stages.findIndex((stage) => !PASSED_STAGE_STATUSES.has(textOr(stage?.status)));
  const at = index === -1 ? stages.length - 1 : index;
  return { id: textOr(stages[at]?.id), index: at, total: stages.length };
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
  // Named, not only counted: "1 a rever" is a number; "Rever login" is something to open.
  const attention = [];
  for (const item of items) {
    const chip = workItems.executionStatusChip(item);
    if (chip.tone !== 'review' && chip.tone !== 'failed') continue;
    if (chip.tone === 'review') awaitingReview += 1;
    else failed += 1;
    attention.push({ id: item.id, title: textOr(item.title), tone: chip.tone, label: chip.label, updatedAt: textOr(item.updatedAt) });
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
    status: textOr(project.status, 'active'),
    stage: currentStage(project),
    // Empty when the project cannot execute at all — the resume says so rather than
    // showing a project that looks idle when it is actually unable to start.
    hasRepository: Boolean(gitRepositories.normalizeProjectRepository(project.repository)),
    running: execucao?.status === 'running' ? 1 : 0,
    awaitingReview,
    failed,
    attention: attention.slice(0, ATTENTION_LIMIT),
    tasks: items.length,
    execucao: execucao ? {
      id: execucao.id,
      goal: textOr(execucao.goal),
      kind: textOr(execucao.kind),
      status: execucao.status,
      startedAt: textOr(execucao.startedAt),
      currentPersonaId: textOr(execucao.currentPersonaId),
      currentPersonaLabel: personaLabel(execucao.currentPersonaId),
      question: question ? {
        text: textOr(question.text),
        personaId: textOr(question.personaId),
        personaLabel: personaLabel(question.personaId),
        // What the answer is about, so the screen can say "aprovar mockup" rather than
        // quoting the question back.
        kind: textOr(question.kind),
        artifact: textOr(question.artifact),
        workItemId: textOr(question.workItemId),
        raisedAt: textOr(question.raisedAt),
      } : null,
      haltReason: textOr(stopped?.haltReason),
      // What it has spent against its cap — enough for a bar; the full clock is on the home.
      budget: {
        spentUsd: Number(execucao.budget?.spentUsd) || 0,
        maxCostUsd: Number(execucao.budget?.maxCostUsd) || 0,
        currency: textOr(execucao.budget?.currency, 'USD'),
      },
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
