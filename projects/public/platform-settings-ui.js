/**
 * Definições da plataforma — identity that belongs to the platform, not to a project
 * and not to an agent. Today that is the GitHub account every project's repository is
 * reached through.
 */
(function initPlatformSettingsUi() {
  const state = {
    settings: null,
    busy: false,
    // The agent side of the platform: which engines exist and what they cost.
    agentSettings: null,
    modelProfiles: null,
    llmWarnings: {},
    // Step 1 of the agent setup sequence: the credential behind each provider.
    llmProviderSettings: null,
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiRequest(path, options = {}) {
    return window.apiRequest(path, options);
  }

  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-PT');
  }

  /**
   * The connection has more states than connected/not-connected, and each one needs a
   * different action from the engineer — so each is rendered explicitly rather than
   * collapsed into a generic error.
   */
  function connectionView(settings) {
    if (!settings) {
      return '<p class="muted-text">Não foi possível ler as definições.</p>';
    }
    if (!settings.hasToken) {
      return `
        <p class="muted-text"><span class="section-badge badge-gray">Não ligado</span>
        Nenhuma conta GitHub ligada. Sem isto a plataforma não consegue ver nem criar repositórios.</p>
        <button type="button" class="btn primary mt-8" id="githubConnectBtn">Entrar com o GitHub</button>`;
    }

    // A token typed by hand still works, but it is not the intended path any more.
    const legacy = settings.authMethod !== 'oauth'
      ? `<p class="muted-text mt-8"><span class="section-badge badge-amber">Token manual</span>
         Esta ligação usa um token colado à mão. Volte a ligar com o GitHub para uma ligação normal.</p>`
      : '';

    const scopes = (settings.scopes || []).length
      ? `<p class="muted-text">Permissões: ${settings.scopes.map((s) => `<code>${escapeHtml(s)}</code>`).join(' ')}</p>`
      : '<p class="muted-text"><span class="section-badge badge-amber">Permissões desconhecidas</span> Volte a ligar para as confirmar.</p>';

    const missingRepoScope = settings.authMethod === 'oauth'
      && (settings.scopes || []).length
      && !settings.scopes.includes('repo');
    const insufficient = missingRepoScope
      ? `<p class="muted-text mt-8"><span class="section-badge badge-red">Permissões insuficientes</span>
         Falta <code>repo</code> — os repositórios privados ficam invisíveis. Volte a ligar e aceite o pedido completo.</p>`
      : '';

    const account = escapeHtml(settings.accountName || settings.account || 'conta ligada');
    const url = settings.accountUrl
      ? `<a href="${escapeHtml(settings.accountUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(settings.account)}</a>`
      : escapeHtml(settings.account);

    return `
      <p><span class="section-badge badge-green">Ligado</span> <strong>${account}</strong> (${url})</p>
      ${settings.connectedAt ? `<p class="muted-text">Ligado em ${escapeHtml(when(settings.connectedAt))}.</p>` : ''}
      ${scopes}
      ${insufficient}
      ${legacy}
      <div class="ado-action-bar mt-8">
        <button type="button" class="btn tiny ghost" id="githubTestBtn">Testar ligação</button>
        <button type="button" class="btn tiny ghost" id="githubReconnectBtn">Voltar a ligar</button>
        <button type="button" class="btn tiny ghost" id="githubDisconnectBtn">Desligar</button>
      </div>`;
  }

  /**
   * The engines a persona can be run on.
   *
   * Rows rather than cards: this is a list of things to compare, and comparison wants
   * the same field in the same column. Pricing is editable here because it is the only
   * thing standing between a cost cap and a number that means nothing — an unpriced
   * hosted model reports zero spend and the cap never fires.
   */
  function llmOptionsView(settings, warnings) {
    const options = settings?.llmOptions || [];
    if (!options.length) {
      return '<p class="muted-text">Nenhum modelo configurado. Adicione um para as personas poderem correr.</p>';
    }
    const profiles = state.modelProfiles || ['small', 'medium', 'large', 'high', 'long_context', 'max'];
    return `<div class="llm-option-list">${options.map((option, index) => {
      const notes = (warnings?.[option.id] || []);
      return `
      <div class="llm-option-row" data-llm-index="${index}">
        <label class="checkline" title="Desligado, nenhuma execução o escolhe.">
          <input type="checkbox" data-llm-field="enabled" ${option.enabled ? 'checked' : ''} />
          <span>Activo</span>
        </label>
        <label>Nome<input data-llm-field="label" value="${escapeHtml(option.label)}" /></label>
        <label>Fornecedor<input data-llm-field="provider" value="${escapeHtml(option.provider)}" /></label>
        <label>Modelo<input data-llm-field="model" value="${escapeHtml(option.model)}" /></label>
        <label>Perfil<select data-llm-field="profileId">${profiles.map((id) => (
    `<option value="${escapeHtml(id)}" ${id === option.profileId ? 'selected' : ''}>${escapeHtml(id)}</option>`
  )).join('')}</select></label>
        <label>USD / 1M entrada<input type="number" step="0.01" min="0" data-llm-field="inputPer1M" value="${option.pricing.inputPer1M}" /></label>
        <label>USD / 1M saída<input type="number" step="0.01" min="0" data-llm-field="outputPer1M" value="${option.pricing.outputPer1M}" /></label>
        <label class="checkline" title="Confirmado no catálogo do fornecedor.">
          <input type="checkbox" data-llm-field="pricingVerified" ${option.pricingVerified ? 'checked' : ''} />
          <span>Preço confirmado</span>
        </label>
        <button type="button" class="btn tiny ghost" data-llm-remove="${index}">Remover</button>
        ${notes.length ? `<p class="badge-amber llm-option-note">${notes.map(escapeHtml).join(' · ')}</p>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  /** Reads the rows back out of the DOM, so what is saved is what is on screen. */
  function collectLlmOptions() {
    return Array.from(document.querySelectorAll('[data-llm-index]')).map((row, index) => {
      const field = (name) => row.querySelector(`[data-llm-field="${name}"]`);
      // The id is identity, not a label: the persona × engine record and every task
      // already dispatched refer to it. Carry the existing one through rather than
      // minting a new one, or a save silently orphans everything pointing at it.
      const source = state.agentSettings?.llmOptions?.[index] || {};
      return {
        id: source.id || `modelo-${index + 1}`,
        label: field('label')?.value?.trim() || '',
        provider: field('provider')?.value?.trim() || '',
        model: field('model')?.value?.trim() || '',
        profileId: field('profileId')?.value || 'medium',
        enabled: field('enabled')?.checked !== false,
        pricingVerified: field('pricingVerified')?.checked === true,
        pricing: {
          inputPer1M: Number(field('inputPer1M')?.value) || 0,
          outputPer1M: Number(field('outputPer1M')?.value) || 0,
        },
      };
    });
  }

  /**
   * Step 1 of the sequence: the credential behind each provider, not the catalogue of
   * engines (that is `llmOptionsView` below). Each card is independently save-and-test,
   * because "saved" and "actually works" are different claims and the operator should
   * never have to guess which one is true.
   */
  // Suggestions only — any DeepInfra model id can be typed.
  const DEEPINFRA_MODELS = [
    'deepseek-ai/DeepSeek-V3',
    'deepseek-ai/DeepSeek-R1',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
  ];

  function llmProviderView(settings) {
    if (!settings) return '<p class="muted-text">Não foi possível ler as credenciais.</p>';
    const p = settings.providers?.deepinfra;
    if (!p) return '<p class="muted-text">DeepInfra indisponível.</p>';
    const badge = p.lastError
      ? '<span class="section-badge badge-red">Falhou</span>'
      : p.verifiedAt
        ? '<span class="section-badge badge-green">Testado</span>'
        : p.ready
          ? '<span class="section-badge badge-amber">Por testar</span>'
          : '<span class="section-badge badge-gray">Sem chave</span>';
    return `
      <div class="llm-provider-card" data-llm-provider="deepinfra">
        <div class="llm-provider-card-head">
          <strong>DeepInfra</strong>
          ${badge}
        </div>
        <div class="form-grid compact mt-8">
          <label>Chave da API
            <input data-llm-provider-field="apiKey" type="password" autocomplete="off"
              placeholder="${p.hasApiKey ? `Guardada — impressão ${escapeHtml(p.apiKeyFingerprint)}` : 'cole a chave aqui'}" />
          </label>
          <label>Modelo
            <input data-llm-provider-field="model" list="deepinfraModels" value="${escapeHtml(p.model || '')}" />
            <datalist id="deepinfraModels">${DEEPINFRA_MODELS.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>
          </label>
        </div>
        ${p.verifiedAt ? `<p class="muted-text">Testado em ${escapeHtml(when(p.verifiedAt))}.</p>` : ''}
        ${p.lastError ? `<p class="muted-text"><span class="section-badge badge-red">Erro</span> ${escapeHtml(p.lastError)}</p>` : ''}
        <div class="ado-action-bar mt-8">
          <button type="button" class="btn tiny primary" data-llm-provider-save="deepinfra">Guardar e testar</button>
          ${p.hasApiKey ? '<button type="button" class="btn tiny ghost" data-llm-provider-clear="deepinfra">Remover chave</button>' : ''}
        </div>
      </div>`;
  }

  function paint() {
    const llmProviderHost = $('llmProviderPanel');
    if (llmProviderHost) llmProviderHost.innerHTML = llmProviderView(state.llmProviderSettings);

    const llmHost = $('llmOptionsPanel');
    if (llmHost) llmHost.innerHTML = llmOptionsView(state.agentSettings, state.llmWarnings);

    const host = $('githubAccountPanel');
    if (!host) return;
    if (state.busy) { host.innerHTML = '<p class="muted-text">A falar com o GitHub…</p>'; return; }
    host.innerHTML = connectionView(state.settings);

    const s = state.settings || {};
    if ($('gitDefaultOwner')) $('gitDefaultOwner').value = s.defaultOwner || '';
    if ($('gitDefaultVisibility')) $('gitDefaultVisibility').value = s.defaultVisibility || 'private';
    if ($('gitRepoPrefix')) $('gitRepoPrefix').value = s.repositoryPrefix || '';
    if ($('gitWorkspaceRoot')) $('gitWorkspaceRoot').value = s.workspaceRoot || '';
  }

  async function load() {
    if (typeof window.isSuperAdmin === 'function' && !window.isSuperAdmin()) {
      const host = $('platformSettingsRoot');
      if (host) host.innerHTML = '<p class="muted-text">Apenas super-administradores podem ver as definições da plataforma.</p>';
      return;
    }
    try {
      const payload = await apiRequest('/git-provider/settings');
      state.settings = payload.settings;
    } catch (error) {
      state.settings = null;
      window.showToast?.(error.message, 'error');
    }
    try {
      const providers = await apiRequest('/llm-provider/settings');
      state.llmProviderSettings = providers.settings;
    } catch (error) {
      state.llmProviderSettings = null;
      window.showToast?.(error.message, 'error');
    }
    paint();
  }

  async function connect() {
    try {
      const { url } = await apiRequest('/git-provider/oauth/start');
      // Full redirect, not a popup: GitHub sends the browser back to the callback,
      // which returns here once the token is stored.
      window.location.href = url;
    } catch (error) {
      window.showToast?.(error.message, 'error');
    }
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

  /**
   * Like `run`, but for actions unrelated to GitHub — it must not flash "A falar com
   * o GitHub…" over that panel while an LLM provider or runtime check is running.
   */
  async function runQuiet(fn) {
    try {
      await fn();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      await load();
    }
  }

  /**
   * Step 4: checks the previous three steps together, in the operator's own terms,
   * without spending a real execution. Each line names exactly what is missing rather
   * than a single pass/fail — "something is wrong" is not a step the operator can act on.
   */
  async function testAgentSetup() {
    const result = $('agentSetupTestResult');
    if (result) result.innerHTML = '<p class="muted-text">A verificar…</p>';
    try {
      const [health, providerPayload] = await Promise.all([
        apiRequest('/agent-runs/health'),
        apiRequest('/llm-provider/settings'),
      ]);
      const providers = Object.values(providerPayload.settings?.providers || {});
      const readyProvider = providers.find((p) => p.verifiedAt && !p.lastError);
      const lines = [
        readyProvider
          ? `✅ Motor de IA testado com sucesso: <strong>${escapeHtml(readyProvider.label)}</strong>.`
          : '❌ Nenhum motor de IA testado com sucesso ainda — passo 1.',
        health.paired
          ? '✅ Agent Runtime emparelhado.'
          : '❌ Nenhum Agent Runtime emparelhado ainda — passo 3.',
        health.runtimeReachable
          ? '✅ Agent Runtime online agora.'
          : `❌ Agent Runtime não está online${health.paired ? ' — inicie-o na máquina onde corre.' : '.'}`,
      ];
      const allOk = Boolean(readyProvider) && health.runtimeReachable;
      if (result) {
        result.innerHTML = `
          <p><span class="section-badge ${allOk ? 'badge-green' : 'badge-red'}">${allOk ? 'Pronto para uma execução real' : 'Falta um passo'}</span></p>
          <ul class="agent-setup-checklist">${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
      }
    } catch (error) {
      if (result) result.innerHTML = `<p class="muted-text"><span class="section-badge badge-red">Erro</span> ${escapeHtml(error.message)}</p>`;
    }
  }

  /** Saves the engine list without reloading the GitHub panel underneath it. */
  async function saveLlmOptions(options) {
    const payload = await apiRequest('/agent-platform/settings', {
      method: 'PATCH',
      body: { llmOptions: options },
    });
    state.agentSettings = payload.settings;
    const refreshed = await apiRequest('/agent-platform/settings');
    state.llmWarnings = refreshed.llmWarnings || {};
    paint();
  }

  document.addEventListener('click', (event) => {
    const saveProviderId = event.target?.getAttribute?.('data-llm-provider-save');
    if (saveProviderId) {
      const card = event.target.closest('[data-llm-provider]');
      const model = card?.querySelector('[data-llm-provider-field="model"]')?.value?.trim() || '';
      const apiKeyInput = card?.querySelector('[data-llm-provider-field="apiKey"]');
      // A blank key field means "keep the one already stored" — the operator should
      // never have to retype a secret just to re-run the test.
      const typedKey = apiKeyInput?.value || '';
      runQuiet(async () => {
        await apiRequest(`/llm-provider/settings/${encodeURIComponent(saveProviderId)}`, {
          method: 'PATCH',
          body: { ...(model ? { model } : {}), ...(typedKey ? { apiKey: typedKey } : {}) },
        });
        const result = await apiRequest(`/llm-provider/settings/${encodeURIComponent(saveProviderId)}/verify`, {
          method: 'POST',
          body: {},
        });
        window.showToast?.(`Chave válida — ${result.modelCount || 0} modelos disponíveis.`, 'ok');
      });
      return;
    }

    const clearProviderId = event.target?.getAttribute?.('data-llm-provider-clear');
    if (clearProviderId) {
      if (!window.confirm('Remover esta chave? As execuções que dependem dela deixam de conseguir chamar este motor.')) return;
      runQuiet(async () => {
        await apiRequest(`/llm-provider/settings/${encodeURIComponent(clearProviderId)}/disconnect`, {
          method: 'POST',
          body: {},
        });
        window.showToast?.('Chave removida.', 'ok');
      });
      return;
    }

    const removeIndex = event.target?.getAttribute?.('data-llm-remove');
    if (removeIndex !== null && removeIndex !== undefined) {
      const options = collectLlmOptions();
      const removed = options[Number(removeIndex)];
      if (!window.confirm(`Remover “${removed?.label || removed?.model}”? As execuções que o usavam passam a escolher outro.`)) return;
      options.splice(Number(removeIndex), 1);
      saveLlmOptions(options).catch((error) => window.showToast?.(error.message, 'error'));
      return;
    }

    const id = event.target?.id;
    if (id === 'llmAddBtn') {
      // Appended locally and rendered immediately; nothing is stored until Guardar.
      state.agentSettings = {
        ...(state.agentSettings || {}),
        llmOptions: [...collectLlmOptions(), {
          id: `modelo-${Date.now()}`,
          label: 'Novo modelo',
          provider: 'deepinfra',
          model: '',
          profileId: 'medium',
          enabled: false,
          pricingVerified: false,
          pricing: { inputPer1M: 0, outputPer1M: 0 },
        }],
      };
      paint();
      return;
    }
    if (id === 'llmSaveBtn') {
      saveLlmOptions(collectLlmOptions())
        .then(() => window.showToast?.('Modelos guardados.', 'ok'))
        .catch((error) => window.showToast?.(error.message, 'error'));
      return;
    }

    if (id === 'agentSetupTestBtn') {
      testAgentSetup();
      return;
    }

    if (id === 'githubConnectBtn' || id === 'githubReconnectBtn') {
      connect();
    } else if (id === 'githubDisconnectBtn') {
      if (!window.confirm('Desligar a conta GitHub? Os projectos ligados a repositórios deixam de poder executar.')) return;
      run(async () => {
        await apiRequest('/git-provider/disconnect', { method: 'POST', body: {} });
        window.showToast?.('Conta GitHub desligada.', 'ok');
      });
    } else if (id === 'githubTestBtn') {
      run(async () => {
        const payload = await apiRequest('/git-provider/verify', { method: 'POST', body: {} });
        window.showToast?.(`Ligação válida — ${payload.identity.account}.`, 'ok');
      });
    } else if (id === 'gitSaveBtn') {
      run(async () => {
        await apiRequest('/git-provider/settings', {
          method: 'PATCH',
          body: {
            defaultOwner: $('gitDefaultOwner')?.value?.trim() || '',
            defaultVisibility: $('gitDefaultVisibility')?.value || 'private',
            repositoryPrefix: $('gitRepoPrefix')?.value?.trim() || '',
            workspaceRoot: $('gitWorkspaceRoot')?.value?.trim() || '',
          },
        });
        window.showToast?.('Predefinições guardadas.', 'ok');
      });
    }
  });

  window.PlatformSettingsUI = { render: load, refresh: load };
})();
