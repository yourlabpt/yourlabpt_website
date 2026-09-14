/**
 * The entry screens: Hoje, and the top of Projetos.
 *
 * Opening the platform should answer one question before any other: what did the agents
 * do while I was away, and what is waiting on me? Hoje is that answer on a page of its
 * own. Projetos leads with the same waiting items as cards and marks every project row
 * from the same read, so the two screens can never disagree.
 *
 * Also defines `window.IosKit`: the few drawing helpers the iOS screens share (icons,
 * initials, stage names, the project status badge), so each is defined once.
 */
(function initResumeUi() {
  const state = {
    data: null,
    loading: false,
    loadedAt: 0,
    filter: 'all',
    later: new Set(),
    projects: [],
    selectedId: null,
  };

  // A read younger than this is reused when a screen opens; the refresh button forces one.
  const FRESH_FOR_MS = 60 * 1000;

  const STAGE_LABELS = {
    idea: 'Ideia',
    discovery: 'Descoberta',
    requirements: 'Requisitos',
    architecture: 'Arquitectura',
    roadmap: 'Roadmap',
    implementation: 'Implementação',
    validation: 'Validação',
    delivery: 'Entrega',
    operations: 'Operação',
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(value, currency) {
    try {
      return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: currency || 'USD' }).format(Number(value) || 0);
    } catch {
      return `${(Number(value) || 0).toFixed(2)} ${currency || ''}`.trim();
    }
  }

  // One icon set for the platform (ios-icons.js); "chevron" is a row's disclosure arrow.
  function icon(name, size = 18, extraClass = '') {
    return window.IosIcons?.svg(name === 'chevron' ? 'chevronRight' : name, { size, className: extraClass }) || '';
  }

  function ago(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return `há ${days} dia${days === 1 ? '' : 's'}`;
  }

  function initials(name) {
    const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '·';
  }

  function stageLabel(stageId) {
    return STAGE_LABELS[stageId] || stageId || '';
  }

  function stageBar(stage) {
    if (!stage || stage.index < 0 || !stage.total) return '';
    const segments = Array.from({ length: stage.total }, (_, index) => {
      const cls = index < stage.index ? 'is-done' : index === stage.index ? 'is-current' : '';
      return `<span class="${cls}"></span>`;
    }).join('');
    return `<span class="ios-stagebar" aria-hidden="true">${segments}</span>`;
  }

  function stageText(stage) {
    if (!stage || stage.index < 0) return '';
    return `${stageLabel(stage.id)} · ${stage.index + 1} de ${stage.total}`;
  }

  function badge(tone, text) {
    return `<span class="ios-badge badge-${tone}">${escapeHtml(text)}</span>`;
  }

  /** What a project row says about itself — the action it needs, or that it needs none. */
  function projectStatusBadge(project, entry) {
    if (project?.status === 'on_hold') return badge('gray', 'Em pausa');
    if (!entry) return '';
    if (entry.awaitingReview) return badge('amber', 'À espera de si');
    if (entry.failed) return badge('red', 'Falhou');
    if (entry.running) return badge('green', 'Em curso');
    return badge('gray', 'Sem execução');
  }

  /** A question is named by what answering it does, and opens where it is answered. */
  function describeQuestion(question) {
    const about = `${question?.artifact || ''}`;
    if (question?.personaId === 'ux' || /mockup/i.test(about)) {
      return { title: 'Aprovar mockup', action: 'Ver mockup', icon: 'image', tab: 'camada0' };
    }
    if (question?.personaId === 'developer' || /code|commit/i.test(about)) {
      return { title: 'Rever antes do commit', action: 'Ver alterações', icon: 'code', tab: 'tarefas' };
    }
    return { title: 'Responder a uma pergunta', action: 'Responder', icon: 'check', tab: 'tarefas' };
  }

  function canSee() {
    return window.isSuperAdmin?.() === true || window.isPartnerEditor?.() === true;
  }

  function entries() {
    return state.data?.projects || [];
  }

  function entryFor(projectId) {
    return entries().find((entry) => entry.projectId === projectId) || null;
  }

  /* ------------------------------------------------------------ what the screens list */

  function waitingItems() {
    const out = [];
    for (const entry of entries()) {
      const question = entry.execucao?.question;
      if (question) {
        out.push({
          key: `q:${entry.execucao.id}`,
          projectId: entry.projectId,
          projectName: entry.name,
          who: question.personaLabel || question.personaId,
          when: question.raisedAt,
          body: question.text,
          ...describeQuestion(question),
        });
      }
      for (const item of entry.attention || []) {
        if (item.tone !== 'review') continue;
        out.push({
          key: `t:${item.id}`,
          projectId: entry.projectId,
          projectName: entry.name,
          title: 'Rever resultado',
          action: 'Ver resultado',
          icon: 'check',
          tab: 'tarefas',
          who: item.label,
          when: item.updatedAt,
          body: item.title,
        });
      }
    }
    return out.sort((a, b) => String(b.when).localeCompare(String(a.when)));
  }

  /** The Execução's spend as a thin bar and a figure, the way the phone's Hoje row shows it. */
  function budgetLine(budget) {
    if (!budget) return '';
    const spent = Number(budget.spentUsd) || 0;
    const cap = Number(budget.maxCostUsd) || 0;
    const pct = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
    const figure = `${money(spent, budget.currency)}${cap ? ` de ${money(cap, budget.currency)}` : ''}`;
    return `<span class="ios-row-budget"><span class="ios-meter-bar"><span class="${pct >= 80 ? 'is-high' : ''}" style="width: ${pct}%"></span></span><span class="ios-row-meta">${escapeHtml(figure)}</span></span>`;
  }

  function runningItems() {
    return entries()
      .filter((entry) => entry.execucao?.status === 'running')
      .map((entry) => ({
        projectId: entry.projectId,
        lead: `<span class="ios-tile">${escapeHtml(initials(entry.name))}</span>`,
        title: entry.name,
        sub: [entry.execucao.currentPersonaLabel || 'A preparar o próximo passo', entry.execucao.goal].filter(Boolean).join(' · '),
        tab: 'projeto',
        extra: budgetLine(entry.execucao.budget),
      }));
  }

  function failedItems() {
    const out = [];
    for (const entry of entries()) {
      const execucao = entry.execucao;
      if (execucao && (execucao.status === 'halted' || execucao.status === 'paused_budget')) {
        out.push({
          projectId: entry.projectId,
          title: execucao.status === 'paused_budget' ? 'Execução sem orçamento' : 'Execução parada',
          sub: [entry.name, execucao.haltReason].filter(Boolean).join(' · '),
          tab: 'projeto',
        });
      }
      for (const item of entry.attention || []) {
        if (item.tone !== 'failed') continue;
        out.push({ projectId: entry.projectId, title: item.title, sub: `${entry.name} · ${item.label}`, meta: ago(item.updatedAt), tab: 'tarefas' });
      }
    }
    return out;
  }

  /* ------------------------------------------------------------ drawing */

  function row({ lead = '', title, sub = '', meta = '', extra = '', projectId, tab }) {
    return `
      <button type="button" class="ios-row" data-open-project="${escapeHtml(projectId)}" data-open-tab="${escapeHtml(tab)}">
        ${lead}
        <span class="ios-row-main">
          <span class="ios-row-title">${escapeHtml(title)}</span>
          ${sub ? `<span class="ios-row-sub">${escapeHtml(sub)}</span>` : ''}
          ${extra}
        </span>
        ${meta ? `<span class="ios-row-meta">${escapeHtml(meta)}</span>` : ''}
        ${icon('chevron', 14, 'ios-chevron')}
      </button>`;
  }

  function staticRow(text) {
    return `<div class="ios-row is-static"><span class="ios-row-main"><span class="ios-row-sub">${escapeHtml(text)}</span></span></div>`;
  }

  function group(label, inner) {
    return `<section class="ios-section"><h2 class="ios-group-label">${escapeHtml(label)}</h2><div class="ios-list">${inner}</div></section>`;
  }

  function paintHoje() {
    const host = $('hojePanel');
    if (!host) return;

    const observed = state.data ? `${state.data.totals.projects} projecto(s) · lido ${ago(state.data.observedAt) || 'agora mesmo'}` : '';
    const head = `
      <header class="ios-page-head">
        <div>
          <h1 class="ios-large-title">Hoje</h1>
          ${observed ? `<p class="ios-subtitle">${escapeHtml(observed)}</p>` : ''}
        </div>
        <div class="ios-page-actions">
          <button type="button" class="btn ios-round" data-resume-refresh title="Voltar a ler" aria-label="Voltar a ler">${icon('refresh')}</button>
        </div>
      </header>`;

    if (!canSee()) {
      host.innerHTML = `${head}${group('À espera de si', staticRow('Esta página é para quem acompanha as execuções. Os seus projectos estão em Projetos.'))}`;
      return;
    }
    if (!state.data) {
      host.innerHTML = `${head}${group('À espera de si', staticRow(state.loading ? 'A ver o que aconteceu…' : 'Não foi possível ler o que aconteceu. Tente de novo com o botão acima.'))}`;
      return;
    }

    const waiting = waitingItems();
    const running = runningItems();
    const failed = failedItems();

    const waitingRows = waiting.map((item) => row({
      lead: `<span class="ios-tile">${icon(item.icon)}</span>`,
      title: item.title,
      sub: `${item.projectName} · ${item.body || item.who || ''}`,
      meta: ago(item.when),
      projectId: item.projectId,
      tab: item.tab,
    })).join('');

    host.innerHTML = `
      ${head}
      ${group('À espera de si', waitingRows || staticRow('Nada à espera de si.'))}
      ${running.length ? group('Em curso', running.map(row).join('')) : ''}
      ${failed.length ? group('Falhou', failed.map((item) => row({
        ...item,
        lead: `<span class="ios-tile is-danger">${icon('alert')}</span>`,
      })).join('')) : ''}`;
  }

  function paintProjects() {
    const list = Array.isArray(state.projects) ? state.projects : [];

    const subtitle = $('projectsSubtitle');
    if (subtitle) {
      const paused = list.filter((project) => project.status === 'on_hold').length;
      const active = list.length - paused;
      subtitle.textContent = list.length
        ? `${active} activo${active === 1 ? '' : 's'}${paused ? ` · ${paused} em pausa` : ''}`
        : '';
    }

    const panel = $('resumePanel');
    if (panel) {
      const cards = canSee() ? waitingItems().filter((item) => !state.later.has(item.key)).slice(0, 4) : [];
      panel.hidden = !cards.length;
      panel.innerHTML = cards.length ? `
        <div class="ios-section-head">
          <h2 class="ios-section-title">À espera de si <span class="ios-count">${cards.length}</span></h2>
        </div>
        <div class="ios-cards">${cards.map((item) => `
          <article class="ios-card">
            <div class="ios-card-head">
              <span class="ios-tile is-large">${icon(item.icon, 20)}</span>
              <span class="ios-row-main">
                <span class="ios-card-title">${escapeHtml(item.title)}</span>
                <span class="ios-row-sub">${escapeHtml([item.projectName, item.who].filter(Boolean).join(' · '))}</span>
              </span>
              <span class="ios-row-meta">${escapeHtml(ago(item.when))}</span>
            </div>
            ${item.body ? `<p class="ios-card-body">${escapeHtml(item.body)}</p>` : ''}
            <div class="ios-card-actions">
              <button type="button" class="btn primary" data-open-project="${escapeHtml(item.projectId)}" data-open-tab="${escapeHtml(item.tab)}">${escapeHtml(item.action)}</button>
              <button type="button" class="btn" data-resume-later="${escapeHtml(item.key)}">Mais tarde</button>
            </div>
          </article>`).join('')}
        </div>` : '';
    }

    const filter = $('projectsFilter');
    if (filter) {
      const options = [['all', 'Todos'], ['active', 'Activos'], ['paused', 'Em pausa']];
      filter.innerHTML = options.map(([id, label]) => `
        <button type="button" role="tab" class="ios-segment ${state.filter === id ? 'is-active' : ''}" aria-selected="${state.filter === id}" data-projects-filter="${id}">${label}</button>`).join('');
    }

    const grid = $('projectsPageGrid');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = staticRow('Ainda não há projectos. Use «Novo projecto» para criar o primeiro.');
      return;
    }
    const shown = list.filter((project) => {
      if (state.filter === 'paused') return project.status === 'on_hold';
      if (state.filter === 'active') return project.status !== 'on_hold';
      return true;
    });
    grid.innerHTML = shown.map((project) => {
      const entry = entryFor(project.id);
      const stage = entry?.stage;
      return `
        <button type="button" class="ios-row ios-project-row ${state.selectedId === project.id ? 'is-selected' : ''}" data-project-id="${escapeHtml(project.id)}">
          <span class="ios-tile is-large">${escapeHtml(initials(project.name))}</span>
          <span class="ios-row-main">
            <span class="ios-row-title">${escapeHtml(project.name)}</span>
            <span class="ios-row-sub">${escapeHtml(project.clientName || '—')}</span>
            ${stageText(stage) ? `<span class="ios-row-sub ios-mobile-only">${escapeHtml(stageText(stage))}</span>` : ''}
          </span>
          <span class="ios-project-stage">${stageBar(stage)}${stageText(stage) ? `<span class="ios-row-sub">${escapeHtml(stageText(stage))}</span>` : ''}</span>
          <span class="ios-project-status">${projectStatusBadge(project, entry)}</span>
          ${icon('chevron', 14, 'ios-chevron')}
        </button>`;
    }).join('') || staticRow('Nenhum projecto neste filtro.');
  }

  function paintAll() {
    paintHoje();
    paintProjects();
  }

  async function load({ force = false } = {}) {
    if (!canSee()) { paintAll(); return; }
    if (state.loading) return;
    if (state.data && !force && Date.now() - state.loadedAt < FRESH_FOR_MS) { paintAll(); return; }
    state.loading = true;
    paintAll();
    try {
      state.data = await window.apiRequest('/resume');
      state.loadedAt = Date.now();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.loading = false;
      paintAll();
      window.ProjectHomeUI?.refreshAttention?.();
    }
  }

  function openProject(projectId, tab) {
    if (!projectId) return;
    if (window.state?.selectedProject?.id === projectId) {
      window.switchToTab?.(tab);
      return;
    }
    window.loadProjectById?.(projectId, { tab })
      ?.catch?.((error) => window.showToast?.(error.message, 'error'));
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    const open = target?.closest?.('[data-open-project]');
    if (open) { openProject(open.dataset.openProject, open.dataset.openTab || 'projeto'); return; }
    if (target?.closest?.('[data-resume-refresh]')) { load({ force: true }); return; }
    const later = target?.closest?.('[data-resume-later]');
    if (later) { state.later.add(later.dataset.resumeLater); paintProjects(); return; }
    const filter = target?.closest?.('[data-projects-filter]');
    if (filter) { state.filter = filter.dataset.projectsFilter; paintProjects(); }
  });

  window.IosKit = {
    icon, escapeHtml, ago, initials, stageLabel, stageBar, stageText, badge, projectStatusBadge, describeQuestion, money,
  };

  window.ResumeUI = {
    render: () => load(),
    refresh: () => load({ force: true }),
    load,
    entryFor,
    renderHoje: () => { paintHoje(); load(); },
    renderProjects: (projects, selectedId) => {
      state.projects = projects || [];
      state.selectedId = selectedId || null;
      paintProjects();
      load();
    },
  };
})();
