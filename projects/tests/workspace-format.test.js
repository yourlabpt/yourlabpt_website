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

test(`only the folder own files are writable, and never the guide`, () => {
  assert.equal(format.isWritablePath('yourlab/project.md'), true);
  assert.equal(format.isWritablePath('openspec/specs/authentication/spec.md'), true);
  assert.equal(format.isWritablePath('yourlab/GUIDE.md'), false);
  assert.equal(format.isWritablePath('yourlab/Notas.txt'), false);
  assert.equal(format.isWritablePath('package.json'), false);
});

test('the working copy is written in place, and only inside itself', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourlab-write-'));
  const reader = sync.createLocalReader(root);

  await reader.writeFile('yourlab/phases/01-mvp.md', '---\ntitle: MVP\n---\n');
  assert.equal(fs.readFileSync(path.join(root, 'yourlab/phases/01-mvp.md'), 'utf8'), '---\ntitle: MVP\n---\n');
  assert.equal(format.fileSha(await reader.readFile('yourlab/phases/01-mvp.md')), format.fileSha('---\ntitle: MVP\n---\n'));

  await assert.rejects(() => reader.writeFile('../escapou.md', 'x'), /fora do repositório/);
});

test('a requirement carries its type, and one without the meta line lands in Não Definido', () => {
  const spec = [
    '## Requirements',
    '### Requirement: Responder depressa',
    '<!-- yourlab: id=RNF-01; type=non_functional; module=Backend -->',
    '',
    'O sistema SHALL responder em 2s.',
    '',
    '#### Scenario: Página inicial',
    '- **WHEN** o cliente abre a app',
    '- **THEN** vê os cupões em 2s',
    '',
    '### Requirement: Sem meta',
    'O sistema SHALL fazer algo.',
    '',
  ].join('\n');
  const snapshot = format.readWorkspace([{ path: 'openspec/specs/desempenho/spec.md', content: spec }]);
  const [first, second] = snapshot.requirements[0].requirements;

  assert.deepEqual(
    { id: first.id, type: first.type, module: first.module, scenarios: first.scenarios.length },
    { id: 'RNF-01', type: 'non_functional', module: 'Backend', scenarios: 1 },
  );
  assert.equal(first.scenarios[0].then, 'vê os cupões em 2s');
  assert.equal(second.type, 'undefined');
  assert.ok(snapshot.findings.some((finding) => /não diz o tipo/.test(finding.message)));
});

test('the guide names every requirement type the reader knows', () => {
  const guide = format.guide();
  for (const type of format.REQUIREMENT_TYPES) assert.ok(guide.includes(`\`${type}\``), `GUIDE.md does not list type ${type}`);
});

test('a saved edit becomes one task with the diff, and an unchanged save makes none', () => {
  const snapshot = format.readWorkspace(FILES);
  const before = FILES.find((f) => f.path === 'openspec/specs/authentication/spec.md').content;
  const after = before.replace('sees their coupons', 'sees their coupons and their plan');

  const draft = format.taskFromEdit({ filePath: 'openspec/specs/authentication/spec.md', before, after, snapshot });
  assert.equal(draft.title, 'Aplicar: spec.md');
  assert.match(draft.descriptionMarkdown, /```diff/);
  assert.match(draft.descriptionMarkdown, /\+ - \*\*THEN\*\* the client sees their coupons and their plan/);
  // The fase whose feature names this capability is put in doubt, and so is its code.
  assert.deepEqual(draft.impact.artefacts, ['yourlab/phases/01-mvp.md']);
  assert.deepEqual(draft.impact.code, ['Código e testes da capacidade authentication.']);

  assert.equal(format.taskFromEdit({ filePath: 'yourlab/project.md', before: 'x', after: 'x', snapshot }), null);
});

test('a fase edit points at the requirement files its features use', () => {
  const snapshot = format.readWorkspace(FILES);
  assert.deepEqual(format.impactOfEdit('yourlab/phases/01-mvp.md', snapshot), {
    artefacts: ['openspec/specs/authentication/spec.md', 'openspec/specs/payments/spec.md'],
    code: ['Código das features desta fase.'],
  });
  assert.deepEqual(format.impactOfEdit('yourlab/mockup/index.html', snapshot).code, ['Interface: os ecrãs e a navegação entre eles.']);
});

test('the task the route builds survives normalisation as a waiting, platform-made task', () => {
  const workItems = require('../lib/work-items');
  const record = workItems.normalizeWorkItem({
    id: 'witem_test',
    title: 'Aplicar: spec.md',
    descriptionMarkdown: 'diff',
    complexity: 'medium',
    status: 'waiting_review',
    origin: 'platform',
    executorMode: 'both',
    deliveryStageId: 'unclassified',
    sourceRefs: [{ type: 'artifact', id: 'openspec/specs/authentication/spec.md', label: 'openspec/specs/authentication/spec.md' }],
  }, { project: { id: 'p', requirements: [] }, actorUserId: 'u', nowIso: () => '2026-09-23T10:00:00.000Z' });

  assert.equal(record.status, 'waiting_review');
  assert.equal(record.origin, 'platform');
  assert.ok(record.sourceRefs.some((ref) => ref.type === 'artifact' && ref.id === 'openspec/specs/authentication/spec.md'));
  // It is what Hoje counts as waiting for a person.
  assert.equal(workItems.executionStatusChip(record).tone, 'review');
});

const SURVEY = {
  fileCount: 42,
  languages: [{ language: 'JavaScript', files: 30 }, { language: 'SQL', files: 2 }],
  modules: [{ name: 'src', files: 20 }, { name: 'src/routes', files: 6 }, { name: 'migrations', files: 2 }],
  routes: ['/api/coupons', '/api/login'],
  schema: ['migrations/001_init.sql'],
  packageJson: { name: 'citypass', description: 'Cupões de desconto para restaurantes.', scripts: ['start'], dependencies: ['express', 'pg'] },
  readme: '# City Pass\n\nUm primeiro parágrafo do README.\n\nMais texto.',
};

test('a project that already has code starts from what the survey found, marked for review', () => {
  const files = format.skeletonFiles({ name: 'City Pass', clientName: 'Impakta' }, { survey: SURVEY });
  assert.deepEqual(files.map((f) => f.path), ['yourlab/GUIDE.md', 'yourlab/diagrams/modulos.mmd', 'yourlab/project.md']);

  const projectMd = files.find((f) => f.path === 'yourlab/project.md').content;
  assert.match(projectMd, /<!-- gerado do código, por rever -->/);

  const snapshot = format.readWorkspace(files);
  assert.equal(snapshot.project.type, 'resgate');
  assert.equal(snapshot.project.stage, 'implementation');
  assert.equal(snapshot.project.purpose, 'Cupões de desconto para restaurantes.');
  assert.match(snapshot.project.context, /Rotas: \/api\/coupons, \/api\/login/);
  assert.match(snapshot.project.context, /Pacotes: express, pg/);
  // Nesting in the folders is the only edge drawn; nothing else is inferred.
  const diagram = snapshot.diagrams[0];
  assert.equal(diagram.title, 'Módulos');
  assert.match(diagram.source, /m0 --> m1/);
  assert.doesNotMatch(diagram.source, /m0 --> m2/);
  assert.equal(snapshot.findings.filter((f) => f.level !== 'info').length, 0);
});

test('without a manifest description the purpose comes from the README, and a platform description wins over both', () => {
  const fromReadme = format.readWorkspace(format.skeletonFiles({ name: 'X' }, { survey: { ...SURVEY, packageJson: null } }));
  assert.equal(fromReadme.project.purpose, 'Um primeiro parágrafo do README.');
  const fromPlatform = format.readWorkspace(format.skeletonFiles({ name: 'X', description: 'Escrito por uma pessoa.' }, { survey: SURVEY }));
  assert.equal(fromPlatform.project.purpose, 'Escrito por uma pessoa.');
});
