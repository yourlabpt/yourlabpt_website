/**
 * The repository binding is what makes a project executable: agents need somewhere to
 * write. These cover the two halves of that rule — the server refuses to start without
 * one, and the UI says so instead of offering a form that would fail.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
}

test('starting an Execução is refused while the project has no repository', () => {
  const source = read('lib', 'orchestration-routes.js');

  // The gap is computed from the binding itself, not from a flag someone could forget.
  assert.match(source, /function repositoryGap\(project\)/);
  assert.match(source, /gitRepositories\.normalizeProjectRepository\(project\?\.repository\)/);

  // Reported to the UI...
  assert.match(source, /blockedReason: repositoryGap\(project\)/);
  // ...and enforced on the way in, so the UI is not the only thing stopping it.
  assert.match(source, /const gap = repositoryGap\(req\.loadedProject\);/);
  assert.match(source, /if \(gap\) return res\.status\(409\)/);
});

test('the production line explains the block instead of offering the start form', () => {
  const source = read('public', 'client-portal-ui.js');
  assert.match(source, /if \(!exec && orch\.blockedReason\)/);
  assert.match(source, /Projecto incompleto/);
  // The start form must stay behind the block, never rendered alongside it.
  const blockAt = source.indexOf('orch.blockedReason');
  const formAt = source.indexOf('execGoalInput');
  assert.ok(blockAt > -1 && formAt > blockAt, 'block branch must come before the start form');
});

test('the repository is picked from the connected account, not typed by hand', () => {
  const source = read('public', 'project-repository-ui.js');

  assert.match(source, /git-provider\/repositories\?q=/);
  assert.match(source, /class="btn tiny ghost repo-pick"/);
  // The old free-text field is gone: a typed name could name a repository that the
  // account cannot reach.
  assert.doesNotMatch(source, /repoLinkRef/);

  // Local path lives on the same binding, and is editable.
  assert.match(source, /repoLocalPath/);
  assert.match(source, /method: 'PATCH'/);
});

test('platform settings is where the GitHub account is configured, not Agentes', () => {
  const repoUi = read('public', 'project-repository-ui.js');
  assert.match(repoUi, /Definições da plataforma/);
  assert.doesNotMatch(repoUi, /Agentes → Repositórios Git/);

  const agents = read('public', 'agents-admin-ui.js');
  assert.doesNotMatch(agents, /git-provider/);
});
