/**
 * EARS — the shape a requirement is written in, and which shapes belong at which layer.
 *
 * This is a formatter and a validator over `shall` / `condition` / `measure`, which
 * already existed. The properties worth pinning: the sentence round-trips through a
 * spec.md without growing, and the layer rules are data the drift check can guard.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const ears = require('../lib/ears');
const buildPolicies = require('../lib/build-policies');
const openspec = require('../lib/openspec-format');

describe('the five shapes', () => {
  const cases = [
    ['ubiquitous', {}, 'O sistema deve sempre registar quem alterou.'],
    ['optional', { condition: 'a gestão de mesas' }, 'Onde a gestão de mesas estiver incluída, o sistema deve registar quem alterou.'],
    ['event', { condition: 'a reserva é confirmada' }, 'Quando a reserva é confirmada, o sistema deve registar quem alterou.'],
    ['state', { condition: 'o restaurante está cheio' }, 'Enquanto o restaurante está cheio, o sistema deve registar quem alterou.'],
    ['unwanted', { condition: 'o email não sair' }, 'Se o email não sair, então o sistema deve registar quem alterou.'],
  ];

  for (const [pattern, extra, expected] of cases) {
    it(`writes ${pattern} as one sentence`, () => {
      assert.equal(ears.toSentence({ earsPattern: pattern, shall: 'registar quem alterou', ...extra }), expected);
    });
  }

  it('does not double the punctuation the author already typed', () => {
    assert.equal(
      ears.toSentence({ earsPattern: 'ubiquitous', shall: 'registar quem alterou.' }),
      'O sistema deve sempre registar quem alterou.',
    );
  });

  it('falls back to the bare statement rather than hiding a half-written requirement', () => {
    // A pattern that needs a trigger and has none still has to read as something.
    assert.equal(ears.toSentence({ earsPattern: 'event', shall: 'enviar o email' }), 'enviar o email.');
    assert.equal(ears.toSentence({ shall: 'enviar o email' }), 'enviar o email.');
    assert.equal(ears.toSentence({ earsPattern: 'event', condition: 'x' }), '');
  });
});

describe('reading a shape back off prose', () => {
  it('recognises each opening', () => {
    assert.equal(ears.detectPattern('Se o email falhar, então o sistema deve avisar.'), 'unwanted');
    assert.equal(ears.detectPattern('Onde a gestão estiver incluída, o sistema deve X.'), 'optional');
    assert.equal(ears.detectPattern('Enquanto estiver cheio, o sistema deve X.'), 'state');
    assert.equal(ears.detectPattern('Quando confirmar, o sistema deve X.'), 'event');
    assert.equal(ears.detectPattern('O sistema deve sempre X.'), 'ubiquitous');
  });

  it('says nothing rather than guessing at free prose', () => {
    assert.equal(ears.detectPattern('Isto devia ser rápido.'), '');
    assert.equal(ears.detectPattern(''), '');
  });

  it('splits a sentence back into its trigger and its response', () => {
    const parsed = ears.parseSentence('Quando a reserva é confirmada, o sistema deve enviar o email.');
    assert.deepEqual(parsed, {
      earsPattern: 'event',
      condition: 'a reserva é confirmada',
      shall: 'enviar o email',
    });
  });

  it('returns nothing for a sentence that is not in any shape', () => {
    assert.equal(ears.parseSentence('Texto livre.'), null);
  });
});

describe('a spec.md round-trips without growing', () => {
  const spec = {
    capability: 'reservas',
    title: 'Reservas',
    purpose: '',
    requirements: [
      { id: 'FR-001', type: 'functional', title: 'Confirmar', earsPattern: 'event', condition: 'a reserva é confirmada', shall: 'enviar o email', scenarios: [] },
      { id: 'RNF-001', type: 'non_functional', title: 'Auditoria', earsPattern: 'ubiquitous', shall: 'registar quem alterou', scenarios: [] },
      { id: 'FR-002', type: 'functional', title: 'Livre', shall: 'Alguma coisa escrita à mão', scenarios: [] },
    ],
  };

  it('keeps the structured fields, not only the prose', () => {
    const back = openspec.parseSpec(openspec.serializeSpec(spec));
    const first = back.requirements.find((entry) => entry.id === 'FR-001');
    assert.equal(first.earsPattern, 'event');
    assert.equal(first.condition, 'a reserva é confirmada');
    assert.equal(first.shall, 'enviar o email');
  });

  it('does not wrap the sentence again on every cycle', () => {
    let markdown = openspec.serializeSpec(spec);
    let last = null;
    for (let pass = 0; pass < 3; pass += 1) {
      const back = openspec.parseSpec(markdown);
      const current = back.requirements.map((entry) => `${entry.earsPattern}|${entry.condition}|${entry.shall}`);
      if (last) assert.deepEqual(current, last, 'a round trip must be idempotent');
      last = current;
      markdown = openspec.serializeSpec({ ...spec, requirements: back.requirements });
    }
    assert.match(last[0], /^event\|a reserva é confirmada\|enviar o email$/);
  });

  it('recovers the shape from a spec edited by hand in the repository', () => {
    const withoutMeta = openspec.serializeSpec(spec).replace(/; ears=[a-z]+/g, '');
    const back = openspec.parseSpec(withoutMeta);
    assert.equal(back.requirements.find((entry) => entry.id === 'FR-001').earsPattern, 'event');
  });

  it('leaves a free-prose requirement exactly as written', () => {
    const back = openspec.parseSpec(openspec.serializeSpec(spec));
    const free = back.requirements.find((entry) => entry.id === 'FR-002');
    assert.equal(free.earsPattern, '');
    assert.equal(free.shall, 'Alguma coisa escrita à mão.');
  });
});

describe('each layer has its own way of writing a requirement', () => {
  it('allows only always-true statements at Camada 1', () => {
    assert.deepEqual(buildPolicies.earsPatternsForCamada('web_app', 1), ['ubiquitous']);
  });

  it('allows the where-included form at Camada 2, which is what an epic is', () => {
    assert.ok(buildPolicies.earsPatternsForCamada('web_app', 2).includes('optional'));
  });

  it('allows the unwanted-behaviour form only at Camada 4', () => {
    for (const camada of [1, 2, 3]) {
      assert.ok(!buildPolicies.earsPatternsForCamada('web_app', camada).includes('unwanted'), `camada ${camada}`);
    }
    assert.ok(buildPolicies.earsPatternsForCamada('web_app', 4).includes('unwanted'));
  });

  it('rejects a Camada 1 requirement written as an event, and says what belongs there', () => {
    const found = ears.findings({ earsPattern: 'event', condition: 'algo acontece', shall: 'reagir' }, 1);
    assert.equal(found[0].code, 'padrao-fora-da-camada');
    assert.match(found[0].message, /Camada 1/);
    assert.match(found[0].message, /Sempre/);
  });

  it('accepts the right shape at the right layer', () => {
    assert.deepEqual(ears.findings({ earsPattern: 'ubiquitous', shall: 'registar tudo' }, 1), []);
    assert.deepEqual(ears.findings({ earsPattern: 'unwanted', condition: 'falhar', shall: 'avisar' }, 4), []);
  });

  it('says when a shape is missing the trigger it depends on', () => {
    const found = ears.findings({ earsPattern: 'event', shall: 'enviar' }, 3);
    assert.equal(found[0].code, 'sem-gatilho');
    assert.match(found[0].message, /o que acontece/);
  });

  it('says when there is nothing to verify at all', () => {
    assert.equal(ears.findings({ earsPattern: 'event' }, 4)[0].code, 'sem-resposta');
  });

  it('notes an undeclared shape without pretending to know which it is', () => {
    assert.equal(ears.findings({ shall: 'fazer algo' }, 4)[0].code, 'sem-padrao');
  });

  it('checks nothing when the layer is unknown, rather than inventing a rule', () => {
    assert.deepEqual(ears.findings({ earsPattern: 'unwanted', condition: 'x', shall: 'y' }, null), []);
  });
});

describe('the policy table cannot drift', () => {
  it('holds together as shipped', () => {
    assert.deepEqual(buildPolicies.validatePolicy('web_app'), []);
  });

  it('names only patterns that exist', () => {
    const table = buildPolicies.policyFor('web_app').EARS_BY_CAMADA;
    for (const [camada, patterns] of Object.entries(table)) {
      assert.ok(patterns.length, `camada ${camada} declares nothing`);
      for (const pattern of patterns) {
        assert.ok(ears.PATTERN_IDS.includes(pattern), `camada ${camada}: unknown pattern ${pattern}`);
      }
    }
  });

  it('covers every layer a stage actually claims, except the throwaway one', () => {
    const table = buildPolicies.policyFor('web_app').EARS_BY_CAMADA;
    for (const stage of buildPolicies.policyFor('web_app').STAGES) {
      if (stage.camada === 0) continue;
      assert.ok(table[stage.camada]?.length, `stage ${stage.stage} sits at an unwritable layer`);
    }
  });

  it('every pattern the catalogue offers is usable at some layer', () => {
    const used = new Set(Object.values(buildPolicies.policyFor('web_app').EARS_BY_CAMADA).flat());
    for (const id of ears.PATTERN_IDS) {
      assert.ok(used.has(id), `${id} exists but belongs nowhere`);
    }
  });
});

describe('the V-model levels are no longer called camadas', () => {
  it('does not reuse the word for two different things', () => {
    const fs = require('node:fs');
    for (const file of ['../lib/requirement-hierarchy.js', '../public/requirements-map-ui.js']) {
      const source = fs.readFileSync(require.resolve(file), 'utf8');
      assert.doesNotMatch(source, /[Cc]amada/, `${file} still calls a V-model level a camada`);
    }
  });
});
