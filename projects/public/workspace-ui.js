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
  }

  /* ------------------------------------------------------------ reading */

  async function load(projectId, { autoSync = true } = {}) {
    if (!projectId) return;
    if (state.projectId !== projectId) {
      Object.assign(state, { projectId, data: null, error: '', changeRequestUrl: '', surveyed: null });
      Object.assign(view, { sel: '', newPath: '', isNew: false, mode: 'view', lastEdit: null, adding: '' });
      steps.outcome = null;
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
      const fresh = await window.apiRequest(`/${encodeURIComponent(projectId)}/workspace`);
      state.data = { ...(state.data || {}), surveyModules: fresh.surveyModules, aiSteps: fresh.aiSteps };
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

  /* ------------------------------------------------------------ Artefactos */

  // The list, in the order of the page. `kind` is what «+» creates in that group.
  const GROUPS = [
    { key: 'intent', label: 'Intenção', kind: 'ideas' },
    { key: 'phase', label: 'Plano', kind: 'phase', noun: 'fase' },
    { key: 'spec', label: 'Requisitos', kind: 'spec', noun: 'capacidade' },
    { key: 'diagram', label: 'Arquitectura', kind: 'diagram', noun: 'diagrama' },
    { key: 'database', label: 'Base de dados', kind: 'database', noun: 'entidade' },
    { key: 'workflow', label: 'Workflows', kind: 'workflow', noun: 'workflow' },
    { key: 'mockup', label: 'Mockup', kind: 'mockup', noun: 'ecrã' },
    { key: 'questions', label: 'Perguntas', kind: 'questions', noun: 'pergunta' },
  ];
  const ADD_WORD = { ideas: 'ideia', phase: 'fase', spec: 'capacidade', diagram: 'diagrama', database: 'entidade', workflow: 'workflow', mockup: 'ecrã', questions: 'pergunta' };

  // What is open on the right. `sel` is a file path, '@requisitos', or '@group:<kind>'.
  const view = {
    sel: '', mode: 'view', loading: false, content: '', sha: '', saved: null, live: null,
    saving: false, pane: 'text', isNew: false, newPath: '', adding: '', aiNote: null,
    ask: { open: false, running: false }, lastEdit: null, previewSeq: 0, showDiff: false,
  };
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

  function hasFile(filePath) {
    return (snapshot()?.files || []).some((file) => file.path === filePath);
  }
  function capabilities() {
    return (snapshot()?.requirements || []).map((spec) => spec.capability);
  }

  /** The rows of one group, from the snapshot. A group with nothing still has a row. */
  function groupRows(group, snap) {
    const k = kit();
    const rows = [];
    if (group.key === 'intent') {
      rows.push({ target: 'yourlab/project.md', title: 'Propósito', sub: snap.project ? '' : 'Por escrever', missing: !snap.project });
      rows.push({ target: 'yourlab/ideas.md', title: 'Ideias', sub: snap.ideas.length ? `${snap.ideas.length}` : 'Nenhuma', missing: !hasFile('yourlab/ideas.md') });
    } else if (group.key === 'phase') {
      for (const phase of snap.phases) {
        rows.push({ target: phase.file, title: `${phase.number}. ${phase.title}`, sub: phase.weeks ? `${phase.weeks} sem.` : '', badge: phase.status === 'in_progress' ? k.badge('green', 'Em curso') : '' });
      }
    } else if (group.key === 'spec') {
      const total = snap.requirements.reduce((sum, spec) => sum + spec.requirements.length, 0);
      if (snap.requirements.length) rows.push({ target: '@requisitos', title: 'Por tipo', sub: `${total}` });
      for (const spec of snap.requirements) {
        const untyped = spec.requirements.filter((requirement) => requirement.type === 'undefined').length;
        rows.push({ target: `openspec/specs/${spec.capability}/spec.md`, title: spec.title || spec.capability, sub: `${spec.requirements.length}`, badge: untyped ? k.badge('amber', `${untyped} UQ`) : '' });
      }
    } else if (group.key === 'diagram') {
      for (const diagram of snap.diagrams) rows.push({ target: diagram.file, title: diagram.title });
    } else if (group.key === 'database') {
      const count = snap.database?.entities?.length || 0;
      rows.push({ target: 'yourlab/database.md', title: 'Entidades', sub: count ? `${count}` : 'Nenhuma', missing: !hasFile('yourlab/database.md') });
    } else if (group.key === 'workflow') {
      for (const workflow of snap.workflows) rows.push({ target: workflow.file, title: workflow.title, sub: `${workflow.steps.length} passos` });
    } else if (group.key === 'mockup') {
      for (const screen of snap.mockup.screens) rows.push({ target: `yourlab/mockup/${screen.file}`, title: screen.title, sub: screen.entry ? 'primeiro ecrã' : '' });
    } else if (group.key === 'questions') {
      const open = snap.questions.filter((question) => question.state !== 'answered').length;
      rows.push({ target: 'yourlab/questions.md', title: 'Perguntas', sub: snap.questions.length ? `${snap.questions.length}` : 'Nenhuma', badge: open ? k.badge('amber', `${open} em aberto`) : '', missing: !hasFile('yourlab/questions.md') });
    }
    // A file created here but not saved yet sits in its group, marked.
    if (view.newPath && groupOf(view.newPath) === group.key && !rows.some((row) => row.target === view.newPath)) {
      rows.push({ target: view.newPath, title: titleOf(view.newPath), badge: k.badge('amber', 'novo') });
    }
    if (!rows.length) rows.push({ target: `@group:${group.kind}`, title: 'Ainda vazio', missing: true });
    return rows;
  }

  function groupOf(filePath) {
    const kind = filePath.startsWith('openspec/specs/') ? 'spec'
      : /^yourlab\/phases\//.test(filePath) ? 'phase'
        : /^yourlab\/diagrams\//.test(filePath) ? 'diagram'
          : /^yourlab\/workflows\//.test(filePath) ? 'workflow'
            : /^yourlab\/mockup\//.test(filePath) ? 'mockup'
              : filePath === 'yourlab/database.md' ? 'database'
                : filePath === 'yourlab/questions.md' ? 'questions' : 'intent';
    return kind;
  }

  function titleOf(target) {
    if (target === '@requisitos') return 'Requisitos por tipo';
    if (target.startsWith('@group:')) return GROUPS.find((group) => group.kind === target.slice(7))?.label || 'Artefacto';
    const snap = snapshot();
    const phase = snap?.phases.find((entry) => entry.file === target);
    if (phase) return `Fase ${phase.number} · ${phase.title}`;
    const spec = target.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
    if (spec) return snap?.requirements.find((entry) => entry.capability === spec[1])?.title || spec[1];
    const named = [...(snap?.diagrams || []), ...(snap?.workflows || [])].find((entry) => entry.file === target);
    if (named) return named.title;
    const fixed = { 'yourlab/project.md': 'Propósito', 'yourlab/ideas.md': 'Ideias', 'yourlab/database.md': 'Base de dados', 'yourlab/questions.md': 'Perguntas' }[target];
    if (fixed) return fixed;
    // A file not saved yet: its own title as the draft reads, or its name made readable.
    const live = target === view.sel ? view.live?.piece : null;
    if (live?.title) return live.title;
    const base = target.replace(/\/spec\.md$/, '').split('/').pop().replace(/\.[a-z]+$/, '').replace(/^\d{2}-/, '').replace(/-/g, ' ');
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function artefactList(snap) {
    return GROUPS.map((group) => `
      <section class="ios-section av-group">
        <div class="av-group-head">
          <h2 class="ios-group-label">${esc(group.label)}</h2>
          ${canSync() ? `<button type="button" class="av-add" data-ws-add="${group.kind}" aria-label="Nova ${esc(ADD_WORD[group.kind])}">${icon('plus', 16)}</button>` : ''}
        </div>
        ${view.adding === group.kind ? `
          <form class="av-add-form" data-ws-add-form="${group.kind}">
            <input class="ios-input" name="name" placeholder="Nome d${ADD_WORD[group.kind] === 'workflow' || ADD_WORD[group.kind] === 'diagrama' ? 'o' : 'a'} ${esc(ADD_WORD[group.kind])}" autocomplete="off" required />
            <button type="submit" class="btn primary">Criar</button>
            <button type="button" class="btn" data-ws-action="add-cancel">Cancelar</button>
          </form>` : ''}
        <div class="ios-list">
          ${groupRows(group, snap).map((row) => `
            <button type="button" class="ios-row ${row.target === view.sel ? 'is-selected' : ''} ${row.missing ? 'is-muted' : ''}" data-ws-file="${esc(row.target)}">
              <span class="ios-row-main"><span class="ios-row-title">${esc(row.title)}</span></span>
              ${readDraft(row.target) !== null && !row.target.startsWith('@') ? kit().badge('amber', 'não guardado') : (row.badge || '')}
              ${row.sub ? `<span class="ios-row-meta">${esc(row.sub)}</span>` : ''}
              ${icon('chevron', 14, 'ios-chevron')}
            </button>`).join('')}
        </div>
      </section>`).join('');
  }

  /* ------------------------------------------------------------ opening one */

  async function select(target) {
    if (!target) return;
    const keepNew = target === view.newPath;
    Object.assign(view, {
      sel: target, mode: 'view', loading: false, content: '', sha: '', saved: null, live: null,
      aiNote: null, ask: { open: false, running: false }, isNew: keepNew && !hasFile(target), showDiff: false,
    });
    if (!keepNew) view.newPath = '';
    if (target.startsWith('@') || view.isNew) {
      if (view.isNew) { view.mode = 'edit'; previewDraft(); }
      paintArtefactos();
      return;
    }
    view.loading = true;
    paintArtefactos();
    try {
      const file = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file?path=${encodeURIComponent(target)}`);
      if (view.sel !== target) return;
      Object.assign(view, { content: file.content, sha: file.sha, saved: file.view });
      // Coming back to an unsaved draft goes straight to editing it.
      if (readDraft(target) !== null) { view.mode = 'edit'; previewDraft(); }
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      if (view.sel === target) view.loading = false;
      paintArtefactos();
    }
  }

  function currentText() {
    const draft = readDraft(view.sel);
    return draft === null ? view.content : draft;
  }

  /** The formatted view of the draft, read on the server like everything else. */
  function previewDraft() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const seq = ++view.previewSeq;
      const target = view.sel;
      try {
        const result = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/preview`, {
          method: 'POST',
          body: { path: target, content: currentText() },
        });
        if (seq !== view.previewSeq || view.sel !== target) return;
        view.live = result;
        paintLive();
      } catch { /* the text is still there; the view catches up on the next keystroke */ }
    }, 350);
  }

  function paintLive() {
    const live = document.getElementById('artefactLive');
    if (live) {
      live.innerHTML = view.live ? window.ArtefactViews.render(view.live, { capabilities: capabilities(), hideFindings: true }) : '<p class="av-empty">A preparar a vista…</p>';
      window.ArtefactViews.hydrate(live);
    }
    const findings = document.getElementById('artefactFindings');
    if (findings) findings.innerHTML = window.ArtefactViews.findingsBanner(view.live?.findings || []);
  }

  /* ------------------------------------------------------------ editing and saving */

  function startEdit() {
    if (!canSync() || view.sel.startsWith('@')) return;
    view.mode = 'edit';
    view.live = view.saved;
    paintArtefactos();
    document.getElementById('artefactText')?.focus();
  }

  async function saveFile() {
    const field = document.getElementById('artefactText');
    if (!view.sel || view.saving || !field) return;
    const content = field.value;
    const target = view.sel;
    view.saving = true;
    paintArtefactos();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file`, {
        method: 'PUT',
        body: { path: target, content, previousSha: view.isNew ? '' : view.sha },
      });
      writeDraft(target, null);
      state.data = { ...(state.data || {}), hasRepository: true, workspace: response.workspace };
      view.lastEdit = { path: target, diff: response.diff || '', task: response.task || null, ai: null, running: false };
      view.newPath = '';
      const where = response.changeRequest ? 'Pedido de alteração aberto no repositório.' : 'Guardado no repositório.';
      window.showToast?.(response.task ? `${where} Tarefa criada em Tarefas.` : where, 'ok');
      if (response.task) window.ResumeUI?.refresh?.();
      view.saving = false;
      notifyOthers();
      await select(target);
      view.lastEdit = { ...view.lastEdit };
      paintArtefactos();
    } catch (error) {
      window.showToast?.(error.message, 'error');
      view.saving = false;
      paintArtefactos();
    }
  }

  function cancelEdit() {
    writeDraft(view.sel, null);
    if (view.isNew) {
      Object.assign(view, { sel: '', newPath: '', isNew: false, mode: 'view' });
    } else {
      Object.assign(view, { mode: 'view', live: null, aiNote: null });
    }
    paintArtefactos();
  }

  const DIRTY_NOTE = 'Não guardado — o ficheiro só muda ao Guardar.';

  function editPane() {
    const text = currentText();
    const dirty = text !== view.content || view.isNew;
    return `
      ${view.aiNote ? `<div class="av-ai-note">${icon('sparkle', 16)}<span><strong>Proposta da IA — reveja e Guardar.</strong> ${esc(view.aiNote)}</span></div>` : ''}
      <div class="ios-segmented av-seg" role="tablist">
        <button type="button" class="ios-segment ${view.pane === 'text' ? 'is-active' : ''}" data-ws-pane="text">Texto</button>
        <button type="button" class="ios-segment ${view.pane === 'view' ? 'is-active' : ''}" data-ws-pane="view">Vista</button>
      </div>
      <div class="av-edit" data-pane="${view.pane}">
        <div class="av-edit-text">
          <textarea id="artefactText" class="ios-editor-text" spellcheck="false">${esc(text)}</textarea>
          <div id="artefactFindings">${window.ArtefactViews.findingsBanner(view.live?.findings || [])}</div>
        </div>
        <div class="av-edit-live" id="artefactLive"></div>
      </div>
      <div class="av-edit-bar">
        <span class="ios-footnote" id="artefactDirty">${dirty ? DIRTY_NOTE : 'Sem alterações.'}</span>
        <button type="button" class="btn" data-ws-action="cancel">${dirty ? 'Descartar' : 'Fechar'}</button>
        <button type="button" class="btn primary" data-ws-action="save" ${view.saving || !dirty ? 'disabled' : ''}>${view.saving ? 'A guardar…' : 'Guardar'}</button>
      </div>`;
  }

  /* ------------------------------------------------------------ new files */

  async function createFile(kind, name) {
    try {
      const template = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/template?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`);
      view.adding = '';
      if (template.append) {
        // A new section of a file that holds many: added to the end of its draft.
        let base = '';
        if (hasFile(template.path)) {
          const file = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file?path=${encodeURIComponent(template.path)}`);
          base = file.content;
        }
        const current = readDraft(template.path) ?? base;
        writeDraft(template.path, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${template.content}`);
        if (!hasFile(template.path)) view.newPath = template.path;
        await select(template.path);
      } else {
        writeDraft(template.path, template.content);
        view.newPath = template.path;
        await select(template.path);
      }
      document.getElementById('artefactText')?.focus();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    }
  }

  /* ------------------------------------------------------------ asking the AI for a change */

  async function askAi() {
    const field = document.querySelector('[data-ws-ask-text]');
    const request = field?.value?.trim() || '';
    if (!request || view.ask.running) return;
    const target = view.sel;
    view.ask = { open: true, running: true, text: request };
    paintArtefactos();
    try {
      const outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/edit_artefact`, {
        method: 'POST',
        body: { path: target, request },
      });
      if (view.sel !== target) return;
      if (!outcome.result?.file) {
        window.showToast?.('A IA não devolveu um ficheiro utilizável. Reformule o pedido.', 'error');
        view.ask = { open: true, running: false, text: request };
      } else {
        writeDraft(target, outcome.result.file.content);
        Object.assign(view, { mode: 'edit', live: outcome.result.file.view, aiNote: outcome.result.summary || 'Alteração proposta.', ask: { open: false, running: false } });
      }
    } catch (error) {
      window.showToast?.(error.message, 'error');
      view.ask = { open: true, running: false, text: request };
    } finally {
      paintArtefactos();
    }
  }

  /* ------------------------------------------------------------ after a save: impact */

  function impactPane() {
    const k = kit();
    const last = view.lastEdit;
    if (!last || last.path !== view.sel || view.mode !== 'view') return '';
    const result = last.ai?.result;
    const rows = result ? [
      ...result.artefacts.map((entry) => `
        <button type="button" class="ios-row" data-ws-file="${esc(entry.path)}">
          <span class="ios-row-main"><span class="ios-row-title">${esc(titleOf(entry.path))}</span><span class="ios-row-sub ios-wrap">${esc(entry.why)}</span></span>
          ${k.icon('chevron', 14, 'ios-chevron')}
        </button>`),
      ...result.codeAreas.map((entry) => `
        <div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-title">${esc(entry.area)}</span><span class="ios-row-sub ios-wrap">${esc(entry.why)}</span></span>${k.badge('gray', 'código')}</div>`),
    ].join('') : '';
    return `
      <section class="ios-card av-after">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">Guardado</span>
            <span class="ios-row-sub">${last.task ? `Tarefa criada: ${esc(last.task.title)}` : 'Sem tarefa: o texto não mudou.'}</span>
          </span>
          ${last.diff && canSync() ? `<button type="button" class="btn" data-ws-action="impact" ${last.running ? 'disabled' : ''}>${last.running ? 'A analisar…' : (result ? 'Analisar de novo' : 'O que mais muda?')}</button>` : ''}
        </div>
        ${result ? `
          ${result.summary ? `<p class="ios-card-body">${esc(result.summary)}</p>` : ''}
          ${rows ? `<div class="ios-list">${rows}</div>` : '<p class="ios-footnote">A IA não vê mais nada afectado.</p>'}` : ''}
      </section>`;
  }

  async function runImpact() {
    const last = view.lastEdit;
    if (!last?.diff || last.running) return;
    last.running = true;
    paintArtefactos();
    try {
      last.ai = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/impact`, {
        method: 'POST',
        body: { path: last.path, diff: last.diff, taskId: last.task?.id || '' },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      last.running = false;
      paintArtefactos();
    }
  }

  /* ------------------------------------------------------------ artefacts from code, inside each artefact */

  const steps = { creating: false, running: '', writing: false, outcome: null };

  /** The AI steps that write the artefact (or group) being looked at. */
  function stepsFor(target) {
    const list = state.data?.aiSteps || [];
    return list.filter((step) => {
      if (step.kind === 'spec') return target === '@requisitos' || target === '@group:spec' || target.startsWith('openspec/');
      if (step.target.endsWith('/')) return target.startsWith(step.target) || target === `@group:${step.kind}`;
      return target === step.target || (step.kind === 'diagram' && (target === '@group:diagram' || target.startsWith('yourlab/diagrams/')));
    });
  }

  function stepsBlock(target) {
    const k = kit();
    const list = canSync() ? stepsFor(target) : [];
    if (!list.length) return '';
    return `
      <section class="ios-card av-steps-card">
        <div class="ios-docs-head">
          <span class="ios-row-main">
            <span class="ios-card-title">A partir do código</span>
            <span class="ios-row-sub">A IA lê só a parte do código deste passo. Mostra a proposta já formatada; nada é escrito sem Escrever.</span>
          </span>
        </div>
        <div class="ios-list">${list.map((step) => {
    const done = step.task?.status === 'completed';
    return `
          <div class="ios-row is-static">
            <span class="ios-row-main"><span class="ios-row-title">${esc(step.title)}</span><span class="ios-row-sub">${esc(step.target)}</span></span>
            ${done ? k.badge('green', 'Feito') : ''}
            <button type="button" class="btn${done ? '' : ' primary'}" data-ws-step="${esc(step.key)}" ${steps.running ? 'disabled' : ''}>${steps.running === step.key ? 'A ler o código…' : (done ? 'Refazer' : 'Gerar com IA')}</button>
          </div>`;
  }).join('')}</div>
      </section>`;
  }

  function proposalPane() {
    const k = kit();
    const outcome = steps.outcome;
    const files = outcome.result.files;
    return `
      <div class="av-ai-note">${icon('sparkle', 16)}<span><strong>Proposta da IA · por rever.</strong> ${esc(outcome.result.summary || '')}</span></div>
      ${files.length ? files.map((file) => `
        <section class="av-proposal">
          <div class="av-proposal-head">
            <span class="ios-row-main"><span class="ios-row-title">${esc(titleOf(file.path))}</span><span class="ios-row-sub">${esc(file.path)}</span></span>
            ${k.badge(file.exists ? 'amber' : 'green', file.exists ? 'altera' : 'novo')}
          </div>
          ${view.showDiff && file.exists
    ? `<pre class="ios-code">${esc(file.diff)}</pre>`
    : `<div class="av-proposal-view">${window.ArtefactViews.render(file.view, { capabilities: capabilities() })}</div>`}
        </section>`).join('') : '<p class="av-empty">A IA não devolveu um ficheiro utilizável para este passo.</p>'}
      ${outcome.dropped ? `<p class="ios-footnote">${outcome.dropped} ficheiro(s) fora do formato foram descartados.</p>` : ''}
      <div class="av-edit-bar">
        ${files.some((file) => file.exists) ? `<button type="button" class="btn" data-ws-action="step-diff">${view.showDiff ? 'Ver formatado' : 'Ver diferenças'}</button>` : ''}
        <button type="button" class="btn" data-ws-action="step-discard">Descartar</button>
        ${files.length ? `<button type="button" class="btn primary" data-ws-action="step-write" ${steps.writing ? 'disabled' : ''}>${steps.writing ? 'A escrever…' : 'Escrever no repositório'}</button>` : ''}
      </div>`;
  }

  async function createSteps() {
    if (steps.creating) return;
    steps.creating = true;
    paintArtefactos();
    try {
      const response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/ai-steps`, { method: 'POST', body: {} });
      state.data = { ...(state.data || {}), aiSteps: response.aiSteps };
      window.showToast?.(`${response.created} tarefa(s) criada(s) em Tarefas.`, 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      steps.creating = false;
      paintArtefactos();
    }
  }

  async function runStep(key) {
    if (steps.running) return;
    steps.running = key;
    steps.outcome = null;
    view.showDiff = false;
    paintArtefactos();
    try {
      steps.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/ai-steps/run`, { method: 'POST', body: { key } });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      steps.running = '';
      paintArtefactos();
    }
  }

  /** Same save as any artefact; the step's task is closed instead of a new one opened. */
  async function writeStep() {
    const outcome = steps.outcome;
    if (!outcome || steps.writing) return;
    steps.writing = true;
    paintArtefactos();
    try {
      let response = null;
      for (const file of outcome.result.files) {
        response = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace/file`, {
          method: 'PUT',
          body: { path: file.path, content: file.content, previousSha: file.sha, aiStep: outcome.key },
        });
      }
      const fresh = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/workspace`);
      state.data = { ...(state.data || {}), ...fresh };
      steps.outcome = null;
      window.showToast?.(response?.changeRequest ? 'Pedido de alteração aberto no repositório.' : 'Escrito no repositório.', 'ok');
      window.ResumeUI?.refresh?.();
      notifyOthers();
      await select(outcome.result.files[0].path);
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      steps.writing = false;
      paintArtefactos();
    }
  }

  /* ------------------------------------------------------------ the viewer */

  function proposalShown(target) {
    return Boolean(steps.outcome) && stepsFor(target).some((step) => step.key === steps.outcome.key);
  }

  function viewerHead() {
    const k = kit();
    const target = view.sel;
    const isFile = !target.startsWith('@');
    const generated = view.saved?.generated;
    const actions = [];
    if (isFile && canSync() && view.mode === 'view' && !view.loading && !proposalShown(target)) {
      actions.push(`<button type="button" class="btn primary" data-ws-action="edit">Editar</button>`);
      actions.push(`<button type="button" class="btn" data-ws-action="ask">${icon('sparkle', 15)}Pedir à IA</button>`);
      const spec = target.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
      if (spec && view.content) actions.push(`<button type="button" class="btn" data-ws-tests="${esc(spec[1])}">Gerar testes</button>`);
    }
    if (target.startsWith('yourlab/mockup/') && view.content) {
      actions.push(`<button type="button" class="btn" data-ws-action="mockup" data-ws-screen="${esc(target.split('/').pop())}">Abrir em grande</button>`);
    }
    return `
      <header class="av-viewer-head">
        <button type="button" class="av-back" data-ws-action="back">${icon('chevronLeft', 18)}Artefactos</button>
        <div class="av-viewer-title">
          <h2>${esc(titleOf(target))}</h2>
          <p>${esc(isFile ? target : '')}</p>
        </div>
        <div class="av-viewer-actions">${generated ? k.badge('amber', 'gerado · por rever') : ''}${actions.join('')}</div>
      </header>
      ${view.ask.open ? `
        <form class="av-ask" data-ws-ask-form>
          <input class="ios-input" data-ws-ask-text placeholder="O que mudar, numa frase — ex.: acrescenta um risco sobre RGPD" value="${esc(view.ask.text || '')}" ${view.ask.running ? 'disabled' : ''} autocomplete="off" />
          <button type="submit" class="btn primary" ${view.ask.running ? 'disabled' : ''}>${view.ask.running ? 'A pedir…' : 'Pedir'}</button>
          <button type="button" class="btn" data-ws-action="ask-close">Cancelar</button>
        </form>` : ''}`;
  }

  function viewerBody(snap) {
    const target = view.sel;
    const opts = { capabilities: capabilities() };
    if (proposalShown(target)) return proposalPane();
    if (target === '@requisitos') {
      return `${syncCard()}${codeCard()}${testsCard()}${window.ArtefactViews.requirementsOverview(snap)}${stepsBlock(target)}`;
    }
    if (target.startsWith('@group:')) {
      const kind = target.slice(7);
      return `
        <div class="av-empty-state">
          <p>Ainda não há ${esc(GROUPS.find((group) => group.kind === kind)?.label.toLowerCase() || 'nada')} neste projecto.</p>
          ${canSync() ? `<button type="button" class="btn primary" data-ws-add="${esc(kind)}">Criar ${esc(ADD_WORD[kind] || '')}</button>` : ''}
        </div>
        ${stepsBlock(target)}`;
    }
    if (view.mode === 'edit') return editPane();
    if (view.loading) return '<p class="av-empty">A ler…</p>';
    const specHere = /^openspec\//.test(target) ? `${syncCard()}${codeCard()}${testsCard()}` : '';
    if (!view.content) {
      return `
        <div class="av-empty-state">
          <p>Este ficheiro ainda não existe.</p>
          ${canSync() && ADD_WORD[groupOf(target) === 'intent' ? 'ideas' : groupOf(target)] && target !== 'yourlab/project.md'
    ? `<button type="button" class="btn primary" data-ws-add="${esc(target === 'yourlab/ideas.md' ? 'ideas' : groupOf(target))}">Criar</button>` : ''}
        </div>
        ${stepsBlock(target)}`;
    }
    return `${specHere}${impactPane()}${window.ArtefactViews.render(view.saved, opts)}${stepsBlock(target)}`;
  }

  function progressLine() {
    const list = state.data?.aiSteps || [];
    if (!canSync() || !list.length) return '';
    const hasTasks = list.some((step) => step.task);
    const done = list.filter((step) => step.task?.status === 'completed').length;
    return `
      <div class="av-progress">
        ${icon('sparkle', 16)}
        <span>${hasTasks ? `Preenchido a partir do código: <strong>${done}/${list.length}</strong>` : `${list.length} passos para preencher a partir do código`}</span>
        ${hasTasks ? `<span class="av-progress-bar"><span style="width:${Math.round((done / list.length) * 100)}%"></span></span>`
    : `<button type="button" class="btn" data-ws-action="steps-create" ${steps.creating ? 'disabled' : ''}>${steps.creating ? 'A criar…' : 'Criar as tarefas'}</button>`}
      </div>`;
  }

  function paintArtefactos() {
    const host = document.getElementById('planoWorkspace');
    const project = state.planoProject;
    if (!host || !project || !kit() || !window.ArtefactViews) return;
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
    // Keep the caret where it was when only the page around the editor is redrawn.
    const field = document.getElementById('artefactText');
    const caret = field ? [field.selectionStart, field.selectionEnd, field.scrollTop] : null;
    host.innerHTML = `
      ${head}
      ${progressLine()}
      <div class="av-layout ${view.sel ? 'has-selection' : ''}">
        <nav class="av-list" aria-label="Artefactos">${artefactList(snap)}</nav>
        <div class="av-viewer">${view.sel ? `${viewerHead()}<div class="av-viewer-body">${viewerBody(snap)}</div>` : '<p class="av-empty av-pick">Escolha um artefacto.</p>'}</div>
      </div>`;
    const again = document.getElementById('artefactText');
    if (again && caret) { [again.selectionStart, again.selectionEnd, again.scrollTop] = caret; }
    if (view.mode === 'edit') paintLive();
    window.ArtefactViews.hydrate(host.querySelector('.av-viewer-body'));
  }

  // Resumo and the Documentação card read the same snapshot.
  function notifyOthers() {
    listeners.forEach((listener) => {
      try { listener(); } catch { /* one screen failing must not stop the others */ }
    });
  }

  function renderArtefactos(project) {
    if (!project) return;
    state.planoProject = project;
    paintArtefactos();
    load(project.id);
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
    paintArtefactos();
    try {
      testsDraft.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/tests_from_artefacts`, {
        method: 'POST',
        body: { capability },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      testsDraft.running = false;
      paintArtefactos();
    }
  }

  async function writeTests() {
    const files = testsDraft.outcome?.result?.files;
    if (!files?.length || testsDraft.writing) return;
    testsDraft.writing = true;
    paintArtefactos();
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
      paintArtefactos();
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
    paintArtefactos();
    try {
      codeDraft.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/code_from_tests`, {
        method: 'POST',
        body: { testPaths: codeDraft.testPaths, failure },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      codeDraft.running = false;
      paintArtefactos();
    }
  }

  async function writeCode() {
    const files = codeDraft.outcome?.result?.files;
    if (!files?.length || codeDraft.writing) return;
    codeDraft.writing = true;
    paintArtefactos();
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
      paintArtefactos();
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
    paintArtefactos();
    try {
      syncDraft.outcome = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/packs/sync_back`, {
        method: 'POST',
        body: { changes: syncDraft.changes },
      });
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      syncDraft.running = false;
      paintArtefactos();
    }
  }

  /** Anything outside Artefactos that opens an artefact: Resumo rows, links, cards. */
  function openArtefact(target) {
    if (!target) return;
    if (window.state?.activeTab !== 'plano') window.switchToTab?.('plano');
    select(target);
  }

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
      else if (name === 'tests-write') writeTests();
      else if (name === 'code-run') runCode();
      else if (name === 'sync-run') runSyncBack();
      else if (name === 'sync-close') { Object.assign(syncDraft, { changes: [], outcome: null }); paintArtefactos(); }
      else if (name === 'code-write') writeCode();
      else if (name === 'code-discard') { codeDraft.outcome = null; paintArtefactos(); }
      else if (name === 'code-close') { Object.assign(codeDraft, { testPaths: [], outcome: null }); paintArtefactos(); }
      else if (name === 'tests-discard') { testsDraft.outcome = null; paintArtefactos(); }
      else if (name === 'steps-create') createSteps();
      else if (name === 'step-write') writeStep();
      else if (name === 'step-discard') { steps.outcome = null; paintArtefactos(); }
      else if (name === 'step-diff') { view.showDiff = !view.showDiff; paintArtefactos(); }
      else if (name === 'edit') startEdit();
      else if (name === 'ask') { view.ask = { open: true, running: false }; paintArtefactos(); document.querySelector('[data-ws-ask-text]')?.focus(); }
      else if (name === 'ask-close') { view.ask = { open: false, running: false }; paintArtefactos(); }
      else if (name === 'back') { view.sel = ''; paintArtefactos(); }
      else if (name === 'add-cancel') { view.adding = ''; paintArtefactos(); }
      else if (name === 'mockup') openMockup(action.dataset.wsScreen);
      return;
    }
    const splitHost = target?.closest?.('[data-split-task]');
    if (splitHost && target.closest('[data-split-ask]')) { askSplit(splitHost); return; }
    if (splitHost && target.closest('[data-split-apply]')) { applySplit(splitHost); return; }
    if (splitHost && target.closest('[data-split-discard]')) { splits.delete(splitHost.dataset.splitTask); paintSplit(splitHost); return; }
    const step = target?.closest?.('[data-ws-step]');
    if (step) { runStep(step.dataset.wsStep); return; }
    const tests = target?.closest?.('[data-ws-tests]');
    if (tests) { runTests(tests.dataset.wsTests); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const open = target?.closest?.('[data-ws-open], [data-ws-edit]');
    if (open) { openArtefact(open.dataset.wsOpen || open.dataset.wsEdit); return; }
    const file = target?.closest?.('[data-ws-file]');
    if (file) { select(file.dataset.wsFile); return; }
    const add = target?.closest?.('[data-ws-add]');
    if (add) {
      view.adding = add.dataset.wsAdd;
      paintArtefactos();
      document.querySelector(`[data-ws-add-form="${view.adding}"] input`)?.focus();
      return;
    }
    const pane = target?.closest?.('[data-ws-pane]');
    if (pane) { view.pane = pane.dataset.wsPane; paintArtefactos(); return; }
    const line = target?.closest?.('[data-av-line]');
    if (line) { goToLine(Number(line.dataset.avLine)); return; }
    const screen = target?.closest?.('[data-ws-screen]');
    if (screen) { openMockup(screen.dataset.wsScreen); return; }
    const go = target?.closest?.('[data-ws-go]');
    if (go) { window.switchToTab?.(go.dataset.wsGo); return; }
    if (target?.closest?.('[data-ws-close]') || target?.classList?.contains('ios-sheet-backdrop')) closeSheet();
  });

  document.addEventListener('submit', (event) => {
    const addForm = event.target?.closest?.('[data-ws-add-form]');
    if (addForm) {
      event.preventDefault();
      const name = addForm.querySelector('input')?.value?.trim();
      if (name) createFile(addForm.dataset.wsAddForm, name);
      return;
    }
    if (event.target?.closest?.('[data-ws-ask-form]')) {
      event.preventDefault();
      askAi();
    }
  });

  /** A format problem's line, in the text: select it so the person sees where. */
  function goToLine(line) {
    const field = document.getElementById('artefactText');
    if (!field || !line) return;
    if (view.pane !== 'text') { view.pane = 'text'; paintArtefactos(); }
    const text = document.getElementById('artefactText');
    const lines = text.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((sum, entry) => sum + entry.length + 1, 0);
    text.focus();
    text.setSelectionRange(start, start + (lines[line - 1] || '').length);
  }

  // Typing only touches the draft: the file is written on Guardar and nowhere else.
  document.addEventListener('input', (event) => {
    if (event.target?.id !== 'artefactText') return;
    writeDraft(view.sel, event.target.value);
    const dirty = event.target.value !== view.content || view.isNew;
    document.querySelector('[data-ws-action="save"]')?.toggleAttribute('disabled', !dirty);
    const cancel = document.querySelector('.av-edit-bar [data-ws-action="cancel"]');
    if (cancel) cancel.textContent = dirty ? 'Descartar' : 'Fechar';
    const note = document.getElementById('artefactDirty');
    if (note) note.textContent = dirty ? DIRTY_NOTE : 'Sem alterações.';
    previewDraft();
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
    renderRequisitos: (project) => { renderArtefactos(project); select('@requisitos'); },
    openArtefact,
    select,
    openMockup,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
