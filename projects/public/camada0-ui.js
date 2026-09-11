/**
 * Camada 0 — the screen for deciding, not for configuring.
 *
 * The intention that produced a mockup sits beside the mockup itself, and there are
 * exactly three actions: Aprovar, Pedir alteração, Descartar. Nothing else belongs here;
 * limits and models are configured elsewhere, and putting them on this screen would turn
 * a judgement into a form.
 */
(function initCamada0Ui() {
  const state = { projectId: '', sessions: [], openSessionId: '', busy: false };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api(path, options) {
    return window.apiRequest(path, options);
  }

  function openSession() {
    return state.sessions.find((entry) => entry.id === state.openSessionId) || state.sessions[0] || null;
  }

  /**
   * The mockup itself, sandboxed. See lib/mockup-routes.js for why this is safe.
   *
   * An iframe cannot carry the Authorization header the rest of the app uses, so the
   * frame is filled in after a one-minute view ticket comes back. Painted empty first
   * and filled asynchronously, so a slow ticket never blocks the rest of the screen.
   */
  function frameFor(session, iteration) {
    if (!iteration) return '<p class="muted-text">Ainda não há nenhuma versão. Gere a primeira.</p>';
    return `<div class="camada0-frame-slot" data-c0-frame="${escapeHtml(session.id)}|${escapeHtml(iteration.id)}">
      <p class="muted-text">A abrir o ecrã…</p></div>`;
  }

  async function fillFrames() {
    const slots = $('camada0Panel')?.querySelectorAll('[data-c0-frame]') || [];
    for (const slot of slots) {
      const [sessionId, iterationId] = slot.getAttribute('data-c0-frame').split('|');
      try {
        const { ticket } = await api(
          `/${state.projectId}/mockups/${sessionId}/${iterationId}/ticket`,
          { method: 'POST', body: {} },
        );
        const src = `${'/api/projects'}/${encodeURIComponent(state.projectId)}/mockups/`
          + `${encodeURIComponent(sessionId)}/${encodeURIComponent(iterationId)}/render`
          + `?t=${encodeURIComponent(ticket)}`;
        // The frame is fully sandboxed, so the parent deliberately cannot see whether it
        // painted — a blocked frame and a blank one look identical from out here, and a
        // browser or extension that refuses sandboxed frames would leave a silent white
        // box. Rather than guess, the escape hatch is always present: it is also simply
        // the better way to look at a full screen. Opening it directly is equally safe,
        // because the sandbox travels in the response header, not in the attribute.
        slot.innerHTML = `<iframe class="camada0-frame" src="${escapeHtml(src)}" sandbox="" referrerpolicy="no-referrer" title="Mockup"></iframe>`
          + `<p class="camada0-fallback">
             <button type="button" class="btn tiny ghost" data-c0-popout="${escapeHtml(sessionId)}|${escapeHtml(iterationId)}">Abrir em tamanho real</button>
             <span class="muted-text">Se o ecrã não aparecer aqui, o seu navegador está a bloquear a moldura.</span></p>`;
      } catch (error) {
        slot.innerHTML = `<p class="badge-red camada0-note">Não foi possível abrir este ecrã: ${escapeHtml(error.message)}</p>`;
      }
    }
  }

  function historyRows(session) {
    if (session.iterations.length < 2) return '';
    const rows = session.iterations.map((entry, index) => {
      const badge = entry.verdict === 'approved' ? '<span class="section-badge badge-green">aprovada</span>'
        : entry.verdict === 'discarded' ? '<span class="section-badge badge-gray">descartada</span>'
          : entry.verdict === 'changes' ? '<span class="section-badge badge-amber">pedida alteração</span>' : '';
      const moved = index === 0 ? 'primeira versão' : `${entry.changedLines} linha(s) mudaram`;
      return `<button type="button" class="camada0-history-row${
        entry.id === session.latestIterationId ? ' is-current' : ''
      }" data-c0-show="${escapeHtml(entry.id)}">
        <span>Versão ${index + 1}</span>
        <span class="muted-text">${escapeHtml(moved)}</span>
        ${badge}
      </button>`;
    });
    return `<details class="mt-8"><summary>Versões anteriores <span class="muted-text">${session.iterations.length}</span></summary>
      <div class="camada0-history">${rows.join('')}</div></details>`;
  }

  function sessionView(session) {
    const shown = session.iterations.find((entry) => entry.id === state.shownIterationId)
      || session.iterations[session.iterations.length - 1]
      || null;
    const closed = session.status !== 'iterating';

    const settled = session.settled
      ? `<p class="badge-amber camada0-note">${escapeHtml(session.settledHint)}</p>`
      : '';
    const blocked = session.blockedReason && !closed
      ? `<p class="badge-red camada0-note">${escapeHtml(session.blockedReason)}</p>`
      : '';

    const actions = closed
      ? `<p class="muted-text">Sessão ${session.status === 'approved' ? 'aprovada' : 'descartada'}.</p>`
      : `<div class="camada0-actions">
          <button type="button" class="btn primary" data-c0-verdict="approved" ${shown ? '' : 'disabled'}>Aprovar</button>
          <button type="button" class="btn ghost" data-c0-ask>Pedir alteração</button>
          <button type="button" class="btn ghost" data-c0-verdict="discarded">Descartar</button>
        </div>`;

    return `
      <div class="camada0-split">
        <div class="camada0-intent">
          <p class="muted-text" style="margin:0 0 4px">A intenção</p>
          <p style="margin:0 0 8px">${escapeHtml(session.promptText)}</p>
          <p class="muted-text">${session.iterationsUsed} de ${session.maxIterations} tentativas · $${
  Number(session.spentUsd || 0).toFixed(2)} de $${Number(session.maxCostUsd || 0).toFixed(2)}</p>
          ${settled}
          ${blocked}
          ${actions}
          <label class="camada0-ask hidden" data-c0-ask-box>
            <span class="field-label">O que quer mudar?</span>
            <textarea id="c0AskText" rows="3" placeholder="ex.: a lista de mesas devia estar em cima, e falta o estado de cada reserva"></textarea>
            <button type="button" class="btn primary mt-8" data-c0-iterate>Gerar nova versão</button>
          </label>
          ${historyRows(session)}
        </div>
        <div class="camada0-preview">${frameFor(session, shown)}</div>
      </div>`;
  }

  function paint() {
    const host = $('camada0Panel');
    if (!host) return;
    if (state.busy) {
      host.innerHTML = '<p class="muted-text">A gerar o ecrã…</p>';
      return;
    }
    const session = openSession();
    const picker = state.sessions.length > 1
      ? `<div class="camada0-picker">${state.sessions.map((entry) => (
        `<button type="button" class="btn tiny ${entry.id === session?.id ? 'primary' : 'ghost'}" data-c0-open="${escapeHtml(entry.id)}">${
          escapeHtml(entry.title || entry.promptText.slice(0, 40))}</button>`
      )).join('')}</div>`
      : '';

    const starter = `
      <details class="mt-8" ${session ? '' : 'open'}>
        <summary>Nova intenção</summary>
        <label class="camada0-ask">
          <span class="field-label">Descreva em duas ou três frases o que quer ver</span>
          <textarea id="c0NewPrompt" rows="3" placeholder="ex.: um ecrã onde a recepção vê as mesas do dia e marca uma reserva em dois cliques"></textarea>
          <button type="button" class="btn primary mt-8" data-c0-start>Gerar o primeiro ecrã</button>
        </label>
      </details>`;

    host.innerHTML = picker + (session ? sessionView(session) : '<p class="muted-text">Ainda não refinou nenhuma intenção neste projecto.</p>') + starter;
    fillFrames();
  }

  async function load(projectId) {
    state.projectId = projectId || state.projectId;
    if (!state.projectId) return;
    try {
      const payload = await api(`/${state.projectId}/mockups`);
      state.sessions = payload.sessions || [];
      if (!state.sessions.some((entry) => entry.id === state.openSessionId)) {
        state.openSessionId = state.sessions[0]?.id || '';
        state.shownIterationId = '';
      }
    } catch (error) {
      state.sessions = [];
      window.showToast?.(error.message, 'error');
    }
    paint();
  }

  async function run(fn) {
    state.busy = true;
    paint();
    try {
      await fn();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.busy = false;
      await load();
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target?.closest || !$('camada0Panel')?.contains(target)) return;

    const open = target.getAttribute?.('data-c0-open');
    if (open) {
      state.openSessionId = open;
      state.shownIterationId = '';
      paint();
      return;
    }

    const show = target.closest('[data-c0-show]')?.getAttribute('data-c0-show');
    if (show) {
      state.shownIterationId = show;
      paint();
      return;
    }

    const popout = target.getAttribute?.('data-c0-popout');
    if (popout) {
      // A fresh ticket, because the one the frame used has almost certainly expired.
      const [sessionId, iterationId] = popout.split('|');
      const tab = window.open('', '_blank', 'noopener');
      api(`/${state.projectId}/mockups/${sessionId}/${iterationId}/ticket`, { method: 'POST', body: {} })
        .then(({ ticket }) => {
          const src = `/api/projects/${encodeURIComponent(state.projectId)}/mockups/`
            + `${encodeURIComponent(sessionId)}/${encodeURIComponent(iterationId)}/render`
            + `?t=${encodeURIComponent(ticket)}`;
          if (tab) tab.location = src;
        })
        .catch((error) => {
          tab?.close();
          window.showToast?.(error.message, 'error');
        });
      return;
    }

    if (target.hasAttribute?.('data-c0-ask')) {
      $('camada0Panel').querySelector('[data-c0-ask-box]')?.classList.remove('hidden');
      $('c0AskText')?.focus();
      return;
    }

    if (target.hasAttribute?.('data-c0-start')) {
      const promptText = $('c0NewPrompt')?.value?.trim() || '';
      if (!promptText) {
        window.showToast?.('Descreva em duas ou três frases o que quer ver.', 'error');
        return;
      }
      run(async () => {
        const created = await api(`/${state.projectId}/mockups`, {
          method: 'POST', body: { promptText },
        });
        state.openSessionId = created.session.id;
        await api(`/${state.projectId}/mockups/${created.session.id}/iterate`, {
          method: 'POST', body: { requestText: '' },
        });
      });
      return;
    }

    if (target.hasAttribute?.('data-c0-iterate')) {
      const session = openSession();
      if (!session) return;
      const requestText = $('c0AskText')?.value?.trim() || '';
      run(() => api(`/${state.projectId}/mockups/${session.id}/iterate`, {
        method: 'POST', body: { requestText },
      }));
      return;
    }

    const verdict = target.getAttribute?.('data-c0-verdict');
    if (verdict) {
      const session = openSession();
      if (!session) return;
      const iterationId = state.shownIterationId || session.latestIterationId;
      if (verdict === 'discarded'
        && !window.confirm('Descartar esta sessão? As versões geradas deixam de estar acessíveis.')) return;
      run(async () => {
        await api(`/${state.projectId}/mockups/${session.id}/verdict`, {
          method: 'POST', body: { verdict, iterationId },
        });
        window.showToast?.(verdict === 'approved'
          ? 'Mockup aprovado. A Descoberta pode avançar.'
          : 'Sessão descartada.', 'ok');
      });
    }
  });

  window.Camada0UI = { render: load, refresh: load };

  /**
   * Renders itself if the tab is already showing when this script finishes loading.
   *
   * The scripts are deferred, so on a deep link straight to this tab the app's own
   * render pass can run before `window.Camada0UI` exists — and `?.render?.()` then does
   * nothing, silently, leaving an empty panel with no error to follow.
   */
  function renderIfAlreadyOpen() {
    const panel = document.querySelector('[data-panel="camada0"]');
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
