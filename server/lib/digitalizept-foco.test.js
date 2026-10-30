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

test('lessons: only notes marked «Lição:», newest first, a partner sees only their own', () => {
    const Database = require('better-sqlite3');
    const { licoes } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, nome TEXT, business_type TEXT, cidade TEXT, foco_estado TEXT, foco_dor TEXT, vendedor_id TEXT);
        CREATE TABLE nota (id TEXT PRIMARY KEY, lead_id TEXT, texto TEXT, criado_em TEXT);
        INSERT INTO lead VALUES ('a','Barbearia Zé','barbeiro','Braga','sem_interesse','nao','ana'), ('b','Salão Rui','salao-beleza','Porto','contactado','sim','rui');
        INSERT INTO nota VALUES ('1','a','Lição: dono só atende de manhã','2026-10-29T09:00'), ('2','a','Não atendeu.','2026-10-29T10:00'),
            ('3','b','Lição: preço não é o problema, é o tempo','2026-10-29T11:00');`);
    const todas = licoes(db, { id: 'x', papel: 'admin' });
    assert.deepEqual(todas.map((l) => l.texto), ['preço não é o problema, é o tempo', 'dono só atende de manhã']);
    assert.equal(todas[1].nome, 'Barbearia Zé');
    assert.deepEqual(licoes(db, { id: 'ana', papel: 'parceiro' }).map((l) => l.lead_id), ['a']);
});

test('bulk follow-up: status and date change together or apart; closing clears the date; history per lead', () => {
    const Database = require('better-sqlite3');
    const { seguimentoLote } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, foco_estado TEXT, revisitar_em TEXT DEFAULT '', foco_linha TEXT DEFAULT 'digitu');
        INSERT INTO lead (id, foco_estado, revisitar_em) VALUES ('a','contactado','2026-10-01'), ('b','voltar','2026-10-02');`);
    const log = [];
    const reg = (id, tipo, p) => log.push([id, tipo, p.de, p.estado, p.voltar_em]);
    const row = (id) => db.prepare('SELECT foco_estado e, revisitar_em v FROM lead WHERE id = ?').get(id);

    assert.equal(seguimentoLote(db, ['a', 'b'], { voltarEm: '2026-11-05' }, reg), 2);
    assert.deepEqual(row('a'), { e: 'contactado', v: '2026-11-05' }, 'date only: status kept');
    assert.deepEqual(log[0], ['a', 'foco_voltar', 'contactado', 'contactado', '2026-11-05']);

    seguimentoLote(db, ['a'], { estado: 'quer_ativar' }, reg);
    assert.deepEqual(row('a'), { e: 'quer_ativar', v: '2026-11-05' }, 'status only: date kept');

    seguimentoLote(db, ['b'], { estado: 'sem_interesse' }, reg);
    assert.deepEqual(row('b'), { e: 'sem_interesse', v: '' }, 'closed: no next step');
    assert.deepEqual(log.at(-1), ['b', 'foco_estado', 'voltar', 'sem_interesse', '']);
});

test('two lines: a status only applies to its own line, moving a lead restarts its pipeline, imports land in a line', () => {
    const Database = require('better-sqlite3');
    const { seguimentoLote, mudarLinha, importar } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, business_type TEXT, nome TEXT, morada TEXT, cidade TEXT, telefone TEXT DEFAULT '',
        whatsapp TEXT, estado TEXT, foco_estado TEXT DEFAULT '', foco_origem_json TEXT, lat REAL, lng REAL, geocode_status TEXT,
        vendedor_id TEXT, foco_linha TEXT DEFAULT 'digitu', revisitar_em TEXT DEFAULT '', criado_em TEXT);
        INSERT INTO lead (id, foco_estado, revisitar_em) VALUES ('d', 'contactado', '2026-11-01');
        INSERT INTO lead (id, foco_estado, foco_linha) VALUES ('y', 'ym_conversa', 'yourlab');`);
    const log = [];
    const reg = (id, tipo, p) => log.push([id, tipo, p]);
    const row = (id) => db.prepare('SELECT foco_estado e, foco_linha l, revisitar_em v FROM lead WHERE id = ?').get(id);

    assert.equal(seguimentoLote(db, ['d', 'y'], { estado: 'ym_ganho' }, reg), 1, 'Digitu lead skipped');
    assert.deepEqual(row('y'), { e: 'ym_ganho', l: 'yourlab', v: '' }, 'won = closed = no date');
    assert.equal(row('d').e, 'contactado');

    assert.equal(mudarLinha(db, ['d', 'y'], 'yourlab', reg), 1, 'already there: not moved again');
    assert.deepEqual(row('d'), { e: 'ym_novo', l: 'yourlab', v: '' });
    assert.equal(log.at(-1)[2].para, 'YourLab à medida');

    const r = importar(db, [{ nome: 'Clínica Grande', telefone: '912000777', cidade: 'Lisboa' }], {
        vendedorId: 'v', soFoco: false, linha: 'yourlab', parseMapsUrl: () => null, whatsappIfMobile: (t) => t,
        nowIso: () => '2026-10-29', uuid: () => 'novo'
    });
    assert.equal(r.novos, 1);
    assert.deepEqual(row('novo'), { e: 'ym_novo', l: 'yourlab', v: '' });
});

test('beta usage sync: snapshot saved, used the app → Beta user, paid → Ativou, failures counted', async () => {
    const Database = require('better-sqlite3');
    const { sincronizarUso } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, dmn_token TEXT, foco_estado TEXT, foco_linha TEXT DEFAULT 'digitu',
        vendedor_id TEXT DEFAULT 'ana', foco_uso_json TEXT DEFAULT '', foco_arquivado INTEGER DEFAULT 0);
        INSERT INTO lead (id, dmn_token, foco_estado) VALUES ('usou','t1','demo_mostrada'), ('pagou','t2','quer_ativar'),
            ('nada','t3','demo_mostrada'), ('erro','t4','demo_mostrada'), ('fora','t5','por_contactar');`);
    const respostas = {
        t1: { pontos: 120, nivel: 2, nivelNome: 'Em crescimento', pago: false, atualizadoEm: '2026-10-20T10:00Z', acoes: [{ chave: 'whatsapp_ok', pontos: 40, criado_em: '2026-10-25T09:00Z' }] },
        t2: { pontos: 300, nivel: 3, pago: true, acoes: [] },
        t3: { pontos: 0, nivel: 1, pago: false }
    };
    const fetchReal = global.fetch;
    global.fetch = async (url) => {
        const token = decodeURIComponent(String(url).split('/').pop());
        if (!respostas[token]) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => respostas[token] };
    };
    try {
        const log = [];
        const r = await sincronizarUso(db, { vendedor: { id: 'x', papel: 'admin' }, nowIso: () => 'agora', log: (id, t, p) => log.push([id, p.estado]) });
        assert.deepEqual(r, { n: 3, falhas: 1, mudaram: 2 });
        const e = (id) => db.prepare('SELECT foco_estado FROM lead WHERE id = ?').get(id).foco_estado;
        assert.equal(e('usou'), 'quer_ativar');
        assert.equal(e('pagou'), 'ativou');
        assert.equal(e('nada'), 'demo_mostrada', 'no points yet: stays at link sent');
        const uso = JSON.parse(db.prepare('SELECT foco_uso_json FROM lead WHERE id = ?').get('usou').foco_uso_json);
        assert.equal(uso.ultimaAtividade, '2026-10-25T09:00Z', 'latest of last edit and last milestone');
        assert.equal(uso.acoes.length, 1);
        assert.equal(db.prepare('SELECT foco_uso_json FROM lead WHERE id = ?').get('fora').foco_uso_json, '', 'not contacted: not synced');
    } finally {
        global.fetch = fetchReal;
    }
});

test('archive: hides without deleting, restore brings it back, repeated calls are no-ops', () => {
    const Database = require('better-sqlite3');
    const { arquivarLote } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, foco_arquivado INTEGER NOT NULL DEFAULT 0);
        INSERT INTO lead (id) VALUES ('a'), ('b');`);
    const log = [];
    const reg = (id, tipo, p) => log.push([id, tipo, p.arquivado]);
    assert.equal(arquivarLote(db, ['a', 'b'], true, reg), 2);
    assert.equal(arquivarLote(db, ['a'], true, reg), 0, 'already archived');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lead').get().n, 2, 'nothing deleted');
    assert.equal(arquivarLote(db, ['a'], false, reg), 1);
    assert.deepEqual(db.prepare('SELECT id FROM lead WHERE foco_arquivado = 1').all().map((r) => r.id), ['b']);
    assert.deepEqual(log.at(-1), ['a', 'foco_arquivo', false]);
});

test('phone dedupe: same number in any format matches; a +55 number never matches a Portuguese one', () => {
    const Database = require('better-sqlite3');
    const { importar, chaveTelefone } = require('./digitalizept-foco');
    assert.equal(chaveTelefone('+351 912 345 678'), chaveTelefone('912345678'));
    assert.equal(chaveTelefone('00351912345678'), '351912345678');
    assert.notEqual(chaveTelefone('+55 11 91234-5678'), chaveTelefone('912345678'));
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, business_type TEXT, nome TEXT, morada TEXT, cidade TEXT, telefone TEXT DEFAULT '',
        whatsapp TEXT, estado TEXT, foco_estado TEXT DEFAULT '', foco_origem_json TEXT, lat REAL, lng REAL, geocode_status TEXT,
        vendedor_id TEXT, foco_linha TEXT DEFAULT 'digitu', revisitar_em TEXT DEFAULT '', criado_em TEXT);
        INSERT INTO lead (id, nome, cidade, telefone, foco_estado) VALUES ('pt', 'Loja PT', 'Porto', '912345678', 'contactado');`);
    let n = 0;
    const r = importar(db, [{ nome: 'Loja Brasil', cidade: 'Porto', telefone: '+55 11 91234-5678' }, { nome: 'Outra', cidade: 'Braga', telefone: '+351 912 345 678' }], {
        vendedorId: 'v', soFoco: false, parseMapsUrl: () => null, whatsappIfMobile: () => '', nowIso: () => 'x', uuid: () => `n${n += 1}`
    });
    assert.deepEqual([r.novos, r.ja_existiam], [1, 1], 'Brazil is new; the +351 form of the PT number is a duplicate');
});

test('no duplicates: same phone (either field), Instagram, email or name+city — also within one file; near-misses stay new', () => {
    const Database = require('better-sqlite3');
    const { importar, indiceContactos, duplicadoDe } = require('./digitalizept-foco');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, business_type TEXT, nome TEXT, morada TEXT, cidade TEXT, telefone TEXT DEFAULT '',
        whatsapp TEXT DEFAULT '', estado TEXT, foco_estado TEXT DEFAULT '', foco_origem_json TEXT DEFAULT '{}', lat REAL, lng REAL, geocode_status TEXT,
        vendedor_id TEXT, foco_linha TEXT DEFAULT 'digitu', revisitar_em TEXT DEFAULT '', criado_em TEXT);
        INSERT INTO lead (id, nome, cidade, telefone, whatsapp, foco_estado, foco_origem_json) VALUES
            ('a', 'Salão da Ana', 'Porto', '223456789', '912345678', 'contactado', '{"instagram":"salao_ana","email":"ana@salao.pt"}');`);
    const indice = indiceContactos(db);
    const por = (dados) => (duplicadoDe(indice, dados) || {}).por || null;
    assert.equal(por({ nome: 'X', telefone: '+351 912 345 678' }), 'telefone', 'phone in the WhatsApp field');
    assert.equal(por({ nome: 'X', instagram: 'https://www.instagram.com/Salao_Ana/' }), 'Instagram');
    assert.equal(por({ nome: 'X', email: ' ANA@salao.pt ' }), 'email');
    assert.equal(por({ nome: 'salao da ana!', cidade: 'PORTO' }), 'nome e cidade', 'accents, case, punctuation ignored');
    assert.equal(por({ nome: 'Salão da Ana', cidade: 'Braga' }), null, 'same name, other city: a different business');
    assert.equal(duplicadoDe(indice, { nome: 'Salão da Ana', cidade: 'Porto' }, 'a'), null, 'editing itself is not a duplicate');

    let n = 0;
    const r = importar(db, [
        { nome: 'Barbearia Nova', cidade: 'Braga', telefone: '931111111' },
        { nome: 'Barbearia Nova (repetida)', cidade: 'Braga', telefone: '+351 931 111 111' },
        { nome: 'Outra', cidade: 'Lisboa', email: 'ana@salao.pt' }
    ], { vendedorId: 'v', soFoco: false, parseMapsUrl: () => null, whatsappIfMobile: () => '', nowIso: () => 'x', uuid: () => `n${n += 1}` });
    assert.deepEqual([r.novos, r.ja_existiam], [1, 2]);
    assert.match(r.repetidos.join(' | '), /mesmo telefone.*mesmo email/);
});
