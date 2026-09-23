/**
 * The project's documented artifacts, as its repository holds them.
 *
 *   GET  /workspace                      the last snapshot, and whether a repository exists
 *   POST /workspace/sync                 read yourlab/ and openspec/specs/ again, now
 *   GET  /workspace/file?path=           one artefact's text, and the sha it was read at
 *   PUT  /workspace/file                 save it back: working copy, or a change request
 *   POST /workspace/initialize           open a change request with GUIDE.md and a starting
 *                                        folder written from what the platform already knows
 *   GET  /workspace/mockup-link          a short-lived link to one mockup screen
 *   GET  /workspace/mockup/:ticket/:file the screen itself, sandboxed
 *
 * Reading is deterministic and changes nothing. Writing touches only the project's own
 * working copy; without one it opens a change request. The default branch is never
 * written to directly.
 */
const crypto = require('crypto');
const gitSettings = require('./git-provider-settings');
const gitRepositories = require('./git-repositories');
const { createGitProviderClient } = require('./git-provider-client');
const openspecRepository = require('./openspec-repository');
const secretBox = require('./secret-box');
const workspaceFormat = require('./workspace-format');
const workspaceSync = require('./workspace-sync');
const workItems = require('./work-items');
const promptPacks = require('./prompt-packs');
const { promptDiff } = require('./work-snapshot');
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
  const { authMiddleware, requireRole, loadProjectForUser, updateStore, appendActivity, dataDir, loadProject, runPack } = deps;

  async function remoteClient() {
    const settings = await gitSettings.readGitProviderSettings(dataDir);
    const token = await gitSettings.resolveGitToken(dataDir);
    return createGitProviderClient({ provider: settings.provider, apiBaseUrl: settings.apiBaseUrl, token });
  }

  /** Reads the repository again and keeps the snapshot on the project. */
  async function readAndStore(projectId, repository, actorUserId, activity) {
    const { snapshot, source, ref } = await workspaceSync.syncWorkspace(repository, { remoteClient });
    const workspace = { snapshot, source, ref, syncedAt: new Date().toISOString(), syncedBy: actorUserId };
    await updateStore(async (store) => {
      const target = store.projects.find((entry) => entry.id === projectId);
      if (!target) throw new Error('Projecto não encontrado.');
      const changed = target.workspace?.snapshot?.contentHash !== snapshot.contentHash;
      target.workspace = workspace;
      if (changed) {
        target.updatedAt = workspace.syncedAt;
        if (activity) appendActivity(store, { projectId, actorUserId, ...activity(snapshot, source) });
      }
    });
    return workspace;
  }

  // What one area of code looks like to a pack: a few source files, each cut short.
  // ponytail: first N files by name; pick by size or recency if areas get large.
  const SOURCE_FILE = /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|php|go|java|kt|cs|sql|prisma|vue|svelte)$/i;
  async function readArea(repository, area) {
    const reader = await workspaceSync.pickReader(repository, { remoteClient });
    const paths = (await reader.listTree(`${area}/`)).filter((filePath) => SOURCE_FILE.test(filePath)).sort().slice(0, 6);
    const files = [];
    for (const filePath of paths) files.push({ path: filePath, content: (await reader.readFile(filePath)).slice(0, 2000) });
    return files.filter((file) => file.content.trim());
  }

  /**
   * The tests named, read from the repository, and the code they import. The scope a
   * code pack may write in is derived here, on the server, from the tests themselves.
   */
  async function loadTestsAndCode(repository, testPaths) {
    const reader = await workspaceSync.pickReader(repository, { remoteClient });
    const testFiles = [];
    for (const raw of testPaths.slice(0, 3)) {
      const filePath = promptPacks.testPath(raw);
      const content = filePath ? await reader.readFile(filePath) : '';
      if (content) testFiles.push({ path: filePath, content: content.slice(0, 6000) });
    }
    const targets = [...new Set(testFiles.flatMap((file) => promptPacks.importTargets(file.path, file.content)))].slice(0, 4);
    const codeFiles = [];
    for (const target of targets) codeFiles.push({ path: target, content: (await reader.readFile(target)).slice(0, 6000) });
    return { reader, testFiles, codeFiles, scope: promptPacks.codeScopeFor(targets) };
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
      surveyModules: (project.repositorySurvey?.modules || []).map((entry) => entry.name),
    });
  });

  app.post('/api/projects/:projectId/workspace/sync', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      // Replaced whole: a snapshot describes the repository as it is now.
      const workspace = await readAndStore(req.params.projectId, repository, req.auth.user.id, (snapshot, source) => ({
        action: 'workspace_synced',
        details: { files: snapshot.files.length, findings: snapshot.findings.length, contentHash: snapshot.contentHash, source },
      }));
      return res.json({ workspace: forViewer(workspace, req.auth.user) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/projects/:projectId/workspace/file', authMiddleware, loadProjectForUser, async (req, res) => {
    try {
      const filePath = String(req.query?.path || '');
      if (!workspaceFormat.isWritablePath(filePath)) return res.status(400).json({ message: 'Ficheiro fora do formato yourlab/. Ver GUIDE.md.' });
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      const reader = await workspaceSync.pickReader(repository, { remoteClient });
      const content = await reader.readFile(filePath);
      return res.json({ path: filePath, content, sha: workspaceFormat.fileSha(content) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /**
   * Saving one artefact. Writes into the working copy when the project has one — the
   * edit is on disk immediately — and opens a change request when it does not.
   * `previousSha` is what the editor had when it opened the file: a mismatch means
   * somebody (or an agent) wrote to it meanwhile, and the save is refused rather than
   * silently overwriting them.
   */
  app.put('/api/projects/:projectId/workspace/file', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const filePath = String(req.body?.path || '');
      const content = String(req.body?.content ?? '');
      if (!workspaceFormat.isWritablePath(filePath)) {
        return res.status(400).json({ message: 'Ficheiro fora do formato yourlab/. Ver GUIDE.md.' });
      }
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);

      const reader = await workspaceSync.pickReader(repository, { remoteClient });
      const before = await reader.readFile(filePath);
      const previousSha = String(req.body?.previousSha || '');
      if (previousSha && previousSha !== workspaceFormat.fileSha(before)) {
        return res.status(409).json({ message: 'O ficheiro mudou no repositório desde que o abriu. Actualize e volte a aplicar as suas alterações.' });
      }

      let changeRequest = null;
      if (typeof reader.writeFile === 'function') {
        await reader.writeFile(filePath, content);
      } else {
        const client = await remoteClient();
        const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const result = await openspecRepository.commitFilesForReview(client, repository, {
          files: [{ path: filePath, content }],
          branch: `yourlab/edicao-${stamp}`,
          title: `yourlab: ${filePath}`,
          body: 'Editado na plataforma.',
          commitMessage: `yourlab: ${filePath}`,
        });
        changeRequest = result.changeRequest;
      }

      const workspace = await readAndStore(req.params.projectId, repository, req.auth.user.id, () => ({
        action: 'workspace_file_saved',
        details: { path: filePath, source: reader.kind },
      }));

      // A saved edit leaves exactly one task behind: the diff, and what it puts in doubt.
      // It waits for a person — nothing is applied to code or other artefacts on its own.
      // ponytail: reusing waiting_review so Hoje shows it as-is; give it its own tone if Hoje gets noisy.
      let task = null;
      const draft = workspaceFormat.taskFromEdit({ filePath, before, after: content, snapshot: workspace.snapshot });
      if (draft) {
        const now = new Date().toISOString();
        await updateStore(async (store) => {
          const project = store.projects.find((entry) => entry.id === req.params.projectId);
          if (!project) throw new Error('Projecto não encontrado.');
          const record = workItems.normalizeWorkItem({
            id: `witem_${crypto.randomUUID()}`,
            title: draft.title,
            descriptionMarkdown: draft.descriptionMarkdown,
            complexity: 'medium',
            status: 'waiting_review',
            origin: 'platform',
            executorMode: 'both',
            deliveryStageId: 'unclassified',
            sourceRefs: [{ type: 'artifact', id: filePath, label: filePath }],
            createdAt: now,
            updatedAt: now,
            createdBy: req.auth.user.id,
            updatedBy: req.auth.user.id,
          }, { project, actorUserId: req.auth.user.id, nowIso: () => now });
          const list = workItems.getWorkItems(project);
          list.unshift(record);
          workItems.setWorkItems(project, list.slice(0, 2000));
          task = workItems.findWorkItem(project, record.id);
          appendActivity(store, {
            projectId: project.id,
            actorUserId: req.auth.user.id,
            action: 'work_item_created',
            details: { workItemId: record.id, origin: 'platform', artifact: filePath },
          });
        });
      }

      return res.json({ workspace: forViewer(workspace, req.auth.user), sha: workspaceFormat.fileSha(content), changeRequest, task, diff: draft?.diff || '' });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // One small AI call (lib/prompt-packs.js). It reads and answers; it applies nothing.
  app.post('/api/projects/:projectId/packs/:packId', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    if (typeof runPack !== 'function') return res.status(503).json({ message: 'Os pacotes de IA não estão ligados nesta instalação.' });
    const input = {
      path: String(req.body?.path || ''),
      diff: String(req.body?.diff || ''),
      taskId: String(req.body?.taskId || ''),
      area: String(req.body?.area || ''),
      capability: String(req.body?.capability || ''),
      testPaths: (Array.isArray(req.body?.testPaths) ? req.body.testPaths : []).map(String),
      failure: String(req.body?.failure || '').slice(0, 3000),
      changes: (Array.isArray(req.body?.changes) ? req.body.changes : []).slice(0, 4)
        .map((change) => ({ path: String(change?.path || '').slice(0, 300), diff: String(change?.diff || '').slice(0, 4000) })),
    };
    let testsAndCode = {};
    if (promptPacks.PACKS[req.params.packId]?.needsTestsAndCode) {
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      testsAndCode = await loadTestsAndCode(repository, input.testPaths);
    }
    let framework = '';
    let existingTests = [];
    if (promptPacks.PACKS[req.params.packId]?.needsTestContext) {
      framework = promptPacks.detectTestFramework(req.loadedProject.repositorySurvey);
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (repository) {
        const reader = await workspaceSync.pickReader(repository, { remoteClient }).catch(() => null);
        for (const folder of ['tests/', 'test/', '__tests__/']) {
          if (reader) existingTests.push(...(await reader.listTree(folder).catch(() => [])));
        }
        existingTests = existingTests.filter((filePath) => promptPacks.testPath(filePath)).slice(0, 30);
      }
    }
    let code = null;
    if (promptPacks.PACKS[req.params.packId]?.needsCode && input.area) {
      // Only an area the survey found — never a path typed in.
      const known = (req.loadedProject.repositorySurvey?.modules || []).some((entry) => entry.name === input.area);
      if (!known) return res.status(400).json({ message: 'Essa parte do código não está no levantamento. Levante o código primeiro.' });
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      code = await readArea(repository, input.area);
    }
    const outcome = await runPack(req.params.packId, {
      snapshot: req.loadedProject.workspace?.snapshot || null,
      task: input.taskId ? workItems.findWorkItem(req.loadedProject, input.taskId) : null,
      code,
      framework,
      existingTests,
      ...testsAndCode,
      input,
    });
    if (outcome.error) return res.status(outcome.status || 400).json({ message: outcome.error });
    // Proposed code is shown against what is there now, so the person reviews a change.
    if (testsAndCode.reader && Array.isArray(outcome.result?.files)) {
      for (const file of outcome.result.files) file.diff = promptDiff(await testsAndCode.reader.readFile(file.path), file.content);
    }
    await updateStore(async (store) => {
      appendActivity(store, {
        projectId: req.params.projectId,
        actorUserId: req.auth.user.id,
        action: 'prompt_pack_run',
        details: { packId: req.params.packId, costUsd: outcome.costUsd, llmOptionId: outcome.llmOptionId, dropped: outcome.dropped },
      });
    });
    return res.json(outcome);
  });

  /**
   * Writes the test files a person accepted from tests_from_artefacts. Same rule as
   * saving an artefact: working copy when there is one, change request otherwise. Only
   * test-shaped paths, and never over a file that already exists — tests someone wrote
   * are not replaced by generated ones.
   */
  app.post('/api/projects/:projectId/repository/tests', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      const files = (Array.isArray(req.body?.files) ? req.body.files : [])
        .map((entry) => ({ path: promptPacks.testPath(entry?.path), content: String(entry?.content || '') }));
      if (!files.length || files.length > 3) return res.status(400).json({ message: 'Entre 1 e 3 ficheiros de teste.' });
      const bad = files.find((file) => !file.path || !file.content.trim() || file.content.length > promptPacks.MAX_TEST_FILE_CHARS);
      if (bad) return res.status(400).json({ message: 'Só ficheiros de teste, com conteúdo, dentro de tests/, test/ ou __tests__/ (ou *.test.* / *.spec.*).' });

      const reader = await workspaceSync.pickReader(repository, { remoteClient });
      for (const file of files) {
        if (await reader.readFile(file.path)) return res.status(409).json({ message: `${file.path} já existe. Os testes gerados não substituem testes escritos.` });
      }

      let changeRequest = null;
      if (typeof reader.writeFile === 'function') {
        for (const file of files) await reader.writeFile(file.path, file.content);
      } else {
        const client = await remoteClient();
        const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const result = await openspecRepository.commitFilesForReview(client, repository, {
          files,
          branch: `yourlab/testes-${stamp}`,
          title: `Testes: ${files.map((file) => file.path).join(', ')}`,
          body: 'Testes escritos a partir dos requisitos, antes do código.',
          commitMessage: 'testes a partir dos requisitos',
        });
        changeRequest = result.changeRequest;
      }
      await updateStore(async (store) => {
        appendActivity(store, {
          projectId: req.params.projectId,
          actorUserId: req.auth.user.id,
          action: 'tests_written',
          details: { files: files.map((file) => file.path), source: reader.kind },
        });
      });
      return res.json({ written: files.map((file) => file.path), changeRequest });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /**
   * Writes the code a person accepted from code_from_tests. The scope is worked out
   * again from the tests on the server; a file outside it, a test, a config or a
   * lockfile is refused whatever the request says.
   */
  app.post('/api/projects/:projectId/repository/code', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const repository = gitRepositories.normalizeProjectRepository(req.loadedProject.repository);
      if (!repository) return noRepository(res);
      const testPaths = (Array.isArray(req.body?.testPaths) ? req.body.testPaths : []).map(String);
      const { reader, scope } = await loadTestsAndCode(repository, testPaths);
      if (!scope || scope.unrestricted) return res.status(400).json({ message: 'Sem testes que importem código, não há onde escrever.' });

      const incoming = (Array.isArray(req.body?.files) ? req.body.files : []).map((entry) => ({ path: entry?.path, content: entry?.content }));
      const { result } = promptPacks.PACKS.code_from_tests.validate({ files: incoming }, { scope });
      if (!result.files.length || result.files.length !== incoming.length) {
        return res.status(400).json({ message: `Só código dentro de ${scope.prefixes.join(', ')} — nunca testes, configuração ou lockfiles.` });
      }

      let changeRequest = null;
      if (typeof reader.writeFile === 'function') {
        for (const file of result.files) await reader.writeFile(file.path, file.content);
      } else {
        const client = await remoteClient();
        const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const committed = await openspecRepository.commitFilesForReview(client, repository, {
          files: result.files,
          branch: `yourlab/codigo-${stamp}`,
          title: `Código para: ${testPaths.join(', ')}`,
          body: 'Código escrito para fazer passar estes testes.',
          commitMessage: 'código a partir dos testes',
        });
        changeRequest = committed.changeRequest;
      }
      await updateStore(async (store) => {
        appendActivity(store, {
          projectId: req.params.projectId,
          actorUserId: req.auth.user.id,
          action: 'code_written',
          details: { files: result.files.map((file) => file.path), tests: testPaths, source: reader.kind },
        });
      });
      return res.json({ written: result.files.map((file) => file.path), changeRequest });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  // Creates the smaller tasks a person accepted from split_task, under the original.
  app.post('/api/projects/projects/:projectId/work-items/:workItemId/split', authMiddleware, requireRole('super_admin', 'partner'), loadProjectForUser, async (req, res) => {
    try {
      const tasks = (Array.isArray(req.body?.tasks) ? req.body.tasks : [])
        .map((entry) => ({ title: String(entry?.title || '').trim().slice(0, 140), goal: String(entry?.goal || '').trim().slice(0, 400) }))
        .filter((entry) => entry.title);
      if (tasks.length < 2 || tasks.length > 8) return res.status(400).json({ message: 'Uma divisão tem entre 2 e 8 tarefas.' });

      let created = [];
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projecto não encontrado.');
        const list = workItems.getWorkItems(project);
        const parent = list.find((entry) => entry.id === req.params.workItemId);
        if (!parent) throw new Error('Tarefa não encontrada.');
        if (list.some((entry) => entry.parentTaskId === parent.id)) throw new Error('Esta tarefa já foi dividida.');

        const now = new Date().toISOString();
        const records = promptPacks.splitDrafts(parent, tasks, {
          now,
          actorUserId: req.auth.user.id,
          newId: () => `witem_${crypto.randomUUID()}`,
        }).map((draft) => workItems.normalizeWorkItem(draft, { project, actorUserId: req.auth.user.id, nowIso: () => now }));
        const next = [...records, ...list];
        for (const record of records) {
          workItems.validateHierarchy(record, next);
          workItems.validateDependencies(record, next);
        }
        workItems.setWorkItems(project, next.slice(0, 2000));
        created = records.map((record) => workItems.findWorkItem(project, record.id));
        appendActivity(store, {
          projectId: project.id,
          actorUserId: req.auth.user.id,
          action: 'work_item_split',
          details: { workItemId: parent.id, children: records.map((record) => record.id) },
        });
      });
      return res.json({ children: created });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/:projectId/workspace/initialize', authMiddleware, requireRole('super_admin'), loadProjectForUser, async (req, res) => {
    try {
      const project = req.loadedProject;
      const repository = gitRepositories.normalizeProjectRepository(project.repository);
      if (!repository) return noRepository(res);
      // Same rule as saving: into the working copy when there is one, a change request otherwise.
      const reader = await workspaceSync.pickReader(repository, { remoteClient });
      const existing = new Set(await reader.listTree(`${workspaceFormat.ROOT}/`));
      // A project that already has code starts from what the survey found in it.
      const files = workspaceFormat.skeletonFiles(project, { existing, survey: project.repositorySurvey || null });
      if (typeof reader.writeFile === 'function') {
        for (const file of files) await reader.writeFile(file.path, file.content);
        const workspace = await readAndStore(project.id, repository, req.auth.user.id, () => ({
          action: 'workspace_initialized',
          details: { files: files.map((file) => file.path), source: 'local', fromSurvey: Boolean(project.repositorySurvey) },
        }));
        return res.json({ local: true, files: files.map((file) => file.path), workspace: forViewer(workspace, req.auth.user) });
      }
      const client = await remoteClient();
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
