/**
 * Reading an app that already exists.
 *
 * A project can arrive with a working codebase and no specification of any kind — the
 * Resgate and Consolidação cases. Before any persona can derive requirements from it,
 * somebody has to establish what is actually in there.
 *
 * This does that part without an agent and without a model: it walks the tree, reads
 * the files that declare intent (manifests, README, schema, routes) and reports facts.
 * Nothing here guesses at requirements — it produces the evidence a persona then reads.
 *
 * Deliberately bounded: a survey must stay cheap enough to run on any repository, so
 * file reads are capped and large files are skipped rather than truncated silently.
 */

const MAX_FILE_READS = 24;
const MAX_FILE_BYTES = 120_000;

// Files that state what the project is, rather than what it does line by line.
const MANIFESTS = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'go.mod',
  'composer.json', 'Gemfile', 'pom.xml', 'build.gradle', 'Cargo.toml', 'pubspec.yaml',
];

const DOC_PATTERNS = [/^readme(\.[a-z]+)?$/i, /^docs?\//i, /^contributing(\.[a-z]+)?$/i];

const SCHEMA_PATTERNS = [
  /(^|\/)schema\.(sql|prisma)$/i, /(^|\/)migrations?\//i, /(^|\/)models?\//i,
  /\.sql$/i, /(^|\/)prisma\//i,
];

const DEPLOY_PATTERNS = [
  /^dockerfile$/i, /^docker-compose\.ya?ml$/i, /^\.env\.example$/i,
  /^(vercel|netlify|fly|railway)\.(json|toml|ya?ml)$/i, /(^|\/)\.github\/workflows\//i,
];

// Directories that are dependencies or output, never the app itself.
const IGNORED = /(^|\/)(node_modules|vendor|dist|build|out|target|\.git|\.next|\.venv|__pycache__|coverage)(\/|$)/;

// Stored data and uploads live in the repository but are not part of its structure.
// Left in the file list, kept out of the module map, where they would otherwise swamp
// the actual code — a data/ directory of 257 records is not the biggest module.
const NON_SOURCE = /^(data|uploads|tmp|temp|logs|fixtures|snapshots|\.cache)(\/|$)/;

const LANGUAGE_BY_EXTENSION = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', rb: 'Ruby', php: 'PHP',
  go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', swift: 'Swift', cs: 'C#',
  dart: 'Dart', vue: 'Vue', svelte: 'Svelte', sql: 'SQL',
  css: 'CSS', scss: 'CSS', html: 'HTML',
};

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function extensionOf(filePath) {
  const base = String(filePath).split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(filePath));
}

/**
 * Which languages the repository is actually written in, by file count. Config and
 * styling are counted but reported separately from what carries the logic.
 */
function summarizeLanguages(paths) {
  const counts = new Map();
  for (const filePath of paths) {
    const language = LANGUAGE_BY_EXTENSION[extensionOf(filePath)];
    if (language) counts.set(language, (counts.get(language) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, files]) => ({ language, files }));
}

/**
 * The top-level shape of the codebase. Where a src/ or app/ directory exists it is the
 * real root — the repository root there is scaffolding, not structure.
 */
function summarizeModules(paths) {
  const roots = new Set(['src', 'app', 'lib', 'packages', 'apps', 'services']);
  const counts = new Map();
  for (const filePath of paths) {
    if (NON_SOURCE.test(filePath)) continue;
    const parts = filePath.split('/');
    if (parts.length < 2) continue;
    const candidate = roots.has(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    counts.set(candidate, (counts.get(candidate) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([name]) => !name.startsWith('.'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, files]) => ({ name, files }));
}

/** Dependencies name the frameworks, which say more about the app than file counts. */
function readPackageJson(content) {
  try {
    const parsed = JSON.parse(content);
    const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
    return {
      name: text(parsed.name),
      description: text(parsed.description),
      scripts: Object.keys(parsed.scripts || {}),
      dependencies: Object.keys(deps).sort(),
    };
  } catch {
    return null;
  }
}

/**
 * HTTP surface, found by shape rather than by framework: almost every framework in
 * every language spells a route as a verb plus a path string.
 */
const ROUTE_PATTERNS = [
  /\b(?:app|router|server|api)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/gi,
  /@(?:Get|Post|Put|Patch|Delete)\s*\(\s*['"`]([^'"`]+)/g,
  /@(?:app|bp|router)\.route\s*\(\s*['"`]([^'"`]+)/g,
];

function extractRoutes(content) {
  const found = new Set();
  for (const pattern of ROUTE_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(content);
    while (match) {
      // The path is the last captured group whichever pattern matched.
      const route = text(match[match.length - 1]);
      if (route.startsWith('/')) found.add(route);
      match = pattern.exec(content);
    }
  }
  return [...found];
}

/**
 * Picks the files worth reading, in priority order, within the read budget. Manifests
 * and docs first: they state intent. Code files only fill whatever budget is left.
 */
function selectFilesToRead(paths) {
  const manifests = paths.filter((p) => MANIFESTS.includes(p.split('/').pop() || ''));
  const docs = paths.filter((p) => matchesAny(p, DOC_PATTERNS));
  const deploy = paths.filter((p) => matchesAny(p, DEPLOY_PATTERNS));
  const schema = paths.filter((p) => matchesAny(p, SCHEMA_PATTERNS));
  // Server-ish files are where routes live; sorted so shallow files win.
  const code = paths
    .filter((p) => ['js', 'ts', 'py', 'rb', 'go', 'php', 'java'].includes(extensionOf(p)))
    .sort((a, b) => a.split('/').length - b.split('/').length);

  const ordered = [...manifests, ...docs, ...deploy, ...schema.slice(0, 4), ...code];
  const seen = new Set();
  const selected = [];
  for (const filePath of ordered) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    selected.push(filePath);
    if (selected.length >= MAX_FILE_READS) break;
  }
  return selected;
}

/**
 * Walks a linked repository and reports what is in it.
 *
 * `client` is a git provider client; only its read methods are used. The survey never
 * writes anything, to the repository or to the project.
 */
async function surveyRepository(client, repository, { ref = '' } = {}) {
  const { owner, name, defaultBranch } = repository;
  const branch = text(ref, defaultBranch);
  const all = await client.listTree(owner, name, '', branch);
  const paths = all.filter((filePath) => !IGNORED.test(filePath));

  const reads = selectFilesToRead(paths);
  const files = [];
  const truncated = [];
  for (const filePath of reads) {
    // Sequential: a survey is not latency-critical, and a burst of parallel reads is
    // the fastest way to meet a provider rate limit.
    const content = await client.readFile(owner, name, filePath, branch).catch(() => null);
    if (typeof content !== 'string') continue;
    // A repository's largest file is usually its most important one. Skipping it for
    // being large is the wrong trade — read what fits and say that it was cut.
    if (content.length > MAX_FILE_BYTES) {
      truncated.push(filePath);
      files.push({ path: filePath, content: content.slice(0, MAX_FILE_BYTES) });
    } else {
      files.push({ path: filePath, content });
    }
  }

  const byPath = new Map(files.map((entry) => [entry.path, entry.content]));
  const packageJson = byPath.has('package.json') ? readPackageJson(byPath.get('package.json')) : null;

  const routes = new Set();
  for (const entry of files) {
    for (const route of extractRoutes(entry.content)) routes.add(route);
  }

  const readmePath = paths.find((p) => /^readme(\.[a-z]+)?$/i.test(p));

  return {
    repository: repository.fullName,
    branch,
    fileCount: paths.length,
    languages: summarizeLanguages(paths),
    modules: summarizeModules(paths),
    manifests: reads.filter((p) => MANIFESTS.includes(p.split('/').pop() || '')),
    docs: paths.filter((p) => matchesAny(p, DOC_PATTERNS)).slice(0, 30),
    deployment: paths.filter((p) => matchesAny(p, DEPLOY_PATTERNS)).slice(0, 20),
    schema: paths.filter((p) => matchesAny(p, SCHEMA_PATTERNS)).slice(0, 30),
    routes: [...routes].sort().slice(0, 120),
    packageJson,
    readme: readmePath ? text(byPath.get(readmePath)).slice(0, 8000) : '',
    // Kept so the persona reads the same evidence a person would, not a paraphrase.
    readFiles: files.map((entry) => entry.path),
    // Named explicitly: a requirement missing because its file was cut short is a
    // gap the reviewer should be able to see, not discover later.
    truncatedFiles: truncated,
    hasOpenSpec: paths.some((p) => p.startsWith('openspec/')),
    surveyedAt: new Date().toISOString(),
  };
}

/**
 * The survey as a persona reads it. Markdown rather than JSON because this is context
 * for a language model and for a person reading the same panel.
 */
function surveyToMarkdown(survey) {
  if (!survey) return '';
  const lines = [];
  lines.push(`# Levantamento de ${survey.repository}`);
  lines.push('');
  lines.push(`Ramo \`${survey.branch}\` · ${survey.fileCount} ficheiros (excluindo dependências e artefactos).`);

  if (survey.languages.length) {
    lines.push('');
    lines.push('## Linguagens');
    for (const entry of survey.languages.slice(0, 8)) {
      lines.push(`- ${entry.language}: ${entry.files} ficheiro(s)`);
    }
  }

  if (survey.packageJson) {
    lines.push('');
    lines.push('## Manifesto');
    if (survey.packageJson.description) lines.push(survey.packageJson.description);
    if (survey.packageJson.dependencies.length) {
      lines.push(`Dependências: ${survey.packageJson.dependencies.slice(0, 40).join(', ')}`);
    }
    if (survey.packageJson.scripts.length) {
      lines.push(`Comandos: ${survey.packageJson.scripts.join(', ')}`);
    }
  }

  if (survey.modules.length) {
    lines.push('');
    lines.push('## Estrutura');
    for (const entry of survey.modules) lines.push(`- \`${entry.name}\` — ${entry.files} ficheiro(s)`);
  }

  if (survey.routes.length) {
    lines.push('');
    lines.push('## Rotas encontradas');
    for (const route of survey.routes) lines.push(`- \`${route}\``);
  }

  if (survey.schema.length) {
    lines.push('');
    lines.push('## Dados');
    for (const entry of survey.schema) lines.push(`- \`${entry}\``);
  }

  if (survey.deployment.length) {
    lines.push('');
    lines.push('## Execução e entrega');
    for (const entry of survey.deployment) lines.push(`- \`${entry}\``);
  }

  if (survey.readme) {
    lines.push('');
    lines.push('## README');
    lines.push(survey.readme);
  }

  if (survey.truncatedFiles?.length) {
    lines.push('');
    lines.push('## Lido apenas em parte');
    lines.push('Estes ficheiros excedem o limite de leitura, por isso o levantamento viu só o início:');
    for (const entry of survey.truncatedFiles) lines.push(`- \`${entry}\``);
  }

  return lines.join('\n');
}

module.exports = {
  MAX_FILE_READS,
  extractRoutes,
  summarizeLanguages,
  summarizeModules,
  surveyRepository,
  surveyToMarkdown,
};
