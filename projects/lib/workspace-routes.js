/**
 * The project's documented artifacts, as its repository holds them.
 *
 *   GET  /workspace                      the last snapshot, and whether a repository exists
 *   POST /workspace/sync                 read yourlab/ and openspec/specs/ again, now
 *   POST /workspace/initialize           open a change request with GUIDE.md and a starting
 *                                        folder written from what the platform already knows
 *   GET  /workspace/mockup-link          a short-lived link to one mockup screen
 *   GET  /workspace/mockup/:ticket/:file the screen itself, sandboxed
 *
 * Reading is deterministic and changes nothing. Writing only ever opens a change request;
 * the default branch is never touched.
 */
const crypto = require('crypto');
const gitSettings = require('./git-provider-settings');
const gitRepositories = require('./git-repositories');
const { createGitProviderClient } = require('./git-provider-client');
const openspecRepository = require('./openspec-repository');
const secretBox = require('./secret-box');
const workspaceFormat = require('./workspace-format');
const workspaceSync = require('./workspace-sync');
const { RENDER_HEADERS } = require('./mockup-routes');

// Long enough to click through a mockup's screens; a new link is one click away.
const MOCKUP_TICKET_TTL_MS = 30 * 60 * 1000;
const SCREEN_NAME = /^[a-z0-9-]+\.html$/;

function ticketPayload(projectId, expiresAt) {
  return `workspace-mockup:${projectId}:${expiresAt}`;
}

function signMockupTicket(dataDir, projectId, now = Date.now()) {
  const expiresAt = now + MOCKUP_TICKET_TTL_MS;
  const signature = crypto.createHmac('sha256', secretBox.signingKey(dataDir))
    .update(ticketPayload(projectId, expiresAt))
    .digest('base64url');
  return `${expiresAt}.${signature}`;
}

function mockupTicketValid(dataDir, projectId, ticket, now = Date.now()) {
  const [rawExpiry, signature] = String(ticket || '').split('.');
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !signature) return false;
  const expected = crypto.createHmac('sha256', secretBox.signingKey(dataDir))
    .update(ticketPayload(projectId, expiresAt))
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** What a client may see: the content, not the platform's notes about malformed files. */
function forViewer(workspace, user) {
  if (!workspace) return null;
  if (user?.role !== 'client') return workspace;
  return { ...workspace, snapshot: { ...workspace.snapshot, findings: [] } };
}

function registerWorkspaceRoutes(app, deps) {
  const { authMiddleware, requireRole, loadProjectForUser, updateStore, appendActivity, dataDir, loadProject } = deps;

  async function remoteClient() {
    const settings = await gitSettings.readGitProviderSettings(dataDir);
    const token = await gitSettings.resolveGitToken(dataDir);
    return createGitProviderClient({ provider: settings.provider, apiBaseUrl: settings.apiBaseUrl, token });
  }

  const noRepository = (res) => res.status(409).json({
    message: 'Este projecto não tem repositório ligado. Ligue um em Definições do projecto.',
  });

  app.get('/api/projects/:projectId/workspace', authMiddleware, loadProjectForUser, async (req, res) => {
    const project = req.loadedProject;
    return res.json({
      workspace: forViewer(project.workspace || null, req.auth.user),
      hasRepository: Boolean(gitRepositories.normalizeProjectRepository(project.repository)),
      guidePath: workspaceFormat.GUIDE_PATH,
    });
  });

  app.post('/api/projects/:projectId/workspace/sync', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      const { snapshot, source, ref } = await workspaceSync.syncWorkspace(repository, { remoteClient, ref: req.body?.ref || '' });
      const workspace = {
        snapshot,
        source,
        ref,
        syncedAt: new Date().toISOString(),
        syncedBy: req.auth.user.id,
      };
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projecto não encontrado.');
        const changed = target.workspace?.snapshot?.contentHash !== snapshot.contentHash;
        // Replaced whole: a snapshot describes the repository as it is now.
        target.workspace = workspace;
        if (changed) {
          target.updatedAt = workspace.syncedAt;
          appendActivity(store, {
            projectId: target.id,
            actorUserId: req.auth.user.id,
            action: 'workspace_synced',
            details: { files: snapshot.files.length, findings: snapshot.findings.length, contentHash: snapshot.contentHash, source },
          });
        }
      });
      return res.json({ workspace: forViewer(workspace, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/workspace/initialize', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = gitRepositories.normalizeProjectRepository(project.repository);
      if (!repository) return noRepository(res);
      const client = await remoteClient();
      const reader = workspaceSync.createRemoteReader(client, repository);
      const existing = new Set(await reader.listTree(`${workspaceFormat.ROOT}/`));
      const files = workspaceFormat.skeletonFiles(project, { existing });
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const result = await openspecRepository.commitFilesForReview(client, repository, {
        files,
        branch: `yourlab/pasta-${stamp}`,
        title: 'yourlab/: o projecto documentado no repositório',
        body: 'Cria o GUIDE.md e a pasta yourlab/ a partir do que a plataforma já sabia deste projecto. A partir daqui, é aqui que se escreve.',
        commitMessage: 'yourlab: guia e pasta inicial',
      });
      await updateStore(async (store) => {
        appendActivity(store, {
          projectId: project.id,
          actorUserId: req.auth.user.id,
          action: 'workspace_initialized',
          details: { files: result.files, branch: result.branch },
        });
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/workspace/mockup-link', authMiddleware, loadProjectForUser, async (req, res) => {
    const screen = String(req.query?.screen || 'index.html');
    if (!SCREEN_NAME.test(screen)) return res.status(400).json({ message: 'Nome de ecrã inválido.' });
    const ticket = signMockupTicket(dataDir, req.params.projectId);
    return res.json({
      url: `/api/projects/${encodeURIComponent(req.params.projectId)}/workspace/mockup/${ticket}/${screen}`,
      expiresInMs: MOCKUP_TICKET_TTL_MS,
    });
  });

  // No session here: an <iframe src> cannot carry one. The ticket in the path grants
  // viewing this project's mockup folder for a while, and nothing else. Being in the
  // path, it survives the relative links between screens.
  app.get('/api/projects/:projectId/workspace/mockup/:ticket/:file', async (req, res) => {
    res.set(RENDER_HEADERS);
    const { projectId, ticket, file } = req.params;
    if (!mockupTicketValid(dataDir, projectId, ticket) || !SCREEN_NAME.test(file)) {
      return res.status(403).send('<!doctype html><meta charset="utf-8"><p>Esta ligação expirou. Volte a abrir o mockup.</p>');
    }
    try {
      const project = await loadProject(projectId);
      const repository = gitRepositories.normalizeProjectRepository(project?.repository);
      if (!repository) return res.status(404).send('<!doctype html><meta charset="utf-8"><p>Sem repositório ligado.</p>');
      const reader = await workspaceSync.pickReader(repository, { remoteClient });
      const html = await reader.readFile(`${workspaceFormat.ROOT}/mockup/${file}`);
      if (!html) return res.status(404).send(`<!doctype html><meta charset="utf-8"><p>O ecrã ${file} não existe em yourlab/mockup/.</p>`);
      return res.send(html);
    } catch (error) {
      return res.status(500).send('<!doctype html><meta charset="utf-8"><p>Não foi possível ler o mockup do repositório.</p>');
    }
  });
}

module.exports = { registerWorkspaceRoutes, signMockupTicket, mockupTicketValid, MOCKUP_TICKET_TTL_MS };
