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
 * Agents write code, and code has to land somewhere. Without a repository there is
 * nowhere to write, so the project is incomplete and cannot execute.
 */
function repositoryGap(project) {
  return gitRepositories.normalizeProjectRepository(project?.repository)
    ? ''
    : 'Este projecto ainda nao tem repositorio. Ligue um em Definicoes do projecto antes de executar.';
}

/** What the partner/admin UI needs to show the chain's state in one call. */
function publicState(project, decision, now = Date.now()) {
  const execucao = loop.activeExecucao(project);
  const rollup = loop.projectSpendRollup(project, now);
  return {
    execucao: execucao ? {
      id: execucao.id,
      goal: execucao.goal,
      changeId: execucao.changeId,
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
    next: decision ? {
      action: decision.action,
      personaId: decision.persona?.id || decision.personaId || '',
      personaLabel: decision.persona?.label || '',
      reason: decision.reason || decision.budget?.reason || '',
      remainingUnits: decision.remainingUnits || 0,
    } : null,
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

  async function personaOverrides() {
    const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
    return settings.personas || {};
  }

  app.get('/api/projects/:projectId/orchestration', authMiddleware, loadProjectForUser, requirePartnerOrAdmin, async (req, res) => {
    try {
      const project = req.loadedProject;
      const decision = loop.decideNext(project, { personaOverrides: await personaOverrides() });
      return res.json(publicState(project, decision));
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
      const overrides = await personaOverrides();
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const accepted = req.body?.accepted !== false;
        const question = loop.activeExecucao(project)?.question;
        loop.answerQuestion(project, { accepted });
        project.updatedAt = nowIso();
        payload = publicState(project, loop.decideNext(project, { personaOverrides: overrides }));
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
