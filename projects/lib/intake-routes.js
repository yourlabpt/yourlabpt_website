/**
 * The questions that define a project, and their answers.
 *
 * Reading is open to anyone who can see the project; answering is an edit. The
 * questions themselves are static policy, so they are served alongside the answers —
 * the UI never has to know the catalogue, and a new question appears without a deploy
 * of the front end.
 */
const buildPolicies = require('./build-policies');

function registerIntakeRoutes(app, deps) {
  const { authMiddleware, loadProjectForUser, requireProjectEditor, updateStore, appendActivity } = deps;

  app.get('/api/projects/:projectId/intake', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    const productType = buildPolicies.normalizeProductType(project.productType);
    const intake = buildPolicies.intakeFor(productType);
    const answers = project.intake?.answers || [];
    return res.json({
      productType,
      groupOrder: intake.GROUP_ORDER,
      questions: intake.QUESTIONS,
      answers,
      // What still blocks an Execução, named so the UI can point at it.
      missingRequired: buildPolicies.unansweredRequired(productType, answers),
    });
  });

  app.patch('/api/projects/:projectId/intake', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const productType = buildPolicies.normalizeProductType(req.loadedProject.productType);
      const intake = buildPolicies.intakeFor(productType);
      const incoming = Array.isArray(req.body?.answers) ? req.body.answers : [];

      const unknown = incoming
        .map((entry) => String(entry?.questionId || ''))
        .filter((id) => id && !intake.questionById(id));
      if (unknown.length) {
        return res.status(400).json({ message: `Perguntas desconhecidas: ${unknown.join(', ')}` });
      }

      const now = new Date().toISOString();
      let answers = [];
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');

        // Merge rather than replace: answering one question must never wipe the rest.
        const byId = new Map((target.intake?.answers || []).map((entry) => [entry.questionId, entry]));
        for (const entry of incoming) {
          const questionId = String(entry.questionId);
          byId.set(questionId, {
            questionId,
            answer: String(entry.answer ?? '').trim(),
            answeredAt: now,
            answeredBy: req.auth?.user?.id || '',
            source: entry.source === 'agent_followup' ? 'agent_followup' : 'human',
          });
        }
        answers = [...byId.values()];
        target.intake = { answers, updatedAt: now };
        target.productType = productType;
        target.updatedAt = now;
        appendActivity(store, {
          projectId: target.id,
          actorUserId: req.auth.user.id,
          action: 'intake_answered',
          details: { answered: incoming.length, total: answers.length },
        });
      });

      return res.json({
        answers,
        missingRequired: buildPolicies.unansweredRequired(productType, answers),
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerIntakeRoutes };
