/**
 * Foco comercial: the sales tool side of digitalizemeunegocio.pt.
 *
 * The segments, lines and scripts are decided in digitalizemeunegocio
 * (server/config/verticais.json, also rendered as its VERTICAIS.md). This repo
 * ships a copy in config/foco/ so it deploys on its own server; refresh it with
 * `npm run foco:sync` and commit. Read on every request, so a fresh copy (or a
 * VERTICAIS_FILE override) shows up without a restart.
 */
const fs = require('fs');
const path = require('path');

const FOCO_DIR = path.join(__dirname, '..', 'config', 'foco');
const VERTICAIS_FILE = process.env.VERTICAIS_FILE || path.join(FOCO_DIR, 'verticais.json');
const TIPOS_FILE = path.join(FOCO_DIR, 'tipos.json');
const DMN_BASE_URL = (process.env.DMN_BASE_URL || 'https://digitalizemeunegocio.pt').replace(/\/+$/, '');

// Funnel = the conversion rule: show the demo → activate one product → configure.
const ESTADOS = {
    por_contactar: 'Por contactar',
    contactado: 'Contactado',
    demo_mostrada: 'Demo mostrada',
    quer_ativar: 'Quer ativar',
    ativou: 'Ativou produto',
    voltar: 'Voltar a falar',
    sem_interesse: 'Sem interesse'
};
const VIU_DEMO = ['demo_mostrada', 'quer_ativar', 'ativou'];
const CANAIS = { presencial: 'Presencial', telefone: 'Telefone', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', email: 'Email' };

function nomesDosTipos() {
    try {
        return JSON.parse(fs.readFileSync(TIPOS_FILE, 'utf8'));
    } catch (_) {
        return {};
    }
}

function carregar() {
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(VERTICAIS_FILE, 'utf8'));
    } catch (err) {
        throw new Error(`Não consegui ler verticais.json (${VERTICAIS_FILE}): ${err.message}. Corra npm run foco:sync e faça commit de server/config/foco/.`);
    }
    const nomes = nomesDosTipos();
    const verticais = (cfg.verticais || [])
        .map((v) => ({ ...v, tipos_nomes: (v.tipos || []).map((id) => ({ id, nome: nomes[id] || id })) }))
        .sort((a, b) => (a.foco || 99) - (b.foco || 99) || a.prioridade - b.prioridade);
    return { versao: cfg.versao, nota: cfg.nota, regra_conversao: cfg.regra_conversao, fases: cfg.fases, verticais, estados: ESTADOS, canais: CANAIS, dmnBaseUrl: DMN_BASE_URL };
}

function segmentoDoTipo(verticais, tipo) {
    // Focus segments first, so a type in both a focus and a "depois" entry resolves to the focus one.
    return verticais.find((v) => v.foco && (v.tipos || []).includes(tipo))
        || verticais.find((v) => (v.tipos || []).includes(tipo)) || null;
}

async function dmn(pathname, options = {}) {
    const res = await fetch(`${DMN_BASE_URL}${pathname}`, {
        method: options.method || 'GET',
        headers: { 'content-type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `digitalizemeunegocio respondeu ${res.status}`);
    return data;
}

/**
 * Opens a digitalizemeunegocio session already filled with the business's
 * real name and type — "a demo com o nome real do negócio" — and returns the
 * link to send. `src=p-<codigo>` tags every event that session produces with
 * the partner who opened it; the paid deal comes back via import-negocio and
 * is matched on the session token (see digitalizept-import.js).
 */
async function criarDemo({ nome, tipo, cidade, whatsapp, telefone, codigo }) {
    const { token } = await dmn('/api/digitalize/sessoes', { method: 'POST' });
    const patch = { businessTypeId: tipo, nome_negocio: nome };
    if (cidade) patch.cidade = cidade;
    if (whatsapp) patch.whatsapp = whatsapp;
    if (telefone) patch.telefone = telefone;
    await dmn(`/api/digitalize/sessoes/${encodeURIComponent(token)}/dados`, { method: 'PATCH', body: { patch } });
    return { token, link: `${DMN_BASE_URL}/digitalize/c/${encodeURIComponent(token)}?src=p-${codigo}` };
}

/** Per partner and per segment: how far each contact got, and why the lost ones said no. */
function resumo(db, { vendedorId = null } = {}) {
    const { verticais } = carregar();
    const filtro = vendedorId ? 'AND l.vendedor_id = @vendedorId' : '';
    const rows = db.prepare(`
        SELECT l.vendedor_id, l.business_type, l.foco_estado, COUNT(*) AS n
        FROM lead l WHERE l.foco_estado != '' ${filtro}
        GROUP BY 1, 2, 3
    `).all({ vendedorId });
    const nomes = Object.fromEntries(db.prepare('SELECT id, nome FROM vendedor').all().map((v) => [v.id, v.nome]));
    const vazio = () => ({ por_contactar: 0, contactos: 0, demos: 0, ativos: 0, sem_interesse: 0 });
    const somar = (alvo, r) => {
        if (r.foco_estado === 'por_contactar') { alvo.por_contactar += r.n; return; }
        alvo.contactos += r.n;
        if (VIU_DEMO.includes(r.foco_estado)) alvo.demos += r.n;
        if (r.foco_estado === 'ativou') alvo.ativos += r.n;
        if (r.foco_estado === 'sem_interesse') alvo.sem_interesse += r.n;
    };
    const porVendedor = {};
    const porSegmento = {};
    const total = vazio();
    rows.forEach((r) => {
        const seg = segmentoDoTipo(verticais, r.business_type);
        const segId = seg ? seg.id : 'outros';
        porVendedor[r.vendedor_id] = porVendedor[r.vendedor_id] || { id: r.vendedor_id, nome: nomes[r.vendedor_id] || '—', ...vazio() };
        porSegmento[segId] = porSegmento[segId] || { id: segId, nome: seg ? seg.nome : 'Outros', foco: seg ? seg.foco : null, ...vazio(), motivos: [] };
        somar(porVendedor[r.vendedor_id], r);
        somar(porSegmento[segId], r);
        somar(total, r);
    });
    db.prepare(`
        SELECT l.business_type, e.payload_json, e.criado_em FROM evento e JOIN lead l ON l.id = e.entidade_id
        WHERE e.tipo = 'foco_estado' AND json_extract(e.payload_json, '$.estado') = 'sem_interesse'
          AND json_extract(e.payload_json, '$.nota') != '' ${filtro}
        ORDER BY e.criado_em DESC LIMIT 60
    `).all({ vendedorId }).forEach((r) => {
        const seg = segmentoDoTipo(verticais, r.business_type);
        const alvo = porSegmento[seg ? seg.id : 'outros'];
        if (alvo && alvo.motivos.length < 5) alvo.motivos.push(JSON.parse(r.payload_json).nota);
    });
    // Which way of reaching out gets people to see the demo.
    const canais = db.prepare(`
        SELECT json_extract(e.payload_json, '$.canal') AS canal, COUNT(DISTINCT e.entidade_id) AS contactos,
               COUNT(DISTINCT CASE WHEN l.foco_estado IN ('demo_mostrada', 'quer_ativar', 'ativou') THEN l.id END) AS demos,
               COUNT(DISTINCT CASE WHEN l.foco_estado = 'ativou' THEN l.id END) AS ativos
        FROM evento e JOIN lead l ON l.id = e.entidade_id
        WHERE e.tipo = 'foco_estado' AND COALESCE(json_extract(e.payload_json, '$.canal'), '') != '' ${filtro}
        GROUP BY 1 ORDER BY 2 DESC
    `).all({ vendedorId }).map((c) => ({ ...c, nome: CANAIS[c.canal] || c.canal }));
    return {
        total,
        canais,
        vendedores: Object.values(porVendedor).sort((a, b) => b.ativos - a.ativos || b.demos - a.demos),
        segmentos: Object.values(porSegmento).sort((a, b) => (a.foco || 99) - (b.foco || 99))
    };
}

// Crawler categories (linkgen data/crawl-targets.json) and older free-text
// search terms → the business types digitalizemeunegocio sells to. First match wins.
const ALIASES = [
    [/barbe/, 'barbeiro'],
    [/clinica-dentaria|dentist|dentaria/, 'dentista'],
    [/fisioterap|osteopat/, 'fisioterapeuta'],
    [/psicolog/, 'psicologo'],
    [/nutri/, 'nutricionista'],
    [/imobiliari/, 'consultor-imobiliario'],
    [/personal|ginasio|treinador/, 'personal-trainer'],
    [/canaliz/, 'canalizador'],
    [/eletricist|electricist/, 'eletricista'],
    [/limpeza/, 'limpezas'],
    [/cirurgia-estetica|clinica-estetica|estetica/, 'clinica-estetica'],
    [/salao-beleza|cabeleireir|salao/, 'salao-beleza'],
    [/clinica-medica/, 'clinica-medica'],
    [/veterinari/, 'veterinaria'],
    [/remodelacao|interiores|cozinhas-medida/, 'remodelacao-interiores']
];
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function tipoDoCrawler(row, tiposConhecidos) {
    const partes = String(row.tipo || '').split('|').map((t) => semAcentos(t).trim()).filter(Boolean);
    const direto = partes.find((t) => tiposConhecidos.has(t));
    // The name beats the category for barbers: the crawler files them under salao-beleza.
    const texto = `${semAcentos(row.nome)} ${partes.join(' ')}`;
    if (/barbe/.test(semAcentos(row.nome))) return 'barbeiro';
    if (direto) return direto;
    const alias = ALIASES.find(([re]) => re.test(texto));
    return alias ? alias[1] : (partes[0] || 'generico');
}

const digitos = (t) => String(t || '').replace(/\D/g, '').slice(-9);

/**
 * Crawler JSON (`node linkgen.js export --json`) → leads "por contactar".
 * Already known (same phone, or same name in the same city) → not duplicated;
 * a known lead that was never in the Foco list joins it. `soFoco` drops rows
 * outside the focus segments — the list to work is the strategy, not the crawl.
 */
function importar(db, rows, { vendedorId, soFoco = true, parseMapsUrl, whatsappIfMobile, nowIso, uuid }) {
    const { verticais } = carregar();
    const conhecidos = new Set(verticais.flatMap((v) => v.tipos || []));
    const doFoco = new Set(verticais.filter((v) => v.foco).flatMap((v) => v.tipos || []));
    const r = { novos: 0, ja_existiam: 0, entraram_na_lista: 0, fora_do_foco: 0, invalidos: 0 };
    const porTelefone = db.prepare("SELECT id, foco_estado FROM lead WHERE substr(replace(replace(replace(telefone, ' ', ''), '+', ''), '-', ''), -9) = ? AND telefone != ''");
    const porNome = db.prepare('SELECT id, foco_estado FROM lead WHERE lower(nome) = lower(?) AND lower(cidade) = lower(?)');
    const inserir = db.prepare(`INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, foco_estado,
        foco_origem_json, lat, lng, geocode_status, vendedor_id, criado_em)
        VALUES (@id, @tipo, @nome, @morada, @cidade, @telefone, @whatsapp, 'novo', 'por_contactar', @origem, @lat, @lng, @geo, @vendedorId, @agora)`);
    const juntar = db.prepare(`UPDATE lead SET foco_estado = 'por_contactar', foco_origem_json = ?,
        lat = COALESCE(lat, ?), lng = COALESCE(lng, ?) WHERE id = ?`);

    db.transaction(() => {
        (Array.isArray(rows) ? rows : []).forEach((row) => {
            const nome = String((row && row.nome) || '').trim().slice(0, 200);
            if (!nome) { r.invalidos += 1; return; }
            const tipo = tipoDoCrawler(row, conhecidos);
            if (soFoco && !doFoco.has(tipo)) { r.fora_do_foco += 1; return; }
            const cidade = String(row.cidade || '').trim().slice(0, 120);
            const telefone = String(row.telefone || '').trim().slice(0, 40);
            const maps = row.maps ? parseMapsUrl(row.maps) : null;
            const lat = maps && maps.ok ? maps.lat : null;
            const lng = maps && maps.ok ? maps.lng : null;
            const origem = JSON.stringify(Object.fromEntries(['maps', 'website', 'instagram', 'facebook', 'email', 'rating', 'fonte', 'tipo', 'foundAt']
                .filter((k) => row[k] != null && row[k] !== '').map((k) => [k, String(row[k]).slice(0, 600)])));
            const existe = (digitos(telefone).length === 9 && porTelefone.get(digitos(telefone))) || porNome.get(nome, cidade);
            if (existe) {
                if (existe.foco_estado) { r.ja_existiam += 1; return; }
                juntar.run(origem, lat, lng, existe.id);
                r.entraram_na_lista += 1;
                return;
            }
            inserir.run({
                id: uuid(), tipo, nome, morada: String(row.morada || '').slice(0, 300), cidade, telefone,
                whatsapp: whatsappIfMobile(telefone), origem, lat, lng, geo: lat != null ? 'maps' : '',
                vendedorId: vendedorId || '', agora: nowIso()
            });
            r.novos += 1;
        });
    })();
    return r;
}

module.exports = { carregar, segmentoDoTipo, criarDemo, resumo, importar, tipoDoCrawler, ESTADOS, CANAIS, VERTICAIS_FILE, DMN_BASE_URL };
