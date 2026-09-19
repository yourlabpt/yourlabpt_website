/**
 * The yourlab/ folder reader: the same files always give the same snapshot, what can be
 * read is read, and what cannot is named with its file and line.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const format = require('../lib/workspace-format');
const sync = require('../lib/workspace-sync');

const FILES = [
  {
    path: 'yourlab/project.md',
    content: `---
name: City Pass
client: Impakta
type: ideia
stage: requirements
---

## Propósito
App de cupões de desconto para restaurantes em Lisboa.

## Contexto
A Impakta já vende passes em papel.

## Riscos
- Parceiros não validarem cupões a tempo.

## Assunções
- Os restaurantes têm smartphone.
`,
  },
  {
    path: 'yourlab/questions.md',
    content: `## Quantas pessoas por cupão?
- Para: cliente
- Estado: respondida
- Resposta: Até 6.

## Aceitamos MB Way?
- Para: cliente
- Estado: aberta
`,
  },
  {
    path: 'yourlab/ideas.md',
    content: `## Roteiros temáticos
- Estado: a explorar
Roteiros por bairro.
`,
  },
  {
    path: 'yourlab/phases/02-mapa.md',
    content: `---
title: Mapa e roteiros
weeks: 4
status: planeada
---

## Objetivo
Encontrar restaurantes no mapa.
`,
  },
  {
    path: 'yourlab/phases/01-mvp.md',
    content: `---
title: MVP
weeks: 6
status: em curso
---

## Objetivo
Comprar um plano e usar o cupão.

## Features

### Conta e login
- Requisitos: authentication
Criar conta e entrar.

### Compra de plano
- Requisitos: payments

## Entregáveis
- App do cliente
`,
  },
  { path: 'yourlab/diagrams/arquitectura.mmd', content: '%% title: Arquitectura\nflowchart LR\n  App --> API\n' },
  {
    path: 'yourlab/database.md',
    content: `## Entidade: Cupão
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| codigo | texto | único |
`,
  },
  { path: 'yourlab/workflows/validar-cupao.md', content: '# Validar um cupão\n1. Ler o QR.\n2. Marcar como usado.\n' },
  { path: 'yourlab/mockup/lista.html', content: '<title>Lista</title><p>lista</p>' },
  { path: 'yourlab/mockup/index.html', content: '<title>Início</title><a href="lista.html">ver</a>' },
  {
    path: 'openspec/specs/authentication/spec.md',
    content: `## Requirements
### Requirement: Iniciar sessão
The system SHALL let a client sign in.

#### Scenario: Password certa
- **WHEN** the client submits a correct password
- **THEN** the client sees their coupons
`,
  },
  { path: 'README.md', content: 'not ours' },
];

test('reads every kind of file into one snapshot', () => {
  const snapshot = format.readWorkspace(FILES);
  assert.equal(snapshot.initialized, true);
  assert.deepEqual(
    { name: snapshot.project.name, client: snapshot.project.client, type: snapshot.project.type, stage: snapshot.project.stage },
    { name: 'City Pass', client: 'Impakta', type: 'ideia', stage: 'requirements' },
  );
  assert.match(snapshot.project.purpose, /cupões/);
  assert.deepEqual(snapshot.project.risks, ['Parceiros não validarem cupões a tempo.']);
  assert.deepEqual(snapshot.questions.map((q) => [q.state, q.audience, q.answer]), [['answered', 'client', 'Até 6.'], ['open', 'client', '']]);
  assert.equal(snapshot.ideas[0].state, 'exploring');
  assert.deepEqual(snapshot.phases.map((p) => [p.number, p.title, p.weeks, p.status]), [[1, 'MVP', 6, 'in_progress'], [2, 'Mapa e roteiros', 4, 'planned']]);
  assert.deepEqual(snapshot.phases[0].features.map((f) => [f.title, f.requirements]), [['Conta e login', ['authentication']], ['Compra de plano', ['payments']]]);
  assert.deepEqual(snapshot.phases[0].deliverables, ['App do cliente']);
  assert.equal(snapshot.diagrams[0].title, 'Arquitectura');
  assert.deepEqual(snapshot.database.entities[0].fields.map((f) => f.name), ['id', 'codigo']);
  assert.deepEqual(snapshot.workflows[0].steps, ['Ler o QR.', 'Marcar como usado.']);
  assert.deepEqual(snapshot.mockup.screens.map((s) => s.file), ['index.html', 'lista.html']);
  assert.equal(snapshot.mockup.entry, 'index.html');
  assert.deepEqual(snapshot.requirements.map((r) => [r.capability, r.requirements.length]), [['authentication', 1]]);
  assert.ok(!snapshot.files.some((f) => f.path === 'README.md'));
});

test('the same files in any order give the same snapshot', () => {
  const forward = JSON.stringify(format.readWorkspace(FILES));
  const backward = JSON.stringify(format.readWorkspace([...FILES].reverse()));
  assert.equal(forward, backward);
});

test('names what it cannot read, with the file and what to write', () => {
  const snapshot = format.readWorkspace(FILES);
  const messages = snapshot.findings.map((f) => `${f.file}:${f.line} ${f.message}`);
  // A feature pointing at a capability that does not exist.
  assert.ok(messages.some((m) => m.startsWith('yourlab/phases/01-mvp.md') && /payments não existe/.test(m)));

  const broken = format.readWorkspace([
    { path: 'yourlab/project.md', content: '---\nname: X\nstage: somewhere\n---\n## Contexto\nsem propósito\n' },
    { path: 'yourlab/phases/01-a.md', content: '---\ntitle: A\nweeks: seis\n---\n' },
    { path: 'yourlab/Notas Soltas.txt', content: 'x' },
    { path: 'yourlab/mockup/menu.html', content: '<script>alert(1)</script><img src="https://x/y.png">' },
  ]);
  const text = broken.findings.map((f) => `${f.level} ${f.file} ${f.message}`).join('\n');
  assert.match(text, /error yourlab\/project\.md Falta a secção ## Propósito/);
  assert.match(text, /stage deve ser um de/);
  assert.match(text, /weeks deve ser um número inteiro/);
  assert.match(text, /Ficheiro ignorado/);
  assert.match(text, /scripts não correm/);
  assert.match(text, /Nada é carregado da internet/);
  assert.match(text, /não tem index\.html/);
});

test('a repository without the folder says so once, and is not initialized', () => {
  const snapshot = format.readWorkspace([{ path: 'README.md', content: 'x' }]);
  assert.equal(snapshot.initialized, false);
  assert.equal(snapshot.findings.length, 1);
  assert.equal(snapshot.findings[0].level, 'info');
});

test('the starting folder is written from the platform and reads back the same', () => {
  const project = {
    name: 'City Pass',
    clientName: 'Impakta',
    description: 'Cupões para restaurantes.',
    risks: ['Atrasos dos parceiros'],
    phases: [
      { name: 'Fase 1 - MVP, Fundação', durationWeeks: 6, objective: 'Comprar e usar.', deliverables: ['App'] },
      { name: 'Fase 2 - Mapa', durationWeeks: 4 },
    ],
    clarificationQuestions: [
      { question: 'Quantas pessoas?', answer: 'Até 6.', targetRole: 'client' },
      { question: 'MB Way?' },
    ],
  };
  const files = format.skeletonFiles(project);
  assert.deepEqual(files.map((f) => f.path), [
    'yourlab/GUIDE.md',
    'yourlab/phases/01-mvp-fundacao.md',
    'yourlab/phases/02-mapa.md',
    'yourlab/project.md',
    'yourlab/questions.md',
  ]);

  const snapshot = format.readWorkspace(files);
  assert.equal(snapshot.project.name, 'City Pass');
  assert.equal(snapshot.project.purpose, 'Cupões para restaurantes.');
  assert.deepEqual(snapshot.phases.map((p) => [p.title, p.weeks]), [['MVP, Fundação', 6], ['Mapa', 4]]);
  assert.deepEqual(snapshot.questions.map((q) => [q.question, q.state, q.audience]), [['Quantas pessoas?', 'answered', 'client'], ['MB Way?', 'open', 'team']]);
  assert.equal(snapshot.findings.filter((f) => f.level === 'error').length, 0);

  // Files the repository already has are left alone; the guide is always refreshed.
  const again = format.skeletonFiles(project, { existing: new Set(['yourlab/project.md']) });
  assert.ok(again.some((f) => f.path === 'yourlab/GUIDE.md'));
  assert.ok(!again.some((f) => f.path === 'yourlab/project.md'));
});

test('the guide names every file the reader reads', () => {
  const guide = format.guide();
  for (const name of ['project.md', 'ideas.md', 'questions.md', 'database.md', 'phases/NN-name.md', 'diagrams/name.mmd', 'workflows/name.md', 'mockup/name.html', 'openspec/specs/<capability>/spec.md']) {
    assert.ok(guide.includes(name), `GUIDE.md does not mention ${name}`);
  }
  for (const stage of format.STAGES) assert.ok(guide.includes(`\`${stage}\``), `GUIDE.md does not list stage ${stage}`);
});

test('reads a working copy on disk, and never outside it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourlab-ws-'));
  for (const file of FILES) {
    const full = path.join(root, file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content);
  }
  const { snapshot, source } = await sync.syncWorkspace({ localPath: root, owner: 'o', name: 'n' });
  assert.equal(source, 'local');
  assert.equal(JSON.stringify(snapshot), JSON.stringify(format.readWorkspace(FILES)));

  const reader = sync.createLocalReader(root);
  await assert.rejects(() => reader.listTree('../'), /fora do repositório/);
  assert.equal(await reader.readFile('yourlab/missing.md'), '');
});

test('without a working copy it reads through the git provider, at the default branch', async () => {
  const calls = [];
  const client = {
    listTree: async (owner, name, prefix, branch) => {
      calls.push(['list', prefix, branch]);
      return FILES.map((f) => f.path).filter((p) => p.startsWith(prefix));
    },
    readFile: async (owner, name, filePath) => FILES.find((f) => f.path === filePath)?.content || '',
  };
  const { snapshot, source, ref } = await sync.syncWorkspace(
    { owner: 'yourlab', name: 'citypass', defaultBranch: 'main' },
    { remoteClient: async () => client },
  );
  assert.equal(source, 'remote');
  assert.equal(ref, 'main');
  assert.deepEqual(calls.map((c) => c[2]), ['main', 'main']);
  assert.equal(snapshot.contentHash, format.readWorkspace(FILES).contentHash);
});
