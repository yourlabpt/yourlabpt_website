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

// Two business lines, two pipelines.
// Digitu: volume, by phone or at the door — get them to try the app as beta users (or at least follow on Instagram).
// Funnel: pain real? → app link sent → beta user (using it) → activated (paid).
// (`demo_mostrada` keeps its id for old rows: it means the app link was sent; `quer_ativar` now means beta user.)
const ESTADOS = {
    por_contactar: 'Por contactar',
    contactado: 'Contactado',
    demo_mostrada: 'Link da app enviado',
    quer_ativar: 'Beta user',
    ativou: 'Ativou produto',
    voltar: 'Voltar a falar',
    sem_interesse: 'Sem interesse'
};
const VIU_DEMO = ['demo_mostrada', 'quer_ativar', 'ativou'];
// YourLab à medida: custom software, consultative and high value — the five-step method's sales side.
const ESTADOS_YOURLAB = {
    ym_novo: 'Novo',
    ym_conversa: 'Primeira conversa',
    ym_proposta: 'Proposta enviada',
    ym_negociacao: 'Em negociação',
    ym_ganho: 'Ganho',
    ym_perdido: 'Perdido'
};
const LINHAS = {
    digitu: { nome: 'Digitu', estados: ESTADOS, inicial: 'por_contactar', fechados: ['ativou', 'sem_interesse'] },
    yourlab: { nome: 'YourLab à medida', estados: ESTADOS_YOURLAB, inicial: 'ym_novo', fechados: ['ym_ganho', 'ym_perdido'] }
};
const linhaDe = (id) => LINHAS[id] || LINHAS.digitu;
const ESTADOS_TODOS = { ...ESTADOS, ...ESTADOS_YOURLAB };
// The three project types every à-medida lead is classified into first.
const PROJETOS = { ideia: 'Ideia', resgate: 'Resgate', consolidacao: 'Consolidação' };
const DORES = { sim: 'Dor real', talvez: 'Mais ou menos', nao: 'Não é dor' };
const CANAIS = { presencial: 'Presencial', telefone: 'Telefone', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', email: 'Email' };

// The product being shared and the number it is shared from. Editable in the
// app (Equipa → A marca) because the brand, the line and the number change
// faster than deploys do.
const MARCA_CHAVE = 'foco_marca';
const MARCA_PADRAO = {
    instagram: '',
    nome: 'Digitu',
    slogan: 'O seu tempo fica para o seu negócio.',
    numero: '',
    link: DMN_BASE_URL,
    // How the product is named out loud — never «app» nor «plataforma».
    descricao: 'o lugar onde o seu negócio se dá a conhecer, responde a quem pergunta e não deixa nada esquecido',
    linhas: [
        'Que o conheçam — os clientes certos encontram o negócio sem gastar horas a explicar-se.',
        'Que confiem em si — quem chega já vem convencido pelo trabalho feito e pelo que dizem os outros clientes.',
        'Que ninguém fique sem resposta — as perguntas de sempre respondidas a qualquer hora, a si só chega quem quer marcar.',
        'Que nada fique esquecido — marcações e compromissos guardados, sem andar com tudo na cabeça.'
    ]
};

function marca(db) {
    let guardado = {};
    try {
        guardado = JSON.parse((db.prepare('SELECT value FROM app_setting WHERE key = ?').get(MARCA_CHAVE) || {}).value || '{}');
    } catch (_) { /* valores por omissão */ }
    const linhas = Array.isArray(guardado.linhas) && guardado.linhas.length ? guardado.linhas : MARCA_PADRAO.linhas;
    return { ...MARCA_PADRAO, ...guardado, linhas: linhas.map((t) => String(t).slice(0, 300)).slice(0, 6) };
}

function guardarMarca(db, body, nowIso) {
    const limpo = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const atual = marca(db);
    const novo = {
        nome: limpo(body.nome, 60) || atual.nome,
        // «digitu.pt» or «@digitu.pt» → «@digitu.pt»; a form without the field keeps it.
        instagram: body.instagram === undefined ? atual.instagram
            : (limpo(body.instagram, 60).replace(/^@+/, '') ? `@${limpo(body.instagram, 60).replace(/^@+/, '')}` : ''),
        slogan: limpo(body.slogan, 200) || atual.slogan,
        numero: limpo(body.numero, 40),
        link: limpo(body.link, 300) || atual.link,
        descricao: limpo(body.descricao, 300) || atual.descricao,
        linhas: Array.isArray(body.linhas) ? body.linhas.map((t) => limpo(t, 300)).filter(Boolean).slice(0, 6) : atual.linhas
    };
    if (!/^https?:\/\//i.test(novo.link)) throw new Error('O link tem de começar por https://');
    db.prepare(`INSERT INTO app_setting (key, value, actualizado_em) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, actualizado_em = excluded.actualizado_em`)
        .run(MARCA_CHAVE, JSON.stringify(novo), nowIso());
    return novo;
}

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
    return { versao: cfg.versao, nota: cfg.nota, regra_conversao: cfg.regra_conversao, fases: cfg.fases, verticais, estados: ESTADOS_TODOS, linhas: LINHAS, projetos: PROJETOS, canais: CANAIS, dores: DORES, dmnBaseUrl: DMN_BASE_URL };
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
    const filtro = `AND l.foco_linha = 'digitu'${vendedorId ? ' AND l.vendedor_id = @vendedorId' : ''}`;
    const rows = db.prepare(`
        SELECT l.vendedor_id, l.business_type, l.foco_estado, l.foco_dor, l.foco_instagram, COUNT(*) AS n
        FROM lead l WHERE l.foco_estado != '' AND NOT (l.foco_arquivado = 1 AND l.foco_estado = 'por_contactar') ${filtro}
        GROUP BY 1, 2, 3, 4, 5
    `).all({ vendedorId });
    const nomes = Object.fromEntries(db.prepare('SELECT id, nome FROM vendedor').all().map((v) => [v.id, v.nome]));
    const vazio = () => ({ por_contactar: 0, contactos: 0, demos: 0, beta: 0, ativos: 0, sem_interesse: 0, instagram: 0, dor_sim: 0, dor_talvez: 0, dor_nao: 0 });
    const somar = (alvo, r) => {
        if (r.foco_instagram) alvo.instagram += r.n;
        if (r.foco_estado === 'quer_ativar') alvo.beta += r.n;
        if (DORES[r.foco_dor]) alvo[`dor_${r.foco_dor}`] += r.n;
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
        porVendedor[r.vendedor_id] = porVendedor[r.vendedor_id] || { id: r.vendedor_id, nome: r.vendedor_id ? (nomes[r.vendedor_id] || '—') : 'Lista comum', ...vazio() };
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
               COUNT(DISTINCT CASE WHEN l.foco_dor = 'sim' THEN l.id END) AS dor_sim,
               COUNT(DISTINCT CASE WHEN l.foco_estado IN ('demo_mostrada', 'quer_ativar', 'ativou') THEN l.id END) AS demos,
               COUNT(DISTINCT CASE WHEN l.foco_estado = 'ativou' THEN l.id END) AS ativos
        FROM evento e JOIN lead l ON l.id = e.entidade_id
        WHERE e.tipo = 'foco_estado' AND COALESCE(json_extract(e.payload_json, '$.canal'), '') != '' ${filtro}
        GROUP BY 1 ORDER BY 2 DESC
    `).all({ vendedorId }).map((c) => ({ ...c, nome: CANAIS[c.canal] || c.canal }));
    // Which value line (princípio) opens doors, and on which channel.
    const porCampo = (campo) => db.prepare(`
        SELECT json_extract(e.payload_json, '$.${campo}') AS nome, COUNT(DISTINCT e.entidade_id) AS contactos,
               COUNT(DISTINCT CASE WHEN l.foco_dor = 'sim' THEN l.id END) AS dor_sim,
               COUNT(DISTINCT CASE WHEN l.foco_estado IN ('demo_mostrada', 'quer_ativar', 'ativou') THEN l.id END) AS demos,
               COUNT(DISTINCT CASE WHEN l.foco_estado = 'ativou' THEN l.id END) AS ativos
        FROM evento e JOIN lead l ON l.id = e.entidade_id
        WHERE e.tipo = 'foco_mensagem' AND COALESCE(json_extract(e.payload_json, '$.${campo}'), '') != '' ${filtro}
        GROUP BY 1 ORDER BY 2 DESC
    `).all({ vendedorId });
    const principios = porCampo('principio');
    const mensagensCanal = porCampo('canal').map((c) => ({ ...c, nome: CANAIS[c.nome] || c.nome }));

    // Which message gets a real conversation going.
    const mensagens = db.prepare(`
        SELECT json_extract(e.payload_json, '$.modelo') AS nome, COUNT(DISTINCT e.entidade_id) AS contactos,
               COUNT(DISTINCT CASE WHEN l.foco_dor = 'sim' THEN l.id END) AS dor_sim,
               COUNT(DISTINCT CASE WHEN l.foco_estado IN ('demo_mostrada', 'quer_ativar', 'ativou') THEN l.id END) AS demos,
               COUNT(DISTINCT CASE WHEN l.foco_estado = 'ativou' THEN l.id END) AS ativos
        FROM evento e JOIN lead l ON l.id = e.entidade_id
        WHERE e.tipo = 'foco_mensagem' ${filtro}
        GROUP BY 1 ORDER BY 2 DESC
    `).all({ vendedorId });
    return {
        total,
        canais,
        mensagens,
        principios,
        mensagensCanal,
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

// One key per real number: «+351 912…», «00351 912…» and «912…» match; a +55 number never matches a Portuguese one.
function chaveTelefone(t) {
    let d = String(t || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    d = d.replace(/\D/g, '');
    return d.length === 9 ? `351${d}` : d;
}

// ---------- never the same business twice ----------
// A contact is the same business if it shares ANY of: a phone (phone or WhatsApp field, any format),
// an Instagram handle, an email, or the same name in the same city (accents, case and punctuation ignored).
const normalizar = (t) => semAcentos(t).replace(/[^a-z0-9]+/g, ' ').trim();
function handleInstagram(valor) {
    const t = String(valor || '').trim();
    const url = t.match(/instagram\.com\/(?:stories\/)?([^/?#\s]+)/i);
    const h = (url ? url[1] : t).replace(/^@/, '');
    return /^[a-z0-9._]{1,30}$/i.test(h) && !/^(p|reel|reels|tv|explore|stories|accounts|direct)$/i.test(h) ? h.toLowerCase() : '';
}
function chavesContacto({ nome, cidade, telefone, whatsapp, instagram, email }) {
    const k = new Set();
    [telefone, whatsapp].forEach((t) => { const c = chaveTelefone(t); if (c.length >= 9) k.add(`t:${c}`); });
    const ig = handleInstagram(instagram);
    if (ig) k.add(`i:${ig}`);
    const em = String(email || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) k.add(`e:${em}`);
    const n = normalizar(nome);
    if (n) k.add(`n:${n}|${normalizar(cidade)}`);
    return [...k];
}
const dadosDoLead = (l) => {
    const o = (() => { try { return JSON.parse(l.foco_origem_json || '{}'); } catch (_) { return {}; } })();
    return { nome: l.nome, cidade: l.cidade, telefone: l.telefone, whatsapp: l.whatsapp, instagram: o.instagram, email: o.email };
};
/** Every lead (Foco or not, archived too) by each of its keys. */
function indiceContactos(db) {
    const indice = new Map();
    db.prepare('SELECT id, nome, cidade, telefone, whatsapp, foco_origem_json, foco_estado FROM lead').all().forEach((l) => {
        // One object per lead, shared by all its keys, so a change (e.g. it joins the list) holds for every key.
        registarNoIndice(indice, { id: l.id, nome: l.nome, foco_estado: l.foco_estado }, dadosDoLead(l));
    });
    return indice;
}
/** The existing lead these details belong to (ignoring `ignorarId`, the one being edited), or null. */
function duplicadoDe(indice, dados, ignorarId = '') {
    for (const k of chavesContacto(dados)) {
        const l = indice.get(k);
        if (l && l.id !== ignorarId) return { ...l, por: { t: 'telefone', i: 'Instagram', e: 'email', n: 'nome e cidade' }[k[0]] };
    }
    return null;
}
const registarNoIndice = (indice, lead, dados) => chavesContacto(dados).forEach((k) => { if (!indice.has(k)) indice.set(k, lead); });

/**
 * Crawler JSON (`node linkgen.js export --json`) → leads "por contactar".
 * Already known (same phone, or same name in the same city) → not duplicated;
 * a known lead that was never in the Foco list joins it. `soFoco` drops rows
 * outside the focus segments — the list to work is the strategy, not the crawl.
 */
function importar(db, rows, { vendedorId, soFoco = true, linha = 'digitu', parseMapsUrl, whatsappIfMobile, nowIso, uuid }) {
    const L = LINHAS[linha] ? linha : 'digitu';
    const inicial = linhaDe(L).inicial;
    const { verticais } = carregar();
    const conhecidos = new Set(verticais.flatMap((v) => v.tipos || []));
    const doFoco = new Set(verticais.filter((v) => v.foco).flatMap((v) => v.tipos || []));
    const r = { novos: 0, ja_existiam: 0, entraram_na_lista: 0, fora_do_foco: 0, invalidos: 0, repetidos: [] };
    const indice = indiceContactos(db);
    const inserir = db.prepare(`INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, foco_estado,
        foco_origem_json, lat, lng, geocode_status, vendedor_id, foco_linha, criado_em)
        VALUES (@id, @tipo, @nome, @morada, @cidade, @telefone, @whatsapp, 'novo', @inicial, @origem, @lat, @lng, @geo, @vendedorId, @linha, @agora)`);
    const juntar = db.prepare(`UPDATE lead SET foco_estado = '${inicial}', foco_linha = '${L}', foco_origem_json = ?,
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
            const dados = { nome, cidade, telefone, whatsapp: row.whatsapp, instagram: row.instagram, email: row.email };
            const existe = duplicadoDe(indice, dados);
            if (existe) {
                if (existe.foco_estado) {
                    r.ja_existiam += 1;
                    if (r.repetidos.length < 30) r.repetidos.push(`${nome} = ${existe.nome || '(sem nome)'} (mesmo ${existe.por})`);
                    return;
                }
                juntar.run(origem, lat, lng, existe.id);
                existe.foco_estado = inicial;
                r.entraram_na_lista += 1;
                return;
            }
            const id = uuid();
            inserir.run({
                id, tipo, nome, morada: String(row.morada || '').slice(0, 300), cidade, telefone,
                whatsapp: whatsappIfMobile(telefone), origem, lat, lng, geo: lat != null ? 'maps' : '',
                vendedorId: vendedorId || '', inicial, linha: L, agora: nowIso()
            });
            // A repeat further down this same file is caught too.
            registarNoIndice(indice, { id, nome, foco_estado: inicial }, dados);
            r.novos += 1;
        });
    })();
    return r;
}

/**
 * CSV (leadgen `ligar_*.csv`, or the same sheet re-saved by Excel/Numbers) → rows for importar().
 * Header names are the row keys (nome, telefone, cidade, tipo, morada, maps, …). Handles the BOM,
 * quoted fields with commas/newlines, and Excel's «;» separator. Rows marked nao_contactar are dropped.
 */
function lerCsv(texto) {
    const t = String(texto || '').replace(/^﻿/, '');
    const primeira = t.split('\n', 1)[0];
    const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
    const linhas = [];
    let campo = '', linha = [], aspas = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (aspas) {
            if (c === '"' && t[i + 1] === '"') { campo += '"'; i += 1; }
            else if (c === '"') aspas = false;
            else campo += c;
        } else if (c === '"') aspas = true;
        else if (c === sep) { linha.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && t[i + 1] === '\n') i += 1;
            linha.push(campo); linhas.push(linha); linha = []; campo = '';
        } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    const [cab, ...resto] = linhas;
    if (!cab) return [];
    const chaves = cab.map((k) => semAcentos(k).trim());
    return resto
        .filter((l) => l.some((v) => v.trim()))
        .map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] || '').trim()])))
        .filter((r) => !r.nao_contactar);
}

/** Every type id we know how to sell to (plus «generico» = sem tipo). */
function tiposConhecidos() {
    return new Set(['generico', ...carregar().verticais.flatMap((v) => v.tipos || [])]);
}

/** Deletes one lead and everything hanging off it. A lead with a closed deal is refused. */
function apagarLead(db, leadId) {
    if (!db.prepare('SELECT 1 FROM lead WHERE id = ?').get(leadId)) return 'inexistente';
    const fechado = db.prepare(`SELECT 1 FROM proposta p JOIN contrato c ON c.proposta_id = p.id
        JOIN projeto pr ON pr.contrato_id = c.id WHERE p.lead_id = ? LIMIT 1`).get(leadId);
    if (fechado) return 'fechado';
    db.transaction(() => {
        db.prepare('UPDATE visita SET lead_id = NULL WHERE lead_id = ?').run(leadId);
        db.prepare('DELETE FROM nota WHERE lead_id = ?').run(leadId);
        db.prepare('DELETE FROM evento WHERE entidade = ? AND entidade_id = ?').run('lead', leadId);
        db.prepare('DELETE FROM lead_toque WHERE lead_id = ?').run(leadId);
        db.prepare('DELETE FROM demo_visita WHERE lead_id = ?').run(leadId);
        db.prepare('DELETE FROM dados_negocio WHERE lead_id = ?').run(leadId);
        db.prepare('DELETE FROM lead WHERE id = ?').run(leadId);
    })();
    return 'ok';
}

/** The contacts in `ids` this seller may change: admin any Foco contact, a partner their own. */
function contactosMeus(db, ids, vendedor) {
    const um = db.prepare("SELECT vendedor_id FROM lead WHERE id = ? AND foco_estado != ''");
    return ids.filter((id) => {
        const c = um.get(id);
        return c && (vendedor.papel === 'admin' || c.vendedor_id === vendedor.id);
    });
}

/** Same type for every contact in `ids`. */
function mudarTipo(db, ids, tipo) {
    const up = db.prepare('UPDATE lead SET business_type = ? WHERE id = ?');
    return db.transaction(() => ids.reduce((n, id) => n + up.run(tipo, id).changes, 0))();
}

/** Deletes `ids`; contacts with a closed deal are kept and counted. */
function apagarLote(db, ids) {
    const r = { apagados: 0, com_negocio: 0 };
    ids.forEach((id) => { const x = apagarLead(db, id); if (x === 'ok') r.apagados += 1; else if (x === 'fechado') r.com_negocio += 1; });
    return r;
}

/** Lessons learned, newest first, with the business each came from. Admin sees all, a partner their own. */
// ponytail: a lesson is a note starting «Lição:», no column; give nota a tipo if lessons need their own fields
function licoes(db, vendedor) {
    const admin = vendedor.papel === 'admin';
    return db.prepare(`SELECT n.texto, n.criado_em, l.id AS lead_id, l.nome, l.business_type AS tipo, l.cidade,
            l.foco_estado AS estado, l.foco_dor AS dor
        FROM nota n JOIN lead l ON l.id = n.lead_id
        WHERE n.texto LIKE 'Lição:%' ${admin ? '' : 'AND l.vendedor_id = ?'}
        ORDER BY n.criado_em DESC LIMIT 1000`).all(...(admin ? [] : [vendedor.id]))
        .map((r) => ({ ...r, texto: r.texto.replace(/^Lição:\s*/, '') }));
}

/**
 * Status and/or next-contact date for many contacts at once. `undefined` keeps a field;
 * closing a lead (ativou / sem_interesse) clears its date — closed means no next step.
 * `log(id, tipo, payload)` writes each lead's history.
 */
function seguimentoLote(db, ids, { estado, voltarEm }, log) {
    const um = db.prepare('SELECT foco_estado, foco_linha FROM lead WHERE id = ?');
    const up = db.prepare(`UPDATE lead SET foco_estado = COALESCE(@estado, foco_estado),
        revisitar_em = COALESCE(@voltarEm, revisitar_em) WHERE id = @id`);
    return db.transaction(() => ids.reduce((n, id) => {
        const row = um.get(id) || {};
        const L = linhaDe(row.foco_linha);
        if (estado !== undefined && !L.estados[estado]) return n; // status from the other line: skip
        const data = voltarEm === undefined && estado !== undefined && L.fechados.includes(estado) ? '' : voltarEm;
        up.run({ id, estado: estado === undefined ? null : estado, voltarEm: data === undefined ? null : data });
        log(id, estado === undefined ? 'foco_voltar' : 'foco_estado', { de: row.foco_estado, estado: estado === undefined ? row.foco_estado : estado, voltar_em: data, lote: true });
        return n + 1;
    }, 0))();
}

/** Archive (or restore) contacts. Returns how many changed. */
function arquivarLote(db, ids, arquivar, log) {
    const up = db.prepare('UPDATE lead SET foco_arquivado = ? WHERE id = ? AND foco_arquivado != ?');
    const v = arquivar ? 1 : 0;
    return db.transaction(() => ids.reduce((n, id) => {
        if (!up.run(v, id, v).changes) return n;
        log(id, 'foco_arquivo', { arquivado: arquivar });
        return n + 1;
    }, 0))();
}

/** Moves contacts to the other line; they start that line's pipeline from the top. */
function mudarLinha(db, ids, linha, log) {
    const L = linhaDe(linha);
    const um = db.prepare('SELECT foco_linha, foco_estado FROM lead WHERE id = ?');
    const up = db.prepare("UPDATE lead SET foco_linha = ?, foco_estado = ?, revisitar_em = '' WHERE id = ?");
    return db.transaction(() => ids.reduce((n, id) => {
        const row = um.get(id);
        if (!row || row.foco_linha === linha) return n;
        up.run(linha, L.inicial, id);
        log(id, 'foco_linha', { de: linhaDe(row.foco_linha).nome, para: L.nome, estado_antes: row.foco_estado });
        return n + 1;
    }, 0))();
}

/**
 * Pulls each Digitu lead's usage from the app (points, level, milestones, last activity) and
 * moves the funnel on its own: used the app → beta user; paid → activated.
 */
async function sincronizarUso(db, { vendedor, log, nowIso }) {
    const meus = vendedor.papel === 'admin' ? '' : 'AND vendedor_id = ?';
    const leads = db.prepare(`SELECT id, dmn_token, foco_estado FROM lead WHERE foco_linha = 'digitu' AND dmn_token != ''
        AND foco_estado IN ('demo_mostrada', 'quer_ativar', 'ativou', 'voltar') AND foco_arquivado = 0 ${meus}`).all(...(meus ? [vendedor.id] : []));
    const up = db.prepare('UPDATE lead SET foco_uso_json = ? WHERE id = ?');
    const mover = db.prepare('UPDATE lead SET foco_estado = ? WHERE id = ?');
    const r = { n: 0, falhas: 0, mudaram: 0 };
    await Promise.all(leads.map(async (l) => {
        try {
            const s = await dmn(`/api/digitalize/sessoes/${encodeURIComponent(l.dmn_token)}`);
            const acoes = Array.isArray(s.acoes) ? s.acoes : [];
            const ultima = [s.atualizadoEm, ...acoes.map((a) => a.criado_em)].filter(Boolean).sort().pop() || '';
            up.run(JSON.stringify({ pontos: s.pontos || 0, nivel: s.nivel || 0, nivelNome: s.nivelNome || '', pago: Boolean(s.pago),
                ultimaAtividade: ultima, acoes, sincronizado_em: nowIso() }), l.id);
            r.n += 1;
            const novo = s.pago ? 'ativou' : (s.pontos > 0 && ['demo_mostrada', 'voltar'].includes(l.foco_estado) ? 'quer_ativar' : null);
            if (novo && novo !== l.foco_estado) {
                mover.run(novo, l.id);
                log(l.id, 'foco_estado', { de: l.foco_estado, estado: novo, auto: true });
                r.mudaram += 1;
            }
        } catch (_) { r.falhas += 1; }
    }));
    return r;
}

module.exports = { chavesContacto, indiceContactos, duplicadoDe, chaveTelefone, arquivarLote, LINHAS, PROJETOS, ESTADOS_TODOS, linhaDe, mudarLinha, sincronizarUso, seguimentoLote, licoes, lerCsv, tiposConhecidos, apagarLead, contactosMeus, mudarTipo, apagarLote, carregar, segmentoDoTipo, criarDemo, resumo, importar, tipoDoCrawler, marca, guardarMarca, ESTADOS, CANAIS, DORES, VERTICAIS_FILE, DMN_BASE_URL };
