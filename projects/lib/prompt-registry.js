/**
 * The prompts behind every AI job, versioned, with what happened to each answer.
 *
 * A pack's prompt is four blocks (lib/prompt-packs.js): the method, the cut of the
 * project, the change, the contract. The method is the part that is tuned, so it is the
 * part that has versions: the repository's SKILL.md is «base», every edit made in the
 * platform is v1, v2… and exactly one is active. Every run records the version it used;
 * every proposal accepted or discarded is recorded against that run. Acceptance per
 * version is how a prompt gets better on evidence instead of on feeling.
 *
 * Kept in data/prompt-registry.json (no secrets): the versions and the last runs.
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const FILE_NAME = 'prompt-registry.json';
const MAX_RUNS = 2000;
const MAX_BODY = 40000;
const OUTCOMES = new Set(['accepted', 'discarded']);

function filePath(dataDir) { return path.join(dataDir, FILE_NAME); }

async function read(dataDir) {
  try {
    const raw = JSON.parse(await fs.readFile(filePath(dataDir), 'utf8'));
    return { packs: raw.packs && typeof raw.packs === 'object' ? raw.packs : {}, runs: Array.isArray(raw.runs) ? raw.runs : [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { packs: {}, runs: [] };
    throw error;
  }
}

// One write at a time: a run finishing while a version is saved must not lose either.
let chain = Promise.resolve();
function update(dataDir, mutate) {
  const next = chain.then(async () => {
    const registry = await read(dataDir);
    const result = await mutate(registry);
    registry.runs = registry.runs.slice(-MAX_RUNS);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(filePath(dataDir), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    return result;
  });
  chain = next.catch(() => {});
  return next;
}

/** The method a pack runs with now: the active platform version, or the repository's. */
async function activeMethod(dataDir, packId, baseBody) {
  const entry = (await read(dataDir)).packs[packId];
  const version = entry?.active && entry.active !== 'base' ? entry.versions.find((v) => v.id === entry.active) : null;
  return version ? { version: version.id, body: version.body } : { version: 'base', body: baseBody };
}

async function saveVersion(dataDir, packId, { body, note = '' }, actorUserId = '') {
  const clean = String(body || '').trim();
  if (clean.length < 20) throw new Error('O método precisa de pelo menos uma frase completa.');
  if (clean.length > MAX_BODY) throw new Error('Método grande de mais.');
  return update(dataDir, (registry) => {
    const entry = registry.packs[packId] || { active: 'base', versions: [] };
    const id = `v${entry.versions.length + 1}`;
    entry.versions.push({ id, body: clean, note: String(note).trim().slice(0, 300), createdAt: new Date().toISOString(), createdBy: actorUserId, from: entry.active });
    entry.active = id;
    registry.packs[packId] = entry;
    return id;
  });
}

async function activate(dataDir, packId, version) {
  return update(dataDir, (registry) => {
    const entry = registry.packs[packId] || { active: 'base', versions: [] };
    if (version !== 'base' && !entry.versions.some((v) => v.id === version)) throw new Error('Versão desconhecida.');
    entry.active = version;
    registry.packs[packId] = entry;
    return version;
  });
}

async function recordRun(dataDir, run) {
  const id = `run_${crypto.randomUUID()}`;
  await update(dataDir, (registry) => {
    registry.runs.push({
      id,
      packId: run.packId,
      version: run.version,
      projectId: run.projectId || '',
      at: new Date().toISOString(),
      costUsd: Math.max(0, Number(run.costUsd) || 0),
      model: String(run.model || ''),
      ok: run.ok !== false,
      dropped: Number(run.dropped) || 0,
      outcome: '',
    });
  });
  return id;
}

/** What the person did with the answer. The first word stands; a run is decided once. */
async function recordOutcome(dataDir, runId, outcome, projectId = '') {
  if (!OUTCOMES.has(outcome)) throw new Error('Resultado desconhecido.');
  return update(dataDir, (registry) => {
    const run = registry.runs.find((entry) => entry.id === runId);
    if (!run || (projectId && run.projectId && run.projectId !== projectId)) throw new Error('Execução desconhecida.');
    if (!run.outcome) Object.assign(run, { outcome, outcomeAt: new Date().toISOString() });
    return run.outcome;
  });
}

/** Per version: how often it ran, failed, and what people did with its answers. */
function statsFor(registry, packId) {
  const out = {};
  for (const run of registry.runs) {
    if (run.packId !== packId) continue;
    const s = out[run.version] || (out[run.version] = { runs: 0, failed: 0, accepted: 0, discarded: 0, costUsd: 0 });
    s.runs += 1;
    if (!run.ok) s.failed += 1;
    if (run.outcome === 'accepted') s.accepted += 1;
    if (run.outcome === 'discarded') s.discarded += 1;
    s.costUsd += run.costUsd;
  }
  for (const s of Object.values(out)) {
    const decided = s.accepted + s.discarded;
    s.acceptRate = decided ? s.accepted / decided : null;
    s.avgCostUsd = s.runs ? s.costUsd / s.runs : 0;
  }
  return out;
}

module.exports = { FILE_NAME, read, activeMethod, saveVersion, activate, recordRun, recordOutcome, statsFor };
