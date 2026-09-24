/**
 * Reading and writing a project's repository, the same way from every route.
 *
 * Writes go to the local working copy when the project has one, and straight to the
 * repository's default branch when it does not — never to a side branch, so what was
 * just saved is what the next read returns. Requirements live in openspec/specs/: the
 * platform's own requirement records are a projection of those files, pulled on every
 * sync and pushed on every edit, so the old editor and Artefactos never disagree.
 */
const crypto = require('crypto');
const gitSettings = require('./git-provider-settings');
const gitRepositories = require('./git-repositories');
const { createGitProviderClient } = require('./git-provider-client');
const workspaceSync = require('./workspace-sync');
const workspaceFormat = require('./workspace-format');
const openspecSync = require('./openspec-sync');
const openspecFormat = require('./openspec-format');

const NO_REPOSITORY = 'Este projecto não tem repositório ligado. Ligue um em Definições do projecto.';

async function remoteClient(dataDir) {
  const settings = await gitSettings.readGitProviderSettings(dataDir);
  const token = await gitSettings.resolveGitToken(dataDir);
  return createGitProviderClient({ provider: settings.provider, apiBaseUrl: settings.apiBaseUrl, token });
}
// The one seam: tests and harnesses put a fake host here.
const factory = { remoteClient };

function repositoryOf(project) {
  return gitRepositories.normalizeProjectRepository(project?.repository);
}

async function readerFor(dataDir, repository) {
  if (!repository) throw new Error(NO_REPOSITORY);
  return workspaceSync.pickReader(repository, { remoteClient: () => factory.remoteClient(dataDir) });
}

async function readFile(dataDir, repository, filePath) {
  const reader = await readerFor(dataDir, repository);
  return reader.readFile(filePath).catch(() => '');
}

/**
 * Writes files where the project lives: the working copy, or one commit per file on
 * the default branch. Returns where it went, so the caller can say so.
 */
async function writeFiles(dataDir, repository, files, message) {
  if (!repository) throw new Error(NO_REPOSITORY);
  if (!files.length) return { source: 'none', paths: [] };
  const reader = await readerFor(dataDir, repository);
  if (typeof reader.writeFile === 'function') {
    for (const file of files) await reader.writeFile(file.path, file.content);
    return { source: 'local', paths: files.map((file) => file.path) };
  }
  const client = await factory.remoteClient(dataDir);
  for (const file of files) {
    await client.writeFile(repository.owner, repository.name, file.path, file.content, {
      branch: repository.defaultBranch,
      message: `${message || 'yourlab'}: ${file.path}`,
    });
  }
  return { source: 'remote', paths: files.map((file) => file.path), branch: repository.defaultBranch };
}

/* ------------------------------------------------------------ requirements <-> files */

// What both sides agree a requirement is. Anything else the platform keeps on a record
// (phase, status, links) rides along untouched when the files are pulled.
function requirementsHash(requirements) {
  const comparable = (Array.isArray(requirements) ? requirements : []).map((entry) => [
    entry.id, entry.type, entry.title, entry.shall || entry.description, entry.rationale,
    entry.priority, entry.module, entry.condition, entry.measure,
  ].map((value) => String(value ?? '').trim()));
  comparable.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return crypto.createHash('sha1').update(JSON.stringify(comparable)).digest('hex');
}

// The last requirement set each project agreed with its files. A persist whose
// requirements differ from this is an edit that has to reach the files.
const agreed = new Map();

function noteRequirements(projectId, requirements) {
  const hash = requirementsHash(requirements);
  if (agreed.get(projectId) === hash) return false;
  agreed.set(projectId, hash);
  return true;
}

/** The snapshot's spec files, in the shape the sync mapping reads. */
function specsFromSnapshot(snapshot) {
  return (snapshot?.requirements || []).map((spec) => ({
    capability: spec.capability,
    title: spec.title,
    module: '',
    purpose: '',
    requirements: spec.requirements.map((requirement) => ({
      id: requirement.id,
      type: requirement.type,
      priority: requirement.priority,
      module: requirement.module,
      title: requirement.title,
      shall: requirement.shall,
      rationale: requirement.rationale,
      scenarios: requirement.scenarios.map((scenario) => ({ id: '', title: scenario.title, when: scenario.when, then: scenario.then })),
    })),
  }));
}

/**
 * The platform's requirements after a read of the files. Records keep what only the
 * platform knows; what the files say wins for the rest. Null when the repository has
 * no spec files yet — then the platform's records are all there is.
 */
function pullRequirements(existing, snapshot) {
  const specs = specsFromSnapshot(snapshot);
  if (!specs.length) return null;
  const list = Array.isArray(existing) ? existing : [];
  const byId = new Map(list.map((entry) => [String(entry.id), entry]));
  const pulled = openspecSync.buildRequirementsFromSpecs(specs, { existingRequirements: list });
  return pulled.map((record) => {
    const previous = byId.get(String(record.id));
    return previous ? { ...previous, ...record, updatedAt: previous.updatedAt } : record;
  });
}

/**
 * Reads the repository again, keeps the snapshot on the project and pulls the
 * requirements from it. The one place a project's view of its files is refreshed.
 */
async function syncProject({ dataDir, updateStore, appendActivity }, projectId, repository, actorUserId, activity) {
  const { snapshot, source, ref } = await workspaceSync.syncWorkspace(repository, { remoteClient: () => factory.remoteClient(dataDir) });
  const workspace = { snapshot, source, ref, syncedAt: new Date().toISOString(), syncedBy: actorUserId };
  await updateStore(async (store) => {
    const target = store.projects.find((entry) => entry.id === projectId);
    if (!target) throw new Error('Projecto não encontrado.');
    const changed = target.workspace?.snapshot?.contentHash !== snapshot.contentHash;
    target.workspace = workspace;
    const pulled = pullRequirements(target.requirements, snapshot);
    if (pulled && requirementsHash(pulled) !== requirementsHash(target.requirements)) {
      target.requirements = pulled;
      target.updatedAt = workspace.syncedAt;
    }
    // What the files say is now what the platform says: no push follows this persist.
    if (pulled) agreed.set(projectId, requirementsHash(pulled));
    if (changed) {
      target.updatedAt = workspace.syncedAt;
      if (activity) appendActivity(store, { projectId, actorUserId, ...activity(snapshot, source) });
    }
  });
  return workspace;
}

/**
 * Writes the platform's requirements into openspec/specs/, only the files that differ,
 * then reads back. Called after an edit in the old editor; safe to call any time.
 */
async function pushRequirements(deps, project, actorUserId) {
  const repository = repositoryOf(project);
  if (!repository) return { written: [], reason: 'no_repository' };
  const requirements = Array.isArray(project.requirements) ? project.requirements : [];
  const { specs } = openspecSync.buildRepositoryFiles(project, requirements);
  const reader = await readerFor(deps.dataDir, repository);
  const files = [];
  for (const spec of specs) {
    const filePath = openspecFormat.specPath(spec.capability);
    const content = openspecFormat.serializeSpec(spec);
    const current = await reader.readFile(filePath).catch(() => '');
    if (current !== content) files.push({ path: filePath, content });
  }
  if (files.length) await writeFiles(deps.dataDir, repository, files, 'requisitos');
  await syncProject(deps, project.id, repository, actorUserId, () => ({
    action: 'requirements_pushed',
    details: { files: files.map((file) => file.path) },
  }));
  return { written: files.map((file) => file.path) };
}

// One push per project at a time, a moment after the last edit, never in the request.
const pushTimers = new Map();
function schedulePush(deps, projectId, actorUserId, delayMs = 1500) {
  clearTimeout(pushTimers.get(projectId));
  pushTimers.set(projectId, setTimeout(async () => {
    pushTimers.delete(projectId);
    try {
      const project = await deps.loadProject(projectId);
      if (!project || !repositoryOf(project)) return;
      await pushRequirements(deps, project, actorUserId);
    } catch (error) {
      console.error(`Requisitos não chegaram ao repositório (${projectId}):`, error.message);
    }
  }, delayMs));
}

module.exports = {
  NO_REPOSITORY,
  factory,
  remoteClient: (dataDir) => factory.remoteClient(dataDir),
  repositoryOf,
  readerFor,
  readFile,
  writeFiles,
  requirementsHash,
  noteRequirements,
  specsFromSnapshot,
  pullRequirements,
  syncProject,
  pushRequirements,
  schedulePush,
  MOCKUP_ENTRY: `${workspaceFormat.ROOT}/mockup/index.html`,
};
