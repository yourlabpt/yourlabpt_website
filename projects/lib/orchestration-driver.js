/**
 * What makes an Execução run unattended.
 *
 * There is no scheduler and no polling: the chain propagates itself. A run finishing
 * records its result and immediately asks what is next, dispatching it in the same
 * breath. The chain therefore advances exactly as fast as the runtime works, and stops
 * dead the moment a persona raises a question, the Execução's budget runs out, or a
 * failure repeats.
 *
 * Dispatch goes through the extracted `startAgentRun`, so there is still only one way
 * to execute an agent.
 */
const crypto = require('crypto');
const loop = require('./orchestration-loop');
const agentPlatformSettings = require('./agent-platform-settings');
const buildPolicies = require('./build-policies');
const modelRouting = require('./model-routing');
const workItems = require('./work-items');

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

/** How many times this persona has already run in this Execução. */
function attemptsSoFar(execucao, personaId) {
  const history = Array.isArray(execucao?.history) ? execucao.history : [];
  return history.filter((entry) => entry?.personaId === personaId).length;
}

/**
 * Writes the chosen engine onto the task.
 *
 * It goes into `executionSettings` because that is what the dispatch already reads, and
 * a per-task setting already outranks the persona default there — so routing needs no
 * new path to the runtime, only the right value in the existing one.
 */
function applyRouting(project, item, routed) {
  const next = workItems.getWorkItems(project).map((entry) => (entry.id === item.id
    ? workItems.normalizeWorkItem({
      ...entry,
      executionSettings: {
        ...(entry.executionSettings || {}),
        modelProfileId: routed.profileId,
        llmOptionId: routed.optionId,
      },
    }, { project })
    : entry));
  workItems.setWorkItems(project, next);
  item.executionSettings = {
    ...(item.executionSettings || {}),
    modelProfileId: routed.profileId,
    llmOptionId: routed.optionId,
  };
  return item;
}

function createPersonaWorkItem(project, persona, actorUserId, reconcile = null) {
  let item = workItems.normalizeWorkItem({
    id: `task_${crypto.randomUUID()}`,
    title: reconcile && reconcile.direction !== 'produces'
      ? `${persona.label} — reconciliar ${reconcile.artifact}`
      : `${persona.label} — ${text(project.name, 'projecto')}`,
    status: 'ready',
    // 'orchestration' is not a valid origin — normalizeOrigin silently coerced it to
    // 'human', so every task the chain created was filed as one a person wrote, and
    // "what did the agents do" could never be answered.
    origin: 'platform',
    executorMode: 'agent',
    agentType: persona.taskTypes[0],
    agentId: text(persona.agentId),
    deliveryStageId: persona.deliveryStages[0],
    descriptionMarkdown: reconcile ? reconcile.rule : persona.summary,
    reconcile: reconcile && reconcile.direction !== 'produces' ? reconcile : null,
    createdBy: actorUserId,
  }, { project });

  // A reconciliation exists because something else moved. Saying so on the task, as a
  // decision awaiting a ruling, is what keeps the call with the person: the persona
  // proposes, and nothing about the earlier phase counts until someone accepts.
  if (reconcile && reconcile.direction !== 'produces') {
    item = workItems.addWorkItemDecision(item, {
      artifact: reconcile.sourceArtifact || reconcile.artifact,
      affects: [reconcile.artifact],
      proposal: reconcile.direction === 'upstream'
        ? `Actualizar ${reconcile.artifact} para acompanhar a alteracao.`
        : `Rever o que foi construido sobre ${reconcile.artifact}.`,
      rationale: reconcile.rule,
      changedBy: reconcile.changedBy || 'agent',
    }, { actorUserId }).item;
  }

  workItems.setWorkItems(project, [...workItems.getWorkItems(project), item]);
  return item;
}

function createDriver(deps) {
  const { updateStore, appendActivity, startAgentRun, dataDir, nowIso } = deps;

  /**
   * Advances one step and starts the run if the step is a dispatch.
   * Safe to call at any time: on a project with no active Execução, or one waiting
   * or halted, it does nothing.
   */
  async function advanceOnce(projectId, actorUserId = 'orchestration') {
    const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
    const overrides = settings.personas || {};
    let dispatch = null;
    let decisionAction = '';

    await updateStore(async (store) => {
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) throw new Error('Projeto nao encontrado.');

      const decision = loop.decideNext(project, { personaOverrides: overrides });
      decisionAction = decision.action;

      if (decision.action === 'halt') {
        if (loop.activeExecucao(project)?.status !== 'halted') {
          loop.haltChain(project, decision.reason);
          appendActivity(store, {
            actorUserId, projectId, action: 'orchestration_halted',
            details: { reason: decision.reason },
          });
        }
        return;
      }
      if (decision.action === 'paused_budget') {
        if (loop.activeExecucao(project)?.status !== 'paused_budget') {
          loop.stopChain(project, 'paused_budget');
          appendActivity(store, {
            actorUserId, projectId, action: 'orchestration_budget_exhausted',
            details: { reason: decision.budget.reason, spentUsd: decision.budget.spentUsd },
          });
        }
        return;
      }
      // A refinamento that wants to touch something already approved asks first. The
      // decision names the question; persisting it is what actually stops the chain.
      if (decision.action === 'wait_human' && decision.question) {
        if (!loop.activeExecucao(project)?.question) {
          loop.raiseQuestion(project, decision.question);
          appendActivity(store, {
            actorUserId, projectId, action: 'orchestration_question_raised',
            details: { personaId: decision.question.personaId, artifact: decision.question.artifact },
          });
        }
        return;
      }
      if (decision.action === 'complete') {
        loop.stopChain(project, 'completed');
        appendActivity(store, { actorUserId, projectId, action: 'orchestration_completed', details: {} });
        return;
      }
      if (decision.action !== 'dispatch') return;

      const item = decision.workItem
        || createPersonaWorkItem(project, decision.persona, actorUserId, decision.reconcile || null);

      // Choose the engine for this run. The persona is untouched by this — only which
      // model executes it, and the reason is carried so the operator can see why.
      const routed = agentPlatformSettings.routeForPersona(settings, {
        personaId: decision.persona.id,
        camada: buildPolicies.camadaForStage(project.productType, item.deliveryStageId),
        attempt: attemptsSoFar(loop.activeExecucao(project), decision.persona.id),
      });
      applyRouting(project, item, routed);

      loop.markDispatched(project, decision.persona, item);
      project.updatedAt = nowIso();
      dispatch = {
        personaId: decision.persona.id,
        workItemId: item.id,
        agentType: decision.persona.taskTypes[0],
        agentId: text(decision.persona.agentId),
        deliveryStageId: item.deliveryStageId,
        modelProfileId: routed.profileId,
        llmOptionId: routed.optionId,
        llmProvider: routed.option?.provider || '',
        routingReason: routed.reason,
      };
      appendActivity(store, {
        actorUserId, projectId, action: 'orchestration_dispatch',
        details: {
          personaId: decision.persona.id,
          workItemId: item.id,
          llmOptionId: routed.optionId,
          modelProfileId: routed.profileId,
          routingReason: routed.reason,
        },
      });
    });

    if (!dispatch) return { action: decisionAction, dispatch: null };

    // The store is already committed, so a runtime failure here cannot roll back the
    // chain state — it is recorded as a failed step and the chain decides what next.
    const result = await startAgentRun({
      projectId,
      agentType: dispatch.agentType,
      agentId: dispatch.agentId || undefined,
      workItemId: dispatch.workItemId,
      options: { stageId: dispatch.deliveryStageId },
      actorUserId,
    });

    if (result.status >= 400) {
      await recordAndAdvance(projectId, {
        personaId: dispatch.personaId,
        workItemId: dispatch.workItemId,
        outcome: 'failed',
        failureMessage: result.body?.message || `HTTP ${result.status}`,
      }, actorUserId, { advance: false });
      return { action: 'dispatch_failed', dispatch, error: result.body?.message };
    }

    return { action: 'dispatch', dispatch, run: result.body };
  }

  /**
   * Records a finished persona run and immediately dispatches the next one.
   * This is the hinge that makes the chain self-propagating.
   */
  async function recordAndAdvance(projectId, result = {}, actorUserId = 'orchestration', options = {}) {
    const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
    let shouldAdvance = false;
    let ranOn = null;

    await updateStore(async (store) => {
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) return;
      const execucao = loop.activeExecucao(project);
      // Only a chain-driven Execução advances itself; a hand-started run must not.
      if (!execucao || !['running', 'waiting_human'].includes(execucao.status)) return;

      // Which engine actually ran this, read off the task rather than guessed, so the
      // record below attributes the outcome to the model that produced it.
      const ranItem = workItems.findWorkItem(project, result.workItemId || execucao.currentWorkItemId);
      ranOn = {
        optionId: text(ranItem?.executionSettings?.llmOptionId),
        modelProfileId: text(ranItem?.executionSettings?.modelProfileId),
      };

      loop.recordResult(project, {
        ...result,
        modelProfileId: text(result.modelProfileId, ranOn.modelProfileId),
        personaOverrides: settings.personas || {},
      });
      project.updatedAt = nowIso();
      appendActivity(store, {
        actorUserId, projectId, action: 'orchestration_result',
        details: {
          personaId: text(result.personaId),
          outcome: text(result.outcome, 'completed'),
          costUsd: Number(result.costUsd) || 0,
        },
      });
      // recordResult raises the standing question when one is due; only keep going
      // when it did not.
      shouldAdvance = loop.activeExecucao(project)?.status === 'running';
    });

    // What this persona and this engine did, together. Kept outside the project store
    // because it is platform-wide learning: a model that keeps failing one persona
    // fails it on every project, and the next routing decision should already know.
    if (ranOn?.optionId && text(result.personaId)) {
      const nextStats = modelRouting.recordOutcome(settings.personaModelStats, {
        personaId: text(result.personaId),
        optionId: ranOn.optionId,
        outcome: text(result.outcome, 'completed'),
        failureSignature: loop.failureSignature(text(result.personaId), result.failureMessage || result.summary),
        at: nowIso(),
      });
      await agentPlatformSettings.writeAgentPlatformSettings(dataDir, { personaModelStats: nextStats }, actorUserId);
    }

    if (!shouldAdvance || options.advance === false) return { advanced: false };
    return { advanced: true, ...(await advanceOnce(projectId, actorUserId)) };
  }

  /**
   * The persona a work item belongs to, or null when the item is not part of a chain.
   */
  function personaIdForWorkItem(project, workItemId) {
    const execucao = loop.activeExecucao(project);
    if (execucao?.currentWorkItemId === text(workItemId)) return execucao.currentPersonaId;
    return '';
  }

  return { advanceOnce, recordAndAdvance, personaIdForWorkItem };
}

module.exports = { createDriver, createPersonaWorkItem };
