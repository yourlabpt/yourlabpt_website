const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const io = require('../lib/workspace-io');
const format = require('../lib/workspace-format');

/** A Git host in memory: one branch, files by path, every write a commit on it. */
function fakeHost(files = {}) {
  const commits = [];
  return {
    commits,
    files,
    async listTree(owner, name, prefix = '') { return Object.keys(files).filter((p) => p.startsWith(prefix)); },
    async readFile(owner, name, p) { return files[p] ?? null; },
    async writeFile(owner, name, p, content, { branch, message }) { files[p] = content; commits.push({ p, branch, message }); },
  };
}
const REMOTE = { provider: 'github', owner: 'x', name: 'r', fullName: 'x/r', defaultBranch: 'main' };

test('with no working copy, a save is a commit on the default branch and the next read shows it', async () => {
  const host = fakeHost({ 'yourlab/project.md': '---\nname: A\n---\n\n## Propósito\nA.\n' });
  io.factory.remoteClient = async () => host;
  const result = await io.writeFiles('/tmp', REMOTE, [{ path: 'yourlab/ideas.md', content: '## X\n- Estado: nova\n' }], 'yourlab');
  assert.equal(result.source, 'remote');
  assert.deepEqual(host.commits.map((c) => [c.p, c.branch]), [['yourlab/ideas.md', 'main']]);
  assert.equal(await io.readFile('/tmp', REMOTE, 'yourlab/ideas.md'), '## X\n- Estado: nova\n');
  await assert.rejects(io.writeFiles('/tmp', null, [{ path: 'a', content: 'b' }]), /não tem repositório/);
});

test('a sync pulls the spec files into the platform requirements, keeping what only the platform knows', async () => {
  const spec = '# Reservas Specification\n\n## Requirements\n\n### Requirement: Criar reserva\n<!-- yourlab: id=FR-001; type=functional; module=Backend -->\n\nO sistema SHALL criar.\n\n#### Scenario: Ok\n- **WHEN** a\n- **THEN** b\n\n### Requirement: Encher a sala\n<!-- yourlab: id=STK-001; type=stakeholder -->\n\nO dono quer a sala cheia.\n';
  const host = fakeHost({ 'yourlab/project.md': '---\nname: A\n---\n\n## Propósito\nA.\n', 'openspec/specs/reservas/spec.md': spec });
  io.factory.remoteClient = async () => host;
  const store = { projects: [{ id: 'p1', repository: REMOTE, requirements: [{ id: 'FR-001', type: 'functional', title: 'Velho', shall: 'x', phase: 'Fase 1', status: 'approved' }, { id: 'FR-999', type: 'functional', title: 'Só na plataforma' }] }] };
  const deps = { dataDir: '/tmp', updateStore: async (fn) => fn(store), appendActivity: () => {} };
  await io.syncProject(deps, 'p1', REMOTE, 'u1');
  const reqs = store.projects[0].requirements;
  const fr = reqs.find((r) => r.id === 'FR-001');
  assert.equal(fr.title, 'Criar reserva', 'the file wins');
  assert.equal(fr.phase, 'Fase 1', 'the platform keeps its own fields');
  assert.equal(fr.status, 'approved');
  assert.equal(reqs.find((r) => r.id === 'STK-001').type, 'stakeholder');
  assert.equal(reqs.find((r) => r.type === 'test_case').linkedFunctionalRequirement, 'FR-001');
  assert.equal(reqs.some((r) => r.id === 'FR-999'), false, 'not in the files, not in the project');
  // What was just pulled is agreed: persisting it must not push.
  assert.equal(io.noteRequirements('p1', reqs), false);
  assert.equal(io.noteRequirements('p1', [...reqs, { id: 'FR-002', type: 'functional', title: 'Novo' }]), true);
});

test('a project whose repository has no specs keeps its platform requirements, and initialize writes them', async () => {
  const host = fakeHost({ 'yourlab/project.md': '---\nname: A\n---\n\n## Propósito\nA.\n' });
  io.factory.remoteClient = async () => host;
  const requirements = [{ id: 'FR-001', type: 'functional', module: 'Backend', title: 'Criar', shall: 'DEVE criar.' }, { id: 'OOS-001', type: 'out_of_scope', module: 'Backend', title: 'Fora', shall: 'Não faz.' }];
  const store = { projects: [{ id: 'p1', repository: REMOTE, requirements }] };
  const deps = { dataDir: '/tmp', updateStore: async (fn) => fn(store), appendActivity: () => {} };
  await io.syncProject(deps, 'p1', REMOTE, 'u1');
  assert.equal(store.projects[0].requirements.length, 2);

  const files = format.skeletonFiles({ name: 'A' }, { existing: new Set(['yourlab/project.md']), requirements });
  const spec = files.find((file) => file.path === 'openspec/specs/backend/spec.md');
  assert.ok(spec, 'platform requirements become spec files');
  assert.match(spec.content, /type=out_of_scope/);
  assert.equal(format.skeletonFiles({ name: 'A' }, { existing: new Set(['openspec/specs/x/spec.md']), requirements }).some((f) => f.path.startsWith('openspec/')), false, 'never over specs that exist');
});

test('an edit on the platform is pushed as the changed spec files only, then read back', async () => {
  const host = fakeHost({ 'yourlab/project.md': '---\nname: A\n---\n\n## Propósito\nA.\n' });
  io.factory.remoteClient = async () => host;
  const project = { id: 'p1', name: 'A', repository: REMOTE, requirements: [{ id: 'FR-001', type: 'functional', module: 'Backend', title: 'Criar', shall: 'DEVE criar.' }] };
  const store = { projects: [project] };
  const deps = { dataDir: '/tmp', updateStore: async (fn) => fn(store), appendActivity: () => {}, loadProject: async () => store.projects[0] };
  const first = await io.pushRequirements(deps, project, 'u1');
  assert.deepEqual(first.written, ['openspec/specs/backend/spec.md']);
  assert.equal(store.projects[0].workspace.snapshot.requirements[0].capability, 'backend');
  const again = await io.pushRequirements(deps, store.projects[0], 'u1');
  assert.deepEqual(again.written, [], 'nothing changed, nothing written');
  assert.equal(host.commits.length, 1);
});
