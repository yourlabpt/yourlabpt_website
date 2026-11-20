#!/usr/bin/env node
/**
 * The constitution, on any working copy — no platform, no network, no AI.
 *
 *   node bin/yourlab.js init  [dir]   write yourlab/GUIDE.md (always the current rules),
 *                                     project.md from the README, a module diagram from
 *                                     the imports, AGENTS.md and CLAUDE.md — only what is
 *                                     not there; nothing is replaced
 *     --append-pointers               an existing AGENTS.md/CLAUDE.md gets a short section
 *                                     appended pointing at the GUIDE
 *   node bin/yourlab.js check [dir]   what no longer matches: format errors, links to
 *                                     folders that do not exist, artefacts older than the
 *                                     code they describe, folders nobody drew.
 *                                     Exit 1 when something must be fixed (pre-commit).
 *   --json                            the same report, for a local AI to read
 */
const fs = require('fs');
const path = require('path');
const format = require('../lib/workspace-format');
const workspaceSync = require('../lib/workspace-sync');
const codeMap = require('../lib/code-map');
const { driftReport } = require('../lib/artefact-drift');

// Appended to an AGENTS.md or CLAUDE.md someone already wrote — never a replacement.
const POINTER_SECTION = [
  '',
  '## YourLab constitution',
  '',
  'This repository documents itself in `yourlab/`. Before changing code, read',
  '`yourlab/GUIDE.md`; after changing code, update the artefacts linked to it in the same',
  'commit («The constitution» in the GUIDE). Check with `yourlab.js check .`.',
  '',
].join('\n');

/**
 * Writes what is missing, never over what exists: the GUIDE (platform-owned, always the
 * current rules), a project.md from the README, a module diagram from the imports with
 * its code links, AGENTS.md and CLAUDE.md. With `appendPointers`, an existing AGENTS.md or
 * CLAUDE.md that does not mention the GUIDE gets a short section appended at its end.
 */
async function init(dir, { appendPointers = false } = {}) {
  const root = path.resolve(dir);
  const reader = workspaceSync.createLocalReader(root);
  const existing = new Set([
    ...await reader.listTree(`${format.ROOT}/`),
    ...await reader.listTree(format.SPEC_PREFIX),
  ]);
  const notes = [];
  const appended = [];
  for (const pointer of Object.keys(format.POINTERS)) {
    const current = await reader.readFile(pointer);
    if (!current) continue;
    existing.add(pointer);
    if (current.includes(format.POINTER_LINE) || /^@AGENTS\.md\s*$/m.test(current)) continue;
    if (appendPointers) {
      await reader.writeFile(pointer, `${current.replace(/\s*$/, '')}\n${POINTER_SECTION}`);
      appended.push(pointer);
    } else {
      notes.push(`${pointer} exists and does not point at ${format.POINTER_LINE} — run init with --append-pointers, or add a line yourself.`);
    }
  }

  // What the code already says: the README for the purpose, the imports for the modules.
  const readme = await reader.readFile('README.md');
  let packageJson = null;
  try {
    const pkg = JSON.parse(await reader.readFile('package.json') || 'null');
    if (pkg) packageJson = { description: pkg.description || '', dependencies: Object.keys(pkg.dependencies || {}) };
  } catch { /* not JSON: no package facts */ }
  const map = await codeMap.buildCodeMap(reader, null, { maxFiles: 400 });
  const modules = map.modules.filter((entry) => entry.files > 0);
  const hasCode = modules.length > 0;
  const files = format.skeletonFiles(
    // A repository this command initialises is one of YourLab's own: «interno» until said otherwise.
    { name: path.basename(root), type: 'interno', description: format.firstParagraph(readme).slice(0, 600) },
    // No modules here: the diagram below is drawn from the imports instead.
    { existing, survey: { readme, packageJson, modules: [] } },
  );
  if (hasCode && !existing.has('yourlab/diagrams/modulos.mmd') && ![...existing].some((p) => p.startsWith('yourlab/diagrams/'))) {
    files.push({ path: 'yourlab/diagrams/modulos.mmd', content: codeMap.toMermaid({ modules, edges: map.edges }, { title: 'Módulos (do código, por rever)' }) });
  }
  for (const file of files) await reader.writeFile(file.path, file.content);
  return { written: files.map((file) => file.path), appended, notes, modules: modules.length };
}

async function check(dir) {
  const root = path.resolve(dir);
  const { snapshot } = await workspaceSync.syncWorkspace({ localPath: root });
  const reader = workspaceSync.createLocalReader(root);
  const map = await codeMap.buildCodeMap(reader, null, { maxFiles: 400 });
  const report = await driftReport({ root, snapshot, modules: map.modules.filter((entry) => entry.files > 0).map((entry) => entry.name) });
  return { initialized: snapshot.initialized, ...report };
}

function printCheck(report) {
  const out = [];
  if (!report.initialized) out.push('No yourlab/ here yet — run: node bin/yourlab.js init .');
  const section = (title, items, line) => {
    if (!items.length) return;
    out.push('', `${title} (${items.length})`);
    for (const item of items) out.push(`  - ${line(item)}`);
  };
  section('Format', report.format, (f) => `${f.level}: ${f.file}${f.line ? `:${f.line}` : ''} — ${f.message}`);
  section('Artefacts older than their code — update them', report.stale, (s) => `${s.artefact} («${s.what}») describes ${s.folder}, changed after it in ${s.codeCommit}`);
  section('Links to folders that do not exist', report.missing, (m) => `${m.artefact} («${m.what}») → ${m.folder}`);
  section('Folders of code no diagram points at', report.undrawn, (u) => u);
  if (!report.git) out.push('', '(no git here: staleness is not checked)');
  out.push('', report.clean ? 'OK — the artefacts match the code.' : 'Fix the lists above, or say in the commit message why not.');
  return out.join('\n');
}

async function main() {
  const [command = 'check', dirArg = '.'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const json = process.argv.includes('--json');
  const dir = path.resolve(dirArg);
  if (!fs.existsSync(dir)) throw new Error(`No such folder: ${dir}`);
  if (command === 'init') {
    const result = await init(dir, { appendPointers: process.argv.includes('--append-pointers') });
    console.log(json ? JSON.stringify(result, null, 2) : [
      `Written: ${result.written.join(', ') || '(nothing new)'}`,
      result.appended.length ? `Appended a constitution section to: ${result.appended.join(', ')}` : '',
      ...result.notes,
    ].filter(Boolean).join('\n'));
    return 0;
  }
  if (command === 'check') {
    const report = await check(dir);
    console.log(json ? JSON.stringify(report, null, 2) : printCheck(report));
    return report.clean ? 0 : 1;
  }
  console.error('Usage: yourlab.js init|check [dir] [--json]');
  return 2;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => { console.error(error.message); process.exit(2); });
}

module.exports = { init, check, printCheck };
