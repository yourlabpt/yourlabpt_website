// Foco comercial — the YourLab sales tool for digitalizemeunegocio.pt.
// Segments and scripts come from digitalizemeunegocio's verticais.json via
// /api/digitalizept/foco; this file only shows them and records what happened.
import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { registerDigitalizeptSw } from './pwa.js';

registerDigitalizeptSw();

const PRODUTO = { website: 'Site', bot: 'Bot', redes: 'Gestor social' };
const SKU = { bot_leads: 'Bot de Atendimento (os clientes marcam)', bot_agenda: 'Agenda Virtual (o dono gere as marcações)' };
// Pain first: the app link is the answer to a pain the owner confirmed, not the opener.
const REGRA = [
    'Perceber se a dor é real — perguntar e ouvir',
    'Se é: enviar o link da app para experimentarem com o nome do negócio',
    'Ativar um produto — só depois pedir a configuração detalhada'
];
const FASE = { ataque: 'Ataque', expansao: 'Expansão', depois: 'Depois' };

const state = {
    me: null, cfg: null, tab: 'segmentos', contactos: [], todos: null, equipa: [], pessoas: [],
    mensagens: [], linha: '', sel: new Set(), filtro: { linha: 'digitu', texto: '', estado: '', segmento: '', dono: '' }
};
// Pin/chip colour per state: grey = not yet touched, warm = in progress, green = won, red = lost.
const COR = {
    por_contactar: '#8e8e93', contactado: '#e8d5b7', demo_mostrada: '#f5a623', quer_ativar: '#f97316',
    ativou: '#4ade80', voltar: '#60a5fa', sem_interesse: '#ff6b6b',
    ym_novo: '#8e8e93', ym_conversa: '#a78bfa', ym_proposta: '#f5a623', ym_negociacao: '#f97316', ym_ganho: '#4ade80', ym_perdido: '#ff6b6b'
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
        if (tab === 'mensagens') await renderMensagens();
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
    return (v && (v.tipos_nomes.find((t) => t.id === tipo) || {}).nome) || (tipo === 'generico' ? 'Sem tipo' : tipo);
};
// Every type we sell to, once each, by name — for the batch «mudar tipo» and the add sheet.
const tiposTodos = () => [...new Map(state.cfg.verticais.flatMap((v) => v.tipos_nomes).map((t) => [t.id, t])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
const entrada = (v) => (v.produtos_entrada || [v.produto_entrada]).map((p) => PRODUTO[p] || p).join(' + ');

// ---------- Segmentos ----------
function renderSegmentos() {
    const foco = state.cfg.verticais.filter((v) => v.foco);
    const depois = state.cfg.verticais.filter((v) => !v.foco);
    render(
        h('section', { class: 'foco-regra' },
            h('h2', {}, 'A regra'),
            h('ol', {}, REGRA.map((r) => h('li', {}, r))),
            h('p', {}, 'Primeiro ouvir, depois o link. Diga o resultado no idioma do negócio — nunca «tenho uma app com site, bots e gestor social». Nunca se promete resultado.')
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
        h('button', { type: 'button', class: 'btn-primary foco-cta', onclick: () => novoContacto(v) }, 'Registar contacto'),
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
        h('button', { type: 'submit', class: 'btn-primary' }, 'Guardar contacto')
    );
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            const r = await api('/api/digitalizept/foco/contactos', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
            abrirContacto(r.contacto);
        } catch (err) {
            if (err.message !== 'unauthorized') toast(err.message, true);
            btn.disabled = false;
        }
    });
    abrirSheet(h('p', { class: 'foco-meta' }, v.nome), h('h2', {}, 'Novo contacto'), form);
    form.querySelector('input').focus();
}

// ---------- mensagens (modelos com {marcadores}) ----------
function waNumero(n) {
    const d = String(n || '').replace(/\D/g, '');
    return d.length === 9 ? `351${d}` : d;
}

const minuscula = (t) => String(t || '').replace(/^./, (c) => c.toLowerCase());

const utilizadorDe = (url, dominio) => {
    const m = String(url || '').match(new RegExp(`${dominio}\\.com/(?:p/)?([^/?#]+)`, 'i'));
    return m && !/^(profile\.php|pages)$/i.test(m[1]) ? m[1] : '';
};

// Instagram and Messenger have click-to-chat links but no way to pre-fill the
// text, so the app copies the message first and the seller pastes it.
function canaisDoContacto(c) {
    const o = c.origem || {};
    const numero = waNumero(c.whatsapp || c.telefone);
    const fbId = String(o.facebook || '').match(/profile\.php\?id=(\d+)/i);
    return [
        numero && { id: 'whatsapp', nome: 'WhatsApp', prefill: true, url: (t) => `https://wa.me/${numero}?text=${encodeURIComponent(t)}` },
        numero && { id: 'whatsapp', nome: 'WhatsApp Web', web: true, prefill: true, url: (t) => `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(t)}` },
        o.instagram && { id: 'instagram', nome: 'Instagram', url: () => (utilizadorDe(o.instagram, 'instagram') ? `https://ig.me/m/${utilizadorDe(o.instagram, 'instagram')}` : o.instagram) },
        o.facebook && { id: 'facebook', nome: 'Messenger', url: () => (fbId ? `https://m.me/${fbId[1]}` : (utilizadorDe(o.facebook, 'facebook') ? `https://m.me/${utilizadorDe(o.facebook, 'facebook')}` : o.facebook)) },
        o.email && { id: 'email', nome: 'Email', prefill: true, url: (t) => `mailto:${o.email}?subject=${encodeURIComponent(`${state.cfg.marca.nome} — ${c.nome}`)}&body=${encodeURIComponent(t)}` }
    ].filter(Boolean);
}

// Cities that take an article in Portuguese: «no Porto», not «em Porto».
const COM_ARTIGO = { porto: 'no', funchal: 'no', barreiro: 'no', montijo: 'no', seixal: 'no', entroncamento: 'no', cartaxo: 'no', bombarral: 'no' };
function emCidade(cidade) {
    const nome = String(cidade || '').trim();
    if (!nome) return 'na sua zona';
    return `${COM_ARTIGO[nome.toLowerCase()] || 'em'} ${nome}`;
}

// What each {marcador} becomes for one contact — the help text in Mensagens lists the same keys.
const MARCADORES = {
    nome: ['Nome do negócio', (c) => c.nome],
    cidade: ['Cidade', (c) => c.cidade],
    em_cidade: ['«em Braga», «no Porto» (ou «na sua zona»)', (c) => emCidade(c.cidade)],
    tipo: ['Tipo de negócio', (c) => minuscula(nomeTipo(c.tipo))],
    dor: ['A dor principal do segmento', (c, v) => minuscula(v && v.dor_principal)],
    gancho: ['A pergunta-gancho do segmento', (c, v) => v && v.abordagem && v.abordagem.gancho],
    pergunta: ['A pergunta de abertura', (c, v) => v && v.abordagem && v.abordagem.pergunta_abertura],
    frase: ['O resultado, na língua do negócio', (c, v) => v && v.posicionamento],
    eu: ['O seu nome', () => state.me.nome],
    link: ['Link já com o nome do negócio', (c) => c.dmn_link],
    marca: ['Nome do produto', () => state.cfg.marca.nome],
    slogan: ['A frase do produto', () => state.cfg.marca.slogan],
    link_app: ['Link da {marca} (igual para todos)', () => state.cfg.marca.link],
    o_que_e: ['O que é, por palavras (editável em Equipa → A marca)', () => state.cfg.marca.descricao],
    linha: ['O princípio escolhido para este contacto', (c) => state.linha]
};

// `manter`: leave unknown/empty {slots} in place (call scripts show them as ‹slot›).
function preencher(modelo, c, { manter = false } = {}) {
    const v = segmentoDoTipo(c.tipo);
    return String(modelo || '').replace(/\{([a-z_]+)\}/g, (todo, k) => {
        const m = MARCADORES[k];
        const valor = m && m[1](c, v);
        return valor ? String(valor) : (manter || k === 'link' ? todo : '');
    }).replace(/ +([.,!?])/g, '$1');
}

// The three steps of the strategy: short call → link → follow-up. The team adds its own in Mensagens.
const MODELOS_BASE = [
    { id: 'base:depois', nome: '1 · Depois da chamada (o link)', texto: 'Como combinado, aqui está a {marca}: {link_app}\n\n{slogan}' },
    { id: 'base:seguimento', nome: '2 · Seguimento (uns dias depois)', texto: 'Então, ainda preso ao negócio sem tempo nem para ver isto? 😄 É mesmo para isso que a {marca} existe: para ter tempo para o negócio e ainda para as suas coisas.\n\nChegou a dar uma olhadela? O que achou?' },
    { id: 'base:frio', nome: 'Sem chamada (primeiro contacto por escrito)', texto: 'Olá, {nome}! Sou {eu}, da {marca}. Trabalhamos com negócios como o vosso {em_cidade}: a {marca} é {o_que_e}.\n\n{slogan} Deixo-lhe o link para ver com calma, sem compromisso: {link_app}' },
    { id: 'base:demo', nome: 'Já com o nome do negócio', texto: 'Olá, {nome}! Sou {eu}, da {marca}. {slogan}\n\nDeixei isto pronto já com o nome do vosso negócio — é só abrir e ver: {link}' },
    { id: 'base:ig', nome: 'Instagram — curto', canal: 'instagram', texto: 'Olá! Sou {eu}, da {marca} 👋 Seguimos o vosso trabalho {em_cidade}.\n\n{linha}\n\nA {marca} trata disso por si: {link_app}' },
    { id: 'base:ig_seguimento', nome: 'Instagram — seguimento', canal: 'instagram', texto: 'Olá de novo! Chegou a espreitar a {marca}? 😊 Se fizer sentido para {nome}, digo-lhe como começar em cinco minutos.' },
    { id: 'base:principio', nome: 'Pelo princípio escolhido', texto: 'Olá, {nome}! Sou {eu}, da {marca}.\n\n{linha}\n\nA {marca} trata disso por si. {slogan} Fica aqui para ver com calma: {link_app}' }
];

function principioSugerido(c) {
    const o = c.origem || {};
    if (!o.website) return 0;          // que o conheçam
    if (!o.rating) return 1;           // que confiem em si
    return 2;                          // que ninguém fique sem resposta
}

function modelosPara(c, canal) {
    const v = segmentoDoTipo(c.tipo);
    const serve = (m) => (!m.segmento_id || (v && m.segmento_id === v.id)) && (!m.canal || m.canal === canal);
    return [...MODELOS_BASE, ...(state.mensagens || [])].filter(serve);
}

// `modeloInicial` only comes from the call guide; otherwise the channel decides.
function configuradorMensagem(c, modeloInicial = '') {
    const canais = canaisDoContacto(c);
    const ids = [...new Set(canais.map((x) => x.id))];
    let canal = ids[0] || 'whatsapp';
    state.linha = state.cfg.marca.linhas[principioSugerido(c)] || '';

    const escolha = h('select', { class: 'field-input' });
    const principio = h('select', { class: 'field-input' },
        state.cfg.marca.linhas.map((t, i) => h('option', { value: i, selected: i === principioSugerido(c) }, t.split('—')[0].trim())));
    const caixa = h('textarea', { class: 'field-input foco-mensagem', rows: 7 });
    const aviso = h('p', { class: 'foco-meta' });
    const acoes = h('div', { class: 'foco-acoes' });
    const modelo = () => modelosPara(c, canal).find((m) => m.id === escolha.value) || modelosPara(c, canal)[0];

    const registar = () => api(`/api/digitalizept/foco/contactos/${c.id}/mensagem`, {
        method: 'POST',
        body: { modelo: modelo().nome, texto: caixa.value, canal, principio: state.cfg.marca.linhas[principio.value] || '' }
    }).then(({ contacto }) => Object.assign(c, contacto)).catch(() => {});

    function pintarAcoes() {
        const m = state.cfg.marca;
        acoes.replaceChildren(...nos([
            canais.filter((x) => x.id === canal).map((x) => (x.prefill
                ? h('a', { class: x.web ? 'btn-secondary' : 'btn-primary', target: '_blank', rel: 'noopener', href: x.url(caixa.value), onclick: registar }, x.nome)
                // No pre-filled text on Instagram/Messenger: copy, then open the chat.
                : h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
                    await navigator.clipboard.writeText(caixa.value).catch(() => {});
                    registar();
                    toast('Mensagem copiada — cole na conversa.');
                    window.open(x.url(caixa.value), '_blank', 'noopener');
                } }, `${x.nome} (copia e abre)`))),
            h('button', { type: 'button', class: 'btn-secondary', onclick: () => navigator.clipboard.writeText(caixa.value).then(() => { registar(); toast('Mensagem copiada.'); }) }, 'Copiar')
        ]));
        aviso.textContent = canal === 'whatsapp'
            ? (m.numero ? `Sai do número ligado: no telemóvel é o seu; no WhatsApp Web use a sessão da ${m.nome} (${m.numero}).`
                : `Sai do número ligado neste aparelho. Defina o número da ${m.nome} em Equipa → A marca.`)
            : canal === 'instagram' || canal === 'facebook'
                ? `Abre a conversa na conta que tiver ligada — use a da ${m.nome}. O texto vai copiado, é só colar.`
                : '';
    }

    function pintarModelos() {
        const lista = modelosPara(c, canal);
        escolha.replaceChildren(...lista.map((m) => h('option', { value: m.id }, m.nome)));
        // The model asked for wins; otherwise one written for this channel; otherwise the first.
        const preferido = lista.find((m) => m.id === modeloInicial) || lista.find((m) => m.canal === canal) || lista[0];
        escolha.value = (preferido || {}).id || '';
    }

    const preencherCaixa = async () => {
        state.linha = state.cfg.marca.linhas[principio.value] || '';
        if (modelo() && modelo().texto.includes('{link}') && !c.dmn_link) {
            caixa.value = 'A preparar o link da app com o nome do negócio…';
            try {
                Object.assign(c, (await api(`/api/digitalizept/foco/contactos/${c.id}/demo`, { method: 'POST' })).contacto);
            } catch (err) {
                if (err.message !== 'unauthorized') toast(err.message, true);
            }
        }
        caixa.value = preencher((modelo() || {}).texto || '', c);
        pintarAcoes();
    };

    const canalChips = escolhaChips(
        Object.fromEntries(ids.map((id) => [id, (canais.find((x) => x.id === id) || {}).nome])), canal,
        (id) => { canal = id; pintarModelos(); preencherCaixa(); }
    );
    escolha.addEventListener('change', preencherCaixa);
    principio.addEventListener('change', preencherCaixa);
    caixa.addEventListener('input', pintarAcoes);
    pintarModelos();
    preencherCaixa();

    return [
        ids.length ? campo('Por onde', canalChips.el) : h('p', { class: 'foco-meta' }, 'Sem WhatsApp, Instagram, Facebook nem email guardados neste contacto.'),
        campo('Princípio (o que lhe falta mais)', principio),
        campo('Modelo', escolha), caixa, aviso, acoes,
        h('button', { type: 'button', class: 'foco-link', onclick: () => { fecharSheet(); irPara('mensagens'); } }, 'Criar ou editar modelos')
    ];
}

// ---------- WhatsApp em lote ----------
// Browsers block opening many chats at once and WhatsApp has no free bulk API, so it is a queue:
// one tap per contact opens WhatsApp with the message already written; the send is logged,
// the status moves on (contactado / link enviado) and the follow-up date is set.
const temWhatsApp = (c) => {
    const d = waNumero(c.whatsapp || c.telefone);
    return c.whatsapp ? d.length >= 9 : /^3519\d{8}$/.test(d);
};

function abrirEnvioLote(contactos) {
    const comNumero = contactos.filter(temWhatsApp);
    const semNumero = contactos.filter((c) => !temWhatsApp(c));
    const modelos = [...MODELOS_BASE, ...(state.mensagens || [])].filter((m) => !m.canal || m.canal === 'whatsapp');
    const escolha = h('select', { class: 'field-input' }, modelos.map((m) => h('option', { value: m.id }, m.nome)));
    const depois = h('select', { class: 'field-input' },
        [['2', 'Daqui a 2 dias'], ['3', 'Daqui a 3 dias'], ['7', 'Daqui a 1 semana'], ['', 'Não marcar']]
            .map(([v, t]) => h('option', { value: v, selected: v === '3' }, t)));
    const web = h('input', { type: 'checkbox' });
    const progresso = h('p', { class: 'foco-fila' });
    const listaEl = h('div', { class: 'foco-lote' });
    const enviados = [];
    const modelo = () => modelos.find((m) => m.id === escolha.value) || modelos[0];
    const link = (c, texto) => (web.checked
        ? `https://web.whatsapp.com/send?phone=${waNumero(c.whatsapp || c.telefone)}&text=${encodeURIComponent(texto)}`
        : `https://wa.me/${waNumero(c.whatsapp || c.telefone)}?text=${encodeURIComponent(texto)}`);
    const pintarProgresso = () => { progresso.textContent = `Enviados ${enviados.length} de ${comNumero.length}`; };

    function linha(c) {
        state.linha = state.cfg.marca.linhas[principioSugerido(c)] || '';
        const caixa = h('textarea', { class: 'field-input foco-mensagem', rows: 5 }, preencher(modelo().texto, c));
        const abrir = h('a', { class: 'btn-primary', target: '_blank', rel: 'noopener', href: link(c, caixa.value) }, 'Abrir WhatsApp');
        const row = h('div', { class: 'foco-lote-item' },
            h('div', { class: 'foco-card-top' }, h('strong', {}, c.nome), h('span', { class: 'foco-meta' }, c.whatsapp || c.telefone)),
            h('details', {}, h('summary', { class: 'foco-meta' }, 'Ver / ajustar mensagem'), caixa),
            abrir);
        caixa.addEventListener('input', () => { abrir.href = link(c, caixa.value); });
        web.addEventListener('change', () => { abrir.href = link(c, caixa.value); });
        abrir.addEventListener('click', () => {
            api(`/api/digitalizept/foco/contactos/${c.id}/mensagem`, { method: 'POST', body: {
                modelo: modelo().nome, texto: caixa.value, canal: 'whatsapp', principio: state.linha, lote: true,
                voltar_em: depois.value ? somarDias(Number(depois.value)) : ''
            } }).then(({ contacto }) => Object.assign(c, contacto)).catch((err) => { if (err.message !== 'unauthorized') toast(`${c.nome}: ${err.message}`, true); });
            if (!enviados.includes(c)) enviados.push(c);
            row.classList.add('enviado');
            abrir.textContent = 'Enviado ✓ — abrir de novo';
            abrir.className = 'btn-secondary';
            pintarProgresso();
            const seguinte = row.nextElementSibling && row.nextElementSibling.querySelector('a.btn-primary');
            if (seguinte) setTimeout(() => seguinte.scrollIntoView({ block: 'center' }), 300);
        });
        return row;
    }

    // Templates with {link} need each business's own app link first (created up front: a WhatsApp
    // window opened after waiting on the network would be blocked as a pop-up).
    async function pintar() {
        if (modelo().texto.includes('{link}')) {
            const falta = comNumero.filter((c) => !c.dmn_link);
            for (let i = 0; i < falta.length; i += 1) {
                listaEl.replaceChildren(h('p', { class: 'foco-meta' }, `A criar os links da app… ${i + 1} de ${falta.length}`));
                try { Object.assign(falta[i], (await api(`/api/digitalizept/foco/contactos/${falta[i].id}/demo`, { method: 'POST' })).contacto); }
                catch (err) { if (err.message !== 'unauthorized') toast(`${falta[i].nome}: ${err.message}`, true); }
            }
        }
        listaEl.replaceChildren(...comNumero.map(linha));
        pintarProgresso();
    }

    function concluir() {
        if (!enviados.length) { fecharSheet(); irPara('contactos'); return; }
        // Pending notes: a line on what came back, or ignore.
        const itens = enviados.map((c) => {
            const nota = h('textarea', { class: 'field-input', rows: 2, placeholder: 'Respondeu? O que disse? (opcional)' });
            const row = h('div', { class: 'foco-lote-item' }, h('strong', {}, c.nome), nota,
                h('button', { type: 'button', class: 'foco-link', onclick: () => row.remove() }, 'Ignorar'));
            return { c, nota, row };
        });
        abrirSheet(h('h2', {}, 'Notas do envio'),
            h('p', { class: 'foco-meta' }, `${enviados.length} enviados. Estado atualizado${depois.value ? ' e próximo contacto marcado' : ''}. Escreva só o que valer a pena — o resto ignore.`),
            itens.map((x) => x.row),
            h('button', { type: 'button', class: 'btn-primary', onclick: async (e) => {
                e.target.disabled = true;
                const comNota = itens.filter((x) => x.row.isConnected && x.nota.value.trim());
                await Promise.all(comNota.map((x) => api(`/api/digitalizept/leads/${x.c.id}/notes`, { method: 'POST', body: { texto: x.nota.value } })
                    .catch((err) => { if (err.message !== 'unauthorized') toast(`${x.c.nome}: ${err.message}`, true); })));
                const n = comNota.length;
                toast(n ? `${n} nota${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'}.` : 'Feito.');
                fecharSheet();
                irPara('contactos');
            } }, 'Guardar e terminar'));
    }

    escolha.addEventListener('change', pintar);
    abrirSheet(
        h('h2', {}, `WhatsApp para ${comNumero.length} contacto${comNumero.length === 1 ? '' : 's'}`),
        h('p', { class: 'foco-meta' }, 'Um toque por contacto abre o WhatsApp com a mensagem pronta — só carregar em enviar. A formatação (linhas, espaços) vai tal como está no modelo.'),
        campo('Modelo', escolha),
        campo('Depois de enviar, próximo contacto', depois),
        h('label', { class: 'foco-toggle' }, web, ' Abrir no WhatsApp Web (computador)'),
        progresso, listaEl,
        semNumero.length > 0 && bloco(`Sem WhatsApp (${semNumero.length}) — ligar em vez de escrever`,
            h('p', { class: 'foco-meta' }, semNumero.map((c) => c.nome).join(' · ')),
            h('button', { type: 'button', class: 'btn-secondary', onclick: () => {
                definirFila({ ids: semNumero.map((c) => c.id), feitos: [] });
                abrirContacto(semNumero[0]);
            } }, `Ligar a estes (${semNumero.length})`)),
        h('button', { type: 'button', class: 'btn-primary', onclick: concluir }, 'Concluir envio'));
    pintar();
}

// ---------- guião de chamada ----------
function escolhaChips(opcoes, atual, aoEscolher) {
    let valor = atual;
    const box = h('div', { class: 'foco-estados' });
    Object.entries(opcoes).forEach(([id, nome]) => box.append(h('button', {
        type: 'button', class: `foco-estado${id === valor ? ' active' : ''}`, 'data-v': id,
        onclick: () => {
            valor = id;
            box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === id));
            if (aoEscolher) aoEscolher(id);
        }
    }, nome)));
    return { el: box, valor: () => valor };
}

// Local calendar date — toISOString() is UTC and gives the wrong day around midnight.
function somarDias(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const amanha = () => somarDias(1);

// ---------- seguimento: every open lead has a next step with a date ----------
// Each line has its own pipeline: what counts as closed (won/lost) and where it starts depend on it.
const linhaDo = (c) => state.cfg.linhas[c.linha] || state.cfg.linhas.digitu;
const fechado = (c, estado = c.estado) => linhaDo(c).fechados.includes(estado);
const noInicio = (c, estado = c.estado) => estado === linhaDo(c).inicial;
const daLinha = (c, linha) => (c.linha || 'digitu') === linha;
const euros = (cent) => (Number(cent || 0) / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const ultimoUso = (c) => (c.uso && c.uso.ultimaAtividade) || '';
const VISTAS = {
    hoje: { nome: 'Para hoje', ok: (c, hoje) => !fechado(c) && Boolean(c.voltar_em) && c.voltar_em <= hoje },
    semana: { nome: 'Próximos 7 dias', ok: (c, hoje) => !fechado(c) && c.voltar_em > hoje && c.voltar_em <= somarDias(7) },
    sem: { nome: 'Sem próximo passo', ok: (c) => !fechado(c) && !noInicio(c) && !c.voltar_em },
    // Beta users, the least active first: they are the ones to call.
    beta: { nome: 'Beta users', so: 'digitu', ok: (c) => c.estado === 'quer_ativar' },
    todos: { nome: 'Todos', ok: () => true }
};
function proximoPasso(c, hoje) {
    if (fechado(c)) return null;
    if (!c.voltar_em) return noInicio(c) ? null : { txt: 'Sem próximo passo', cls: 'foco-pp-falta' };
    const dias = Math.round((new Date(c.voltar_em) - new Date(hoje)) / 86400000);
    if (dias < 0) return { txt: `Atrasado ${-dias} dia${dias === -1 ? '' : 's'}`, cls: 'foco-pp-atrasado' };
    if (dias === 0) return { txt: 'Hoje', cls: 'foco-pp-hoje' };
    if (dias === 1) return { txt: 'Amanhã', cls: '' };
    return { txt: `Em ${dias} dias (${c.voltar_em.slice(8, 10)}/${c.voltar_em.slice(5, 7)})`, cls: '' };
}
// What a beta user actually did in the app, in one line.
function usoResumo(c) {
    const u = c.uso;
    if (!u || !['demo_mostrada', 'quer_ativar', 'ativou'].includes(c.estado)) return null;
    if (!u.pontos) return h('p', { class: 'foco-meta foco-pp-falta' }, 'Ainda não usou a app');
    const ult = u.ultimaAtividade;
    const parado = ult && Date.now() - new Date(ult) > 7 * 86400000;
    return h('p', { class: `foco-meta${parado ? ' foco-pp-atrasado' : ''}` },
        [`Nível ${u.nivelNome || u.nivel}`, `${u.pontos} pts`, `${(u.acoes || []).length} passos`, ult && `ativo ${haQuanto(ult)}`, u.pago && 'pago']
            .filter(Boolean).join(' · '));
}

// Pull beta usage from the Digitu app (it also moves link-sent → Beta user, paid → Ativou).
async function sincronizarUso(aoMudar, avisar = false) {
    try {
        const r = await api('/api/digitalizept/foco/uso/sincronizar', { method: 'POST' });
        if (avisar) toast(`Uso atualizado: ${r.n} contactos${r.mudaram ? `, ${r.mudaram} mudaram de estado` : ''}${r.falhas ? `, ${r.falhas} sem resposta` : ''}.`);
        if (r.n) { await carregarContactos(); aoMudar(); }
    } catch (err) { if (avisar && err.message !== 'unauthorized') toast(err.message, true); }
}

function haQuanto(iso) {
    const dias = Math.floor((Date.now() - new Date(iso)) / 86400000);
    return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
}

// ---------- fila de hoje: tick N contacts, work them one after another ----------
// Lives on this phone only: it is today's to-do list, not shared state.
const FILA_KEY = 'foco_fila_hoje';
let filaAtual = (() => { try { return JSON.parse(localStorage.getItem(FILA_KEY)) || null; } catch (_) { return null; } })();
function definirFila(f) {
    filaAtual = f && f.ids.length ? f : null;
    try { if (filaAtual) localStorage.setItem(FILA_KEY, JSON.stringify(filaAtual)); else localStorage.removeItem(FILA_KEY); } catch (_) { /* só nesta sessão */ }
}
const naFila = (id) => Boolean(filaAtual && filaAtual.ids.includes(id));
function marcarFeito(id) {
    if (naFila(id) && !filaAtual.feitos.includes(id)) definirFila({ ...filaAtual, feitos: [...filaAtual.feitos, id] });
}
// Next contact not done yet after `atual`, wrapping round; null = start from the top.
function proximoDaFila(atual) {
    if (!filaAtual) return null;
    const { ids, feitos } = filaAtual;
    const i = ids.indexOf(atual);
    const ordem = i < 0 ? ids : [...ids.slice(i + 1), ...ids.slice(0, i)];
    for (const id of ordem) {
        const c = !feitos.includes(id) && state.contactos.find((x) => x.id === id);
        if (c) return c;
    }
    return null;
}
function avancarFila(atual) {
    const prox = proximoDaFila(atual);
    if (prox) return abrirContacto(prox);
    fecharSheet();
    toast(`Fila feita: ${filaAtual.feitos.length} de ${filaAtual.ids.length}.`);
    return irPara('contactos');
}
function filaCabecalho(c) {
    if (!naFila(c.id)) return null;
    const { ids, feitos } = filaAtual;
    return h('div', { class: 'foco-fila' },
        h('span', {}, `Hoje · ${ids.indexOf(c.id) + 1} de ${ids.length} · ${feitos.length} feitos`),
        h('button', { type: 'button', class: 'foco-link', onclick: () => avancarFila(c.id) }, 'Seguinte →'));
}
function bannerFila() {
    if (!filaAtual) return null;
    const { ids, feitos } = filaAtual;
    const falta = ids.length - feitos.length;
    return h('div', { class: 'foco-fila foco-fila-banner' },
        h('strong', {}, falta ? `Hoje: ${feitos.length} de ${ids.length} feitos` : `Hoje: os ${ids.length} feitos ✓`),
        falta > 0 && h('button', { type: 'button', class: 'btn-primary', onclick: () => { const c = proximoDaFila(null); if (c) abrirContacto(c); } }, 'Continuar'),
        h('button', { type: 'button', class: 'btn-secondary', onclick: () => { definirFila(null); irPara('contactos'); } }, 'Terminar fila'));
}

async function guardarEstado(c, body, depois) {
    try {
        const r = await api(`/api/digitalizept/foco/contactos/${c.id}/estado`, { method: 'POST', body });
        toast('Guardado.');
        marcarFeito(c.id);
        if (depois) return depois(r.contacto);
        fecharSheet();
        await irPara(state.tab === 'mapa' ? 'mapa' : 'contactos');
        if (naFila(c.id)) avancarFila(c.id);
    } catch (err) {
        if (err.message !== 'unauthorized') toast(err.message, true);
    }
    return null;
}

function saudacao() {
    const hora = new Date().getHours();
    return hora < 13 ? 'Bom dia' : hora < 20 ? 'Boa tarde' : 'Boa noite';
}

// What each product is, said the way an owner would say it — never «bot», «plataforma», «SaaS».
const EM_PALAVRAS = {
    bot: () => 'um assistente no WhatsApp que responde e marca os clientes sozinho',
    website: (c) => `um site simples, onde quem procura ${minuscula(nomeTipo(c.tipo))} ${emCidade(c.cidade)} o encontra e marca`,
    redes: () => 'alguém que lhe prepara as publicações das redes todas as semanas'
};

// A genuine compliment from what the crawler actually saw — it shows we looked before calling.
function observacao(c) {
    const o = c.origem || {};
    const redes = [o.instagram && 'o Instagram', o.facebook && 'o Facebook'].filter(Boolean);
    if (redes.length && !o.website) return `Estive a ver ${redes.join(' e ')} da ${c.nome} — nota-se o cuidado que tem com o negócio.`;
    if (o.website) return `Estive a ver o site da ${c.nome} e fiquei com uma boa ideia do que fazem.`;
    if (o.maps) return `Encontrei a ${c.nome} no Google Maps${o.rating ? `, com boa avaliação` : ''}.`;
    return `Encontrei o vosso contacto quando procurava ${minuscula(nomeTipo(c.tipo))} ${emCidade(c.cidade)}.`;
}

function ponte(c, v) {
    const produtos = ((v && v.produtos_entrada) || ['website', 'bot', 'redes']).concat(['website', 'bot', 'redes'])
        .filter((p, i, todos) => todos.indexOf(p) === i).map((p) => EM_PALAVRAS[p](c));
    return `Já pensou em ter ajuda com a parte digital? Por exemplo: ${produtos[0]}; ${produtos[1]}; ou ${produtos[2]}. A ideia é tirar-lhe trabalho do dia a dia e dar-lhe mais tempo para pensar no negócio.`;
}

function abrirGuiao(c) {
    const v = segmentoDoTipo(c.tipo) || { abordagem: {}, urgencia: [] };
    const a = v.abordagem || {};
    const sinais = [v.dor_principal, ...(v.urgencia || [])].filter(Boolean);
    const marcados = sinais.map((t) => h('input', { type: 'checkbox', value: t }));
    const palavras = h('textarea', { class: 'field-input', rows: 3, placeholder: 'O que disse, nas palavras dele(a)' });
    const licaoGuiao = h('textarea', { class: 'field-input', rows: 2, placeholder: 'O que funcionou, o que travou, o que mudar' });
    const igGuiao = h('input', { type: 'checkbox', checked: c.instagram });
    const pessoa = h('input', { class: 'field-input', placeholder: 'Nome de quem atendeu (ex.: D. Maria)' });
    const pessoaNao = h('input', { class: 'field-input', placeholder: 'Nome de quem atendeu' });
    const numero = h('input', { class: 'field-input', type: 'tel', inputmode: 'tel', value: c.whatsapp || c.telefone || '' });
    const dor = escolhaChips(state.cfg.dores, c.dor || '');
    const voltar = h('input', { class: 'field-input', type: 'date', value: amanha() });
    const voltarCampo = campo('Voltar a falar em', voltar);
    voltarCampo.hidden = true;
    const proximo = escolhaChips({ link: 'Aceitou o link', voltar: 'Prefere que ligue depois', sem_interesse: 'Não tem interesse' }, '', (id) => {
        voltarCampo.hidden = id !== 'voltar';
        numeroCampo.hidden = id !== 'link';
    });
    const numeroCampo = campo('Melhor número de WhatsApp', numero);
    numeroCampo.hidden = true;
    const dizer = (t) => h('p', { class: 'foco-dizer' }, texto(preencher(t, c, { manter: true })));
    const se = (quando, ...conteudo) => h('div', { class: 'foco-se' }, h('p', { class: 'foco-meta' }, `Se ${quando}:`), ...conteudo);
    const quem = () => pessoa.value.trim();
    const despedida = h('p', { class: 'foco-dizer' });
    const pintarDespedida = () => { despedida.textContent = `Muito obrigado pelo seu tempo${quem() ? `, ${quem()}` : ''}. Bom trabalho e até breve!`; };
    pessoa.addEventListener('input', pintarDespedida);
    pintarDespedida();

    // Not the owner on the line: find out who and when, save, done.
    const naoEsta = h('div', { class: 'foco-se', hidden: true },
        dizer('Sem problema! Com quem estou a falar? E qual é a melhor hora para apanhar o responsável?'),
        pessoaNao, campo('Ligar de novo em', h('input', { class: 'field-input', type: 'date', value: amanha(), id: 'foco-voltar-resp' })),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => guardarEstado(c, {
            estado: 'voltar', canal: 'telefone', guiao: true,
            voltar_em: document.getElementById('foco-voltar-resp').value,
            nota: `Responsável não estava.${pessoaNao.value.trim() ? ` Atendeu: ${pessoaNao.value.trim()}.` : ''}`
        }) }, 'Guardar e ligar depois'));
    const conversa = h('div', { class: 'foco-conversa', hidden: true });

    const m = () => state.cfg.marca;
    conversa.append(...nos([
        bloco('2 · Dizer ao que vem — curto',
            dizer(`Muito prazer! Chamo-me ${state.me.nome}, da ${m().nome}.`),
            dizer('Com quem tenho o gosto de falar?'), pessoa,
            dizer(`Ajudamos negócios como o seu ${emCidade(c.cidade)} a ganhar tempo no dia a dia: ${minuscula(m().slogan)}`),
            h('details', { class: 'foco-se' }, h('summary', { class: 'foco-meta' }, 'Se perguntar «o que é isso?»'),
                dizer(`A ${m().nome} é ${m().descricao}.`)),
            h('details', { class: 'foco-se' }, h('summary', { class: 'foco-meta' }, 'Se perguntar «como assim?»'),
                lista(m().linhas))),
        bloco('3 · Pedir para enviar o link',
            dizer(`Posso enviar-lhe o link por WhatsApp, para ver com calma quando puder?`),
            proximo.el, numeroCampo, voltarCampo,
            h('p', { class: 'foco-meta' }, 'Sem entrevista. O que interessa saber é se aceitou o link — o resto vê-se no seguimento.')),
        h('details', { class: 'foco-opcional' },
            h('summary', {}, 'Se houver abertura — perceber a dor'),
            h('p', { class: 'foco-meta' }, observacao(c)),
            a.gancho && dizer(a.gancho),
            dizer('E como é que fazem hoje?'),
            h('p', { class: 'foco-meta' }, 'Marque o que a pessoa confirmou:'),
            h('div', { class: 'foco-checks' }, sinais.map((t, i) => h('label', {}, marcados[i], ` ${t}`))),
            palavras,
            h('p', { class: 'foco-meta' }, 'É uma dor real?'), dor.el,
            v.posicionamento && dizer(`É exatamente para isso que existimos: ${minuscula(v.posicionamento)}`),
            a.objecao && [h('p', { class: 'foco-meta' }, `Se disser «${a.objecao.texto}»:`), dizer(a.objecao.resposta)]),
        bloco('4 · Despedir-se',
            dizer(`Antes de desligar: pode seguir a ${state.cfg.marca.nome} no Instagram${state.cfg.marca.instagram ? `, ${state.cfg.marca.instagram}` : ''}? Vamos lá pondo dicas para negócios como o seu.`),
            h('label', { class: 'foco-toggle' }, igGuiao, ' Vai seguir / já segue'),
            despedida),
        campo('Lição aprendida (opcional)', licaoGuiao),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => {
            if (!proximo.valor()) return toast('Falta o próximo passo.', true);
            const estados = { link: 'contactado', voltar: 'voltar', sem_interesse: 'sem_interesse' };
            const itens = marcados.filter((x) => x.checked).map((x) => x.value);
            const nota = [
                quem() && `Falou com: ${quem()}`, palavras.value.trim(), itens.length && `Confirmou: ${itens.join('; ')}`
            ].filter(Boolean).join('\n');
            return guardarEstado(c, {
                estado: estados[proximo.valor()], canal: 'telefone', dor: dor.valor(), dor_itens: itens, nota, guiao: true, licao: licaoGuiao.value, instagram: igGuiao.checked || undefined,
                voltar_em: proximo.valor() === 'voltar' ? voltar.value : '',
                whatsapp: proximo.valor() === 'link' ? numero.value : ''
            }, proximo.valor() === 'link'
                ? (atual) => abrirContacto({ ...atual, whatsapp: numero.value || atual.whatsapp }, { modelo: 'base:depois' })
                : null);
        } }, 'Guardar chamada')
    ]));

    const passo1 = escolhaChips({ sim: 'Sim, é o/a responsável', nao: 'Não está / não é' }, '', (id) => {
        conversa.hidden = id !== 'sim';
        naoEsta.hidden = id !== 'nao';
    });
    abrirSheet(
        h('p', { class: 'foco-meta' }, `Guião de chamada · ${v.nome || nomeTipo(c.tipo)}`),
        h('h2', {}, c.nome),
        contactarBotoes(c),
        h('button', { type: 'button', class: 'btn-secondary', onclick: () => guardarEstado(c, {
            estado: 'voltar', canal: 'telefone', voltar_em: amanha(), nota: 'Não atendeu.', guiao: true
        }) }, 'Não atendeu — tentar amanhã'),
        h('p', { class: 'foco-meta' }, 'Fale com calma e sorria — ouve-se ao telefone. Ninguém gosta de sentir que lhe estão a vender: está a perguntar, não a convencer.'),
        bloco('1 · Cumprimentar e pedir o responsável',
            dizer(`${saudacao()}! Falo com o responsável da ${c.nome}?`),
            passo1.el),
        naoEsta,
        conversa
    );
}

// ---------- contacto ----------
function abrirContacto(c, { modelo } = {}) {
    const v = segmentoDoTipo(c.tipo);
    const meu = c.vendedor_id === state.me.id || state.me.papel === 'admin';
    const historico = h('div', { class: 'foco-historico' }, h('p', { class: 'foco-meta' }, 'A carregar…'));
    carregarHistorico(c.id, historico);
    const cabecalho = [
        filaCabecalho(c),
        h('p', { class: 'foco-meta' }, [nomeTipo(c.tipo), c.cidade, c.vendedor_id ? `com ${c.vendedor}` : 'Lista comum'].filter(Boolean).join(' · ')),
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
        } }, 'Pôr no mapa pela morada')
    ];

    if (!c.vendedor_id && state.me.papel !== 'admin') {
        return abrirSheet(...cabecalho,
            h('p', {}, 'Está na lista comum. Fique com ele para ligar ou enviar mensagem — a partir daí só você o vê.'),
            h('button', { type: 'button', class: 'btn-primary', onclick: () => assumir(c) }, 'Ficar com este contacto'),
            bloco('Histórico', historico));
    }

    const yl = c.linha === 'yourlab';
    let estado = c.estado;
    const botoes = escolhaChips(linhaDo(c).estados, estado, (id) => {
        estado = id;
        nota.placeholder = ['sem_interesse', 'ym_perdido'].includes(id) ? 'Porquê? (é isto que nos ensina)' : 'Nota';
        if (fechado(c, id)) voltar.value = '';
    });
    // Digitu: the minimum win is a follow on Instagram. YourLab: project type and estimated value.
    let instagram = c.instagram;
    const ig = h('label', { class: 'foco-toggle' }, h('input', { type: 'checkbox', checked: c.instagram, onchange: (e) => { instagram = e.target.checked; } }),
        ` Segue a ${state.cfg.marca.nome} no Instagram${state.cfg.marca.instagram ? ` (${state.cfg.marca.instagram})` : ''}`);
    const projeto = escolhaChips(state.cfg.projetos, c.projeto || '');
    const valor = h('input', { class: 'field-input', type: 'number', min: 0, step: 100, inputmode: 'numeric', placeholder: 'Valor estimado (€)',
        value: c.valor_centimos ? c.valor_centimos / 100 : '' });
    const u = c.uso;
    const uso = !yl && u && bloco('Uso da app',
        usoResumo(c),
        (u.acoes || []).length > 0 && h('ul', {}, u.acoes.map((a) => h('li', {},
            `${a.chave.replace(/_/g, ' ')} · +${a.pontos} · ${new Date(a.criado_em).toLocaleDateString('pt-PT')}`))),
        u.sincronizado_em && h('p', { class: 'foco-meta' }, `Lido da app ${haQuanto(u.sincronizado_em)}.`));
    const dor = escolhaChips(state.cfg.dores, c.dor || '');
    const voltar = h('input', { class: 'field-input', type: 'date', value: c.voltar_em || '' });
    const atalhos = h('div', { class: 'foco-estados' }, [['Amanhã', 1], ['3 dias', 3], ['1 semana', 7], ['2 semanas', 14]]
        .map(([t, d]) => h('button', { type: 'button', class: 'foco-estado', onclick: () => { voltar.value = somarDias(d); } }, t)));
    const nota = h('textarea', { class: 'field-input', rows: 3, placeholder: 'Nota' });
    const licao = h('textarea', { class: 'field-input', rows: 2, placeholder: 'Lição aprendida — o que funcionou, o que travou, o que mudar (opcional)' });
    const canal = h('select', { class: 'field-input' }, h('option', { value: '' }, '—'),
        Object.entries(state.cfg.canais).map(([id, nome]) => h('option', { value: id }, nome)));
    const mensagem = !yl && bloco('2 · Mensagem', ...configuradorMensagem(c, modelo));
    abrirSheet(
        ...cabecalho,
        contactarBotoes(c),
        !c.vendedor_id && h('button', { type: 'button', class: 'btn-secondary', onclick: () => assumir(c) }, 'Ficar com este contacto'),
        !yl && bloco('1 · Perceber a dor',
            h('button', { type: 'button', class: 'btn-primary', onclick: () => abrirGuiao(c) }, 'Ligar com o guião'),
            c.dor && h('p', { class: 'foco-meta' }, `Última resposta: ${state.cfg.dores[c.dor]}`)),
        uso,
        mensagem,
        bloco(yl ? 'Estado e próximo passo' : '3 · O que aconteceu', botoes.el,
            yl ? [h('p', { class: 'foco-meta' }, 'Tipo de projeto'), projeto.el, valor]
                : [h('p', { class: 'foco-meta' }, 'É uma dor real?'), dor.el, ig],
            campo('Como falou', canal), campo('Próximo contacto', voltar), atalhos, nota, licao,
            h('button', { type: 'button', class: 'btn-primary', onclick: () => !fechado(c, estado) && !noInicio(c, estado) && !voltar.value
                && !window.confirm('Sem próximo contacto marcado — este contacto pode ficar esquecido. Guardar assim?') ? null : guardarEstado(c, {
                estado, voltar_em: voltar.value, nota: nota.value, licao: licao.value, canal: canal.value,
                ...(yl ? { projeto: projeto.valor(), valor: valor.value === '' ? undefined : Number(valor.value) } : { dor: dor.valor(), instagram })
            }) }, 'Guardar')
        ),
        bloco('Histórico', historico),
        meu && h('button', { type: 'button', class: 'foco-link', onclick: () => moverLinha(c) },
            yl ? `Passar para ${state.cfg.linhas.digitu.nome}` : `Passar para ${state.cfg.linhas.yourlab.nome}`),
        state.me.papel === 'admin' && bloco('Quem trata', atribuir(c)),
        meu && c.vendedor_id && c.estado === 'por_contactar' && h('button', { type: 'button', class: 'foco-link', onclick: () => largar(c) }, 'Devolver à lista comum'),
        v && h('button', { type: 'button', class: 'foco-link', onclick: () => abrirSegmento(v) }, `Ver segmento · ${v.nome}`)
    );
    if (modelo && mensagem) mensagem.scrollIntoView({ block: 'start' });
    return null;
}

async function moverLinha(c) {
    const para = c.linha === 'yourlab' ? 'digitu' : 'yourlab';
    const nome = state.cfg.linhas[para].nome;
    if (!window.confirm(`Passar «${c.nome}» para ${nome}? Começa essa pipeline do início.`)) return;
    try {
        await api('/api/digitalizept/foco/contactos/lote', { method: 'POST', body: { ids: [c.id], acao: 'linha', linha: para } });
        toast(`Agora em ${nome}.`);
        state.filtro.linha = para;
        fecharSheet();
        irPara('contactos');
    } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
}

async function assumir(c) {
    try {
        const { contacto } = await api(`/api/digitalizept/foco/contactos/${c.id}/assumir`, { method: 'POST' });
        toast('É seu. Mais ninguém o vê.');
        abrirContacto(contacto);
    } catch (err) {
        if (err.message !== 'unauthorized') toast(err.message, true);
        if (state.tab === 'contactos' || state.tab === 'mapa') irPara(state.tab);
    }
}

async function largar(c) {
    try {
        await api(`/api/digitalizept/foco/contactos/${c.id}/largar`, { method: 'POST' });
        toast('Voltou à lista comum.');
        fecharSheet();
        irPara(state.tab === 'mapa' ? 'mapa' : 'contactos');
    } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
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
    foco_estado: (e) => [
        state.cfg.estados[e.estado] || e.estado,
        e.canal && (state.cfg.canais[e.canal] || e.canal),
        e.dor && (state.cfg.dores[e.dor] || e.dor),
        e.guiao && 'com guião',
        e.lote && 'em lote',
        e.auto && 'pela app',
        e.instagram === true && 'segue no Instagram'
    ].filter(Boolean).join(' · '),
    foco_linha: (e) => `${e.de} → ${e.para}`,
    foco_voltar: (e) => (e.voltar_em ? `Próximo contacto: ${e.voltar_em}` : 'Data de próximo contacto removida'),
    foco_mensagem: (e) => `${state.cfg.canais[e.canal] || 'WhatsApp'} · ${e.modelo}${e.com_link ? ' · com link' : ''}${e.lote ? ' · em lote' : ''}`,
    foco_demo: () => 'Link da app criado',
    foco_atribuido: (e) => `${e.de ? `${e.de} → ` : ''}${e.para}`,
    nota: () => 'Nota'
};

async function carregarHistorico(id, alvo) {
    try {
        const { historico } = await api(`/api/digitalizept/foco/contactos/${id}/historico`);
        alvo.replaceChildren(...(historico.length ? historico.map((e) => h('div', { class: 'foco-evento' },
            h('p', {}, h('strong', {}, (QUE[e.tipo] || (() => e.tipo.replace(/_/g, ' ')))(e))),
            h('p', { class: 'foco-meta' }, [new Date(e.quando).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }), e.quem].filter(Boolean).join(' · ')),
            e.nota && h('p', { class: 'foco-pre' }, e.nota),
            e.tipo === 'foco_mensagem' && e.texto && h('details', {}, h('summary', { class: 'foco-meta' }, 'Texto enviado'), h('p', { class: 'foco-pre' }, e.texto)),
            e.voltar_em && h('p', { class: 'foco-meta' }, `Voltar a falar: ${e.voltar_em}`)
        )) : [h('p', { class: 'foco-meta' }, 'Nada registado ainda.')]));
    } catch (err) {
        if (err.message !== 'unauthorized') alvo.replaceChildren(h('p', { class: 'foco-meta' }, err.message));
    }
}

function atribuir(c) {
    const sel = h('select', { class: 'field-input', onchange: async () => {
        try {
            await api('/api/digitalizept/foco/atribuir', { method: 'POST', body: { ids: [c.id], vendedor_id: sel.value } });
            toast('Atribuído.');
        } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
    } }, opcoesPessoas(c.vendedor_id));
    return sel;
}

// ---------- Contactos (lista + filtros + importar) ----------
async function carregarContactos() {
    const q = state.todos ? '?todos=1' : '';
    state.contactos = (await api(`/api/digitalizept/foco/contactos${q}`)).contactos;
}

function filtrados() {
    const { texto: t, estado, segmento, dono, vista } = state.filtro;
    const alvo = t.trim().toLowerCase();
    const hoje = somarDias(0);
    const v = VISTAS[vista] || VISTAS.todos;
    const donoOk = (c) => !dono || (dono === 'comum' ? !c.vendedor_id : dono === 'meus' ? c.vendedor_id === state.me.id : c.vendedor_id === dono);
    const lista = state.contactos.filter((c) => daLinha(c, state.filtro.linha) && v.ok(c, hoje) && donoOk(c) && (!estado || c.estado === estado)
        && (!segmento || ((segmentoDoTipo(c.tipo) || {}).id || 'outros') === segmento)
        && (!alvo || `${c.nome} ${c.cidade} ${c.morada} ${c.telefone}`.toLowerCase().includes(alvo)));
    if (vista === 'beta') return lista.sort((a, b) => (ultimoUso(a) < ultimoUso(b) ? -1 : 1));
    return vista === 'hoje' || vista === 'semana' ? lista.sort((a, b) => (a.voltar_em < b.voltar_em ? -1 : 1)) : lista;
}

// Follow-up views + the pipeline: where action is needed, at a glance, with counts.
function barraVistas(aoMudar) {
    const f = state.filtro;
    const hoje = somarDias(0);
    const doLinha = state.contactos.filter((c) => daLinha(c, f.linha));
    const conta = (ok) => doLinha.filter((c) => ok(c, hoje)).length;
    const soma = (ok) => doLinha.filter(ok).reduce((t, c) => t + (c.valor_centimos || 0), 0);
    return h('div', { class: 'foco-crm' },
        h('div', { class: 'foco-linhas' }, Object.entries(state.cfg.linhas).map(([id, l]) => h('button', {
            type: 'button', class: `foco-linha${f.linha === id ? ' active' : ''}`,
            onclick: () => {
                f.linha = id;
                f.estado = '';
                if ((VISTAS[f.vista] || {}).so && VISTAS[f.vista].so !== id) f.vista = 'todos';
                state.sel = new Set();
                aoMudar();
            }
        }, l.nome, h('b', {}, state.contactos.filter((c) => daLinha(c, id)).length)))),
        h('div', { class: 'foco-vistas' }, Object.entries(VISTAS).filter(([, v]) => !v.so || v.so === f.linha).map(([id, v]) => {
            const n = conta(v.ok);
            return h('button', { type: 'button', class: `foco-vista${f.vista === id ? ' active' : ''}${id !== 'todos' && id !== 'semana' && n ? ' foco-vista-alerta' : ''}`,
                onclick: () => { f.vista = id; aoMudar(); } }, v.nome, h('b', {}, n));
        })),
        h('div', { class: 'foco-pipeline' }, Object.entries(state.cfg.linhas[f.linha].estados).map(([id, nome]) => h('button', {
            type: 'button', class: `foco-etapa${f.estado === id ? ' active' : ''}`, style: `--cor:${COR[id] || '#888'}`,
            onclick: () => { f.estado = f.estado === id ? '' : id; aoMudar(); }
        }, h('span', {}, nome), h('b', {}, conta((c) => c.estado === id))))),
        f.linha === 'yourlab' && h('p', { class: 'foco-meta' },
            `Pipeline em aberto: ${euros(soma((c) => !fechado(c)))} · Ganho: ${euros(soma((c) => c.estado === 'ym_ganho'))}`),
        f.vista === 'beta' && h('button', { type: 'button', class: 'foco-link', onclick: () => sincronizarUso(aoMudar, true) }, 'Atualizar uso da app'));
}

function barraFiltros(aoMudar) {
    const f = state.filtro;
    const ativos = [f.segmento, f.dono].filter(Boolean).length;
    // Search stays in view; the dropdowns fold away so the first screen shows contacts, not controls.
    return h('div', { class: 'foco-filtros' },
        h('input', { class: 'field-input', type: 'search', placeholder: 'Procurar nome, cidade, telefone…', value: f.texto,
            oninput: (e) => { f.texto = e.target.value; aoMudar(); } }),
        h('details', { class: 'foco-mais', open: ativos > 0 },
            h('summary', {}, ativos ? `Filtros (${ativos})` : 'Filtros'),
            h('div', { class: 'foco-filtros' }, ...filtrosExtra(f, aoMudar))));
}

function filtrosExtra(f, aoMudar) {
    return nos([
        h('select', { class: 'field-input', onchange: (e) => { f.segmento = e.target.value; aoMudar(); } },
            h('option', { value: '' }, 'Todos os segmentos'),
            state.cfg.verticais.filter((v) => v.foco).map((v) => h('option', { value: v.id, selected: f.segmento === v.id }, `${v.foco} · ${v.nome}`)),
            h('option', { value: 'outros', selected: f.segmento === 'outros' }, 'Outros')),
        h('select', { class: 'field-input', onchange: (e) => { f.dono = e.target.value; aoMudar(); } },
            h('option', { value: '' }, state.todos ? 'Todos os donos' : 'Meus + lista comum'),
            h('option', { value: 'meus', selected: f.dono === 'meus' }, `Só os meus (${state.contactos.filter((c) => c.vendedor_id === state.me.id).length})`),
            h('option', { value: 'comum', selected: f.dono === 'comum' }, `Lista comum — por assumir (${state.contactos.filter((c) => !c.vendedor_id).length})`),
            state.todos && state.pessoas.filter((p) => p.id !== state.me.id).map((p) => h('option', { value: p.id, selected: f.dono === p.id }, `Com ${p.nome}`))),
        state.me.papel === 'admin' && h('label', { class: 'foco-toggle' },
            h('input', { type: 'checkbox', checked: state.todos, onchange: (e) => { state.todos = e.target.checked; irPara(state.tab); } }),
            ' Toda a equipa')
    ]);
}

function opcoesPessoas(atual) {
    return [h('option', { value: '', selected: !atual }, 'Lista comum (ninguém)'),
        ...state.pessoas.map((p) => h('option', { value: p.id, selected: p.id === atual }, p.nome))];
}

// Who holds this contact, right on the card: the admin picks anyone, a partner takes it from the shared list.
function controloDono(c, aoMudar) {
    const parar = (e) => e.stopPropagation();
    if (state.me.papel === 'admin') {
        return h('label', { class: 'foco-dono', onclick: parar }, 'Com ',
            h('select', { class: 'field-input', onchange: async (e) => {
                try {
                    await api('/api/digitalizept/foco/atribuir', { method: 'POST', body: { ids: [c.id], vendedor_id: e.target.value } });
                    c.vendedor_id = e.target.value;
                    c.vendedor = (state.pessoas.find((p) => p.id === c.vendedor_id) || {}).nome || '';
                    toast(c.vendedor_id ? `Agora com ${c.vendedor}.` : 'Na lista comum.');
                    aoMudar();
                } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
            } }, opcoesPessoas(c.vendedor_id)));
    }
    if (!c.vendedor_id) {
        return h('button', { type: 'button', class: 'btn-secondary foco-assumir', onclick: (e) => { parar(e); assumir(c); } }, 'Ficar com este contacto');
    }
    return null;
}

function cartaoContacto(c, hoje, aoMudar) {
    const dono = c.vendedor_id ? (c.vendedor_id === state.me.id ? 'Meu' : `Com ${c.vendedor}`) : 'Lista comum';
    return h('div', { class: 'foco-card', role: 'button', tabindex: 0, onclick: () => abrirContacto(c),
        onkeydown: (e) => { if (e.key === 'Enter') abrirContacto(c); } },
        h('div', { class: 'foco-card-top' },
            h('input', { type: 'checkbox', class: 'foco-sel', 'aria-label': `Selecionar ${c.nome}`, checked: state.sel.has(c.id),
                onclick: (e) => e.stopPropagation(),
                onchange: (e) => { if (e.target.checked) state.sel.add(c.id); else state.sel.delete(c.id); aoMudar(); } }),
            h('strong', {}, c.nome),
            c.instagram && h('span', { class: 'foco-chip foco-chip-ig' }, 'IG ✓'),
            naFila(c.id) && h('span', { class: 'foco-chip foco-chip-hoje' }, filaAtual.feitos.includes(c.id) ? 'Hoje ✓' : 'Hoje'),
            h('span', { class: `foco-chip foco-chip-${c.estado}` }, state.cfg.estados[c.estado] || c.estado)
        ),
        h('p', { class: 'foco-meta' }, [nomeTipo(c.tipo), c.cidade, state.me.papel === 'admin' ? '' : dono, c.dor && state.cfg.dores[c.dor]].filter(Boolean).join(' · ')),
        (() => {
            const pp = proximoPasso(c, hoje);
            return h('p', { class: 'foco-meta' }, ...nos([pp && h('span', { class: `foco-pp ${pp.cls}` }, pp.txt),
                c.atualizado_em && `${pp ? ' · ' : ''}última atividade ${haQuanto(c.atualizado_em)}`]));
        })(),
        c.linha === 'yourlab'
            ? (c.projeto || c.valor_centimos > 0) && h('p', { class: 'foco-meta' },
                [state.cfg.projetos[c.projeto], c.valor_centimos && euros(c.valor_centimos)].filter(Boolean).join(' · '))
            : usoResumo(c),
        controloDono(c, aoMudar)
    );
}

const MAX_LISTA = 200;

// Tick contacts, then act on the ticked ones that the filter still shows: type, owner (admin), delete.
function barraSelecao(itens, aoMudar) {
    const ids = itens.filter((c) => state.sel.has(c.id)).map((c) => c.id);
    const marcar = h('label', { class: 'foco-toggle' },
        h('input', { type: 'checkbox', checked: itens.length > 0 && ids.length === itens.length,
            onchange: (e) => { itens.forEach((c) => (e.target.checked ? state.sel.add(c.id) : state.sel.delete(c.id))); aoMudar(); } }),
        ` Selecionar os ${itens.length} da lista`);
    if (!ids.length) return h('div', { class: 'foco-massa' }, marcar);

    const fazer = async (pergunta, chamada, mensagem) => {
        if (!window.confirm(pergunta)) { aoMudar(); return; }
        try {
            const r = await chamada();
            state.sel = new Set();
            await carregarContactos();
            toast(mensagem(r));
        } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
        aoMudar();
    };
    const lote = (corpo) => api('/api/digitalizept/foco/contactos/lote', { method: 'POST', body: { ids, ...corpo } });
    const n = ids.length;
    const tipo = h('select', { class: 'field-input', onchange: (e) => {
        const t = e.target.value;
        if (t) fazer(`Mudar ${n} contactos para «${nomeTipo(t)}»?`, () => lote({ acao: 'tipo', tipo: t }), (r) => `${r.n} contactos: ${nomeTipo(t)}.`);
    } }, h('option', { value: '' }, 'Mudar tipo para…'), h('option', { value: 'generico' }, 'Sem tipo'),
        tiposTodos().map((t) => h('option', { value: t.id }, t.nome)));
    const dono = state.me.papel === 'admin' && h('select', { class: 'field-input', onchange: (e) => {
        const v = e.target.value;
        if (v === '-') return;
        const nome = v ? (state.pessoas.find((p) => p.id === v) || {}).nome : 'a lista comum';
        fazer(`Atribuir ${n} contactos a ${nome}?`,
            () => api('/api/digitalizept/foco/atribuir', { method: 'POST', body: { ids, vendedor_id: v } }), (r) => `${r.n} atribuídos a ${nome}.`);
    } }, h('option', { value: '-' }, 'Atribuir a…'), opcoesPessoas('-'));
    const seguimento = (corpo, pergunta) => fazer(pergunta, () => lote({ acao: 'seguimento', ...corpo }), (r) => `${r.n} contactos atualizados.`);
    const estadoSel = h('select', { class: 'field-input', onchange: (e) => {
        const v = e.target.value;
        if (v) seguimento({ estado: v }, `Mudar ${n} contactos para «${state.cfg.estados[v]}»?`);
    } }, h('option', { value: '' }, 'Mudar estado para…'),
        Object.entries(state.cfg.linhas[state.filtro.linha].estados).map(([id, nome]) => h('option', { value: id }, nome)));
    const [outraId, outra] = Object.entries(state.cfg.linhas).find(([id]) => id !== state.filtro.linha);
    const mover = h('button', { type: 'button', class: 'btn-secondary', onclick: () => fazer(
        `Passar ${n} contactos para ${outra.nome}? Começam essa pipeline do início.`,
        () => lote({ acao: 'linha', linha: outraId }), (r) => `${r.n} passaram para ${outra.nome}.`) }, `Passar para ${outra.nome}`);
    const outraData = h('input', { type: 'date', class: 'field-input hidden', onchange: (e) => {
        if (e.target.value) seguimento({ voltar_em: e.target.value }, `Próximo contacto de ${n} contactos em ${e.target.value}?`);
    } });
    const voltarSel = h('select', { class: 'field-input', onchange: (e) => {
        const v = e.target.value;
        if (v === 'outra') { outraData.classList.remove('hidden'); try { outraData.showPicker(); } catch (_) { /* tap the field */ } return; }
        if (!v) return;
        const data = v === 'nenhum' ? '' : somarDias(Number(v));
        seguimento({ voltar_em: data }, data ? `Próximo contacto de ${n} contactos em ${data}?` : `Tirar a data de ${n} contactos?`);
    } }, h('option', { value: '' }, 'Próximo contacto…'),
        [['0', 'Hoje'], ['1', 'Amanhã'], ['3', 'Daqui a 3 dias'], ['7', 'Daqui a 1 semana'], ['14', 'Daqui a 2 semanas'], ['outra', 'Outra data…'], ['nenhum', 'Sem data']]
            .map(([v, t]) => h('option', { value: v }, t)));
    const whatsapp = state.filtro.linha === 'digitu' && h('button', { type: 'button', class: 'btn-primary', onclick: () => {
        const escolhidos = itens.filter((c) => state.sel.has(c.id));
        state.sel = new Set();
        aoMudar();
        abrirEnvioLote(escolhidos);
    } }, `WhatsApp (${n})`);
    const trabalhar = h('button', { type: 'button', class: 'btn-primary', onclick: () => {
        definirFila({ ids, feitos: [] });
        state.sel = new Set();
        aoMudar();
        abrirContacto(itens.find((c) => c.id === ids[0]));
    } }, `Trabalhar estes (${n})`);
    const apagar = h('button', { type: 'button', class: 'btn-secondary foco-perigo', onclick: () => fazer(
        `Apagar ${n} contactos? Não dá para desfazer.`, () => lote({ acao: 'apagar' }),
        (r) => `${r.apagados} apagados${r.com_negocio ? `; ${r.com_negocio} com negócio fechado ficaram` : ''}.`) }, `Apagar (${n})`);
    return h('div', {}, h('div', { class: 'foco-massa' }, marcar),
        h('div', { class: 'foco-barra' },
            h('p', { class: 'foco-meta' }, `${n} selecionado${n === 1 ? '' : 's'}`),
            h('div', { class: 'foco-massa' }, estadoSel, voltarSel, outraData),
            h('div', { class: 'foco-massa' }, tipo, dono, mover),
            h('div', { class: 'foco-massa' }, whatsapp, trabalhar, apagar,
                h('button', { type: 'button', class: 'btn-secondary', onclick: () => { state.sel = new Set(); aoMudar(); } }, 'Limpar'))));
}

// «Barbearia do Zé, 912345678, Braga» per line. The order doesn't matter: the phone is the part that looks like one.
function lerLinhas(texto) {
    return texto.split('\n').map((l) => l.split(/[\t;,|]/).map((p) => p.trim()).filter(Boolean)).filter((p) => p.length).map((p) => {
        const i = p.findIndex((x) => /^\+?[\d .-]{9,}$/.test(x));
        const telefone = i >= 0 ? p.splice(i, 1)[0] : '';
        return { nome: p[0] || '', cidade: p[1] || '', telefone };
    }).filter((r) => r.nome);
}

function abrirAdicionar() {
    const area = h('textarea', { class: 'field-input', rows: 6, placeholder: 'Barbearia do Zé, 912345678, Braga\nSalão Ana; 223456789; Porto' });
    const tipo = h('select', { class: 'field-input' }, h('option', { value: '' }, 'Sem tipo (adivinhar pelo nome)'),
        tiposTodos().filter((t) => t.id !== 'generico').map((t) => h('option', { value: t.id }, t.nome)));
    const linha = h('select', { class: 'field-input' },
        Object.entries(state.cfg.linhas).map(([id, l]) => h('option', { value: id, selected: id === state.filtro.linha }, l.nome)));
    const botao = h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
        const rows = lerLinhas(area.value).map((r) => ({ ...r, tipo: tipo.value }));
        if (!rows.length) { toast('Escreva pelo menos um nome.', true); return; }
        botao.disabled = true;
        try {
            const r = await api('/api/digitalizept/foco/importar', { method: 'POST', body: { rows, soFoco: false, linha: linha.value, vendedor_id: state.me.id } });
            state.filtro.linha = linha.value;
            fecharSheet();
            toast([`${r.novos} novos`, r.ja_existiam && `${r.ja_existiam} já existiam`, r.entraram_na_lista && `${r.entraram_na_lista} voltaram à lista`].filter(Boolean).join(' · ') + '.');
            irPara('contactos');
        } catch (err) {
            if (err.message !== 'unauthorized') toast(err.message, true);
            botao.disabled = false;
        }
    } }, 'Adicionar');
    abrirSheet(h('h2', {}, 'Adicionar contactos'),
        h('p', { class: 'foco-meta' }, 'Um por linha: nome, telefone, cidade (a ordem não importa). Pode colar uma lista inteira. Quem já existe não é duplicado.'),
        area, campo('Linha', linha), campo('Tipo para todos', tipo), botao);
    area.focus();
}

async function renderContactos() {
    await carregarContactos();
    state.sel = new Set();
    const hoje = somarDias(0);
    if (!state.filtro.vista) state.filtro.vista = state.contactos.some((c) => daLinha(c, state.filtro.linha) && VISTAS.hoje.ok(c, hoje)) ? 'hoje' : 'todos';
    const listaEl = h('div', { class: 'foco-lista' });
    const barraEl = h('div');
    const vistasEl = h('div');
    const pintar = () => {
        const itens = filtrados();
        vistasEl.replaceChildren(barraVistas(pintar));
        barraEl.replaceChildren(...nos([bannerFila(), barraSelecao(itens, pintar)]));
        listaEl.classList.toggle('com-barra', state.sel.size > 0);
        listaEl.replaceChildren(...nos([
            itens.slice(0, MAX_LISTA).map((c) => cartaoContacto(c, hoje, pintar)),
            itens.length > MAX_LISTA && h('p', { class: 'foco-meta' }, `A mostrar ${MAX_LISTA} de ${itens.length}. Afine o filtro ou use o mapa.`),
            !itens.length && h('p', { class: 'foco-vazio' }, !state.contactos.length ? 'Ainda sem contactos. Toque em «Adicionar contactos».'
                : state.filtro.vista === 'hoje' ? 'Nada para hoje. Veja «Sem próximo passo».' : 'Nenhum contacto com este filtro.')
        ]));
    };
    render(
        h('div', { class: 'foco-acoes' },
            h('button', { type: 'button', class: 'btn-primary', onclick: abrirAdicionar }, 'Adicionar contactos'),
            h('button', { type: 'button', class: 'btn-secondary', onclick: abrirImportar }, 'Importar CSV / JSON')),
        vistasEl,
        barraFiltros(pintar),
        barraEl,
        listaEl
    );
    pintar();
    // Once per visit: fresh beta usage from the app, without holding up the list.
    if (!state.usoSincronizado) { state.usoSincronizado = true; sincronizarUso(pintar); }
}

function abrirImportar() {
    const ficheiro = h('input', { type: 'file', accept: '.csv,text/csv,.json,application/json', class: 'field-input' });
    const colar = h('textarea', { class: 'field-input', rows: 5, placeholder: 'ou cole aqui o CSV (ligar_*.csv) ou o JSON do crawler' });
    const soFoco = h('input', { type: 'checkbox', checked: true });
    const para = state.me.papel === 'admin' && h('select', { class: 'field-input' },
        h('option', { value: '' }, 'Lista comum — cada parceiro assume os seus'),
        state.pessoas.map((p) => h('option', { value: p.id }, p.nome)));
    const resultado = h('div');
    const botao = h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
        let rows, csv;
        try {
            const txt = ficheiro.files[0] ? await ficheiro.files[0].text() : colar.value;
            if (/^\s*[[{]/.test(txt)) {
                rows = JSON.parse(txt);
                if (!Array.isArray(rows)) rows = rows.businesses || rows.rows || [];
            } else if (txt.trim()) csv = txt;   // CSV is parsed on the server (foco.lerCsv)
            else throw new Error('vazio');
        } catch (_) {
            toast('Não é um CSV nem um JSON válido.', true);
            return;
        }
        botao.disabled = true;
        botao.textContent = rows ? `A importar ${rows.length}…` : 'A importar…';
        try {
            const r = await api('/api/digitalizept/foco/importar', {
                method: 'POST', body: { rows, csv, soFoco: soFoco.checked, vendedor_id: para ? para.value : undefined }
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
        h('h2', {}, 'Importar contactos'),
        h('p', { class: 'foco-meta' }, 'Um ficheiro ligar_*.csv do leadgen (ou o JSON do crawler antigo). Quem já existe não é duplicado.'),
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
        h('span', {}, h('i', { style: `background:${COR[id]}` }), nome)),
        h('span', {}, h('i', { style: 'background:transparent;border:2px solid #e8d5b7' }), 'Lista comum (por assumir)'));
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
            radius: 7, color: c.vendedor_id ? '#1b1b1b' : '#e8d5b7', weight: c.vendedor_id ? 1 : 2,
            fillColor: COR[c.estado] || '#8e8e93', fillOpacity: c.vendedor_id ? 0.95 : 0.35
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
    return [r.contactos, pct(r.dor_sim, r.contactos), r.demos, r.ativos].map((n) => h('td', {}, n));
}

// Markdown grouped by type, to paste into Notion.
function copiarLicoes(licoes) {
    const porTipo = {};
    licoes.forEach((l) => { (porTipo[nomeTipo(l.tipo)] = porTipo[nomeTipo(l.tipo)] || []).push(l); });
    const md = [`# Lições — Foco comercial (${new Date().toISOString().slice(0, 10)})`,
        ...Object.entries(porTipo).flatMap(([tipo, ls]) => ['', `## ${tipo}`, ...ls.map((l) =>
            `- **${l.nome || 'Sem nome'}**${l.cidade ? ` (${l.cidade})` : ''} — ${state.cfg.estados[l.estado] || l.estado}: ${l.texto.replace(/\s*\n\s*/g, ' / ')}`)])
    ].join('\n');
    navigator.clipboard.writeText(md).then(() => toast('Copiado — cole no Notion.')).catch(() => toast('Não foi possível copiar.', true));
}

async function renderResultados() {
    const [r, { licoes }] = await Promise.all([api('/api/digitalizept/foco/resumo'), api('/api/digitalizept/foco/licoes')]);
    const t = r.total;
    const cab = (primeira) => h('tr', {}, [primeira, 'Contactos', 'Dor real', 'Link', 'Ativos'].map((x) => h('th', {}, x)));
    render(
        h('section', { class: 'foco-kpis' },
            [['Por contactar', t.por_contactar], ['Contactos', t.contactos], ['Dor real', t.dor_sim], ['Link enviado', t.demos],
                ['Beta users', t.beta], ['Seguem no Instagram', t.instagram], ['Produtos ativos', t.ativos]].map(([k, n]) => h('div', {}, h('strong', {}, n), h('span', {}, k)))
        ),
        h('p', { class: 'foco-meta' }, `Funil ${state.cfg.linhas.digitu.nome}. Os leads ${state.cfg.linhas.yourlab.nome} têm a pipeline e o valor em Contactos.`),
        h('p', { class: 'foco-meta' }, t.ativos === 0
            ? 'Objetivo agora: descobrir em que segmento a dor é mais real, e converter o primeiro.'
            : '«Dor real» = das pessoas contactadas, quantas confirmaram o problema.'),
        bloco(`Lições aprendidas (${licoes.length})`,
            licoes.length
                ? [h('button', { type: 'button', class: 'btn-secondary', onclick: () => copiarLicoes(licoes) }, 'Copiar para o Notion'),
                    licoes.slice(0, 50).map((l) => h('div', { class: 'foco-evento' },
                        h('p', {}, h('strong', {}, l.nome || 'Sem nome'), ` · ${nomeTipo(l.tipo)}`),
                        h('p', { class: 'foco-meta' }, [state.cfg.estados[l.estado] || l.estado, l.dor && state.cfg.dores[l.dor],
                            new Date(l.criado_em).toLocaleDateString('pt-PT')].filter(Boolean).join(' · ')),
                        h('p', { class: 'foco-pre' }, l.texto)))]
                : h('p', { class: 'foco-meta' }, 'Ainda sem lições. Escreva uma ao guardar cada contacto.')),
        bloco('Por segmento',
            h('table', { class: 'foco-tabela' }, cab('Segmento'), r.segmentos.map((s) => h('tr', {}, h('td', {}, s.nome), ...linhaFunil(s)))),
            r.segmentos.filter((s) => s.motivos.length).map((s) => h('div', { class: 'foco-motivos' },
                h('strong', {}, `Porque disseram não — ${s.nome}`), lista(s.motivos)))
        ),
        r.principios.length > 0 && bloco('Por princípio — que dor abre portas',
            h('table', { class: 'foco-tabela' }, cab('Princípio'), r.principios.map((x) => h('tr', {},
                h('td', {}, String(x.nome).split('—')[0].trim()), ...linhaFunil(x))))),
        r.mensagensCanal.length > 0 && bloco('Por onde foi a mensagem',
            h('table', { class: 'foco-tabela' }, cab('Canal'), r.mensagensCanal.map((x) => h('tr', {}, h('td', {}, x.nome), ...linhaFunil(x))))),
        r.mensagens.length > 0 && bloco('Por mensagem — qual abre conversa',
            h('table', { class: 'foco-tabela' }, cab('Modelo'), r.mensagens.map((m) => h('tr', {}, h('td', {}, m.nome), ...linhaFunil(m))))),
        r.canais.length > 0 && bloco('Por canal — o que leva à demo',
            h('table', { class: 'foco-tabela' }, cab('Canal'), r.canais.map((c) => h('tr', {}, h('td', {}, c.nome), ...linhaFunil(c))))),
        state.me.papel === 'admin' && bloco('Por pessoa',
            h('table', { class: 'foco-tabela' }, cab('Quem'), r.vendedores.map((p) => h('tr', {}, h('td', {}, p.nome), ...linhaFunil(p)))))
    );
}

function formMarca() {
    const m = state.cfg.marca;
    const nome = h('input', { class: 'field-input', value: m.nome });
    const slogan = h('input', { class: 'field-input', value: m.slogan });
    const numero = h('input', { class: 'field-input', type: 'tel', value: m.numero, placeholder: '+351 9xx xxx xxx' });
    const link = h('input', { class: 'field-input', type: 'url', value: m.link });
    const instagramMarca = h('input', { class: 'field-input', value: m.instagram || '', placeholder: '@digitu' });
    const descricao = h('input', { class: 'field-input', value: m.descricao });
    const linhas = h('textarea', { class: 'field-input', rows: 5 }, m.linhas.join('\n'));
    return h('div', { class: 'foco-form' },
        campo('Nome do produto', nome),
        campo('Frase', slogan),
        campo('Número de WhatsApp da empresa', numero),
        campo('Link', link),
        campo('Instagram (pedido no fim de cada chamada)', instagramMarca),
        campo('O que é, por palavras ({o_que_e})', descricao),
        campo('As linhas de valor (uma por linha)', linhas),
        h('p', { class: 'foco-meta' }, 'O WhatsApp envia sempre pela conta ligada no aparelho. Para sair deste número, abra o WhatsApp Web com a sessão da empresa e use o botão «WhatsApp Web» em cada contacto.'),
        h('button', { type: 'button', class: 'btn-primary', onclick: async (e) => {
            e.target.disabled = true;
            try {
                const r = await api('/api/digitalizept/foco/marca', { method: 'PATCH', body: {
                    nome: nome.value, slogan: slogan.value, numero: numero.value, link: link.value, instagram: instagramMarca.value, descricao: descricao.value,
                    linhas: linhas.value.split('\n').map((t) => t.trim()).filter(Boolean)
                } });
                state.cfg.marca = r.marca;
                toast('Guardado.');
            } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
            e.target.disabled = false;
        } }, 'Guardar'));
}

// ---------- Mensagens (modelos de WhatsApp) ----------
const EXEMPLO = { nome: 'Barbearia do Zé', cidade: 'Braga', tipo: 'barbeiro', dmn_link: 'https://digitalizemeunegocio.pt/digitalize/c/…' };

function editorModelo(m = {}) {
    const focoSeg = state.cfg.verticais.filter((v) => v.foco);
    const nome = h('input', { class: 'field-input', value: m.nome || '', placeholder: 'Ex.: Barbearias — sábado cheio' });
    const segmento = h('select', { class: 'field-input' }, h('option', { value: '' }, 'Todos os segmentos'),
        focoSeg.map((v) => h('option', { value: v.id, selected: v.id === m.segmento_id }, `${v.foco} · ${v.nome}`)));
    const canal = h('select', { class: 'field-input' }, h('option', { value: '' }, 'Qualquer canal'),
        Object.entries(state.cfg.canais).map(([id, nome]) => h('option', { value: id, selected: id === m.canal }, nome)));
    const principio = h('select', { class: 'field-input' }, h('option', { value: '' }, 'Nenhum em especial'),
        state.cfg.marca.linhas.map((t, i) => h('option', { value: String(i), selected: String(i) === m.principio }, t.split('—')[0].trim())));
    const caixa = h('textarea', { class: 'field-input foco-mensagem', rows: 8 }, m.texto || MODELOS_BASE[0].texto);
    const previa = h('p', { class: 'foco-pre foco-nota' });
    const pintar = () => {
        const v = state.cfg.verticais.find((x) => x.id === segmento.value) || focoSeg[0];
        const exemplo = { ...EXEMPLO, tipo: (v.tipos || [])[0] || EXEMPLO.tipo };
        state.linha = state.cfg.marca.linhas[principio.value || 0] || '';
        previa.textContent = preencher(caixa.value, exemplo);
    };
    caixa.addEventListener('input', pintar);
    segmento.addEventListener('change', pintar);
    principio.addEventListener('change', pintar);
    const inserir = (k) => {
        const i = caixa.selectionStart ?? caixa.value.length;
        caixa.value = `${caixa.value.slice(0, i)}{${k}}${caixa.value.slice(i)}`;
        caixa.focus();
        pintar();
    };
    const guardar = async () => {
        const body = { nome: nome.value, segmento_id: segmento.value, canal: canal.value, principio: principio.value, texto: caixa.value };
        try {
            const r = m.id
                ? await api(`/api/digitalizept/foco/mensagens/${m.id}`, { method: 'PATCH', body })
                : await api('/api/digitalizept/foco/mensagens', { method: 'POST', body });
            state.mensagens = r.mensagens;
            toast('Modelo guardado.');
            fecharSheet();
            renderMensagens();
        } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
    };
    const podeApagar = m.id && (state.me.papel === 'admin' || m.criado_por === state.me.id);
    abrirSheet(
        h('h2', {}, m.id ? 'Editar modelo' : 'Novo modelo'),
        campo('Nome do modelo', nome), campo('Para', segmento), campo('Canal', canal), campo('Princípio', principio), campo('Texto', caixa),
        h('p', { class: 'foco-meta' }, 'Toque para inserir:'),
        h('div', { class: 'foco-contactar' }, Object.entries(MARCADORES).map(([k, [ajuda]]) =>
            h('button', { type: 'button', title: ajuda, onclick: () => inserir(k) }, `{${k}}`))),
        bloco('Como fica (exemplo)', previa),
        h('button', { type: 'button', class: 'btn-primary', onclick: guardar }, 'Guardar modelo'),
        podeApagar && h('button', { type: 'button', class: 'foco-link', onclick: async () => {
            if (!window.confirm('Apagar este modelo?')) return;
            state.mensagens = (await api(`/api/digitalizept/foco/mensagens/${m.id}`, { method: 'PATCH', body: { ativo: false } })).mensagens;
            fecharSheet();
            renderMensagens();
        } }, 'Apagar modelo')
    );
    pintar();
}

async function renderMensagens() {
    state.mensagens = (await api('/api/digitalizept/foco/mensagens')).mensagens;
    const seg = (id) => (state.cfg.verticais.find((v) => v.id === id) || {}).nome || 'Todos os segmentos';
    const cartao = (m, base) => h('div', { class: 'foco-card' },
        h('div', { class: 'foco-card-top' }, h('strong', {}, m.nome),
            m.canal && h('span', { class: 'foco-chip' }, state.cfg.canais[m.canal] || m.canal),
            h('span', { class: 'foco-chip' }, base ? 'Base' : seg(m.segmento_id))),
        m.principio !== undefined && m.principio !== '' && h('p', { class: 'foco-meta' }, state.cfg.marca.linhas[m.principio] || ''),
        h('p', { class: 'foco-pre foco-meta' }, m.texto),
        h('div', { class: 'foco-acoes' },
            base
                ? h('button', { type: 'button', class: 'btn-secondary', onclick: () => editorModelo({ nome: `${m.nome} (cópia)`, texto: m.texto }) }, 'Copiar e adaptar')
                : (state.me.papel === 'admin' || m.criado_por === state.me.id)
                    && h('button', { type: 'button', class: 'btn-secondary', onclick: () => editorModelo(m) }, 'Editar'),
            !base && m.autor && h('span', { class: 'foco-meta' }, `por ${m.autor}`)));
    render(
        h('p', { class: 'foco-meta' }, 'Os marcadores ({nome}, {gancho}, {linha}, {link}…) são preenchidos com os dados de cada contacto e do seu segmento. A mensagem pode sempre ser ajustada antes de enviar. Em Resultados vê qual modelo abre mais conversas.'),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => editorModelo() }, 'Novo modelo'),
        h('div', { class: 'foco-lista' }, state.mensagens.map((m) => cartao(m, false)), MODELOS_BASE.map((m) => cartao(m, true)))
    );
}

// ---------- Equipa (admin) ----------
async function renderEquipa() {
    const [{ vendedores }, resumo, { n: libertaveis }] = await Promise.all([
        api('/api/digitalizept/equipa'), api('/api/digitalizept/foco/resumo'), api('/api/digitalizept/foco/libertar')
    ]);
    state.equipa = vendedores;
    const numeros = Object.fromEntries(resumo.vendedores.map((p) => [p.id, p]));
    const comum = numeros[''] || { por_contactar: 0 };
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
            numeros[v.id] && h('p', { class: 'foco-meta' }, `Assumidos por contactar: ${numeros[v.id].por_contactar} · contactados: ${numeros[v.id].contactos} · dor real: ${numeros[v.id].dor_sim} · ativos: ${numeros[v.id].ativos}`),
            h('div', { class: 'foco-acoes' },
                h('button', { type: 'button', class: 'btn-secondary', onclick: () => {
                    const senha = window.prompt(`Nova password para ${v.nome} (mín. 8):`);
                    if (senha) mudar(v, { senha }, 'Password alterada.');
                } }, 'Nova password'),
                v.id !== state.me.id && h('button', { type: 'button', class: 'btn-secondary', onclick: () => mudar(v, { ativo: !v.ativo }, v.ativo ? 'Desativado.' : 'Reativado.') },
                    v.ativo ? 'Desativar' : 'Reativar')
            )
        ))),
        bloco('Lista comum',
            h('p', {}, `${comum.por_contactar} contactos por assumir. Quem assume um fica com ele; os outros deixam de o ver.`),
            libertaveis > 0 && h('button', { type: 'button', class: 'btn-secondary', onclick: async () => {
                if (!window.confirm(`Pôr ${libertaveis} leads do admin nunca contactados na lista comum?`)) return;
                try {
                    const { n } = await api('/api/digitalizept/foco/libertar', { method: 'POST' });
                    toast(`${n} leads na lista comum.`);
                    renderEquipa();
                } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
            } }, `Pôr na lista comum os ${libertaveis} leads do admin nunca contactados`)),
        bloco('A marca — o que se partilha e por que número', formMarca()),
        bloco('Adicionar parceiro', form)
    );
}

// ---------- boot ----------
async function arrancar() {
    try {
        const [{ vendedor }, cfg, { pessoas }, { mensagens }] = await Promise.all([
            api('/api/digitalizept/me'), api('/api/digitalizept/foco'), api('/api/digitalizept/foco/pessoas'),
            api('/api/digitalizept/foco/mensagens')
        ]);
        state.mensagens = mensagens;
        state.me = vendedor;
        state.cfg = cfg;
        state.pessoas = pessoas;
        // The admin works the whole list (same leads as admin → Leads); partners see theirs + the shared list.
        if (state.todos === null) state.todos = vendedor.papel === 'admin';
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
