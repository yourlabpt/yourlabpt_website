/**
 * LLM provider credentials — the API key and endpoint a provider is actually reached
 * with, configured once in the platform instead of in a `.env` file on whichever
 * machine runs the Agent Runtime.
 *
 * Mirrors `lib/git-provider-settings.js`: encrypted at rest via `secret-box`, in its
 * own gitignored file, never in the tracked data JSON. `lib/llm-options.js` stays the
 * catalogue of engines a persona can pick (id/model/pricing); this is the credential
 * behind whichever provider an option names.
 */
const fs = require('fs').promises;
const path = require('path');
const secretBox = require('./secret-box');

const FILE_NAME = 'llm-provider.secret.json';

const PROVIDER_DEFS = {
  deepinfra: {
    label: 'DeepInfra',
    defaultApiBaseUrl: 'https://api.deepinfra.com/v1/openai',
    needsApiKey: true,
    // Hosted OpenAI-compatible APIs expose /models; Ollama exposes /api/tags instead.
    healthPath: '/models',
  },
  ollama: {
    label: 'Ollama (local)',
    defaultApiBaseUrl: 'http://127.0.0.1:11434/v1',
    needsApiKey: false,
    healthPath: '/api/tags',
  },
};

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function normalizeProviderId(id) {
  const key = text(id).toLowerCase();
  return PROVIDER_DEFS[key] ? key : 'deepinfra';
}

function settingsPath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

function normalizeProviderEntry(providerId, raw = {}) {
  const def = PROVIDER_DEFS[providerId];
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    apiBaseUrl: text(src.apiBaseUrl, def.defaultApiBaseUrl),
    apiKey: src.apiKey && typeof src.apiKey === 'object' ? src.apiKey : null,
    verifiedAt: text(src.verifiedAt),
    verifiedModel: text(src.verifiedModel),
    lastError: text(src.lastError),
    updatedAt: text(src.updatedAt),
    updatedBy: text(src.updatedBy),
  };
}

function normalizeSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const providers = {};
  for (const id of Object.keys(PROVIDER_DEFS)) {
    providers[id] = normalizeProviderEntry(id, src.providers?.[id]);
  }
  return { schemaVersion: 1, providers };
}

async function readLlmProviderSettings(dataDir) {
  try {
    const raw = await fs.readFile(settingsPath(dataDir), 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizeSettings({});
    throw error;
  }
}

async function persist(dataDir, settings) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(settingsPath(dataDir), `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.chmod(settingsPath(dataDir), 0o600).catch(() => {});
  return settings;
}

/**
 * `patch.apiKey` absent leaves the stored credential alone; `''` clears it; anything
 * else replaces it. Changing the key or the base URL invalidates a previous
 * verification — the platform must not keep showing green for a credential that has
 * since changed underneath it.
 */
async function writeProviderSettings(dataDir, providerId, patch = {}, actorUserId = '') {
  const id = normalizeProviderId(providerId);
  const current = await readLlmProviderSettings(dataDir);
  const src = patch && typeof patch === 'object' ? patch : {};

  let apiKey = current.providers[id].apiKey;
  if (src.apiKey !== undefined) {
    const incoming = text(src.apiKey);
    apiKey = incoming ? secretBox.encryptSecret(dataDir, incoming) : null;
  }

  const credentialChanged = src.apiKey !== undefined || src.apiBaseUrl !== undefined;
  const nextEntry = normalizeProviderEntry(id, {
    ...current.providers[id],
    ...(src.apiBaseUrl !== undefined ? { apiBaseUrl: src.apiBaseUrl } : {}),
    apiKey,
    ...(credentialChanged ? { verifiedAt: '', verifiedModel: '', lastError: '' } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  });

  const next = normalizeSettings({ ...current, providers: { ...current.providers, [id]: nextEntry } });
  return persist(dataDir, next);
}

async function markProviderResult(dataDir, providerId, { ok, model, error } = {}) {
  const id = normalizeProviderId(providerId);
  const current = await readLlmProviderSettings(dataDir);
  const nextEntry = normalizeProviderEntry(id, {
    ...current.providers[id],
    ...(ok
      ? { verifiedAt: new Date().toISOString(), verifiedModel: text(model), lastError: '' }
      : { lastError: text(error, 'Falha desconhecida.') }),
  });
  const next = normalizeSettings({ ...current, providers: { ...current.providers, [id]: nextEntry } });
  return persist(dataDir, next);
}

/** Never returns a key. `apiKeyFingerprint` proves which one is stored without it. */
function publicSettings(settings, dataDir) {
  const value = normalizeSettings(settings);
  const providers = {};
  for (const id of Object.keys(PROVIDER_DEFS)) {
    const def = PROVIDER_DEFS[id];
    const entry = value.providers[id];
    const hasApiKey = Boolean(entry.apiKey?.data);
    providers[id] = {
      id,
      label: def.label,
      needsApiKey: def.needsApiKey,
      apiBaseUrl: entry.apiBaseUrl,
      hasApiKey,
      apiKeyFingerprint: text(entry.apiKey?.fingerprint),
      verifiedAt: entry.verifiedAt,
      verifiedModel: entry.verifiedModel,
      lastError: entry.lastError,
      // Whether this provider is currently usable at all, before ever calling it.
      ready: def.needsApiKey ? hasApiKey : true,
    };
  }
  return {
    schemaVersion: value.schemaVersion,
    providers,
    keySource: dataDir ? secretBox.keySource(dataDir) : 'unknown',
  };
}

/** Decrypted credential for internal use only (dispatch, verify) — never sent to a client as-is. */
async function resolveProviderCredential(dataDir, providerId) {
  const id = normalizeProviderId(providerId);
  const def = PROVIDER_DEFS[id];
  const settings = await readLlmProviderSettings(dataDir);
  const entry = settings.providers[id];
  const apiKey = entry.apiKey?.data ? secretBox.decryptSecret(dataDir, entry.apiKey) : '';
  if (def.needsApiKey && !apiKey) return null;
  return { provider: id, apiBaseUrl: entry.apiBaseUrl || def.defaultApiBaseUrl, apiKey };
}

/**
 * Calls the provider directly with the stored credential and records the outcome, so
 * "saved" and "actually works" are never confused. `fetchImpl` is injectable for tests.
 */
async function verifyProvider(dataDir, providerId, fetchImpl = fetch) {
  const id = normalizeProviderId(providerId);
  const def = PROVIDER_DEFS[id];
  const credential = await resolveProviderCredential(dataDir, id);
  if (!credential) {
    const settings = await markProviderResult(dataDir, id, { ok: false, error: 'Falta a chave da API.' });
    throw Object.assign(new Error('Falta a chave da API.'), { settings });
  }

  const root = credential.apiBaseUrl.replace(/\/+$/, '');
  const url = `${def.healthPath.startsWith('/api/') ? root.replace(/\/v1$/, '') : root}${def.healthPath}`;
  const headers = credential.apiKey ? { Authorization: `Bearer ${credential.apiKey}` } : {};

  let response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    const message = `Sem resposta de ${def.label}: ${error.message}`;
    const settings = await markProviderResult(dataDir, id, { ok: false, error: message });
    throw Object.assign(new Error(message), { settings });
  }

  if (!response.ok) {
    // Never echo the response body of an auth failure — it can carry the key back.
    const message = response.status === 401 || response.status === 403
      ? `${def.label} rejeitou a credencial (${response.status}).`
      : `${def.label} respondeu ${response.status}.`;
    const settings = await markProviderResult(dataDir, id, { ok: false, error: message });
    throw Object.assign(new Error(message), { settings });
  }

  const body = await response.json().catch(() => ({}));
  const models = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  const sampleModel = text(models[0]?.id || models[0]?.name || models[0]?.model);
  const settings = await markProviderResult(dataDir, id, { ok: true, model: sampleModel });
  return { settings, modelCount: models.length, sampleModel };
}

module.exports = {
  FILE_NAME,
  PROVIDER_DEFS,
  markProviderResult,
  normalizeProviderId,
  normalizeSettings,
  publicSettings,
  readLlmProviderSettings,
  resolveProviderCredential,
  verifyProvider,
  writeProviderSettings,
};
