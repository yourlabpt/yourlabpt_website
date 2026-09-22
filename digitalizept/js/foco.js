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
    mensagens: [], filtro: { texto: '', estado: '', segmento: '', dono: '' }
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
    link: ['Link da app com o nome do negócio', (c) => c.dmn_link]
};

// `manter`: leave unknown/empty {slots} in place (call scripts show them as ‹slot›).
function preencher(modelo, c, { manter = false } = {}) {
    const v = segmentoDoTipo(c.tipo);
    return String(modelo || '').replace(/\{([a-z_]+)\}/g, (todo, k) => {
        const m = MARCADORES[k];
        const valor = m && m[1](c, v);
        return valor ? String(valor) : (manter || k === 'link' ? todo : '');
    }).replace(/[ \t]+([.,!?])/g, '$1');
}

// Base templates every segment gets; the team adds its own in Mensagens.
const MODELOS_BASE = [
    { id: 'base:pergunta', nome: 'Pergunta primeiro (sem link)', texto: 'Olá, {nome}! Sou {eu}, da YourLab. Uma pergunta rápida: {gancho}\n\nPergunto porque muitos negócios como o vosso {em_cidade} dizem-nos o mesmo: {dor} Se também vos acontece, explico em 2 minutos como resolver.' },
    { id: 'base:link', nome: 'Pergunta + link da app', texto: 'Olá, {nome}! Sou {eu}, da YourLab. {gancho}\n\n{frase} Pode experimentar com o nome do seu negócio, sem compromisso: {link}' },
    { id: 'base:depois', nome: 'Depois da chamada (com link)', texto: 'Olá! Obrigado pela conversa, sou {eu}. Como falámos: {frase}\n\nAqui está a app para experimentar com o nome de {nome}: {link}' }
];

function modelosPara(c) {
    const v = segmentoDoTipo(c.tipo);
    const proprios = (state.mensagens || []).filter((m) => !m.segmento_id || (v && m.segmento_id === v.id));
    return [...MODELOS_BASE, ...proprios];
}

function configuradorMensagem(c, modeloInicial = 'base:pergunta') {
    const modelos = modelosPara(c);
    const escolha = h('select', { class: 'field-input' }, modelos.map((m) => h('option', { value: m.id, selected: m.id === modeloInicial }, m.nome)));
    const caixa = h('textarea', { class: 'field-input foco-mensagem', rows: 7 });
    const aviso = h('p', { class: 'foco-meta' });
    const wa = h('a', { class: 'btn-primary', target: '_blank', rel: 'noopener' }, 'Abrir no WhatsApp');
    const modelo = () => modelos.find((m) => m.id === escolha.value) || modelos[0];
    const atualizarLink = () => {
        wa.href = `https://wa.me/${waNumero(c.whatsapp || c.telefone)}?text=${encodeURIComponent(caixa.value)}`;
        aviso.textContent = !(c.whatsapp || c.telefone) ? 'Sem número: o WhatsApp vai pedir para escolher o contacto.' : '';
    };
    const preencherCaixa = async () => {
        if (modelo().texto.includes('{link}') && !c.dmn_link) {
            caixa.value = 'A preparar o link da app com o nome do negócio…';
            try {
                Object.assign(c, (await api(`/api/digitalizept/foco/contactos/${c.id}/demo`, { method: 'POST' })).contacto);
            } catch (err) {
                if (err.message !== 'unauthorized') toast(err.message, true);
            }
        }
        caixa.value = preencher(modelo().texto, c);
        atualizarLink();
    };
    const registar = () => api(`/api/digitalizept/foco/contactos/${c.id}/mensagem`, {
        method: 'POST', body: { modelo: modelo().nome, texto: caixa.value }
    }).then(({ contacto }) => Object.assign(c, contacto)).catch(() => {});
    escolha.addEventListener('change', preencherCaixa);
    caixa.addEventListener('input', atualizarLink);
    wa.addEventListener('click', registar);
    preencherCaixa();
    return [
        campo('Modelo', escolha), caixa, aviso,
        h('div', { class: 'foco-acoes' }, wa,
            h('button', { type: 'button', class: 'btn-secondary', onclick: () => navigator.clipboard.writeText(caixa.value).then(() => { registar(); toast('Mensagem copiada.'); }) }, 'Copiar')),
        h('button', { type: 'button', class: 'foco-link', onclick: () => { fecharSheet(); irPara('mensagens'); } }, 'Criar ou editar modelos')
    ];
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

function amanha() {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().slice(0, 10);
}

async function guardarEstado(c, body, depois) {
    try {
        const r = await api(`/api/digitalizept/foco/contactos/${c.id}/estado`, { method: 'POST', body });
        toast('Guardado.');
        if (depois) return depois(r.contacto);
        fecharSheet();
        irPara(state.tab === 'mapa' ? 'mapa' : 'contactos');
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
    const pessoa = h('input', { class: 'field-input', placeholder: 'Nome de quem atendeu (ex.: D. Maria)' });
    const pessoaNao = h('input', { class: 'field-input', placeholder: 'Nome de quem atendeu' });
    const numero = h('input', { class: 'field-input', type: 'tel', inputmode: 'tel', value: c.whatsapp || c.telefone || '' });
    const dor = escolhaChips(state.cfg.dores, c.dor || '');
    const voltar = h('input', { class: 'field-input', type: 'date', value: amanha() });
    const voltarCampo = campo('Voltar a falar em', voltar);
    voltarCampo.hidden = true;
    const proximo = escolhaChips({ link: 'Sim, envio o link', voltar: 'Prefere que ligue depois', sem_interesse: 'Não tem interesse' }, '', (id) => {
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

    conversa.append(...nos([
        bloco('2 · Apresentar-se',
            dizer(`Muito prazer! Chamo-me ${state.me.nome} e sou da YourLab, uma empresa portuguesa que ajuda negócios como o seu ${emCidade(c.cidade)} a organizar o dia a dia.`),
            dizer('Com quem tenho o gosto de falar?'), pessoa,
            dizer('Não lhe vou tomar mais de dois minutos — pode ser agora?'),
            se('estiver ocupado(a)', dizer('Claro, compreendo. A que horas lhe dá mais jeito que ligue?'), h('p', { class: 'foco-meta' }, 'Registe em baixo «Prefere que ligue depois».'))),
        bloco('3 · Mostrar que olhou para o negócio', dizer(observacao(c)), dizer(ponte(c, v))),
        bloco('4 · Ouvir — é aqui que se percebe a dor',
            h('p', { class: 'foco-meta' }, 'Pergunte e deixe falar. Não venda ainda.'),
            a.pergunta_abertura && dizer(a.pergunta_abertura),
            a.gancho && dizer(a.gancho),
            dizer('E como é que fazem hoje?'),
            h('p', { class: 'foco-meta' }, 'Marque o que a pessoa confirmou:'),
            h('div', { class: 'foco-checks' }, sinais.map((t, i) => h('label', {}, marcados[i], ` ${t}`))),
            palavras),
        bloco('5 · É uma dor real?', dor.el,
            h('p', { class: 'foco-meta' }, 'Se não é, agradeça com simpatia e registe — saber que não é dor também é aprender.')),
        bloco('6 · Se sim — o que muda para ele(a)',
            dizer(`Percebo perfeitamente. É exatamente para isso que existimos: ${minuscula(v.posicionamento || '')}`),
            v.posicionamento_sub && dizer(v.posicionamento_sub)),
        a.objecao && bloco('Se disser…', h('p', {}, h('strong', {}, `«${a.objecao.texto}»`)), dizer(a.objecao.resposta)),
        bloco('7 · Convidar a experimentar',
            dizer(`Faço-lhe uma proposta sem compromisso: envio-lhe pelo WhatsApp um link. Abre a app já com o nome da ${c.nome} e experimenta sozinho(a), com calma. Se fizer sentido, falamos; se não, fica por aqui.`),
            dizer('Qual é o melhor número para lhe enviar?'),
            proximo.el, numeroCampo, voltarCampo),
        bloco('8 · Despedir-se', despedida),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => {
            if (!dor.valor()) return toast('Falta: é uma dor real?', true);
            if (!proximo.valor()) return toast('Falta o próximo passo.', true);
            const estados = { link: 'contactado', voltar: 'voltar', sem_interesse: 'sem_interesse' };
            const itens = marcados.filter((x) => x.checked).map((x) => x.value);
            const nota = [
                quem() && `Falou com: ${quem()}`, palavras.value.trim(), itens.length && `Confirmou: ${itens.join('; ')}`
            ].filter(Boolean).join('\n');
            return guardarEstado(c, {
                estado: estados[proximo.valor()], canal: 'telefone', dor: dor.valor(), dor_itens: itens, nota, guiao: true,
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

    let estado = c.estado;
    const botoes = escolhaChips(state.cfg.estados, estado, (id) => {
        estado = id;
        nota.placeholder = id === 'sem_interesse' ? 'Porquê? (é isto que nos ensina)' : 'Nota';
    });
    const dor = escolhaChips(state.cfg.dores, c.dor || '');
    const voltar = h('input', { class: 'field-input', type: 'date', value: c.voltar_em || '' });
    const nota = h('textarea', { class: 'field-input', rows: 3, placeholder: 'Nota' });
    const canal = h('select', { class: 'field-input' }, h('option', { value: '' }, '—'),
        Object.entries(state.cfg.canais).map(([id, nome]) => h('option', { value: id }, nome)));
    const mensagem = bloco('2 · Mensagem de WhatsApp', ...configuradorMensagem(c, modelo));
    abrirSheet(
        ...cabecalho,
        contactarBotoes(c),
        !c.vendedor_id && h('button', { type: 'button', class: 'btn-secondary', onclick: () => assumir(c) }, 'Ficar com este contacto'),
        bloco('1 · Perceber a dor',
            h('button', { type: 'button', class: 'btn-primary', onclick: () => abrirGuiao(c) }, 'Ligar com o guião'),
            c.dor && h('p', { class: 'foco-meta' }, `Última resposta: ${state.cfg.dores[c.dor]}`)),
        mensagem,
        bloco('3 · O que aconteceu', botoes.el,
            h('p', { class: 'foco-meta' }, 'É uma dor real?'), dor.el,
            campo('Como falou', canal), campo('Voltar a falar em', voltar), nota,
            h('button', { type: 'button', class: 'btn-primary', onclick: () => guardarEstado(c, {
                estado, voltar_em: voltar.value, nota: nota.value, canal: canal.value, dor: dor.valor()
            }) }, 'Guardar')
        ),
        bloco('Histórico', historico),
        state.me.papel === 'admin' && bloco('Quem trata', atribuir(c)),
        meu && c.vendedor_id && c.estado === 'por_contactar' && h('button', { type: 'button', class: 'foco-link', onclick: () => largar(c) }, 'Devolver à lista comum'),
        v && h('button', { type: 'button', class: 'foco-link', onclick: () => abrirSegmento(v) }, `Ver segmento · ${v.nome}`)
    );
    if (modelo) mensagem.scrollIntoView({ block: 'start' });
    return null;
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
        e.guiao && 'com guião'
    ].filter(Boolean).join(' · '),
    foco_mensagem: (e) => `WhatsApp · ${e.modelo}${e.com_link ? ' · com link' : ''}`,
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
    const { texto: t, estado, segmento, dono } = state.filtro;
    const alvo = t.trim().toLowerCase();
    const donoOk = (c) => !dono || (dono === 'comum' ? !c.vendedor_id : dono === 'meus' ? c.vendedor_id === state.me.id : c.vendedor_id === dono);
    return state.contactos.filter((c) => donoOk(c) && (!estado || c.estado === estado)
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
        h('select', { class: 'field-input', onchange: (e) => { f.dono = e.target.value; aoMudar(); } },
            h('option', { value: '' }, state.todos ? 'Todos os donos' : 'Meus + lista comum'),
            h('option', { value: 'meus', selected: f.dono === 'meus' }, `Só os meus (${state.contactos.filter((c) => c.vendedor_id === state.me.id).length})`),
            h('option', { value: 'comum', selected: f.dono === 'comum' }, `Lista comum — por assumir (${state.contactos.filter((c) => !c.vendedor_id).length})`),
            state.todos && state.pessoas.filter((p) => p.id !== state.me.id).map((p) => h('option', { value: p.id, selected: f.dono === p.id }, `Com ${p.nome}`))),
        state.me.papel === 'admin' && h('label', { class: 'foco-toggle' },
            h('input', { type: 'checkbox', checked: state.todos, onchange: (e) => { state.todos = e.target.checked; irPara(state.tab); } }),
            ' Toda a equipa')
    );
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
            h('strong', {}, c.nome),
            h('span', { class: `foco-chip foco-chip-${c.estado}` }, state.cfg.estados[c.estado] || c.estado)
        ),
        h('p', { class: 'foco-meta' }, [nomeTipo(c.tipo), c.cidade, state.me.papel === 'admin' ? '' : dono, c.dor && state.cfg.dores[c.dor]].filter(Boolean).join(' · ')),
        c.voltar_em && h('p', { class: `foco-meta${c.voltar_em <= hoje ? ' foco-hoje' : ''}` }, `Voltar a falar: ${c.voltar_em}`),
        controloDono(c, aoMudar)
    );
}

const MAX_LISTA = 200;

// Admin: give everything the current filter shows to one person (or back to the shared list).
function atribuirEmMassa(aoMudar) {
    const para = h('select', { class: 'field-input' }, opcoesPessoas(null));
    return h('div', { class: 'foco-massa' },
        h('span', { class: 'foco-meta' }, 'Atribuir os contactos filtrados a'),
        para,
        h('button', { type: 'button', class: 'btn-secondary', onclick: async () => {
            const ids = filtrados().map((c) => c.id);
            const nome = para.value ? (state.pessoas.find((p) => p.id === para.value) || {}).nome : 'Lista comum';
            if (!ids.length || !window.confirm(`Atribuir ${ids.length} contactos a ${nome}?`)) return;
            try {
                const { n } = await api('/api/digitalizept/foco/atribuir', { method: 'POST', body: { ids, vendedor_id: para.value } });
                toast(`${n} contactos atribuídos a ${nome}.`);
                await carregarContactos();
                aoMudar();
            } catch (err) { if (err.message !== 'unauthorized') toast(err.message, true); }
        } }, 'Atribuir'));
}

async function renderContactos() {
    await carregarContactos();
    const hoje = new Date().toISOString().slice(0, 10);
    const listaEl = h('div', { class: 'foco-lista' });
    const pintar = () => {
        const itens = filtrados();
        listaEl.replaceChildren(...nos([
            itens.slice(0, MAX_LISTA).map((c) => cartaoContacto(c, hoje, pintar)),
            itens.length > MAX_LISTA && h('p', { class: 'foco-meta' }, `A mostrar ${MAX_LISTA} de ${itens.length}. Afine o filtro ou use o mapa.`),
            !itens.length && h('p', { class: 'foco-vazio' }, state.contactos.length ? 'Nenhum contacto com este filtro.' : 'Ainda sem contactos. Importe o JSON do crawler ou registe um a partir de um segmento.')
        ]));
    };
    render(
        h('div', { class: 'foco-acoes' },
            h('button', { type: 'button', class: 'btn-secondary', onclick: abrirImportar }, 'Importar JSON do crawler')),
        barraFiltros(pintar),
        state.me.papel === 'admin' && atribuirEmMassa(pintar),
        listaEl
    );
    pintar();
}

function abrirImportar() {
    const ficheiro = h('input', { type: 'file', accept: '.json,application/json', class: 'field-input' });
    const colar = h('textarea', { class: 'field-input', rows: 5, placeholder: 'ou cole aqui o conteúdo de out/novos.json' });
    const soFoco = h('input', { type: 'checkbox', checked: true });
    const para = state.me.papel === 'admin' && h('select', { class: 'field-input' },
        h('option', { value: '' }, 'Lista comum — cada parceiro assume os seus'),
        state.pessoas.map((p) => h('option', { value: p.id }, p.nome)));
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

async function renderResultados() {
    const r = await api('/api/digitalizept/foco/resumo');
    const t = r.total;
    const cab = (primeira) => h('tr', {}, [primeira, 'Contactos', 'Dor real', 'Link', 'Ativos'].map((x) => h('th', {}, x)));
    render(
        h('section', { class: 'foco-kpis' },
            [['Por contactar', t.por_contactar], ['Contactos', t.contactos], ['Dor real', t.dor_sim], ['Link enviado', t.demos], ['Produtos ativos', t.ativos]].map(([k, n]) => h('div', {}, h('strong', {}, n), h('span', {}, k)))
        ),
        h('p', { class: 'foco-meta' }, t.ativos === 0
            ? 'Objetivo agora: descobrir em que segmento a dor é mais real, e converter o primeiro.'
            : '«Dor real» = das pessoas contactadas, quantas confirmaram o problema.'),
        bloco('Por segmento',
            h('table', { class: 'foco-tabela' }, cab('Segmento'), r.segmentos.map((s) => h('tr', {}, h('td', {}, s.nome), ...linhaFunil(s)))),
            r.segmentos.filter((s) => s.motivos.length).map((s) => h('div', { class: 'foco-motivos' },
                h('strong', {}, `Porque disseram não — ${s.nome}`), lista(s.motivos)))
        ),
        r.mensagens.length > 0 && bloco('Por mensagem — qual abre conversa',
            h('table', { class: 'foco-tabela' }, cab('Modelo'), r.mensagens.map((m) => h('tr', {}, h('td', {}, m.nome), ...linhaFunil(m))))),
        r.canais.length > 0 && bloco('Por canal — o que leva à demo',
            h('table', { class: 'foco-tabela' }, cab('Canal'), r.canais.map((c) => h('tr', {}, h('td', {}, c.nome), ...linhaFunil(c))))),
        state.me.papel === 'admin' && bloco('Por pessoa',
            h('table', { class: 'foco-tabela' }, cab('Quem'), r.vendedores.map((p) => h('tr', {}, h('td', {}, p.nome), ...linhaFunil(p)))))
    );
}

// ---------- Mensagens (modelos de WhatsApp) ----------
const EXEMPLO = { nome: 'Barbearia do Zé', cidade: 'Braga', tipo: 'barbeiro', dmn_link: 'https://digitalizemeunegocio.pt/digitalize/c/…' };

function editorModelo(m = {}) {
    const focoSeg = state.cfg.verticais.filter((v) => v.foco);
    const nome = h('input', { class: 'field-input', value: m.nome || '', placeholder: 'Ex.: Barbearias — sábado cheio' });
    const segmento = h('select', { class: 'field-input' }, h('option', { value: '' }, 'Todos os segmentos'),
        focoSeg.map((v) => h('option', { value: v.id, selected: v.id === m.segmento_id }, `${v.foco} · ${v.nome}`)));
    const caixa = h('textarea', { class: 'field-input foco-mensagem', rows: 8 }, m.texto || MODELOS_BASE[0].texto);
    const previa = h('p', { class: 'foco-pre foco-nota' });
    const pintar = () => {
        const v = state.cfg.verticais.find((x) => x.id === segmento.value) || focoSeg[0];
        const exemplo = { ...EXEMPLO, tipo: (v.tipos || [])[0] || EXEMPLO.tipo };
        previa.textContent = preencher(caixa.value, exemplo);
    };
    caixa.addEventListener('input', pintar);
    segmento.addEventListener('change', pintar);
    const inserir = (k) => {
        const i = caixa.selectionStart ?? caixa.value.length;
        caixa.value = `${caixa.value.slice(0, i)}{${k}}${caixa.value.slice(i)}`;
        caixa.focus();
        pintar();
    };
    const guardar = async () => {
        const body = { nome: nome.value, segmento_id: segmento.value, texto: caixa.value };
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
        campo('Nome do modelo', nome), campo('Para', segmento), campo('Texto', caixa),
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
        h('div', { class: 'foco-card-top' }, h('strong', {}, m.nome), h('span', { class: 'foco-chip' }, base ? 'Base' : seg(m.segmento_id))),
        h('p', { class: 'foco-pre foco-meta' }, m.texto),
        h('div', { class: 'foco-acoes' },
            base
                ? h('button', { type: 'button', class: 'btn-secondary', onclick: () => editorModelo({ nome: `${m.nome} (cópia)`, texto: m.texto }) }, 'Copiar e adaptar')
                : (state.me.papel === 'admin' || m.criado_por === state.me.id)
                    && h('button', { type: 'button', class: 'btn-secondary', onclick: () => editorModelo(m) }, 'Editar'),
            !base && m.autor && h('span', { class: 'foco-meta' }, `por ${m.autor}`)));
    render(
        h('p', { class: 'foco-meta' }, 'Os marcadores ({nome}, {gancho}, {dor}, {link}…) são preenchidos com os dados de cada contacto e do seu segmento. A mensagem pode sempre ser ajustada antes de enviar. Em Resultados vê qual modelo abre mais conversas.'),
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
