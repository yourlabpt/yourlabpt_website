/**
 * The studio: a diagram or a workflow, full page, edited by its parts.
 *
 * Every edit is a text edit (window.ArtefactEdit) on the same draft the Artefactos editor
 * keeps, so closing the studio loses nothing and «Guardar» is the same save — pull,
 * write, commit, push. The code is one tap away from each node: its folder, its files,
 * the map the imports draw, and a proposal that changes it when the drawing changes.
 */
(function initArtefactStudio() {
  const E = () => window.ArtefactEdit;
  const ws = () => window.WorkspaceUI.studio;
  function kit() { return window.IosKit; }
  function esc(value) { return kit().escapeHtml(value); }
  function icon(name, size = 18) { return kit().icon(name, size); }
  function api(path, options) { return window.apiRequest(`/${encodeURIComponent(ws().projectId())}${path}`, options); }

  const st = {
    open: false, path: '', kind: '', text: '', saved: '', history: [], tab: 'draw', selected: '',
    zoom: { k: 1, x: 0, y: 0 }, fitted: false, map: null, mapError: '', file: null,
    proposal: null, proposing: false, writing: false, saving: false, renderSeq: 0, sheet: false,
    consequences: null,
  };

  const isDiagram = () => st.kind === 'diagram';
  const parsed = () => E().parseFlowchart(st.text);
  const dirty = () => st.text !== st.saved;

  /* ------------------------------------------------------------ open, edit, save */

  function open(path) {
    const ctx = ws().context(path);
    if (!ctx) return;
    Object.assign(st, {
      open: true, path, kind: /\.mmd$/.test(path) ? 'diagram' : 'workflow', text: ctx.text, saved: ctx.saved,
      history: [], tab: 'draw', selected: '', zoom: { k: 1, x: 0, y: 0 }, fitted: false, file: null,
      proposal: null, proposing: false, writing: false, saving: false, sheet: false, consequences: null,
    });
    if (isDiagram() && !parsed().editable) st.tab = 'text';
    document.body.classList.add('av-stage-open');
    document.addEventListener('keydown', keys, true);
    paint();
    loadMap();
  }

  function close() {
    if (!st.open) return;
    st.open = false;
    document.getElementById('artefactStudio')?.remove();
    document.body.classList.remove('av-stage-open');
    document.removeEventListener('keydown', keys, true);
    ws().refresh();
  }

  /** Every change goes through here: history, the shared draft, a repaint. */
  function edit(next, { keepSelection = true } = {}) {
    if (next === st.text) return;
    st.history.push(st.text);
    if (st.history.length > 100) st.history.shift();
    st.text = next;
    ws().setDraft(st.path, next === st.saved ? null : next);
    if (!keepSelection) st.selected = '';
    paint();
  }

  function undo() {
    const previous = st.history.pop();
    if (previous === undefined) return;
    st.text = previous;
    ws().setDraft(st.path, previous === st.saved ? null : previous);
    paint();
  }

  async function save() {
    if (!dirty() || st.saving) return;
    st.saving = true;
    paint();
    const diff = await ws().save(st.path, st.text);
    st.saving = false;
    if (diff !== null) {
      st.saved = st.text;
      st.history = [];
      // A saved change to a linked drawing is the moment to bring the code along.
      if (diff && E().codeLinksOf(st.path, st.text).length) st.proposal = { pendingDiff: diff };
    }
    paint();
  }

  function keys(event) {
    if (!st.open) return;
    const typing = event.target?.matches?.('input, textarea, select');
    if (event.key === 'Escape' && !typing) { event.stopPropagation(); if (st.selected) { st.selected = ''; paint(); } else close(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) { event.preventDefault(); undo(); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !typing && st.selected && isDiagram()) {
      event.preventDefault();
      edit(E().removeNode(st.text, st.selected), { keepSelection: false });
    }
  }

  /* ------------------------------------------------------------ the code side */

  async function loadMap(refresh = false) {
    if (st.map && !refresh) return;
    try {
      const response = await api(`/workspace/code-map${refresh ? '?refresh=1' : ''}`);
      st.map = response.map;
      st.mapError = '';
    } catch (error) {
      st.mapError = error.message;
    }
    if (st.open) paint();
  }

  function comparison() {
    return st.map && isDiagram() ? E().compareWithCode(parsed(), st.map.modules) : null;
  }

  function filesOf(path) {
    if (!st.map || !path) return [];
    return Object.entries(st.map.filesByModule || {})
      .flatMap(([, files]) => files)
      .filter((file) => file === path || file.startsWith(`${path}/`));
  }

  async function openFile(filePath) {
    st.file = { path: filePath, content: '', loading: true };
    paint();
    try {
      const response = await api(`/repository/file?path=${encodeURIComponent(filePath)}`);
      st.file = { path: filePath, content: response.content, truncated: response.truncated };
    } catch (error) {
      st.file = { path: filePath, content: '', error: error.message };
    }
    paint();
  }

  async function propose(nodeId, request, diff = '') {
    st.proposing = true;
    st.proposal = { nodeId, request };
    paint();
    try {
      const outcome = await api('/packs/code_from_artefact', {
        method: 'POST',
        body: { path: st.path, nodeId, request, diff },
      });
      st.proposal = { nodeId, request, outcome };
    } catch (error) {
      window.showToast?.(error.message, 'error');
      st.proposal = null;
    } finally {
      st.proposing = false;
      paint();
    }
  }

  async function writeProposal() {
    const outcome = st.proposal?.outcome;
    if (!outcome?.result?.files?.length || st.writing) return;
    st.writing = true;
    paint();
    try {
      const response = await api('/repository/code-from-artefact', {
        method: 'POST',
        body: { path: st.path, nodeId: st.proposal.nodeId || '', files: outcome.result.files.map(({ path, content }) => ({ path, content })) },
      });
      const git = response.git;
      window.showToast?.(git?.pushed ? `Código escrito e enviado (${git.commit}).`
        : git?.committed ? `Código com commit ${git.commit}; ${git.message}`
          : `Código escrito em ${response.written.length} ficheiro(s).`, git?.committed && !git?.pushed ? 'warn' : 'ok');
      window.WorkspaceUI.reportOutcome(outcome.runId, 'accepted');
      st.consequences = { files: outcome.result.files.map(({ path, diff, content }) => ({ path, diff: diff || content.slice(0, 2000) })), check: null, checking: false };
      st.proposal = null;
      st.map = null;
      loadMap(true);
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      st.writing = false;
      paint();
    }
  }

  /* ------------------------------------------------------------ painting */

  function head() {
    const k = kit();
    const tabs = isDiagram()
      ? [['draw', 'Diagrama'], ['code', 'Código'], ['text', 'Texto']]
      : [['draw', 'Passos'], ['flow', 'Fluxo'], ['text', 'Texto']];
    const flow = isDiagram() ? parsed() : null;
    return `
      <header class="av-stage-head st-head">
        <button type="button" class="btn ios-round" data-st="close" aria-label="Fechar">${icon('close')}</button>
        <div class="av-stage-title">
          <p class="av-kicker">${isDiagram() ? 'Diagrama' : 'Workflow'} · estúdio</p>
          <h2>${esc(isDiagram() ? (flow.title || st.path.split('/').pop()) : (E().parseWorkflow(st.text).title || 'Workflow'))}</h2>
        </div>
        <div class="ios-segmented st-tabs" role="tablist">${tabs.map(([id, label]) => `
          <button type="button" class="ios-segment ${st.tab === id ? 'is-active' : ''}" data-st-tab="${id}">${label}</button>`).join('')}</div>
        <button type="button" class="btn ios-round" data-st="undo" ${st.history.length ? '' : 'disabled'} aria-label="Desfazer" title="Desfazer (⌘Z)">↶</button>
        ${dirty() ? k.badge('amber', 'não guardado') : ''}
        <button type="button" class="btn primary" data-st="save" ${dirty() && !st.saving ? '' : 'disabled'}>${st.saving ? 'A guardar…' : 'Guardar'}</button>
      </header>`;
  }

  function nodeInspector(flow, cmp) {
    const node = flow.nodes.find((entry) => entry.id === st.selected);
    if (!node) return '';
    const k = kit();
    const out = flow.edges.filter((edge) => edge.from === node.id);
    const incoming = flow.edges.filter((edge) => edge.to === node.id);
    const info = cmp?.nodes.find((entry) => entry.id === node.id);
    const link = flow.links[node.id] || '';
    const files = filesOf(link);
    const others = flow.nodes.filter((entry) => entry.id !== node.id);
    const modules = st.map?.modules || [];
    const proposalHere = st.proposal && (st.proposal.nodeId === node.id);
    return `
      <div class="st-sheet-grip" aria-hidden="true"></div>
      <section class="st-block">
        <label class="st-field"><span>Nome</span><input class="ios-input" data-st-label value="${esc(node.label)}" /></label>
        <p class="st-id">id <code>${esc(node.id)}</code></p>
      </section>
      <section class="st-block">
        <h3 class="av-label">Ligações</h3>
        <div class="ios-list">
          ${out.map((edge) => `<div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">→ ${esc(flow.nodes.find((n) => n.id === edge.to)?.label || edge.to)}</span>${edge.label ? `<span class="ios-row-sub">${esc(edge.label)}</span>` : ''}</span><button type="button" class="btn tiny" data-st-unlink="${esc(edge.from)}|${esc(edge.to)}" aria-label="Remover ligação">×</button></div>`).join('')}
          ${incoming.map((edge) => `<div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">← ${esc(flow.nodes.find((n) => n.id === edge.from)?.label || edge.from)}</span>${edge.label ? `<span class="ios-row-sub">${esc(edge.label)}</span>` : ''}</span><button type="button" class="btn tiny" data-st-unlink="${esc(edge.from)}|${esc(edge.to)}" aria-label="Remover ligação">×</button></div>`).join('')}
          ${!out.length && !incoming.length ? '<p class="av-empty st-pad">Sem ligações.</p>' : ''}
        </div>
        <form class="st-inline" data-st-connect>
          <select class="ios-input" name="to">${others.map((entry) => `<option value="${esc(entry.id)}">${esc(entry.label)}</option>`).join('')}</select>
          <input class="ios-input" name="label" placeholder="texto (opcional)" />
          <button type="submit" class="btn" ${others.length ? '' : 'disabled'}>Ligar</button>
        </form>
        <form class="st-inline" data-st-child>
          <input class="ios-input" name="label" placeholder="Novo nó ligado a este" required />
          <button type="submit" class="btn">+ Nó</button>
        </form>
      </section>
      <section class="st-block">
        <h3 class="av-label">Código ligado</h3>
        ${link ? `<p class="st-link">${info?.state === 'missing' ? k.badge('red', 'pasta não existe') : k.badge('green', 'ligado')} <code>${esc(link)}</code> <button type="button" class="btn tiny" data-st-setlink="">Desligar</button></p>` : '<p class="av-empty">Este nó ainda não aponta para o código.</p>'}
        ${!link && info?.suggestion ? `<button type="button" class="btn tiny primary" data-st-setlink="${esc(info.suggestion)}">Ligar a ${esc(info.suggestion)}</button>` : ''}
        <form class="st-inline" data-st-linkform>
          <input class="ios-input" name="path" list="stModules" placeholder="pasta, ex.: src/auth" value="${esc(link)}" />
          <datalist id="stModules">${modules.map((entry) => `<option value="${esc(entry.name)}"></option>`).join('')}</datalist>
          <button type="submit" class="btn">Ligar</button>
        </form>
        ${files.length ? `<div class="ios-list st-files">${files.slice(0, 20).map((file) => `<button type="button" class="ios-row" data-st-file="${esc(file)}"><span class="ios-row-main"><span class="ios-row-title">${esc(file.split('/').pop())}</span><span class="ios-row-sub">${esc(file)}</span></span>${icon('chevron', 14)}</button>`).join('')}</div>` : ''}
        ${link ? `
          <form class="st-ask" data-st-propose>
            <textarea class="ios-input" name="request" placeholder="O que mudar no código deste nó — ex.: acrescenta o envio de SMS">${esc(proposalHere ? st.proposal.request || '' : '')}</textarea>
            <button type="submit" class="btn primary" ${st.proposing ? 'disabled' : ''}>${st.proposing && proposalHere ? 'A preparar…' : `${icon('sparkle', 14)} Propor mudança no código`}</button>
          </form>` : ''}
        ${proposalHere ? proposalView() : ''}
      </section>
      <section class="st-block">
        <button type="button" class="btn st-danger" data-st-remove>Apagar nó</button>
      </section>`;
  }

  function proposalView() {
    const outcome = st.proposal?.outcome;
    if (!outcome) return '';
    const files = outcome.result?.files || [];
    return `
      <div class="st-proposal">
        <div class="av-ai-note">${icon('sparkle', 16)}<span><strong>Proposta · por rever.</strong> ${esc(outcome.result?.summary || '')}</span></div>
        ${window.ArtefactViews.promptFold(outcome)}
        ${files.length ? files.map((file) => `
          <details class="ios-fold" open>
            <summary class="ios-row"><span class="ios-row-main"><span class="ios-row-title">${esc(file.path)}</span></span></summary>
            <pre class="ios-code">${esc(file.diff || file.content)}</pre>
          </details>`).join('') : '<p class="av-empty">Sem alterações ao código.</p>'}
        ${outcome.dropped ? `<p class="ios-footnote">${outcome.dropped} ficheiro(s) fora das pastas ligadas foram recusados.</p>` : ''}
        <div class="ios-card-actions">
          ${files.length ? `<button type="button" class="btn primary" data-st="write-code" ${st.writing ? 'disabled' : ''}>${st.writing ? 'A escrever…' : 'Escrever, commit e push'}</button>` : ''}
          <button type="button" class="btn" data-st="drop-proposal">Descartar</button>
        </div>
      </div>`;
  }

  /**
   * After code was written: every other artefact linked to the folders that changed
   * (read from the files, no AI), and — on request — whether they still say the same.
   */
  function linkedArtefacts(paths) {
    const snap = ws().snapshot();
    if (!snap) return [];
    const covers = (link) => paths.some((filePath) => filePath === link || filePath.startsWith(`${link}/`));
    const out = [];
    for (const diagram of snap.diagrams || []) {
      const flow = E().parseFlowchart(diagram.source || '');
      const nodes = Object.entries(flow.links).filter(([, link]) => covers(link))
        .map(([id]) => flow.nodes.find((node) => node.id === id)?.label || id);
      if (nodes.length) out.push({ path: diagram.file, title: diagram.title, detail: `nó(s): ${nodes.join(', ')}` });
    }
    for (const workflow of snap.workflows || []) {
      const code = E().parseWorkflow(workflow.text || '').code.filter(covers);
      if (code.length) out.push({ path: workflow.file, title: workflow.title, detail: `ligado a ${code.join(', ')}` });
    }
    return out;
  }

  async function checkConsequences() {
    const c = st.consequences;
    if (!c || c.checking) return;
    c.checking = true;
    paint();
    try {
      c.check = await api('/packs/sync_back', { method: 'POST', body: { changes: c.files.slice(0, 4) } });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      c.checking = false;
      paint();
    }
  }

  function consequencesCard() {
    const c = st.consequences;
    if (!c) return '';
    const linked = linkedArtefacts(c.files.map((file) => file.path)).filter((entry) => entry.path !== st.path);
    const proposals = c.check?.result?.proposals || [];
    return `
      <section class="st-block st-consequences">
        <h3 class="av-label">Consequências do código escrito</h3>
        <p class="ios-footnote">${c.files.map((file) => `<code>${esc(file.path)}</code>`).join(', ')}</p>
        <div class="ios-list">
          ${linked.length ? linked.map((entry) => `
            <button type="button" class="ios-row" data-st-open="${esc(entry.path)}">
              <span class="ios-row-main"><span class="ios-row-title">${esc(entry.title)}</span><span class="ios-row-sub">${esc(entry.detail)}</span></span>
              ${icon('chevron', 14)}
            </button>`).join('') : '<p class="av-empty st-pad">Nenhum outro artefacto está ligado a estas pastas.</p>'}
        </div>
        ${c.check ? `
          ${window.ArtefactViews.promptFold(c.check)}
          ${proposals.length ? `<div class="ios-list">${proposals.map((entry) => `
            <button type="button" class="ios-row" data-st-open="${esc(entry.path)}">
              <span class="ios-row-main"><span class="ios-row-title">${esc(entry.path)}</span><span class="ios-row-sub ios-wrap">${esc(entry.suggestion || entry.why || '')}</span></span>
              ${icon('chevron', 14)}
            </button>`).join('')}</div>` : `<p class="av-empty">${esc(c.check.result?.summary || 'Os artefactos continuam a dizer o que o código faz.')}</p>`}` : ''}
        <div class="ios-card-actions">
          ${c.check ? '' : `<button type="button" class="btn primary" data-st="check-consequences" ${c.checking ? 'disabled' : ''}>${c.checking ? 'A comparar…' : `${icon('sparkle', 14)} Os artefactos ainda dizem o mesmo?`}</button>`}
          <button type="button" class="btn" data-st="drop-consequences">Fechar</button>
        </div>
      </section>`;
  }

  /** After a save of a linked drawing: bring the code along, or not — and its answer. */
  function pendingCard() {
    if (st.proposal && !st.proposal.nodeId && !st.proposal.pendingDiff) {
      return st.proposal.outcome ? proposalView() : (st.proposing ? '<p class="av-empty">A preparar a mudança no código…</p>' : '');
    }
    if (!st.proposal?.pendingDiff) return '';
    return `
      <div class="st-pending">
        <span>${isDiagram() ? 'O diagrama mudou' : 'O workflow mudou'} e está ligado ao código.</span>
        <button type="button" class="btn primary" data-st="propose-diff" ${st.proposing ? 'disabled' : ''}>${st.proposing ? 'A preparar…' : 'Propor a mudança no código'}</button>
        <button type="button" class="btn" data-st="drop-proposal">Agora não</button>
      </div>`;
  }

  function diagramBody() {
    const flow = parsed();
    const cmp = comparison();
    if (st.tab === 'text') return textBody();
    if (st.tab === 'code') return codeBody(cmp);
    const inspector = st.selected ? nodeInspector(flow, cmp) : `
      <section class="st-block">
        <p class="av-empty">Toque num nó para o editar e ver o seu código.</p>
        <form class="st-inline" data-st-child>
          <input class="ios-input" name="label" placeholder="Nome do novo nó" required />
          <button type="submit" class="btn">+ Nó</button>
        </form>
        ${cmp ? `<p class="ios-footnote">${cmp.nodes.filter((n) => n.state === 'linked').length} de ${cmp.nodes.length} nós ligados ao código${cmp.undrawn.length ? ` · ${cmp.undrawn.length} módulo(s) do código sem nó (separador Código)` : ''}.</p>` : (st.mapError ? `<p class="ios-footnote">Mapa do código: ${esc(st.mapError)}</p>` : '<p class="ios-footnote">A ler o código…</p>')}
      </section>`;
    return `
      <div class="st-work">
        <div class="st-canvas" data-st-canvas>
          <div class="st-stage" data-st-stagebox><p class="av-empty st-pad">A desenhar…</p></div>
          <p class="st-error" hidden></p>
          <div class="st-float">
            <button type="button" class="btn ios-round" data-st-zoom="out" aria-label="Reduzir">−</button>
            <button type="button" class="btn" data-st-zoom="fit">Ajustar</button>
            <button type="button" class="btn ios-round" data-st-zoom="in" aria-label="Ampliar">+</button>
            ${flow.editable ? `<button type="button" class="btn" data-st-dir title="Direcção">${flow.direction === 'LR' ? '↔' : '↕'}</button>` : ''}
          </div>
        </div>
        <aside class="st-inspector ${st.selected ? 'has-node' : ''}">${consequencesCard()}${pendingCard()}${inspector}</aside>
      </div>
      ${st.file ? fileView() : ''}`;
  }

  function codeBody(cmp) {
    const k = kit();
    if (!st.map) return `<div class="st-scroll"><p class="av-empty st-pad">${st.mapError ? esc(st.mapError) : 'A ler o código…'}</p></div>`;
    const unlinked = cmp.nodes.filter((n) => n.state === 'unlinked');
    const missing = cmp.nodes.filter((n) => n.state === 'missing');
    const suggestions = unlinked.filter((n) => n.suggestion);
    return `
      <div class="st-work">
        <div class="st-canvas" data-st-canvas>
          <div class="st-stage" data-st-stagebox data-st-source="code"><p class="av-empty st-pad">A desenhar…</p></div>
          <div class="st-float">
            <button type="button" class="btn ios-round" data-st-zoom="out" aria-label="Reduzir">−</button>
            <button type="button" class="btn" data-st-zoom="fit">Ajustar</button>
            <button type="button" class="btn ios-round" data-st-zoom="in" aria-label="Ampliar">+</button>
          </div>
        </div>
        <aside class="st-inspector">
          <section class="st-block">
            <h3 class="av-label">O código, lido dos imports</h3>
            <p class="ios-footnote">${st.map.modules.length} módulos · ${st.map.edges.length} dependências · ${st.map.readFiles} ficheiros lidos${st.map.truncated ? ' (cortado)' : ''}. <button type="button" class="btn tiny" data-st="reload-map">Ler de novo</button></p>
          </section>
          <section class="st-block">
            <h3 class="av-label">No código, sem nó · ${cmp.undrawn.length}</h3>
            ${cmp.undrawn.length ? `<div class="ios-list">${cmp.undrawn.map((name) => `<div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">${esc(name)}</span></span><button type="button" class="btn tiny" data-st-draw="${esc(name)}">Desenhar</button></div>`).join('')}</div>` : '<p class="av-empty">Todos os módulos estão no diagrama.</p>'}
          </section>
          <section class="st-block">
            <h3 class="av-label">Nós sem código · ${unlinked.length}</h3>
            ${suggestions.length > 1 ? `<button type="button" class="btn tiny primary" data-st="link-all">Ligar as ${suggestions.length} sugestões</button>` : ''}
            ${unlinked.length ? `<div class="ios-list">${unlinked.map((n) => `<div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">${esc(n.label)}</span>${n.suggestion ? `<span class="ios-row-sub">parece ${esc(n.suggestion)}</span>` : ''}</span>${n.suggestion ? `<button type="button" class="btn tiny" data-st-linknode="${esc(n.id)}|${esc(n.suggestion)}">Ligar</button>` : `<button type="button" class="btn tiny" data-st-pick="${esc(n.id)}">Escolher</button>`}</div>`).join('')}</div>` : '<p class="av-empty">Todos os nós apontam para o código.</p>'}
          </section>
          ${missing.length ? `<section class="st-block"><h3 class="av-label">Ligados a pastas que não existem · ${missing.length}</h3><div class="ios-list">${missing.map((n) => `<div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">${esc(n.label)}</span><span class="ios-row-sub">${esc(n.path)}</span></span>${k.badge('red', 'em falta')}</div>`).join('')}</div></section>` : ''}
          <section class="st-block">
            <button type="button" class="btn" data-st="map-as-diagram">Criar um diagrama a partir do código</button>
          </section>
        </aside>
      </div>`;
  }

  function textBody() {
    return `
      <div class="st-scroll st-textwrap">
        <textarea class="ios-editor-text st-text" data-st-text spellcheck="false">${esc(st.text)}</textarea>
        <p class="ios-footnote">O ficheiro tal como fica no repositório. ⌘S guarda.</p>
      </div>`;
  }

  function workflowBody() {
    if (st.tab === 'text') return textBody();
    const flow = E().parseWorkflow(st.text);
    if (st.tab === 'flow') {
      return `
        <div class="st-work">
          <div class="st-canvas" data-st-canvas>
            <div class="st-stage" data-st-stagebox data-st-source="flow"><p class="av-empty st-pad">A desenhar…</p></div>
            <div class="st-float">
              <button type="button" class="btn ios-round" data-st-zoom="out">−</button>
              <button type="button" class="btn" data-st-zoom="fit">Ajustar</button>
              <button type="button" class="btn ios-round" data-st-zoom="in">+</button>
            </div>
          </div>
        </div>`;
    }
    const modules = st.map?.modules || [];
    const proposal = st.proposal && !st.proposal.nodeId ? st.proposal : null;
    return `
      <div class="st-scroll">
        <div class="st-steps-page">
          ${consequencesCard()}
          ${pendingCard()}
          <label class="st-field st-title"><span>Título</span><input class="ios-input" data-wf-title value="${esc(flow.title)}" /></label>
          <ol class="st-steps">${flow.steps.map((step, index) => `
            <li class="st-step">
              <span class="st-step-n">${index + 1}</span>
              <textarea class="ios-input st-step-text" data-wf-step="${index}" rows="2">${esc(step)}</textarea>
              <div class="st-step-tools">
                <button type="button" class="btn tiny" data-wf-move="${index}|-1" ${index ? '' : 'disabled'} aria-label="Subir">↑</button>
                <button type="button" class="btn tiny" data-wf-move="${index}|1" ${index < flow.steps.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button>
                <button type="button" class="btn tiny" data-wf-insert="${index}" aria-label="Passo a seguir">+</button>
                <button type="button" class="btn tiny" data-wf-delete="${index}" aria-label="Apagar passo">×</button>
              </div>
            </li>`).join('')}</ol>
          <button type="button" class="btn" data-wf-insert="${flow.steps.length - 1}">+ Passo</button>
          <section class="st-block">
            <h3 class="av-label">Código ligado</h3>
            <div class="av-chips">${flow.code.map((path) => `<span class="ios-chip">${esc(path)} <button type="button" class="st-chip-x" data-wf-uncode="${esc(path)}" aria-label="Desligar">×</button></span>`).join('') || '<span class="av-empty">Ainda sem pastas ligadas.</span>'}</div>
            <form class="st-inline" data-wf-code>
              <input class="ios-input" name="path" list="stModulesWf" placeholder="pasta, ex.: src/auth" />
              <datalist id="stModulesWf">${modules.map((entry) => `<option value="${esc(entry.name)}"></option>`).join('')}</datalist>
              <button type="submit" class="btn">Ligar</button>
            </form>
            ${flow.code.length ? `
              <form class="st-ask" data-st-propose>
                <textarea class="ios-input" name="request" placeholder="O que mudar no código para seguir este workflow">${esc(proposal?.request || '')}</textarea>
                <button type="submit" class="btn primary" ${st.proposing ? 'disabled' : ''}>${st.proposing ? 'A preparar…' : `${icon('sparkle', 14)} Propor mudança no código`}</button>
              </form>` : ''}
          </section>
        </div>
      </div>`;
  }

  function fileView() {
    return `
      <div class="st-file">
        <header class="st-file-head"><code>${esc(st.file.path)}</code><button type="button" class="btn ios-round" data-st="close-file" aria-label="Fechar">${icon('close', 16)}</button></header>
        ${st.file.loading ? '<p class="av-empty st-pad">A ler…</p>' : st.file.error ? `<p class="av-empty st-pad">${esc(st.file.error)}</p>` : `<pre class="ios-code st-file-code">${esc(st.file.content)}</pre>`}
      </div>`;
  }

  function paint() {
    if (!st.open) return;
    let host = document.getElementById('artefactStudio');
    if (!host) {
      host = document.createElement('div');
      host.id = 'artefactStudio';
      host.className = 'av-stage st-studio';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-modal', 'true');
      document.body.appendChild(host);
    }
    // Keep the caret of whatever field was being typed in.
    const active = document.activeElement;
    const focusKey = active && host.contains(active) ? ['data-st-label', 'data-wf-title', 'data-wf-step', 'data-st-text'].find((attr) => active.hasAttribute(attr)) : '';
    const focusValue = focusKey ? active.getAttribute(focusKey) : '';
    const caret = focusKey ? [active.selectionStart, active.selectionEnd] : null;
    const scroll = host.querySelector('.st-inspector, .st-scroll')?.scrollTop || 0;
    host.innerHTML = `${head()}<div class="st-body">${isDiagram() ? diagramBody() : workflowBody()}</div>`;
    host.querySelector('.st-inspector, .st-scroll')?.scrollTo?.(0, scroll);
    if (focusKey) {
      const again = host.querySelector(`[${focusKey}${focusValue ? `="${focusValue}"` : ''}]`);
      if (again) { again.focus(); if (caret && again.setSelectionRange) again.setSelectionRange(...caret); }
    }
    drawCanvas();
  }

  /* ------------------------------------------------------------ the canvas */

  async function drawCanvas() {
    const box = document.querySelector('#artefactStudio [data-st-stagebox]');
    if (!box) return;
    const source = box.dataset.stSource === 'code' ? st.map?.mermaid
      : box.dataset.stSource === 'flow' ? window.ArtefactViews.flowchartFrom('', E().parseWorkflow(st.text).steps)
        : st.text;
    if (!source) return;
    const seq = ++st.renderSeq;
    try {
      const mermaid = await window.ensureMermaidLoaded();
      const { svg } = await mermaid.render(`st-${Date.now()}`, source.trim());
      if (seq !== st.renderSeq) return;
      box.innerHTML = svg;
      const node = box.querySelector('svg');
      const viewBox = node.viewBox?.baseVal;
      node.style.maxWidth = 'none';
      if (viewBox?.width) { node.setAttribute('width', viewBox.width); node.setAttribute('height', viewBox.height); }
      decorate(box, box.dataset.stSource);
      const error = document.querySelector('#artefactStudio .st-error');
      if (error) error.hidden = true;
      if (!st.fitted) { fit(); st.fitted = true; } else applyZoom();
      if (st.centerOn) { centerOn(st.centerOn); st.centerOn = ''; }
    } catch (error) {
      if (seq !== st.renderSeq) return;
      const note = document.querySelector('#artefactStudio .st-error');
      if (note) { note.textContent = String(error.message || error).split('\n').find((line) => /error/i.test(line)) || String(error.message || error).split('\n')[0]; note.hidden = false; }
    }
  }

  /** Marks each drawn node with its code state and the selection, and makes it tappable. */
  function decorate(box, source) {
    const cmp = source ? null : comparison();
    const states = new Map((cmp?.nodes || []).map((n) => [n.id, n.state]));
    box.querySelectorAll('g.node').forEach((group) => {
      const id = nodeIdOf(group);
      if (!id) return;
      group.classList.add('st-node');
      if (!source) {
        group.classList.toggle('st-selected', id === st.selected);
        const state = states.get(id);
        if (state) group.classList.add(`st-${state}`);
      }
    });
  }

  function nodeIdOf(group) {
    return group?.id?.match(/^flowchart-(.+)-\d+$/)?.[1] || '';
  }

  function stageBox() { return document.querySelector('#artefactStudio [data-st-stagebox]'); }

  function applyZoom() {
    const box = stageBox();
    if (box) box.style.transform = `translate(${st.zoom.x}px, ${st.zoom.y}px) scale(${st.zoom.k})`;
  }

  function fit() {
    const box = stageBox();
    const canvas = box?.parentElement;
    const svg = box?.querySelector('svg');
    if (!svg || !canvas) return;
    const w = Number(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
    const h = Number(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
    const cw = canvas.clientWidth - 32;
    const ch = canvas.clientHeight - 80;
    const k = Math.max(0.2, Math.min(2.5, cw / w, ch / h));
    st.zoom = { k, x: (canvas.clientWidth - w * k) / 2, y: Math.max(16, (canvas.clientHeight - h * k) / 2) };
    applyZoom();
  }

  /** Brings a node to the middle of what is visible of the canvas (the sheet covers the rest on a phone). */
  function centerOn(id) {
    const canvas = document.querySelector('#artefactStudio [data-st-canvas]');
    const group = [...(stageBox()?.querySelectorAll('g.node') || [])].find((entry) => nodeIdOf(entry) === id);
    if (!canvas || !group) return;
    const c = canvas.getBoundingClientRect();
    const n = group.getBoundingClientRect();
    st.zoom = { ...st.zoom, x: st.zoom.x + (c.left + c.width / 2) - (n.left + n.width / 2), y: st.zoom.y + (c.top + c.height / 2) - (n.top + n.height / 2) };
    applyZoom();
  }

  function zoomAt(factor, px, py) {
    const k = Math.min(6, Math.max(0.15, st.zoom.k * factor));
    st.zoom = { k, x: px - (px - st.zoom.x) * (k / st.zoom.k), y: py - (py - st.zoom.y) * (k / st.zoom.k) };
    applyZoom();
  }

  // One finger or the mouse pans; two fingers pinch; a tap without movement selects.
  const pointers = new Map();
  let gesture = null;
  document.addEventListener('pointerdown', (event) => {
    const canvas = event.target.closest?.('#artefactStudio [data-st-canvas]');
    if (!canvas || event.target.closest('.st-float')) return;
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = canvas.getBoundingClientRect();
    if (pointers.size === 1) {
      gesture = { type: 'pan', sx: event.clientX, sy: event.clientY, ox: st.zoom.x, oy: st.zoom.y, moved: false, target: event.target };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: st.zoom.k, ox: st.zoom.x, oy: st.zoom.y, mx: (a.x + b.x) / 2 - rect.left, my: (a.y + b.y) / 2 - rect.top, moved: true };
    }
  });
  document.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.type === 'pan' && pointers.size === 1) {
      const dx = event.clientX - gesture.sx;
      const dy = event.clientY - gesture.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) gesture.moved = true;
      st.zoom = { ...st.zoom, x: gesture.ox + dx, y: gesture.oy + dy };
      applyZoom();
    } else if (gesture.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const k = Math.min(6, Math.max(0.15, gesture.k * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d)));
      st.zoom = { k, x: gesture.mx - (gesture.mx - gesture.ox) * (k / gesture.k), y: gesture.my - (gesture.my - gesture.oy) * (k / gesture.k) };
      applyZoom();
    }
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (gesture?.type === 'pan' && !gesture.moved && pointers.size === 0) tap(gesture.target);
    if (!pointers.size) gesture = null;
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('wheel', (event) => {
    const canvas = event.target.closest?.('#artefactStudio [data-st-canvas]');
    if (!canvas) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(event.deltaY < 0 ? 1.1 : 0.9, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  function tap(target) {
    const box = stageBox();
    if (!box || box.dataset.stSource) return;
    const id = nodeIdOf(target?.closest?.('g.node'));
    if (!isDiagram() || !parsed().editable) return;
    st.selected = id || '';
    st.centerOn = id || '';
    st.file = null;
    paint();
  }

  /* ------------------------------------------------------------ wiring */

  document.addEventListener('click', (event) => {
    const host = document.getElementById('artefactStudio');
    if (!host || !host.contains(event.target)) return;
    const t = event.target;
    const action = t.closest('[data-st]')?.dataset.st;
    if (action === 'close') close();
    else if (action === 'undo') undo();
    else if (action === 'save') save();
    else if (action === 'close-file') { st.file = null; paint(); }
    else if (action === 'write-code') writeProposal();
    else if (action === 'drop-proposal') { window.WorkspaceUI.reportOutcome(st.proposal?.outcome?.runId, 'discarded'); st.proposal = null; paint(); }
    else if (action === 'check-consequences') checkConsequences();
    else if (action === 'drop-consequences') { st.consequences = null; paint(); }
    else if (action === 'propose-diff') propose('', '', st.proposal?.pendingDiff || '');
    else if (action === 'reload-map') { st.map = null; paint(); loadMap(true); }
    else if (action === 'link-all') {
      let text = st.text;
      for (const n of comparison().nodes) if (n.state === 'unlinked' && n.suggestion) text = E().setLink(text, n.id, n.suggestion);
      edit(text);
    } else if (action === 'map-as-diagram') {
      ws().newDraft('yourlab/diagrams/codigo.mmd', st.map.mermaid);
      close();
    }
    if (action) return;
    const tab = t.closest('[data-st-tab]')?.dataset.stTab;
    if (tab) { st.tab = tab; st.fitted = false; st.file = null; paint(); return; }
    const zoom = t.closest('[data-st-zoom]')?.dataset.stZoom;
    if (zoom) {
      const canvas = host.querySelector('[data-st-canvas]');
      if (zoom === 'fit') fit(); else zoomAt(zoom === 'in' ? 1.25 : 0.8, canvas.clientWidth / 2, canvas.clientHeight / 2);
      return;
    }
    if (t.closest('[data-st-dir]')) { edit(E().setDirection(st.text, parsed().direction === 'LR' ? 'TD' : 'LR')); st.fitted = false; paint(); return; }
    const unlink = t.closest('[data-st-unlink]')?.dataset.stUnlink;
    if (unlink) { const [from, to] = unlink.split('|'); edit(E().removeEdge(st.text, from, to)); return; }
    const setlink = t.closest('[data-st-setlink]');
    if (setlink) { edit(E().setLink(st.text, st.selected, setlink.dataset.stSetlink)); return; }
    const linknode = t.closest('[data-st-linknode]')?.dataset.stLinknode;
    if (linknode) { const [id, path] = linknode.split('|'); edit(E().setLink(st.text, id, path)); return; }
    const pick = t.closest('[data-st-pick]')?.dataset.stPick;
    if (pick) { st.tab = 'draw'; st.selected = pick; st.fitted = false; paint(); return; }
    const draw = t.closest('[data-st-draw]')?.dataset.stDraw;
    if (draw) {
      const added = E().addNode(st.text, draw.split('/').pop());
      edit(E().setLink(added.source, added.id, draw));
      return;
    }
    const openArtefact = t.closest('[data-st-open]')?.dataset.stOpen;
    if (openArtefact) { close(); ws().open(openArtefact); return; }
    const file = t.closest('[data-st-file]')?.dataset.stFile;
    if (file) { openFile(file); return; }
    if (t.closest('[data-st-remove]') && st.selected && window.confirm('Apagar este nó e as suas ligações?')) { edit(E().removeNode(st.text, st.selected), { keepSelection: false }); return; }
    // Workflow steps.
    const move = t.closest('[data-wf-move]')?.dataset.wfMove;
    if (move) {
      const [index, delta] = move.split('|').map(Number);
      const flow = E().parseWorkflow(st.text);
      const [step] = flow.steps.splice(index, 1);
      flow.steps.splice(index + delta, 0, step);
      edit(E().serializeWorkflow(flow));
      return;
    }
    const insert = t.closest('[data-wf-insert]')?.dataset.wfInsert;
    if (insert !== undefined) {
      const flow = E().parseWorkflow(st.text);
      flow.steps.splice(Number(insert) + 1, 0, 'Novo passo.');
      edit(E().serializeWorkflow(flow));
      requestAnimationFrame(() => { const field = document.querySelector(`[data-wf-step="${Number(insert) + 1}"]`); field?.focus(); field?.select(); });
      return;
    }
    const del = t.closest('[data-wf-delete]')?.dataset.wfDelete;
    if (del !== undefined) {
      const flow = E().parseWorkflow(st.text);
      flow.steps.splice(Number(del), 1);
      edit(E().serializeWorkflow(flow));
      return;
    }
    const uncode = t.closest('[data-wf-uncode]')?.dataset.wfUncode;
    if (uncode) { const flow = E().parseWorkflow(st.text); flow.code = flow.code.filter((path) => path !== uncode); edit(E().serializeWorkflow(flow)); }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form.closest?.('#artefactStudio')) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.matches('[data-st-connect]')) {
      edit(E().addEdge(st.text, st.selected, data.get('to'), String(data.get('label') || '').trim()));
    } else if (form.matches('[data-st-child]')) {
      const label = String(data.get('label') || '').trim();
      if (!label) return;
      const added = E().addNode(st.text, label, st.selected);
      st.selected = added.id;
      edit(added.source);
    } else if (form.matches('[data-st-linkform]')) {
      edit(E().setLink(st.text, st.selected, String(data.get('path') || '')));
    } else if (form.matches('[data-st-propose]')) {
      const request = String(data.get('request') || '').trim();
      if (request.length < 3) { window.showToast?.('Diga numa frase o que mudar.', 'error'); return; }
      propose(isDiagram() ? st.selected : '', request);
    } else if (form.matches('[data-wf-code]')) {
      const path = String(data.get('path') || '').trim().replace(/^\/+|\/+$/g, '');
      if (!path) return;
      const flow = E().parseWorkflow(st.text);
      if (!flow.code.includes(path)) flow.code.push(path);
      edit(E().serializeWorkflow(flow));
    }
  });

  // Typing edits text in place; the drawing follows after a short pause.
  let typingTimer = null;
  document.addEventListener('input', (event) => {
    const field = event.target;
    if (!field.closest?.('#artefactStudio')) return;
    const apply = (next) => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => edit(next), 350);
    };
    if (field.hasAttribute('data-st-text')) apply(field.value);
    else if (field.hasAttribute('data-st-label')) apply(E().renameNode(st.text, st.selected, field.value));
    else if (field.hasAttribute('data-wf-title')) { const flow = E().parseWorkflow(st.text); flow.title = field.value; apply(E().serializeWorkflow(flow)); }
    else if (field.hasAttribute('data-wf-step')) {
      const flow = E().parseWorkflow(st.text);
      flow.steps[Number(field.dataset.wfStep)] = field.value;
      apply(E().serializeWorkflow(flow));
    }
  });

  window.ArtefactStudio = { open, close, isOpen: () => st.open };
})();
