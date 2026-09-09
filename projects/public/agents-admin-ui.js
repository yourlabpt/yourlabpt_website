/**
 * Central Agents admin — health, defaults, active runs.
 */
(function initAgentsAdminUi() {
  const API = '/api/projects';
  const state = {
    settings: null,
    runs: [],
    health: null,
    connectors: [],
    personas: [],
    modelProfiles: [],
    personaConnector: null,
  };

  const WRITE_SCOPE_LABELS = {
    spec: 'Especificação',
    design: 'Desenho',
    contracts: 'Contratos',
    module_code: 'Código do módulo',
    tests: 'Testes',
    none: 'Sem escrita',
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function apiRequest(path, options = {}) {
    if (typeof window.apiRequest === 'function') {
      return window.apiRequest(path, options);
    }
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = window.state?.token || localStorage.getItem('requirements_platform_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
    return payload;
  }

  function readFormSettings() {
    const defaults = state.settings?.executionDefaults || {};
    return {
      modelProfileId: $('agentsDefaultModel')?.value || defaults.modelProfileId || 'medium',
      maxTokens: Number($('agentsDefaultMaxTokens')?.value) || 0,
      externalMaxTokens: Number($('agentsDefaultExternalTokens')?.value) || 120000,
      maxCost: Number($('agentsDefaultMaxCost')?.value) || 0,
      maxWallClockMinutes: Number($('agentsDefaultMaxMinutes')?.value) || 0,
      planningWaveSize: Number($('agentsDefaultWaveSize')?.value) || 8,
      enableWebSearch: $('agentsDefaultWebSearch')?.checked !== false,
      pauseForSubtaskReview: $('agentsDefaultPauseReview')?.checked === true,
      allowedMcpTools: String($('agentsDefaultTools')?.value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    };
  }

  function fillForm(settings) {
    const defaults = settings?.executionDefaults || {};
    if ($('agentsDefaultModel')) $('agentsDefaultModel').value = defaults.modelProfileId || 'medium';
    if ($('agentsDefaultMaxTokens')) $('agentsDefaultMaxTokens').value = defaults.maxTokens || 0;
    if ($('agentsDefaultExternalTokens')) $('agentsDefaultExternalTokens').value = defaults.externalMaxTokens || 120000;
    if ($('agentsDefaultMaxCost')) $('agentsDefaultMaxCost').value = defaults.costPolicy?.maxCost || defaults.maxCost || 0;
    if ($('agentsDefaultMaxMinutes')) $('agentsDefaultMaxMinutes').value = defaults.maxWallClockMinutes || 0;
    if ($('agentsDefaultWaveSize')) $('agentsDefaultWaveSize').value = defaults.planningWaveSize || 8;
    if ($('agentsDefaultWebSearch')) $('agentsDefaultWebSearch').checked = defaults.enableWebSearch !== false;
    if ($('agentsDefaultPauseReview')) $('agentsDefaultPauseReview').checked = defaults.pauseForSubtaskReview === true;
    if ($('agentsDefaultTools')) {
      $('agentsDefaultTools').value = (defaults.allowedMcpTools || []).join(', ');
    }
  }

  function renderHealth() {
    const host = $('agentsHealthPanel');
    if (!host) return;
    const health = state.health || {};
    const connector = health.connector || window.state?.config?.agentRuntime?.connector;
    const reachable = health.runtimeReachable ?? window.state?.config?.agentRuntime?.enabled;
    host.innerHTML = `
      <div class="agents-health-grid">
        <article class="read-card">
          <h4>Runtime</h4>
          <p><strong>${reachable ? 'Ligado' : 'Indisponível'}</strong></p>
          <p class="muted-text">Modo: ${escapeHtml(health.mode || window.state?.config?.agentRuntime?.mode || '—')}</p>
        </article>
        <article class="read-card">
          <h4>Dispositivo emparelhado</h4>
          <p><strong>${connector ? escapeHtml(connector.name || 'Runtime') : 'Nenhum'}</strong></p>
          <p class="muted-text">${connector ? (connector.online ? 'Online agora' : 'Offline') : 'Emparelhe em Definições → Agent Runtime'}</p>
        </article>
      </div>
    `;
  }

  /**
   * A persona is an agent. The only things that can stop it running are the runtime
   * being offline, the persona being switched off, or the runtime not exposing a tool
   * it needs — so those are the only three states shown.
   */
  function personaReadyBadge(persona) {
    if (!persona.runtimeOnline) {
      return '<span class="section-badge badge-gray">Runtime desligado</span>';
    }
    if (!persona.enabled) {
      return '<span class="section-badge badge-gray">Desactivada</span>';
    }
    if (persona.missingTools.length) {
      return `<span class="section-badge badge-amber">Faltam ${persona.missingTools.length} ferramenta(s)</span>`;
    }
    return '<span class="section-badge badge-green">Pronta</span>';
  }

  function renderPersonas() {
    const host = $('agentsPersonasList');
    if (!host) return;
    if (!state.personas.length) {
      host.innerHTML = '<p class="muted-text">Registo de personas indisponível.</p>';
      return;
    }
    host.innerHTML = state.personas.map((persona) => {
      const options = state.modelProfiles.map((profile) => `
        <option value="${escapeHtml(profile)}"${profile === persona.modelProfileId ? ' selected' : ''}>${escapeHtml(profile)}</option>
      `).join('');
      // Tools are what this agent is allowed to reach. A missing one is marked in
      // place, so the fix is visible without reading a separate error.
      const missing = new Set(persona.missingTools);
      const tools = persona.tools.map((tool) => `
        <span class="agent-tool${missing.has(tool) ? ' is-missing' : ''}">${escapeHtml(tool)}</span>
      `).join('');
      return `
        <article class="agents-persona-row read-card" data-persona-id="${escapeHtml(persona.personaId)}">
          <div class="panel-title-row">
            <div>
              <strong>${persona.order}. ${escapeHtml(persona.label)}</strong>
              <p class="muted-text">
                <code>${escapeHtml(persona.agentId)}</code> ·
                ${escapeHtml(persona.pipelineSteps.join(' · '))} —
                fases: ${escapeHtml(persona.deliveryStages.join(', '))}
              </p>
            </div>
            ${personaReadyBadge(persona)}
          </div>
          <div class="agent-tools mt-8">${tools}</div>
          ${persona.missingTools.length ? `
            <p class="muted-text mt-8">
              O runtime ligado não expõe ${escapeHtml(persona.missingTools.join(', '))}.
              Active essas ferramentas MCP no runtime para esta persona poder correr.
            </p>` : ''}
          ${!persona.toolsVerified && persona.runtimeOnline ? `
            <p class="muted-text mt-8">O runtime não declarou que ferramentas tem, por isso não foi possível confirmar estas.</p>` : ''}
          <div class="form-grid compact mt-8">
            <label>Perfil do modelo<select data-persona-field="modelProfileId">${options}</select></label>
            <label>Limite tokens<input type="number" min="0" data-persona-field="maxTokens" value="${Number(persona.maxTokens) || 0}" /></label>
            <label>Tempo máximo (min)<input type="number" min="0" data-persona-field="maxWallClockMinutes" value="${Number(persona.maxWallClockMinutes) || 0}" /></label>
          </div>
          <div class="agent-toggle-row mt-8">
            <label class="checkline"><input type="checkbox" data-persona-field="enabled"${persona.enabled ? ' checked' : ''} /> Activa</label>
            <label class="checkline"><input type="checkbox" data-persona-field="requiresHumanApproval"${persona.requiresHumanApproval ? ' checked' : ''} /> Exige aprovação humana</label>
          </div>
          <p class="muted-text mt-8">
            Escreve: <strong>${escapeHtml(WRITE_SCOPE_LABELS[persona.writeScope] || persona.writeScope)}</strong>
            · Código: ${persona.canWriteCode ? 'sim' : 'não'}
            · Tier no runtime: <code>${escapeHtml(persona.runtimeTier)}</code>
          </p>
        </article>
      `;
    }).join('');
  }

  function readPersonaForm() {
    const host = $('agentsPersonasList');
    if (!host) return {};
    const personas = {};
    host.querySelectorAll('[data-persona-id]').forEach((row) => {
      const personaId = row.dataset.personaId;
      const field = (name) => row.querySelector(`[data-persona-field="${name}"]`);
      personas[personaId] = {
        enabled: field('enabled')?.checked !== false,
        modelProfileId: field('modelProfileId')?.value || 'medium',
        maxTokens: Number(field('maxTokens')?.value) || 0,
        maxWallClockMinutes: Number(field('maxWallClockMinutes')?.value) || 0,
        requiresHumanApproval: field('requiresHumanApproval')?.checked === true,
      };
    });
    return personas;
  }




  function renderRuns() {
    const host = $('agentsRunsList');
    if (!host) return;
    if (!state.runs.length) {
      host.innerHTML = '<p class="muted-text">Sem execuções recentes.</p>';
      return;
    }
    host.innerHTML = state.runs.map((run) => `
      <article class="agents-run-row">
        <div>
          <strong>${escapeHtml(run.taskTitle || run.workItemId)}</strong>
          <p class="muted-text">${escapeHtml(run.projectName)} · ${escapeHtml(run.status)} · ${run.updatedAt ? new Date(run.updatedAt).toLocaleString('pt-PT') : '—'}</p>
        </div>
        <div class="ado-action-bar">
          <button type="button" class="btn tiny" data-agents-open-task data-project-id="${escapeHtml(run.projectId)}" data-task-id="${escapeHtml(run.workItemId)}">Abrir tarefa</button>
          ${run.runId ? `<button type="button" class="btn tiny ghost" data-agents-open-run data-project-id="${escapeHtml(run.projectId)}" data-task-id="${escapeHtml(run.workItemId)}">Ver execução</button>` : ''}
        </div>
      </article>
    `).join('');
  }

  async function refresh() {
    if (typeof window.isSuperAdmin === 'function' && !window.isSuperAdmin()) return;
    try {
      const [healthPayload, settingsPayload, runsPayload, personasPayload] = await Promise.all([
        apiRequest('/agent-runs/health').catch(() => ({})),
        apiRequest('/agent-platform/settings'),
        apiRequest('/agent-runs/recent?limit=30'),
        apiRequest('/agent-platform/personas').catch(() => ({})),
      ]);
      state.health = healthPayload;
      state.settings = settingsPayload.settings;
      state.runs = runsPayload.runs || [];
      state.personas = personasPayload.personas || [];
      state.modelProfiles = personasPayload.modelProfiles || [];
      state.personaConnector = personasPayload.connector || null;
      fillForm(state.settings);
      renderHealth();
      renderPersonas();
      renderRuns();
    } catch (error) {
      const host = $('agentsAdminRoot');
      if (host) host.querySelector('.agents-error')?.remove();
      host?.insertAdjacentHTML('beforeend', `<p class="agents-error muted-text">${escapeHtml(error.message)}</p>`);
    }
  }

  async function saveDefaults() {
    const payload = await apiRequest('/agent-platform/settings', {
      method: 'PATCH',
      body: { executionDefaults: readFormSettings() },
    });
    state.settings = payload.settings;
    window.showToast?.('Definições de agentes guardadas.', 'ok');
  }

  async function savePersonas() {
    const payload = await apiRequest('/agent-platform/settings', {
      method: 'PATCH',
      body: { personas: readPersonaForm() },
    });
    state.settings = payload.settings;
    await refresh();
    window.showToast?.('Personas guardadas.', 'ok');
  }

  function wireEvents() {
    $('agentsSaveDefaultsBtn')?.addEventListener('click', () => {
      saveDefaults().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('agentsSavePersonasBtn')?.addEventListener('click', () => {
      savePersonas().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('agentsRefreshBtn')?.addEventListener('click', () => {
      refresh().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('agentsRunsList')?.addEventListener('click', (event) => {
      const openTask = event.target.closest('[data-agents-open-task], [data-agents-open-run]');
      if (!openTask) return;
      const projectId = openTask.dataset.projectId;
      const taskId = openTask.dataset.taskId;
      if (!projectId || !taskId) return;
      if (window.loadProjectById) {
        window.loadProjectById(projectId, { switchTab: 'tarefas' }).then(() => {
          window.WorkItemsUI?.openTask?.(window.state?.selectedProject, taskId);
        });
      }
    });
  }

  function render() {
    const root = $('agentsAdminRoot');
    if (!root) return;
    if (typeof window.isSuperAdmin === 'function' && !window.isSuperAdmin()) {
      root.innerHTML = '<p class="muted-text">Apenas super-administradores podem gerir agentes.</p>';
      return;
    }
    refresh();
  }

  wireEvents();
  window.AgentsAdminUI = { render, refresh };
})();
