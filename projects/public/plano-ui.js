/**
 * Camadas 1 to 3 — the vision, the epics that slice it, the features under those.
 *
 * Read top to bottom it is the plan getting smaller: what this is for, then the slices,
 * then what each slice is made of. Camada 0 is its own screen because it is a loop
 * rather than a structure, and Camada 4 lives in Tarefas because that is where work is
 * actually done.
 */
(function initPlanoUi() {
  const state = { projectId: '', data: null, busy: false, editingVision: false };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api(path, options) { return window.apiRequest(path, options); }

  const STATUS_BADGE = {
    draft: 'badge-gray',
    refining: 'badge-amber',
    active: 'badge-green',
    done: 'badge-gray',
    dropped: 'badge-gray',
  };

  const STATUS_LABEL = {
    draft: 'rascunho',
    refining: 'a refinar',
    active: 'a construir',
    done: 'feita',
    dropped: 'abandonada',
  };

  /** Camada 1. Two texts, and they are different questions on purpose. */
  function visionView(vision) {
    if (state.editingVision) {
      return `
        <div class="plano-vision">
          <label class="full">
            <span class="field-label">A visão — para que serve isto a longo prazo</span>
            <small class="field-help">É a ideia principal do projecto. O resto da visão (problema, utilizadores, proposta de valor) edita-se em Visão.</small>
            <textarea id="planoVision" rows="4" placeholder="O que isto é quando estiver feito. Grande de mais para uma passagem só — e é suposto ser.">${escapeHtml(vision.vision)}</textarea>
          </label>
          <label class="full mt-8">
            <span class="field-label">A constituição — o que tem de ser sempre verdade</span>
            <textarea id="planoConstitution" rows="4" placeholder="Regras que valem para tudo o que for construído. Uma por linha: «O sistema deve sempre …»">${escapeHtml(vision.constitution)}</textarea>
          </label>
          <div class="ado-action-bar mt-8">
            <button type="button" class="btn primary" data-plano-save-vision>Guardar</button>
            <button type="button" class="btn ghost" data-plano-cancel-vision>Cancelar</button>
          </div>
        </div>`;
    }
    const empty = !vision.vision && !vision.constitution;
    return `
      <div class="plano-vision">
        ${vision.vision
    ? `<p style="margin:0 0 6px">${escapeHtml(vision.vision)}</p>`
    : '<p class="muted-text" style="margin:0 0 6px">Ainda não escreveu a visão. Sem ela, cada epic é decidida por si só.</p>'}
        ${vision.constitution
    ? `<details><summary>Regras que valem sempre</summary><p class="mt-8" style="white-space:pre-wrap">${escapeHtml(vision.constitution)}</p></details>`
    : ''}
        <button type="button" class="btn tiny ghost mt-8" data-plano-edit-vision>${empty ? 'Escrever a visão' : 'Editar'}</button>
      </div>`;
  }

  function featureRow(feature) {
    const oversized = feature.oversizedTasks.length
      ? `<details class="plano-oversized"><summary class="badge-amber">${feature.oversizedTasks.length} tarefa(s) grandes de mais</summary>
          <div class="plano-oversized-list">${feature.oversizedTasks.map((task) => `
            <div class="plano-oversized-row">
              <strong>${escapeHtml(task.title)}</strong>
              <span class="muted-text">${escapeHtml(task.findings[0].message)}</span>
            </div>`).join('')}</div></details>`
      : '';
    return `
      <div class="plano-feature">
        <div class="plano-feature-head">
          <span>${escapeHtml(feature.title)}</span>
          <span class="muted-text">${feature.completedTaskCount}/${feature.taskCount} tarefas</span>
        </div>
        ${oversized}
      </div>`;
  }

  function epicCard(epic) {
    const gap = epic.specGap
      ? `<p class="badge-amber plano-note">${escapeHtml(epic.specGap)}</p>`
      : '';
    const features = epic.features.length
      ? `<div class="plano-feature-list">${epic.features.map(featureRow).join('')}</div>`
      : '<p class="muted-text">Ainda sem features. Uma epic que não está partida não se consegue construir.</p>';
    return `
      <div class="read-card mt-8">
        <div class="panel-title-row">
          <div>
            <p class="muted-text" style="margin:0 0 2px">Camada 2 · Epic</p>
            <p style="margin:0"><strong>${escapeHtml(epic.title)}</strong></p>
            ${epic.summary ? `<p class="muted-text" style="margin:2px 0 0">${escapeHtml(epic.summary)}</p>` : ''}
          </div>
          <span class="section-badge ${STATUS_BADGE[epic.status] || 'badge-gray'}">${escapeHtml(STATUS_LABEL[epic.status] || epic.status)}</span>
        </div>
        ${gap}
        <p class="muted-text mt-8">${epic.featureCount} feature(s) · ${epic.taskCount} tarefa(s)</p>
        ${features}
      </div>`;
  }

  function paint() {
    const host = $('planoPanel');
    if (!host) return;
    if (state.busy) { host.innerHTML = '<p class="muted-text">A guardar…</p>'; return; }
    const data = state.data;
    if (!data) { host.innerHTML = '<p class="muted-text">Não foi possível ler o plano deste projecto.</p>'; return; }

    const unassigned = data.unassignedFeatures.length
      ? `<details class="mt-12"><summary>Features sem epic <span class="muted-text">${data.unassignedFeatures.length}</span></summary>
          <p class="muted-text mt-8">Trabalho que existe mas não pertence a nenhuma fatia da visão. Não é um erro — é trabalho anterior às camadas.</p>
          <div class="plano-feature-list">${data.unassignedFeatures.map(featureRow).join('')}</div></details>`
      : '';

    host.innerHTML = `
      <section class="plano-section">
        <p class="muted-text" style="margin:0 0 4px">Camada 1 · Visão</p>
        ${visionView(data.vision)}
      </section>
      <section class="plano-section mt-12">
        <div class="panel-title-row">
          <div><p class="muted-text" style="margin:0">Camada 2 · Epics</p></div>
          <button type="button" class="btn tiny ghost" data-plano-new-epic>Nova epic</button>
        </div>
        <div class="plano-new-epic hidden" data-plano-new-epic-box>
          <label class="full">
            <span class="field-label">Como se chama esta fatia da visão?</span>
            <input id="planoEpicTitle" placeholder="ex.: Gestão de mesas" />
          </label>
          <label class="full mt-8">
            <span class="field-label">O que entra nela, em duas linhas</span>
            <textarea id="planoEpicSummary" rows="2"></textarea>
          </label>
          <button type="button" class="btn primary mt-8" data-plano-create-epic>Criar epic</button>
        </div>
        ${data.epics.length
    ? data.epics.map(epicCard).join('')
    : '<p class="muted-text mt-8">Ainda sem epics. Uma epic é uma fatia da visão com semanas de trabalho — não o projecto inteiro.</p>'}
        ${unassigned}
      </section>`;
  }

  async function load(projectId) {
    state.projectId = projectId || state.projectId;
    if (!state.projectId) return;
    try {
      state.data = await api(`/${state.projectId}/epics`);
    } catch (error) {
      state.data = null;
      window.showToast?.(error.message, 'error');
    }
    paint();
  }

  async function run(fn) {
    state.busy = true;
    paint();
    try { await fn(); } catch (error) { window.showToast?.(error.message, 'error'); } finally {
      state.busy = false;
      await load();
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target?.closest || !$('planoPanel')?.contains(target)) return;

    if (target.hasAttribute?.('data-plano-edit-vision')) {
      state.editingVision = true; paint(); return;
    }
    if (target.hasAttribute?.('data-plano-cancel-vision')) {
      state.editingVision = false; paint(); return;
    }
    if (target.hasAttribute?.('data-plano-save-vision')) {
      const body = {
        vision: $('planoVision')?.value ?? '',
        constitution: $('planoConstitution')?.value ?? '',
      };
      state.editingVision = false;
      run(async () => {
        await api(`/${state.projectId}/vision`, { method: 'PATCH', body });
        window.showToast?.('Visão guardada.', 'ok');
      });
      return;
    }
    if (target.hasAttribute?.('data-plano-new-epic')) {
      $('planoPanel').querySelector('[data-plano-new-epic-box]')?.classList.remove('hidden');
      $('planoEpicTitle')?.focus();
      return;
    }
    if (target.hasAttribute?.('data-plano-create-epic')) {
      const title = $('planoEpicTitle')?.value?.trim() || '';
      if (!title) { window.showToast?.('Dê um nome a esta epic.', 'error'); return; }
      const summary = $('planoEpicSummary')?.value?.trim() || '';
      run(async () => {
        await api(`/${state.projectId}/epics`, { method: 'POST', body: { title, summary } });
        window.showToast?.('Epic criada.', 'ok');
      });
    }
  });

  window.PlanoUI = { render: load, refresh: load };

  // Deferred scripts can finish after the app's render pass, and `?.render?.()` then
  // does nothing at all — silently, with an empty panel and no error to follow.
  function renderIfAlreadyOpen() {
    const panel = document.querySelector('[data-panel="plano"]');
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
