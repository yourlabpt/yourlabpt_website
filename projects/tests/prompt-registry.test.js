const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('../lib/prompt-registry');
const packs = require('../lib/prompt-packs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-registry-'));

test('the method is versioned: base first, a saved edit becomes active, any version can come back', async () => {
  const dir = tmp();
  assert.deepEqual(await registry.activeMethod(dir, 'impact', 'BASE'), { version: 'base', body: 'BASE' });
  const v1 = await registry.saveVersion(dir, 'impact', { body: 'Um método melhor, com uma regra nova.', note: 'mais curto' }, 'u1');
  assert.equal(v1, 'v1');
  assert.equal((await registry.activeMethod(dir, 'impact', 'BASE')).body, 'Um método melhor, com uma regra nova.');
  await registry.activate(dir, 'impact', 'base');
  assert.equal((await registry.activeMethod(dir, 'impact', 'BASE')).version, 'base');
  await assert.rejects(registry.activate(dir, 'impact', 'v9'), /desconhecida/);
  await assert.rejects(registry.saveVersion(dir, 'impact', { body: 'curto' }), /frase completa/);
});

test('every run is recorded against its version, and outcomes add up per version', async () => {
  const dir = tmp();
  const a = await registry.recordRun(dir, { packId: 'impact', version: 'base', projectId: 'p1', costUsd: 0.002 });
  const b = await registry.recordRun(dir, { packId: 'impact', version: 'base', projectId: 'p1', costUsd: 0.004 });
  await registry.recordRun(dir, { packId: 'impact', version: 'base', projectId: 'p1', ok: false });
  await registry.recordOutcome(dir, a, 'accepted', 'p1');
  await registry.recordOutcome(dir, b, 'discarded', 'p1');
  assert.equal(await registry.recordOutcome(dir, a, 'discarded', 'p1'), 'accepted', 'a run is decided once');
  await assert.rejects(registry.recordOutcome(dir, a, 'accepted', 'other'), /desconhecida/, 'another project cannot decide it');
  const stats = registry.statsFor(await registry.read(dir), 'impact').base;
  assert.deepEqual([stats.runs, stats.failed, stats.accepted, stats.discarded, stats.acceptRate], [3, 1, 1, 1, 0.5]);
  assert.equal(stats.avgCostUsd, 0.002);
});

test('the runner sends the active version and says which one it used', async () => {
  const dir = tmp();
  await registry.saveVersion(dir, 'split_task', { body: 'MÉTODO V1: divida em passos que se testam sozinhos.' });
  let sent = '';
  const run = packs.createPackRunner({ dataDir: dir, complete: async ({ prompt }) => { sent = prompt; return { text: '{"tasks":[{"title":"A"},{"title":"B"}]}', costUsd: 0.001, model: 'm' }; } });
  const outcome = await run('split_task', { projectId: 'p1', task: { title: 'Grande' }, input: {} });
  assert.match(sent, /^MÉTODO V1/);
  assert.equal(outcome.promptVersion, 'v1');
  assert.equal(outcome.prompt, sent);
  assert.match(outcome.runId, /^run_/);
  const [run1] = (await registry.read(dir)).runs;
  assert.deepEqual([run1.packId, run1.version, run1.projectId], ['split_task', 'v1', 'p1']);
});

test('every pack says, in words, what its cut and its change carry', () => {
  for (const [id, pack] of Object.entries(packs.PACKS)) {
    assert.ok(pack.describe?.slice && pack.describe?.change, id);
    assert.ok(pack.contract.includes('JSON'), id);
  }
});
