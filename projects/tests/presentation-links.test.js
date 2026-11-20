const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const routes = require('../lib/workspace-routes');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'presentation-'));
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-20T10:00:00Z');
const link = { id: 'abc123', label: 'Grupo Exemplo', createdAt: new Date(now).toISOString(), createdBy: 'u1', expiresAt: new Date(now + 30 * DAY).toISOString(), revokedAt: null };
const project = { id: 'prj_1', presentationLinks: [link] };
const tokenOf = (url) => url.split('/presentation/')[1].split('/')[0];

test('a presentation link opens its own project until it expires', () => {
  const view = routes.presentationView(dataDir, project.id, link, now);
  assert.equal(view.active, true);
  assert.match(view.url, /^\/api\/projects\/prj_1\/presentation\/abc123\.\d+\.[\w-]+\/index\.html$/);
  const token = tokenOf(view.url);
  assert.equal(routes.presentationLinkFor(dataDir, project, token, now)?.id, 'abc123');
  assert.equal(routes.presentationLinkFor(dataDir, project, token, now + 31 * DAY), null, 'expired');
  assert.equal(routes.presentationLinkFor(dataDir, { ...project, id: 'prj_2' }, token, now), null, 'another project');
});

test('a forged, edited or turned-off link opens nothing', () => {
  const token = tokenOf(routes.presentationView(dataDir, project.id, link, now).url);
  const [id, expiry, sig] = token.split('.');
  assert.equal(routes.presentationLinkFor(dataDir, project, `${id}.${Number(expiry) + DAY}.${sig}`, now), null, 'longer expiry');
  assert.equal(routes.presentationLinkFor(dataDir, project, `${id}.${expiry}.${sig.slice(0, -2)}xx`, now), null, 'bad signature');
  assert.equal(routes.presentationLinkFor(dataDir, project, 'garbage', now), null);
  const revoked = { ...project, presentationLinks: [{ ...link, revokedAt: new Date(now).toISOString() }] };
  assert.equal(routes.presentationLinkFor(dataDir, revoked, token, now), null, 'revoked');
  assert.equal(routes.presentationView(dataDir, project.id, revoked.presentationLinks[0], now).url, null);
  assert.equal(routes.presentationLinkFor(dataDir, { ...project, presentationLinks: [] }, token, now), null, 'unknown link');
});
