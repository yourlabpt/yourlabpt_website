/**
 * Who is selling: one login per person (owner + partners), so every lead,
 * touch and event records who did it.
 *
 * Attribution is not passed around by hand. The auth middleware puts the
 * logged-in vendedor into an AsyncLocalStorage for the rest of the request,
 * and SQLite triggers stamp `vendedor_id` on every new lead / evento row via
 * the `vendedor_atual()` function registered on the connection. Any insert,
 * old or future, is attributed without touching its code.
 */
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const PAPEIS = ['admin', 'parceiro'];
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const tokens = new Map(); // ponytail: in-memory, a restart logs everyone out — move to a table if that hurts

/** Run code whose rows set their owner explicitly ('' = shared list) — the triggers leave them alone. */
function semVendedor(fn) {
    return als.exit(fn);
}

function atual() {
    const store = als.getStore();
    return (store && store.vendedor) || null;
}

function hashSenha(senha) {
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}:${crypto.scryptSync(String(senha), salt, 32).toString('hex')}`;
}

function senhaCerta(senha, guardado) {
    const [salt, hash] = String(guardado || '').split(':');
    if (!salt || !hash) return false;
    const tentativa = crypto.scryptSync(String(senha), salt, 32);
    const esperado = Buffer.from(hash, 'hex');
    return esperado.length === tentativa.length && crypto.timingSafeEqual(esperado, tentativa);
}

function novoCodigo(db) {
    for (;;) {
        const codigo = crypto.randomBytes(3).toString('hex');
        if (!db.prepare('SELECT 1 FROM vendedor WHERE codigo = ?').get(codigo)) return codigo;
    }
}

/** Called from digitalizept-db getDb(): table, columns, function and triggers. */
function instalar(db, addMissingColumns) {
    db.exec(`CREATE TABLE IF NOT EXISTS vendedor (
        id TEXT PRIMARY KEY,
        utilizador TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL DEFAULT '',
        papel TEXT NOT NULL DEFAULT 'parceiro',
        codigo TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL DEFAULT '',
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL
    )`);
    addMissingColumns(db, 'lead', {
        vendedor_id: "TEXT NOT NULL DEFAULT ''",
        // digitalizemeunegocio session created for this lead (demo link) and
        // the commercial state of the Foco funnel — separate from processo_estado,
        // which belongs to the older email/WhatsApp sequence.
        dmn_token: "TEXT NOT NULL DEFAULT ''",
        dmn_link: "TEXT NOT NULL DEFAULT ''",
        foco_estado: "TEXT NOT NULL DEFAULT ''",
        // What the crawler found (maps, website, instagram, facebook, email, rating).
        foco_origem_json: "TEXT NOT NULL DEFAULT '{}'",
        // Is the pain real? '' not asked yet · sim · talvez · nao — the thing we are testing.
        foco_dor: "TEXT NOT NULL DEFAULT ''"
    });
    // WhatsApp message templates, shared by the team (see foco.js for placeholders).
    db.exec(`CREATE TABLE IF NOT EXISTS foco_mensagem (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL DEFAULT '',
        segmento_id TEXT NOT NULL DEFAULT '',
        texto TEXT NOT NULL DEFAULT '',
        criado_por TEXT NOT NULL DEFAULT '',
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
    )`);
    addMissingColumns(db, 'evento', { vendedor_id: "TEXT NOT NULL DEFAULT ''" });
    db.exec('CREATE INDEX IF NOT EXISTS idx_lead_vendedor ON lead(vendedor_id)');
    db.exec("CREATE INDEX IF NOT EXISTS idx_lead_dmn_token ON lead(dmn_token) WHERE dmn_token != ''");

    // The owner exists from day one (utilizador "admin", password = master key
    // until one is set), and everything created before logins existed is theirs.
    if (!db.prepare('SELECT 1 FROM vendedor LIMIT 1').get()) {
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO vendedor (id, utilizador, nome, papel, codigo, senha_hash, criado_em)
            VALUES (?, 'admin', 'YourLab', 'admin', ?, '', ?)`).run(id, novoCodigo(db), new Date().toISOString());
        db.prepare("UPDATE lead SET vendedor_id = ? WHERE vendedor_id = ''").run(id);
    }

    // Every lead is a Foco contact — including the ones the admin pages create
    // (quick lead, visits, Descobrir, imports): closed → ativou, touched by the
    // old sequence → contactado, anything else → por contactar.
    const FOCO_INICIAL = `CASE WHEN l.estado = 'fechado' THEN 'ativou'
        WHEN l.processo_estado != '' OR EXISTS (SELECT 1 FROM lead_toque t WHERE t.lead_id = l.id) THEN 'contactado'
        ELSE 'por_contactar' END`;
    db.exec(`UPDATE lead SET foco_estado = (SELECT ${FOCO_INICIAL} FROM lead l WHERE l.id = lead.id) WHERE foco_estado = ''`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS lead_foco_inicial AFTER INSERT ON lead
        FOR EACH ROW WHEN NEW.foco_estado = ''
        BEGIN UPDATE lead SET foco_estado = CASE WHEN NEW.estado = 'fechado' THEN 'ativou' ELSE 'por_contactar' END WHERE id = NEW.id; END;`);

    db.function('vendedor_atual', () => (atual() ? atual().id : ''));
    db.function('vendedor_atual_nome', () => (atual() ? atual().nome : ''));
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS lead_stamp_vendedor AFTER INSERT ON lead
        FOR EACH ROW WHEN NEW.vendedor_id = '' AND vendedor_atual() != ''
        BEGIN UPDATE lead SET vendedor_id = vendedor_atual() WHERE id = NEW.id; END;
        CREATE TRIGGER IF NOT EXISTS evento_stamp_vendedor AFTER INSERT ON evento
        FOR EACH ROW WHEN NEW.vendedor_id = '' AND vendedor_atual() != ''
        BEGIN UPDATE evento SET vendedor_id = vendedor_atual() WHERE id = NEW.id; END;
        CREATE TRIGGER IF NOT EXISTS toque_stamp_vendedor AFTER INSERT ON lead_toque
        FOR EACH ROW WHEN NEW.vendedor = '' AND vendedor_atual_nome() != ''
        BEGIN UPDATE lead_toque SET vendedor = vendedor_atual_nome() WHERE id = NEW.id; END;
    `);
}

/** Logging in with the old master key opens the first active admin — the owner. */
function dono(db) {
    return db.prepare("SELECT * FROM vendedor WHERE papel = 'admin' AND ativo = 1 ORDER BY criado_em LIMIT 1").get();
}

function publico(v) {
    return v && { id: v.id, utilizador: v.utilizador, nome: v.nome, papel: v.papel, codigo: v.codigo, ativo: Boolean(v.ativo) };
}

/**
 * `utilizador` empty → the password is checked against the master key(s)
 * and the session belongs to the owner. Otherwise a normal user login.
 */
function login(db, { utilizador, senha, masterOk }) {
    let v = null;
    if (!utilizador) {
        if (masterOk(senha)) v = dono(db);
    } else {
        const row = db.prepare('SELECT * FROM vendedor WHERE utilizador = ? AND ativo = 1').get(String(utilizador).trim().toLowerCase());
        if (row && senhaCerta(senha, row.senha_hash)) v = row;
        else if (row && row.papel === 'admin' && !row.senha_hash && masterOk(senha)) v = row;
    }
    if (!v) return null;
    const token = crypto.randomBytes(32).toString('hex');
    tokens.set(token, { id: v.id, expira: Date.now() + TOKEN_TTL_MS });
    return { token, vendedor: publico(v) };
}

function logout(token) {
    tokens.delete(String(token || ''));
}

function middleware(getDb, { soAdmin = false } = {}) {
    return (req, res, next) => {
        const token = String(req.headers['x-admin-token'] || '').trim();
        const t = tokens.get(token);
        if (!t || Date.now() > t.expira) {
            tokens.delete(token);
            return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
        }
        const row = getDb().prepare('SELECT * FROM vendedor WHERE id = ? AND ativo = 1').get(t.id);
        if (!row) {
            tokens.delete(token);
            return res.status(401).json({ error: 'Conta desativada.' });
        }
        if (soAdmin && row.papel !== 'admin') return res.status(403).json({ error: 'Só o administrador pode fazer isto.' });
        req.vendedor = publico(row);
        return als.run({ vendedor: req.vendedor }, next);
    };
}

function listar(db) {
    return db.prepare('SELECT * FROM vendedor ORDER BY ativo DESC, criado_em').all().map(publico);
}

function criar(db, { utilizador, nome, papel, senha }, nowIso) {
    const u = String(utilizador || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,40}$/.test(u)) throw new Error('Utilizador: 2–40 letras minúsculas, números, ponto ou traço.');
    if (String(senha || '').length < 8) throw new Error('A password precisa de pelo menos 8 caracteres.');
    if (db.prepare('SELECT 1 FROM vendedor WHERE utilizador = ?').get(u)) throw new Error('Esse utilizador já existe.');
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO vendedor (id, utilizador, nome, papel, codigo, senha_hash, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        id, u, String(nome || u).trim().slice(0, 80), PAPEIS.includes(papel) ? papel : 'parceiro',
        novoCodigo(db), hashSenha(senha), nowIso()
    );
    return publico(db.prepare('SELECT * FROM vendedor WHERE id = ?').get(id));
}

function atualizar(db, id, { nome, papel, senha, ativo }) {
    const row = db.prepare('SELECT * FROM vendedor WHERE id = ?').get(id);
    if (!row) throw new Error('Não encontrado.');
    const next = { ...row };
    if (nome !== undefined) next.nome = String(nome).trim().slice(0, 80) || row.nome;
    if (papel !== undefined && PAPEIS.includes(papel)) next.papel = papel;
    if (ativo !== undefined) next.ativo = ativo ? 1 : 0;
    if (senha) {
        if (String(senha).length < 8) throw new Error('A password precisa de pelo menos 8 caracteres.');
        next.senha_hash = hashSenha(senha);
    }
    const admins = db.prepare("SELECT COUNT(*) AS n FROM vendedor WHERE papel = 'admin' AND ativo = 1 AND id != ?").get(id).n;
    if (row.papel === 'admin' && (next.papel !== 'admin' || !next.ativo) && admins === 0) {
        throw new Error('Tem de ficar pelo menos um administrador ativo.');
    }
    db.prepare('UPDATE vendedor SET nome = ?, papel = ?, ativo = ?, senha_hash = ? WHERE id = ?')
        .run(next.nome, next.papel, next.ativo, next.senha_hash, id);
    if (!next.ativo) [...tokens].forEach(([k, t]) => { if (t.id === id) tokens.delete(k); });
    return publico(db.prepare('SELECT * FROM vendedor WHERE id = ?').get(id));
}

module.exports = { instalar, dono, login, logout, middleware, listar, criar, atualizar, atual, semVendedor, hashSenha, senhaCerta };
