/**
 * Runs OpenSpec against a project's linked repository.
 *
 * Reading is free. Writing always goes through a branch and a change request — the
 * platform never pushes to the default branch, so a bad generation is reviewable and
 * revertible instead of landing straight on main.
 */
const openspecFormat = require('./openspec-format');
const openspecSync = require('./openspec-sync');

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function specCapabilityFromPath(filePath) {
  const match = String(filePath).match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
  return match ? match[1] : '';
}

/** Reads every capability spec that exists in the repository today. */
async function readSpecs(client, repository, ref = '') {
  const branch = ref || repository.defaultBranch;
  const paths = await client.listTree(repository.owner, repository.name, `${openspecFormat.SPEC_ROOT}/specs/`, branch);
  const specPaths = paths.filter((entry) => specCapabilityFromPath(entry));
  const specs = [];
  for (const filePath of specPaths) {
    const content = await client.readFile(repository.owner, repository.name, filePath, branch);
    if (!content) continue;
    specs.push(openspecFormat.parseSpec(content, { capability: specCapabilityFromPath(filePath) }));
  }
  return specs;
}

async function readProjectDoc(client, repository, ref = '') {
  return client.readFile(
    repository.owner,
    repository.name,
    `${openspecFormat.SPEC_ROOT}/project.md`,
    ref || repository.defaultBranch
  );
}

async function isInitialized(client, repository, ref = '') {
  return Boolean(await readProjectDoc(client, repository, ref));
}

/**
 * Writes a set of files on a new branch and opens a change request for them.
 * Returns the branch and the change request so the caller can show a link.
 */
/**
 * Commits files on the repository's default branch. No side branch and no change
 * request: every save from the platform used to open one, and a repository full of
 * `yourlab/…` and `openspec/…` branches is noise, not review. The person reviews in
 * the platform before pressing the button; git history keeps the rest.
 */
async function commitFilesForReview(client, repository, { files, title, commitMessage }) {
  if (!files.length) throw new Error('Nada para escrever.');
  const base = repository.defaultBranch;
  for (const file of files) {
    await client.writeFile(repository.owner, repository.name, file.path, file.content, {
      branch: base,
      message: commitMessage || title,
    });
  }
  return { branch: base, base, files: files.map((file) => file.path), changeRequest: null };
}

function branchName(prefix) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `${prefix}/${stamp}`;
}

/**
 * Scaffolds openspec/ in a repository that does not have it yet, seeded from whatever
 * the platform already knows. A brand new project produces an empty but valid tree.
 */
async function initialize(client, repository, project, requirements) {
  if (await isInitialized(client, repository)) {
    throw new Error('Este repositorio ja tem uma pasta openspec/.');
  }
  const { files, specs } = openspecSync.buildRepositoryFiles(project, requirements);
  const result = await commitFilesForReview(client, repository, {
    files,
    branch: branchName('openspec/init'),
    title: 'Adicionar OpenSpec ao repositorio',
    body: [
      'Estrutura OpenSpec criada pela plataforma.',
      '',
      `Capacidades: ${specs.length ? specs.map((spec) => `\`${spec.capability}\``).join(', ') : 'nenhuma ainda'}.`,
      '',
      'A partir daqui a especificacao vive no repositorio.',
    ].join('\n'),
    commitMessage: 'docs(openspec): estrutura inicial',
  });
  return { ...result, specs };
}

/** Forward: platform requirements become the repository's specs. */
async function push(client, repository, project, requirements) {
  const { files, specs } = openspecSync.buildRepositoryFiles(project, requirements);
  const repositorySpecs = await readSpecs(client, repository);
  const diff = openspecSync.diffSpecs(specs, repositorySpecs);
  if (diff.inSync) return { skipped: true, reason: 'Repositorio ja esta sincronizado.', diff };
  const result = await commitFilesForReview(client, repository, {
    files,
    branch: branchName('openspec/sync'),
    title: 'Actualizar OpenSpec a partir da plataforma',
    body: [
      'Especificacao gerada a partir dos requisitos da plataforma.',
      '',
      `Diferencas: ${diff.summary.onlyInPlatform} so na plataforma, ${diff.summary.onlyInRepository} so no repositorio, ${diff.summary.differs} divergentes.`,
    ].join('\n'),
    commitMessage: 'docs(openspec): sincronizar com a plataforma',
  });
  return { ...result, specs, diff };
}

/**
 * Backward: the repository's specs become platform requirement records.
 * Returns a plan; the caller decides whether to apply it.
 */
async function pull(client, repository, { existingRequirements = [] } = {}) {
  const specs = await readSpecs(client, repository);
  if (!specs.length) {
    return { specs: [], requirements: [], diff: null, empty: true };
  }
  const requirements = openspecSync.buildRequirementsFromSpecs(specs, { existingRequirements });
  const platformSpecs = openspecSync.buildSpecsFromRequirements(existingRequirements);
  return {
    specs,
    requirements,
    diff: openspecSync.diffSpecs(platformSpecs, specs),
    empty: false,
  };
}

/** Drift report, without changing anything on either side. */
async function status(client, repository, requirements) {
  const repositorySpecs = await readSpecs(client, repository);
  const platformSpecs = openspecSync.buildSpecsFromRequirements(requirements);
  return {
    initialized: await isInitialized(client, repository),
    repositoryCapabilities: repositorySpecs.map((spec) => spec.capability),
    platformCapabilities: platformSpecs.map((spec) => spec.capability),
    repositoryRequirementCount: repositorySpecs.reduce((total, spec) => total + spec.requirements.length, 0),
    platformRequirementCount: platformSpecs.reduce((total, spec) => total + spec.requirements.length, 0),
    diff: openspecSync.diffSpecs(platformSpecs, repositorySpecs),
  };
}

/** Opens a change proposal under openspec/changes/<id>/. */
async function proposeChange(client, repository, change) {
  const changeId = openspecFormat.slugify(change.id || change.title, 'mudanca');
  const files = [
    { path: openspecFormat.changePath(changeId, 'proposal.md'), content: openspecFormat.serializeProposal({ ...change, id: changeId }) },
    { path: openspecFormat.changePath(changeId, 'tasks.md'), content: openspecFormat.serializeTasks(change.tasks || []) },
  ];
  for (const [capability, delta] of Object.entries(change.deltas || {})) {
    files.push({
      path: openspecFormat.changePath(changeId, `specs/${openspecFormat.slugify(capability)}/spec.md`),
      content: openspecFormat.serializeDelta(capability, delta),
    });
  }
  const result = await commitFilesForReview(client, repository, {
    files,
    branch: branchName(`openspec/change-${changeId}`),
    title: text(change.title, 'Proposta de alteracao'),
    body: text(change.why),
    commitMessage: `docs(openspec): proposta ${changeId}`,
  });
  return { ...result, changeId };
}

module.exports = {
  branchName,
  commitFilesForReview,
  initialize,
  isInitialized,
  proposeChange,
  pull,
  push,
  readProjectDoc,
  readSpecs,
  specCapabilityFromPath,
  status,
};
