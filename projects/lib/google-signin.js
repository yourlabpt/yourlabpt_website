/**
 * Entrar com Google — sign-in, and sign-up, with a Google account.
 *
 * The first Google sign-in makes an account, and that account can see nothing: it has
 * no projects until an administrator gives it some, in the project's settings. So
 * opening sign-up to anyone with a Google account opens the door to the platform, not
 * to any client's work. An administrator can narrow it further to a list of domains.
 *
 * The browser gets a signed ID token from Google (Google Identity Services — no secret
 * involved). The server asks Google whether the token is genuine and for whom, checks it
 * was issued to this platform's client ID, and only then trusts the email.
 *
 * Configured by GOOGLE_OAUTH_CLIENT_ID (and optionally GOOGLE_ALLOWED_DOMAINS), or from
 * Definições da plataforma, which stores it in data/platform-auth.json. A client ID is
 * public — every page showing the button carries it — so it is not a secret and may
 * live in a tracked file. The environment wins when both are set.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const SETTINGS_FILE = 'platform-auth.json';
const CLIENT_ID_PATTERN = /^[\w.-]+\.apps\.googleusercontent\.com$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDomains(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
  return [...new Set(list
    .map((domain) => text(String(domain ?? '')).toLowerCase().replace(/^@/, ''))
    .filter(Boolean))];
}

async function readStoredFile(dataDir) {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(dataDir, SETTINGS_FILE), 'utf8')) || {};
  } catch {
    return {};
  }
}

/** The configuration in force. The environment wins over what was saved on screen. */
async function readConfig(dataDir, env = process.env) {
  const stored = (await readStoredFile(dataDir)).google || {};
  const envClientId = text(env.GOOGLE_OAUTH_CLIENT_ID);
  const storedClientId = text(stored.clientId);
  return {
    clientId: envClientId || storedClientId,
    allowedDomains: normalizeDomains(envClientId ? (env.GOOGLE_ALLOWED_DOMAINS || '') : (stored.allowedDomains || [])),
    source: envClientId ? 'env' : (storedClientId ? 'settings' : ''),
  };
}

/** Saves what the administrator typed. An empty client ID turns Google sign-in off. */
async function saveSettings(dataDir, input = {}) {
  const clientId = text(input.clientId);
  if (clientId && !CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('O Client ID do Google termina em .apps.googleusercontent.com.');
  }
  const google = { clientId, allowedDomains: normalizeDomains(input.allowedDomains) };
  const current = await readStoredFile(dataDir);
  await fs.promises.writeFile(
    path.join(dataDir, SETTINGS_FILE),
    `${JSON.stringify({ ...current, google }, null, 2)}\n`,
  );
  return google;
}

/** Whether Google's answer about a token can be trusted by this platform. */
function checkClaims(claims, { clientId, allowedDomains = [], now = Date.now() } = {}) {
  const c = claims && typeof claims === 'object' ? claims : {};
  if (!clientId) throw new Error('A entrada com Google não está ligada nesta plataforma.');
  if (text(c.aud) !== clientId) throw new Error('Este início de sessão Google não é para esta plataforma.');
  if (!ISSUERS.has(text(c.iss))) throw new Error('Este início de sessão não veio da Google.');
  if (!(Number(c.exp) * 1000 > now)) throw new Error('O início de sessão Google expirou. Tente de novo.');

  const email = text(c.email).toLowerCase();
  const verified = c.email_verified === true || c.email_verified === 'true';
  if (!email || !verified) throw new Error('A conta Google não tem um email verificado.');

  const domain = email.split('@')[1] || '';
  if (allowedDomains.length && !allowedDomains.includes(domain)) {
    throw new Error(`Só contas de ${allowedDomains.join(', ')} podem entrar.`);
  }
  return { sub: text(c.sub), email, name: text(c.name) || email.split('@')[0] };
}

/**
 * Asks Google who a token belongs to, then checks the answer. The token travels in a
 * POST body so it never sits in a URL or a request log.
 */
async function verifyIdToken(idToken, options = {}) {
  const token = text(idToken);
  if (!token) throw new Error('Falta o token do Google.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(TOKENINFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token }).toString(),
  });
  if (!response.ok) throw new Error('A Google não reconheceu este início de sessão.');
  return checkClaims(await response.json(), options);
}

/**
 * The account behind a Google sign-in: found by Google's id for the person, then by
 * email — an account an administrator made before the person first used Google — or
 * made new. A new account is a client with no projects: it signs in and sees nothing
 * until an administrator gives it access.
 */
function signInUser(users, profile, { now = new Date().toISOString(), newId = () => `usr_${crypto.randomUUID()}` } = {}) {
  let user = users.find((entry) => profile.sub && entry.googleSub === profile.sub)
    || users.find((entry) => entry.email === profile.email);

  if (user) {
    if (user.isActive === false) throw new Error('Esta conta foi desactivada. Fale com o administrador.');
    const linked = !user.googleSub;
    if (linked) user.googleSub = profile.sub;
    user.lastLoginAt = now;
    return { user, created: false, linked };
  }

  user = {
    id: newId(),
    name: profile.name,
    email: profile.email,
    role: 'client',
    canViewBudget: false,
    passwordHash: '',
    isActive: true,
    authProvider: 'google',
    googleSub: profile.sub,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
  users.push(user);
  return { user, created: true, linked: false };
}

module.exports = { readConfig, saveSettings, checkClaims, verifyIdToken, signInUser, normalizeDomains };
