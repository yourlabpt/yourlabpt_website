/**
 * The chain: personas run one after another without waiting for a phase to end.
 *
 * A project can have several Execuções over its life (build v1, add a feature three
 * months later, fix something later still). Each Execução is its own unit: its own
 * goal, its own OpenSpec change proposal, its own budget, clock and persona history.
 * Strictly sequential — a project has at most one non-terminal Execução; finished
 * ones stay in the list as a record.
 *
 * This module decides *what happens next* and nothing else. It performs no dispatch,
 * writes no store, and calls no provider — so the rule that actually governs spend and
 * safety is a pure function that can be tested exhaustively. The caller applies the
 * decision.
 *
 * An Execução stops for exactly three things:
 *   - a question to a human (mockup acceptance, code review before commit)
 *   - its own budget running out
 *   - the same failure repeating, which means more retries will not help
 */
const crypto = require('crypto');
const agentPersonas = require('./agent-personas');
const buildPolicies = require('./build-policies');
const changePropagation = require('./change-propagation');
const workSnapshot = require('./work-snapshot');
const projectBudget = require('./project-budget');
const workItems = require('./work-items');

// Finished forever — never resumed, excluded from "the active Execução."
const FINISHED_STATUSES = new Set(['completed', 'abandoned']);
// Stopped but still the project's live goal: paused_budget and halted are both
// resumed by raising the cap / making the call that unblocks them, same as
// waiting_human is resumed by answering. Only completed/abandoned truly end an
// Execução's life.
const ALL_STATUSES = new Set(['running', 'waiting_human', 'paused_budget', 'halted', ...FINISHED_STATUSES]);
const REPEAT_LIMIT = 3;
// How many times a persona may be re-run because its inputs moved. Beyond this the
// project is oscillating rather than converging, and a person has to look.
const STALE_RERUN_LIMIT = 2;

/**
 * Two ways work enters the factory.
 *
 * 'construcao' is the full chain: an intention becomes a mockup, requirements, modules
 * and finally code.
 *
 * 'levantamento' is the opposite direction — the app already exists and works, and what
 * is missing is the writing-down. Asking a UX Agent to have a mockup approved before
 * describing an app that is already live makes no sense, so the survey runs only the
 * personas that read and describe, and stops there. What it produces is reviewed like
 * any other result, and the building starts from real requirements afterwards.
 *
 * 'refinamento' changes one artifact that already exists and absorbs the consequences.
 * Its persona sequence is not declared anywhere — it is computed from what the change
 * touches, so it runs the few who must reconcile and nobody else. That is what makes a
 * late change an increment on what is built rather than a reason to redo it.
 */
const EXECUCAO_KINDS = new Set(['construcao', 'levantamento', 'refinamento']);

const PERSONA_SEQUENCE_BY_KIND = {
  levantamento: ['product_owner', 'module_architect'],
};

/**
 * Kinds whose last step must be reviewed before it counts, whatever the persona's own
 * approval flag says. A levantamento's output becomes the project's requirements and
 * module map — the ground everything later is built on — so it is never accepted just
 * because the chain finished without erroring.
 */
const KINDS_REVIEWED_AT_END = new Set(['levantamento']);

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeExecucao(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: text(src.id) || `exec_${crypto.randomUUID()}`,
    goal: text(src.goal),
    // What kind of work this is. 'construcao' builds something new; 'levantamento'
    // reads an app that already exists and writes down what it does. They need
    // different personas in a different order, so the kind travels with the Execução.
    kind: EXECUCAO_KINDS.has(text(src.kind)) ? text(src.kind) : 'construcao',
    // What a refinamento is about. Its whole persona sequence derives from this.
    targetArtifact: text(src.targetArtifact),
    // Artifacts whose stage was already approved and whose change a person has since
    // agreed to. Without this the same question would be asked on every pass.
    acknowledged: ensureArray(src.acknowledged).map((entry) => text(entry)).filter(Boolean),
    // The change proposal this Execução targets — what it costs and what it touches
    // are the same question once both point at the same id.
    changeId: text(src.changeId),
    status: ALL_STATUSES.has(text(src.status)) ? text(src.status) : 'running',
    startedAt: text(src.startedAt),
    updatedAt: text(src.updatedAt),
    currentPersonaId: text(src.currentPersonaId),
    currentWorkItemId: text(src.currentWorkItemId),
    question: src.question && typeof src.question === 'object' ? {
      personaId: text(src.question.personaId),
      kind: text(src.question.kind, 'review'),
      text: text(src.question.text),
      // What the answer is about. Dropping it here would lose the acknowledgement, and
      // the same approved artifact would be queried again on the next pass.
      artifact: text(src.question.artifact),
      workItemId: text(src.question.workItemId),
      raisedAt: text(src.question.raisedAt),
    } : null,
    haltReason: text(src.haltReason),
    // One entry per finished persona run: what it decided and what it cost.
    history: ensureArray(src.history).map((entry) => ({
      personaId: text(entry?.personaId),
      workItemId: text(entry?.workItemId),
      outcome: text(entry?.outcome, 'completed'),
      summary: text(entry?.summary),
      failureSignature: text(entry?.failureSignature),
      costUsd: Number(entry?.costUsd) || 0,
      seconds: Number(entry?.seconds) || 0,
      // Which engine ran this. The persona is fixed and the model is not, so without
      // these two a failure cannot be attributed to the model that produced it — and
      // "this cheap model keeps failing at this job" is exactly the thing worth
      // learning from a run.
      modelProfileId: text(entry?.modelProfileId),
      llmProvider: text(entry?.llmProvider),
      // What this run was built on. Dropping it here would silently disable staleness
      // detection on the next load, which is the whole point of recording it.
      inputFingerprint: text(entry?.inputFingerprint),
      at: text(entry?.at),
    })),
    budget: projectBudget.normalizeProjectBudget(src.budget),
  };
}

function normalizeExecucoes(project) {
  return ensureArray(project?.execucoes).map(normalizeExecucao);
}

/** The one Execução still in play, or null when the project is between goals. */
function activeExecucao(project) {
  return normalizeExecucoes(project).find((entry) => !FINISHED_STATUSES.has(entry.status)) || null;
}

/** Sum of spend across every Execução this project has ever run — the project-level metric. */
function projectSpendRollup(project, now = Date.now()) {
  const execucoes = normalizeExecucoes(project);
  return {
    totalSpentUsd: execucoes.reduce((sum, entry) => sum + entry.budget.spentUsd, 0),
    totalHours: execucoes.reduce((sum, entry) => sum + projectBudget.elapsedSeconds(entry.budget, now) / 3600, 0),
    count: execucoes.length,
    completed: execucoes.filter((entry) => entry.status === 'completed').length,
  };
}

function writeExecucao(project, execucao) {
  const execucoes = normalizeExecucoes(project);
  const index = execucoes.findIndex((entry) => entry.id === execucao.id);
  if (index === -1) execucoes.push(execucao);
  else execucoes[index] = execucao;
  project.execucoes = execucoes;
  return execucao;
}

function stamp(execucao, now) {
  return { ...execucao, updatedAt: new Date(now).toISOString() };
}

/**
 * A failure repeating with the same signature means the input is wrong, not the
 * attempt — re-cutting it again will produce the same result.
 */
function repeatedFailure(history) {
  const failures = history.filter((entry) => entry.outcome === 'failed' && entry.failureSignature);
  if (failures.length < REPEAT_LIMIT) return null;
  const recent = failures.slice(-REPEAT_LIMIT);
  const signature = recent[0].failureSignature;
  const personaId = recent[0].personaId;
  const identical = recent.every((entry) => (
    entry.failureSignature === signature && entry.personaId === personaId
  ));
  return identical ? { personaId, signature, count: recent.length } : null;
}

/** Personas that completed at least once, by id. */
function completedPersonaIds(history) {
  return new Set(history.filter((entry) => entry.outcome === 'completed').map((entry) => entry.personaId));
}

/**
 * A fingerprint of everything this persona reads. If it moves, whatever the persona
 * produced was built on something that is no longer true.
 *
 * Deliberately blind to who moved it. A person editing the idea by hand and an agent
 * rewriting it are the same event here, which is what stops a manual change being
 * quietly overwritten by whatever the AI last produced.
 */
function personaInputFingerprint(project, persona) {
  const stages = buildPolicies.stagesFeedingPersona(project?.productType, persona);
  return workSnapshot.fingerprint(workSnapshot.stagesSnapshot(project, stages));
}

/** The last time this persona finished, and what it was looking at. */
function lastCompletedRun(history, personaId) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.personaId === personaId && entry.outcome === 'completed') return entry;
  }
  return null;
}

/**
 * Has this persona's work gone stale? Only answerable once it has run at least once
 * *and* recorded what it saw — work finished before this existed is left alone rather
 * than being declared stale on no evidence.
 */
function isStale(project, persona, history) {
  const last = lastCompletedRun(history, persona.id);
  if (!last || !last.inputFingerprint) return false;
  return last.inputFingerprint !== personaInputFingerprint(project, persona);
}

/** How many times a persona has already been re-run because its inputs moved. */
function staleRerunCount(history, personaId) {
  return Math.max(0, history.filter(
    (entry) => entry.personaId === personaId && entry.outcome === 'completed',
  ).length - 1);
}

/**
 * Implementation units the Tech Lead produced that still need a developer or tester.
 * These are ordinary work items carrying a module scope.
 */
function pendingUnitsFor(project, persona) {
  const wanted = new Set(persona.taskTypes);
  return workItems.getWorkItems(project).filter((item) => (
    wanted.has(text(item.agentType))
    // A coordination item is a container, not work. It carries the same agentType as
    // its children, so without this it looks like a unit to dispatch and an agent gets
    // handed the folder instead of the task inside it.
    && text(item.taskRole) !== 'coordination'
    && !workItems.isTerminalStatus(text(item.status))
    && text(item.status) !== 'waiting_review'
  ));
}

/**
 * Decides the next move for a project's active Execução.
 *
 * Returns one of:
 *   { action: 'idle' }                    no Execução is in play
 *   { action: 'wait_human', question }     a standing question is open
 *   { action: 'paused_budget', budget }    money or hours exhausted
 *   { action: 'halt', reason }             the same failure keeps repeating
 *   { action: 'dispatch', persona, ... }   run this persona next
 *   { action: 'complete' }                 every persona has run
 */
function decideNext(project, options = {}) {
  const now = options.now ?? Date.now();
  const execucao = activeExecucao(project);
  const overrides = options.personaOverrides || {};
  const enabled = agentPersonas.listPersonas(overrides).filter((persona) => persona.enabled);

  if (!execucao) return { action: 'idle', execucao: null };

  // A levantamento runs a shorter chain in a declared order. A refinamento's order is
  // not declared at all: it is derived from what the change actually touches, so only
  // the personas that must reconcile come up — the rest never enter the list.
  const plan = execucao.kind === 'refinamento'
    ? changePropagation.reconcilePlan(project?.productType, execucao.targetArtifact)
    : null;
  const sequence = plan ? plan.map((step) => step.personaId) : PERSONA_SEQUENCE_BY_KIND[execucao.kind];
  const personas = sequence
    ? sequence.map((id) => enabled.find((persona) => persona.id === id)).filter(Boolean)
    : enabled;

  if (plan && !plan.length) {
    return {
      action: 'halt',
      execucao,
      reason: `Nada depende de ${text(execucao.targetArtifact, 'nada')}, por isso nao ha nada para reconciliar.`,
    };
  }
  if (execucao.status === 'halted') return { action: 'halt', execucao, reason: execucao.haltReason };
  if (execucao.status === 'paused_budget') {
    return { action: 'paused_budget', execucao, budget: projectBudget.budgetState(execucao.budget, now) };
  }

  // A question outranks everything: while one is open the Execução must not spend.
  if (execucao.question) {
    return { action: 'wait_human', question: execucao.question, execucao };
  }

  const budget = projectBudget.budgetState(execucao.budget, now);
  if (budget.exhausted) {
    return { action: 'paused_budget', budget, execucao };
  }

  const repeated = repeatedFailure(execucao.history);
  if (repeated) {
    return {
      action: 'halt',
      execucao,
      reason: `A mesma falha repetiu-se ${repeated.count}x em ${repeated.personaId}. E preciso uma decisao humana antes de continuar.`,
      repeated,
    };
  }

  // Something is already in flight; nothing to decide until it reports back.
  if (execucao.currentPersonaId) {
    return { action: 'running', execucao, personaId: execucao.currentPersonaId };
  }

  const completed = completedPersonaIds(execucao.history);
  for (const persona of personas) {
    if (persona.scopedToSingleModule) {
      const units = pendingUnitsFor(project, persona);
      if (units.length) {
        return {
          action: 'dispatch', persona, execucao, budget,
          workItem: units[0],
          remainingUnits: units.length,
        };
      }
      continue;
    }
    // Already run — unless what it read has moved since, in which case its output was
    // built on something no longer true and it is eligible again. This is what makes a
    // rerun resume from what is left instead of starting over.
    if (completed.has(persona.id)) {
      if (!isStale(project, persona, execucao.history)) continue;
      if (staleRerunCount(execucao.history, persona.id) >= STALE_RERUN_LIMIT) {
        return {
          action: 'halt',
          execucao,
          reason: `${persona.label} ja foi refeito ${STALE_RERUN_LIMIT}x porque o que le continua a mudar. Isto costuma significar duas decisoes em conflito — resolva-as antes de continuar.`,
        };
      }
      return {
        action: 'dispatch', persona, execucao, budget, workItem: null,
        // Named so the UI and the task can say why this is running a second time.
        reason: 'inputs-changed',
      };
    }

    // In a refinamento the upstream dependency rule does not apply: the point is to
    // touch a few specific personas out of order, not to walk the pipeline again.
    if (!plan) {
      const missing = persona.requiresUpstream.filter((id) => !completed.has(id));
      if (missing.length) {
        return {
          action: 'blocked', execucao, persona,
          reason: `${persona.label} depende de ${missing.join(', ')}, que ainda nao correu.`,
        };
      }
      return { action: 'dispatch', persona, execucao, budget, workItem: null };
    }

    const step = plan.find((entry) => entry.personaId === persona.id);
    // Rewriting something a human already signed off, without saying so, would make the
    // approval meaningless. Everything else is recorded and carries on.
    if (
      step.direction === 'upstream'
      && changePropagation.isArtifactApproved(project, project?.productType, step.artifact)
      && !execucao.acknowledged.includes(step.artifact)
    ) {
      return {
        action: 'wait_human',
        execucao,
        question: {
          personaId: persona.id,
          kind: 'approved_artifact_change',
          artifact: step.artifact,
          text: `Esta alteracao implica mexer em ${step.artifact}, que ja aprovou. ${step.rule} Aceita?`,
          raisedAt: new Date(now).toISOString(),
        },
      };
    }

    return {
      action: 'dispatch', persona, execucao, budget, workItem: null,
      // Carried through so the task can say why this persona is running and what it is
      // expected to reconcile — the raw material of the decision it will record.
      reconcile: step,
    };
  }

  // Reaching the end with nothing to build is not success. If the Tech Lead ran and
  // produced no implementation units, the Execução would otherwise report "complete"
  // having written no code at all.
  const implementer = personas.find((persona) => persona.id === 'developer');
  if (
    implementer
    && completed.has('tech_lead')
    && !execucao.history.some((entry) => entry.personaId === 'developer')
    && !workItems.getWorkItems(project).some((item) => implementer.taskTypes.includes(text(item.agentType)))
  ) {
    return {
      action: 'halt',
      execucao,
      reason: 'O Tech Lead terminou sem produzir nenhuma unidade de implementacao. Nada foi construido — reveja a decomposicao antes de continuar.',
    };
  }

  return { action: 'complete', execucao };
}

/**
 * A stable signature for a failure, so the same problem recurring is recognisable.
 * Deliberately coarse: exact error text varies between runs, the shape does not.
 */
function failureSignature(personaId, message) {
  return `${text(personaId)}:${text(message).toLowerCase().replace(/[0-9]+/g, '#').slice(0, 160)}`;
}

/** The question raised when a persona's result needs a human before the chain moves on. */
function questionFor(persona, workItem, execucaoKind = '') {
  if (execucaoKind === 'levantamento') {
    return {
      personaId: persona.id,
      kind: 'survey_acceptance',
      text: 'O levantamento terminou. Aceita estes requisitos e este mapa de modulos como a descricao do que a aplicacao ja faz?',
      workItemId: text(workItem?.id),
      raisedAt: new Date().toISOString(),
    };
  }
  const kind = persona.id === 'ux' ? 'mockup_acceptance' : 'result_review';
  const message = persona.id === 'ux'
    ? 'O mockup esta pronto. Aceita esta versao do frontend para dela derivarem os requisitos?'
    : `O resultado de ${persona.label} precisa de revisao antes de seguir.`;
  return {
    personaId: persona.id,
    kind,
    text: message,
    workItemId: text(workItem?.id),
    raisedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------- transitions */
/*
 * State changes applied to a project's Execuções. Each one banks or resumes the
 * clock, because the budget must never count time the chain was not actually working.
 */

/**
 * Starts a brand new Execução, or — when the current one is paused for budget or
 * halted — raises its cap and resumes it instead of abandoning its goal and history.
 * Refuses when an Execução is already actively running: only one goal at a time.
 */
function startExecucao(project, input = {}, now = Date.now()) {
  const existing = activeExecucao(project);
  if (existing && (existing.status === 'running' || existing.status === 'waiting_human')) {
    throw new Error('Ja existe uma execucao activa neste projecto.');
  }

  if (existing) {
    // Same goal, more room to work — not a new Execução.
    const resumed = stamp({
      ...existing,
      status: 'running',
      haltReason: '',
      budget: projectBudget.startClock({
        ...existing.budget,
        maxCostUsd: input.maxCostUsd !== undefined ? Number(input.maxCostUsd) || 0 : existing.budget.maxCostUsd,
        maxHours: input.maxHours !== undefined ? Number(input.maxHours) || 0 : existing.budget.maxHours,
      }, now),
    }, now);
    return writeExecucao(project, resumed);
  }

  const startedAtIso = new Date(now).toISOString();
  const created = normalizeExecucao({
    goal: input.goal,
    changeId: input.changeId,
    kind: input.kind,
    targetArtifact: input.targetArtifact,
    status: 'running',
    startedAt: startedAtIso,
    updatedAt: startedAtIso,
    budget: projectBudget.startClock({
      maxCostUsd: Number(input.maxCostUsd) || 0,
      maxHours: Number(input.maxHours) || 0,
    }, now),
  });
  return writeExecucao(project, created);
}

/** The chain is about to wait on a person — stop the clock so waiting is free. */
function raiseQuestion(project, question, now = Date.now()) {
  const execucao = activeExecucao(project);
  if (!execucao) throw new Error('Nao ha execucao activa.');
  return writeExecucao(project, stamp({
    ...execucao,
    status: 'waiting_human',
    currentPersonaId: '',
    currentWorkItemId: '',
    budget: projectBudget.stopClock(execucao.budget, now),
    question,
  }, now));
}

function answerQuestion(project, { accepted = true } = {}, now = Date.now()) {
  const execucao = activeExecucao(project);
  if (!execucao?.question) throw new Error('Nao ha nenhuma pergunta em aberto.');
  if (!accepted) {
    // Rejecting is not a halt: the persona runs again with the feedback.
    return writeExecucao(project, stamp({
      ...execucao,
      status: 'running',
      question: null,
      budget: projectBudget.startClock(execucao.budget, now),
      history: execucao.history.filter((entry) => entry.personaId !== execucao.question.personaId),
    }, now));
  }
  return writeExecucao(project, stamp({
    ...execucao,
    status: 'running',
    question: null,
    budget: projectBudget.startClock(execucao.budget, now),
    // Agreeing to touch something already approved is remembered, so the chain does not
    // ask again on every pass.
    acknowledged: execucao.question.artifact
      ? [...new Set([...execucao.acknowledged, execucao.question.artifact])]
      : execucao.acknowledged,
  }, now));
}

function markDispatched(project, persona, workItem, now = Date.now()) {
  const execucao = activeExecucao(project);
  if (!execucao) throw new Error('Nao ha execucao activa.');
  return writeExecucao(project, stamp({
    ...execucao,
    status: 'running',
    currentPersonaId: persona.id,
    currentWorkItemId: text(workItem?.id),
    budget: projectBudget.startClock(execucao.budget, now),
  }, now));
}

/**
 * Records what a persona did, and what it cost. Raises the standing question when the
 * persona's result is one a human must answer before the Execução moves on.
 */
function recordResult(project, result = {}, now = Date.now()) {
  const execucao = activeExecucao(project);
  if (!execucao) throw new Error('Nao ha execucao activa.');
  const personaId = text(result.personaId, execucao.currentPersonaId);
  const outcome = text(result.outcome, 'completed');
  const persona = agentPersonas.resolvePersona(personaId, result.personaOverrides || {});

  const entry = {
    personaId,
    workItemId: text(result.workItemId, execucao.currentWorkItemId),
    outcome,
    summary: text(result.summary),
    failureSignature: outcome === 'failed'
      ? failureSignature(personaId, result.failureMessage || result.summary)
      : '',
    costUsd: Number(result.costUsd) || 0,
    seconds: Number(result.seconds) || 0,
    // What ran it. Falls back to the persona's configured profile when the caller does
    // not say, which is the profile that would have been sent.
    modelProfileId: text(result.modelProfileId, persona?.modelProfileId || ''),
    llmProvider: text(result.llmProvider),
    // What this run was built on. A later run compares against it to know whether
    // anything it depended on has moved since — by a person or by another agent.
    inputFingerprint: persona ? personaInputFingerprint(project, persona) : '',
    at: new Date(now).toISOString(),
  };

  writeExecucao(project, stamp({
    ...execucao,
    currentPersonaId: '',
    currentWorkItemId: '',
    budget: projectBudget.recordSpend(execucao.budget, result.costUsd),
    history: [...execucao.history, entry],
  }, now));

  const sequence = PERSONA_SEQUENCE_BY_KIND[execucao.kind] || [];
  const finishesReviewedKind = KINDS_REVIEWED_AT_END.has(execucao.kind)
    && sequence[sequence.length - 1] === personaId;

  if (outcome === 'completed' && (persona?.requiresHumanApproval || finishesReviewedKind)) {
    raiseQuestion(project, questionFor(persona, { id: entry.workItemId }, execucao.kind), now);
  }
  return activeExecucao(project);
}

function haltChain(project, reason, now = Date.now()) {
  const execucao = activeExecucao(project);
  if (!execucao) throw new Error('Nao ha execucao activa.');
  return writeExecucao(project, stamp({
    ...execucao,
    status: 'halted',
    currentPersonaId: '',
    budget: projectBudget.stopClock(execucao.budget, now),
    haltReason: text(reason),
  }, now));
}

/** Ends the active Execução — completed (the goal was met) or abandoned (given up on). */
function stopChain(project, status = 'abandoned', now = Date.now()) {
  const execucao = activeExecucao(project);
  if (!execucao) throw new Error('Nao ha execucao activa.');
  return writeExecucao(project, stamp({
    ...execucao,
    status,
    currentPersonaId: '',
    currentWorkItemId: '',
    budget: projectBudget.stopClock(execucao.budget, now),
  }, now));
}

module.exports = {
  EXECUCAO_KINDS,
  STALE_RERUN_LIMIT,
  personaInputFingerprint,
  PERSONA_SEQUENCE_BY_KIND,
  REPEAT_LIMIT,
  activeExecucao,
  answerQuestion,
  decideNext,
  failureSignature,
  haltChain,
  markDispatched,
  normalizeExecucao,
  normalizeExecucoes,
  pendingUnitsFor,
  projectSpendRollup,
  questionFor,
  raiseQuestion,
  recordResult,
  repeatedFailure,
  startExecucao,
  stopChain,
};
