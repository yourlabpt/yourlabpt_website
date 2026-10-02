const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const gitLocal = require('../lib/git-local');
const io = require('../lib/workspace-io');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@x.y', ...args], { cwd, stdio: 'pipe' }).toString().trim();

/** A bare remote with one commit, and two clones of it: ours and «elsewhere». */
function twoClones() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-local-'));
  const bare = path.join(dir, 'remote.git');
  git(dir, 'init', '--bare', '-b', 'main', bare);
  const seed = path.join(dir, 'seed');
  git(dir, 'clone', '-q', bare, seed);
  fs.mkdirSync(path.join(seed, 'yourlab'));
  fs.writeFileSync(path.join(seed, 'yourlab/project.md'), '---\nname: A\n---\n\n## Propósito\nA.\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'seed'); git(seed, 'push', '-q', 'origin', 'main');
  const ours = path.join(dir, 'ours');
  const theirs = path.join(dir, 'theirs');
  git(dir, 'clone', '-q', bare, ours);
  git(dir, 'clone', '-q', bare, theirs);
  return { dir, bare, ours, theirs };
}
const repoFor = (localPath) => ({ provider: 'github', owner: 'x', name: 'r', fullName: 'x/r', defaultBranch: 'main', localPath });

test('a write pulls first, so what was pushed elsewhere is in the clone, then commits and pushes', async () => {
  const { ours, theirs } = twoClones();
  fs.writeFileSync(path.join(theirs, 'yourlab/ideas.md'), '## Deles\n- Estado: nova\n');
  git(theirs, 'add', '.'); git(theirs, 'commit', '-q', '-m', 'elsewhere'); git(theirs, 'push', '-q');

  const result = await io.writeFiles('/tmp', repoFor(ours), [{ path: 'yourlab/questions.md', content: '## Q?\n- Para: cliente\n- Estado: aberta\n' }], 'yourlab');
  assert.equal(result.source, 'local');
  assert.equal(result.git.committed, true);
  assert.equal(result.git.pushed, true);
  assert.ok(fs.existsSync(path.join(ours, 'yourlab/ideas.md')), 'pulled what was pushed elsewhere');
  assert.match(git(ours, 'log', '--oneline', '-1'), /yourlab/);
  git(theirs, 'pull', '-q');
  assert.ok(fs.existsSync(path.join(theirs, 'yourlab/questions.md')), 'the other clone sees our save after a pull');
  const status = await gitLocal.status(ours);
  assert.deepEqual([status.ahead, status.behind, status.dirty], [0, 0, []]);
});

test('a clone that cannot fast-forward is not written over; the message says why', async () => {
  const { ours, theirs } = twoClones();
  // Both sides change the same file: ours uncommitted, theirs pushed.
  fs.writeFileSync(path.join(ours, 'yourlab/project.md'), 'local edit\n');
  fs.writeFileSync(path.join(theirs, 'yourlab/project.md'), 'their edit\n');
  git(theirs, 'add', '.'); git(theirs, 'commit', '-q', '-m', 'theirs'); git(theirs, 'push', '-q');

  await assert.rejects(
    io.writeFiles('/tmp', repoFor(ours), [{ path: 'yourlab/ideas.md', content: 'x\n' }], 'yourlab'),
    /não está actualizado: há alterações locais/,
  );
  assert.equal(fs.existsSync(path.join(ours, 'yourlab/ideas.md')), false, 'nothing written');
});

test('a sync pulls and reports where the clone stands', async () => {
  const { ours, theirs } = twoClones();
  fs.writeFileSync(path.join(theirs, 'yourlab/ideas.md'), '## Deles\n- Estado: nova\n');
  git(theirs, 'add', '.'); git(theirs, 'commit', '-q', '-m', 'elsewhere'); git(theirs, 'push', '-q');
  const store = { projects: [{ id: 'p1', repository: repoFor(ours), requirements: [] }] };
  const deps = { dataDir: '/tmp', updateStore: async (fn) => fn(store), appendActivity: () => {} };
  const workspace = await io.syncProject(deps, 'p1', repoFor(ours), 'u1');
  assert.equal(workspace.git.pulled, true);
  assert.equal(workspace.git.branch, 'main');
  assert.equal(workspace.snapshot.ideas.length, 1, 'the idea pushed elsewhere is in the snapshot');
});

test('a folder without git is still just written', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'));
  const result = await io.writeFiles('/tmp', repoFor(dir), [{ path: 'yourlab/ideas.md', content: 'x\n' }], 'yourlab');
  assert.equal(result.git.committed, false);
  assert.ok(fs.existsSync(path.join(dir, 'yourlab/ideas.md')));
});
