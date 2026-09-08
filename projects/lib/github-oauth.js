/**
 * GitHub OAuth — the platform's own GitHub identity.
 *
 * The engineer logs in with GitHub once, at platform level, and from then on the
 * platform can list and create repositories on that account, including private ones.
 * No Personal Access Token is typed anywhere.
 *
 * Requires a GitHub OAuth App registered by the operator:
 *   GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET
 * with the callback URL pointing at `/api/projects/git-provider/oauth/callback`
 * on whichever host the platform is served from.
 */
const crypto = require('crypto');

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
// `repo` is what reaches private repositories; a GitHub OAuth App cannot narrow this
// per-repository — that needs a GitHub App instead.
const SCOPES = ['repo', 'read:org', 'read:user'];
const STATE_TTL_MS = 10 * 60 * 1000;

/** Pending OAuth handshakes, by state token. In-memory: a restart cancels them. */
const pendingStates = new Map();

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function oauthConfig(env = process.env) {
  return {
    clientId: text(env.GITHUB_OAUTH_CLIENT_ID),
    clientSecret: text(env.GITHUB_OAUTH_CLIENT_SECRET),
  };
}

function isConfigured(env = process.env) {
  const { clientId, clientSecret } = oauthConfig(env);
  return Boolean(clientId && clientSecret);
}

/** Callback URL derived from the live request, so localhost and production both work. */
function callbackUrlFor(req) {
  const proto = text(req.headers['x-forwarded-proto']) || req.protocol || 'http';
  const host = text(req.headers['x-forwarded-host']) || text(req.headers.host);
  return `${proto}://${host}/api/projects/git-provider/oauth/callback`;
}

function prune(now = Date.now()) {
  for (const [key, entry] of pendingStates) {
    if (entry.expiresAt <= now) pendingStates.delete(key);
  }
}

function createState(payload = {}, now = Date.now()) {
  prune(now);
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { ...payload, expiresAt: now + STATE_TTL_MS });
  return state;
}

/** Single-use: a state can be consumed exactly once, which is the CSRF guarantee. */
function consumeState(state, now = Date.now()) {
  prune(now);
  const key = text(state);
  if (!key || !pendingStates.has(key)) return null;
  const entry = pendingStates.get(key);
  pendingStates.delete(key);
  return entry;
}

function authorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    allow_signup: 'false',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Trades the callback code for an access token. Throws with GitHub's own reason. */
async function exchangeCodeForToken({ code, redirectUri, env = process.env, fetchImpl = fetch }) {
  const { clientId, clientSecret } = oauthConfig(env);
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(text(payload?.error_description || payload?.error, `GitHub recusou a troca do codigo (HTTP ${response.status}).`));
  }
  const accessToken = text(payload?.access_token);
  if (!accessToken) throw new Error('GitHub nao devolveu um token de acesso.');
  return {
    accessToken,
    // GitHub reports what was actually granted, which can be less than requested.
    scopes: text(payload?.scope).split(',').map((s) => text(s)).filter(Boolean),
    tokenType: text(payload?.token_type, 'bearer'),
  };
}

/** Which of the scopes we need are missing from what was actually granted. */
function missingScopes(granted = []) {
  const has = new Set((granted || []).map((s) => text(s)));
  // read:user is implied by the user endpoint working; only `repo` is load-bearing.
  return ['repo'].filter((scope) => !has.has(scope));
}

module.exports = {
  AUTHORIZE_URL,
  SCOPES,
  STATE_TTL_MS,
  TOKEN_URL,
  authorizeUrl,
  callbackUrlFor,
  consumeState,
  createState,
  exchangeCodeForToken,
  isConfigured,
  missingScopes,
  oauthConfig,
};
