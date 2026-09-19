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
    paintPlano();
  }

  /* ------------------------------------------------------------ reading */

  async function load(projectId, { autoSync = true } = {}) {
    if (!projectId) return;
    if (state.projectId !== projectId) {
      Object.assign(state, { projectId, data: null, error: '', changeRequestUrl: '' });
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
      const request = response.changeRequest || {};
      state.changeRequestUrl = request.url || request.html_url || request.webUrl || request.web_url || '';
      window.showToast?.('Pedido de alteração aberto no repositório. Aceite-o e toque em Actualizar.', 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.initializing = false;
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
    if (isClient()) return '';
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
        ? 'O repositório ainda não tem a pasta yourlab/. Crie-a a partir do que a plataforma já sabe, ou peça a qualquer AI que siga o GUIDE.md.'
        : 'Ainda não foi lido do repositório.';
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

  function phaseFold(phase, requirementCount) {
    const k = kit();
    const [tone, label] = PHASE_BADGE[phase.status] || PHASE_BADGE.planned;
    const meta = [phase.weeks ? `${phase.weeks} semana${phase.weeks === 1 ? '' : 's'}` : '', `${phase.features.length} feature${phase.features.length === 1 ? '' : 's'}`]
      .filter(Boolean).join(' · ');
    const features = phase.features.map((feature) => `
      <div class="ios-row is-static">
        <span class="ios-row-main">
          <span class="ios-row-title">${esc(feature.title)}</span>
          ${feature.text ? `<span class="ios-row-sub ios-wrap">${esc(feature.text)}</span>` : ''}
        </span>
        ${feature.requirements.length ? `<span class="ios-chips">${feature.requirements.map((capability) => `
          <span class="ios-chip" title="Requisitos em openspec/specs/${esc(capability)}/">${esc(capability)} · ${requirementCount(capability)}</span>`).join('')}</span>` : ''}
      </div>`).join('');
    return `
      <details class="ios-fold">
        <summary class="ios-row">
          <span class="ios-row-index">${phase.number}</span>
          <span class="ios-row-main">
            <span class="ios-row-title">${esc(phase.title)}</span>
            <span class="ios-row-sub">${esc(meta)}</span>
          </span>
          ${k.badge(tone, label)}
        </summary>
        <div class="ios-fold-body">
          ${prose(phase.objective)}
          ${features ? `<h3 class="ios-group-label">Features</h3><div class="ios-list ios-sublist">${features}</div>` : ''}
          ${phase.deliverables.length ? `<h3 class="ios-group-label">Entregáveis</h3><div class="ios-list ios-sublist">${staticRows(phase.deliverables)}</div>` : ''}
        </div>
      </details>`;
  }

  function paintPlano() {
    const host = document.getElementById('planoWorkspace');
    const project = state.planoProject;
    if (!host || !project || !kit()) return;
    const snap = forProject(project.id);
    const current = workspace();

    const head = `
      <header class="ios-page-head">
        <div>
          <h1 class="ios-large-title">Plano</h1>
          <p class="ios-subtitle">${esc(snap?.initialized
    ? `Do repositório · yourlab/ · lido ${kit().ago(current?.syncedAt)}`
    : 'Propósito, fases e o que cada fase entrega.')}</p>
        </div>
        <div class="ios-page-actions">${snap?.initialized ? syncButton() : ''}</div>
      </header>`;

    if (!snap?.initialized) {
      const legacy = (project.phases || []).map((phase, index) => `
        <div class="ios-row is-static">
          <span class="ios-row-index">${index + 1}</span>
          <span class="ios-row-main"><span class="ios-row-title">${esc(String(phase.name || '').replace(/^\s*fase\s*\d+\s*[-–·:]\s*/i, '') || `Fase ${index + 1}`)}</span></span>
          ${Number(phase.durationWeeks) ? `<span class="ios-row-meta">${Number(phase.durationWeeks)} semanas</span>` : ''}
        </div>`).join('');
      host.innerHTML = `
        ${head}
        ${statusCard()}
        ${legacy ? `<section class="ios-section"><h2 class="ios-section-title">Fases guardadas na plataforma</h2><div class="ios-list">${legacy}</div>
          <p class="ios-footnote">Estas passam para yourlab/phases/ quando a pasta for criada. A partir daí, o plano vive no repositório.</p></section>` : ''}`;
      return;
    }

    const counts = new Map(snap.requirements.map((spec) => [spec.capability, spec.requirements.length]));
    const requirementCount = (capability) => counts.get(capability) ?? 0;
    const project_ = snap.project;

    host.innerHTML = `
      ${head}
      <section class="ios-section">
        <h2 class="ios-section-title">Propósito</h2>
        <div class="ios-card">${prose(project_.purpose)}${project_.context ? `<h3 class="ios-group-label">Contexto</h3>${prose(project_.context)}` : ''}</div>
      </section>
      <section class="ios-section">
        <h2 class="ios-section-title">Fases</h2>
        ${snap.phases.length
    ? `<div class="ios-list ios-fold-list">${snap.phases.map((phase) => phaseFold(phase, requirementCount)).join('')}</div>`
    : '<div class="ios-list"><div class="ios-row is-static"><span class="ios-row-sub ios-wrap">Ainda sem fases. Cada fase é um ficheiro em yourlab/phases/ — ver GUIDE.md.</span></div></div>'}
      </section>
      ${project_.risks.length ? `<section class="ios-section"><h2 class="ios-group-label">Riscos</h2><div class="ios-list">${staticRows(project_.risks)}</div></section>` : ''}
      ${project_.assumptions.length ? `<section class="ios-section"><h2 class="ios-group-label">Assunções</h2><div class="ios-list">${staticRows(project_.assumptions)}</div></section>` : ''}
      <p class="ios-footnote">Para mudar o plano, edite yourlab/project.md e yourlab/phases/ no repositório — as regras estão em yourlab/GUIDE.md — e toque em Actualizar.</p>`;
  }

  function renderPlano(project) {
    if (!project) return;
    state.planoProject = project;
    paintPlano();
    load(project.id);
  }

  /* ------------------------------------------------------------ wiring */

  document.addEventListener('click', (event) => {
    const target = event.target;
    const action = target?.closest?.('[data-ws-action]');
    if (action) {
      const name = action.dataset.wsAction;
      if (name === 'sync') sync();
      else if (name === 'initialize') initialize();
      else if (name === 'mockup') openMockup(action.dataset.wsScreen);
      return;
    }
    const screen = target?.closest?.('[data-ws-screen]');
    if (screen) { openMockup(screen.dataset.wsScreen); return; }
    const go = target?.closest?.('[data-ws-go]');
    if (go) { window.switchToTab?.(go.dataset.wsGo); return; }
    if (target?.closest?.('[data-ws-close]') || target?.classList?.contains('ios-sheet-backdrop')) closeSheet();
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
    renderPlano,
    openMockup,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
