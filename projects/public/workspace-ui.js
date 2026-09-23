/**
 * The project's documentation, as its repository holds it (yourlab/ + openspec/specs).
 *
 * One place loads it, re-reads it and shows it: Resumo's «Documentação» card, the Plano
 * page and the mockup viewer all draw from the same snapshot, so nothing is shown in two
 * versions. The snapshot is built on the server by lib/workspace-format.js — the browser
 * never parses the files itself, so what one person sees is what everyone sees.
 */
(function initWorkspaceUi() {
  // An older read is refreshed on its own when the project is opened.
  const STALE_AFTER_MS = 10 * 60 * 1000;

  const state = {
    projectId: '',
    data: null,
    loading: false,
    syncing: false,
    initializing: false,
    changeRequestUrl: '',
    error: '',
    planoProject: null,
    requisitosProject: null,
  };
  const listeners = new Set();

  const PHASE_BADGE = {
    planned: ['gray', 'Planeada'],
    in_progress: ['green', 'Em curso'],
    done: ['gray', 'Concluída'],
  };

  function kit() { return window.IosKit; }
  function esc(value) { return kit().escapeHtml(value); }
  function icon(name, size = 18, extra = '') { return kit().icon(name, size, extra); }

  function canSync() { return window.isSuperAdmin?.() === true || window.isPartnerEditor?.() === true; }
  function canInitialize() { return window.isSuperAdmin?.() === true; }
  function isClient() { return window.isClientUser?.() === true; }

  function workspace() { return state.data?.workspace || null; }
  function snapshot() { return workspace()?.snapshot || null; }
  function forProject(projectId) { return state.projectId === projectId ? snapshot() : null; }

  function notify() {
    listeners.forEach((listener) => {
      try { listener(); } catch { /* one screen failing must not stop the others */ }
    });
    paintArtefactos();
    paintRequisitos();
  }

  /* ------------------------------------------------------------ reading */

  async function load(projectId, { autoSync = true } = {}) {
    if (!projectId) return;
    if (state.projectId !== projectId) {
      Object.assign(state, { projectId, data: null, error: '', changeRequestUrl: '', surveyed: null });
    }
    if (state.loading) return;
    state.loading = true;
    notify();
    try {
      state.data = await window.apiRequest(`/${encodeURIComponent(projectId)}/workspace`);
      state.error = '';
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      notify();
    }
    const current = workspace();
    const stale = !current || Date.now() - Date.parse(current.syncedAt || 0) > STALE_AFTER_MS;
    if (autoSync && stale && state.data?.hasRepository && canSync()) sync(projectId, { quiet: true });
  }

  async function sync(projectId = state.projectId, { quiet = false } = {}) {
    if (!projectId || state.syncing) return;
    state.syncing = true;
    notify();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(projectId)}/workspace/sync`, { method: 'POST', body: {} });
      if (state.projectId === projectId) {
        state.data = { ...(state.data || {}), hasRepository: true, workspace: response.workspace };
      }
      if (!quiet) window.showToast?.('Lido do repositório.', 'ok');
    } catch (error) {
      state.error = error.message;
      if (!quiet) window.showToast?.(error.message, 'error');
    } finally {
      state.syncing = false;
      notify();
    }
  }

  async function initialize(projectId = state.projectId) {
    if (!projectId || state.initializing) return;
    state.initializing = true;
    notify();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(projectId)}/workspace/initialize`, { method: 'POST', body: {} });
      if (response.local) {
        state.data = { ...(state.data || {}), hasRepository: true, workspace: response.workspace };
        window.showToast?.(`Pasta yourlab/ criada na cópia local (${response.files.length} ficheiros).`, 'ok');
      } else {
        const request = response.changeRequest || {};
        state.changeRequestUrl = request.url || request.html_url || request.webUrl || request.web_url || '';
        window.showToast?.('Pedido de alteração aberto no repositório. Aceite-o e toque em Actualizar.', 'ok');
      }
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.initializing = false;
      notify();
    }
  }

  /** Reads the existing code (repo-survey), so the folder can start from it. */
  async function survey(projectId = state.projectId) {
    if (!projectId || state.surveying) return;
    state.surveying = true;
    notify();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(projectId)}/survey`, { method: 'POST', body: {} });
      state.surveyed = response.survey;
      state.data = { ...(state.data || {}), surveyModules: (response.survey.modules || []).map((entry) => entry.name) };
      window.showToast?.(`Código levantado: ${response.survey.fileCount} ficheiros, ${response.survey.routes.length} rotas. Agora crie a pasta.`, 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.surveying = false;
      notify();
    }
  }

  /**
   * Where the project stands. The repository's project.md says so explicitly; without
   * it, the platform's own reading of its stages is the fallback.
   */
  function stageOf(projectId, fallback = null) {
    const flow = window.state?.config?.deliveryStageFlow || [];
    const id = forProject(projectId)?.project?.stage || '';
    const index = flow.findIndex((stage) => stage.id === id);
    if (id && index >= 0) return { id, index, total: flow.length };
    return fallback;
  }

  /* ------------------------------------------------------------ the mockup */

  function closeSheet() {
    document.getElementById('workspaceMockupSheet')?.remove();
  }

  function showSheet(url, current, screens) {
    closeSheet();
    const sheet = document.createElement('div');
    sheet.className = 'ios-sheet-backdrop';
    sheet.id = 'workspaceMockupSheet';
    sheet.innerHTML = `
      <div class="ios-sheet" role="dialog" aria-modal="true" aria-label="Mockup">
        <header class="ios-sheet-head">
          <span class="ios-card-title">Mockup</span>
          ${screens.length > 1 ? `<div class="ios-segmented" role="tablist">${screens.map((screen) => `
            <button type="button" role="tab" class="ios-segment ${screen.file === current ? 'is-active' : ''}" data-ws-screen="${esc(screen.file)}">${esc(screen.title)}</button>`).join('')}</div>` : ''}
          <button type="button" class="btn ios-round" data-ws-close aria-label="Fechar">${icon('close', 18)}</button>
        </header>
        <iframe class="ios-sheet-frame" sandbox="" referrerpolicy="no-referrer" title="Mockup" src="${esc(url)}"></iframe>
      </div>`;
    document.body.appendChild(sheet);
  }

  async function openMockup(screen) {
    const snap = snapshot();
    const screens = snap?.mockup?.screens || [];
    const file = screen || snap?.mockup?.entry || screens[0]?.file;
    if (!file) return;
    try {
      const { url } = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/mockup-link?screen=${encodeURIComponent(file)}`);
      showSheet(url, file, screens);
    } catch (error) {
      window.showToast?.(error.message, 'error');
    }
  }

  /* ------------------------------------------------------------ Resumo's card */

  function syncButton() {
    if (!canSync()) return '';
    return `<button type="button" class="btn" data-ws-action="sync" ${state.syncing ? 'disabled' : ''}>${icon('refresh', 16)}${state.syncing ? 'A ler…' : 'Actualizar'}</button>`;
  }

  function findingsFold(findings) {
    if (!findings.length) return '';
    return `
      <details class="ios-fold ios-findings">
        <summary>Ver avisos (${findings.length})</summary>
        <div class="ios-list ios-sublist">
          ${findings.map((finding) => `
            <div class="ios-row is-static">
              <span class="ios-tile ${finding.level === 'error' ? 'is-danger' : ''}">${icon(finding.level === 'info' ? 'help' : 'alert', 16)}</span>
              <span class="ios-row-main">
                <span class="ios-row-title">${esc(finding.file)}${finding.line ? `:${finding.line}` : ''}</span>
                <span class="ios-row-sub ios-wrap">${esc(finding.message)}</span>
              </span>
            </div>`).join('')}
        </div>
      </details>`;
  }

  /** The documentation's state, for people who can act on it. Clients see the content only. */
  function statusCard() {
    if (isClient()) {
      return snapshot()?.mockup?.screens?.length ? `
        <section class="ios-card ios-docs">
          <div class="ios-docs-head"><span class="ios-card-title">Mockup</span></div>
          <p class="ios-card-body">Os ecrãs da aplicação, como vão ficar.</p>
          <div class="ios-card-actions"><button type="button" class="btn primary" data-ws-action="mockup">${icon('image', 16)}Ver mockup</button></div>
        </section>` : '';
    }
    const k = kit();
    const current = workspace();
    const snap = snapshot();
    let sub = '';
    let badge = '';
    let body = '';
    const actions = [];

    if (state.loading && !state.data) {
      sub = 'A ler…';
    } else if (!state.data?.hasRepository) {
      body = 'Sem repositório ligado. Ligue um em Definições do projecto — é lá que o projecto passa a estar documentado.';
      actions.push('<button type="button" class="btn" data-ws-go="definicoes">Definições do projecto</button>');
    } else if (!snap?.initialized) {
      body = snap
        ? 'O repositório ainda não tem a pasta yourlab/. Crie-a a partir do que a plataforma já sabe, ou peça a qualquer AI que siga o GUIDE.md. Se o projecto já tem código, levante-o primeiro: o project.md e o diagrama de módulos saem dele.'
        : 'Ainda não foi lido do repositório.';
      if (canInitialize() && snap) {
        actions.push(state.surveyed
          ? k.badge('green', `Código levantado · ${state.surveyed.fileCount} ficheiros`)
          : `<button type="button" class="btn" data-ws-action="survey" ${state.surveying ? 'disabled' : ''}>${state.surveying ? 'A levantar…' : 'Levantar o código'}</button>`);
      }
      if (canInitialize()) {
        actions.push(`<button type="button" class="btn primary" data-ws-action="initialize" ${state.initializing ? 'disabled' : ''}>${state.initializing ? 'A abrir…' : 'Criar pasta yourlab'}</button>`);
      }
      actions.push(syncButton());
    } else {
      const errors = snap.findings.filter((finding) => finding.level === 'error').length;
      const warnings = snap.findings.filter((finding) => finding.level === 'warning').length;
      badge = errors
        ? k.badge('red', `${errors} erro${errors === 1 ? '' : 's'}`)
        : warnings ? k.badge('amber', `${warnings} aviso${warnings === 1 ? '' : 's'}`) : k.badge('green', 'Tudo legível');
      sub = [
        `lido ${k.ago(current.syncedAt)}`,
        current.source === 'local' ? 'cópia local' : `GitHub${current.ref ? ` · ${current.ref}` : ''}`,
        `${snap.files.length} ficheiros`,
      ].join(' · ');
      if (snap.mockup.screens.length) {
        actions.push(`<button type="button" class="btn primary" data-ws-action="mockup">${icon('image', 16)}Ver mockup</button>`);
      }
      actions.push(syncButton());
    }

    const link = state.changeRequestUrl
      ? `<a href="${esc(state.changeRequestUrl)}" target="_blank" rel="noopener noreferrer">Abrir o pedido de alteração</a>`
      : '';

    return `
      <section class="ios-card ios-docs">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Documentação</span>
            <span class="ios-row-sub">${esc(sub || 'yourlab/ no repositório')}</span>
          </span>
          ${badge}
        </div>
        ${body ? `<p class="ios-card-body">${esc(body)}</p>` : ''}
        ${actions.filter(Boolean).length ? `<div class="ios-card-actions">${actions.join('')}</div>` : ''}
        ${link}
        ${snap?.initialized ? findingsFold(snap.findings.filter((finding) => finding.level !== 'info')) : ''}
      </section>`;
  }

  /* ------------------------------------------------------------ the Plano page */

  function prose(text) {
    return text ? `<p class="ios-prose">${esc(text)}</p>` : '';
  }

  function staticRows(items) {
    return items.map((item) => `
      <div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title ios-wrap">${esc(item)}</span></span></div>`).join('');
  }

  /* ------------------------------------------------------------ Artefactos */

  // Where each file shows up in the list. Order is the order of the page.
  const GROUPS = [
    { label: 'Intenção', match: (p) => p === 'yourlab/project.md' || p === 'yourlab/ideas.md' },
    { label: 'Perguntas', match: (p) => p === 'yourlab/questions.md' },
    { label: 'Plano', match: (p) => p.startsWith('yourlab/phases/') },
    { label: 'Requisitos', match: (p) => p.startsWith('openspec/specs/') },
    { label: 'Arquitectura', match: (p) => p.startsWith('yourlab/diagrams/') },
    { label: 'Base de dados', match: (p) => p === 'yourlab/database.md' },
    { label: 'Workflows', match: (p) => p.startsWith('yourlab/workflows/') },
    { label: 'Mockup', match: (p) => p.startsWith('yourlab/mockup/') },
  ];

  const editor = { path: '', content: '', sha: '', loading: false, saving: false };
  let previewTimer = null;

  // The draft lives in this browser until Guardar writes the file.
  // ponytail: localStorage only; move it to the project record if you edit from two devices.
  const draftKey = (filePath) => `yourlab-draft:${state.projectId}:${filePath}`;
  function readDraft(filePath) {
    try { return localStorage.getItem(draftKey(filePath)); } catch { return null; }
  }
  function writeDraft(filePath, value) {
    try {
      if (value === null) localStorage.removeItem(draftKey(filePath));
      else localStorage.setItem(draftKey(filePath), value);
    } catch { /* private window: the editor still works, the draft just does not survive */ }
  }

  function fileLabel(filePath) {
    const spec = filePath.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
    if (spec) return spec[1];
    return filePath.split('/').pop();
  }

  async function openFile(filePath) {
    if (editor.path === filePath) return;
    Object.assign(editor, { path: filePath, content: '', sha: '', loading: true });
    paintArtefactos();
    try {
      const file = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file?path=${encodeURIComponent(filePath)}`);
      editor.content = file.content;
      editor.sha = file.sha;
    } catch (error) {
      window.showToast?.(error.message, 'error');
      editor.path = '';
    } finally {
      editor.loading = false;
      paintArtefactos();
    }
  }

  async function saveFile() {
    const field = document.getElementById('artefactText');
    if (!editor.path || editor.saving || !field) return;
    const content = field.value;
    editor.saving = true;
    paintArtefactos();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file`, {
        method: 'PUT',
        body: { path: editor.path, content, previousSha: editor.sha },
      });
      editor.content = content;
      editor.sha = response.sha;
      editor.lastEdit = { path: editor.path, diff: response.diff || '', task: response.task || null, ai: null, running: false };
      writeDraft(editor.path, null);
      state.data = { ...(state.data || {}), hasRepository: true, workspace: response.workspace };
      const where = response.changeRequest ? 'Pedido de alteração aberto no repositório.' : 'Guardado no repositório.';
      window.showToast?.(response.task ? `${where} Tarefa criada em Tarefas.` : where, 'ok');
      if (response.task) window.ResumeUI?.refresh?.();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      editor.saving = false;
      notify();
    }
  }

  function cancelEdit() {
    writeDraft(editor.path, null);
    paintArtefactos();
  }

  function artefactList(snap) {
    const k = kit();
    const paths = (snap?.files || []).map((file) => file.path).filter((filePath) => filePath !== 'yourlab/GUIDE.md');
    return GROUPS.map((group) => {
      const files = paths.filter(group.match);
      if (!files.length) return '';
      return `
        <section class="ios-section">
          <h2 class="ios-group-label">${esc(group.label)}</h2>
          <div class="ios-list">
            ${files.map((filePath) => `
              <button type="button" class="ios-row ${filePath === editor.path ? 'is-selected' : ''}" data-ws-file="${esc(filePath)}">
                <span class="ios-row-main">
                  <span class="ios-row-title">${esc(fileLabel(filePath))}</span>
                  <span class="ios-row-sub">${esc(filePath)}</span>
                </span>
                ${readDraft(filePath) === null ? '' : k.badge('amber', 'não guardado')}
              </button>`).join('')}
          </div>
        </section>`;
    }).join('');
  }

  function editorPane() {
    const k = kit();
    if (!editor.path) return '<div class="ios-card"><p class="ios-empty">Escolha um artefacto à esquerda.</p></div>';
    if (editor.loading) return '<div class="ios-card"><p class="ios-empty">A ler…</p></div>';
    const draft = readDraft(editor.path);
    const value = draft === null ? editor.content : draft;
    const dirty = value !== editor.content;
    return `
      <section class="ios-card ios-editor">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">${esc(fileLabel(editor.path))}</span>
            <span class="ios-row-sub">${esc(editor.path)}</span>
          </span>
          ${dirty ? k.badge('amber', 'não guardado') : ''}
        </div>
        <textarea id="artefactText" class="ios-editor-text" spellcheck="false" ${canSync() ? '' : 'readonly'}>${esc(value)}</textarea>
        <div class="ios-card-actions">
          <button type="button" class="btn primary" data-ws-action="save" ${editor.saving || !dirty ? 'disabled' : ''}>${editor.saving ? 'A guardar…' : 'Guardar'}</button>
          <button type="button" class="btn" data-ws-action="cancel" ${dirty ? '' : 'disabled'}>Cancelar</button>
        </div>
      </section>`;
  }

  /**
   * What the text looks like. A diagram renders with Mermaid, a mockup screen renders in
   * a sandbox with no scripts and nothing loaded from this page — the same rule the
   * served mockup follows. Both show the text being edited, saved or not.
   */
  function previewPane() {
    const filePath = editor.path;
    if (!filePath) return '';
    const isDiagram = filePath.endsWith('.mmd');
    const isScreen = filePath.endsWith('.html');
    if (!isDiagram && !isScreen) return '';
    return `
      <section class="ios-card ios-preview">
        <div class="ios-docs-head">
          <span class="ios-card-title">Pré-visualização</span>
          ${isScreen && snapshot()?.mockup?.screens?.length ? `<button type="button" class="btn" data-ws-action="mockup" data-ws-screen="${esc(filePath.split('/').pop())}">Abrir em grande</button>` : ''}
        </div>
        ${isDiagram
    ? '<div class="ios-preview-body" id="artefactDiagram">A desenhar…</div>'
    : '<iframe class="ios-preview-frame" id="artefactScreen" sandbox="" referrerpolicy="no-referrer" title="Ecrã"></iframe>'}
      </section>`;
  }

  /** Draws the preview after the pane exists, from whatever the editor is showing. */
  function paintPreview() {
    const filePath = editor.path;
    if (!filePath) return;
    const draft = readDraft(filePath);
    const text = draft === null ? editor.content : draft;

    const screen = document.getElementById('artefactScreen');
    if (screen) {
      screen.srcdoc = text;
      return;
    }
    const host = document.getElementById('artefactDiagram');
    if (!host) return;
    window.ensureMermaidLoaded?.().then((mermaid) => {
      // Mermaid throws on a half-written diagram; that is normal while typing.
      mermaid.render(`artefact-diagram-${Date.now()}`, text.trim())
        .then(({ svg }) => { host.innerHTML = svg; })
        .catch((error) => { host.innerHTML = `<p class="ios-empty">${esc(String(error.message || error).split('\n')[0])}</p>`; });
    }).catch(() => { host.innerHTML = '<p class="ios-empty">Mermaid não disponível.</p>'; });
  }

  /** After a save: the task it left, and — on request — what the AI says it affects. */
  function impactPane() {
    const k = kit();
    const last = editor.lastEdit;
    if (!last || last.path !== editor.path) return '';
    const result = last.ai?.result;
    const rows = result ? [
      ...result.artefacts.map((entry) => `
        <button type="button" class="ios-row" data-ws-file="${esc(entry.path)}">
          <span class="ios-row-main"><span class="ios-row-title">${esc(entry.path)}</span><span class="ios-row-sub ios-wrap">${esc(entry.why)}</span></span>
          ${k.icon('chevron', 14, 'ios-chevron')}
        </button>`),
      ...result.codeAreas.map((entry) => `
        <div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">${esc(entry.area)}</span><span class="ios-row-sub ios-wrap">${esc(entry.why)}</span></span>${k.badge('gray', 'código')}</div>`),
    ].join('') : '';
    return `
      <section class="ios-card">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Impacto desta alteração</span>
            <span class="ios-row-sub">${last.task ? `Tarefa criada: ${esc(last.task.title)}` : 'Sem tarefa: o texto não mudou.'}</span>
          </span>
          ${result ? k.badge('gray', 'IA · não aplicado') : ''}
        </div>
        ${result ? `
          ${result.summary ? `<p class="ios-card-body">${esc(result.summary)}</p>` : ''}
          ${rows ? `<div class="ios-list">${rows}</div>` : '<p class="ios-footnote">A IA não vê mais nada afectado.</p>'}
          ${last.ai.dropped ? `<p class="ios-footnote">${last.ai.dropped} caminho(s) inventado(s) foram descartados.</p>` : ''}` : ''}
        ${last.diff && canSync() ? `<div class="ios-card-actions"><button type="button" class="btn" data-ws-action="impact" ${last.running ? 'disabled' : ''}>${last.running ? 'A analisar…' : (result ? 'Analisar de novo' : 'Analisar impacto com IA')}</button></div>` : ''}
      </section>`;
  }

  async function runImpact() {
    const last = editor.lastEdit;
    if (!last?.diff || last.running) return;
    last.running = true;
    paintArtefactos();
    try {
      last.ai = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/impact`, {
        method: 'POST',
        body: { path: last.path, diff: last.diff },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      last.running = false;
      paintArtefactos();
    }
  }

  function paintArtefactos() {
    const host = document.getElementById('planoWorkspace');
    const project = state.planoProject;
    if (!host || !project || !kit()) return;
    const snap = forProject(project.id);
    const current = workspace();

    const head = `
      <header class="ios-page-head">
        <div>
          <h1 class="ios-large-title">Artefactos</h1>
          <p class="ios-subtitle">${esc(snap?.initialized
    ? `O projecto escrito no repositório · lido ${kit().ago(current?.syncedAt)}`
    : 'O projecto escrito no repositório, em yourlab/.')}</p>
        </div>
        <div class="ios-page-actions">${snap?.initialized ? syncButton() : ''}</div>
      </header>`;

    if (!snap?.initialized) {
      host.innerHTML = `${head}${statusCard()}`;
      return;
    }
    host.innerHTML = `
      ${head}
      <div class="ios-artefacts">
        <div class="ios-artefacts-list">${artefactList(snap)}</div>
        <div class="ios-artefacts-editor">${editorPane()}${impactPane()}${previewPane()}</div>
      </div>
      <p class="ios-footnote">Guardar escreve o ficheiro no repositório. As regras do formato estão em yourlab/GUIDE.md.</p>`;
    paintPreview();
  }

  function renderArtefactos(project) {
    if (!project) return;
    state.planoProject = project;
    paintArtefactos();
    load(project.id);
  }

  /* ------------------------------------------------------------ Requisitos */

  // Labels and prefixes come from the platform config (REQUIREMENT_TYPE_META), which is
  // the one place they are defined; this is only the order and the fallback.
  const TYPE_FALLBACK = {
    stakeholder: { prefix: 'STK', label: 'Stakeholder' },
    functional: { prefix: 'FR', label: 'Funcional' },
    non_functional: { prefix: 'RNF', label: 'Não Funcional' },
    test_case: { prefix: 'TC', label: 'Teste / Aceite' },
    undefined: { prefix: 'UQ', label: 'Não Definido' },
    out_of_scope: { prefix: 'OOS', label: 'Fora de Escopo' },
  };

  function requirementTypes() {
    const fromConfig = window.state?.config?.types;
    return fromConfig && typeof fromConfig === 'object' ? fromConfig : TYPE_FALLBACK;
  }

  function requirementFold(entry) {
    const k = kit();
    const { requirement, capability } = entry;
    const meta = [capability, requirement.module, requirement.priority].filter(Boolean).join(' · ');
    const scenarios = requirement.scenarios.map((scenario) => `
      <div class="ios-row is-static">
        <span class="ios-row-main">
          <span class="ios-row-title ios-wrap">${esc(scenario.title)}</span>
          <span class="ios-row-sub ios-wrap">${esc([scenario.when && `QUANDO ${scenario.when}`, scenario.then && `ENTÃO ${scenario.then}`].filter(Boolean).join(' · '))}</span>
        </span>
      </div>`).join('');
    return `
      <details class="ios-fold">
        <summary class="ios-row">
          ${requirement.id ? `<span class="ios-chip">${esc(requirement.id)}</span>` : ''}
          <span class="ios-row-main">
            <span class="ios-row-title">${esc(requirement.title)}</span>
            <span class="ios-row-sub">${esc(meta)}</span>
          </span>
          ${requirement.scenarios.length ? k.badge('gray', `${requirement.scenarios.length} cenário${requirement.scenarios.length === 1 ? '' : 's'}`) : ''}
        </summary>
        <div class="ios-fold-body">
          ${requirement.shall ? `<p class="ios-prose">${esc(requirement.shall)}</p>` : ''}
          ${requirement.rationale ? `<p class="ios-footnote">Porque: ${esc(requirement.rationale)}</p>` : ''}
          ${scenarios ? `<h3 class="ios-group-label">Cenários de aceitação</h3><div class="ios-list ios-sublist">${scenarios}</div>` : ''}
          <div class="ios-card-actions">
            <button type="button" class="btn" data-ws-edit="${esc(entry.path)}">Editar ${esc(capability)}</button>
            ${canSync() ? `<button type="button" class="btn" data-ws-tests="${esc(capability)}">Gerar testes de ${esc(capability)}</button>` : ''}
          </div>
        </div>
      </details>`;
  }

  /* ------------------------------------------------------------ requirements from code */

  const fromCode = { area: '', running: false, saving: false, outcome: null };

  function fromCodeCard(snap) {
    const k = kit();
    const areas = state.data?.surveyModules || [];
    if (!canSync() || !areas.length) return '';
    const outcome = fromCode.outcome;
    const result = outcome?.result;
    const exists = result && (snap?.files || []).some((file) => file.path === result.path);
    const types = requirementTypes();
    const grouped = result ? Object.entries(types).map(([id, meta]) => {
      const entries = result.requirements.filter((requirement) => requirement.type === id);
      if (!entries.length) return '';
      return `
        <h3 class="ios-group-label">${esc(meta.label)} · ${entries.length}</h3>
        <div class="ios-list ios-sublist">${entries.map((requirement) => `
          <div class="ios-row is-static">
            <span class="ios-row-main">
              <span class="ios-row-title ios-wrap">${esc(requirement.title)}</span>
              <span class="ios-row-sub ios-wrap">${esc(requirement.shall)}${requirement.scenarios.length ? ` · ${requirement.scenarios.length} cenário(s)` : ''}</span>
            </span>
          </div>`).join('')}</div>`;
    }).join('') : '';

    return `
      <section class="ios-card">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Requisitos a partir do código</span>
            <span class="ios-row-sub">Uma parte de cada vez. A IA escreve o que o código já faz; nada é guardado sem si.</span>
          </span>
          ${result ? k.badge('gray', 'IA · por rever') : ''}
        </div>
        <div class="ios-card-actions">
          <select class="ios-select" data-fromcode-area>
            ${areas.map((area) => `<option value="${esc(area)}" ${area === fromCode.area ? 'selected' : ''}>${esc(area)}</option>`).join('')}
          </select>
          <button type="button" class="btn" data-ws-action="fromcode" ${fromCode.running ? 'disabled' : ''}>${fromCode.running ? 'A ler o código…' : 'Gerar requisitos desta parte'}</button>
        </div>
        ${result ? `
          ${result.summary ? `<p class="ios-card-body">${esc(result.summary)}</p>` : ''}
          ${grouped || '<p class="ios-footnote">A IA não encontrou comportamento claro nesta parte.</p>'}
          ${outcome.dropped ? `<p class="ios-footnote">${outcome.dropped} requisito(s) incompleto(s) foram descartados.</p>` : ''}
          <div class="ios-card-actions">
            ${exists
    ? `<button type="button" class="btn" data-ws-edit="${esc(result.path)}">${esc(result.path)} já existe — abrir em Artefactos</button>`
    : (result.requirements.length ? `<button type="button" class="btn primary" data-ws-action="fromcode-save" ${fromCode.saving ? 'disabled' : ''}>${fromCode.saving ? 'A guardar…' : `Guardar em ${esc(result.path)}`}</button>` : '')}
            <button type="button" class="btn" data-ws-action="fromcode-discard">Descartar</button>
          </div>` : ''}
      </section>`;
  }

  async function runFromCode() {
    const select = document.querySelector('[data-fromcode-area]');
    fromCode.area = select?.value || fromCode.area;
    if (!fromCode.area || fromCode.running) return;
    fromCode.running = true;
    paintRequisitos();
    try {
      fromCode.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/artefacts_from_code`, {
        method: 'POST',
        body: { area: fromCode.area },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      fromCode.running = false;
      paintRequisitos();
    }
  }

  /** Saving goes through the same save as any artefact: local or PR, and one task. */
  async function saveFromCode() {
    const result = fromCode.outcome?.result;
    if (!result || fromCode.saving) return;
    fromCode.saving = true;
    paintRequisitos();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file`, {
        method: 'PUT',
        body: { path: result.path, content: result.spec, previousSha: '' },
      });
      state.data = { ...(state.data || {}), hasRepository: true, workspace: response.workspace };
      fromCode.outcome = null;
      window.showToast?.(`${result.path} guardado. Tarefa criada para o rever.`, 'ok');
      if (response.task) window.ResumeUI?.refresh?.();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      fromCode.saving = false;
      notify();
    }
  }

  /* ------------------------------------------------------------ tests from requirements */

  const testsDraft = { capability: '', running: false, writing: false, outcome: null };

  function testsCard() {
    const k = kit();
    if (!testsDraft.running && !testsDraft.outcome) return '';
    if (testsDraft.running) {
      return `<section class="ios-card"><p class="ios-empty">A escrever testes para ${esc(testsDraft.capability)}…</p></section>`;
    }
    const result = testsDraft.outcome.result;
    return `
      <section class="ios-card">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Testes para ${esc(testsDraft.capability)}</span>
            <span class="ios-row-sub">Escritos a partir dos requisitos, antes do código. Nada foi escrito ainda.</span>
          </span>
          ${k.badge('gray', 'IA · por rever')}
        </div>
        ${result.summary ? `<p class="ios-card-body">${esc(result.summary)}</p>` : ''}
        ${result.files.length ? `<div class="ios-list ios-fold-list">${result.files.map((file) => `
          <details class="ios-fold">
            <summary class="ios-row"><span class="ios-row-main"><span class="ios-row-title">${esc(file.path)}</span><span class="ios-row-sub">${file.content.split('\n').length} linhas</span></span></summary>
            <div class="ios-fold-body"><pre class="ios-code">${esc(file.content)}</pre></div>
          </details>`).join('')}</div>` : '<p class="ios-footnote">A IA não devolveu ficheiros de teste utilizáveis.</p>'}
        ${result.covers.length ? `<p class="ios-footnote">Cobre ${result.covers.length} requisito(s) ou cenário(s).</p>` : ''}
        ${testsDraft.outcome.dropped ? `<p class="ios-footnote">${testsDraft.outcome.dropped} ficheiro(s) fora de uma pasta de testes foram descartados.</p>` : ''}
        <div class="ios-card-actions">
          ${result.files.length ? `<button type="button" class="btn primary" data-ws-action="tests-write" ${testsDraft.writing ? 'disabled' : ''}>${testsDraft.writing ? 'A escrever…' : `Escrever ${result.files.length} ficheiro(s) de teste`}</button>` : ''}
          <button type="button" class="btn" data-ws-action="tests-discard">Descartar</button>
        </div>
      </section>`;
  }

  async function runTests(capability) {
    if (!capability || testsDraft.running) return;
    Object.assign(testsDraft, { capability, running: true, outcome: null });
    paintRequisitos();
    try {
      testsDraft.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/tests_from_artefacts`, {
        method: 'POST',
        body: { capability },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      testsDraft.running = false;
      paintRequisitos();
    }
  }

  async function writeTests() {
    const files = testsDraft.outcome?.result?.files;
    if (!files?.length || testsDraft.writing) return;
    testsDraft.writing = true;
    paintRequisitos();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/repository/tests`, {
        method: 'POST',
        body: { files },
      });
      testsDraft.outcome = null;
      if (!response.changeRequest) Object.assign(codeDraft, { testPaths: response.written, outcome: null });
      window.showToast?.(response.changeRequest
        ? 'Pedido de alteração aberto com os testes.'
        : `${response.written.length} ficheiro(s) de teste escritos na cópia local.`, 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      testsDraft.writing = false;
      paintRequisitos();
    }
  }

  /* ------------------------------------------------------------ code from tests */

  const codeDraft = { testPaths: [], running: false, writing: false, outcome: null };

  function codeCard() {
    const k = kit();
    if (!codeDraft.testPaths.length) return '';
    const outcome = codeDraft.outcome;
    const files = outcome?.result?.files || [];
    return `
      <section class="ios-card">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Código para estes testes</span>
            <span class="ios-row-sub">${esc(codeDraft.testPaths.join(', '))}</span>
          </span>
          ${outcome ? k.badge('gray', 'IA · por rever') : ''}
        </div>
        ${outcome ? `
          ${outcome.result.summary ? `<p class="ios-card-body">${esc(outcome.result.summary)}</p>` : ''}
          ${files.length ? `<div class="ios-list ios-fold-list">${files.map((file) => `
            <details class="ios-fold">
              <summary class="ios-row"><span class="ios-row-main"><span class="ios-row-title">${esc(file.path)}</span><span class="ios-row-sub">${file.diff ? 'alterado' : 'novo'}</span></span></summary>
              <div class="ios-fold-body">
                ${file.diff ? `<h3 class="ios-group-label">O que muda</h3><pre class="ios-code">${esc(file.diff)}</pre>` : ''}
                <h3 class="ios-group-label">Ficheiro completo</h3><pre class="ios-code">${esc(file.content)}</pre>
              </div>
            </details>`).join('')}</div>` : '<p class="ios-footnote">A IA não devolveu código dentro da área dos testes.</p>'}
          ${outcome.dropped ? `<p class="ios-footnote">${outcome.dropped} ficheiro(s) fora da área dos testes (ou testes, ou configuração) foram descartados.</p>` : ''}
          <div class="ios-card-actions">
            ${files.length ? `<button type="button" class="btn primary" data-ws-action="code-write" ${codeDraft.writing ? 'disabled' : ''}>${codeDraft.writing ? 'A escrever…' : `Escrever ${files.length} ficheiro(s)`}</button>` : ''}
            <button type="button" class="btn" data-ws-action="code-discard">Descartar</button>
          </div>` : `
          <textarea class="ios-editor-text ios-failure" data-code-failure placeholder="Opcional: cole aqui a saída dos testes a falhar."></textarea>
          <div class="ios-card-actions">
            <button type="button" class="btn primary" data-ws-action="code-run" ${codeDraft.running ? 'disabled' : ''}>${codeDraft.running ? 'A escrever o código…' : 'Gerar o código'}</button>
            <button type="button" class="btn" data-ws-action="code-close">Agora não</button>
          </div>`}
      </section>`;
  }

  async function runCode() {
    if (!codeDraft.testPaths.length || codeDraft.running) return;
    const failure = document.querySelector('[data-code-failure]')?.value || '';
    codeDraft.running = true;
    paintRequisitos();
    try {
      codeDraft.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/code_from_tests`, {
        method: 'POST',
        body: { testPaths: codeDraft.testPaths, failure },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      codeDraft.running = false;
      paintRequisitos();
    }
  }

  async function writeCode() {
    const files = codeDraft.outcome?.result?.files;
    if (!files?.length || codeDraft.writing) return;
    codeDraft.writing = true;
    paintRequisitos();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/repository/code`, {
        method: 'POST',
        body: { testPaths: codeDraft.testPaths, files: files.map(({ path, content }) => ({ path, content })) },
      });
      Object.assign(codeDraft, { testPaths: [], outcome: null });
      Object.assign(syncDraft, { changes: files.map((file) => ({ path: file.path, diff: file.diff || file.content.slice(0, 2000) })), outcome: null });
      window.showToast?.(response.changeRequest
        ? 'Pedido de alteração aberto com o código.'
        : `${response.written.length} ficheiro(s) escritos na cópia local. Corra os testes.`, 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      codeDraft.writing = false;
      paintRequisitos();
    }
  }

  /* ------------------------------------------------------------ back from code to artefacts */

  const syncDraft = { changes: [], running: false, outcome: null };

  function syncCard() {
    const k = kit();
    if (!syncDraft.changes.length) return '';
    const outcome = syncDraft.outcome;
    const proposals = outcome?.result?.proposals || [];
    return `
      <section class="ios-card">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Os artefactos ainda dizem o mesmo?</span>
            <span class="ios-row-sub">Código novo em ${esc(syncDraft.changes.map((change) => change.path).join(', '))}</span>
          </span>
          ${outcome ? k.badge('gray', 'IA · propostas') : ''}
        </div>
        ${outcome ? `
          ${outcome.result.summary ? `<p class="ios-card-body">${esc(outcome.result.summary)}</p>` : ''}
          ${proposals.length ? `<div class="ios-list">${proposals.map((proposal) => `
            <div class="ios-row is-static">
              <span class="ios-row-main">
                <span class="ios-row-title">${esc(proposal.path)}</span>
                ${proposal.why ? `<span class="ios-row-sub ios-wrap">${esc(proposal.why)}</span>` : ''}
                <span class="ios-row-sub ios-wrap"><strong>Mudar:</strong> ${esc(proposal.suggestion)}</span>
              </span>
              <button type="button" class="btn" data-ws-edit="${esc(proposal.path)}">Abrir</button>
            </div>`).join('')}</div>
            <p class="ios-footnote">Nada foi alterado. Abra cada artefacto, faça a mudança e guarde — cada gravação deixa a sua tarefa.</p>`
    : '<p class="ios-footnote">Os artefactos continuam a dizer o que o código faz.</p>'}
          ${outcome.dropped ? `<p class="ios-footnote">${outcome.dropped} proposta(s) para ficheiros que não existem foram descartadas.</p>` : ''}
          <div class="ios-card-actions"><button type="button" class="btn" data-ws-action="sync-close">Fechar</button></div>` : `
          <div class="ios-card-actions">
            <button type="button" class="btn primary" data-ws-action="sync-run" ${syncDraft.running ? 'disabled' : ''}>${syncDraft.running ? 'A comparar…' : 'Propor actualizações aos artefactos'}</button>
            <button type="button" class="btn" data-ws-action="sync-close">Agora não</button>
          </div>`}
      </section>`;
  }

  async function runSyncBack() {
    if (!syncDraft.changes.length || syncDraft.running) return;
    syncDraft.running = true;
    paintRequisitos();
    try {
      syncDraft.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/sync_back`, {
        method: 'POST',
        body: { changes: syncDraft.changes },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      syncDraft.running = false;
      paintRequisitos();
    }
  }

  function paintRequisitos() {
    const host = document.getElementById('requisitosWorkspace');
    const project = state.requisitosProject;
    if (!host || !project || !kit()) return;
    const snap = forProject(project.id);
    const current = workspace();

    const head = `
      <header class="ios-page-head">
        <div>
          <h1 class="ios-large-title">Requisitos</h1>
          <p class="ios-subtitle">${esc(snap?.initialized
    ? `De openspec/specs/ no repositório · lido ${kit().ago(current?.syncedAt)}`
    : 'Os requisitos vivem em openspec/specs/ no repositório.')}</p>
        </div>
        <div class="ios-page-actions">${snap?.initialized ? syncButton() : ''}</div>
      </header>`;

    if (!snap?.initialized) {
      host.innerHTML = `${head}${statusCard()}`;
      return;
    }

    // Flat list first: one requirement is one row, wherever its capability file is.
    const all = [];
    for (const spec of snap.requirements || []) {
      for (const requirement of spec.requirements) {
        all.push({ requirement, capability: spec.capability, path: `openspec/specs/${spec.capability}/spec.md` });
      }
    }

    const types = requirementTypes();
    const sections = Object.entries(types).map(([id, meta]) => {
      const entries = all.filter((entry) => entry.requirement.type === id);
      if (!entries.length) return '';
      return `
        <section class="ios-section">
          <div class="ios-section-head">
            <h2 class="ios-section-title">${esc(meta.label)} <span class="ios-count">${entries.length}</span></h2>
            <span class="ios-row-meta">${esc(meta.prefix)}</span>
          </div>
          <div class="ios-list ios-fold-list">${entries.map(requirementFold).join('')}</div>
        </section>`;
    }).join('');

    host.innerHTML = `
      ${head}
      ${syncCard()}
      ${codeCard()}
      ${testsCard()}
      ${fromCodeCard(snap)}
      ${all.length ? sections : '<div class="ios-list"><div class="ios-row is-static"><span class="ios-row-sub ios-wrap">Ainda sem requisitos. Cada capacidade é uma pasta em openspec/specs/ — ver GUIDE.md.</span></div></div>'}
      <p class="ios-footnote">O tipo vem da linha <code>&lt;!-- yourlab: type=… --&gt;</code> de cada requisito. Sem ela, o requisito aparece em Não Definido.</p>`;
  }

  /** Opens one file in Artefactos, from wherever the person was. */
  function openArtefact(filePath) {
    window.switchToTab?.('plano');
    openFile(filePath);
  }

  function renderRequisitos(project) {
    if (!project) return;
    state.requisitosProject = project;
    paintRequisitos();
    load(project.id);
  }

  /* ------------------------------------------------------------ splitting a task */

  // Proposals per task id, so re-drawing the task editor does not lose them.
  const splits = new Map();

  function projectIdNow() {
    return window.state?.selectedProject?.id || state.projectId;
  }

  function paintSplit(host) {
    const k = kit();
    const out = host.querySelector('[data-split-result]');
    const entry = splits.get(host.dataset.splitTask);
    const ask = host.querySelector('[data-split-ask]');
    if (ask) {
      ask.disabled = Boolean(entry?.running);
      ask.textContent = entry?.running ? 'A dividir…' : (entry?.result ? 'Pedir outra divisão' : 'Dividir em tarefas pequenas');
    }
    if (!out) return;
    const result = entry?.result;
    if (!result) { out.innerHTML = ''; return; }
    if (result.tasks.length < 2) {
      out.innerHTML = `<p class="ios-footnote">${esc(result.summary || 'A IA acha que esta tarefa já é pequena o suficiente.')}</p>`;
      return;
    }
    out.innerHTML = `
      ${result.summary ? `<p class="ios-footnote">${esc(result.summary)}</p>` : ''}
      <div class="ios-list">
        ${result.tasks.map((task, index) => `
          <div class="ios-row is-static">
            <span class="ios-row-index">${index + 1}</span>
            <span class="ios-row-main">
              <span class="ios-row-title ios-wrap">${esc(task.title)}</span>
              ${task.goal ? `<span class="ios-row-sub ios-wrap">${esc(task.goal)}</span>` : ''}
            </span>
          </div>`).join('')}
      </div>
      <div class="ios-card-actions">
        <button type="button" class="btn primary" data-split-apply>Criar ${result.tasks.length} tarefas</button>
        <button type="button" class="btn" data-split-discard>Descartar</button>
        ${k.badge('gray', 'IA · ainda não criado')}
      </div>`;
  }

  async function askSplit(host) {
    const taskId = host.dataset.splitTask;
    const entry = splits.get(taskId) || {};
    if (entry.running) return;
    splits.set(taskId, { ...entry, running: true });
    paintSplit(host);
    try {
      const outcome = await window.apiRequest(`/${encodeURIComponent(projectIdNow())}/packs/split_task`, { method: 'POST', body: { taskId } });
      splits.set(taskId, { result: outcome.result, running: false });
    } catch (error) {
      splits.set(taskId, { ...entry, running: false });
      window.showToast?.(error.message, 'error');
    }
    paintSplit(host);
  }

  async function applySplit(host) {
    const taskId = host.dataset.splitTask;
    const result = splits.get(taskId)?.result;
    if (!result?.tasks?.length) return;
    try {
      const response = await window.apiRequest(`/projects/${encodeURIComponent(projectIdNow())}/work-items/${encodeURIComponent(taskId)}/split`, {
        method: 'POST',
        body: { tasks: result.tasks },
      });
      splits.delete(taskId);
      window.showToast?.(`${response.children.length} tarefas criadas por baixo desta.`, 'ok');
      if (window.state?.selectedProject) window.WorkItemsUI?.open?.(window.state.selectedProject);
    } catch (error) {
      window.showToast?.(error.message, 'error');
    }
  }

  // The task editor is redrawn often; a proposal already made is put back each time.
  new MutationObserver(() => {
    document.querySelectorAll('[data-split-task]').forEach((host) => {
      if (splits.has(host.dataset.splitTask) && !host.querySelector('[data-split-result] > *')) paintSplit(host);
    });
  }).observe(document.body, { childList: true, subtree: true });

  /* ------------------------------------------------------------ wiring */

  document.addEventListener('click', (event) => {
    const target = event.target;
    const action = target?.closest?.('[data-ws-action]');
    if (action) {
      const name = action.dataset.wsAction;
      if (name === 'sync') sync();
      else if (name === 'save') saveFile();
      else if (name === 'cancel') cancelEdit();
      else if (name === 'impact') runImpact();
      else if (name === 'initialize') initialize();
      else if (name === 'survey') survey();
      else if (name === 'fromcode') runFromCode();
      else if (name === 'tests-write') writeTests();
      else if (name === 'code-run') runCode();
      else if (name === 'sync-run') runSyncBack();
      else if (name === 'sync-close') { Object.assign(syncDraft, { changes: [], outcome: null }); paintRequisitos(); }
      else if (name === 'code-write') writeCode();
      else if (name === 'code-discard') { codeDraft.outcome = null; paintRequisitos(); }
      else if (name === 'code-close') { Object.assign(codeDraft, { testPaths: [], outcome: null }); paintRequisitos(); }
      else if (name === 'tests-discard') { testsDraft.outcome = null; paintRequisitos(); }
      else if (name === 'fromcode-save') saveFromCode();
      else if (name === 'fromcode-discard') { fromCode.outcome = null; paintRequisitos(); }
      else if (name === 'mockup') openMockup(action.dataset.wsScreen);
      return;
    }
    const splitHost = target?.closest?.('[data-split-task]');
    if (splitHost && target.closest('[data-split-ask]')) { askSplit(splitHost); return; }
    if (splitHost && target.closest('[data-split-apply]')) { applySplit(splitHost); return; }
    if (splitHost && target.closest('[data-split-discard]')) { splits.delete(splitHost.dataset.splitTask); paintSplit(splitHost); return; }
    const tests = target?.closest?.('[data-ws-tests]');
    if (tests) { runTests(tests.dataset.wsTests); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const edit = target?.closest?.('[data-ws-edit]');
    if (edit) { openArtefact(edit.dataset.wsEdit); return; }
    const file = target?.closest?.('[data-ws-file]');
    if (file) { openFile(file.dataset.wsFile); return; }
    const screen = target?.closest?.('[data-ws-screen]');
    if (screen) { openMockup(screen.dataset.wsScreen); return; }
    const go = target?.closest?.('[data-ws-go]');
    if (go) { window.switchToTab?.(go.dataset.wsGo); return; }
    if (target?.closest?.('[data-ws-close]') || target?.classList?.contains('ios-sheet-backdrop')) closeSheet();
  });

  // Typing only touches the draft: the file is written on Guardar and nowhere else.
  document.addEventListener('input', (event) => {
    if (event.target?.id !== 'artefactText') return;
    writeDraft(editor.path, event.target.value);
    const dirty = event.target.value !== editor.content;
    document.querySelector('[data-ws-action="save"]')?.toggleAttribute('disabled', !dirty);
    document.querySelector('[data-ws-action="cancel"]')?.toggleAttribute('disabled', !dirty);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(paintPreview, 400);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });

  window.WorkspaceUI = {
    load,
    sync,
    initialize,
    forProject,
    stageOf,
    statusCard,
    renderArtefactos,
    renderRequisitos,
    openArtefact,
    openMockup,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
