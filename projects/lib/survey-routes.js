/**
 * Surveying a repository that already holds a working app.
 *
 * Running the survey is a read: it walks the linked repository and stores what it
 * found on the project. It changes nothing in the repository and derives no
 * requirements by itself — that is the Product Owner's job, and this is its evidence.
 */
const gitSettings = require('./git-provider-settings');
const gitRepositories = require('./git-repositories');
const repoSurvey = require('./repo-survey');
const { createGitProviderClient } = require('./git-provider-client');

function registerSurveyRoutes(app, deps) {
  const { authMiddleware, requireRole, loadProjectForUser, updateStore, appendActivity, dataDir } = deps;

  async function clientFromSettings() {
    const settings = await gitSettings.readGitProviderSettings(dataDir);
    const token = await gitSettings.resolveGitToken(dataDir);
    return createGitProviderClient({
      provider: settings.provider,
      apiBaseUrl: settings.apiBaseUrl,
      token,
    });
  }

  app.get('/api/projects/:projectId/survey', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    const repository = gitRepositories.normalizeProjectRepository(project.repository);
    return res.json({
      survey: project.repositorySurvey || null,
      repository,
      // Without a repository there is nothing to survey, and the UI needs to say why.
      canSurvey: Boolean(repository),
    });
  });

  app.post('/api/projects/:projectId/survey', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) {
        return res.status(409).json({
          message: 'Este projecto nao tem repositorio ligado. Ligue um em Definicoes do projecto.',
        });
      }

      const client = await clientFromSettings();
      const survey = await repoSurvey.surveyRepository(client, repository, { ref: req.body?.ref || '' });

      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        // Replaced rather than accumulated: a survey describes the repository as it is
        // now, and two of them side by side would just be ambiguous.
        target.repositorySurvey = survey;
        target.updatedAt = new Date().toISOString();
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'repository_surveyed',
          details: {
            fullName: repository.fullName,
            files: survey.fileCount,
            routes: survey.routes.length,
            modules: survey.modules.length,
          },
        });
      });

      return res.json({ survey, markdown: repoSurvey.surveyToMarkdown(survey) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerSurveyRoutes };
