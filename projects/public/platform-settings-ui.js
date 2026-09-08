/**
 * Definições da plataforma — identity that belongs to the platform, not to a project
 * and not to an agent. Today that is the GitHub account every project's repository is
 * reached through.
 */
(function initPlatformSettingsUi() {
  const state = { settings: null, busy: false };

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

  function paint() {
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

  document.addEventListener('click', (event) => {
    const id = event.target?.id;
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
