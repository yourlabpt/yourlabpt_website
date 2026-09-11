/**
 * Driving the persona chain: start an Execução, see where it is, answer its question,
 * raise the cap, stop it.
 *
 * Partner/admin only — a client's view of progress is the existing client-portal
 * (stage dots + plain-language summaries), not this. Nothing here (cost, persona
 * identity, history) is ever client-visible.
 */
const loop = require('./orchestration-loop');
const gitRepositories = require('./git-repositories');
const buildPolicies = require('./build-policies');
const projectBudget = require('./project-budget');
const agentPlatformSettings = require('./agent-platform-settings');
const { canEditProject, isClientViewer } = require('./project-access');

function requirePartnerOrAdmin(req, res, next) {
  if (isClientViewer(req.auth?.user, req.loadedProject)) {
    return res.status(403).json({ message: 'Sem permissao.' });
  }
  if (!canEditProject(req.auth?.user, req.loadedProject)) {
    return res.status(403).json({ message: 'Sem permissao para alterar este projecto.' });
  }
  return next();
}

/**
 * Everything standing between this project and its first Execução.
 *
 * There are deliberately only two: nowhere to write the code, and questions that define
 * the project still unanswered. Everything else the policy has to say is guidance
 * recorded on a task, never a refusal — this is a platform for building new things, and
 * a wall of preconditions would defeat that.
 */
function readinessGaps(project) {
  const gaps = [];

  if (!gitRepositories.normalizeProjectRepository(project?.repository)) {
    gaps.push({
      reason: 'repository',
      message: 'Este projecto ainda nao tem repositorio. Ligue um em Definicoes do projecto antes de executar.',
    });
  }

  const missing = buildPolicies.unansweredRequired(
    project?.productType,
    project?.intake?.answers || [],
  );
  if (missing.length) {
    gaps.push({
      reason: 'intake',
      message: `Faltam ${missing.length} resposta(s) que definem o projecto. Sem elas os agentes trabalham sobre suposicoes.`,
      questions: missing,
    });
  }

  return gaps;
}

/** First blocking sentence, or empty. Kept for callers that want one line. */
function repositoryGap(project) {
  return readinessGaps(project)[0]?.message || '';
}

/**
 * What is about to happen, shown before it happens.
 *
 * Launching an agent is a real action with a real cost, so it is never a blind click:
 * who runs, on which engine, why that engine, what it is allowed to touch. Null when
 * the next move is not a dispatch — there is then nothing to confirm.
 */
function launchPreview(project, decision, platformSettings) {
  if (!decision || decision.action !== 'dispatch' || !decision.persona) return null;
  const persona = decision.persona;
  const stageId = decision.workItem?.deliveryStageId || persona.deliveryStages?.[0] || '';
  const routed = agentPlatformSettings.routeForPersona(platformSettings, {
    personaId: persona.id,
    camada: buildPolicies.camadaForStage(project?.productType, stageId),
  });
  return {
    personaId: persona.id,
    personaLabel: persona.label,
    // What it may write, and where. The two questions a person actually asks before
    // letting an agent near a repository.
    writeScope: persona.writeScope,
    allowedTools: persona.allowedTools || [],
    stageId,
    camada: buildPolicies.camadaForStage(project?.productType, stageId),
    model: routed.option ? {
      optionId: routed.option.id,
      label: routed.option.label,
      provider: routed.option.provider,
      model: routed.option.model,
      profileId: routed.profileId,
    } : null,
    // The sentence that answers "why this model", rather than leaving it to be inferred.
    why: routed.reason,
    warnings: routed.warnings,
  };
}

/** What the partner/admin UI needs to show the chain's state in one call. */
function publicState(project, decision, now = Date.now(), platformSettings = null) {
  const execucao = loop.activeExecucao(project);
  const rollup = loop.projectSpendRollup(project, now);
  return {
    execucao: execucao ? {
      id: execucao.id,
      goal: execucao.goal,
      changeId: execucao.changeId,
      kind: execucao.kind,
      targetArtifact: execucao.targetArtifact,
      status: execucao.status,
      currentPersonaId: execucao.currentPersonaId,
      question: execucao.question,
      haltReason: execucao.haltReason,
      startedAt: execucao.startedAt,
      history: execucao.history,
      budget: projectBudget.budgetState(execucao.budget, now),
    } : null,
    past: loop.normalizeExecucoes(project)
      .filter((entry) => entry.id !== execucao?.id)
      .map((entry) => ({ id: entry.id, goal: entry.goal, status: entry.status, startedAt: entry.startedAt })),
    rollup,
    // Empty when the project is ready to execute; a sentence to show when it is not.
    blockedReason: repositoryGap(project),
    // The same thing itemised, so the UI can link straight to what is missing.
    readiness: readinessGaps(project),
    next: decision ? {
      action: decision.action,
      personaId: decision.persona?.id || decision.personaId || '',
      personaLabel: decision.persona?.label || '',
      reason: decision.reason || decision.budget?.reason || '',
      // A rerun is worth explaining: it happened because something it reads moved,
      // which is usually an edit the person themselves just made.
      rerunBecauseInputsChanged: decision.reason === 'inputs-changed',
      remainingUnits: decision.remainingUnits || 0,
    } : null,
    launch: launchPreview(project, decision, platformSettings),
  };
}

function registerOrchestrationRoutes(app, deps) {
  const {
    authMiddleware,
    loadProjectForUser,
    updateStore,
    appendActivity,
    nowIso,
    dataDir,
    driver,
  } = deps;

  app.get('/api/projects/:projectId/orchestration', authMiddleware, loadProjectForUser, requirePartnerOrAdmin, async (req, res) => {
    try {
      const project = req.loadedProject;
      const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
      const decision = loop.decideNext(project, { personaOverrides: settings.personas || {} });
      return res.json(publicState(project, decision, Date.now(), settings));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Starts a new Execução, or raises the cap on one paused for budget / halted.
  // Dispatches immediately so starting actually starts work.
  app.post('/api/projects/:projectId/orchestration/start', authMiddleware, loadProjectForUser, requirePartnerOrAdmin, async (req, res) => {
    try {
      const input = {
        goal: req.body?.goal,
        changeId: req.body?.changeId,
        kind: req.body?.kind,
        targetArtifact: req.body?.targetArtifact,
        maxCostUsd: req.body?.maxCostUsd,
        maxHours: req.body?.maxHours,
      };
      if (!input.goal || !String(input.goal).trim()) {
        return res.status(400).json({ message: 'Descreva o objectivo desta execucao.' });
      }
      const gap = repositoryGap(req.loadedProject);
      if (gap) return res.status(409).json({ message: gap });
      let state = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const execucao = loop.startExecucao(project, input);
        project.updatedAt = nowIso();
        state = publicState(project, null);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'orchestration_started',
          details: { execucaoId: execucao.id, goal: execucao.goal, maxCostUsd: execucao.budget.maxCostUsd, maxHours: execucao.budget.maxHours },
        });
      });
      if (driver) await driver.advanceOnce(req.params.projectId, req.auth.user.id);
      return res.json(state);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/orchestration/answer', authMiddleware, loadProjectForUser, requirePartnerOrAdmin, async (req, res) => {
    try {
      const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
      const overrides = settings.personas || {};
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const accepted = req.body?.accepted !== false;
        const question = loop.activeExecucao(project)?.question;
        loop.answerQuestion(project, { accepted });
        project.updatedAt = nowIso();
        payload = publicState(project, loop.decideNext(project, { personaOverrides: overrides }), Date.now(), settings);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: accepted ? 'orchestration_question_accepted' : 'orchestration_question_rejected',
          details: { personaId: question?.personaId, kind: question?.kind },
        });
      });
      // Answering is what unblocks the chain — carry on from here unattended.
      if (driver) await driver.advanceOnce(req.params.projectId, req.auth.user.id);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/orchestration/stop', authMiddleware, loadProjectForUser, requirePartnerOrAdmin, async (req, res) => {
    try {
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        loop.stopChain(project, 'abandoned');
        project.updatedAt = nowIso();
        payload = publicState(project, null);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'orchestration_stopped',
          details: { spentUsd: loop.projectSpendRollup(project).totalSpentUsd },
        });
      });
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerOrchestrationRoutes, publicState };
