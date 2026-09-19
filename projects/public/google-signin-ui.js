/**
 * Entrar com Google — the button on the login card, and its settings in Definições da
 * plataforma.
 *
 * The server does the trusting (lib/google-signin.js). This only asks Google for a
 * signed token and hands it over; the session that comes back is the same kind a
 * password login gets.
 */
(function initGoogleSignInUi() {
  const GSI_SRC = 'https://accounts.google.com/gsi/client';
  let scriptPromise = null;
  let mountedFor = '';

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = GSI_SRC;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => {
          scriptPromise = null;
          reject(new Error('Não foi possível carregar o botão da Google.'));
        };
        document.head.appendChild(script);
      });
    }
    return scriptPromise;
  }

  async function onCredential(response) {
    try {
      const payload = await window.apiRequest('/auth/google', {
        method: 'POST',
        body: { credential: response.credential },
      });
      await window.completeLogin?.(payload);
      if (payload.created) {
        window.showToast?.('Conta criada. Um administrador vai dar-lhe acesso aos projectos.', 'ok');
      }
    } catch (error) {
      window.setLoginStatus?.(error.message, 'error');
    }
  }

  /** Shows the button when the platform has a client ID, and nothing when it has none. */
  async function mountLogin(config) {
    const clientId = config?.googleSignIn?.clientId || '';
    const block = $('googleSignInBlock');
    const host = $('googleSignInButton');
    if (!block || !host) return;
    block.hidden = !clientId;
    if (!clientId || mountedFor === clientId) return;
    try {
      await loadScript();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: onCredential,
        ux_mode: 'popup',
        auto_select: false,
      });
      host.innerHTML = '';
      window.google.accounts.id.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        locale: 'pt-PT',
        width: Math.min(360, host.clientWidth || 360),
      });
      mountedFor = clientId;
    } catch {
      // Without Google's script the password login still works; the button just is not offered.
      block.hidden = true;
    }
  }

  function paintSettings(host, config) {
    const fromEnv = config.source === 'env';
    host.innerHTML = `
      <div class="form-grid compact">
        <label class="full">Client ID do Google
          <input id="googleClientIdInput" value="${escapeHtml(config.clientId)}" placeholder="…apps.googleusercontent.com" ${fromEnv ? 'disabled' : ''} />
          <small class="field-help">${fromEnv
    ? 'Definido no servidor pela variável GOOGLE_OAUTH_CLIENT_ID.'
    : 'Na Google Cloud Console: APIs e serviços → Credenciais → Criar «ID de cliente OAuth» do tipo Aplicação Web.'}</small>
        </label>
        <label class="full">Origem a autorizar nesse ID de cliente
          <input value="${escapeHtml(window.location.origin)}" readonly />
          <small class="field-help">Copie para «Origens JavaScript autorizadas». Uma por cada endereço onde a plataforma abre.</small>
        </label>
        <label class="full">Só estes domínios (opcional)
          <input id="googleDomainsInput" value="${escapeHtml((config.allowedDomains || []).join(', '))}" placeholder="ex.: yourlabpt.com — vazio aceita qualquer conta Google" ${fromEnv ? 'disabled' : ''} />
        </label>
      </div>
      <p class="mt-8">${config.clientId
    ? '<span class="ios-badge badge-green">Ligado</span> <span class="muted-text">O botão «Continuar com Google» aparece no início de sessão.</span>'
    : '<span class="ios-badge badge-gray">Desligado</span> <span class="muted-text">Sem Client ID, o início de sessão só aceita email e password.</span>'}</p>
      ${fromEnv ? '' : '<div class="settings-save-row mt-8"><button type="button" class="btn primary" id="googleSaveBtn">Guardar</button></div>'}`;
  }

  async function renderSettings() {
    const host = $('googleSignInSettings');
    if (!host || window.isSuperAdmin?.() !== true) return;
    try {
      paintSettings(host, await window.apiRequest('/auth/google/settings'));
    } catch (error) {
      host.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
    }
  }

  async function save() {
    const host = $('googleSignInSettings');
    try {
      const config = await window.apiRequest('/auth/google/settings', {
        method: 'PUT',
        body: {
          clientId: $('googleClientIdInput')?.value || '',
          allowedDomains: $('googleDomainsInput')?.value || '',
        },
      });
      if (window.state?.config) window.state.config.googleSignIn = { clientId: config.clientId };
      paintSettings(host, config);
      window.showToast?.('Entrada com Google guardada.', 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('#googleSaveBtn')) save();
  });

  window.GoogleSignInUI = { mountLogin, renderSettings };
})();
