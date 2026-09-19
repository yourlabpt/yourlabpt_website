/**
 * Reading a project's yourlab/ folder and OpenSpec specs out of its repository.
 *
 * Two readers with one shape. The server's working copy on disk, when the project has
 * one — fast, exact, and it works with no git provider connected. Otherwise the git
 * provider's API, at the default branch. Both return plain text; workspace-format turns
 * it into the snapshot. Nothing here writes.
 */
const fs = require('fs');
const path = require('path');
const format = require('./workspace-format');

// A repository with more than this under yourlab/ is not being used as the guide says.
const MAX_FILES = 400;

function createLocalReader(root) {
  const base = path.resolve(root);

  /** Refuses anything that would step outside the working copy. */
  const inside = (relative) => {
    const full = path.resolve(base, relative);
    if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Caminho fora do repositório.');
    return full;
  };

  return {
    kind: 'local',
    ref: '',
    async listTree(prefix) {
      const out = [];
      const walk = async (dir) => {
        let entries;
        try {
          entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => (a.name < b.name ? -1 : 1));
        for (const entry of entries) {
          if (out.length >= MAX_FILES) return;
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
        }
      };
      await walk(inside(prefix));
      return out;
    },
    async readFile(relative) {
      try {
        return await fs.promises.readFile(inside(relative), 'utf8');
      } catch {
        return '';
      }
    },
  };
}

function createRemoteReader(client, repository, ref = '') {
  const branch = ref || repository.defaultBranch;
  return {
    kind: 'remote',
    ref: branch,
    listTree: (prefix) => client.listTree(repository.owner, repository.name, prefix, branch),
    readFile: async (relative) => (await client.readFile(repository.owner, repository.name, relative, branch)) || '',
  };
}

function localPathUsable(repository) {
  const localPath = repository?.localPath;
  if (!localPath) return false;
  try {
    return fs.statSync(localPath).isDirectory();
  } catch {
    return false;
  }
}

/** The local working copy when there is one; the provider otherwise. */
async function pickReader(repository, { remoteClient, ref = '' } = {}) {
  if (localPathUsable(repository)) return createLocalReader(repository.localPath);
  if (typeof remoteClient !== 'function') {
    throw new Error('Sem cópia local nem ligação ao Git. Ligue a conta em Definições da plataforma.');
  }
  return createRemoteReader(await remoteClient(), repository, ref);
}

async function collectFiles(reader) {
  const listed = [
    ...await reader.listTree(`${format.ROOT}/`),
    ...await reader.listTree(format.SPEC_PREFIX),
  ];
  const paths = [...new Set(listed.map(String))].filter(format.isReadablePath).sort().slice(0, MAX_FILES);
  const files = [];
  for (const filePath of paths) files.push({ path: filePath, content: await reader.readFile(filePath) });
  return files;
}

async function syncWorkspace(repository, options = {}) {
  const reader = await pickReader(repository, options);
  const files = await collectFiles(reader);
  return { snapshot: format.readWorkspace(files), source: reader.kind, ref: reader.ref };
}

module.exports = { createLocalReader, createRemoteReader, pickReader, collectFiles, syncWorkspace, localPathUsable, MAX_FILES };
