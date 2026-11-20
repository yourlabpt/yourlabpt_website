const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/artefact-edit');
const codeMap = require('../lib/code-map');
const prompts = require('../lib/prompt-packs');
// Runs are recorded in the prompt registry: never in the real data folder.
const RUN_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'packs-test-'));

const SRC = [
  '%% title: Arquitectura',
  'flowchart LR',
  '  %% um comentário que fica',
  '  App[App do turista] --> API',
  '  API -->|paga| MBWay[MB Way]',
  '  A -- texto --> B --> C',
  '  style App fill:#eee',
  '',
].join('\n');

test('a flowchart is read as nodes, edges and code links; other diagrams are not editable', () => {
  const parsed = E.parseFlowchart(`${SRC}%% code: API = src/api\n`);
  assert.equal(parsed.editable, true);
  assert.equal(parsed.direction, 'LR');
  assert.deepEqual(parsed.nodes.map((n) => n.id), ['App', 'API', 'MBWay', 'A', 'B', 'C']);
  assert.equal(parsed.nodes[0].label, 'App do turista');
  assert.deepEqual(parsed.edges.map((e) => `${e.from}>${e.to}:${e.label}`), ['App>API:', 'API>MBWay:paga', 'A>B:texto', 'B>C:']);
  assert.deepEqual(parsed.links, { API: 'src/api' });
  assert.equal(E.parseFlowchart('sequenceDiagram\n  A->>B: oi\n').editable, false);
});

test('each edit touches only its lines: comments and styles stay', () => {
  let s = E.renameNode(SRC, 'App', 'App (turista)');
  assert.match(s, /App\["App \(turista\)"\] --> API/);
  assert.match(s, /%% um comentário que fica/);
  s = E.renameNode(s, 'API', 'Servidor');
  assert.equal(E.parseFlowchart(s).nodes.find((n) => n.id === 'API').label, 'Servidor', 'a node with no shape gets a definition');
  const added = E.addNode(s, 'Notificações', 'API');
  assert.equal(added.id, 'Notificacoes');
  assert.ok(E.parseFlowchart(added.source).edges.some((e) => e.from === 'API' && e.to === 'Notificacoes'));
  s = E.addEdge(added.source, 'Notificacoes', 'App', 'avisa');
  assert.ok(E.parseFlowchart(s).edges.some((e) => e.from === 'Notificacoes' && e.to === 'App' && e.label === 'avisa'));
  s = E.removeEdge(s, 'B', 'C');
  assert.ok(E.parseFlowchart(s).nodes.some((n) => n.id === 'C'), 'removing an edge keeps its nodes');
  s = E.removeNode(E.setLink(s, 'App', 'src/app'), 'App');
  const after = E.parseFlowchart(s);
  assert.equal(after.nodes.some((n) => n.id === 'App'), false);
  assert.equal(after.links.App, undefined, 'its code link goes with it');
  assert.doesNotMatch(s, /style App/);
  assert.match(E.setDirection(s, 'TD'), /^flowchart TD$/m);
});

test('a workflow edits as steps and keeps its prose and code links', () => {
  const parsed = E.parseWorkflow('# Entrar\n- Código: src/auth, src/routes\nAntes.\n1. Um.\n2. Dois.\nDepois.\n');
  assert.deepEqual(parsed.code, ['src/auth', 'src/routes']);
  const text = E.serializeWorkflow({ ...parsed, steps: ['Dois.', 'Um.', 'Três.'] });
  assert.equal(text, '# Entrar\n- Código: src/auth, src/routes\n\nAntes.\n\n1. Dois.\n2. Um.\n3. Três.\n\nDepois.\n');
  assert.deepEqual(E.codeLinksOf('yourlab/workflows/x.md', text), ['src/auth', 'src/routes']);
  assert.deepEqual(E.codeLinksOf('yourlab/diagrams/x.mmd', 'flowchart LR\n  A --> B\n%% code: A = src/a\n%% code: B = src/b\n', 'B'), ['src/b']);
});

test('the code map follows imports between modules, for JS and Python', () => {
  const files = [
    { path: 'src/api/index.js', content: "import { login } from '../auth/login.js';\nconst db = require('../db');\nimport express from 'express';" },
    { path: 'src/auth/login.js', content: "export * from '../db/users';" },
    { path: 'src/db/index.js', content: '' },
    { path: 'app/models/user.py', content: 'from ..services import mail\nimport app.services.sms\n' },
    { path: 'app/services/mail.py', content: '' },
  ];
  const graph = codeMap.graphFromFiles(files, ['src/api', 'src/auth', 'src/db', 'app/models', 'app/services']);
  const arrows = graph.edges.map((e) => `${e.from}>${e.to}`).sort();
  assert.deepEqual(arrows, ['app/models>app/services', 'src/api>src/auth', 'src/api>src/db', 'src/auth>src/db']);
  const mermaid = codeMap.toMermaid(graph);
  const parsed = E.parseFlowchart(mermaid);
  assert.equal(parsed.links.src_api, 'src/api', 'the generated diagram is already linked to its folders');
  const cmp = codeMap.compare(E.parseFlowchart('flowchart LR\n  Api --> Auth\n  Velho\n%% code: Api = src/api\n%% code: Velho = src/apagado\n'), { modules: graph.modules });
  assert.deepEqual(cmp.nodes.map((n) => `${n.id}:${n.state}`), ['Api:linked', 'Auth:unlinked', 'Velho:missing']);
  assert.equal(cmp.nodes[1].suggestion, 'src/auth', 'a node named like a module is suggested');
  assert.ok(cmp.undrawn.includes('src/db'));
});

test('code_from_artefact writes only inside the linked folders and needs a link to run', async () => {
  const run = prompts.createPackRunner({ dataDir: RUN_DIR, complete: async () => ({ text: JSON.stringify({ files: [{ path: 'src/api/index.js', content: 'ok' }, { path: 'src/db/x.js', content: 'no' }, { path: 'src/api/x.test.js', content: 'no' }], summary: 's' }) }) });
  const scope = { prefixes: ['src/api'], unrestricted: false };
  const outcome = await run('code_from_artefact', { artefact: { path: 'yourlab/diagrams/a.mmd', content: 'flowchart LR\n  API' }, scope, codeFiles: [], input: { request: 'acrescenta um endpoint', nodeId: 'API' } });
  assert.deepEqual(outcome.result.files.map((f) => f.path), ['src/api/index.js']);
  const unlinked = await run('code_from_artefact', { artefact: { path: 'x.mmd', content: 'x' }, scope: { prefixes: [], unrestricted: true }, input: { request: 'x' } });
  assert.equal(unlinked.status, 400);
});
