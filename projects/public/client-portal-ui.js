/**
 * Linha de produção — the project's front page. Client and partner/admin share this
 * screen; the difference is what's rendered, not a separate page.
 *
 * Client: the nine stage dots and a plain-language summary. Nothing else.
 * Partner/admin: the same strip, plus the Execução panel (goal, status, spend, the
 * one live question) and a small Tarefas recentes list. The technical sections
 * (módulos, diagramas, trabalho da fase) sit below as collapsibles on this same
 * page — there is no second delivery screen.
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiRequest(path, options) {
    return window.apiRequest(path, options);
  }

  function showToast(msg, type) {
    window.showToast?.(msg, type);
  }

  const STAGE_LABELS = {
    idea: 'Ideia',
    discovery: 'Descoberta',
    requirements: 'Requisitos',
    architecture: 'Arquitectura',
    roadmap: 'Roteiro',
    implementation: 'Implementação',
    validation: 'Validação',
    delivery: 'Entrega',
    operations: 'Operação',
  };

  function stageLabel(id) {
    return STAGE_LABELS[id] || id;
  }

  function isPartnerOrAdmin() {
    return window.isSuperAdmin?.() === true || window.isPartnerEditor?.() === true;
  }

  /**
   * The role helpers read `state.user`, which is only filled once `auth/me` answers.
   * A render triggered before that cannot tell a client from a partner — and must not
   * be mistaken for "this person is neither".
   */
  function roleKnown() {
    return Boolean(window.state?.user?.role);
  }

  /** Resolves once the signed-in user is known, or gives up rather than spinning. */
  async function waitForRole(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!roleKnown() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return roleKnown();
  }

  function money(value) {
    return `${(Number(value) || 0).toFixed(2)}€`;
  }

  async function loadClientPortal(projectId) {
    try {
      return await apiRequest(`/projects/${projectId}/client-portal`);
    } catch {
      return null;
    }
  }

  async function loadOrchestration(projectId) {
    try {
      return await apiRequest(`/${projectId}/orchestration`);
    } catch {
      return null;
    }
  }

  async function loadSurvey(projectId) {
    try {
      const payload = await apiRequest(`/${projectId}/survey`);
      return payload?.survey || null;
    } catch {
      return null;
    }
  }

  async function loadRecentTasks(projectId) {
    try {
      const payload = await apiRequest(`/projects/${projectId}/work-items?limit=5`);
      return payload?.workItems || [];
    } catch {
      return [];
    }
  }

  function renderStageStrip(milestones) {
    const dots = milestones.map((m) => {
      const done = m.status === 'approved' || m.status === 'completed' || m.status === 'done';
      const current = m.status === 'in_progress';
      const dotClass = current ? 'stage-dot-current' : (done ? 'stage-dot-done' : 'stage-dot-pending');
      return `
        <div class="stage-dot-wrap" title="${escapeHtml(stageLabel(m.id))}">
          <span class="stage-dot ${dotClass}"></span>
          <span class="stage-dot-label">${escapeHtml(stageLabel(m.id))}</span>
        </div>`;
    }).join('');

    const summaries = milestones.filter((m) => m.summary).map((m) => `
      <li><strong>${escapeHtml(stageLabel(m.id))}:</strong> ${escapeHtml(m.summary)}</li>
    `).join('');

    return `
      <div class="stage-strip">${dots}</div>
      ${summaries ? `<ul class="stage-strip-summaries">${summaries}</ul>` : '<p class="muted-text">Ainda sem resumos de fase.</p>'}
    `;
  }

  function renderQuestions(questions) {
    if (!questions.length) return '';
    return `
      <article class="read-card mt-8">
        <h4>Perguntas para si (${questions.length})</h4>
        <ul class="client-questions">${questions.slice(0, 5).map((q) => `<li>${escapeHtml(q.question || q.text || '')}</li>`).join('')}</ul>
      </article>`;
  }

  function renderApprovals(approvals) {
    if (!approvals.length) return '';
    return `
      <article class="read-card mt-8">
        <h4>Aprovações pendentes (${approvals.length})</h4>
        <ul class="client-approvals">${approvals.map((a) => `
          <li><span>${escapeHtml(stageLabel(a.stageId))}</span> <span class="chip">${escapeHtml(a.status)}</span></li>
        `).join('')}</ul>
      </article>`;
  }

  const EXEC_STATUS_LABEL = {
    running: ['badge-green', 'A correr'],
    waiting_human: ['badge-gray', 'À sua espera'],
    paused_budget: ['badge-amber', 'Orçamento esgotado'],
    halted: ['badge-red', 'Parada por decisão'],
  };

  function renderExecucaoPanel(orch) {
    if (!orch) return '';
    const exec = orch.execucao;
    const rollup = orch.rollup || {};
    const rollupLine = rollup.count
      ? `<p class="muted-text">Total do projecto: ${money(rollup.totalSpentUsd)} · ${(rollup.totalHours || 0).toFixed(1)}h em ${rollup.count} execução(ões).</p>`
      : '';

    // A project with no repository has nowhere for the agents to write, so the form
    // is replaced by what is missing instead of failing on submit.
    if (!exec && orch.blockedReason) {
      return `
        <div class="read-card">
          <p class="muted-text" style="margin:0 0 8px">Execução</p>
          <p><span class="section-badge badge-amber">Projecto incompleto</span>
          Este projecto ainda não tem repositório. Ligue um em <strong>Definições do projecto</strong> antes de executar.</p>
          ${rollupLine}
        </div>`;
    }

    if (!exec) {
      return `
        <div class="read-card">
          <p class="muted-text" style="margin:0 0 8px">Execução</p>
          <label class="exec-kind-field">O que vai acontecer
            <select id="execKind">
              <option value="construcao">Construir — partir da ideia até ao código</option>
              <option value="levantamento">Levantar o que já existe — a app já funciona, falta descrevê-la</option>
            </select>
          </label>
          <textarea id="execGoalInput" placeholder="O que quer que a fábrica construa? Ex.: Criar o mockup e os requisitos das reservas" style="width:100%;min-height:64px;margin:8px 0"></textarea>
          <div class="form-grid compact" style="margin-bottom:8px">
            <label>Limite de custo (€)<input type="number" id="execMaxCost" min="0" value="20" /></label>
            <label>Limite de horas<input type="number" id="execMaxHours" min="0" value="4" /></label>
          </div>
          <button type="button" class="btn primary" id="execStartBtn">Iniciar execução</button>
          ${rollupLine}
        </div>`;
    }

    const [badgeClass, label] = EXEC_STATUS_LABEL[exec.status] || ['badge-gray', exec.status];
    const question = exec.question ? `
      <article class="read-card mt-8">
        <strong>Pergunta de ${escapeHtml(exec.currentPersonaId || exec.question.personaId)}</strong>
        <p>${escapeHtml(exec.question.text)}</p>
        <div class="ado-action-bar">
          <button type="button" class="btn primary" id="execAcceptBtn">Aceitar e continuar</button>
          <button type="button" class="btn ghost" id="execRejectBtn">Pedir outra versão</button>
        </div>
      </article>` : '';

    const halted = exec.status === 'halted' || exec.status === 'paused_budget';
    const haltedBlock = halted ? `
      <p class="muted-text mt-8"><span class="section-badge badge-red">Parou</span> ${escapeHtml(exec.haltReason || orch.next?.reason || '')}</p>
      <button type="button" class="btn" id="execRaiseBtn">Aumentar limite e continuar</button>` : '';

    const activity = exec.status === 'running' && orch.next?.personaId
      ? `<p class="muted-text mt-8"><i class="ti ti-loader-2" aria-hidden="true"></i> A trabalhar: <code>${escapeHtml(orch.next.personaId)}</code></p>`
      : '';

    return `
      <div class="read-card">
        <div class="panel-title-row">
          <div>
            <p class="muted-text" style="margin:0 0 2px">Execução${exec.kind === 'levantamento' ? ' · levantamento' : ''}</p>
            <p style="margin:0">${escapeHtml(exec.goal)}</p>
          </div>
          <span class="section-badge ${badgeClass}">${escapeHtml(label)}</span>
        </div>
        <p class="muted-text mt-8">${money(exec.budget.spentUsd)} de ${exec.budget.maxCostUsd ? money(exec.budget.maxCostUsd) : '∞'} · ${exec.budget.hours.toFixed(1)}h de ${exec.budget.maxHours || '∞'}</p>
        ${activity}
        ${haltedBlock}
        ${!halted && exec.status === 'running' ? '<button type="button" class="btn ghost mt-8" id="execStopBtn">Parar</button>' : ''}
        ${rollupLine}
      </div>
      ${question}`;
  }

  /**
   * What the platform read in the repository. Shown because it is the evidence the
   * personas worked from — a requirement nobody can trace back to something in the
   * code is a requirement worth doubting.
   */
  function renderSurvey(survey) {
    if (!survey) return '';
    const list = (items, render) => items.slice(0, 40).map(render).join('');
    return `
      <details class="pdos-secondary-panel mt-12" id="pdosRepoSurvey">
        <summary>O que já existe no repositório
          <span class="muted-text">${survey.fileCount} ficheiros · ${survey.routes.length} rotas · ${survey.modules.length} módulos</span>
        </summary>
        <div class="mt-8">
          <p class="muted-text">
            <code>${escapeHtml(survey.repository)}</code> · ramo <code>${escapeHtml(survey.branch)}</code>
            · lido ${escapeHtml(new Date(survey.surveyedAt).toLocaleString('pt-PT'))}
          </p>
          ${survey.languages.length ? `<p class="muted-text">${survey.languages.slice(0, 8).map((l) => `${escapeHtml(l.language)} (${l.files})`).join(' · ')}</p>` : ''}
          ${survey.modules.length ? `
            <p class="muted-text mt-8">Estrutura</p>
            <ul class="survey-list">${list(survey.modules, (m) => `<li><code>${escapeHtml(m.name)}</code> <span class="muted-text">${m.files} ficheiro(s)</span></li>`)}</ul>` : ''}
          ${survey.routes.length ? `
            <p class="muted-text mt-8">Rotas encontradas</p>
            <ul class="survey-list">${list(survey.routes, (r) => `<li><code>${escapeHtml(r)}</code></li>`)}</ul>` : ''}
          ${survey.truncatedFiles?.length ? `
            <p class="muted-text mt-8"><span class="section-badge badge-amber">Lido em parte</span>
            ${list(survey.truncatedFiles, (f) => `<code>${escapeHtml(f)}</code> `)}</p>` : ''}
          <button type="button" class="btn tiny ghost mt-8" id="surveyRefreshBtn">Voltar a ler o repositório</button>
        </div>
      </details>`;
  }

  function renderRecentTasks(tasks) {
    if (!tasks.length) return '<p class="muted-text">Sem tarefas recentes.</p>';
    return `<ul class="mt-8">${tasks.map((t) => `
      <li style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:0.5px solid var(--line)">
        <span class="chip">${t.executorMode === 'agent' ? 'IA' : 'Humano'}</span>
        <span style="flex:1">${escapeHtml(t.title)}</span>
        <span class="muted-text">${escapeHtml(t.status)}</span>
      </li>`).join('')}</ul>`;
  }

  function renderClientPortal(project, data) {
    const el = $('pdosClientPortal');
    const shell = $('pdosShell');
    if (!el || !project) return;

    const partner = isPartnerOrAdmin();
    const client = window.isClientUser?.() === true;
    // A client sees the production line and nothing else — the technical
    // collapsibles below it are partner/admin only.
    shell?.classList.toggle('client-simple', client);
    // Role not answered yet: leave whatever is on screen alone. Blanking here is what
    // used to leave the dashboard permanently empty after a fresh page load.
    if (!roleKnown()) return;
    if (!client && !partner) {
      // Role not resolved yet (or genuinely neither) — the CSS default (no class)
      // is already dashboard-only/hidden, so simply not adding .detail-expanded
      // here is enough to stay safe. This used to actively tear down the hiding
      // class in this exact branch, which was the bug: a brief role-detection race
      // at page load landed here and exposed the raw doubled-up view.
      el.innerHTML = '';
      return;
    }
    const portal = data.portal || {};
    const milestones = portal.milestones || [];
    const questions = portal.openQuestions || [];
    const approvals = portal.pendingApprovals || [];

    el.innerHTML = `
      <section class="production-line">
        ${renderStageStrip(milestones)}
        ${renderQuestions(questions)}
        ${renderApprovals(approvals)}
        ${partner ? `
          <div class="production-line-grid mt-12">
            <div id="execucaoBody">${renderExecucaoPanel(data.orchestration)}</div>
            <div class="read-card">
              <p class="muted-text" style="margin:0 0 4px">Tarefas recentes</p>
              ${renderRecentTasks(data.tasks || [])}
            </div>
          </div>
          ${renderSurvey(data.survey)}` : ''}
      </section>
    `;

    if (!partner) return;

    $('surveyRefreshBtn')?.addEventListener('click', async () => {
      try {
        showToast('A ler o repositório…', 'info');
        await apiRequest(`/${project.id}/survey`, { method: 'POST', body: {} });
        await refresh(project, { force: true });
        showToast('Levantamento actualizado.', 'ok');
      } catch (error) { showToast(error.message, 'error'); }
    });

    // Choosing a levantamento fills in the goal, because there is only one sensible
    // one and making the engineer phrase it adds nothing.
    $('execKind')?.addEventListener('change', (event) => {
      const goalEl = $('execGoalInput');
      if (!goalEl) return;
      const survey = 'Levantar o que a aplicação já faz: requisitos e mapa de módulos a partir do código.';
      if (event.target.value === 'levantamento') {
        if (!goalEl.value.trim()) goalEl.value = survey;
      } else if (goalEl.value.trim() === survey) {
        goalEl.value = '';
      }
    });

    $('execStartBtn')?.addEventListener('click', async () => {
      const goal = $('execGoalInput')?.value?.trim();
      if (!goal) return showToast('Descreva o objectivo desta execução.', 'error');
      const kind = $('execKind')?.value || 'construcao';
      try {
        // A levantamento reads the repository first. The scan is what the personas
        // then reason over, so it has to exist before the chain starts — not as a
        // separate button the engineer has to remember to press.
        if (kind === 'levantamento') {
          showToast('A ler o repositório…', 'info');
          await apiRequest(`/${project.id}/survey`, { method: 'POST', body: {} });
        }
        await apiRequest(`/${project.id}/orchestration/start`, {
          method: 'POST',
          body: {
            goal,
            kind,
            maxCostUsd: Number($('execMaxCost')?.value) || 0,
            maxHours: Number($('execMaxHours')?.value) || 0,
          },
        });
        await refresh(project, { force: true });
      } catch (error) { showToast(error.message, 'error'); }
    });
    $('execAcceptBtn')?.addEventListener('click', async () => {
      try {
        await apiRequest(`/${project.id}/orchestration/answer`, { method: 'POST', body: { accepted: true } });
        await refresh(project, { force: true });
      } catch (error) { showToast(error.message, 'error'); }
    });
    $('execRejectBtn')?.addEventListener('click', async () => {
      try {
        await apiRequest(`/${project.id}/orchestration/answer`, { method: 'POST', body: { accepted: false } });
        await refresh(project, { force: true });
      } catch (error) { showToast(error.message, 'error'); }
    });
    $('execStopBtn')?.addEventListener('click', async () => {
      try {
        await apiRequest(`/${project.id}/orchestration/stop`, { method: 'POST', body: {} });
        await refresh(project, { force: true });
      } catch (error) { showToast(error.message, 'error'); }
    });
    $('execRaiseBtn')?.addEventListener('click', async () => {
      const cost = window.prompt('Novo limite de custo, em euros:', '40');
      if (cost === null) return;
      try {
        await apiRequest(`/${project.id}/orchestration/start`, { method: 'POST', body: { goal: data.orchestration?.execucao?.goal, maxCostUsd: Number(cost) || 0 } });
        await refresh(project, { force: true });
      } catch (error) { showToast(error.message, 'error'); }
    });
  }

  let clientPortalInflight = null;
  let lastClientPortalKey = '';

  async function refresh(project, options = {}) {
    if (!project?.id) return;
    const key = `${project.id}:${project.updatedAt || ''}`;
    if (!options.force && lastClientPortalKey === key && clientPortalInflight) {
      return clientPortalInflight;
    }
    clientPortalInflight = (async () => {
      // Loading the data before the role is known would fetch the partner-only
      // endpoints as nobody, and render as nobody. Wait for the answer instead.
      if (!(await waitForRole())) return;
      const partner = isPartnerOrAdmin();
      const client = window.isClientUser?.() === true;
      if (!client && !partner) return;
      const [portal, orchestration, tasks, survey] = await Promise.all([
        loadClientPortal(project.id),
        partner ? loadOrchestration(project.id) : Promise.resolve(null),
        partner ? loadRecentTasks(project.id) : Promise.resolve([]),
        partner ? loadSurvey(project.id) : Promise.resolve(null),
      ]);
      renderClientPortal(project, { portal, orchestration, tasks, survey });
      lastClientPortalKey = key;
    })();
    try {
      await clientPortalInflight;
    } finally {
      clientPortalInflight = null;
    }
  }

  window.ClientPortalUI = {
    refresh,
    renderClientPortal,
    loadClientPortal,
  };
})();
