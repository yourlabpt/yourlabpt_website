/**
 * The whole loop, on a real git remote and two clones — the platform's and «elsewhere»:
 *
 *   init → artefacts linked to code → small AI change through the platform (one artefact,
 *   its code, whole files, commit + push) → `check` sees the artefacts are now older than
 *   the code → AI cross-check proposes which artefacts to update (only real paths) →
 *   artefacts updated → clean → a bigger change made locally elsewhere → the platform
 *   pulls it → `check` names the folder nobody drew → drawn → clean.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const cli = require('../bin/yourlab');
const io = require('../lib/workspace-io');
const edit = require('../public/artefact-edit');
const packs = require('../lib/prompt-packs');
const registry = require('../lib/prompt-registry');
const { buildScope } = require('../lib/agent-code-commit');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@x.y', ...args], { cwd, stdio: 'pipe' }).toString().trim();
// Commits one second apart, so «changed after» is never a tie.
let clock = 0;
function tick() {
  clock += 1;
  const at = `2026-11-20T10:00:${String(clock).padStart(2, '0')}`;
  process.env.GIT_COMMITTER_DATE = at;
  process.env.GIT_AUTHOR_DATE = at;
}
const write = (root, file, content) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), content); };
const repoFor = (localPath) => ({ provider: 'github', owner: 'x', name: 'r', fullName: 'x/r', defaultBranch: 'main', localPath });

test('artefacts and code stay true to each other, in small platform steps and big local ones', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'constitution-'));
  const bare = path.join(dir, 'remote.git');
  git(dir, 'init', '--bare', '-b', 'main', bare);
  const ours = path.join(dir, 'ours');
  git(dir, 'clone', '-q', bare, ours);
  const dataDir = path.join(dir, 'data');

  // 1. init: the rules and the pointers, never over what exists.
  write(ours, 'CLAUDE.md', '# já existia\n');
  const first = await cli.init(ours);
  assert.ok(first.written.includes('yourlab/GUIDE.md') && first.written.includes('AGENTS.md'));
  assert.equal(fs.readFileSync(path.join(ours, 'CLAUDE.md'), 'utf8'), '# já existia\n', 'an existing CLAUDE.md is not replaced');
  assert.match(first.notes.join(' '), /CLAUDE\.md exists/);
  assert.match(fs.readFileSync(path.join(ours, 'yourlab/GUIDE.md'), 'utf8'), /The constitution/);

  // 2. Code, and artefacts linked to it, in one commit.
  write(ours, 'src/coupons/index.js', "const db = require('../db');\nexports.use = () => db.mark();\n");
  write(ours, 'src/db/index.js', 'exports.mark = () => {};\n');
  write(ours, 'yourlab/diagrams/arquitectura.mmd', '%% title: Arquitectura\nflowchart LR\n  Coupons[Cupões] --> Base[(Base)]\n\n%% code: Coupons = src/coupons\n%% code: Base = src/db\n');
  write(ours, 'yourlab/workflows/validar.md', '# Validar um cupão\n- Código: src/coupons\n\n1. O parceiro lê o QR code.\n2. O cupão fica usado.\n');
  tick(); git(ours, 'add', '.'); git(ours, 'commit', '-q', '-m', 'início'); git(ours, 'push', '-q', 'origin', 'main');
  let report = await cli.check(ours);
  assert.deepEqual([report.stale, report.missing, report.undrawn], [[], [], []], 'starts clean');
  assert.equal(report.clean, true);

  // 3. A small change through the platform: one workflow, its linked code, one AI call.
  const workflowPath = 'yourlab/workflows/validar.md';
  const workflow = fs.readFileSync(path.join(ours, workflowPath), 'utf8');
  const scope = buildScope({ modulePaths: edit.codeLinksOf(workflowPath, workflow) });
  let sent = '';
  const run = packs.createPackRunner({
    dataDir,
    complete: async ({ prompt }) => {
      sent = prompt;
      if (/O artefacto e o código/.test(prompt)) {
        return { text: JSON.stringify({ files: [{ path: 'src/coupons/index.js', content: "const db = require('../db');\nexports.use = (at) => db.mark(at);\n" }, { path: 'src/db/index.js', content: 'fora' }], summary: 'Guarda a data.' }), costUsd: 0.001, model: 'm' };
      }
      return { text: JSON.stringify({ proposals: [{ path: workflowPath, why: 'a data é guardada', suggestion: 'Passo 2: o cupão fica usado, com data.' }, { path: 'yourlab/inventado.md', why: 'x', suggestion: 'y' }], summary: 's' }), costUsd: 0.001, model: 'm' };
    },
  });
  const proposal = await run('code_from_artefact', {
    projectId: 'p1', artefact: { path: workflowPath, content: workflow }, scope,
    codeFiles: [{ path: 'src/coupons/index.js', content: fs.readFileSync(path.join(ours, 'src/coupons/index.js'), 'utf8') }],
    input: { request: 'guardar a data de uso' },
  });
  assert.ok(sent.length < 32000, 'one artefact, its code: a small call');
  assert.deepEqual(proposal.result.files.map((f) => f.path), ['src/coupons/index.js'], 'only inside the linked folder');
  tick();
  const written = await io.writeFiles(dataDir, repoFor(ours), proposal.result.files, `código a partir de ${workflowPath}`);
  assert.deepEqual([written.git.committed, written.git.pushed], [true, true]);
  await registry.recordOutcome(dataDir, proposal.runId, 'accepted', 'p1');

  // 4. The code is now newer than what describes it: check says which artefacts.
  report = await cli.check(ours);
  assert.deepEqual(report.stale.map((s) => s.artefact).sort(), ['yourlab/diagrams/arquitectura.mmd', workflowPath]);
  assert.equal(report.clean, false);

  // 5. The AI cross-check back: proposals only for artefacts that exist.
  const snapshot = (await require('../lib/workspace-sync').syncWorkspace({ localPath: ours })).snapshot;
  const back = await run('sync_back', { projectId: 'p1', snapshot, input: { changes: [{ path: 'src/coupons/index.js', diff: '+ (at)' }] } });
  assert.deepEqual(back.result.proposals.map((p) => p.path), [workflowPath]);
  assert.equal(back.dropped, 1, 'the invented path is dropped');

  // 6. The artefacts are updated (the same edits the studio makes) — clean again.
  const flow = edit.parseWorkflow(workflow);
  flow.steps[1] = 'O cupão fica usado, com a data de uso.';
  const diagram = edit.renameNode(fs.readFileSync(path.join(ours, 'yourlab/diagrams/arquitectura.mmd'), 'utf8'), 'Coupons', 'Cupões (com data de uso)');
  tick();
  await io.writeFiles(dataDir, repoFor(ours), [{ path: workflowPath, content: edit.serializeWorkflow(flow) }, { path: 'yourlab/diagrams/arquitectura.mmd', content: diagram }], 'yourlab: data de uso');
  report = await cli.check(ours);
  assert.equal(report.clean, true, JSON.stringify(report.stale));

  // 7. A bigger change made locally elsewhere: a new module, pushed from another clone.
  const theirs = path.join(dir, 'theirs');
  git(dir, 'clone', '-q', bare, theirs);
  write(theirs, 'src/payments/mbway.js', "const db = require('../db');\nexports.pay = () => db.mark();\n");
  tick(); git(theirs, 'add', '.'); git(theirs, 'commit', '-q', '-m', 'pagamentos'); git(theirs, 'push', '-q');
  // The platform pulls on every read; the new folder is named as undrawn.
  const store = { projects: [{ id: 'p1', repository: repoFor(ours), requirements: [] }] };
  await io.syncProject({ dataDir, updateStore: async (fn) => fn(store), appendActivity: () => {} }, 'p1', repoFor(ours), 'u1');
  report = await cli.check(ours);
  assert.deepEqual(report.undrawn, ['src/payments']);

  // 8. Drawn, linked, committed — clean, and every AI run is on record with its version.
  const added = edit.addNode(diagram, 'Pagamentos', 'Coupons');
  tick();
  await io.writeFiles(dataDir, repoFor(ours), [{ path: 'yourlab/diagrams/arquitectura.mmd', content: edit.setLink(added.source, added.id, 'src/payments') }], 'yourlab: pagamentos no diagrama');
  report = await cli.check(ours);
  assert.equal(report.clean, true);
  assert.deepEqual(report.undrawn, []);
  const runs = (await registry.read(dataDir)).runs;
  assert.deepEqual(runs.map((r) => [r.packId, r.version, r.outcome]), [['code_from_artefact', 'base', 'accepted'], ['sync_back', 'base', '']]);

  delete process.env.GIT_COMMITTER_DATE;
  delete process.env.GIT_AUTHOR_DATE;
});
