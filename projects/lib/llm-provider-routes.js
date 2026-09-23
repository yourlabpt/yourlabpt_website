/**
 * LLM provider credentials — super-admin only, same reasoning as `lib/git-routes.js`:
 * these carry a credential that can spend money, so they are not project-scoped.
 */
const llmProviderSettings = require('./llm-provider-settings');

function registerLlmProviderRoutes(app, deps) {
  const { authMiddleware, requireRole, dataDir } = deps;

  app.get('/api/projects/llm-provider/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const settings = await llmProviderSettings.readLlmProviderSettings(dataDir);
      return res.json({ settings: llmProviderSettings.publicSettings(settings, dataDir) });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/projects/llm-provider/settings/:providerId', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const body = req.body || {};
      const patch = {};
      if (body.apiBaseUrl !== undefined) patch.apiBaseUrl = body.apiBaseUrl;
      if (body.model !== undefined) patch.model = body.model;
      // Only touch the credential when the caller actually sent the field, so saving
      // the base URL alone never clears a stored key.
      if (body.apiKey !== undefined) patch.apiKey = body.apiKey;
      const settings = await llmProviderSettings.writeProviderSettings(
        dataDir, req.params.providerId, patch, req.auth?.user?.id || ''
      );
      return res.json({ settings: llmProviderSettings.publicSettings(settings, dataDir) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/llm-provider/settings/:providerId/verify', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const result = await llmProviderSettings.verifyProvider(dataDir, req.params.providerId);
      return res.json({
        ok: true,
        modelCount: result.modelCount,
        sampleModel: result.sampleModel,
        settings: llmProviderSettings.publicSettings(result.settings, dataDir),
      });
    } catch (error) {
      // The credential/connection failure is expected and useful; still 400 so the
      // UI treats it as "test failed", not a platform bug.
      return res.status(400).json({
        message: error.message,
        settings: error.settings ? llmProviderSettings.publicSettings(error.settings, dataDir) : undefined,
      });
    }
  });

  app.post('/api/projects/llm-provider/settings/:providerId/disconnect', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const settings = await llmProviderSettings.writeProviderSettings(
        dataDir, req.params.providerId, { apiKey: '' }, req.auth?.user?.id || ''
      );
      return res.json({ settings: llmProviderSettings.publicSettings(settings, dataDir) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { registerLlmProviderRoutes };
