/**
 * Prompts de IA: every AI job as an interface a person can read and improve.
 *
 * Each job is four blocks — method, cut, change, contract. The method is edited here and
 * saved as a new version (the repository's file stays «base»); the other three are code
 * and are shown as they are, so what each job receives and must answer is never a guess.
 * Each version shows how it did: runs, failures, answers written or thrown away, cost.
 */
(function initPromptPacksUi() {
  const state = { packs: [], open: '', busy: false, viewing: {} };

  function kit() { return window.IosKit; }
  function esc(value) { return kit().escapeHtml(value); }
  function api(path, options) { return window.apiRequest(path, options); }

  function rate(stats) {
    if (!stats) return 'sem uso';
    const parts = [`${stats.runs} uso${stats.runs === 1 ? '' : 's'}`];
    if (stats.acceptRate !== null) parts.push(`${Math.round(stats.acceptRate * 100)}% aceites`);
    if (stats.failed) parts.push(`${stats.failed} falha${stats.failed === 1 ? '' : 's'}`);
    if (stats.avgCostUsd) parts.push(`$${stats.avgCostUsd.toFixed(4)}/uso`);
    return parts.join(' · ');
  }

  function rateBadge(stats) {
    const k = kit();
    if (!stats || stats.acceptRate === null) return '';
    const value = Math.round(stats.acceptRate * 100);
    return k.badge(value >= 70 ? 'green' : value >= 40 ? 'amber' : 'red', `${value}%`);
  }

  function packCard(pack) {
    const k = kit();
    const active = pack.versions.find((version) => version.id === pack.active) || pack.versions[0];
    if (state.open !== pack.id) {
      return `
        <button type="button" class="ios-row" data-pp-open="${esc(pack.id)}">
          <span class="ios-row-main">
            <span class="ios-row-title">${esc(pack.label)}</span>
            <span class="ios-row-sub">método ${esc(pack.active)} · ${esc(rate(active.stats))}</span>
          </span>
          ${rateBadge(active.stats)}
          ${k.icon('chevron', 14, 'ios-chevron')}
        </button>`;
    }
    const viewing = state.viewing[pack.id] || pack.active;
    const shown = pack.versions.find((version) => version.id === viewing) || active;
    return `
      <div class="pp-open">
        <button type="button" class="ios-row" data-pp-open="">
          <span class="ios-row-main"><span class="ios-row-title">${esc(pack.label)}</span><span class="ios-row-sub"><code>${esc(pack.id)}</code> · ${esc(pack.skill)}</span></span>
          ${k.icon('chevronDown', 14, 'ios-chevron')}
        </button>
        <div class="pp-body">
          <ol class="pp-blocks">
            <li>
              <h4>1. Método <span class="pp-tag">editável</span></h4>
              <p class="ios-footnote">Como trabalhar e as regras. É a parte que se afina.</p>
              <textarea class="ios-editor-text pp-method" data-pp-body="${esc(pack.id)}" spellcheck="false">${esc(shown.body)}</textarea>
              <div class="st-inline">
                <input class="ios-input" data-pp-note="${esc(pack.id)}" placeholder="O que mudou e porquê (fica com a versão)" />
                <button type="button" class="btn primary" data-pp-save="${esc(pack.id)}" ${state.busy ? 'disabled' : ''}>Guardar como nova versão</button>
              </div>
            </li>
            <li>
              <h4>2. Recorte do projecto</h4>
              <p>${esc(pack.blocks.slice.describe)}</p>
              <p class="ios-footnote">Enviado sob «${esc(pack.blocks.slice.label)}», até ${pack.blocks.slice.maxChars.toLocaleString('pt-PT')} caracteres.</p>
            </li>
            <li>
              <h4>3. A alteração</h4>
              <p>${esc(pack.blocks.change.describe)}</p>
            </li>
            <li>
              <h4>4. Contrato da resposta</h4>
              <p class="ios-footnote">A resposta é validada contra isto antes de chegar a si; o que não cumpre é descartado e contado.</p>
              <pre class="ios-code">${esc(pack.blocks.contract)}</pre>
            </li>
          </ol>
          <h4 class="av-label">Versões do método</h4>
          <div class="ios-list">
            ${[...pack.versions].reverse().map((version) => `
              <div class="ios-row is-static ${version.id === viewing ? 'is-selected' : ''}">
                <span class="ios-row-main">
                  <span class="ios-row-title">${esc(version.id)}${version.id === pack.active ? ' · activa' : ''}</span>
                  <span class="ios-row-sub ios-wrap">${esc(version.note || '')}${version.createdAt ? ` · ${esc(kit().ago(version.createdAt))}` : ''}</span>
                  <span class="ios-row-sub">${esc(rate(version.stats))}</span>
                </span>
                ${rateBadge(version.stats)}
                <button type="button" class="btn tiny" data-pp-view="${esc(pack.id)}|${esc(version.id)}">Ver</button>
                ${version.id === pack.active ? '' : `<button type="button" class="btn tiny" data-pp-activate="${esc(pack.id)}|${esc(version.id)}" ${state.busy ? 'disabled' : ''}>Activar</button>`}
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function paint() {
    const host = document.getElementById('promptPacksPanel');
    if (!host || !kit()) return;
    if (!state.packs.length) { host.innerHTML = '<p class="muted-text">A ler os prompts…</p>'; return; }
    host.innerHTML = `<div class="ios-list pp-list">${state.packs.map(packCard).join('')}</div>`;
  }

  async function render() {
    if (window.isSuperAdmin?.() !== true) return;
    paint();
    try {
      state.packs = (await api('/prompt-packs')).packs;
    } catch (error) {
      const host = document.getElementById('promptPacksPanel');
      if (host) host.innerHTML = `<p class="muted-text">${esc(error.message)}</p>`;
      return;
    }
    paint();
  }

  function replace(pack) {
    state.packs = state.packs.map((entry) => (entry.id === pack.id ? pack : entry));
    state.viewing[pack.id] = pack.active;
    paint();
  }

  async function run(fn) {
    state.busy = true;
    paint();
    try { await fn(); } catch (error) { window.showToast?.(error.message, 'error'); }
    state.busy = false;
    paint();
  }

  document.addEventListener('click', (event) => {
    const t = event.target;
    if (!t.closest?.('#promptPacksPanel')) return;
    const open = t.closest('[data-pp-open]');
    if (open) { state.open = open.dataset.ppOpen; paint(); return; }
    const view = t.closest('[data-pp-view]')?.dataset.ppView;
    if (view) { const [id, version] = view.split('|'); state.viewing[id] = version; paint(); return; }
    const save = t.closest('[data-pp-save]')?.dataset.ppSave;
    if (save) {
      const body = document.querySelector(`[data-pp-body="${save}"]`)?.value || '';
      const note = document.querySelector(`[data-pp-note="${save}"]`)?.value || '';
      run(async () => {
        replace((await api(`/prompt-packs/${encodeURIComponent(save)}/versions`, { method: 'POST', body: { body, note } })).pack);
        window.showToast?.('Nova versão activa. Os próximos pedidos já a usam.', 'ok');
      });
      return;
    }
    const activate = t.closest('[data-pp-activate]')?.dataset.ppActivate;
    if (activate) {
      const [id, version] = activate.split('|');
      run(async () => {
        replace((await api(`/prompt-packs/${encodeURIComponent(id)}/activate`, { method: 'POST', body: { version } })).pack);
        window.showToast?.(`${version} activa.`, 'ok');
      });
    }
  });

  window.PromptPacksUI = { render };
})();
