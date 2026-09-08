/**
 * Linha de produção — the project's front page. Client and partner/admin share this
 * screen; the difference is what's rendered, not a separate page.
 *
 * Client: the nine stage dots and a plain-language summary. Nothing else.
 * Partner/admin: the same strip, plus the Execução panel (goal, status, spend, the
 * one live question) and a small Tarefas recentes list.
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

    if (!exec) {
      return `
        <div class="read-card">
          <p class="muted-text" style="margin:0 0 8px">Execução</p>
          <textarea id="execGoalInput" placeholder="O que quer que a fábrica construa? Ex.: Criar o mockup e os requisitos das reservas" style="width:100%;min-height:64px;margin-bottom:8px"></textarea>
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
            <p class="muted-text" style="margin:0 0 2px">Execução</p>
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

  function renderRecentTasks(tasks) {
    if (!tasks.length) return '<p class="muted-text">Sem tarefas recentes.</p>';
    return `<ul class="mt-8">${tasks.map((t) => `
      <li style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:0.5px solid var(--line)">
        <span class="chip">${t.executorMode === 'agent' ? 'IA' : 'Humano'}</span>
        <span style="flex:1">${escapeHtml(t.title)}</span>
        <span class="muted-text">${escapeHtml(t.status)}</span>
      </li>`).join('')}</ul>`;
  }

  // Dashboard-only by default for everyone. A partner/admin can explicitly expand
  // to the technical detail view, but never sees both at once — that stacking is
  // exactly the doubled, jarring mess this replaces.
  let expandedProjectId = '';

  // The CSS default (no class at all) is already dashboard-only — this only ever
  // needs to ADD .detail-expanded to reveal the heavy view; there is no "hide" class
  // to apply, so there's nothing for a race or a skipped render to get wrong.
  function applyShellMode(shell, expanded) {
    if (!shell) return;
    shell.classList.toggle('detail-expanded', expanded);
  }

  /**
   * One small bar, always in the same spot, that flips between the two views.
   * Lives outside #pdosClientPortal so it survives being shown in either mode.
   */
  function renderModeToggle(shell, project, expanded) {
    if (!shell) return;
    let bar = document.getElementById('pdosModeToggle');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pdosModeToggle';
      const header = document.getElementById('pdosProjectHeader');
      if (header) header.insertAdjacentElement('afterend', bar);
      else shell.prepend(bar);
    }
    if (!isPartnerOrAdmin()) {
      bar.innerHTML = '';
      return;
    }
    bar.innerHTML = expanded
      ? '<button type="button" class="btn tiny ghost" id="pdosBackToSummary">← Voltar ao resumo</button>'
      : '<button type="button" class="btn tiny ghost" id="pdosExpandDetail">Ver detalhe técnico →</button>';
    document.getElementById('pdosBackToSummary')?.addEventListener('click', () => {
      expandedProjectId = '';
      window.ClientPortalUI?.refresh?.(project, { force: true });
    });
    document.getElementById('pdosExpandDetail')?.addEventListener('click', () => {
      expandedProjectId = project.id;
      window.ClientPortalUI?.refresh?.(project, { force: true });
    });
  }

  function renderClientPortal(project, data) {
    const el = $('pdosClientPortal');
    const shell = $('pdosShell');
    if (!el || !project) return;

    const partner = isPartnerOrAdmin();
    const client = window.isClientUser?.() === true;
    if (!client && !partner) {
      // Role not resolved yet (or genuinely neither) — the CSS default (no class)
      // is already dashboard-only/hidden, so simply not adding .detail-expanded
      // here is enough to stay safe. This used to actively tear down the hiding
      // class in this exact branch, which was the bug: a brief role-detection race
      // at page load landed here and exposed the raw doubled-up view.
      el.innerHTML = '';
      shell?.classList.remove('detail-expanded');
      document.getElementById('pdosModeToggle')?.remove();
      return;
    }
    const expanded = partner && expandedProjectId === project.id;
    applyShellMode(shell, expanded);
    renderModeToggle(shell, project, expanded);
    if (expanded) return;

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
          </div>` : ''}
      </section>
    `;

    if (!partner) return;

    $('execStartBtn')?.addEventListener('click', async () => {
      const goal = $('execGoalInput')?.value?.trim();
      if (!goal) return showToast('Descreva o objectivo desta execução.', 'error');
      try {
        await apiRequest(`/${project.id}/orchestration/start`, {
          method: 'POST',
          body: {
            goal,
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
    // The CSS default (no class) is already dashboard-only, so the only residual
    // risk is a STALE .detail-expanded left over from a previous render while this
    // one's fetches are still in flight. Clearing it synchronously, before any
    // await, closes that window — nothing is ever exposed while we work out what
    // to show next.
    $('pdosShell')?.classList.remove('detail-expanded');
    const key = `${project.id}:${project.updatedAt || ''}`;
    if (!options.force && lastClientPortalKey === key && clientPortalInflight) {
      return clientPortalInflight;
    }
    clientPortalInflight = (async () => {
      const partner = isPartnerOrAdmin();
      const client = window.isClientUser?.() === true;
      if (!client && !partner) return;
      const [portal, orchestration, tasks] = await Promise.all([
        loadClientPortal(project.id),
        partner ? loadOrchestration(project.id) : Promise.resolve(null),
        partner ? loadRecentTasks(project.id) : Promise.resolve([]),
      ]);
      renderClientPortal(project, { portal, orchestration, tasks });
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
