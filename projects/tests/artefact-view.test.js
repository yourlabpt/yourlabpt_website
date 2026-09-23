const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../lib/workspace-format');
const packs = require('../lib/prompt-packs');

test('pieceOf gives the viewer the same reading a sync would, for one file', () => {
  const project = format.pieceOf('yourlab/project.md', '---\nname: Cupões\nclient: Impakta\ntype: ideia\nstage: requirements\n---\n\n## Propósito\nCupões.\n\n## Riscos\n- MB Way\n');
  assert.equal(project.kind, 'project');
  assert.equal(project.piece.purpose, 'Cupões.');
  assert.deepEqual(project.piece.risks, ['MB Way']);
  assert.deepEqual(project.findings, []);

  const broken = format.pieceOf('yourlab/project.md', 'sem formato');
  assert.ok(broken.findings.some((finding) => finding.level === 'error'));

  const phase = '---\ntitle: MVP\nweeks: 4\nstatus: em curso\n---\n\n## Features\n\n### Login\n- Requisitos: auth\n';
  assert.equal(format.pieceOf('yourlab/phases/01-mvp.md', phase).findings.length, 1, 'alone, the link looks broken');
  const linked = format.pieceOf('yourlab/phases/01-mvp.md', phase, { capabilities: ['auth'] });
  assert.equal(linked.findings.length, 0, 'with the project’s capabilities it is not');
  assert.equal(linked.piece.status, 'in_progress');

  assert.equal(format.pieceOf('yourlab/mockup/index.html', '<title>A</title>').piece.html, '<title>A</title>');
  assert.equal(format.pieceOf('yourlab/GUIDE.md', 'x').kind, '');
  assert.equal(format.pieceOf('yourlab/project.md', `<!-- ${format.GENERATED_MARK} -->`).generated, true);
});

test('a feature without Requisitos has no capability (not a default one)', () => {
  const { piece } = format.pieceOf('yourlab/phases/01-a.md', '---\ntitle: A\n---\n\n## Features\n\n### Só texto\nNada ligado.\n');
  assert.deepEqual(piece.features[0].requirements, []);
});

test('every template reads back with no errors, and never overwrites a file', () => {
  const paths = ['yourlab/phases/01-mvp.md', 'yourlab/phases/03-x.md', 'yourlab/diagrams/modulos.mmd'];
  const phase = format.templateFor('phase', 'Mapa e roteiros', paths);
  assert.equal(phase.path, 'yourlab/phases/04-mapa-e-roteiros.md');
  for (const kind of ['phase', 'diagram', 'workflow', 'mockup', 'spec', 'ideas', 'questions', 'database']) {
    const template = format.templateFor(kind, 'Pagamento MB Way', paths);
    const view = format.pieceOf(template.path, template.content);
    assert.equal(view.findings.filter((finding) => finding.level === 'error').length, 0, kind);
    assert.ok(view.piece, kind);
  }
  assert.throws(() => format.templateFor('diagram', 'Módulos', paths), /já existe/);
  assert.throws(() => format.templateFor('project', 'x', paths), /não se cria/);
  assert.throws(() => format.templateFor('phase', '  ', paths), /nome/);
});

test('questions keep their notes when the file is rewritten', () => {
  const text = '## Quantas pessoas?\n- Para: cliente\n- Estado: aberta\nPerguntar ao gerente.\n';
  const { piece } = format.pieceOf('yourlab/questions.md', text);
  const again = format.pieceOf('yourlab/questions.md', format.serializeQuestions(piece));
  assert.equal(again.piece[0].notes, 'Perguntar ao gerente.');
});

test('edit_artefact returns the same file only, checked, and never another path', async () => {
  const reply = (content) => packs.createPackRunner({ dataDir: '/tmp', complete: async () => ({ text: JSON.stringify({ content, summary: 'mudou' }) }) });
  const input = { path: 'yourlab/workflows/login.md', request: 'acrescenta um passo final' };
  const ok = await reply('# Entrar\n1. Email.\n2. Entra.')('edit_artefact', { input, current: '# Entrar\n1. Email.' });
  assert.equal(ok.result.file.path, 'yourlab/workflows/login.md');
  assert.equal(ok.dropped, 0);
  const empty = await reply('  ')('edit_artefact', { input, current: '' });
  assert.equal(empty.result.file, null);
  assert.equal((await reply('x')('edit_artefact', { input: { path: 'README.md', request: 'x y z' } })).status, 400);
  assert.equal((await reply('x')('edit_artefact', { input: { path: input.path, request: '' } })).status, 400);
});

test('every AI request leaves a performed task, or a note on the task it was made for', async () => {
  const { recordAiRun } = require('../lib/ai-runs');
  const workItems = require('../lib/work-items');
  const store = { projects: [{ id: 'p1', workItems: [] }] };
  const deps = { updateStore: async (fn) => fn(store), appendActivity: () => {} };
  const outcome = { costUsd: 0.0012, model: 'deepseek-ai/DeepSeek-V3', result: { summary: 'Um risco novo.' } };

  const id = await recordAiRun(deps, 'p1', 'u1', { title: 'Editar artefacto', request: 'acrescenta RGPD', target: 'yourlab/project.md', outcome });
  const [task] = workItems.getWorkItems(store.projects[0]);
  assert.equal(task.id, id);
  assert.equal(task.status, 'completed', 'performed, so it never waits in Hoje');
  assert.equal(task.title, 'IA: Editar artefacto — project.md');
  assert.match(task.descriptionMarkdown, /acrescenta RGPD[\s\S]*DeepSeek-V3 · custo: \$0\.0012[\s\S]*Um risco novo/);

  await recordAiRun(deps, 'p1', 'u1', { title: 'Dividir tarefa', outcome, taskId: id });
  const list = workItems.getWorkItems(store.projects[0]);
  assert.equal(list.length, 1, 'no second task');
  assert.equal(list[0].updates.length, 1);
});
