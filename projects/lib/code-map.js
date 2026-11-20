/**
 * The code, as a diagram: one node per module the survey found, one arrow per module
 * that imports another. Read straight from the source files — no AI, so the same
 * repository always draws the same map — and compared with what a person drew.
 */
const posix = require('path').posix;
const { summarizeModules } = require('./repo-survey');
const { moduleOf, moduleNodeId: nodeId, compareWithCode } = require('../public/artefact-edit');

// Imports are followed for JS/TS and Python; the other languages still count as modules.
const SOURCE = /\.(js|mjs|cjs|ts|tsx|jsx|py|vue|svelte|swift|kt|java|go|dart|rb|php|cs|c|cc|cpp|h)$/i;
const MAX_PER_MODULE = 40;
const MAX_FILE_CHARS = 40000;

const JS_IMPORT = /(?:\bimport\s[^'"`;]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s[^'"`;]*?\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/g;
const PY_IMPORT = /^\s*(?:from\s+([.\w]+)\s+import\b|import\s+([\w.]+))/gm;

/** Where an import points in the repository, or '' for a package. */
function resolveImport(fromPath, spec) {
  if (/\.py$/i.test(fromPath)) {
    const dots = spec.match(/^\.+/)?.[0].length || 0;
    const rest = spec.slice(dots).replace(/\./g, '/');
    if (!dots) return rest;
    let dir = posix.dirname(fromPath);
    for (let i = 1; i < dots; i += 1) dir = posix.dirname(dir);
    return posix.normalize(posix.join(dir, rest));
  }
  if (spec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(fromPath), spec));
  if (/^[@~]\//.test(spec)) return `src/${spec.slice(2)}`;
  return '';
}

function importsOf(filePath, content) {
  const out = [];
  const pattern = /\.py$/i.test(filePath) ? PY_IMPORT : JS_IMPORT;
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(content))) out.push(match[1] || match[2]);
  return out.filter(Boolean);
}

/** Pure: files (path + content) and module names in, nodes and arrows out. */
function graphFromFiles(files, names) {
  const counts = new Map(names.map((name) => [name, 0]));
  const edges = new Map();
  for (const file of files) {
    const from = moduleOf(file.path, names);
    if (!from) continue;
    counts.set(from, counts.get(from) + 1);
    for (const spec of importsOf(file.path, file.content)) {
      const target = resolveImport(file.path, spec);
      const to = target && moduleOf(target, names);
      if (!to || to === from) continue;
      const key = `${from}\u0000${to}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return {
    modules: names.map((name) => ({ name, files: counts.get(name) })),
    edges: [...edges.entries()].map(([key, count]) => { const [from, to] = key.split('\u0000'); return { from, to, count }; })
      .sort((a, b) => b.count - a.count || (a.from < b.from ? -1 : 1)),
  };
}

/** The map as a diagram file, its nodes already linked to their folders. */
function toMermaid(graph, { title = 'Módulos (do código)' } = {}) {
  const lines = [`%% title: ${title}`, 'flowchart LR'];
  for (const entry of graph.modules) lines.push(`  ${nodeId(entry.name)}["${entry.name}"]`);
  for (const edge of graph.edges) lines.push(`  ${nodeId(edge.from)} --> ${nodeId(edge.to)}`);
  lines.push('');
  for (const entry of graph.modules) lines.push(`%% code: ${nodeId(entry.name)} = ${entry.name}`);
  return `${lines.join('\n')}\n`;
}

/**
 * Reads the modules' source files through the project's reader (working copy or Git
 * host) and builds the map. `maxFiles` keeps a remote read to a sane number of calls.
 */
async function buildCodeMap(reader, survey, { maxFiles = 200 } = {}) {
  let names = (survey?.modules || []).map((entry) => entry.name);
  // Without a survey: only folders that hold source files, never the artefacts themselves.
  if (!names.length) {
    const paths = (await reader.listTree('', { limit: 20000 })).filter((p) => SOURCE.test(p) && !/^(yourlab|openspec)\//.test(p));
    names = summarizeModules(paths).map((entry) => entry.name);
    // Code at the root (a flat repository, or its entry files) is a module per file;
    // configuration and tests are not.
    names.push(...paths.filter((p) => !p.includes('/') && !/\.(config|test|spec)\.[a-z]+$/i.test(p)));
  }
  const files = [];
  for (const name of names) {
    if (files.length >= maxFiles) break;
    // A module is a folder, or one source file at the root.
    const paths = SOURCE.test(name) ? [name] : (await reader.listTree(`${name}/`).catch(() => [])).filter((p) => SOURCE.test(p)).sort().slice(0, MAX_PER_MODULE);
    for (const filePath of paths) {
      if (files.length >= maxFiles) break;
      const content = await reader.readFile(filePath).catch(() => '');
      files.push({ path: filePath, content: String(content).slice(0, MAX_FILE_CHARS) });
    }
  }
  const graph = graphFromFiles(files, names);
  // Which files each module has, for the studio's «código ligado» list.
  const filesByModule = Object.fromEntries(names.map((name) => [name, files.filter((file) => moduleOf(file.path, names) === name).map((file) => file.path)]));
  return { ...graph, filesByModule, mermaid: toMermaid(graph), readFiles: files.length, truncated: files.length >= maxFiles };
}

function compare(parsed, map) {
  return compareWithCode(parsed, map.modules);
}

module.exports = { SOURCE, resolveImport, importsOf, moduleOf, graphFromFiles, toMermaid, buildCodeMap, compare, nodeId };
