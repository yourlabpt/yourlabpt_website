/**
 * Platform-wide agent execution defaults (single source of truth for new runs).
 */
const fs = require('fs').promises;
const path = require('path');
const workItems = require('./work-items');
const agentPersonas = require('./agent-personas');
const llmOptions = require('./llm-options');
const modelRouting = require('./model-routing');

const FILE_NAME = 'agent-platform-settings.json';

const DEFAULT_EXECUTION = {
  agentId: '',
  modelProfileId: 'medium',
  tokenBudgetMode: 'auto',
  maxTokens: 0,
  externalTokenBudgetMode: 'limited',
  externalMaxTokens: 120000,
  maxCost: 0,
  maxWallClockMinutes: 0,
  targetInputTokens: 14000,
  targetOutputTokens: 2500,
  planningWaveSize: 8,
  maxTotalSteps: 0,
  checkpointIntervalSeconds: 30,
  goalCheckInterval: 3,
  enableWebSearch: true,
  pauseForSubtaskReview: false,
  allowedMcpTools: [],
};

function settingsPath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

function stripNormalizedTokenPolicy(settings = {}) {
  if (!settings || typeof settings !== 'object') return {};
  const { tokenPolicy, ...rest } = settings;
  return {
    ...rest,
    ...(tokenPolicy?.external?.mode === 'limited' && tokenPolicy.external.maxTokens
      ? { externalMaxTokens: tokenPolicy.external.maxTokens, externalTokenBudgetMode: 'limited' }
      : {}),
    ...(tokenPolicy?.local?.mode === 'limited' && tokenPolicy.local.maxTokens
      ? { maxTokens: tokenPolicy.local.maxTokens, tokenBudgetMode: 'limited' }
      : {}),
  };
}

function normalizePlatformSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const executionDefaults = workItems.normalizeExecutionSettings({
    ...DEFAULT_EXECUTION,
    ...(src.executionDefaults || {}),
    costPolicy: {
      mode: Number(src.executionDefaults?.maxCost) > 0 ? 'limited' : 'unlimited',
      maxCost: Number(src.executionDefaults?.maxCost) || 0,
    },
    checkpointPolicy: {
      intervalSeconds: Number(src.executionDefaults?.checkpointIntervalSeconds) || DEFAULT_EXECUTION.checkpointIntervalSeconds,
    },
    reviewPolicy: {
      subtask: src.executionDefaults?.pauseForSubtaskReview === true ? 'blocking' : 'non_blocking',
      parent: 'required',
    },
  });
  return {
    schemaVersion: 3,
    executionDefaults,
    personas: agentPersonas.normalizePersonaOverrides(src.personas),
    // The engines available to every persona, edited in Definições da plataforma.
    llmOptions: llmOptions.normalizeOptions(src.llmOptions),
    // What each persona × engine pairing has actually done. Bounded by construction:
    // personas × options, so it is a map rather than a table.
    personaModelStats: normalizeStats(src.personaModelStats),
    updatedAt: workItems.textOr(src.updatedAt),
    updatedBy: workItems.textOr(src.updatedBy),
  };
}

function normalizeStats(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(src)) {
    const [personaId, optionId] = String(key).split(':');
    if (!personaId || !optionId) continue;
    out[key] = modelRouting.statsFor(src, personaId, optionId);
  }
  return out;
}

async function readAgentPlatformSettings(dataDir) {
  try {
    const raw = await fs.readFile(settingsPath(dataDir), 'utf8');
    return normalizePlatformSettings(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizePlatformSettings({});
    throw error;
  }
}

async function writeAgentPlatformSettings(dataDir, patch = {}, actorUserId = '') {
  const current = await readAgentPlatformSettings(dataDir);
  const next = normalizePlatformSettings({
    ...current,
    executionDefaults: {
      ...stripNormalizedTokenPolicy(current.executionDefaults),
      ...(patch.executionDefaults || {}),
    },
    personas: patch.personas && typeof patch.personas === 'object'
      ? { ...current.personas, ...patch.personas }
      : current.personas,
    // Replaced wholesale, not merged: removing an option has to be possible.
    llmOptions: Array.isArray(patch.llmOptions) ? patch.llmOptions : current.llmOptions,
    personaModelStats: patch.personaModelStats && typeof patch.personaModelStats === 'object'
      ? patch.personaModelStats
      : current.personaModelStats,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(settingsPath(dataDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function mergeWithPlatformDefaults(taskSettings, platformSettings, personaId = '') {
  const settings = normalizePlatformSettings(platformSettings);
  const platform = settings.executionDefaults;
  const task = taskSettings && typeof taskSettings === 'object' ? taskSettings : {};
  const persona = agentPersonas.isPersonaId(personaId)
    ? agentPersonas.resolvePersona(personaId, settings.personas)
    : null;
  const merged = workItems.normalizeExecutionSettings({
    ...stripNormalizedTokenPolicy(platform),
    ...(persona ? {
      modelProfileId: persona.modelProfileId,
      ...(persona.agentId ? { agentId: persona.agentId } : {}),
      ...(persona.maxTokens ? { maxTokens: persona.maxTokens, tokenBudgetMode: 'limited' } : {}),
      ...(persona.maxWallClockMinutes
        ? { maxWallClockMinutes: persona.maxWallClockMinutes, timeLimitEnabled: true }
        : {}),
      ...(persona.maxSubtasks ? { planningWaveSize: persona.maxSubtasks } : {}),
    } : {}),
    ...stripNormalizedTokenPolicy(task),
    allowedMcpTools: task.allowedMcpTools?.length
      ? task.allowedMcpTools
      : (persona?.allowedTools?.length ? persona.allowedTools : platform.allowedMcpTools),
  });
  return merged;
}

/**
 * The routing decision for one persona, assembled from stored settings.
 *
 * Kept here so callers pass what they know (who, which camada, which attempt) and the
 * settings supply the rest. `model-routing.route` stays pure and independently testable.
 */
function routeForPersona(platformSettings, { personaId = '', camada = null, attempt = 0 } = {}) {
  const settings = normalizePlatformSettings(platformSettings);
  const persona = agentPersonas.isPersonaId(personaId)
    ? agentPersonas.resolvePersona(personaId, settings.personas)
    : null;
  return modelRouting.route({
    personaId,
    camada,
    attempt,
    stats: settings.personaModelStats,
    options: settings.llmOptions,
    personaProfileId: persona?.modelProfileId || '',
    overrides: settings.routingOverrides || {},
  });
}

module.exports = {
  DEFAULT_EXECUTION,
  normalizePlatformSettings,
  readAgentPlatformSettings,
  writeAgentPlatformSettings,
  mergeWithPlatformDefaults,
  routeForPersona,
};
