/**
 * Epics (Camada 2) and the Features under them (Camada 3).
 *
 * A Feature is not a new record — it is a coordination work item carrying an `epicId`,
 * which is what keeps the work-item tree two levels deep. So there is no feature store
 * here, only the two ends: the epic, and the view of its features.
 */
const epics = require('./epics');
const workItems = require('./work-items');
const mockupSessions = require('./mockup-sessions');
const camadas = require('./camadas');

/**
 * A Feature with the state a person needs to decide whether it is ready to run: how many
 * tasks it holds, and how many of those are the wrong size.
 */
function featureView(project, item) {
  const children = workItems.getWorkItems(project).filter((entry) => entry.parentTaskId === item.id);
  const oversized = children
    .map((child) => ({ id: child.id, title: child.title, findings: camadas.cutTestFindings(child) }))
    .filter((entry) => entry.findings.length);
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    epicId: item.epicId,
    camada: camadas.camadaOfWorkItem(item),
    taskCount: children.length,
    completedTaskCount: children.filter((child) => workItems.isTerminalStatus(child.status)).length,
    // Named rather than counted alone: "3 tasks need attention" is a number, "this one
    // has two acceptance criteria" is something you can act on.
    oversizedTasks: oversized,
  };
}

function epicView(project, epic, approvedSessionIds) {
  const features = workItems.getWorkItems(project)
    .filter((item) => item.taskRole === 'coordination' && item.epicId === epic.id)
    .map((item) => featureView(project, item));
  return {
    ...epic,
    camada: 2,
    features,
    featureCount: features.length,
    taskCount: features.reduce((total, feature) => total + feature.taskCount, 0),
    // Empty when this epic may be specified; a sentence naming what is missing when not.
    specGap: epics.specGap(project, epic, approvedSessionIds),
  };
}

function approvedSessions(project) {
  return new Set(mockupSessions.listSessions(project)
    .filter((session) => session.status === 'approved')
    .map((session) => session.id));
}

function registerEpicRoutes(app, deps) {
  const { authMiddleware, loadProjectForUser, requireProjectEditor, updateStore, appendActivity, nowIso } = deps;

  app.get('/api/projects/:projectId/epics', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    const approved = approvedSessions(project);
    return res.json({
      layers: camadas.LAYERS,
      // Camada 1 sits on the project, not in a list — it is the one layer there is only
      // ever one of. The long-run statement is `vision.mainIdeaMarkdown`, which the
      // platform already owns and normalizes: Camada 1 reads and writes *that* rather
      // than inventing a second field meaning the same thing.
      vision: {
        vision: project.vision?.mainIdeaMarkdown || '',
        constitution: project.constitution || '',
      },
      epics: epics.listEpics(project).map((epic) => epicView(project, epic, approved)),
      // Features with no epic yet: real work that predates the layers, not an error.
      unassignedFeatures: workItems.getWorkItems(project)
        .filter((item) => item.taskRole === 'coordination' && !item.epicId)
        .map((item) => featureView(project, item)),
    });
  });

  app.patch('/api/projects/:projectId/vision', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      let payload = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        if (req.body?.vision !== undefined) {
          // Merge, never replace. `project.vision` is a structured record the rest of
          // the platform reads and writes (headline, problem, target users, principles);
          // assigning a bare string here would drop all of it, and the next normalize
          // would quietly turn that string back into an empty object.
          project.vision = {
            ...(project.vision && typeof project.vision === 'object' ? project.vision : {}),
            mainIdeaMarkdown: String(req.body.vision || ''),
          };
        }
        if (req.body?.constitution !== undefined) project.constitution = String(req.body.constitution || '');
        project.updatedAt = nowIso();
        payload = {
          vision: project.vision?.mainIdeaMarkdown || '',
          constitution: project.constitution || '',
        };
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'vision_updated',
          details: { fields: Object.keys(req.body || {}) },
        });
      });
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/epics', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      let view = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const epic = epics.createEpic(project, {
          title: req.body?.title,
          summary: req.body?.summary,
          mockupSessionId: req.body?.mockupSessionId,
          actorUserId: req.auth?.user?.id,
        }, nowIso());
        project.updatedAt = nowIso();
        view = epicView(project, epic, approvedSessions(project));
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'epic_created',
          details: { epicId: epic.id, title: epic.title },
        });
      });
      return res.json({ epic: view });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/projects/:projectId/epics/:epicId', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      let view = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const epic = epics.updateEpic(project, req.params.epicId, req.body || {}, nowIso());
        project.updatedAt = nowIso();
        view = epicView(project, epic, approvedSessions(project));
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'epic_updated',
          details: { epicId: epic.id, fields: Object.keys(req.body || {}) },
        });
      });
      return res.json({ epic: view });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /**
   * Attaches an existing Feature to an Epic.
   *
   * A Feature is a coordination work item, so this is a field on a task rather than a
   * move between stores — which is exactly why Feature was not made its own record.
   */
  app.post('/api/projects/:projectId/epics/:epicId/features', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      let view = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const epic = epics.findEpic(project, req.params.epicId);
        if (!epic) throw new Error('Epic não encontrada.');
        const featureId = String(req.body?.featureId || '');
        const item = workItems.findWorkItem(project, featureId);
        if (!item) throw new Error('Feature não encontrada.');
        if (item.taskRole !== 'coordination') {
          throw new Error('Só um item de coordenação é uma feature. Uma tarefa pertence a uma feature, não a uma epic.');
        }
        workItems.setWorkItems(project, workItems.getWorkItems(project).map((entry) => (
          entry.id === item.id ? { ...entry, epicId: epic.id } : entry
        )));
        project.updatedAt = nowIso();
        view = epicView(project, epic, approvedSessions(project));
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'epic_feature_attached',
          details: { epicId: epic.id, featureId },
        });
      });
      return res.json({ epic: view });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerEpicRoutes, epicView, featureView };
