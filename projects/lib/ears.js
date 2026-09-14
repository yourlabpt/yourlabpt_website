/**
 * EARS — the shape a requirement is written in, and which shapes belong at which layer.
 *
 * This is a **formatter and a validator over the requirement record that already
 * exists**, not a second requirement model. `shall` is the response, `condition` is the
 * trigger, `measure` is what proves it. EARS names the relationship between them:
 *
 *   ubiquitous  O sistema deve sempre <resposta>
 *   optional    Onde <capacidade> estiver incluída, o sistema deve <resposta>
 *   event       Quando <gatilho>, o sistema deve <resposta>
 *   state       Enquanto <estado>, o sistema deve <resposta>
 *   unwanted    Se <condição inválida>, então o sistema deve <resposta>
 *
 * Why it matters here: a vision written as a trigger is not a vision, and a task written
 * as an always-true rule cannot be verified in one run. The pattern is the tell, so the
 * layer can check it — which is what turns "write it well" into something the platform
 * can actually notice.
 */
const PATTERNS = {
  ubiquitous: {
    id: 'ubiquitous',
    label: 'Sempre',
    template: 'O sistema deve sempre <resposta>.',
    needsTrigger: false,
    why: 'Uma regra que vale em todo o lado e a toda a hora.',
  },
  optional: {
    id: 'optional',
    label: 'Onde incluído',
    template: 'Onde <capacidade> estiver incluída, o sistema deve <resposta>.',
    needsTrigger: true,
    triggerLabel: 'a capacidade que tem de estar incluída',
    why: 'Vale só quando esta fatia do produto existe — que é exactamente o que uma epic é.',
  },
  event: {
    id: 'event',
    label: 'Quando',
    template: 'Quando <gatilho>, o sistema deve <resposta>.',
    needsTrigger: true,
    triggerLabel: 'o que acontece',
    why: 'Uma reacção a algo que acontece num momento.',
  },
  state: {
    id: 'state',
    label: 'Enquanto',
    template: 'Enquanto <estado>, o sistema deve <resposta>.',
    needsTrigger: true,
    triggerLabel: 'o estado em que isto vale',
    why: 'Vale durante um estado, não num instante.',
  },
  unwanted: {
    id: 'unwanted',
    label: 'Se correr mal',
    template: 'Se <condição inválida>, então o sistema deve <resposta>.',
    needsTrigger: true,
    triggerLabel: 'o que corre mal',
    why: 'O que acontece quando algo falha. Sem isto, só está escrito o caminho feliz.',
  },
};

const PATTERN_IDS = Object.keys(PATTERNS);

/**
 * Which shapes belong at which layer.
 *
 * Straight from the methodology, and the reason each is the only one that fits:
 * a vision states what is always true; an epic states what holds where it is included;
 * a feature reacts to an event or a state; a task has one testable statement plus what
 * happens when it goes wrong.
 */
const PATTERNS_BY_CAMADA = {
  0: [],
  1: ['ubiquitous'],
  2: ['optional', 'ubiquitous'],
  3: ['event', 'state'],
  4: ['event', 'state', 'unwanted'],
};

function text(value, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || fallback;
}

function describePattern(id) {
  return PATTERNS[text(id)] || null;
}

function patternsForCamada(camada) {
  const allowed = PATTERNS_BY_CAMADA[camada];
  return (allowed || []).map((id) => PATTERNS[id]);
}

/** Trailing punctuation is the serializer's job, not the author's. */
function trimClause(value) {
  return text(value).replace(/[.;,]+$/, '').trim();
}

/**
 * The requirement as one EARS sentence.
 *
 * Falls back to the bare `shall` when the pattern is unknown or the trigger it needs is
 * missing — a half-written requirement should still read as something, rather than
 * disappearing behind a template.
 */
function toSentence(requirement = {}) {
  const pattern = describePattern(requirement.earsPattern);
  const response = trimClause(requirement.shall);
  if (!response) return '';
  if (!pattern) return `${response}.`;
  const trigger = trimClause(requirement.condition);
  if (pattern.needsTrigger && !trigger) return `${response}.`;

  switch (pattern.id) {
    case 'ubiquitous': return `O sistema deve sempre ${response}.`;
    case 'optional': return `Onde ${trigger} estiver incluída, o sistema deve ${response}.`;
    case 'event': return `Quando ${trigger}, o sistema deve ${response}.`;
    case 'state': return `Enquanto ${trigger}, o sistema deve ${response}.`;
    case 'unwanted': return `Se ${trigger}, então o sistema deve ${response}.`;
    default: return `${response}.`;
  }
}

/**
 * Reads a pattern back off a sentence someone wrote by hand.
 *
 * Requirements arrive from a repository pull and from people typing, so the pattern has
 * to be recoverable from the prose rather than only ever set through a picker.
 */
function detectPattern(sentence) {
  const value = text(sentence).toLowerCase();
  if (!value) return '';
  if (/^se\b|^if\b/.test(value)) return 'unwanted';
  if (/^onde\b|^where\b/.test(value)) return 'optional';
  if (/^enquanto\b|^while\b/.test(value)) return 'state';
  if (/^quando\b|^when\b/.test(value)) return 'event';
  if (/deve sempre|shall always/.test(value)) return 'ubiquitous';
  return '';
}

/**
 * Splits an EARS sentence back into its trigger and its response.
 *
 * The inverse of `toSentence`, and it has to exist: a spec pulled from the repository
 * arrives as prose, and without this the structured `condition` is lost — the sentence
 * would survive but the fields behind it would not, so the next edit could only be made
 * by rewriting the whole line.
 */
const SHAPES = [
  { id: 'unwanted', re: /^se\s+(.+?),\s*ent[ãa]o\s+o\s+sistema\s+deve\s+(.+?)\.?$/i },
  { id: 'optional', re: /^onde\s+(.+?)\s+estiver\s+inclu[ií]da,\s*o\s+sistema\s+deve\s+(.+?)\.?$/i },
  { id: 'state', re: /^enquanto\s+(.+?),\s*o\s+sistema\s+deve\s+(.+?)\.?$/i },
  { id: 'event', re: /^quando\s+(.+?),\s*o\s+sistema\s+deve\s+(.+?)\.?$/i },
  { id: 'ubiquitous', re: /^o\s+sistema\s+deve\s+sempre\s+(.+?)\.?$/i },
];

function parseSentence(sentence) {
  const value = text(sentence);
  if (!value) return null;
  for (const shape of SHAPES) {
    const match = value.match(shape.re);
    if (!match) continue;
    return shape.id === 'ubiquitous'
      ? { earsPattern: 'ubiquitous', condition: '', shall: trimClause(match[1]) }
      : { earsPattern: shape.id, condition: trimClause(match[1]), shall: trimClause(match[2]) };
  }
  return null;
}

/**
 * What is wrong with how this requirement is written, at this layer.
 *
 * Findings, not refusals — the same rule the rest of the policy follows. A requirement
 * in the wrong shape is still a requirement; it just will not survive contact with the
 * layer below.
 */
function findings(requirement = {}, camada = null) {
  const out = [];
  const patternId = text(requirement.earsPattern);
  const pattern = describePattern(patternId);

  if (!text(requirement.shall)) {
    out.push({
      code: 'sem-resposta',
      message: 'Este requisito não diz o que o sistema faz. Sem isso não há nada para verificar.',
    });
    return out;
  }

  if (!patternId) {
    out.push({
      code: 'sem-padrao',
      message: 'Este requisito não diz em que forma está escrito, por isso ninguém pode confirmar que é a forma certa para esta camada.',
    });
  } else if (!pattern) {
    out.push({ code: 'padrao-desconhecido', message: `Forma desconhecida: ${patternId}.` });
  } else if (pattern.needsTrigger && !text(requirement.condition)) {
    out.push({
      code: 'sem-gatilho',
      message: `«${pattern.label}» precisa de dizer ${pattern.triggerLabel}. Sem isso é uma regra que vale sempre, escrita como se não valesse.`,
    });
  }

  const allowed = PATTERNS_BY_CAMADA[camada];
  if (allowed && pattern && !allowed.includes(pattern.id)) {
    const names = allowed.map((id) => `«${PATTERNS[id].label}»`).join(' ou ');
    out.push({
      code: 'padrao-fora-da-camada',
      message: `Na Camada ${camada} um requisito escreve-se como ${names}, não como «${pattern.label}». ${PATTERNS[allowed[0]].why}`,
    });
  }

  return out;
}

/** One sentence for the interface, or empty when it is written correctly. */
function summary(requirement, camada = null) {
  return findings(requirement, camada)[0]?.message || '';
}

module.exports = {
  PATTERNS,
  PATTERNS_BY_CAMADA,
  PATTERN_IDS,
  describePattern,
  detectPattern,
  parseSentence,
  findings,
  patternsForCamada,
  summary,
  toSentence,
};
