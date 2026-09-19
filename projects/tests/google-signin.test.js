/**
 * Entrar com Google: a token is trusted only when Google vouches for it, for this
 * platform, for a verified email; the first sign-in makes an account with no access.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const google = require('../lib/google-signin');

const CLIENT_ID = '1234-abc.apps.googleusercontent.com';
const NOW = Date.parse('2026-09-19T10:00:00.000Z');

function claims(overrides = {}) {
  return {
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    exp: String(NOW / 1000 + 600),
    sub: '1098765',
    email: 'Ana@Example.com',
    email_verified: 'true',
    name: 'Ana Costa',
    ...overrides,
  };
}

test('trusts a token issued to this platform for a verified email', () => {
  const profile = google.checkClaims(claims(), { clientId: CLIENT_ID, now: NOW });
  assert.deepEqual(profile, { sub: '1098765', email: 'ana@example.com', name: 'Ana Costa' });
});

test('refuses a token for another app, from elsewhere, expired or unverified', () => {
  const opts = { clientId: CLIENT_ID, now: NOW };
  assert.throws(() => google.checkClaims(claims({ aud: 'other.apps.googleusercontent.com' }), opts), /não é para esta plataforma/);
  assert.throws(() => google.checkClaims(claims({ iss: 'evil.example' }), opts), /não veio da Google/);
  assert.throws(() => google.checkClaims(claims({ exp: String(NOW / 1000 - 1) }), opts), /expirou/);
  assert.throws(() => google.checkClaims(claims({ email_verified: 'false' }), opts), /verificado/);
  assert.throws(() => google.checkClaims(claims(), { clientId: '', now: NOW }), /não está ligada/);
});

test('keeps to the allowed domains when there are any', () => {
  const opts = { clientId: CLIENT_ID, now: NOW, allowedDomains: ['yourlabpt.com'] };
  assert.throws(() => google.checkClaims(claims(), opts), /yourlabpt\.com/);
  assert.equal(google.checkClaims(claims({ email: 'tulio@yourlabpt.com' }), opts).email, 'tulio@yourlabpt.com');
});

test('asks Google in a POST body, never in the URL', async () => {
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => claims() };
  };
  const profile = await google.verifyIdToken('the-token', { clientId: CLIENT_ID, now: NOW, fetchImpl });
  assert.equal(profile.email, 'ana@example.com');
  assert.equal(seen.url, 'https://oauth2.googleapis.com/tokeninfo');
  assert.equal(seen.init.method, 'POST');
  assert.match(seen.init.body, /id_token=the-token/);
});

test('the first sign-in makes a client account with no access', () => {
  const users = [];
  const { user, created } = google.signInUser(users, { sub: 's1', email: 'ana@example.com', name: 'Ana' }, { now: 'T', newId: () => 'usr_new' });
  assert.equal(created, true);
  assert.equal(users.length, 1);
  assert.equal(user.role, 'client');
  assert.equal(user.canViewBudget, false);
  assert.equal(user.passwordHash, '');
  assert.equal(user.authProvider, 'google');
});

test('an account made by an administrator is found by email and linked', () => {
  const users = [{ id: 'usr_1', email: 'ana@example.com', role: 'partner', isActive: true }];
  const { user, created, linked } = google.signInUser(users, { sub: 's1', email: 'ana@example.com', name: 'Ana' });
  assert.equal(created, false);
  assert.equal(linked, true);
  assert.equal(user.role, 'partner');
  assert.equal(user.googleSub, 's1');
});

test('a deactivated account cannot come back in through Google', () => {
  const users = [{ id: 'usr_1', email: 'ana@example.com', isActive: false }];
  assert.throws(() => google.signInUser(users, { sub: 's1', email: 'ana@example.com' }), /desactivada/);
});

test('settings are saved on screen, and the environment wins over them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'google-signin-'));
  await assert.rejects(() => google.saveSettings(dir, { clientId: 'not-a-client-id' }), /apps\.googleusercontent\.com/);
  await google.saveSettings(dir, { clientId: CLIENT_ID, allowedDomains: '@YourLabPT.com, example.com' });

  assert.deepEqual(await google.readConfig(dir, {}), {
    clientId: CLIENT_ID,
    allowedDomains: ['yourlabpt.com', 'example.com'],
    source: 'settings',
  });
  const fromEnv = await google.readConfig(dir, { GOOGLE_OAUTH_CLIENT_ID: 'env.apps.googleusercontent.com' });
  assert.equal(fromEnv.clientId, 'env.apps.googleusercontent.com');
  assert.equal(fromEnv.source, 'env');
});

test('the routes exist: sign-in is open, its settings are the administrator\'s', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  assert.match(api, /app\.post\('\/api\/projects\/auth\/google', async/);
  assert.match(api, /app\.put\('\/api\/projects\/auth\/google\/settings', authMiddleware, requireRole\('super_admin'\)/);
  assert.match(api, /googleSignIn: \{ clientId:/);
});
