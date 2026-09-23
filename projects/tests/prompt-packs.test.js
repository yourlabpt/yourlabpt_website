/**
 * Prompt packs: four blocks in a fixed order, a capped slice, a JSON answer checked
 * against the project before anyone sees it, and nothing applied.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packs = require('../lib/prompt-packs');
const format = require('../lib/workspace-format');

const SNAPSHOT = format.readWorkspace([
  { path: 'yourlab/project.md', content: '---\nname: City Pass\ntype: ideia\nstage: requirements\n---\n## Propósito\nCupões para restaurantes.\n' },
  { path: 'yourlab/phases/01-mvp.md', content: '---\ntitle: MVP\nweeks: 6\n---\n## Features\n### Conta\n- Requisitos: authentication\n' },
  { path: 'openspec/specs/authentication/spec.md', content: '## Requirements\n### Requirement: Iniciar sessão\n<!-- yourlab: type=functional -->\n\nO sistema SHALL abrir a sessão.\n' },
]);
const INPUT = { path: 'openspec/specs/authentication/spec.md', diff: '+ O sistema SHALL abrir a sessão com Google.' };
const DATA_DIR = path.join(__dirname, '..', 'data');

test('the request is the four blocks, in order: skill, slice, change, contract', () => {
  const text = packs.buildInstructions('impact', { snapshot: SNAPSHOT, input: INPUT });
  const skill = text.indexOf('Your only job');
  const slice = text.indexOf('yourlab/phases/01-mvp.md — fase 1: MVP');
  const change = text.indexOf('+ O sistema SHALL abrir a sessão com Google.');
  const contract = text.indexOf('Responda APENAS com este JSON');
  assert.ok(skill >= 0 && slice > skill && change > slice && contract > change, 'blocks out of order or missing');
  // Names and headings only — never a file's full text.
  assert.ok(text.includes('requisitos: Iniciar sessão'), 'slice should name requirements by title');
  assert.ok(!text.includes('O sistema SHALL abrir a sessão.'), 'slice should not carry a requirement\'s full text');
});

test('a slice over the cap is cut, and says so', () => {
  const huge = { ...SNAPSHOT, diagrams: Array.from({ length: 400 }, (_, i) => ({ file: `yourlab/diagrams/d${i}.mmd`, title: 'x'.repeat(40) })) };
  const text = packs.buildInstructions('impact', { snapshot: huge, input: INPUT });
  assert.match(text, /cortado em 8000 caracteres/);
});

test('the answer is read out of fences or prose, and garbage is refused', () => {
  assert.deepEqual(packs.parseAnswer('```json\n{"summary":"ok"}\n```'), { summary: 'ok' });
  assert.deepEqual(packs.parseAnswer('Aqui está: {"summary":"ok"} fim'), { summary: 'ok' });
  assert.equal(packs.parseAnswer('não sei'), null);
  assert.equal(packs.parseAnswer('{"summary": }'), null);
});

test('an invented path is dropped and counted; the edited file itself is not "affected"', () => {
  const { result, dropped } = packs.PACKS.impact.validate({
    artefacts: [
      { path: 'yourlab/phases/01-mvp.md', why: 'A feature Conta usa esta capacidade.' },
      { path: 'yourlab/phases/99-inventada.md', why: 'x' },
      { path: INPUT.path, why: 'o próprio ficheiro' },
    ],
    codeAreas: [{ area: 'Login', why: 'Novo método de entrada.' }, { why: 'sem área' }],
    summary: 'Muda a entrada.',
  }, { snapshot: SNAPSHOT, input: INPUT });
  assert.deepEqual(result.artefacts.map((entry) => entry.path), ['yourlab/phases/01-mvp.md']);
  assert.equal(dropped, 2);
  assert.deepEqual(result.codeAreas, [{ area: 'Login', why: 'Novo método de entrada.' }]);
});

test('the runner sends one single-pass job and returns the checked answer', async () => {
  let sent = null;
  const runtime = {
    createJob: async (job) => {
      sent = job;
      return { output: '{"artefacts":[{"path":"yourlab/phases/01-mvp.md","why":"usa auth"}],"codeAreas":[],"summary":"s"}', costUsed: 0.002 };
    },
  };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  const outcome = await run('impact', { snapshot: SNAPSHOT, input: INPUT });

  assert.equal(outcome.error, undefined);
  assert.deepEqual(outcome.result.artefacts, [{ path: 'yourlab/phases/01-mvp.md', why: 'usa auth' }]);
  assert.equal(sent.options.planningWaveSize, 1);
  assert.equal(sent.options.enableWebSearch, false);
  assert.match(sent.instructions, /Responda APENAS com este JSON/);
});

test('the runner refuses cleanly: no input, agents disabled, or an answer that is not JSON', async () => {
  const runtime = { createJob: async () => ({ output: 'desculpe' }) };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  assert.equal((await run('impact', { snapshot: SNAPSHOT, input: {} })).status, 400);
  assert.equal((await run('nada', { snapshot: SNAPSHOT, input: INPUT })).status, 404);
  assert.equal((await run('impact', { snapshot: SNAPSHOT, input: INPUT })).status, 502);
  const off = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'disabled' });
  assert.equal((await off('impact', { snapshot: SNAPSHOT, input: INPUT })).status, 503);
});

const TASK = {
  id: 'witem_big',
  title: 'Implementar compra de plano',
  descriptionMarkdown: 'Escolher plano, pagar com MB Way, gerar cupão.',
  acceptanceCriteriaMarkdown: '- Cupão aparece depois do pagamento',
  executorMode: 'both',
  deliveryStageId: 'unclassified',
};

test('split_task sends only the task, and asks for 2–6 ordered tasks', () => {
  const text = packs.buildInstructions('split_task', { task: TASK, input: { taskId: TASK.id } });
  assert.match(text, /A tarefa:\n\nTítulo: Implementar compra de plano/);
  assert.match(text, /Cupão aparece depois do pagamento/);
  assert.match(text, /Entre 2 e 6 tarefas/);
  assert.ok(!text.includes('O projecto (só nomes e títulos)'), 'a split needs no project outline');
});

test('split_task drops empty and repeated titles and keeps at most six', () => {
  const answer = {
    tasks: [
      { title: 'Escolher plano', goal: 'O cliente escolhe um plano.' },
      { title: 'escolher plano', goal: 'duplicado' },
      { title: '', goal: 'sem título' },
      ...Array.from({ length: 8 }, (_, i) => ({ title: `Passo ${i}`, goal: 'g' })),
    ],
    summary: 'Três partes.',
  };
  const { result, dropped } = packs.PACKS.split_task.validate(answer);
  assert.equal(result.tasks.length, 6);
  assert.equal(result.tasks[0].title, 'Escolher plano');
  assert.equal(dropped, answer.tasks.length - 6);
});

test('the children a split creates sit under the task, in order, each after the one before', () => {
  let n = 0;
  const drafts = packs.splitDrafts(TASK, [{ title: 'A', goal: 'ga' }, { title: 'B', goal: 'gb' }, { title: 'C', goal: 'gc' }], {
    now: '2026-09-23T10:00:00.000Z', actorUserId: 'u', newId: () => `c${++n}`,
  });
  assert.deepEqual(drafts.map((d) => [d.id, d.parentTaskId, d.dependencyTaskIds]), [
    ['c1', 'witem_big', []], ['c2', 'witem_big', ['c1']], ['c3', 'witem_big', ['c2']],
  ]);
  assert.match(drafts[1].descriptionMarkdown, /Parte 2 de 3 de «Implementar compra de plano»/);

  // They pass the platform's own hierarchy and dependency checks.
  const workItems = require('../lib/work-items');
  const project = { id: 'p', requirements: [] };
  const records = drafts.map((d) => workItems.normalizeWorkItem(d, { project, actorUserId: 'u', nowIso: () => d.createdAt }));
  const all = [...records, workItems.normalizeWorkItem(TASK, { project, actorUserId: 'u', nowIso: () => 'T' })];
  for (const record of records) {
    workItems.validateHierarchy(record, all);
    workItems.validateDependencies(record, all);
  }
});

test('the runner splits with no repository read, and impact still asks for one', async () => {
  const runtime = { createJob: async () => ({ output: '{"tasks":[{"title":"A","goal":"a"},{"title":"B","goal":"b"}],"summary":"ok"}' }) };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  const split = await run('split_task', { snapshot: null, task: TASK, input: { taskId: TASK.id } });
  assert.deepEqual(split.result.tasks.map((t) => t.title), ['A', 'B']);
  assert.equal((await run('split_task', { snapshot: null, task: null, input: {} })).status, 400);
  const impact = await run('impact', { snapshot: null, input: INPUT });
  assert.equal(impact.status, 400);
  assert.match(impact.error, /ainda não foi lido/);
});

test('artefacts_from_code turns an answer into a spec.md that reads back with its types', () => {
  const { result, dropped } = packs.PACKS.artefacts_from_code.validate({
    capability: 'Cupões',
    summary: 'Gera e valida cupões.',
    requirements: [
      { title: 'Gerar cupão', type: 'functional', shall: 'O sistema SHALL gerar um cupão após o pagamento.', scenarios: [{ title: 'Pago', when: 'o pagamento é confirmado', then: 'o cupão fica activo' }] },
      { title: 'Limite de pessoas', type: 'non_functional', shall: 'O sistema SHALL aceitar no máximo 6 pessoas por cupão.' },
      { title: 'Estranho', type: 'inventado', shall: 'O sistema SHALL fazer x.' },
      { title: '', type: 'functional', shall: 'sem título' },
    ],
  }, { input: { area: 'src/coupons' } });

  assert.equal(result.path, 'openspec/specs/cupoes/spec.md');
  assert.equal(dropped, 1);
  const snapshot = format.readWorkspace([{ path: result.path, content: result.spec }]);
  const read = snapshot.requirements[0].requirements;
  assert.deepEqual(read.map((r) => [r.title, r.type, r.module]), [
    ['Gerar cupão', 'functional', 'src/coupons'],
    ['Limite de pessoas', 'non_functional', 'src/coupons'],
    ['Estranho', 'undefined', 'src/coupons'],
  ]);
  assert.equal(read[0].scenarios[0].then, 'o cupão fica activo');
  // Every requirement declares its type, so none is reported as untyped.
  assert.ok(!snapshot.findings.some((f) => /não diz o tipo/.test(f.message)));
  assert.match(result.spec, /Gerado do código em src\/coupons, por rever/);
});

test('artefacts_from_code sends the code as its slice, and refuses an area with no code', async () => {
  const code = [{ path: 'src/coupons/generate.js', content: 'function generate() { return uuid(); }' }];
  const text = packs.buildInstructions('artefacts_from_code', { code, input: { area: 'src/coupons' } });
  assert.match(text, /O código desta parte:\n\n### src\/coupons\/generate\.js/);
  assert.match(text, /Parte do código: src\/coupons/);

  const runtime = { createJob: async () => ({ output: '{"capability":"x","requirements":[]}' }) };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  assert.equal((await run('artefacts_from_code', { code: [], input: { area: 'src/vazio' } })).status, 400);
  assert.equal((await run('artefacts_from_code', { code, input: {} })).status, 400);
});

const SPEC_SNAPSHOT = format.readWorkspace([
  { path: 'yourlab/project.md', content: '---\nname: City Pass\ntype: ideia\nstage: requirements\n---\n## Propósito\nCupões.\n' },
  {
    path: 'openspec/specs/cupoes/spec.md',
    content: [
      '## Requirements',
      '### Requirement: Gerar cupão',
      '<!-- yourlab: id=FR-07; type=functional -->',
      '',
      'O sistema SHALL gerar um cupão após o pagamento.',
      '',
      '#### Scenario: Pagamento confirmado',
      '- **WHEN** o pagamento é confirmado',
      '- **THEN** o cupão fica activo',
      '',
    ].join('\n'),
  },
]);

test('tests_from_artefacts sends the requirements and scenarios, the framework and the existing tests', () => {
  const text = packs.buildInstructions('tests_from_artefacts', {
    snapshot: SPEC_SNAPSHOT,
    input: { capability: 'cupoes' },
    framework: 'jest',
    existingTests: ['tests/login.test.js'],
  });
  assert.match(text, /Os requisitos a testar:/);
  assert.match(text, /\[FR-07\] Gerar cupão \(functional\): O sistema SHALL gerar um cupão após o pagamento\./);
  assert.match(text, /Cenário «Pagamento confirmado»: QUANDO o pagamento é confirmado ENTÃO o cupão fica activo/);
  assert.match(text, /Framework de testes: jest/);
  assert.match(text, /Testes que já existem: tests\/login\.test\.js/);
});

test('only test-shaped files survive, capped at three', () => {
  const { result, dropped } = packs.PACKS.tests_from_artefacts.validate({
    files: [
      { path: 'tests/cupoes.test.js', content: 'test("gera", () => {})' },
      { path: 'src/cupoes.js', content: 'module.exports = {}' },
      { path: '../escapa.test.js', content: 'x' },
      { path: 'tests/vazio.test.js', content: '   ' },
      { path: 'tests/cupoes.test.js', content: 'duplicado' },
      { path: 'tests/b.test.js', content: 'b' },
      { path: 'tests/c.test.js', content: 'c' },
      { path: 'tests/d.test.js', content: 'd' },
    ],
    covers: [{ requirement: 'Gerar cupão', scenario: 'Pagamento confirmado' }],
  });
  assert.deepEqual(result.files.map((file) => file.path), ['tests/cupoes.test.js', 'tests/b.test.js', 'tests/c.test.js']);
  assert.equal(dropped, 5);
  assert.equal(result.covers.length, 1);
});

test('the test framework comes from package.json, and a capability with no requirements is refused', async () => {
  assert.equal(packs.detectTestFramework({ packageJson: { dependencies: ['express', 'vitest'] } }), 'vitest');
  assert.equal(packs.detectTestFramework({ packageJson: { dependencies: ['express'] } }), '');
  assert.equal(packs.detectTestFramework(null), '');

  const runtime = { createJob: async () => ({ output: '{"files":[]}' }) };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  assert.equal((await run('tests_from_artefacts', { snapshot: SPEC_SNAPSHOT, input: { capability: 'nada' } })).status, 400);
  assert.equal((await run('tests_from_artefacts', { snapshot: null, input: { capability: 'cupoes' } })).status, 400);
});

const TEST_SOURCE = [
  "const { gerar } = require('../src/coupons/generate');",
  "import { validar } from '../src/coupons/validate.js';",
  "const pkg = require('../package.json');",
  "const helpers = require('./helpers.test.js');",
  "const express = require('express');",
].join('\n');

test('the code a test imports is found by relative path, even before it exists', () => {
  const targets = packs.importTargets('tests/cupoes.test.js', TEST_SOURCE);
  assert.deepEqual(targets, ['src/coupons/generate.js', 'src/coupons/validate.js']);
  assert.deepEqual(packs.codeScopeFor(targets).prefixes, ['src/coupons']);
  // No relative import: nowhere to write.
  assert.equal(packs.codeScopeFor(packs.importTargets('tests/a.test.js', "require('express')")).unrestricted, true);
});

test('code_from_tests keeps only code inside the tests\' area — never tests, config or lockfiles', () => {
  const scope = packs.codeScopeFor(['src/coupons/generate.js']);
  const { result, dropped } = packs.PACKS.code_from_tests.validate({
    files: [
      { path: 'src/coupons/generate.js', content: 'module.exports.gerar = () => "C-1";' },
      { path: 'src/coupons/helpers/format.js', content: 'module.exports = (x) => x;' },
      { path: 'src/payments/pay.js', content: 'fora da área' },
      { path: 'tests/cupoes.test.js', content: 'test mudado para passar' },
      { path: 'src/coupons/package.json', content: '{}' },
      { path: '../escapa.js', content: 'x' },
      { path: 'src/coupons/empty.js', content: '  ' },
    ],
    summary: 'Gera o código do cupão.',
  }, { scope });
  assert.deepEqual(result.files.map((f) => f.path), ['src/coupons/generate.js', 'src/coupons/helpers/format.js']);
  assert.equal(dropped, 5);
});

test('code_from_tests shows the tests and the code they import, and fails closed without a scope', async () => {
  const scope = packs.codeScopeFor(['src/coupons/generate.js']);
  const text = packs.buildInstructions('code_from_tests', {
    testFiles: [{ path: 'tests/cupoes.test.js', content: TEST_SOURCE }],
    codeFiles: [{ path: 'src/coupons/generate.js', content: '' }],
    scope,
    input: { failure: 'TypeError: gerar is not a function' },
  });
  assert.match(text, /Pode escrever em: src\/coupons/);
  assert.match(text, /### tests\/cupoes\.test\.js \(teste — não alterar\)/);
  assert.match(text, /### src\/coupons\/generate\.js \(ainda não existe\)/);
  assert.match(text, /TypeError: gerar is not a function/);

  const runtime = { createJob: async () => ({ output: '{"files":[]}' }) };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  assert.equal((await run('code_from_tests', { testFiles: [], scope, input: {} })).status, 400);
  const unscoped = await run('code_from_tests', { testFiles: [{ path: 'tests/a.test.js', content: 'x' }], scope: packs.codeScopeFor([]), input: {} });
  assert.equal(unscoped.status, 400);
  assert.match(unscoped.error, /não importam código/);
});

test('sync_back sends the outline and the code change, and asks for proposals only', () => {
  const text = packs.buildInstructions('sync_back', {
    snapshot: SPEC_SNAPSHOT,
    input: { changes: [{ path: 'src/coupons/generate.js', diff: '+ module.exports.gerar = () => "C-" + Date.now();' }] },
  });
  assert.match(text, /openspec\/specs\/cupoes\/spec\.md — requisitos: Gerar cupão/);
  assert.match(text, /### src\/coupons\/generate\.js\n\+ module\.exports\.gerar/);
  assert.match(text, /Lista vazia se os artefactos continuam certos/);
});

test('sync_back keeps one real proposal per existing artefact, never the guide or an invented file', () => {
  const snapshot = { ...SPEC_SNAPSHOT, files: [...SPEC_SNAPSHOT.files, { path: 'yourlab/GUIDE.md' }] };
  const { result, dropped } = packs.PACKS.sync_back.validate({
    proposals: [
      { path: 'openspec/specs/cupoes/spec.md', why: 'O código agora gera códigos com data.', suggestion: 'Acrescentar que o código do cupão inclui a data.' },
      { path: 'openspec/specs/cupoes/spec.md', why: 'repetido', suggestion: 'outra' },
      { path: 'yourlab/GUIDE.md', why: 'x', suggestion: 'mudar o guia' },
      { path: 'yourlab/phases/99-nada.md', why: 'x', suggestion: 'inventado' },
      { path: 'yourlab/project.md', why: 'x', suggestion: '' },
    ],
  }, { snapshot });
  assert.deepEqual(result.proposals.map((p) => p.path), ['openspec/specs/cupoes/spec.md']);
  assert.equal(dropped, 4);
});

test('sync_back refuses without a read repository or without a code change', async () => {
  const runtime = { createJob: async () => ({ output: '{"proposals":[]}' }) };
  const run = packs.createPackRunner({ dataDir: DATA_DIR, runtime, agentConnectionMode: 'local' });
  assert.equal((await run('sync_back', { snapshot: SPEC_SNAPSHOT, input: { changes: [] } })).status, 400);
  assert.equal((await run('sync_back', { snapshot: null, input: { changes: [{ path: 'a.js', diff: '+x' }] } })).status, 400);
  const ok = await run('sync_back', { snapshot: SPEC_SNAPSHOT, input: { changes: [{ path: 'a.js', diff: '+x' }] } });
  assert.deepEqual(ok.result.proposals, []);
});
