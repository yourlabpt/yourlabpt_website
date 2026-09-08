/**
 * Surveying an app that already exists. The survey is evidence, so what matters is
 * that it reports what is really there and is honest about what it could not read.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const survey = require('../lib/repo-survey');

/** A git client backed by a plain object of path → content. */
function fakeClient(files) {
  return {
    async listTree() { return Object.keys(files); },
    async readFile(_owner, _name, filePath) {
      if (!(filePath in files)) throw new Error('404');
      return files[filePath];
    },
  };
}

const REPO = { owner: 'yourlab', name: 'app', fullName: 'yourlab/app', defaultBranch: 'main' };

test('finds routes across framework styles', () => {
  assert.deepEqual(
    survey.extractRoutes("app.get('/api/reservas', h); router.post('/api/reservas/:id', h)").sort(),
    ['/api/reservas', '/api/reservas/:id'],
  );
  assert.deepEqual(survey.extractRoutes('@Get("/clientes")'), ['/clientes']);
  assert.deepEqual(survey.extractRoutes("@app.route('/relatorio')"), ['/relatorio']);
  // A string that is not a path is not a route.
  assert.deepEqual(survey.extractRoutes("app.get('reservas', h)"), []);
});

test('stored data does not count as a module', () => {
  const modules = survey.summarizeModules([
    'data/a.json', 'data/b.json', 'data/c.json', 'data/d.json',
    'uploads/x.png',
    'lib/one.js', 'lib/two.js',
  ]);
  // data/ has more files than lib/, and must still not be reported as the structure.
  assert.deepEqual(modules.map((entry) => entry.name), ['lib']);
});

test('a src/ or app/ directory is the real root', () => {
  const modules = survey.summarizeModules([
    'src/reservas/index.js', 'src/reservas/api.js', 'src/clientes/index.js', 'README.md',
  ]);
  assert.deepEqual(
    modules.map((entry) => entry.name).sort(),
    ['src/clientes', 'src/reservas'],
  );
});

test('counts languages by file, ignoring what it does not recognise', () => {
  const languages = survey.summarizeLanguages(['a.ts', 'b.ts', 'c.py', 'LICENSE', 'd.bin']);
  assert.deepEqual(languages, [
    { language: 'TypeScript', files: 2 },
    { language: 'Python', files: 1 },
  ]);
});

test('reads a repository and reports its shape', async () => {
  const client = fakeClient({
    'package.json': JSON.stringify({
      name: 'reservas', description: 'Reservas de restaurante',
      dependencies: { express: '^4' }, scripts: { start: 'node server.js' },
    }),
    'README.md': '# Reservas\nSistema de reservas.',
    'server.js': "app.get('/api/reservas', handler);",
    'node_modules/express/index.js': 'ignored',
    'dist/bundle.js': 'ignored',
  });

  const result = await survey.surveyRepository(client, REPO);

  // Dependencies and build output are not the app.
  assert.equal(result.fileCount, 3);
  assert.deepEqual(result.routes, ['/api/reservas']);
  assert.equal(result.packageJson.name, 'reservas');
  assert.deepEqual(result.packageJson.dependencies, ['express']);
  assert.match(result.readme, /Sistema de reservas/);
  assert.equal(result.hasOpenSpec, false);
  assert.deepEqual(result.truncatedFiles, []);
});

test('a file too large to read whole is reported, never silently dropped', async () => {
  const huge = `${"x".repeat(200_000)}\napp.get('/api/tarde', h);`;
  const client = fakeClient({ 'server.js': huge });

  const result = await survey.surveyRepository(client, REPO);

  // It was read (partially) rather than skipped...
  assert.deepEqual(result.readFiles, ['server.js']);
  // ...and the reviewer is told the file was cut, so a missing requirement has a cause.
  assert.deepEqual(result.truncatedFiles, ['server.js']);
  assert.match(survey.surveyToMarkdown(result), /Lido apenas em parte/);
});

test('an existing OpenSpec tree is recognised', async () => {
  const client = fakeClient({ 'openspec/project.md': '# Projecto', 'index.js': '' });
  const result = await survey.surveyRepository(client, REPO);
  assert.equal(result.hasOpenSpec, true);
});

test('the survey never writes to the repository', async () => {
  let wrote = false;
  const client = {
    ...fakeClient({ 'index.js': "app.get('/a', h)" }),
    writeFile() { wrote = true; },
    createBranch() { wrote = true; },
  };
  await survey.surveyRepository(client, REPO);
  assert.equal(wrote, false);
});

test('surveying is a read, and its route says so', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'survey-routes.js'), 'utf8');
  // Refuses rather than surveying nothing when no repository is bound.
  assert.match(source, /nao tem repositorio ligado/);
  assert.match(source, /repositorySurvey = survey/);
});
