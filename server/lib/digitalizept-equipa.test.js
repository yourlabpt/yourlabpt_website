// node --test lib/digitalizept-equipa.test.js — in-memory DB, never touches data/.
const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const equipa = require('./digitalizept-equipa');

function addMissingColumns(db, table, columns) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    Object.entries(columns).forEach(([n, d]) => { if (!existing.has(n)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${n} ${d}`); });
}

test('owner is created, untouched leads are the shared list, new rows are stamped with whoever is logged in', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE lead (id TEXT PRIMARY KEY, nome TEXT, estado TEXT NOT NULL DEFAULT 'novo', processo_estado TEXT NOT NULL DEFAULT '');
        CREATE TABLE evento (id TEXT PRIMARY KEY, tipo TEXT);
        CREATE TABLE app_setting (key TEXT PRIMARY KEY, value TEXT, actualizado_em TEXT);
        CREATE TABLE lead_toque (id TEXT PRIMARY KEY, lead_id TEXT, vendedor TEXT NOT NULL DEFAULT '');
        INSERT INTO lead (id, nome) VALUES ('antigo', 'x');
        INSERT INTO lead (id, nome, estado) VALUES ('fechado', 'f', 'fechado');`);
    equipa.instalar(db, addMissingColumns);
    // Every existing lead becomes a Foco contact, classified by what already happened.
    const foco = (id) => db.prepare('SELECT foco_estado FROM lead WHERE id = ?').get(id).foco_estado;
    assert.equal(foco('antigo'), 'por_contactar');
    assert.equal(foco('fechado'), 'ativou');
    const dono = db.prepare("SELECT * FROM vendedor WHERE utilizador = 'admin'").get();
    const dono_ = (id) => db.prepare('SELECT vendedor_id FROM lead WHERE id = ?').get(id).vendedor_id;
    assert.equal(dono_('antigo'), '', 'never contacted → shared list, visible to every partner');
    assert.equal(dono_('fechado'), dono.id, 'closed deals stay with the owner');

    const now = () => new Date().toISOString();
    const p = equipa.criar(db, { utilizador: 'Ana', nome: 'Ana', papel: 'parceiro', senha: 'segredo123' }, now);
    assert.equal(p.utilizador, 'ana');
    assert.equal(equipa.login(db, { utilizador: 'ana', senha: 'errada', masterOk: () => false }), null);
    const s = equipa.login(db, { utilizador: 'ana', senha: 'segredo123', masterOk: () => false });
    assert.equal(s.vendedor.id, p.id);
    assert.equal(equipa.login(db, { utilizador: '', senha: 'mestra', masterOk: (x) => x === 'mestra' }).vendedor.id, dono.id);

    const mw = equipa.middleware(() => db);
    const res = { status: () => ({ json: () => assert.fail('401') }) };
    const sAdmin = equipa.login(db, { utilizador: '', senha: 'mestra', masterOk: (x) => x === 'mestra' });
    mw({ headers: { 'x-admin-token': sAdmin.token } }, res, () => {
        db.prepare("INSERT INTO lead (id, nome) VALUES ('do_admin', 'a')").run();
        db.prepare("INSERT INTO lead (id, nome, foco_estado) VALUES ('admin_foco', 'b', 'contactado')").run();
    });
    assert.equal(dono_('do_admin'), '', 'admin pages create shared-list leads');
    assert.equal(dono_('admin_foco'), dono.id, 'a contact the admin already talked to stays theirs');
    mw({ headers: { 'x-admin-token': s.token } }, res, () => {
        db.prepare("INSERT INTO lead (id, nome) VALUES ('novo', 'y')").run();
        db.prepare("INSERT INTO evento (id, tipo) VALUES ('e1', 't')").run();
        db.prepare("INSERT INTO lead_toque (id) VALUES ('t1')").run();
        // Shared-list rows are unowned on purpose, even inside a logged-in request.
        equipa.semVendedor(() => db.prepare("INSERT INTO lead (id, nome) VALUES ('comum', 'w')").run());
    });
    assert.equal(db.prepare("SELECT vendedor_id FROM lead WHERE id = 'comum'").get().vendedor_id, '');
    assert.equal(db.prepare("SELECT vendedor_id FROM lead WHERE id = 'novo'").get().vendedor_id, p.id);
    assert.equal(db.prepare("SELECT vendedor_id FROM evento WHERE id = 'e1'").get().vendedor_id, p.id);
    assert.equal(db.prepare("SELECT vendedor FROM lead_toque WHERE id = 't1'").get().vendedor, 'Ana');

    // Outside a request nothing is stamped (public routes, imports).
    db.prepare("INSERT INTO lead (id, nome) VALUES ('publico', 'z')").run();
    assert.equal(db.prepare("SELECT vendedor_id FROM lead WHERE id = 'publico'").get().vendedor_id, '');
    assert.equal(foco('publico'), 'por_contactar'); // leads created later by the admin pages show up too

    assert.throws(() => equipa.atualizar(db, dono.id, { ativo: false }), /pelo menos um administrador/);
});
