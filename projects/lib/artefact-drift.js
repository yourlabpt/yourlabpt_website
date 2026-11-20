/**
 * Where the artefacts no longer match the code — read from the files and git, no AI.
 *
 * Four questions, the same ones `yourlab check` asks before a commit:
 *   stale    an artefact linked to a folder whose code changed after the artefact did
 *   missing  a link to a folder that does not exist
 *   undrawn  a folder of code that no diagram node points at
 *   format   what the reader could not read (the snapshot's findings)
 */
const fs = require('fs');
const path = require('path');
const edit = require('../public/artefact-edit');
const gitLocal = require('./git-local');

/** Every link the artefacts declare: diagram nodes and workflows, with their folder. */
function linksOf(snapshot) {
  const out = [];
  for (const diagram of snapshot?.diagrams || []) {
    const flow = edit.parseFlowchart(diagram.source || '');
    for (const [id, folder] of Object.entries(flow.links)) {
      out.push({ artefact: diagram.file, title: diagram.title, what: flow.nodes.find((node) => node.id === id)?.label || id, folder });
    }
  }
  for (const workflow of snapshot?.workflows || []) {
    for (const folder of edit.parseWorkflow(workflow.text || '').code) {
      out.push({ artefact: workflow.file, title: workflow.title, what: workflow.title, folder });
    }
  }
  return out;
}

/**
 * `root` is a working copy (git or not); `modules` the code map's module names. With no
 * working copy, a folder exists when the code map has it, and staleness (which reads
 * git) comes back empty with `git: false`.
 */
async function driftReport({ root = '', snapshot, modules = [], knownFolders = modules }) {
  const links = linksOf(snapshot);
  const exists = root
    ? (folder) => { try { return fs.existsSync(path.join(root, folder)); } catch { return false; } }
    : (folder) => knownFolders.some((name) => name === folder || name.startsWith(`${folder}/`) || folder.startsWith(`${name}/`));
  const missing = links.filter((link) => !exists(link.folder));
  const linkedFolders = links.filter((link) => exists(link.folder)).map((link) => link.folder);
  const undrawn = modules.filter((name) => !linkedFolders.some((folder) => name === folder || name.startsWith(`${folder}/`) || folder.startsWith(`${name}/`)));

  const stale = [];
  const git = Boolean(root) && gitLocal.isRepo(root);
  if (git) {
    const artefactTimes = new Map();
    for (const link of links) {
      if (!exists(link.folder)) continue;
      if (!artefactTimes.has(link.artefact)) artefactTimes.set(link.artefact, await gitLocal.lastChange(root, link.artefact));
      const code = await gitLocal.lastChange(root, link.folder);
      const art = artefactTimes.get(link.artefact);
      if (code.at && code.at > art.at) stale.push({ ...link, codeCommit: code.commit, codeAt: code.at, artefactAt: art.at });
    }
  }
  const format = (snapshot?.findings || []).filter((finding) => finding.level === 'error' || finding.level === 'warning');
  return { git, stale, missing, undrawn, format, clean: !stale.length && !missing.length && !format.some((f) => f.level === 'error') };
}

module.exports = { linksOf, driftReport };
