/**
 * Decisões — what changed, and what it put in doubt.
 *
 * Read when something moved, not out of habit: the nav badge is the whole point, and the
 * screen is deliberately a flat chronology rather than a dashboard. A decision is either
 * waiting on you or it is history, and both read the same way.
 */
(function initDecisionsUi() {
  const state = { projectId: '', entries: [], summary: null, filter: 'all' };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api(path, options) { return window.apiRequest(path, options); }

  /** Per-device, per-project. A nudge, not an audit — see the route's comment. */
  function seenKey(projectId) { return `yourlab_decisions_seen_${projectId}`; }

  function lastSeen(projectId) {
    try { return localStorage.getItem(seenKey(projectId)) || ''; } catch { return ''; }
  }

  function markSeen(projectId, at) {
    try { if (at) localStorage.setItem(seenKey(projectId), at); } catch { /* private window */ }
  }

  function when(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours}h`;
    return new Date(iso).toLocaleDateString('pt-PT');
  }

  const STATUS = {
    proposed: { badge: 'badge-amber', label: 'à sua espera' },
    accepted: { badge: 'badge-green', label: 'aceite' },
    rejected: { badge: 'badge-gray', label: 'recusada' },
  };

  function entryRow(entry, unread) {
    const status = STATUS[entry.status] || { badge: 'badge-gray', label: entry.status };
    const origin = entry.source === 'task'
      ? `<button type="button" class="link-button" data-dec-open="${escapeHtml(entry.workItemId)}">${escapeHtml(entry.taskTitle || 'tarefa')}</button>`
      : `<span class="muted-text">fase ${escapeHtml(entry.stageId || '—')}</span>`;

    const moved = entry.artifact
      ? `<span class="dec-artifact">${escapeHtml(entry.artifact)}</span> mudou`
      : '';
    const doubt = (entry.affects || []).length
      ? ` · põe em causa <span class="dec-artifact">${(entry.affects || []).map(escapeHtml).join('</span>, <span class="dec-artifact">')}</span>`
      : '';

    return `
      <article class="dec-row${unread ? ' is-unread' : ''}">
        <div class="dec-head">
          <span class="section-badge ${status.badge}">${escapeHtml(status.label)}</span>
          ${Number.isInteger(entry.camada) ? `<span class="dec-camada">Camada ${entry.camada}</span>` : ''}
          <span class="muted-text">${escapeHtml(when(entry.decidedAt || entry.raisedAt))}</span>
        </div>
        <p class="dec-proposal">${escapeHtml(entry.proposal)}</p>
        ${moved ? `<p class="muted-text dec-meta">${moved}${doubt}</p>` : ''}
        ${entry.rationale ? `<p class="muted-text dec-why">${escapeHtml(entry.rationale)}</p>` : ''}
        ${(entry.opened || []).length ? `<p class="dec-opened">${escapeHtml(entry.openedWhy)} <strong>${
  (entry.opened || []).map(escapeHtml).join(', ')}</strong> pode ter de rever.</p>` : ''}
        <p class="muted-text dec-meta">${origin}${
  entry.decidedBy ? ` · decidida por ${escapeHtml(entry.decidedBy)}` : ''}</p>
      </article>`;
  }

  function paint() {
    const host = $('decisionsPanel');
    if (!host) return;
    const summary = state.summary;
    if (!summary) { host.innerHTML = '<p class="muted-text">Não foi possível ler o registo de decisões.</p>'; return; }

    if (!state.entries.length) {
      host.innerHTML = '<p class="muted-text">Ainda não há decisões. Aparecem aqui quando uma alteração puser outra coisa em causa.</p>';
      return;
    }

    const seen = state.seenAtLoad;
    const shown = state.filter === 'pending'
      ? state.entries.filter((entry) => entry.status === 'proposed')
      : state.entries;

    host.innerHTML = `
      <div class="dec-toolbar">
        <button type="button" class="btn tiny ${state.filter === 'all' ? 'primary' : 'ghost'}" data-dec-filter="all">Todas ${state.entries.length}</button>
        <button type="button" class="btn tiny ${state.filter === 'pending' ? 'primary' : 'ghost'}" data-dec-filter="pending">À espera de si ${summary.pending}</button>
      </div>
      ${shown.length
    ? shown.map((entry) => entryRow(entry, seen && String(entry.decidedAt || entry.raisedAt) > seen)).join('')
    : '<p class="muted-text">Nada à espera de si.</p>'}`;
  }

  async function load(projectId) {
    state.projectId = projectId || state.projectId;
    if (!state.projectId) return;
    // Captured before marking seen, so the first paint can still show what is new.
    state.seenAtLoad = lastSeen(state.projectId);
    try {
      const payload = await api(`/${state.projectId}/decisions-log?since=${encodeURIComponent(state.seenAtLoad)}`);
      state.entries = payload.entries || [];
      state.summary = payload;
      markSeen(state.projectId, payload.latestAt);
      window.DecisionsUI?.onCount?.(0);
    } catch (error) {
      state.summary = null;
      window.showToast?.(error.message, 'error');
    }
    paint();
  }

  /** The nav badge: how much has moved since this device last looked. */
  async function unreadCount(projectId) {
    if (!projectId) return 0;
    try {
      const payload = await api(`/${projectId}/decisions-log?since=${encodeURIComponent(lastSeen(projectId))}`);
      return Number(payload.unread) || 0;
    } catch {
      return 0;
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target?.closest || !$('decisionsPanel')?.contains(target)) return;

    const filter = target.getAttribute?.('data-dec-filter');
    if (filter) { state.filter = filter; paint(); return; }

    const open = target.getAttribute?.('data-dec-open');
    if (open) window.switchToTab?.('tarefas', { workItemId: open });
  });

  window.DecisionsUI = { render: load, refresh: load, unreadCount };

  // Deferred scripts can finish after the app's render pass; without this a deep link
  // straight to this tab paints nothing, silently.
  function renderIfAlreadyOpen() {
    const panel = document.querySelector('[data-panel="decisoes"]');
    if (!panel || panel.classList.contains('hidden')) return;
    const projectId = new URLSearchParams(window.location.search).get('project')
      || localStorage.getItem('requirements_platform_last_project')
      || '';
    if (projectId) load(projectId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderIfAlreadyOpen);
  } else {
    renderIfAlreadyOpen();
  }
})();
