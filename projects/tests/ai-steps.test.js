const test = require('node:test');
const assert = require('node:assert/strict');
const aiSteps = require('../lib/ai-steps');
const packs = require('../lib/prompt-packs');

const SURVEY = {
  docs: ['README.md', 'docs/setup.md'],
  manifests: ['package.json'],
  modules: [{ name: 'src/auth', files: 4 }, { name: 'src/coupons', files: 6 }],
  schema: ['prisma/schema.prisma'],
  routes: ['GET /coupons', 'POST /login'],
};

test('steps come from the survey, in order: purpose, one per module, then what hangs off them, fases last', () => {
  const steps = aiSteps.planSteps(SURVEY);
  assert.deepEqual(steps.map((step) => step.key), ['project', 'spec:src/auth', 'spec:src/coupons', 'database', 'workflows', 'diagram', 'phases']);
  assert.deepEqual(steps[0].sources, ['README.md', 'package.json']);
  assert.equal(steps[1].target, 'openspec/specs/auth/spec.md');
  assert.match(steps.find((step) => step.key === 'workflows').facts, /POST \/login/);
  assert.deepEqual(aiSteps.planSteps(null), []);
  // No schema and no routes: those steps are not invented.
  assert.deepEqual(aiSteps.planSteps({ modules: [] }).map((step) => step.key), ['project', 'diagram', 'phases']);
});

test('each step carries only its own part of GUIDE.md', () => {
  const section = aiSteps.guideSection('workflow');
  assert.match(section, /^## workflows\/name\.md/);
  assert.doesNotMatch(section, /## mockup/);
  assert.match(aiSteps.guideSection('project'), /## Propósito/);
});

test('a reply may only write files of its step kind, and the reader’s complaints travel with it', () => {
  const step = aiSteps.planSteps(SURVEY).find((entry) => entry.key === 'workflows');
  const files = aiSteps.checkFiles(step, [
    { path: 'yourlab/workflows/login.md', content: '# Entrar\n1. A pessoa escreve o email.' },
    { path: 'yourlab/project.md', content: 'não é deste passo' },
    { path: '../etc/passwd', content: 'x' },
    { path: 'yourlab/workflows/vazio.md', content: '   ' },
  ]);
  assert.deepEqual(files.map((file) => file.path), ['yourlab/workflows/login.md']);
  const project = aiSteps.checkFiles(aiSteps.planSteps(SURVEY)[0], [{ path: 'yourlab/project.md', content: 'sem formato' }]);
  assert.ok(project[0].findings.some((line) => /Propósito/.test(line)));
});

test('artefact_from_code sends the step, its guide section and the current file, and answers with checked files', async () => {
  const step = aiSteps.planSteps(SURVEY).find((entry) => entry.key === 'diagram');
  let prompt = '';
  const run = packs.createPackRunner({
    dataDir: '/tmp',
    complete: async (call) => {
      prompt = call.prompt;
      return { text: JSON.stringify({ files: [{ path: 'yourlab/diagrams/arquitectura.mmd', content: 'flowchart LR\n  A --> B' }, { path: 'yourlab/database.md', content: 'x' }], summary: 's' }) };
    },
  });
  const outcome = await run('artefact_from_code', { step, sources: '### package.json\n{}', current: 'flowchart LR\n  Old', snapshot: null, input: {} });
  assert.equal(outcome.error, undefined);
  assert.deepEqual(outcome.result.files.map((file) => file.path), ['yourlab/diagrams/arquitectura.mmd']);
  assert.equal(outcome.dropped, 1);
  assert.match(prompt, /## diagrams\/name\.mmd/);
  assert.match(prompt, /src\/coupons — 6/);
  assert.match(prompt, /Versão actual/);
  assert.equal((await run('artefact_from_code', { step: null, input: {} })).status, 400);
});
