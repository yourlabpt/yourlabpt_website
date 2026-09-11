/**
 * Which engine runs this piece of work — and nothing else.
 *
 * The rule this module exists to hold: routing chooses the *model*. It never touches
 * tools, guidelines, knowledge, writeScope, consumes or produces. Two models compared on
 * the same job are therefore always the same persona with a different engine, which is
 * the only way the comparison means anything.
 *
 * Everything here is a pure function of its inputs, so a routing decision can be shown
 * to a person before the run and re-derived afterwards to explain what happened.
 */
const llmOptions = require('./llm-options');
const { ROLE_MODEL_PROFILES } = require('./execution-plans');

/**
 * Camadas 0-2 are refinement: text a person reads and reacts to within minutes. The
 * loop only works as a loop if it is fast and cheap, so the cheap profile is the
 * default there — not because the thinking is easy, but because the cycle time is the
 * point. From Camada 3 the usual weighting applies.
 */
const CHEAP_PROFILE = 'small';
const PLANNING_CAMADA_CEILING = 2;

/**
 * Per-persona floors, seeded from the role table that already existed and was published
 * to the frontend as `agentRoleRouting` while nothing consumed it.
 */
const PERSONA_PROFILE = {
  product_owner: ROLE_MODEL_PROFILES.requirements,
  ux: ROLE_MODEL_PROFILES.planner,
  module_architect: ROLE_MODEL_PROFILES.planner,
  orchestrator: ROLE_MODEL_PROFILES.planner,
  tech_lead: ROLE_MODEL_PROFILES.researcher,
  developer: ROLE_MODEL_PROFILES.coder,
  tester: ROLE_MODEL_PROFILES.reviewer,
};

const PROFILE_RANK = ['small', 'medium', 'large', 'high', 'long_context', 'max'];

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

function rankOf(profileId) {
  const index = PROFILE_RANK.indexOf(text(profileId));
  return index === -1 ? PROFILE_RANK.indexOf('medium') : index;
}

function stepUp(profileId) {
  return PROFILE_RANK[Math.min(PROFILE_RANK.length - 1, rankOf(profileId) + 1)];
}

/** The key a persona's record against one engine is filed under. */
function statsKey(personaId, optionId) {
  return `${text(personaId)}:${text(optionId)}`;
}

function statsFor(stats, personaId, optionId) {
  const map = stats && typeof stats === 'object' ? stats : {};
  const entry = map[statsKey(personaId, optionId)];
  return {
    runs: Number(entry?.runs) || 0,
    failures: Number(entry?.failures) || 0,
    consecutiveFailures: Number(entry?.consecutiveFailures) || 0,
    lastFailureSignature: text(entry?.lastFailureSignature),
    lastAt: text(entry?.lastAt),
  };
}

/**
 * Folds one finished run into the record for that persona and engine.
 *
 * The signal worth acting on is the *same* failure happening again on the same engine,
 * which is the shape `repeatedFailure` already uses on the Execução. A failure rate over
 * three runs is noise; a signature repeating is a model that cannot do this job.
 */
function recordOutcome(stats, { personaId, optionId, outcome, failureSignature, at } = {}) {
  const map = stats && typeof stats === 'object' ? { ...stats } : {};
  const key = statsKey(personaId, optionId);
  if (!text(personaId) || !text(optionId)) return map;
  const current = statsFor(map, personaId, optionId);
  const failed = text(outcome, 'completed') === 'failed';
  const signature = text(failureSignature);
  const repeated = failed && signature && signature === current.lastFailureSignature;
  map[key] = {
    runs: current.runs + 1,
    failures: current.failures + (failed ? 1 : 0),
    consecutiveFailures: failed ? (repeated ? current.consecutiveFailures + 1 : 1) : 0,
    lastFailureSignature: failed ? signature : '',
    lastAt: text(at, new Date().toISOString()),
  };
  return map;
}

const ESCALATE_AFTER = 2;

/**
 * Picks the engine for one run.
 *
 * Returns the chosen option, the profile shape to run it in, and a sentence saying why —
 * that sentence is what the launch confirmation shows, so "why this model" is never a
 * thing the operator has to infer.
 */
function route(input = {}) {
  const {
    personaId = '',
    camada = null,
    attempt = 0,
    stats = {},
    options: catalogue = [],
    personaProfileId = '',
    overrides = {},
  } = input;

  const available = llmOptions.listOptions(catalogue, { enabledOnly: true });
  const reasons = [];

  // 1. The persona's own configured profile is the starting point, falling back to the
  //    role floor. This is the operator's setting and is respected unless something
  //    below has a concrete reason to move.
  let profileId = text(personaProfileId, PERSONA_PROFILE[personaId] || 'medium');
  if (text(personaProfileId)) reasons.push(`perfil configurado para ${personaId || 'a persona'}`);
  else reasons.push('perfil por omissão do papel');

  // 2. Planning camadas run cheap, unless that would be an upgrade.
  const planning = Number.isInteger(camada) && camada <= PLANNING_CAMADA_CEILING;
  if (planning && rankOf(CHEAP_PROFILE) < rankOf(profileId)) {
    profileId = CHEAP_PROFILE;
    reasons.length = 0;
    reasons.push(`Camada ${camada} é refinamento: corre barato para o ciclo ser rápido`);
  }

  // 3. A per-project rule wins over both — it is a deliberate instruction.
  const override = text(overrides[personaId]) || text(overrides.default);
  if (override) {
    profileId = override;
    reasons.length = 0;
    reasons.push('regra definida para este projecto');
  }

  // 4. Pick the engine, then let a repeated failure on it move up one step. This is the
  //    only place a run's history changes the choice, and it changes the engine only.
  let option = llmOptions.fallbackOption(available, profileId);
  const record = statsFor(stats, personaId, option?.id);
  const escalated = record.consecutiveFailures >= ESCALATE_AFTER;
  if (escalated) {
    profileId = stepUp(profileId);
    const stronger = llmOptions.fallbackOption(available, profileId);
    if (stronger && stronger.id !== option?.id) {
      option = stronger;
      reasons.push(`${record.consecutiveFailures} falhas iguais seguidas no modelo anterior`);
    }
  }

  if (attempt > 0) reasons.push(`tentativa ${attempt + 1}`);

  return {
    optionId: option?.id || '',
    option,
    profileId,
    escalated,
    warnings: llmOptions.optionWarnings(option),
    reason: reasons.join(' · '),
  };
}

module.exports = {
  PERSONA_PROFILE,
  PROFILE_RANK,
  CHEAP_PROFILE,
  PLANNING_CAMADA_CEILING,
  ESCALATE_AFTER,
  statsKey,
  statsFor,
  recordOutcome,
  route,
};
