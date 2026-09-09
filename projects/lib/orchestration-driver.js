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
const workItems = require('./work-items');

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function createPersonaWorkItem(project, persona, actorUserId, reconcile = null) {
  let item = workItems.normalizeWorkItem({
    id: `task_${crypto.randomUUID()}`,
    title: reconcile && reconcile.direction !== 'produces'
      ? `${persona.label} — reconciliar ${reconcile.artifact}`
      : `${persona.label} — ${text(project.name, 'projecto')}`,
    status: 'ready',
    origin: 'orchestration',
    executorMode: 'agent',
    agentType: persona.taskTypes[0],
    agentId: text(persona.agentId),
    deliveryStageId: persona.deliveryStages[0],
    descriptionMarkdown: reconcile ? reconcile.rule : persona.summary,
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
      loop.markDispatched(project, decision.persona, item);
      project.updatedAt = nowIso();
      dispatch = {
        personaId: decision.persona.id,
        workItemId: item.id,
        agentType: decision.persona.taskTypes[0],
        agentId: text(decision.persona.agentId),
        deliveryStageId: item.deliveryStageId,
      };
      appendActivity(store, {
        actorUserId, projectId, action: 'orchestration_dispatch',
        details: { personaId: decision.persona.id, workItemId: item.id },
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

    await updateStore(async (store) => {
      const project = store.projects.find((entry) => entry.id === projectId);
      if (!project) return;
      const execucao = loop.activeExecucao(project);
      // Only a chain-driven Execução advances itself; a hand-started run must not.
      if (!execucao || !['running', 'waiting_human'].includes(execucao.status)) return;

      loop.recordResult(project, { ...result, personaOverrides: settings.personas || {} });
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
