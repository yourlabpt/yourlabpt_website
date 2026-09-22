// Foco comercial — the YourLab sales tool for digitalizemeunegocio.pt.
// Segments and scripts come from digitalizemeunegocio's verticais.json via
// /api/digitalizept/foco; this file only shows them and records what happened.
import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { registerDigitalizeptSw } from './pwa.js';

registerDigitalizeptSw();

const PRODUTO = { website: 'Site', bot: 'Bot', redes: 'Gestor social' };
const SKU = { bot_leads: 'Bot de Atendimento (os clientes marcam)', bot_agenda: 'Agenda Virtual (o dono gere as marcações)' };
const FASE = { ataque: 'Ataque', expansao: 'Expansão', depois: 'Depois' };

const state = {
    me: null, cfg: null, tab: 'segmentos', contactos: [], todos: false, equipa: [], pessoas: [],
    filtro: { texto: '', estado: '', segmento: '' }
};
// Pin/chip colour per state: grey = not yet touched, warm = in progress, green = won, red = lost.
const COR = {
    por_contactar: '#8e8e93', contactado: '#e8d5b7', demo_mostrada: '#f5a623', quer_ativar: '#f97316',
    ativou: '#4ade80', voltar: '#60a5fa', sem_interesse: '#ff6b6b'
};
const $ = (id) => document.getElementById(id);
const main = $('foco-main');
// `cond && node` leaves false/''/undefined behind; replaceChildren would print them.
const nos = (list) => list.flat(Infinity).filter((n) => n != null && n !== false && n !== '');
const render = (...list) => main.replaceChildren(...nos(list));

// ---------- tiny DOM helper ----------
function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k === 'class') node.className = v;
        else node.setAttribute(k, v === true ? '' : v);
    });
    nos(children).forEach((c) => {
        node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
}

// {cidade} and friends stay visible as slots the seller fills in out loud.
const texto = (t) => String(t || '').replace(/\{([a-z_]+)\}/g, (_, k) => `‹${k.replace(/_/g, ' ')}›`);

function toast(msg, erro = false) {
    const t = h('div', { class: `toast${erro ? ' error' : ''}` }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
}

async function api(path, options = {}) {
    const { response, data } = await apiRequest(path, { ...options, token: getToken() });
    if (response.status === 401) {
        clearToken();
        mostrarLogin(data.error || 'Sessão expirada.');
        throw new Error('unauthorized');
    }
    if (!response.ok) throw new Error(data.error || 'Erro no servidor.');
    return data;
}

// ---------- login ----------
function mostrarLogin(msg = '') {
    $('foco').classList.add('hidden');
    $('login-overlay').classList.remove('hidden');
    $('login-error').textContent = msg;
}

$('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { response, data } = await apiRequest('/api/digitalizept/login', {
        method: 'POST',
        body: { utilizador: $('user-input').value.trim(), password: $('key-input').value }
    }).catch(() => ({ response: { ok: false }, data: { error: 'Sem ligação ao servidor.' } }));
    if (!response.ok || !data.token) {
        $('login-error').textContent = data.error || 'Não foi possível entrar.';
        return;
    }
    setToken(data.token);
    arrancar();
});

$('foco-sair').addEventListener('click', async () => {
    await apiRequest('/api/digitalizept/logout', { method: 'POST', token: getToken() }).catch(() => {});
    clearToken();
    mostrarLogin();
});

// ---------- shell ----------
document.querySelectorAll('.foco-tabs button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.tab)));

async function irPara(tab) {
    state.tab = tab;
    document.querySelectorAll('.foco-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    main.replaceChildren(h('p', { class: 'foco-vazio' }, 'A carregar…'));
    try {
        if (tab === 'segmentos') renderSegmentos();
        if (tab === 'contactos') await renderContactos();
        if (tab === 'mapa') await renderMapa();
        if (tab === 'resultados') await renderResultados();
        if (tab === 'equipa') await renderEquipa();
    } catch (err) {
        if (err.message !== 'unauthorized') main.replaceChildren(h('p', { class: 'foco-vazio' }, err.message));
    }
}

function abrirSheet(...conteudo) {
    $('foco-sheet-panel').replaceChildren(
        h('button', { type: 'button', class: 'foco-sheet-fechar', 'aria-label': 'Fechar', onclick: fecharSheet }, '×'),
        ...nos(conteudo)
    );
    $('foco-sheet').classList.remove('hidden');
    $('foco-sheet-panel').scrollTop = 0;
}
function fecharSheet() { $('foco-sheet').classList.add('hidden'); }
$('foco-sheet').addEventListener('click', (e) => { if (e.target.hasAttribute('data-fechar')) fecharSheet(); });

const segmentoDoTipo = (tipo) => state.cfg.verticais.find((v) => v.foco && v.tipos.includes(tipo))
    || state.cfg.verticais.find((v) => v.tipos.includes(tipo));
const nomeTipo = (tipo) => {
    const v = segmentoDoTipo(tipo);
    return (v && (v.tipos_nomes.find((t) => t.id === tipo) || {}).nome) || tipo;
};
const entrada = (v) => (v.produtos_entrada || [v.produto_entrada]).map((p) => PRODUTO[p] || p).join(' + ');

// ---------- Segmentos ----------
function renderSegmentos() {
    const foco = state.cfg.verticais.filter((v) => v.foco);
    const depois = state.cfg.verticais.filter((v) => !v.foco);
    render(
        h('section', { class: 'foco-regra' },
            h('h2', {}, 'A regra'),
            h('ol', {}, state.cfg.regra_conversao.map((r) => h('li', {}, r))),
            h('p', {}, 'Diga o resultado no idioma do negócio — nunca «tenho uma app com site, bots e gestor social». Demo é demo; nunca se promete resultado.')
        ),
        h('div', { class: 'foco-lista' }, foco.map((v) => h('button', { type: 'button', class: 'foco-card', onclick: () => abrirSegmento(v) },
            h('div', { class: 'foco-card-top' },
                h('span', { class: 'foco-num' }, v.foco),
                h('strong', {}, v.nome),
                h('span', { class: `foco-fase foco-fase-${v.fase}` }, FASE[v.fase] || v.fase)
            ),
            h('p', { class: 'foco-frase' }, `“${v.posicionamento}”`),
            h('p', { class: 'foco-meta' }, `Entrada: ${entrada(v)}`)
        ))),
        h('details', { class: 'foco-depois' },
            h('summary', {}, `Fora do foco atual (${depois.length})`),
            depois.map((v) => h('p', {}, h('strong', {}, v.nome), ` — ${v.dor_principal}`))
        )
    );
}

function bloco(titulo, ...conteudo) {
    return h('section', { class: 'foco-bloco' }, h('h3', {}, titulo), ...conteudo);
}
const lista = (itens) => h('ul', {}, (itens || []).map((i) => h('li', {}, texto(i))));

function abrirSegmento(v) {
    const a = v.abordagem || {};
    const r = v.redes || {};
    abrirSheet(
        h('p', { class: 'foco-meta' }, `Foco ${v.foco || '—'} · ${FASE[v.fase] || v.fase} · Entrada: ${entrada(v)}`),
        h('h2', {}, v.nome),
        h('p', { class: 'foco-frase foco-frase-grande' }, `“${v.posicionamento}”`),
        v.posicionamento_sub && h('p', {}, v.posicionamento_sub),
        h('button', { type: 'button', class: 'btn-primary foco-cta', onclick: () => novoContacto(v) }, 'Registar contacto e criar demo'),
        bloco('Contacto',
            h('dl', {},
                h('dt', {}, 'Dor principal'), h('dd', {}, v.dor_principal),
                h('dt', {}, 'Canal'), h('dd', {}, a.canal),
                h('dt', {}, 'Gancho'), h('dd', { class: 'foco-dizer' }, texto(a.gancho)),
                h('dt', {}, 'Pergunta de abertura'), h('dd', { class: 'foco-dizer' }, texto(a.pergunta_abertura)),
                a.objecao && [h('dt', {}, 'Objeção provável'), h('dd', {}, `«${a.objecao.texto}» → ${a.objecao.resposta}`)],
                h('dt', {}, 'Prova a mostrar'), h('dd', {}, texto(a.prova))
            )
        ),
        v.porque && bloco('Porquê este segmento', h('p', {}, `${v.porque.ticket} ${v.porque.dor}`)),
        v.bot && bloco('Bot recomendado',
            h('p', {}, SKU[v.bot_sku] || v.bot_sku),
            h('p', { class: 'foco-meta' }, v.bot.servicos.map((s) => `${s.nome} (${s.duracaoMin} min)`).join(' · '))
        ),
        r.pilares && bloco(`Gestor social · tom ${r.tom}, ritmo ${r.frequencia}`,
            h('ul', {}, r.pilares.map((p) => h('li', {}, h('strong', {}, p.nome), ` — ${p.ideia}`))),
            h('p', { class: 'foco-meta' }, 'Cuidados que a IA respeita sempre:'),
            lista(r.cuidados)
        ),
        v.minimos && bloco('O que pedir para ativar (só depois de ativar)',
            Object.entries(v.minimos).map(([p, itens]) => h('div', {}, h('strong', {}, PRODUTO[p] || p), lista(itens)))
        ),
        v.kpi_30_dias && bloco('Medir aos 30 dias', lista(v.kpi_30_dias))
    );
}

// ---------- novo contacto ----------
function campo(label, input) {
    return h('label', { class: 'foco-campo' }, h('span', {}, label), input);
}

function novoContacto(v) {
    const tipo = h('select', { class: 'field-input', name: 'tipo' }, v.tipos_nomes.map((t) => h('option', { value: t.id }, t.nome)));
    const form = h('form', { class: 'foco-form' },
        campo('Nome do negócio *', h('input', { class: 'field-input', name: 'nome', required: true, autocomplete: 'off' })),
        campo('Tipo', tipo),
        campo('Cidade', h('input', { class: 'field-input', name: 'cidade', autocomplete: 'off' })),
        campo('WhatsApp', h('input', { class: 'field-input', name: 'whatsapp', type: 'tel', inputmode: 'tel' })),
        campo('Nota (quem atendeu, o que disse)', h('textarea', { class: 'field-input', name: 'nota', rows: 3 })),
        h('button', { type: 'submit', class: 'btn-primary' }, 'Guardar e criar demo')
    );
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'A criar a demo…';
        try {
            const body = Object.fromEntries(new FormData(form));
            const r = await api('/api/digitalizept/foco/contactos', { method: 'POST', body });
            if (r.erroDemo) toast(r.erroDemo, true);
            abrirContacto(r.contacto);
        } catch (err) {
            if (err.message !== 'unauthorized') toast(err.message, true);
            btn.disabled = false;
            btn.textContent = 'Guardar e criar demo';
        }
    });
    abrirSheet(h('p', { class: 'foco-meta' }, v.nome), h('h2', {}, 'Novo contacto'), form);
    form.querySelector('input').focus();
}

// ---------- contacto ----------
function waNumero(n) {
    const d = String(n || '').replace(/\D/g, '');
    return d.length === 9 ? `351${d}` : d;
}

function mensagemDemo(c) {
    const v = segmentoDoTipo(c.tipo);
    const frase = v && v.posicionamento ? `${v.posicionamento} ` : '';
    return `Olá! Preparei uma demonstração com o nome de ${c.nome}. ${frase}Veja como fica: ${c.dmn_link}`;
}

function acoesDemo(c) {
    if (!c.dmn_link) {
        return h('button', { type: 'button', class: 'btn-primary', onclick: async (e) => {
            e.target.disabled = true;
            try { abrirContacto((await api(`/api/digitalizept/foco/contactos/${c.id}/demo`, { method: 'POST' })).contacto); }
            catch (err) { toast(err.message, true); e.target.disabled = false; }
        } }, 'Criar demo');
    }
    const wa = `https://wa.me/${waNumero(c.whatsapp || c.telefone)}?text=${encodeURIComponent(mensagemDemo(c))}`;
    return h('div', { class: 'foco-acoes' },
        h('a', { class: 'btn-primary', href: c.dmn_link, target: '_blank', rel: 'noopener' }, 'Mostrar demo'),
        h('a', { class: 'btn-secondary', href: wa, target: '_blank', rel: 'noopener' }, 'Enviar WhatsApp'),
        h('button', { type: 'button', class: 'btn-secondary', onclick: () => navigator.clipboard.writeText(c.dmn_link).then(() => toast('Link copiado.')) }, 'Copiar')
    );
}

function abrirContacto(c) {
    const v = segmentoDoTipo(c.tipo);
    let estado = c.estado;
    const botoes = Object.entries(state.cfg.estados).map(([id, nome]) => h('button', {
        type: 'button', class: `foco-estado${id === estado ? ' active' : ''}`, 'data-estado': id,
        onclick: (e) => {
            estado = id;
            e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.estado === id));
            nota.placeholder = id === 'sem_interesse' ? 'Porquê? (é isto que nos ensina)' : 'Nota';
        }
    }, nome));
    const voltar = h('input', { class: 'field-input', type: 'date', value: c.voltar_em || '' });
    const nota = h('textarea', { class: 'field-input', rows: 3, placeholder: 'Nota' });
    const canal = h('select', { class: 'field-input' }, h('option', { value: '' }, '—'),
        Object.entries(state.cfg.canais).map(([id, nome]) => h('option', { value: id }, nome)));
    const historico = h('div', { class: 'foco-historico' }, h('p', { class: 'foco-meta' }, 'A carregar…'));
    carregarHistorico(c.id, historico);
    abrirSheet(
        h('p', { class: 'foco-meta' }, [nomeTipo(c.tipo), c.cidade, state.me.papel === 'admin' ? c.vendedor : ''].filter(Boolean).join(' · ')),
        h('h2', {}, c.nome),
        c.morada && h('p', { class: 'foco-meta' }, c.morada),
        c.lat == null && c.morada && h('button', { type: 'button', class: 'foco-link', onclick: async (e) => {
            e.target.disabled = true;
            try {
                const { lead } = await api(`/api/digitalizept/leads/${c.id}/geocode`, { method: 'POST' });
                Object.assign(c, { lat: lead.lat, lng: lead.lng });
                toast('Já está no mapa.');
                e.target.remove();
            } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); e.target.disabled = false; }
        } }, 'Pôr no mapa pela morada'),
        contactarBotoes(c),
        bloco('1 · Mostrar a demo com o nome real', acoesDemo(c)),
        bloco('2 · O que aconteceu', h('div', { class: 'foco-estados' }, botoes),
            campo('Como falou', canal), campo('Voltar a falar em', voltar), nota,
            h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
                try {
                    await api(`/api/digitalizept/foco/contactos/${c.id}/estado`, {
                        method: 'POST', body: { estado, voltar_em: voltar.value, nota: nota.value, canal: canal.value }
                    });
                    toast('Guardado.');
                    fecharSheet();
                    irPara(state.tab === 'mapa' ? 'mapa' : 'contactos');
                } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
            } }, 'Guardar')
        ),
        bloco('Histórico', historico),
        state.me.papel === 'admin' && bloco('Quem trata', atribuir(c)),
        v && h('button', { type: 'button', class: 'foco-link', onclick: () => abrirSegmento(v) }, `Ver guião · ${v.nome}`)
    );
}

function contactarBotoes(c) {
    const o = c.origem || {};
    const tel = c.telefone || c.whatsapp;
    const wa = c.whatsapp || (waNumero(tel).startsWith('3519') ? tel : '');
    const links = [
        tel && ['Ligar', `tel:${String(tel).replace(/\s/g, '')}`],
        wa && ['WhatsApp', `https://wa.me/${waNumero(wa)}`],
        o.instagram && ['Instagram', o.instagram],
        o.facebook && ['Facebook', o.facebook],
        o.website && ['Site atual', o.website],
        o.maps && ['Maps', o.maps],
        o.email && ['Email', `mailto:${o.email}`]
    ].filter(Boolean);
    if (!links.length) return null;
    return h('div', { class: 'foco-contactar' }, links.map(([nome, href]) => h('a', { href, target: '_blank', rel: 'noopener' }, nome)));
}

const QUE = {
    foco_estado: (e) => `${state.cfg.estados[e.estado] || e.estado}${e.canal ? ` · ${state.cfg.canais[e.canal] || e.canal}` : ''}`,
    foco_demo: () => 'Demo criada',
    foco_atribuido: (e) => `Passou para ${e.para}`,
    nota: () => 'Nota'
};

async function carregarHistorico(id, alvo) {
    try {
        const { historico } = await api(`/api/digitalizept/foco/contactos/${id}/historico`);
        alvo.replaceChildren(...(historico.length ? historico.map((e) => h('div', { class: 'foco-evento' },
            h('p', {}, h('strong', {}, (QUE[e.tipo] || (() => e.tipo.replace(/_/g, ' ')))(e))),
            h('p', { class: 'foco-meta' }, [new Date(e.quando).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }), e.quem].filter(Boolean).join(' · ')),
            e.nota && h('p', {}, e.nota),
            e.voltar_em && h('p', { class: 'foco-meta' }, `Voltar a falar: ${e.voltar_em}`)
        )) : [h('p', { class: 'foco-meta' }, 'Nada registado ainda.')]));
    } catch (err) {
        if (err.message !== 'unauthorized') alvo.replaceChildren(h('p', { class: 'foco-meta' }, err.message));
    }
}

function atribuir(c) {
    const sel = h('select', { class: 'field-input', onchange: async () => {
        try {
            await api(`/api/digitalizept/foco/contactos/${c.id}`, { method: 'PATCH', body: { vendedor_id: sel.value } });
            toast('Atribuído.');
        } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
    } }, state.pessoas.map((p) => h('option', { value: p.id, selected: p.id === c.vendedor_id }, p.nome)));
    return sel;
}

// ---------- Contactos (lista + filtros + importar) ----------
async function carregarContactos() {
    const q = state.todos ? '?todos=1' : '';
    state.contactos = (await api(`/api/digitalizept/foco/contactos${q}`)).contactos;
}

function filtrados() {
    const { texto: t, estado, segmento } = state.filtro;
    const alvo = t.trim().toLowerCase();
    return state.contactos.filter((c) => (!estado || c.estado === estado)
        && (!segmento || ((segmentoDoTipo(c.tipo) || {}).id || 'outros') === segmento)
        && (!alvo || `${c.nome} ${c.cidade} ${c.morada} ${c.telefone}`.toLowerCase().includes(alvo)));
}

function barraFiltros(aoMudar) {
    const f = state.filtro;
    const contagem = (id) => state.contactos.filter((c) => c.estado === id).length;
    return h('div', { class: 'foco-filtros' },
        h('input', { class: 'field-input', type: 'search', placeholder: 'Procurar nome, cidade, telefone…', value: f.texto,
            oninput: (e) => { f.texto = e.target.value; aoMudar(); } }),
        h('select', { class: 'field-input', onchange: (e) => { f.estado = e.target.value; aoMudar(); } },
            h('option', { value: '' }, `Todos os estados (${state.contactos.length})`),
            Object.entries(state.cfg.estados).map(([id, nome]) => h('option', { value: id, selected: f.estado === id }, `${nome} (${contagem(id)})`))),
        h('select', { class: 'field-input', onchange: (e) => { f.segmento = e.target.value; aoMudar(); } },
            h('option', { value: '' }, 'Todos os segmentos'),
            state.cfg.verticais.filter((v) => v.foco).map((v) => h('option', { value: v.id, selected: f.segmento === v.id }, `${v.foco} · ${v.nome}`)),
            h('option', { value: 'outros', selected: f.segmento === 'outros' }, 'Outros')),
        state.me.papel === 'admin' && h('label', { class: 'foco-toggle' },
            h('input', { type: 'checkbox', checked: state.todos, onchange: (e) => { state.todos = e.target.checked; irPara(state.tab); } }),
            ' Toda a equipa')
    );
}

function cartaoContacto(c, hoje) {
    return h('button', { type: 'button', class: 'foco-card', onclick: () => abrirContacto(c) },
        h('div', { class: 'foco-card-top' },
            h('strong', {}, c.nome),
            h('span', { class: `foco-chip foco-chip-${c.estado}` }, state.cfg.estados[c.estado] || c.estado)
        ),
        h('p', { class: 'foco-meta' }, [nomeTipo(c.tipo), c.cidade, state.todos ? c.vendedor : ''].filter(Boolean).join(' · ')),
        c.voltar_em && h('p', { class: `foco-meta${c.voltar_em <= hoje ? ' foco-hoje' : ''}` }, `Voltar a falar: ${c.voltar_em}`)
    );
}

const MAX_LISTA = 200;

async function renderContactos() {
    await carregarContactos();
    const hoje = new Date().toISOString().slice(0, 10);
    const listaEl = h('div', { class: 'foco-lista' });
    const pintar = () => {
        const itens = filtrados();
        listaEl.replaceChildren(...nos([
            itens.slice(0, MAX_LISTA).map((c) => cartaoContacto(c, hoje)),
            itens.length > MAX_LISTA && h('p', { class: 'foco-meta' }, `A mostrar ${MAX_LISTA} de ${itens.length}. Afine o filtro ou use o mapa.`),
            !itens.length && h('p', { class: 'foco-vazio' }, state.contactos.length ? 'Nenhum contacto com este filtro.' : 'Ainda sem contactos. Importe o JSON do crawler ou registe um a partir de um segmento.')
        ]));
    };
    render(
        h('div', { class: 'foco-acoes' },
            h('button', { type: 'button', class: 'btn-secondary', onclick: abrirImportar }, 'Importar JSON do crawler')),
        barraFiltros(pintar),
        listaEl
    );
    pintar();
}

function abrirImportar() {
    const ficheiro = h('input', { type: 'file', accept: '.json,application/json', class: 'field-input' });
    const colar = h('textarea', { class: 'field-input', rows: 5, placeholder: 'ou cole aqui o conteúdo de out/novos.json' });
    const soFoco = h('input', { type: 'checkbox', checked: true });
    const para = state.me.papel === 'admin' && h('select', { class: 'field-input' },
        state.pessoas.map((p) => h('option', { value: p.id, selected: p.id === state.me.id }, p.nome)));
    const resultado = h('div');
    const botao = h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
        let rows;
        try {
            const txt = ficheiro.files[0] ? await ficheiro.files[0].text() : colar.value;
            rows = JSON.parse(txt);
            if (!Array.isArray(rows)) rows = rows.businesses || rows.rows || [];
        } catch (_) {
            toast('Não é um JSON válido.', true);
            return;
        }
        botao.disabled = true;
        botao.textContent = `A importar ${rows.length}…`;
        try {
            const r = await api('/api/digitalizept/foco/importar', {
                method: 'POST', body: { rows, soFoco: soFoco.checked, vendedor_id: para ? para.value : undefined }
            });
            resultado.replaceChildren(bloco('Resultado', lista([
                `${r.novos} novos contactos por contactar`,
                `${r.entraram_na_lista} já existiam e entraram na lista`,
                `${r.ja_existiam} já estavam na lista (ignorados)`,
                soFoco.checked && `${r.fora_do_foco} fora dos segmentos em foco (ignorados)`,
                r.invalidos && `${r.invalidos} sem nome (ignorados)`
            ].filter(Boolean))));
            if (state.tab === 'contactos' || state.tab === 'mapa') irPara(state.tab);
        } catch (err) {
            if (err.message !== 'unauthorized') toast(err.message, true);
        }
        botao.disabled = false;
        botao.textContent = 'Importar';
    } }, 'Importar');
    abrirSheet(
        h('h2', {}, 'Importar do crawler'),
        h('p', { class: 'foco-meta' }, 'O ficheiro de «node linkgen.js export --json out/novos.json --new». Quem já existe não é duplicado.'),
        ficheiro, colar,
        h('label', { class: 'foco-toggle' }, soFoco, ' Só os segmentos em foco'),
        para && campo('Atribuir a', para),
        botao, resultado
    );
}

// ---------- Mapa ----------
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
function carregarLeaflet() {
    if (window.L) return Promise.resolve();
    document.head.append(h('link', { rel: 'stylesheet', href: `${LEAFLET}.css` }));
    return new Promise((ok, falha) => document.head.append(h('script', {
        src: `${LEAFLET}.js`, onload: ok, onerror: () => falha(new Error('Não foi possível carregar o mapa.'))
    })));
}

async function renderMapa() {
    await Promise.all([carregarContactos(), carregarLeaflet()]);
    const mapaEl = h('div', { class: 'foco-mapa' });
    const semPin = h('p', { class: 'foco-meta' });
    const legenda = h('div', { class: 'foco-legenda' }, Object.entries(state.cfg.estados).map(([id, nome]) =>
        h('span', {}, h('i', { style: `background:${COR[id]}` }), nome)));
    render(barraFiltros(() => pintar()), mapaEl, legenda, semPin);
    const mapa = window.L.map(mapaEl).setView([41.15, -8.61], 11);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(mapa);
    const camada = window.L.layerGroup().addTo(mapa);
    let primeiraVez = true;
    function pintar() {
        camada.clearLayers();
        const itens = filtrados();
        const comPin = itens.filter((c) => c.lat != null && c.lng != null);
        comPin.forEach((c) => window.L.circleMarker([c.lat, c.lng], {
            radius: 7, color: '#1b1b1b', weight: 1, fillColor: COR[c.estado] || '#8e8e93', fillOpacity: 0.95
        }).bindTooltip(c.nome).on('click', () => abrirContacto(c)).addTo(camada));
        semPin.textContent = `${comPin.length} no mapa${itens.length > comPin.length ? ` · ${itens.length - comPin.length} sem localização (ver em Contactos)` : ''}`;
        if (primeiraVez && comPin.length) mapa.fitBounds(comPin.map((c) => [c.lat, c.lng]), { padding: [24, 24], maxZoom: 15 });
        primeiraVez = false;
    }
    pintar();
}

// ---------- Resultados ----------
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function linhaFunil(r) {
    return [r.contactos, r.demos, r.ativos, pct(r.ativos, r.contactos)].map((n) => h('td', {}, n));
}

async function renderResultados() {
    const r = await api('/api/digitalizept/foco/resumo');
    const t = r.total;
    const cab = (primeira) => h('tr', {}, [primeira, 'Contactos', 'Demos', 'Ativos', 'Conv.'].map((x) => h('th', {}, x)));
    render(
        h('section', { class: 'foco-kpis' },
            [['Por contactar', t.por_contactar], ['Contactos', t.contactos], ['Demos mostradas', t.demos], ['Produtos ativos', t.ativos]].map(([k, n]) => h('div', {}, h('strong', {}, n), h('span', {}, k)))
        ),
        t.ativos === 0 && h('p', { class: 'foco-meta' }, 'Objetivo agora: converter o primeiro e perceber porquê.'),
        bloco('Por segmento',
            h('table', { class: 'foco-tabela' }, cab('Segmento'), r.segmentos.map((s) => h('tr', {}, h('td', {}, s.nome), ...linhaFunil(s)))),
            r.segmentos.filter((s) => s.motivos.length).map((s) => h('div', { class: 'foco-motivos' },
                h('strong', {}, `Porque disseram não — ${s.nome}`), lista(s.motivos)))
        ),
        r.canais.length > 0 && bloco('Por canal — o que leva à demo',
            h('table', { class: 'foco-tabela' }, cab('Canal'), r.canais.map((c) => h('tr', {}, h('td', {}, c.nome), ...linhaFunil(c))))),
        state.me.papel === 'admin' && bloco('Por pessoa',
            h('table', { class: 'foco-tabela' }, cab('Quem'), r.vendedores.map((p) => h('tr', {}, h('td', {}, p.nome), ...linhaFunil(p)))))
    );
}

// ---------- Equipa (admin) ----------
async function renderEquipa() {
    state.equipa = (await api('/api/digitalizept/equipa')).vendedores;
    const form = h('form', { class: 'foco-form' },
        campo('Nome', h('input', { class: 'field-input', name: 'nome', required: true })),
        campo('Utilizador', h('input', { class: 'field-input', name: 'utilizador', required: true, autocapitalize: 'none' })),
        campo('Password (mín. 8)', h('input', { class: 'field-input', name: 'senha', type: 'text', required: true, minlength: 8 })),
        campo('Papel', h('select', { class: 'field-input', name: 'papel' }, h('option', { value: 'parceiro' }, 'Parceiro'), h('option', { value: 'admin' }, 'Administrador'))),
        h('button', { type: 'submit', class: 'btn-primary' }, 'Adicionar pessoa')
    );
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('/api/digitalizept/equipa', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
            toast('Pessoa adicionada. Envie-lhe o utilizador e a password.');
            renderEquipa();
        } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
    });
    const mudar = async (v, body, msg) => {
        try { await api(`/api/digitalizept/equipa/${v.id}`, { method: 'PATCH', body }); toast(msg); renderEquipa(); }
        catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
    };
    render(
        h('div', { class: 'foco-lista' }, state.equipa.map((v) => h('div', { class: `foco-card${v.ativo ? '' : ' foco-inativo'}` },
            h('div', { class: 'foco-card-top' },
                h('strong', {}, v.nome),
                h('span', { class: 'foco-chip' }, v.papel === 'admin' ? 'Admin' : 'Parceiro')
            ),
            h('p', { class: 'foco-meta' }, `@${v.utilizador} · código dos links: p-${v.codigo}${v.ativo ? '' : ' · desativado'}`),
            h('div', { class: 'foco-acoes' },
                h('button', { type: 'button', class: 'btn-secondary', onclick: () => {
                    const senha = window.prompt(`Nova password para ${v.nome} (mín. 8):`);
                    if (senha) mudar(v, { senha }, 'Password alterada.');
                } }, 'Nova password'),
                v.id !== state.me.id && h('button', { type: 'button', class: 'btn-secondary', onclick: () => mudar(v, { ativo: !v.ativo }, v.ativo ? 'Desativado.' : 'Reativado.') },
                    v.ativo ? 'Desativar' : 'Reativar')
            )
        ))),
        bloco('Adicionar parceiro', form)
    );
}

// ---------- boot ----------
async function arrancar() {
    try {
        const [{ vendedor }, cfg, { pessoas }] = await Promise.all([
            api('/api/digitalizept/me'), api('/api/digitalizept/foco'), api('/api/digitalizept/foco/pessoas')
        ]);
        state.me = vendedor;
        state.cfg = cfg;
        state.pessoas = pessoas;
    } catch (err) {
        if (err.message !== 'unauthorized') mostrarLogin(err.message);
        return;
    }
    $('login-overlay').classList.add('hidden');
    $('foco').classList.remove('hidden');
    $('foco-quem').textContent = `${state.me.nome} · verticais ${state.cfg.versao}`;
    const admin = state.me.papel === 'admin';
    $('foco-admin').classList.toggle('hidden', !admin);
    $('foco-tab-equipa').classList.toggle('hidden', !admin);
    irPara(state.tab);
}

if (getToken()) arrancar(); else mostrarLogin();
