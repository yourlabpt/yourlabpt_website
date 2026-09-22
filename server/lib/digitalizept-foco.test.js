// node --test lib/digitalizept-foco.test.js
const test = require('node:test');
const assert = require('node:assert');
const { tipoDoCrawler } = require('./digitalizept-foco');

test('crawler categories and old free-text types map to the types we sell to', () => {
    const conhecidos = new Set(['salao-beleza', 'barbeiro', 'clinica-estetica', 'dentista', 'consultor-imobiliario']);
    const t = (tipo, nome = 'X') => tipoDoCrawler({ tipo, nome }, conhecidos);
    assert.equal(t('salao-beleza | clinica-estetica'), 'salao-beleza');
    assert.equal(t('salao-beleza', 'Barbearia do Zé'), 'barbeiro');
    assert.equal(t('clinica-dentaria'), 'dentista');
    assert.equal(t('imobiliaria'), 'consultor-imobiliario');
    assert.equal(t('estética'), 'clinica-estetica');
    assert.equal(t('cabeleireiro | salão de beleza'), 'salao-beleza');
    assert.equal(t('restaurante'), 'restaurante');
    assert.equal(t(''), 'generico');
});

test('the copy shipped in config/foco loads on its own, with a name for every type', () => {
    const { carregar } = require('./digitalizept-foco');
    const cfg = carregar();
    assert.ok(cfg.verticais.filter((v) => v.foco).length >= 1);
    const nomes = require('../config/foco/tipos.json');
    cfg.verticais.forEach((v) => v.tipos.forEach((id) => assert.ok(nomes[id], `tipos.json sem ${id} — corra npm run foco:sync`)));
});
