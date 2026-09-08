/**
 * The entry screen. Opening the platform should answer one question before any other:
 * what did the agents do while I was away, and what is waiting on me?
 *
 * So this leads the Projetos page — counts first, then the projects that are actually
 * asking for something, with a single way through to the work.
 */
(function initResumeUi() {
  const state = { data: null, loading: false, loadedOnce: false };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isPartnerOrAdmin() {
    return window.isSuperAdmin?.() === true || window.isPartnerEditor?.() === true;
  }

  function ago(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.round(hours / 24);
    return `há ${days} dia${days === 1 ? '' : 's'}`;
  }

  /** The headline numbers. A zero is still worth showing: it means "nothing pending". */
  function renderTotals(totals) {
    const tiles = [
      ['awaitingReview', 'A aguardar a sua revisão', 'tone-review'],
      ['running', 'A correr agora', 'tone-running'],
      ['failed', 'Parado ou falhado', 'tone-failed'],
    ];
    return `<div class="resume-totals">${tiles.map(([key, label, tone]) => `
      <div class="resume-tile ${tone}${totals[key] ? '' : ' is-zero'}">
        <span class="resume-tile-count">${totals[key] || 0}</span>
        <span class="resume-tile-label">${label}</span>
      </div>`).join('')}</div>`;
  }

  /** One line per project, saying what it wants — not what it is. */
  function renderProjectRow(entry) {
    const chips = [];
    if (entry.awaitingReview) chips.push(`<span class="section-badge badge-amber">${entry.awaitingReview} a rever</span>`);
    if (entry.running) chips.push('<span class="section-badge badge-green">a correr</span>');
    if (entry.failed) chips.push(`<span class="section-badge badge-red">${entry.failed} parado</span>`);
    if (!entry.hasRepository) chips.push('<span class="section-badge badge-gray">sem repositório</span>');

    // The most useful sentence is whatever the project is currently stuck on.
    let detail = '';
    if (entry.execucao?.question) {
      detail = `Pergunta de <code>${escapeHtml(entry.execucao.question.personaId)}</code>: ${escapeHtml(entry.execucao.question.text)}`;
    } else if (entry.execucao?.haltReason) {
      detail = escapeHtml(entry.execucao.haltReason);
    } else if (entry.execucao?.goal) {
      detail = `${escapeHtml(entry.execucao.goal)}${entry.execucao.currentPersonaId ? ` — <code>${escapeHtml(entry.execucao.currentPersonaId)}</code>` : ''}`;
    } else if (!entry.hasRepository) {
      detail = 'Sem repositório ligado, não pode executar.';
    }

    return `
      <li class="resume-row">
        <div class="resume-row-main">
          <button type="button" class="btn link resume-open" data-project-id="${escapeHtml(entry.projectId)}">${escapeHtml(entry.name)}</button>
          <span class="muted-text">${escapeHtml(entry.clientName || '—')}${entry.lastActivityAt ? ` · ${escapeHtml(ago(entry.lastActivityAt))}` : ''}</span>
          ${detail ? `<p class="muted-text resume-row-detail">${detail}</p>` : ''}
        </div>
        <div class="resume-row-chips">${chips.join(' ')}</div>
      </li>`;
  }

  function paint() {
    const host = $('resumePanel');
    if (!host) return;

    // Clients get the project list as before; this screen is about agent work.
    if (!isPartnerOrAdmin()) { host.hidden = true; return; }
    host.hidden = false;

    if (state.loading && !state.data) {
      host.innerHTML = '<p class="muted-text">A ver o que aconteceu…</p>';
      return;
    }
    if (!state.data) {
      host.innerHTML = '<p class="muted-text">Não foi possível ler o resumo.</p>';
      return;
    }

    const { totals, projects } = state.data;
    const needsYou = projects.filter((entry) => entry.awaitingReview || entry.failed || entry.running);

    host.innerHTML = `
      <div class="panel-title-row">
        <div>
          <h3 class="panel-heading">Enquanto esteve fora</h3>
          <p class="muted-text">${totals.projects} projecto(s) · lido ${escapeHtml(ago(state.data.observedAt) || 'agora mesmo')}</p>
        </div>
        <button type="button" class="btn tiny ghost" id="resumeRefreshBtn" title="Voltar a ler">↺</button>
      </div>
      ${renderTotals(totals)}
      ${needsYou.length
        ? `<ul class="resume-list mt-12">${needsYou.map(renderProjectRow).join('')}</ul>
           ${totals.awaitingReview
             ? '<div class="resume-cta mt-12"><button type="button" class="btn primary" id="resumeReviewBtn">Rever o que está à espera</button></div>'
             : ''}`
        : '<p class="muted-text mt-12">Nada à espera de si. Nenhuma execução a correr.</p>'}`;
  }

  async function load({ force = false } = {}) {
    if (!isPartnerOrAdmin()) { paint(); return; }
    if (state.loading) return;
    if (state.loadedOnce && !force) { paint(); return; }
    state.loading = true;
    paint();
    try {
      state.data = await window.apiRequest('/resume');
      state.loadedOnce = true;
    } catch (error) {
      state.data = null;
      window.showToast?.(error.message, 'error');
    } finally {
      state.loading = false;
      paint();
    }
  }

  /**
   * The point of the screen is to get to the work. Opening the project and landing on
   * Tarefas is the whole path — one click, no intermediate stop.
   */
  function openProject(projectId, tab) {
    window.loadProjectById?.(projectId, { tab })
      ?.catch?.((error) => window.showToast?.(error.message, 'error'));
  }

  document.addEventListener('click', (event) => {
    const open = event.target?.closest?.('.resume-open');
    if (open) { openProject(open.dataset.projectId, 'deliveryos'); return; }
    const id = event.target?.id;
    if (id === 'resumeRefreshBtn') load({ force: true });
    else if (id === 'resumeReviewBtn') {
      const first = (state.data?.projects || []).find((entry) => entry.awaitingReview);
      if (first) openProject(first.projectId, 'tarefas');
    }
  });

  window.ResumeUI = { render: () => load(), refresh: () => load({ force: true }) };
})();
