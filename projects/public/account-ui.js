/**
 * Conta — the person signed in.
 *
 * One of three kinds of settings, each about a different thing and kept apart so nobody
 * has to guess which one changes what:
 *
 *   Conta                     this person: what describes them and how they sign in
 *   Definições do projecto    one project: what it is, who reaches it, where its code is
 *   Definições da plataforma  everyone: accounts, GitHub, models, the Agent Runtime
 *
 * On a phone the Definições tab lands here, so this page also leads to the other two.
 */
(function initAccountUi() {
  const ROLE_LABELS = { super_admin: 'Superutilizador', partner: 'Parceiro', client: 'Cliente' };
  const PROFILE_FIELDS = ['name', 'email', 'phone', 'company', 'jobTitle'];

  function kit() { return window.IosKit; }

  function icon(name, size = 20) {
    return window.IosIcons?.svg(name, { size }) || '';
  }

  function field({ name, label, value = '', type = 'text', autocomplete = '', placeholder = '' }) {
    const k = kit();
    return `
      <label class="ios-field">
        <span class="ios-field-label">${k.escapeHtml(label)}</span>
        <input name="${name}" type="${type}" value="${k.escapeHtml(value || '')}"${autocomplete ? ` autocomplete="${autocomplete}"` : ''}${placeholder ? ` placeholder="${k.escapeHtml(placeholder)}"` : ''} />
      </label>`;
  }

  function linkRow({ tab, iconName, title, sub }) {
    const k = kit();
    return `
      <button type="button" class="ios-row" data-account-go="${tab}">
        <span class="ios-row-icon">${icon(iconName, 22)}</span>
        <span class="ios-row-main">
          <span class="ios-row-title">${k.escapeHtml(title)}</span>
          <span class="ios-row-sub">${k.escapeHtml(sub)}</span>
        </span>
        ${k.icon('chevron', 14, 'ios-chevron')}
      </button>`;
  }

  function render() {
    const host = document.getElementById('accountPanel');
    const k = kit();
    const user = window.state?.user;
    if (!host || !k || !user) return;

    const project = window.state?.selectedProject;
    const isAdmin = window.isSuperAdmin?.() === true;
    const isClient = user.role === 'client';

    const others = [
      project && !isClient ? linkRow({
        tab: 'definicoes',
        iconName: 'folder',
        title: 'Definições do projecto',
        sub: `${project.name} · o que é, quem lhe acede, onde está o código`,
      }) : '',
      isAdmin ? linkRow({
        tab: 'definicoesPlataforma',
        iconName: 'gear',
        title: 'Definições da plataforma',
        sub: 'Para todos: contas, GitHub, modelos e Agent Runtime',
      }) : '',
      isAdmin ? linkRow({ tab: 'agentes', iconName: 'bolt', title: 'Agentes', sub: 'Personas, modelos e execuções' }) : '',
    ].join('');

    host.innerHTML = `
      <header class="ios-page-head account-head">
        <span class="account-avatar" aria-hidden="true">${k.escapeHtml(k.initials(user.name))}</span>
        <div>
          <span class="settings-scope">${icon('person', 14)}A sua conta</span>
          <h1 class="ios-large-title">${k.escapeHtml(user.name)}</h1>
          <p class="ios-subtitle">${k.escapeHtml([user.email, ROLE_LABELS[user.role] || user.role].filter(Boolean).join(' · '))}</p>
        </div>
      </header>

      <form class="ios-section" id="accountProfileForm" novalidate>
        <h2 class="ios-group-label">Sobre si</h2>
        <div class="ios-list">
          ${field({ name: 'name', label: 'Nome', value: user.name, autocomplete: 'name' })}
          ${field({ name: 'email', label: 'Email', value: user.email, type: 'email', autocomplete: 'email' })}
          ${field({ name: 'phone', label: 'Telefone', value: user.phone, type: 'tel', autocomplete: 'tel', placeholder: 'Opcional' })}
          ${field({ name: 'company', label: 'Empresa', value: user.company, autocomplete: 'organization', placeholder: 'Opcional' })}
          ${field({ name: 'jobTitle', label: 'Função', value: user.jobTitle, autocomplete: 'organization-title', placeholder: 'Opcional' })}
        </div>
        <p class="ios-footnote">Mudar o email termina as sessões abertas noutros dispositivos.</p>
        <div class="ios-form-actions">
          <button type="submit" class="btn primary">Guardar</button>
          <span class="muted-text" data-account-status aria-live="polite"></span>
        </div>
      </form>

      <form class="ios-section" id="accountPasswordForm" novalidate>
        <h2 class="ios-group-label">Password</h2>
        ${user.hasPassword === false ? '<p class="ios-footnote">Entra com Google. Pode também criar uma password para entrar com o email.</p>' : ''}
        <div class="ios-list">
          ${user.hasPassword === false ? '' : field({ name: 'currentPassword', label: 'Actual', type: 'password', autocomplete: 'current-password' })}
          ${field({ name: 'newPassword', label: 'Nova', type: 'password', autocomplete: 'new-password', placeholder: 'Pelo menos 10 caracteres' })}
          ${field({ name: 'confirmPassword', label: 'Repetir', type: 'password', autocomplete: 'new-password' })}
        </div>
        <div class="ios-form-actions">
          <button type="submit" class="btn">Mudar password</button>
          <span class="muted-text" data-account-status aria-live="polite"></span>
        </div>
      </form>

      ${others ? `
        <section class="ios-section">
          <h2 class="ios-group-label">Outras definições</h2>
          <div class="ios-list">${others}</div>
        </section>` : ''}

      <section class="ios-section">
        <div class="ios-list">
          <button type="button" class="ios-row" data-account-action="help">
            <span class="ios-row-icon">${icon('help', 22)}</span>
            <span class="ios-row-main"><span class="ios-row-title">Primeiros passos</span><span class="ios-row-sub">Como funciona a plataforma para a sua conta</span></span>
            ${k.icon('chevron', 14, 'ios-chevron')}
          </button>
        </div>
      </section>

      <section class="ios-section">
        <div class="ios-list">
          <button type="button" class="ios-row is-destructive" data-account-action="logout">
            <span class="ios-row-icon">${icon('logout', 22)}</span>
            <span class="ios-row-main"><span class="ios-row-title">Terminar sessão</span></span>
          </button>
        </div>
      </section>`;
  }

  async function saveProfile(form) {
    const status = form.querySelector('[data-account-status]');
    const body = Object.fromEntries(PROFILE_FIELDS.map((key) => [key, form.elements[key].value]));
    if (!body.name.trim()) {
      status.textContent = 'O nome não pode ficar vazio.';
      return;
    }
    try {
      status.textContent = 'A guardar…';
      const response = await window.apiRequest('/auth/me', { method: 'PATCH', body });
      window.setCurrentUser?.(response.user);
      render();
      window.showToast?.(response.changed?.length ? 'Conta actualizada.' : 'Nada mudou.', 'ok');
    } catch (error) {
      status.textContent = error.message;
      window.showToast?.(error.message, 'error');
    }
  }

  async function changePassword(form) {
    const status = form.querySelector('[data-account-status]');
    const currentPassword = form.elements.currentPassword?.value || '';
    const needsCurrent = window.state?.user?.hasPassword !== false;
    const newPassword = form.elements.newPassword.value;
    if ((needsCurrent && !currentPassword) || !newPassword) {
      status.textContent = 'Escreva a password actual e a nova.';
      return;
    }
    if (newPassword !== form.elements.confirmPassword.value) {
      status.textContent = 'As duas passwords novas não coincidem.';
      return;
    }
    try {
      status.textContent = 'A mudar…';
      await window.apiRequest('/auth/me', { method: 'PATCH', body: { currentPassword, newPassword } });
      form.reset();
      status.textContent = '';
      if (!needsCurrent) {
        window.setCurrentUser?.({ ...window.state.user, hasPassword: true });
        render();
      }
      window.showToast?.('Password alterada. As sessões noutros dispositivos foram terminadas.', 'ok');
    } catch (error) {
      status.textContent = error.message;
      window.showToast?.(error.message, 'error');
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form?.id === 'accountProfileForm') {
      event.preventDefault();
      saveProfile(form);
    } else if (form?.id === 'accountPasswordForm') {
      event.preventDefault();
      changePassword(form);
    }
  });

  document.addEventListener('click', (event) => {
    const go = event.target?.closest?.('[data-account-go]');
    if (go) {
      window.switchToTab?.(go.dataset.accountGo);
      return;
    }
    if (event.target?.closest?.('[data-account-action="logout"]')) window.logout?.();
    if (event.target?.closest?.('[data-account-action="help"]')) window.HelpUI?.openPlatformHelp?.();
  });

  window.AccountUI = { render };
})();
