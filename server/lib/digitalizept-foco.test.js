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

test('batch: a partner only touches their own contacts, type changes stick, deleting skips closed deals', () => {
    const Database = require('better-sqlite3');
    const { contactosMeus, mudarTipo, apagarLote, tiposConhecidos } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, business_type TEXT, vendedor_id TEXT DEFAULT '', foco_estado TEXT DEFAULT '');
        CREATE TABLE visita (id TEXT PRIMARY KEY, lead_id TEXT); CREATE TABLE nota (id TEXT PRIMARY KEY, lead_id TEXT);
        CREATE TABLE evento (id TEXT PRIMARY KEY, entidade TEXT, entidade_id TEXT); CREATE TABLE lead_toque (id TEXT PRIMARY KEY, lead_id TEXT);
        CREATE TABLE demo_visita (id TEXT PRIMARY KEY, lead_id TEXT); CREATE TABLE dados_negocio (id TEXT PRIMARY KEY, lead_id TEXT);
        CREATE TABLE proposta (id TEXT PRIMARY KEY, lead_id TEXT); CREATE TABLE contrato (id TEXT PRIMARY KEY, proposta_id TEXT);
        CREATE TABLE projeto (id TEXT PRIMARY KEY, contrato_id TEXT);
        INSERT INTO lead VALUES ('a','generico','ana','por_contactar'), ('b','generico','ana','por_contactar'),
            ('c','generico','rui','por_contactar'), ('d','generico','ana','ativou'), ('fora','generico','ana','');
        INSERT INTO nota VALUES ('n1','a'); INSERT INTO proposta VALUES ('p','d'); INSERT INTO contrato VALUES ('k','p'); INSERT INTO projeto VALUES ('j','k');`);
    const ana = { id: 'ana', papel: 'parceiro' };
    const ids = ['a', 'b', 'c', 'd', 'fora'];
    assert.deepEqual(contactosMeus(db, ids, ana), ['a', 'b', 'd'], "not Rui's, not outside the Foco list");
    assert.equal(contactosMeus(db, ids, { id: 'x', papel: 'admin' }).length, 4, 'admin: every Foco contact');

    assert.ok(tiposConhecidos().has('barbeiro') && tiposConhecidos().has('generico'));
    assert.equal(mudarTipo(db, ['a', 'b'], 'barbeiro'), 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM lead WHERE business_type = 'barbeiro'").get().n, 2);

    assert.deepEqual(apagarLote(db, ['a', 'b', 'd']), { apagados: 2, com_negocio: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lead').get().n, 3, 'c, d (closed deal) and fora survive');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM nota').get().n, 0, 'notes of deleted leads go too');
});

const CSV = '﻿score,nome,tipo,cidade,morada,telefone,tel_tipo,whatsapp,email,instagram,seguidores,website,maps,fonte,notas,nao_contactar\r\n'
    + '6,"Clínica Sorriso, Lda",clinica-dentaria,Braga,"Rua A 1, Braga",+351912345678,movel,,a@b.pt,,,,https://www.google.com/maps/place/X/data=!3d41.55!4d-8.42,maps,"diz ""olá""\nlinha 2",\r\n'
    + '5,Dra. Ana,advogado,Porto,,+351223456789,fixo,,,,,,,maps,,x\r\n'
    + '3,Barbearia Zé,salao-beleza|barbearia,Viseu,,+351936000111,movel,,,@ze,800,,,instagram,,\r\n';

test('leadgen CSV: quotes, commas, newlines, BOM, Excel «;», and nao_contactar rows dropped', () => {
    const { lerCsv } = require('./digitalizept-foco');
    const rows = lerCsv(CSV);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].nome, 'Clínica Sorriso, Lda');
    assert.equal(rows[0].notas, 'diz "olá"\nlinha 2');
    assert.equal(rows[1].instagram, '@ze');
    assert.deepEqual(lerCsv('nome;telefone;cidade\nSalão Ana;912345678;Porto\n'), [{ nome: 'Salão Ana', telefone: '912345678', cidade: 'Porto' }]);
});

test('leadgen CSV imports as contacts por contactar, typed, on the map, never duplicated', () => {
    const crypto = require('crypto');
    const Database = require('better-sqlite3');
    const { SCHEMA, migrate } = require('./digitalizept-db');
    const equipa = require('./digitalizept-equipa');
    const { lerCsv, importar } = require('./digitalizept-foco');
    const { parseMapsUrl } = require('./digitalizept-maps-url');
    const { whatsappIfMobile } = require('./digitalizept-maps-lookup');
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    equipa.instalar(db, (d, table, cols) => {
        const tem = new Set(d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
        Object.entries(cols).forEach(([k, def]) => { if (!tem.has(k)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${k} ${def}`); });
    });
    const opts = { vendedorId: '', soFoco: false, parseMapsUrl, whatsappIfMobile, nowIso: () => new Date().toISOString(), uuid: () => crypto.randomUUID() };
    assert.equal(importar(db, lerCsv(CSV), opts).novos, 2);
    const c = db.prepare("SELECT * FROM lead WHERE cidade = 'Braga'").get();
    assert.equal(c.business_type, 'dentista');
    assert.equal(c.foco_estado, 'por_contactar');
    assert.equal(c.whatsapp, '+351912345678');
    assert.equal(c.lat, 41.55);
    assert.equal(db.prepare("SELECT business_type FROM lead WHERE cidade = 'Viseu'").get().business_type, 'barbeiro');
    assert.equal(importar(db, lerCsv(CSV), opts).ja_existiam, 2);
});
