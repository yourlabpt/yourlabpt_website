/**
 * The engines available to the personas — configured here, in the platform.
 *
 * A persona is a role: what it may write, what it reads, what it produces. An LLM option
 * is only the engine that executes that role on a given run. The two are deliberately
 * separate, and that separation is what makes "the same job, two models" a fair
 * comparison rather than two different jobs.
 *
 * The runtime keeps its own `config/models.yaml`; that is the fallback for a run the
 * platform did not choose for. When the platform names an option, the option wins.
 *
 * Prices are USD per 1M tokens and feed the Execução cost cap. A wrong price does not
 * fail loudly — it silently mis-reports spend — so `pricing` is worth checking against
 * the provider's own catalogue rather than trusting a default.
 */
const { MODEL_PROFILES } = require('./execution-plans');

const PROFILE_IDS = Object.keys(MODEL_PROFILES);

/**
 * Seeded from the runtime's tiers so a fresh install has something that runs. Edit them
 * in Definições da plataforma → Modelos; add your own with the same shape.
 */
const SEED_OPTIONS = [
  {
    id: 'deepinfra-v3',
    label: 'DeepSeek V3 (DeepInfra)',
    provider: 'deepinfra',
    model: 'deepseek-ai/DeepSeek-V3',
    profileId: 'medium',
    pricing: { inputPer1M: 0.27, outputPer1M: 1.10 },
    enabled: true,
  },
  {
    id: 'deepinfra-r1',
    label: 'DeepSeek R1 (DeepInfra)',
    provider: 'deepinfra',
    model: 'deepseek-ai/DeepSeek-R1',
    profileId: 'max',
    pricing: { inputPer1M: 0.55, outputPer1M: 2.19 },
    enabled: true,
  },
  {
    id: 'ollama-local',
    label: 'Llama 3.1 8B (local)',
    provider: 'ollama',
    model: 'llama3.1:8b',
    profileId: 'small',
    // Local inference costs no tokens. Electricity is not a number this platform tracks.
    pricing: { inputPer1M: 0, outputPer1M: 0 },
    enabled: false,
  },
];

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeOption(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = slug(src.id);
  const model = text(src.model);
  if (!id || !model) return null;
  const profileId = PROFILE_IDS.includes(text(src.profileId)) ? text(src.profileId) : 'medium';
  return {
    id,
    label: text(src.label, model),
    provider: slug(src.provider) || 'deepinfra',
    model,
    // Which run *shape* this engine is used with — token targets and response guidance.
    // The engine and the shape are separate choices; this says which shape suits it.
    profileId,
    pricing: {
      inputPer1M: money(src.pricing?.inputPer1M),
      outputPer1M: money(src.pricing?.outputPer1M),
    },
    // An unpriced hosted option cannot be held to a cost cap. Say so rather than
    // letting it read as free.
    pricingVerified: src.pricingVerified === true,
    enabled: src.enabled !== false,
    notes: text(src.notes),
  };
}

/** The catalogue, always non-empty: an empty list would leave nothing able to run. */
function normalizeOptions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const options = [];
  for (const entry of list) {
    const option = normalizeOption(entry);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options.length ? options : SEED_OPTIONS.map(normalizeOption);
}

function listOptions(raw, { enabledOnly = false } = {}) {
  const options = normalizeOptions(raw);
  return enabledOnly ? options.filter((option) => option.enabled) : options;
}

function findOption(raw, optionId) {
  return normalizeOptions(raw).find((option) => option.id === slug(optionId)) || null;
}

/**
 * The option to use when a chosen one is missing or switched off.
 *
 * Prefers an enabled option carrying the wanted profile, then any enabled option. Never
 * returns nothing: a run with no engine is a dead end the operator cannot diagnose.
 */
function fallbackOption(raw, profileId = '') {
  const enabled = listOptions(raw, { enabledOnly: true });
  const pool = enabled.length ? enabled : normalizeOptions(raw);
  return pool.find((option) => option.profileId === slug(profileId)) || pool[0] || null;
}

/**
 * What travels to the runtime. The runtime prefers this over its own tier table, so it
 * must carry everything needed to bill and to call: who, which model, at what price.
 */
function wireSpec(option) {
  if (!option) return null;
  return {
    optionId: option.id,
    provider: option.provider,
    model: option.model,
    pricing: { ...option.pricing },
  };
}

/** Problems worth showing beside the option, in the operator's own terms. */
function optionWarnings(option) {
  const warnings = [];
  if (!option) return warnings;
  const priced = option.pricing.inputPer1M > 0 || option.pricing.outputPer1M > 0;
  if (option.provider !== 'ollama' && !priced) {
    warnings.push('Sem preço definido: o custo desta execução conta como zero e o limite nunca trava.');
  }
  if (priced && !option.pricingVerified) {
    warnings.push('Preço por confirmar no catálogo do fornecedor.');
  }
  return warnings;
}

module.exports = {
  SEED_OPTIONS,
  PROFILE_IDS,
  normalizeOption,
  normalizeOptions,
  listOptions,
  findOption,
  fallbackOption,
  wireSpec,
  optionWarnings,
};
