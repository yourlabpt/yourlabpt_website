/**
 * Git on a project's working copy, the few commands the platform needs: know where the
 * clone stands, bring it up to date before touching it, and commit and push what was
 * written. Nothing here resolves a conflict or forces anything: when git says no, the
 * platform says so and stops.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const FALLBACK_IDENTITY = ['-c', 'user.name=YourLab Platform', '-c', 'user.email=platform@yourlabpt.com'];

function run(root, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: String(stdout || '').trim(), err: String(stderr || error?.message || '').trim() });
    });
  });
}

function isRepo(root) {
  return Boolean(root) && fs.existsSync(path.join(root, '.git'));
}

async function identityArgs(root) {
  const email = await run(root, ['config', 'user.email']);
  return email.out ? [] : FALLBACK_IDENTITY;
}

/** Where the clone stands against its remote. Fetches first, so «behind» is true now. */
async function status(root) {
  if (!isRepo(root)) return null;
  const branch = (await run(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out || '';
  const remote = (await run(root, ['remote'])).out;
  const hasRemote = Boolean(remote);
  let fetched = false;
  let error = '';
  if (hasRemote) {
    const fetch = await run(root, ['fetch', '--quiet']);
    fetched = fetch.ok;
    if (!fetch.ok) error = fetch.err.split('\n')[0];
  }
  let ahead = 0;
  let behind = 0;
  if (hasRemote && fetched) {
    const counts = await run(root, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    if (counts.ok) [behind, ahead] = counts.out.split(/\s+/).map(Number);
  }
  const dirty = (await run(root, ['status', '--porcelain'])).out.split('\n').filter(Boolean).map((line) => line.slice(3));
  return { branch, hasRemote, fetched, ahead, behind, dirty, error };
}

/** Brings the clone up to date, fast-forward only. Never merges, never rebases a dirty tree. */
async function pull(root) {
  if (!isRepo(root)) return { ok: true, message: 'Sem git nesta pasta.' };
  if (!(await run(root, ['remote'])).out) return { ok: true, message: 'Sem remoto.' };
  const result = await run(root, ['pull', '--ff-only', '--quiet']);
  if (result.ok) return { ok: true, message: 'Actualizado.' };
  const reason = /not possible to fast-forward|diverg/i.test(result.err) ? 'o ramo local divergiu do remoto'
    : /overwritten by merge|local changes/i.test(result.err) ? 'há alterações locais por guardar nos mesmos ficheiros'
      : /Could not resolve host|unable to access|Connection/i.test(result.err) ? 'sem ligação ao remoto'
        : result.err.split('\n')[0];
  return { ok: false, message: reason };
}

/**
 * Commits the given paths and pushes. A push refused because the remote moved is retried
 * once after a rebase of our commit; a second refusal stays local and is reported.
 */
async function commitAndPush(root, paths, message) {
  if (!isRepo(root)) return { committed: false, pushed: false, message: 'Sem git nesta pasta.' };
  const add = await run(root, ['add', '--', ...paths]);
  if (!add.ok) return { committed: false, pushed: false, message: add.err };
  const staged = await run(root, ['diff', '--cached', '--quiet']);
  if (staged.ok) return { committed: false, pushed: false, message: 'Nada mudou.' };
  const identity = await identityArgs(root);
  const commit = await run(root, [...identity, 'commit', '--quiet', '-m', message]);
  if (!commit.ok) return { committed: false, pushed: false, message: commit.err.split('\n')[0] };
  const sha = (await run(root, ['rev-parse', '--short', 'HEAD'])).out;
  if (!(await run(root, ['remote'])).out) return { committed: true, pushed: false, commit: sha, message: 'Commit feito; sem remoto para enviar.' };
  let push = await run(root, ['push', '--quiet']);
  if (!push.ok) {
    await run(root, [...identity, 'pull', '--rebase', '--quiet']);
    push = await run(root, ['push', '--quiet']);
  }
  return push.ok
    ? { committed: true, pushed: true, commit: sha, message: 'Commit feito e enviado.' }
    : { committed: true, pushed: false, commit: sha, message: `Commit feito; o envio falhou: ${push.err.split('\n')[0]}` };
}

module.exports = { isRepo, status, pull, commitAndPush };
