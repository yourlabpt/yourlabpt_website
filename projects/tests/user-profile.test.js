/**
 * A person's own account: they may change what describes them and their password, and
 * nothing that decides their access.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { applyOwnProfile } = require('../lib/user-profile');

const hashPassword = (password) => `hash:${password}`;
const verifyPassword = (stored, candidate) => stored === `hash:${candidate}`;

function user(overrides = {}) {
  return {
    id: 'usr_1',
    name: 'Túlio Soares',
    email: 'tulio@yourlab.pt',
    role: 'partner',
    canViewBudget: false,
    isActive: true,
    passwordHash: hashPassword('password-antiga'),
    ...overrides,
  };
}

function apply(record, body, users = [record]) {
  return applyOwnProfile(record, body, { users, verifyPassword, hashPassword, now: '2026-09-14T10:00:00.000Z' });
}

test('saves what describes the person and says what changed', () => {
  const record = user();
  const { changed } = apply(record, { name: ' Túlio ', phone: '+351 912 345 678', company: 'YourLab', jobTitle: 'Fundador' });

  assert.deepEqual(changed, ['name', 'phone', 'company', 'jobTitle']);
  assert.equal(record.name, 'Túlio');
  assert.equal(record.phone, '+351 912 345 678');
  assert.equal(record.updatedAt, '2026-09-14T10:00:00.000Z');
});

test('reports nothing when nothing moved', () => {
  const record = user({ phone: '912' });
  const { changed } = apply(record, { name: 'Túlio Soares', phone: '912' });
  assert.deepEqual(changed, []);
  assert.equal(record.updatedAt, undefined);
});

test('never lets a person change their own access', () => {
  const record = user();
  apply(record, { role: 'super_admin', isActive: false, canViewBudget: true, passwordHash: 'x' });
  assert.equal(record.role, 'partner');
  assert.equal(record.isActive, true);
  assert.equal(record.canViewBudget, false);
  assert.equal(record.passwordHash, hashPassword('password-antiga'));
});

test('refuses an empty name, a malformed email and an email already in use', () => {
  const other = user({ id: 'usr_2', email: 'outra@yourlab.pt' });
  assert.throws(() => apply(user(), { name: '  ' }), /nome/);
  assert.throws(() => apply(user(), { email: 'sem-arroba' }), /email válido/);
  const record = user();
  assert.throws(() => apply(record, { email: 'OUTRA@yourlab.pt' }, [record, other]), /Já existe/);
});

test('changes the password only with the current one, and only to a long enough one', () => {
  assert.throws(() => apply(user(), { newPassword: 'nova-password-longa' }), /actual não está certa/);
  assert.throws(() => apply(user(), { currentPassword: 'errada', newPassword: 'nova-password-longa' }), /actual não está certa/);
  assert.throws(() => apply(user(), { currentPassword: 'password-antiga', newPassword: 'curta' }), /pelo menos 10/);

  const record = user();
  const { changed } = apply(record, { currentPassword: 'password-antiga', newPassword: 'nova-password-longa' });
  assert.deepEqual(changed, ['password']);
  assert.equal(record.passwordHash, hashPassword('nova-password-longa'));
});

test('the own-account route is open to anyone signed in and applies these rules', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const api = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  assert.match(api, /app\.patch\('\/api\/projects\/auth\/me', authMiddleware, async/);
  assert.match(api, /userProfile\.applyOwnProfile\(/);
});

test('an account made through Google sets its first password without a current one', () => {
  const record = user({ passwordHash: '' });
  const { changed } = apply(record, { newPassword: 'primeira-password' });
  assert.deepEqual(changed, ['password']);
  assert.equal(record.passwordHash, hashPassword('primeira-password'));
});
