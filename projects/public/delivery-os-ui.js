/* Product Delivery OS UI — shell, cards, drawer, agents, reviews */
(function () {
  const MODULE_NAV = [
    { id: '', label: 'Todos os módulos', title: 'Ver requisitos e artefactos de Frontend, Backend e Database' },
    { id: 'CustomerNeed', label: 'Necessidade do cliente', title: 'Requisitos ligados à necessidade de negócio' },
    { id: 'Frontend', label: 'Frontend (ecrãs)', title: 'Aplicação visível ao utilizador' },
    { id: 'Backend', label: 'Backend (serviços)', title: 'APIs, regras de negócio e integrações' },
    { id: 'Database', label: 'Base de dados', title: 'Modelo e persistência de dados' },
    { id: 'API', label: 'API', title: 'Contratos e endpoints entre sistemas' },
    { id: 'Integration', label: 'Integrações', title: 'Ligações a sistemas externos' },
    { id: 'Tests', label: 'Testes', title: 'Casos de teste e validação' },
    { id: 'Operations', label: 'Operação', title: 'Monitorização e produção' },
  ];

  const FALLBACK_CONCEPTS = {
    capability: { title: 'Funcionalidade do produto', short: 'Bloco de valor que o sistema oferece — ex.: «Comprar plano», «Gerar cupom».', example: '' },
    cluster: { title: 'Grupo de requisitos', short: 'Requisitos relacionados dentro de uma funcionalidade.', example: '' },
    requirement: { title: 'Requisito', short: 'O que o sistema deve fazer ou como deve ser construído.', example: '' },
    architecturePack: { title: 'Pacote de arquitectura', short: 'Componentes, dados, APIs e riscos para um módulo técnico.', example: '' },
    module: { title: 'Módulo técnico', short: 'Frontend, Backend ou Base de dados — onde se implementa.', example: '' },
    humanReview: { title: 'Revisão humana', short: 'Aprovação antes de aplicar alterações propostas pela IA.', example: '' },
    artifact: { title: 'Artefacto', short: 'Documento ou resultado de uma fase.', example: '' },
    traceLink: { title: 'Ligação de rastreabilidade', short: 'Relação entre peças do projecto.', example: '' },
    snapshot: { title: 'Snapshot', short: 'Cópia do projecto num momento.', example: '' },
    stage: { title: 'Fase de entrega', short: 'Etapa do processo de entrega.', example: '' },
    promptRun: { title: 'Execução de agente', short: 'Prompt + resposta da IA, submetidos para revisão.', example: '' },
  };

  function getPlatformConcepts() {
    return window.state?.config?.platformConcepts || FALLBACK_CONCEPTS;
  }

  function getStageConceptKeys(stageId) {
    return window.state?.config?.stageConceptKeys?.[stageId]
      || { requirements: ['capability', 'cluster', 'requirement'], architecture: ['architecturePack', 'module'] }[stageId]
      || [];
  }

  function renderStageConceptBanner() {
    const el = $('pdosConceptBanner');
    if (el) el.innerHTML = '';
  }

  function renderPlatformGlossary() {
    /* Conteúdo movido para HelpUI (drawer global) */
  }

  const pdosState = {
    moduleFilter: '',
    drawerOpen: false,
    drawerLevel: 1,
    selectedCapabilityId: '',
    selectedClusterId: '',
    pendingPromptRun: null,
    activeJob: null,
    activeJobStep: '',
  };

  const AGENT_TYPE_LABELS = {
    requirement_grouping: 'Agrupar requisitos',
  };
  function agentTypeLabel(agentType) {
    return AGENT_TYPE_LABELS[agentType] || agentType;
  }
  // Agentes que suportam divisao em lotes no cliente (espelha BATCHABLE_AGENTS).
  const BATCHABLE_AGENT_TYPES = ['requirement_grouping'];
  const AGENT_JOB_THRESHOLD = 25;

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function $(id) { return document.getElementById(id); }

  function reqMatchesModule(req, mod) {
    if (!mod) return true;
    const tags = Array.isArray(req.moduleTags) ? req.moduleTags : [];
    if (tags.includes(mod)) return true;
    return String(req.module || '') === mod;
  }

  function countByStatus(requirements, ids) {
    const set = new Set(ids || []);
    const subset = ids ? requirements.filter((r) => set.has(r.id)) : requirements;
    const approved = subset.filter((r) => ['approved', 'planned', 'in_development', 'validated', 'delivered'].includes(r.status)).length;
    return { total: subset.length, approved, pending: subset.length - approved };
  }

  const STAGE_STATUS_LABEL = {
    not_started: 'Por iniciar',
    in_progress: 'Em curso',
    pending_review: 'Revisão',
    approved: 'Aprovado',
    blocked: 'Bloqueado',
    done: 'Concluído',
  };

  function getStageOrder() {
    return window.state?.config?.stageOrder || [
      'idea', 'discovery', 'requirements', 'architecture', 'roadmap',
      'implementation', 'validation', 'delivery', 'operations',
    ];
  }

  function getStages(project) {
    const flow = window.state?.config?.deliveryStageFlow || [];
    const fromProject = Array.isArray(project?.stages) ? project.stages : [];
    const byId = new Map(fromProject.map((s) => [s.id, s]));
    return getStageOrder().map((id) => {
      const base = flow.find((s) => s.id === id) || { id, label: id };
      const current = byId.get(id) || {};
      return {
        id,
        label: current.label || base.label || id,
        status: current.status || 'not_started',
        requiresHumanApproval: current.requiresHumanApproval === true,
      };
    });
  }

  function resolveProcessStageId(project, stages) {
    const inProgress = stages.find((s) => s.status === 'in_progress');
    if (inProgress) return inProgress.id;
    if (window.state?.deliverySelectedStageId) return window.state.deliverySelectedStageId;
    const pendingReview = stages.find((s) => s.status === 'pending_review');
    if (pendingReview) return pendingReview.id;
    const notDone = stages.find((s) => !['done', 'approved'].includes(s.status));
    return notDone?.id || stages[0]?.id || 'idea';
  }

  function projectDescription(project) {
    return String(
      project.description
      || project.summary?.scopeInPlainLanguage
      || project.summary?.businessContext
      || project.summary?.solutionOverview
      || ''
    ).trim();
  }

  function renderProjectHeader(project) {
    const el = $('pdosProjectHeader');
    if (!el || !project) return;
    const desc = projectDescription(project);
    const goals = (project.summary?.goals || []).slice(0, 2);
    el.innerHTML = `
      <div class="pdos-header-grid pdos-header-compact">
        <div class="pdos-header-main">
          <p class="pdos-header-eyebrow">${escapeHtml(project.clientName || 'Cliente')}</p>
          <h2>${escapeHtml(project.name)}</h2>
        </div>
        <div class="pdos-header-side">
          <div class="pdos-header-meta">
            <span class="chip">${escapeHtml(project.status || 'active')}</span>
            <span class="chip accent">${escapeHtml(project.deliveryLevel || 'standard')}</span>
          </div>
          <div class="pdos-header-actions" role="group" aria-label="Acções do projecto">
            <button class="btn pdos-header-btn" id="pdosRelinkBtn" type="button" title="Reaplica ligações entre fases e gera log para revisão">Reaplicar ligações</button>
            <button class="btn primary pdos-header-btn" id="pdosGenProposalBtn" type="button" title="Gera proposta comercial a partir do projecto actual">Gerar proposta</button>
          </div>
        </div>
      </div>
    `;
    $('pdosRelinkBtn')?.addEventListener('click', () => relinkPhases());
    $('pdosGenProposalBtn')?.addEventListener('click', () => generateCommercialProposal());
  }

  function stageStatusClass(status) {
    return String(status || 'not_started').replace(/[^a-z_]/g, '');
  }

  function renderGoldenTimeline(project) {
    const el = $('pdosGoldenTimeline');
    if (!el || !project) return;

    const stages = getStages(project);
    const processStageId = resolveProcessStageId(project, stages);
    if (!window.state.deliverySelectedStageId) {
      window.state.deliverySelectedStageId = processStageId;
    }

    const nodes = collectDeliveryFeedNodes(project);
    const parts = [];

    stages.forEach((stage, index) => {
      const count = nodes.filter((n) => n.stageId === stage.id).length;
      const isSelected = stage.id === window.state.deliverySelectedStageId;
      const isProcess = stage.id === processStageId;
      const status = stageStatusClass(stage.status);

      parts.push(`
        <button type="button"
          class="golden-stage-node ${isSelected ? 'is-selected' : ''} ${isProcess ? 'is-process' : ''} status-${status}"
          data-delivery-stage="${escapeHtml(stage.id)}"
          title="${escapeHtml(STAGE_STATUS_LABEL[stage.status] || stage.status)}">
          <span class="golden-stage-label">${escapeHtml(stage.label)}</span>
          <span class="golden-stage-status">${escapeHtml(STAGE_STATUS_LABEL[stage.status] || stage.status)}</span>
          <span class="golden-stage-count">${count}</span>
          ${stage.requiresHumanApproval && stage.status !== 'approved' ? '<span class="golden-stage-gate" title="Gate de aprovação">⏸</span>' : ''}
        </button>
      `);

      if (index < stages.length - 1) {
        const next = stages[index + 1];
        parts.push(`
          <button type="button" class="golden-connector"
            data-from-stage="${escapeHtml(stage.id)}"
            data-to-stage="${escapeHtml(next.id)}"
            title="Transição ${escapeHtml(stage.label)} ↔ ${escapeHtml(next.label)} — agente de apoio à mudança de fase">
            <span class="golden-connector-line"></span>
            <span class="golden-connector-icon">⟷</span>
          </button>
        `);
      }
    });

    el.innerHTML = `<div class="golden-timeline-track">${parts.join('')}</div>`;

    const badge = $('pdosCurrentStageBadge');
    if (badge) {
      const current = stages.find((s) => s.id === processStageId) || stages[0];
      badge.innerHTML = `
        <span class="pdos-badge-label">Estágio actual</span>
        <strong>${escapeHtml(current?.label || processStageId)}</strong>
        <small>${escapeHtml(STAGE_STATUS_LABEL[current?.status] || '')}</small>
      `;
    }

    el.querySelectorAll('[data-delivery-stage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.state.deliverySelectedStageId = btn.dataset.deliveryStage;
        renderGoldenTimeline(project);
        renderStageGuidance(project);
        renderCurrentFocus(project);
        renderStageConceptBanner();
        renderHumanReviewsSection(project);
        renderCardFeed(project);
        renderTracePanel(project);
        window.DiagramsUI?.renderShell?.(project);
        window.renderPhaseContextBar?.();
      });
    });

    el.querySelectorAll('.golden-connector').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTransitionPicker(btn.dataset.fromStage, btn.dataset.toStage, project);
      });
    });

    el.querySelectorAll('.golden-stage-gate').forEach((gate) => {
      gate.addEventListener('click', async (e) => {
        e.stopPropagation();
        const node = gate.closest('[data-delivery-stage]');
        if (!node || !project?.id) return;
        try {
          await apiRequest(`/projects/${project.id}/stages/${node.dataset.deliveryStage}/approve`, { method: 'POST', body: {} });
          showToast('Stage aprovado');
          await reloadProject(project.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  function renderStageGuidance(project) {
    // Navigation is handled by the golden timeline only — no bottom guidance bar.
    const el = $('pdosStageGuidance');
    if (el) el.innerHTML = '';
  }

  function renderCurrentFocus(project) {
    // Pending reviews are shown in the dedicated human-review panel.
    const el = $('pdosCurrentFocus');
    if (el) el.innerHTML = '';
  }

  function agentFriendlyLabel(agentType) {
    const map = {
      reverse_idea: 'Visão da ideia',
      discovery_research: 'Descoberta',
      roadmap_plan: 'Roadmap',
      implementation_stack: 'Stack técnica',
      implementation_tasks: 'Tarefas',
      commercial_proposal: 'Proposta comercial',
      requirement_grouping: 'Agrupamento',
      diagram_to_requirements: 'Diagrama → Requisitos',
      requirements_to_architecture: 'Arquitectura',
      capability_requirements: 'Requisitos',
      stage_transition: 'Transição de fase',
      meeting_classification: 'Classificação de ata',
    };
    return map[agentType] || agentType || 'Agente IA';
  }

  function renderHumanReviewsSection(project) {
    const el = $('pdosHumanReviews');
    if (!el) return;
    const pending = (project.humanReviews || []).filter((r) => r.status === 'pending');
    if (!pending.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <section class="pdos-reviews-panel" aria-label="Revisões humanas">
        <header class="pdos-reviews-head">
          <div>
            <span class="pdos-section-label">Revisão humana</span>
            <p class="pdos-reviews-sub">Confirme ou rejeite as alterações propostas pela IA antes de aplicar ao projecto.</p>
          </div>
          <span class="pdos-reviews-count">${pending.length} pendente(s)</span>
        </header>
        <div class="pdos-reviews-grid">
          ${pending.map((r) => {
            const promptRun = (project.promptRuns || []).find((pr) => pr.id === r.promptRunId || pr.id === r.sourceId);
            const agent = promptRun ? agentFriendlyLabel(promptRun.agentType) : '';
            const changes = r.decisionsCount || r.suggestedChanges?.sections?.length || 0;
            return `
              <article class="hr-card">
                <div class="hr-card-top">
                  <span class="hr-card-status">Aguarda decisão</span>
                  <span class="hr-card-meta-line">${r.readingTimeMinutes || 5} min · ${changes} alteração(ões)</span>
                </div>
                <h4 class="hr-card-title">${escapeHtml(r.title || 'Revisão pendente')}</h4>
                <p class="hr-card-summary">${escapeHtml(shortText(r.summaryMarkdown || '', 160))}</p>
                ${agent ? `<span class="hr-card-agent">${escapeHtml(agent)}</span>` : ''}
                <div class="hr-card-actions">
                  <button type="button" class="btn tiny primary" data-view-review="${escapeHtml(r.id)}">Abrir revisão</button>
                  <button type="button" class="btn tiny" data-approve-review="${escapeHtml(r.id)}">Aprovar</button>
                </div>
              </article>`;
          }).join('')}
        </div>
      </section>`;

    el.querySelectorAll('[data-view-review]').forEach((btn) => {
      btn.addEventListener('click', () => openReviewDrawer(project, btn.dataset.viewReview));
    });
    el.querySelectorAll('[data-approve-review]').forEach((btn) => {
      btn.addEventListener('click', () => resolveReview(btn.dataset.approveReview, 'approved'));
    });
  }

  function openTransitionPicker(fromStageId, toStageId, project) {
    const modal = $('pdosTransitionModal');
    if (!modal) return;
    const stages = getStages(project);
    const from = stages.find((s) => s.id === fromStageId);
    const to = stages.find((s) => s.id === toStageId);
    $('pdosTransitionTitle').textContent = `${from?.label || fromStageId} ↔ ${to?.label || toStageId}`;
    $('pdosTransitionDesc').textContent = 'Escolhe se queres avançar para a fase seguinte ou retroceder para regenerar artefactos da fase anterior.';
    $('pdosTransitionActions').innerHTML = `
      <button type="button" class="btn primary pdos-transition-btn" data-dir="forward">
        Avançar → ${escapeHtml(to?.label || toStageId)}
        <small>Gerar artefactos para a fase seguinte</small>
      </button>
      <button type="button" class="btn ghost pdos-transition-btn" data-dir="backward">
        ← Retroceder ${escapeHtml(from?.label || fromStageId)}
        <small>Regenerar com base na fase seguinte</small>
      </button>
    `;
    modal.classList.remove('hidden');
    modal.querySelectorAll('.pdos-transition-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const direction = btn.dataset.dir;
        if (direction === 'forward') {
          runStageTransition(fromStageId, toStageId, 'forward', project);
        } else {
          runStageTransition(toStageId, fromStageId, 'backward', project);
        }
        closeTransitionModal();
      });
    });
  }

  function closeTransitionModal() {
    $('pdosTransitionModal')?.classList.add('hidden');
  }

  async function runStageTransition(fromStageId, toStageId, direction, project) {
    if (direction === 'forward' && fromStageId === 'requirements' && toStageId === 'architecture') {
      closeTransitionModal();
      return runArchitecturePackGeneration(project);
    }
    try {
      const res = await apiRequest(`/projects/${project.id}/prompt-runs`, {
        method: 'POST',
        body: {
          agentType: 'stage_transition',
          fromStageId,
          toStageId,
          direction,
          stageId: toStageId,
        },
      });
      pdosState.pendingPromptRun = res.promptRun;
      openPromptWorkbench(res);
      showToast(`Agente de transição ${direction === 'forward' ? '→' : '←'} ${toStageId}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function formatRequirementLinks(ids) {
    const list = ensureArray(ids).filter(Boolean);
    if (!list.length) return '';
    return list.map((id) =>
      `<button type="button" class="req-link-chip" data-goto-requirement="${escapeHtml(id)}">${escapeHtml(id)}</button>`
    ).join(' ');
  }

  function renderModuleNav() {
    const el = $('pdosModuleNav');
    if (!el) return;
    el.innerHTML = MODULE_NAV.map((m) => `
      <button type="button" class="pdos-module-pill ${pdosState.moduleFilter === m.id ? 'active' : ''}" data-module="${escapeHtml(m.id)}" title="${escapeHtml(m.title || m.label)}">${escapeHtml(m.label)}</button>
    `).join('');
    el.querySelectorAll('[data-module]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pdosState.moduleFilter = btn.dataset.module || '';
        renderModuleNav();
        if (window.state?.selectedProject) {
          renderCardFeed(window.state.selectedProject);
          renderTracePanel(window.state.selectedProject);
        }
      });
    });
  }

  function normalizeJsonInput(raw) {
    return String(raw || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')
      .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'")
      .trim();
  }

  function openArtifactDrawer(project, artifactId) {
    const art = (project.artifacts || []).find((a) => a.id === artifactId);
    const drawer = $('pdosDetailDrawer');
    const content = $('pdosDrawerContent');
    if (!drawer || !content || !art) return;
    drawer.classList.remove('hidden');
    content.innerHTML = `
      <div class="pdos-drawer-head">
        <h3>${escapeHtml(art.name)}</h3>
        <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
      </div>
      <p class="muted-text">${escapeHtml(art.type)} · ${escapeHtml(art.stageId || '')}</p>
      ${formatRequirementLinks(art.relatedRequirementIds || art.metadata?.requirementIds) ? `<div class="arch-req-links drawer-req-links"><span class="muted-text">Requisitos:</span> ${formatRequirementLinks(art.relatedRequirementIds || art.metadata?.requirementIds)}</div>` : ''}
      <div id="pdosArtifactBody" class="markdown-preview"></div>
    `;
    content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
    renderMarkdownPreview(art.bodyMarkdown || art.description || '', $('pdosArtifactBody'));
  }

  function renderPhaseStatTile({ tab, label, count, stageId, hint, view, scrollTarget }) {
    const empty = !count;
    if (scrollTarget) {
      return `
        <button type="button"
          class="pdos-stat-tile${empty ? ' is-empty' : ''}"
          data-scroll-target="${escapeHtml(scrollTarget)}"
          ${empty ? 'disabled' : ''}
          title="${escapeHtml(hint || `Ver ${label}`)}">
          <span class="pdos-stat-tile-count">${count}</span>
          <span class="pdos-stat-tile-label">${escapeHtml(label)}</span>
        </button>
      `;
    }
    return `
      <button type="button"
        class="pdos-stat-tile${empty ? ' is-empty' : ''}"
        data-nav-tab="${escapeHtml(tab)}"
        data-nav-stage="${escapeHtml(stageId)}"
        ${view ? `data-nav-view="${escapeHtml(view)}"` : ''}
        ${empty ? 'disabled' : ''}
        title="${escapeHtml(hint || `Ver ${label} desta fase`)}">
        <span class="pdos-stat-tile-count">${count}</span>
        <span class="pdos-stat-tile-label">${escapeHtml(label)}</span>
      </button>
    `;
  }

  function stageOptionsHtml(project, currentStageId) {
    return getStages(project)
      .map((s) => `<option value="${escapeHtml(s.id)}"${s.id === currentStageId ? ' selected' : ''}>${escapeHtml(s.label)}</option>`)
      .join('');
  }

  function renderPhaseItemRow({ id, kind, title, meta, currentStageId, project, canMove }) {
    return `
      <div class="pdos-phase-item" data-phase-item-kind="${escapeHtml(kind)}" data-phase-item-id="${escapeHtml(id)}">
        <div class="pdos-phase-item-main">
          <strong>${escapeHtml(title)}</strong>
          ${meta ? `<small class="muted-text">${escapeHtml(meta)}</small>` : ''}
        </div>
        <div class="pdos-phase-item-actions">
          <button type="button" class="btn tiny ghost" data-open-phase-item="${escapeHtml(id)}" data-open-phase-kind="${escapeHtml(kind)}">Abrir</button>
          ${canMove ? `<label class="pdos-phase-move"><span class="muted-text">Fase</span>
            <select data-move-phase-item="${escapeHtml(id)}" data-move-phase-kind="${escapeHtml(kind)}">${stageOptionsHtml(project, currentStageId)}</select>
          </label>` : ''}
        </div>
      </div>
    `;
  }

  function renderPhaseContentBlock(project, stageId) {
    const summary = window.PhaseContent?.getStageContentSummary(project, stageId);
    if (!summary) return '';
    const { counts, items } = summary;

    const tiles = [
      { tab: 'requisitos', label: 'Requisitos', count: counts.requirements },
      { tab: 'documentos', label: 'Anexos', count: counts.documents, view: 'uploads' },
      { tab: 'perguntas', label: 'Clarificações', count: counts.questions },
    ];

    const sections = [];

    const docRows = (items.documents || []).map((d) => renderPhaseItemRow({
      id: d.id,
      kind: 'document',
      title: d.title || d.originalName || 'Documento',
      meta: [d.docType, (d.updatedAt || d.uploadedAt || '').slice(0, 10)].filter(Boolean).join(' · '),
      currentStageId: window.PhaseContent.resolveDocumentStageId(d),
      project,
      canMove: true,
    })).join('');
    sections.push({ label: 'Documentos', count: (items.documents || []).length, body: docRows, addTab: 'documentos' });

    const qRows = (items.questions || []).map((q) => renderPhaseItemRow({
      id: q.id,
      kind: 'question',
      title: q.question || q.title || 'Pergunta',
      meta: q.status || '',
      currentStageId: stageId,
      project,
      canMove: false,
    })).join('');
    sections.push({ label: 'Perguntas', count: (items.questions || []).length, body: qRows, addTab: 'perguntas' });

    const sectionsHtml = sections.map((sec) => `
      <details class="pdos-phase-section"${sec.count ? ' open' : ''}>
        <summary>${escapeHtml(sec.label)} <span class="pdos-phase-count">${sec.count}</span></summary>
        <div class="pdos-phase-section-body">
          ${sec.body || '<p class="muted-text pdos-phase-empty">Sem itens nesta fase.</p>'}
          <button type="button" class="btn tiny ghost pdos-phase-add" data-phase-add-tab="${escapeHtml(sec.addTab)}">Gerir ${escapeHtml(sec.label.toLowerCase())} desta fase →</button>
        </div>
      </details>
    `).join('');

    return `
      <article class="pdos-card pdos-phase-content-card">
        <span class="pdos-section-label">Conteúdo desta fase</span>
        <div class="pdos-stat-tiles">
          ${tiles.map((t) => renderPhaseStatTile({ ...t, stageId })).join('')}
        </div>
        ${sectionsHtml ? `<div class="pdos-phase-sections">${sectionsHtml}</div>` : ''}
      </article>
    `;
  }

  function renderCardFeed(project) {
    const el = $('pdosCardFeed');
    if (!el || !project) return;
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    const caps = project.capabilities || [];
    const openQuestions = (project.clarificationQuestions || []).filter((q) => ['open', 'sent', 'blocked'].includes(q.status));
    const risks = (project.risks || []);

    let html = renderPhaseContentBlock(project, stageId);

    if (stageId === 'requirements') {
      html += `
        <article class="pdos-card pdos-card-summary">
          <h4>Organização</h4>
          <div class="pdos-summary-grid pdos-summary-grid-static">
            <div><strong>${caps.length}</strong><span>funcionalidades</span></div>
            <div><strong>${(project.requirementClusters || []).length}</strong><span>grupos</span></div>
            <div><strong>${openQuestions.length}</strong><span>dúvidas abertas</span></div>
            <div><strong>${risks.length}</strong><span>riscos</span></div>
          </div>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" data-agent="requirement_grouping" title="Agrupa requisitos soltos em funcionalidades e grupos">Agrupar com IA</button>
            <button type="button" class="btn tiny" data-agent="reverse_idea">Resumo da ideia</button>
            <button type="button" class="btn tiny" data-unlinked-reqs>Sem funcionalidade</button>
          </div>
        </article>
      `;

      html += renderAgentJobsHtml(project);

      if (caps.length) {
        caps.forEach((cap) => {
          const stats = countByStatus(project.requirements, cap.requirementIds);
          const capReqs = (cap.requirementIds || []).map((id) => project.requirements.find((r) => r.id === id)).filter(Boolean);
          const modules = [...new Set(capReqs.flatMap((r) => r.moduleTags || [r.module]).filter(Boolean))];
          html += `
            <article class="pdos-card pdos-card-capability" data-capability-id="${escapeHtml(cap.id)}">
              <div class="pdos-card-top"><span class="delivery-card-kind">Funcionalidade</span><span>${stats.total} requisitos</span></div>
              <h4>${escapeHtml(cap.name)}</h4>
              <p class="pdos-card-summary-text">${escapeHtml(shortText(cap.summaryMarkdown || '', 160))}</p>
              <div class="pdos-module-badges">${modules.map((m) => `<span class="module-badge">${escapeHtml(m)}</span>`).join('')}</div>
              <div class="pdos-card-meta">${stats.approved} aprovados · ${stats.pending} pendentes · ${(cap.risks || []).length} riscos</div>
              <div class="pdos-card-actions">
                <button type="button" class="btn tiny primary" data-open-capability="${escapeHtml(cap.id)}">Ver grupos e requisitos</button>
                <button type="button" class="btn tiny" data-impact-cap="${escapeHtml(cap.id)}">Ver impacto</button>
              </div>
            </article>
          `;
        });
      } else {
        html += `<article class="pdos-card pdos-card-empty"><p>Sem funcionalidades — <strong>Agrupar com IA</strong>.</p></article>`;
      }
    } else if (stageId === 'idea') {
      html += renderIdeaStage(project);
    } else if (stageId === 'discovery') {
      html += renderDiscoveryStage(project);
    } else if (stageId === 'roadmap') {
      html += renderRoadmapStage(project);
    } else if (stageId === 'implementation') {
      html += renderImplementationStage(project);
    } else if (stageId === 'delivery') {
      html += renderProposalStage(project);
    }

    if (risks.length && stageId === 'requirements') {
      html += `
        <article class="pdos-card pdos-card-risks">
          <h4>Riscos principais</h4>
          <ul>${risks.slice(0, 5).map((r) => `<li>${escapeHtml(typeof r === 'string' ? r : r.description || r.title || '')}</li>`).join('')}</ul>
        </article>
      `;
    }

    el.innerHTML = html;

    if (stageId === 'idea') {
      hydrateIdeaStage(project);
    } else if (stageId === 'discovery') {
      hydrateDiscoveryStage(project);
    } else if (stageId === 'roadmap') {
      hydrateRoadmapStage(project);
    } else if (stageId === 'implementation') {
      hydrateImplementationStage(project);
    } else if (stageId === 'delivery') {
      hydrateProposalStage(project);
    }

    wireCardFeedEvents(project);
    renderMermaidInFeed();
  }

  function ideaVision(project) {
    const v = project.vision && typeof project.vision === 'object' ? project.vision : {};
    return {
      headline: v.headline || '',
      mainIdeaMarkdown: v.mainIdeaMarkdown || project.ideaBriefMarkdown || '',
      philosophyMarkdown: v.philosophyMarkdown || '',
      problemMarkdown: v.problemMarkdown || '',
      targetUsers: Array.isArray(v.targetUsers) ? v.targetUsers : [],
      valuePropositionMarkdown: v.valuePropositionMarkdown || '',
      principles: Array.isArray(v.principles) ? v.principles : [],
      consequentIdeas: Array.isArray(v.consequentIdeas) ? v.consequentIdeas : [],
    };
  }

  function ideaHasContent(v) {
    return Boolean(
      v.headline || v.mainIdeaMarkdown || v.philosophyMarkdown || v.problemMarkdown
      || v.valuePropositionMarkdown || v.targetUsers.length || v.principles.length || v.consequentIdeas.length
    );
  }

  function renderIdeaStage(project) {
    const v = ideaVision(project);
    const genLabel = ideaHasContent(v) ? 'Regenerar visão com IA' : 'Gerar visão com IA';

    if (!ideaHasContent(v)) {
      return `
        <article class="pdos-card idea-empty">
          <h4>A visão da ideia ainda não foi escrita</h4>
          <p class="muted-text">Gere uma narrativa clara da ideia principal, a sua filosofia e as ideias que dela nascem — a partir dos requisitos e contexto do projecto.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="reverse_idea">${genLabel}</button>
          </div>
        </article>
      `;
    }

    const usersChips = v.targetUsers.length
      ? `<div class="idea-users">${v.targetUsers.map((u) => `<span class="idea-user-chip">${escapeHtml(u)}</span>`).join('')}</div>`
      : '';

    const principles = v.principles.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Filosofia &amp; princípios</h4>
          <div class="idea-principles">
            ${v.principles.map((p, i) => `
              <div class="idea-principle">
                <span class="idea-principle-index">${i + 1}</span>
                <div>
                  <strong>${escapeHtml(p.title || '')}</strong>
                  <div class="idea-md" data-idea-md="principle-${i}"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </section>`
      : '';

    const consequent = v.consequentIdeas.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Ideias consequentes</h4>
          <div class="idea-consequent-grid">
            ${v.consequentIdeas.map((c, i) => `
              <article class="idea-consequent-card">
                <h5>${escapeHtml(c.title || '')}</h5>
                <div class="idea-md" data-idea-md="consequent-${i}"></div>
              </article>
            `).join('')}
          </div>
        </section>`
      : '';

    return `
      <article class="pdos-card idea-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">A IDEIA</span>
          ${v.headline ? `<h2 class="idea-headline">${escapeHtml(v.headline)}</h2>` : ''}
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny" data-agent="reverse_idea">${genLabel}</button>
          </div>
        </header>

        <div class="idea-md idea-main" data-idea-md="main"></div>

        ${v.philosophyMarkdown ? `
          <section class="idea-block idea-philosophy">
            <h4 class="idea-block-title">Cultura &amp; filosofia</h4>
            <div class="idea-md" data-idea-md="philosophy"></div>
          </section>` : ''}

        ${(v.problemMarkdown || v.valuePropositionMarkdown || usersChips) ? `
          <section class="idea-block idea-why">
            ${v.problemMarkdown ? `<div class="idea-why-col"><h4 class="idea-block-title">O problema</h4><div class="idea-md" data-idea-md="problem"></div></div>` : ''}
            ${v.valuePropositionMarkdown ? `<div class="idea-why-col"><h4 class="idea-block-title">Porque importa</h4><div class="idea-md" data-idea-md="value"></div></div>` : ''}
            ${usersChips ? `<div class="idea-why-col"><h4 class="idea-block-title">Para quem</h4>${usersChips}</div>` : ''}
          </section>` : ''}

        ${principles}
        ${consequent}
      </article>
    `;
  }

  function hydrateIdeaStage(project) {
    const v = ideaVision(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-idea-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('main', v.mainIdeaMarkdown);
    fill('philosophy', v.philosophyMarkdown);
    fill('problem', v.problemMarkdown);
    fill('value', v.valuePropositionMarkdown);
    v.principles.forEach((p, i) => fill(`principle-${i}`, p.descriptionMarkdown));
    v.consequentIdeas.forEach((c, i) => fill(`consequent-${i}`, c.descriptionMarkdown));
  }

  function discoveryData(project) {
    const d = project.discovery && typeof project.discovery === 'object' ? project.discovery : {};
    return {
      marketSummaryMarkdown: d.marketSummaryMarkdown || '',
      marketSizing: d.marketSizing || { tam: '', sam: '', som: '', notesMarkdown: '' },
      segments: Array.isArray(d.segments) ? d.segments : [],
      competitors: Array.isArray(d.competitors) ? d.competitors : [],
      businessModel: d.businessModel || { revenueStreams: [], costStructure: [], channels: [], keyPartners: [] },
      commercialImpact: d.commercialImpact || { objectivesMarkdown: '', kpis: [] },
      swot: d.swot || { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      goToMarketMarkdown: d.goToMarketMarkdown || '',
      assumptions: Array.isArray(d.assumptions) ? d.assumptions : [],
    };
  }

  function discoveryHasContent(d) {
    const bm = d.businessModel;
    const sw = d.swot;
    return Boolean(
      d.marketSummaryMarkdown || d.marketSizing.tam || d.marketSizing.sam || d.marketSizing.som
      || d.segments.length || d.competitors.length || d.commercialImpact.objectivesMarkdown
      || d.commercialImpact.kpis.length || d.goToMarketMarkdown || d.assumptions.length
      || bm.revenueStreams.length || bm.costStructure.length || bm.channels.length || bm.keyPartners.length
      || sw.strengths.length || sw.weaknesses.length || sw.opportunities.length || sw.threats.length
    );
  }

  function renderDiscoveryStage(project) {
    const d = discoveryData(project);
    const genLabel = discoveryHasContent(d) ? 'Regenerar descoberta com IA' : 'Gerar descoberta com IA';

    if (!discoveryHasContent(d)) {
      return `
        <article class="pdos-card idea-empty">
          <h4>A descoberta de mercado ainda não foi feita</h4>
          <p class="muted-text">Gere uma análise estruturada — dimensão de mercado (TAM/SAM/SOM), segmentos, concorrência, modelo de negócio, impacto comercial e SWOT — a partir da ideia.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="discovery_research">${genLabel}</button>
          </div>
        </article>
      `;
    }

    const sizing = d.marketSizing;
    const sizingTiles = (sizing.tam || sizing.sam || sizing.som)
      ? `<div class="disc-sizing">
          <div class="disc-sizing-tile"><span>TAM</span><strong>${escapeHtml(sizing.tam || '—')}</strong><small>Mercado total</small></div>
          <div class="disc-sizing-tile"><span>SAM</span><strong>${escapeHtml(sizing.sam || '—')}</strong><small>Mercado acessível</small></div>
          <div class="disc-sizing-tile"><span>SOM</span><strong>${escapeHtml(sizing.som || '—')}</strong><small>Mercado obtível</small></div>
        </div>
        ${sizing.notesMarkdown ? `<div class="idea-md" data-disc-md="sizing-notes"></div>` : ''}`
      : '';

    const segments = d.segments.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Segmentos-alvo</h4>
          <div class="disc-grid">
            ${d.segments.map((s, i) => `
              <article class="disc-card">
                <h5>${escapeHtml(s.name || '')}</h5>
                <div class="idea-md" data-disc-md="segment-${i}"></div>
                ${(s.painPoints || []).length ? `<ul class="disc-pains">${s.painPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
              </article>
            `).join('')}
          </div>
        </section>`
      : '';

    const competitors = d.competitors.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Concorrência &amp; diferenciação</h4>
          <div class="disc-grid">
            ${d.competitors.map((c, i) => `
              <article class="disc-card">
                <h5>${escapeHtml(c.name || '')}</h5>
                <div class="idea-md" data-disc-md="competitor-${i}"></div>
                ${c.differentiation ? `<p class="disc-edge"><strong>A nossa vantagem:</strong> ${escapeHtml(c.differentiation)}</p>` : ''}
              </article>
            `).join('')}
          </div>
        </section>`
      : '';

    const bm = d.businessModel;
    const bmCol = (title, items) => items.length
      ? `<div class="disc-bm-col"><h5>${escapeHtml(title)}</h5><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`
      : '';
    const businessModel = (bm.revenueStreams.length || bm.costStructure.length || bm.channels.length || bm.keyPartners.length)
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Modelo de negócio</h4>
          <div class="disc-bm">
            ${bmCol('Receitas', bm.revenueStreams)}
            ${bmCol('Custos', bm.costStructure)}
            ${bmCol('Canais', bm.channels)}
            ${bmCol('Parceiros-chave', bm.keyPartners)}
          </div>
        </section>`
      : '';

    const kpis = d.commercialImpact.kpis;
    const impact = (d.commercialImpact.objectivesMarkdown || kpis.length)
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Impacto comercial desejado</h4>
          ${d.commercialImpact.objectivesMarkdown ? `<div class="idea-md" data-disc-md="impact-obj"></div>` : ''}
          ${kpis.length ? `<div class="disc-kpis">${kpis.map((k) => `
            <div class="disc-kpi">
              <strong>${escapeHtml(k.name || '')}</strong>
              ${k.target ? `<span class="disc-kpi-target">${escapeHtml(k.target)}</span>` : ''}
              ${k.rationale ? `<small>${escapeHtml(k.rationale)}</small>` : ''}
            </div>`).join('')}</div>` : ''}
        </section>`
      : '';

    const sw = d.swot;
    const swotQuad = (title, items, cls) => `
      <div class="disc-swot-quad ${cls}">
        <h5>${escapeHtml(title)}</h5>
        ${items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="muted-text">—</p>'}
      </div>`;
    const swot = (sw.strengths.length || sw.weaknesses.length || sw.opportunities.length || sw.threats.length)
      ? `<section class="idea-block">
          <h4 class="idea-block-title">SWOT</h4>
          <div class="disc-swot">
            ${swotQuad('Forças', sw.strengths, 'is-pos')}
            ${swotQuad('Fraquezas', sw.weaknesses, 'is-neg')}
            ${swotQuad('Oportunidades', sw.opportunities, 'is-pos')}
            ${swotQuad('Ameaças', sw.threats, 'is-neg')}
          </div>
        </section>`
      : '';

    const gtm = d.goToMarketMarkdown
      ? `<section class="idea-block"><h4 class="idea-block-title">Go-to-market</h4><div class="idea-md" data-disc-md="gtm"></div></section>`
      : '';

    const assumptions = d.assumptions.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Hipóteses a validar</h4>
          <ul class="disc-assumptions">${d.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
        </section>`
      : '';

    return `
      <article class="pdos-card idea-canvas discovery-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">DESCOBERTA</span>
          <h2 class="idea-headline">Mercado &amp; negócio</h2>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny" data-agent="discovery_research">${genLabel}</button>
          </div>
        </header>
        <div class="idea-md idea-main" data-disc-md="summary"></div>
        ${sizingTiles ? `<section class="idea-block"><h4 class="idea-block-title">Dimensão de mercado</h4>${sizingTiles}</section>` : ''}
        ${segments}
        ${competitors}
        ${businessModel}
        ${impact}
        ${swot}
        ${gtm}
        ${assumptions}
      </article>
    `;
  }

  function hydrateDiscoveryStage(project) {
    const d = discoveryData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-disc-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('summary', d.marketSummaryMarkdown);
    fill('sizing-notes', d.marketSizing.notesMarkdown);
    fill('impact-obj', d.commercialImpact.objectivesMarkdown);
    fill('gtm', d.goToMarketMarkdown);
    d.segments.forEach((s, i) => fill(`segment-${i}`, s.descriptionMarkdown));
    d.competitors.forEach((c, i) => fill(`competitor-${i}`, c.descriptionMarkdown));
  }

  function roadmapData(project) {
    const r = project.roadmap && typeof project.roadmap === 'object' ? project.roadmap : {};
    return {
      summaryMarkdown: r.summaryMarkdown || '',
      phases: Array.isArray(r.phases) ? r.phases : [],
    };
  }

  function fmtDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function renderRoadmapStage(project) {
    const r = roadmapData(project);
    const genLabel = r.phases.length ? 'Regenerar roadmap com IA' : 'Gerar roadmap com IA';

    if (!r.phases.length) {
      return `
        <article class="pdos-card idea-empty">
          <h4>O roadmap de implementação ainda não foi criado</h4>
          <p class="muted-text">Gere um plano por fases — cada fase com entregável concreto, requisitos ligados, design pattern, testes e datas — a partir dos requisitos e da arquitetura.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="roadmap_plan">${genLabel}</button>
          </div>
        </article>
      `;
    }

    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((req) => { reqMap[req.id] = req; });
    const phaseNameById = {};
    r.phases.forEach((p) => { phaseNameById[p.id] = p.name; });

    const phaseCards = r.phases.map((p, i) => {
      const dates = [fmtDate(p.startDate), fmtDate(p.endDate)].filter(Boolean).join(' → ');
      const reqChips = (p.requirementIds || []).map((id) => {
        const req = reqMap[id];
        const label = req ? (req.title || id) : id;
        return `<button type="button" class="rm-req-chip" data-goto-requirement="${escapeHtml(id)}" title="Ver requisito">${escapeHtml(label)}</button>`;
      }).join('');
      const modules = (p.moduleTags || []).map((m) => `<span class="rm-module">${escapeHtml(m)}</span>`).join('');
      const deps = (p.dependsOn || []).map((id) => phaseNameById[id]).filter(Boolean);
      const milestones = (p.milestones || []).map((m) => `<li>${escapeHtml(m.name)}${m.date ? ` <span class="rm-ms-date">${escapeHtml(fmtDate(m.date))}</span>` : ''}</li>`).join('');
      const tests = (p.tests || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
      const risks = (p.risks || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');

      return `
        <article class="rm-phase">
          <div class="rm-phase-rail"><span class="rm-phase-index">${i + 1}</span></div>
          <div class="rm-phase-body">
            <header class="rm-phase-head">
              <h4>${escapeHtml(p.name || `Fase ${i + 1}`)}</h4>
              ${dates ? `<span class="rm-dates">${escapeHtml(dates)}</span>` : ''}
            </header>
            ${p.designPattern ? `<span class="rm-pattern">Design pattern: ${escapeHtml(p.designPattern)}</span>` : ''}
            <div class="idea-md" data-rm-md="goal-${i}"></div>
            ${p.deliverableMarkdown ? `<div class="rm-deliverable"><span class="rm-label">Entregável</span><div class="idea-md" data-rm-md="deliverable-${i}"></div></div>` : ''}
            ${modules ? `<div class="rm-modules">${modules}</div>` : ''}
            ${reqChips ? `<div class="rm-reqs"><span class="rm-label">Requisitos</span><div class="rm-req-chips">${reqChips}</div></div>` : ''}
            ${tests ? `<div class="rm-sub"><span class="rm-label">Testes</span><ul>${tests}</ul></div>` : ''}
            ${milestones ? `<div class="rm-sub"><span class="rm-label">Milestones</span><ul class="rm-milestones">${milestones}</ul></div>` : ''}
            ${risks ? `<div class="rm-sub"><span class="rm-label">Riscos</span><ul>${risks}</ul></div>` : ''}
            ${deps.length ? `<div class="rm-deps">Depende de: ${deps.map((d) => escapeHtml(d)).join(', ')}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');

    return `
      <article class="pdos-card idea-canvas roadmap-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">ROADMAP</span>
          <h2 class="idea-headline">Plano de implementação</h2>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny" data-agent="roadmap_plan">${genLabel}</button>
          </div>
        </header>
        <div class="idea-md idea-main" data-rm-md="summary"></div>
        <div class="rm-timeline">${phaseCards}</div>
      </article>
    `;
  }

  function hydrateRoadmapStage(project) {
    const r = roadmapData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-rm-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('summary', r.summaryMarkdown);
    r.phases.forEach((p, i) => {
      fill(`goal-${i}`, p.goalMarkdown);
      fill(`deliverable-${i}`, p.deliverableMarkdown);
    });
  }

  // ---- Implementation phase ----------------------------------------------
  const LLM_SIZES = [
    { id: 'small', label: 'LLM pequeno', hint: 'Prompt muito detalhado e exigente' },
    { id: 'medium', label: 'LLM médio', hint: 'Prompt equilibrado' },
    { id: 'large', label: 'LLM grande', hint: 'Prompt conciso (confia no modelo)' },
  ];
  const TASK_STATUSES = [
    { id: 'todo', label: 'A fazer' },
    { id: 'in_progress', label: 'Em curso' },
    { id: 'blocked', label: 'Bloqueada' },
    { id: 'done', label: 'Concluída' },
  ];
  const TASK_STATUS_LABEL = TASK_STATUSES.reduce((acc, s) => { acc[s.id] = s.label; return acc; }, {});
  let implViewMode = 'board';

  function implementationData(project) {
    const impl = project.implementation && typeof project.implementation === 'object' ? project.implementation : {};
    const stack = impl.stack && typeof impl.stack === 'object' ? impl.stack : {};
    return {
      stack: {
        summaryMarkdown: stack.summaryMarkdown || '',
        designPattern: stack.designPattern || '',
        languages: stack.languages || [],
        frameworks: stack.frameworks || [],
        datastores: stack.datastores || [],
        integrations: stack.integrations || [],
        deployment: stack.deployment || '',
        infrastructureMarkdown: stack.infrastructureMarkdown || '',
        resourcesMarkdown: stack.resourcesMarkdown || '',
        modules: Array.isArray(stack.modules) ? stack.modules : [],
        confirmed: Boolean(stack.confirmed),
      },
      tasks: Array.isArray(impl.tasks) ? impl.tasks : [],
    };
  }

  function stackHasContent(s) {
    return Boolean(
      s.summaryMarkdown || s.designPattern || s.deployment || s.modules.length
      || s.languages.length || s.frameworks.length || s.datastores.length || s.integrations.length
    );
  }

  function downloadTextFile(content, filename, mime = 'text/markdown') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    return Promise.resolve();
  }

  // Compose the downloadable agent prompt from a task spec. The LLM size controls
  // verbosity: smaller models get a stricter, more explicit prompt.
  function buildTaskPrompt(task, llmSize, project) {
    const data = implementationData(project);
    const stack = data.stack;
    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((r) => { reqMap[r.id] = r; });
    const reqs = (task.requirementIds || []).map((id) => reqMap[id]).filter(Boolean);
    const phase = (project.roadmap?.phases || []).find((p) => p.id === task.roadmapPhaseId);
    const size = LLM_SIZES.some((s) => s.id === llmSize) ? llmSize : 'medium';

    const L = [];
    L.push(`# Tarefa: ${task.title || 'Implementação'}`);
    L.push('');
    if (size === 'small') {
      L.push('És um agente de desenvolvimento. Segue estas instruções com rigor, passo a passo. Não assumas nada que não esteja especificado — se faltar informação, lista as questões antes de escrever código. Implementa apenas o âmbito desta tarefa e não alteres código não relacionado.');
    } else if (size === 'large') {
      L.push('És um engenheiro de software sénior. Implementa o objetivo abaixo aplicando as melhores práticas e o teu critério técnico.');
    } else {
      L.push('És um agente de desenvolvimento. Implementa a tarefa abaixo respeitando os critérios de aceitação e as convenções do projeto.');
    }
    L.push('');
    L.push('## Objetivo');
    L.push(task.descriptionMarkdown || task.title || '');

    if (project?.name) {
      L.push('');
      L.push('## Contexto do projeto');
      L.push(`Projeto: ${project.name}${project.clientName ? ` (cliente: ${project.clientName})` : ''}.`);
      if (phase) L.push(`Fase do roadmap: ${phase.name}.`);
    }

    if (size !== 'large' && stackHasContent(stack)) {
      L.push('');
      L.push('## Stack técnica');
      if (stack.designPattern) L.push(`- Design pattern: ${stack.designPattern}`);
      if (stack.languages.length) L.push(`- Linguagens: ${stack.languages.join(', ')}`);
      if (stack.frameworks.length) L.push(`- Frameworks: ${stack.frameworks.join(', ')}`);
      if (stack.datastores.length) L.push(`- Dados: ${stack.datastores.join(', ')}`);
      if (stack.integrations.length) L.push(`- Integrações: ${stack.integrations.join(', ')}`);
      if (stack.deployment) L.push(`- Deploy: ${stack.deployment}`);
    } else if (size === 'large' && stack.designPattern) {
      L.push('');
      L.push(`Stack: ${[stack.designPattern, ...stack.languages, ...stack.frameworks].filter(Boolean).join(' · ')}`);
    }

    if ((task.moduleTags || []).length) {
      L.push('');
      L.push(`## Módulos: ${task.moduleTags.join(', ')}`);
    }

    if (reqs.length) {
      L.push('');
      L.push('## Requisitos a satisfazer (rastreabilidade)');
      reqs.forEach((r) => {
        if (size === 'large') {
          L.push(`- [${r.id}] ${r.title}`);
        } else if (size === 'medium') {
          L.push(`- [${r.id}] ${r.title}${r.shall ? ` — ${r.shall}` : ''}`);
        } else {
          L.push(`- [${r.id}] ${r.title}`);
          if (r.shall) L.push(`  - O sistema DEVE: ${r.shall}`);
          if (r.type) L.push(`  - Tipo: ${r.type}`);
        }
      });
    }

    if ((task.subtasks || []).length) {
      L.push('');
      if (size === 'small') {
        L.push('## Passos a seguir (executa por ordem)');
        task.subtasks.forEach((st, i) => {
          L.push(`${i + 1}. ${st.title}${st.descriptionMarkdown ? ` — ${st.descriptionMarkdown}` : ''}`);
        });
      } else {
        L.push('## Passos sugeridos');
        task.subtasks.forEach((st) => L.push(`- ${st.title}`));
      }
    }

    if ((task.acceptanceCriteria || []).length) {
      L.push('');
      L.push('## Critérios de aceitação');
      task.acceptanceCriteria.forEach((c) => L.push(`- [ ] ${c}`));
    }

    if (task.technicalNotesMarkdown) {
      L.push('');
      L.push('## Notas técnicas');
      L.push(task.technicalNotesMarkdown);
    }

    if (size === 'small') {
      L.push('');
      L.push('## Entrega esperada');
      L.push('- Código completo e funcional para o âmbito acima.');
      L.push('- Testes que validam os critérios de aceitação.');
      L.push('- Resumo curto do que foi feito e de decisões tomadas.');
      L.push('- Lista de quaisquer pressupostos ou questões em aberto.');
    }

    return L.join('\n');
  }

  function renderStackChips(label, items) {
    if (!items.length) return '';
    return `<div class="impl-chip-row"><span class="rm-label">${escapeHtml(label)}</span><div class="impl-chips">${items.map((x) => `<span class="impl-chip">${escapeHtml(x)}</span>`).join('')}</div></div>`;
  }

  function renderImplementationStage(project) {
    const data = implementationData(project);
    const stack = data.stack;
    const hasStack = stackHasContent(stack);

    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((r) => { reqMap[r.id] = r; });

    let stackBlock;
    if (!hasStack) {
      stackBlock = `
        <article class="pdos-card idea-empty">
          <h4>A stack técnica ainda não foi definida</h4>
          <p class="muted-text">Gere uma proposta de tecnologias (linguagens, frameworks, dados, deploy, recursos) ligada aos requisitos e à arquitetura.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="implementation_stack">Definir stack com IA</button>
          </div>
        </article>`;
    } else {
      const modules = stack.modules.map((m, i) => {
        const reqChips = (m.requirementIds || []).map((id) => {
          const req = reqMap[id];
          return `<button type="button" class="rm-req-chip" data-goto-requirement="${escapeHtml(id)}" title="Ver requisito">${escapeHtml(req ? (req.title || id) : id)}</button>`;
        }).join('');
        return `
          <article class="impl-module">
            <header><h5>${escapeHtml(m.name)}</h5>${m.technology ? `<span class="impl-chip">${escapeHtml(m.technology)}</span>` : ''}</header>
            <div class="idea-md" data-impl-md="module-${i}"></div>
            ${reqChips ? `<div class="rm-req-chips">${reqChips}</div>` : ''}
          </article>`;
      }).join('');

      stackBlock = `
        <article class="pdos-card impl-stack-card">
          <header class="impl-stack-head">
            <div>
              <span class="idea-eyebrow">STACK TÉCNICA</span>
              ${stack.confirmed ? '<span class="impl-confirmed">Confirmada</span>' : '<span class="impl-pending">Por confirmar</span>'}
            </div>
            <div class="pdos-card-actions">
              <button type="button" class="btn tiny ${stack.confirmed ? '' : 'primary'}" data-impl-confirm="${stack.confirmed ? 'unconfirm' : 'confirm'}">${stack.confirmed ? 'Reabrir' : 'Confirmar stack'}</button>
              <button type="button" class="btn tiny ghost" data-agent="implementation_stack">Regenerar</button>
            </div>
          </header>
          <div class="idea-md" data-impl-md="stack-summary"></div>
          ${stack.designPattern ? `<span class="rm-pattern">Design pattern: ${escapeHtml(stack.designPattern)}</span>` : ''}
          ${renderStackChips('Linguagens', stack.languages)}
          ${renderStackChips('Frameworks', stack.frameworks)}
          ${renderStackChips('Dados', stack.datastores)}
          ${renderStackChips('Integrações', stack.integrations)}
          ${stack.deployment ? `<div class="impl-chip-row"><span class="rm-label">Deploy</span><p class="impl-deploy">${escapeHtml(stack.deployment)}</p></div>` : ''}
          ${stack.infrastructureMarkdown ? `<div class="rm-sub"><span class="rm-label">Infraestrutura</span><div class="idea-md" data-impl-md="stack-infra"></div></div>` : ''}
          ${stack.resourcesMarkdown ? `<div class="rm-sub"><span class="rm-label">Recursos</span><div class="idea-md" data-impl-md="stack-resources"></div></div>` : ''}
          ${modules ? `<div class="rm-sub"><span class="rm-label">Módulos do sistema</span><div class="impl-modules">${modules}</div></div>` : ''}
        </article>`;
    }

    // Tasks — execution board / list
    let tasksBlock;
    if (!data.tasks.length) {
      tasksBlock = `
        <article class="pdos-card idea-empty">
          <h4>Ainda não há tarefas de implementação</h4>
          <p class="muted-text">Divida cada fase do roadmap em tarefas prontas para agentes. A IA recomenda o tamanho do modelo por complexidade e cada tarefa gera um prompt descarregável.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="implementation_tasks">Gerar tarefas com IA</button>
          </div>
        </article>`;
    } else {
      const phases = project.roadmap?.phases || [];
      const phaseName = {};
      phases.forEach((p) => { phaseName[p.id] = p.name; });

      const done = data.tasks.filter((t) => t.status === 'done').length;
      const progressPct = Math.round((done / data.tasks.length) * 100);

      let viewBody;
      if (implViewMode === 'board') {
        const cols = TASK_STATUSES.map((col) => {
          const colTasks = data.tasks.filter((t) => (t.status || 'todo') === col.id);
          const cards = colTasks.map((t) => renderTaskCard(t, project, reqMap, phaseName, true)).join('')
            || '<p class="impl-col-empty">—</p>';
          return `
            <div class="impl-col" data-col="${col.id}">
              <header class="impl-col-head"><span class="impl-task-status impl-status-${col.id}"></span>${escapeHtml(col.label)} <span class="impl-col-count">${colTasks.length}</span></header>
              <div class="impl-col-body">${cards}</div>
            </div>`;
        }).join('');
        viewBody = `<div class="impl-board">${cols}</div>`;
      } else {
        const groups = new Map();
        data.tasks.forEach((t) => {
          const key = t.roadmapPhaseId && phaseName[t.roadmapPhaseId] ? t.roadmapPhaseId : '__none__';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(t);
        });
        viewBody = [...groups.entries()].map(([key, tasks]) => {
          const title = key === '__none__' ? 'Sem fase atribuída' : phaseName[key];
          const cards = tasks.map((t) => renderTaskCard(t, project, reqMap, phaseName, false)).join('');
          return `<section class="impl-task-group"><h4 class="impl-group-title">${escapeHtml(title)}</h4><div class="impl-list">${cards}</div></section>`;
        }).join('');
      }

      tasksBlock = `
        <article class="pdos-card impl-tasks-card">
          <header class="impl-stack-head">
            <div>
              <span class="idea-eyebrow">EXECUÇÃO DE TAREFAS</span>
              <span class="impl-progress-label">${done}/${data.tasks.length} concluídas</span>
            </div>
            <div class="pdos-card-actions">
              <div class="impl-view-toggle">
                <button type="button" class="btn tiny ${implViewMode === 'board' ? 'primary' : 'ghost'}" data-impl-view="board">Quadro</button>
                <button type="button" class="btn tiny ${implViewMode === 'list' ? 'primary' : 'ghost'}" data-impl-view="list">Lista</button>
              </div>
              <button type="button" class="btn tiny ghost" data-agent="implementation_tasks">Regenerar tarefas</button>
            </div>
          </header>
          <div class="impl-progress"><div class="impl-progress-bar" style="width:${progressPct}%"></div></div>
          ${viewBody}
        </article>`;
    }

    return `
      <div class="idea-canvas impl-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">IMPLEMENTAÇÃO</span>
          <h2 class="idea-headline">Stack &amp; execução</h2>
        </header>
        ${stackBlock}
        ${tasksBlock}
      </div>
    `;
  }

  function renderTaskCard(t, project, reqMap, phaseName, isBoard) {
    const subDone = (t.subtasks || []).filter((s) => s.done).length;
    const subTotal = (t.subtasks || []).length;
    const model = LLM_SIZES.find((s) => s.id === t.llmSize);
    const phaseLabel = t.roadmapPhaseId && phaseName[t.roadmapPhaseId] ? phaseName[t.roadmapPhaseId] : '';
    const hasResult = Boolean(t.resultMarkdown || (t.outputLinks || []).length);
    const complexityBadge = t.complexity
      ? `<span class="impl-complexity impl-cx-${escapeHtml(t.complexity)}" title="Complexidade">${({ low: 'Simples', medium: 'Média', high: 'Complexa' })[t.complexity] || t.complexity}</span>`
      : '';
    return `
      <article class="impl-card" data-open-task="${escapeHtml(t.id)}" role="button" tabindex="0">
        <div class="impl-card-top">
          ${isBoard ? '' : `<span class="impl-task-status impl-status-${escapeHtml(t.status || 'todo')}"></span>`}
          <span class="impl-card-title">${escapeHtml(t.title)}</span>
        </div>
        <div class="impl-card-meta">
          ${model ? `<span class="impl-model-badge impl-model-${escapeHtml(t.llmSize)}" title="Modelo recomendado">${escapeHtml(model.label)}</span>` : ''}
          ${complexityBadge}
          ${isBoard && phaseLabel ? `<span class="impl-phase-chip">${escapeHtml(phaseLabel)}</span>` : ''}
          ${subTotal ? `<span class="impl-sub-progress">${subDone}/${subTotal} passos</span>` : ''}
          ${(t.requirementIds || []).length ? `<span class="impl-req-count" title="Requisitos ligados">${(t.requirementIds || []).length} req</span>` : ''}
          ${hasResult ? '<span class="impl-result-flag" title="Resultado registado">✓ resultado</span>' : ''}
        </div>
      </article>`;
  }

  function hydrateImplementationStage(project) {
    const data = implementationData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-impl-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('stack-summary', data.stack.summaryMarkdown);
    fill('stack-infra', data.stack.infrastructureMarkdown);
    fill('stack-resources', data.stack.resourcesMarkdown);
    data.stack.modules.forEach((m, i) => fill(`module-${i}`, m.descriptionMarkdown));
    wireImplementationEvents(project);
  }

  async function persistImplementation(project, payload) {
    try {
      const res = await apiRequest(`/projects/${project.id}/implementation`, { method: 'POST', body: payload });
      if (res?.project && window.state) {
        window.state.selectedProject = res.project;
      }
      return res?.project || null;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    }
  }

  function wireImplementationEvents(project) {
    const feed = $('pdosCardFeed');
    if (!feed) return;

    feed.querySelector('[data-impl-confirm]')?.addEventListener('click', async (e) => {
      const confirm = e.currentTarget.dataset.implConfirm === 'confirm';
      const updated = await persistImplementation(project, { confirmStack: confirm });
      if (updated) {
        showToast(confirm ? 'Stack confirmada.' : 'Stack reaberta.');
        window.PdosUI?.renderAll(updated);
      }
    });

    feed.querySelectorAll('[data-impl-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        implViewMode = btn.dataset.implView;
        window.PdosUI?.renderAll(window.state?.selectedProject || project);
      });
    });

    feed.querySelectorAll('[data-open-task]').forEach((card) => {
      const open = () => openTaskDrawer(window.state?.selectedProject || project, card.dataset.openTask);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  // Rich per-task execution drawer: objective, requirements, subtasks checklist,
  // model-aware prompt (download/copy), and post-execution result capture.
  function openTaskDrawer(project, taskId) {
    const data = implementationData(project);
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((r) => { reqMap[r.id] = r; });
    const phase = (project.roadmap?.phases || []).find((p) => p.id === task.roadmapPhaseId);

    document.querySelector('.impl-drawer-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'impl-drawer-overlay';

    const sizeOptions = LLM_SIZES.map((s) => `<option value="${s.id}" ${task.llmSize === s.id ? 'selected' : ''}>${s.label}${s.id === task.recommendedLlmSize ? ' (recomendado)' : ''}</option>`).join('');
    const statusOptions = TASK_STATUSES.map((s) => `<option value="${s.id}" ${task.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('');
    const reqChips = (task.requirementIds || []).map((id) => {
      const req = reqMap[id];
      return `<button type="button" class="rm-req-chip" data-goto-requirement="${escapeHtml(id)}">${escapeHtml(req ? (req.title || id) : id)}</button>`;
    }).join('');
    const acc = (task.acceptanceCriteria || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');
    const subtasks = (task.subtasks || []).map((st) => `
      <li class="impl-subtask">
        <label><input type="checkbox" data-subtask="${escapeHtml(st.id)}" ${st.done ? 'checked' : ''}> <span class="${st.done ? 'impl-sub-done' : ''}">${escapeHtml(st.title)}</span></label>
        ${st.descriptionMarkdown ? `<p class="impl-sub-desc">${escapeHtml(st.descriptionMarkdown)}</p>` : ''}
      </li>`).join('');
    const linksText = (task.outputLinks || []).map((l) => (l.label ? `${l.label} ${l.url}` : l.url)).join('\n');
    const initialPrompt = buildTaskPrompt(task, task.llmSize, project);

    overlay.innerHTML = `
      <div class="impl-drawer" role="dialog" aria-modal="true">
        <header class="impl-drawer-head">
          <div>
            ${phase ? `<span class="impl-phase-chip">${escapeHtml(phase.name)}</span>` : ''}
            <h3>${escapeHtml(task.title)}</h3>
          </div>
          <button type="button" class="btn tiny ghost" data-drawer-close>Fechar</button>
        </header>
        <div class="impl-drawer-body">
          <section class="impl-drawer-section">
            <span class="rm-label">Objetivo</span>
            <div class="idea-md" data-drawer-md="desc"></div>
          </section>
          ${reqChips ? `<section class="impl-drawer-section"><span class="rm-label">Requisitos (rastreabilidade)</span><div class="rm-req-chips">${reqChips}</div></section>` : ''}
          ${acc ? `<section class="impl-drawer-section"><span class="rm-label">Critérios de aceitação</span><ul>${acc}</ul></section>` : ''}
          ${subtasks ? `<section class="impl-drawer-section"><span class="rm-label">Passos (${(task.subtasks || []).filter((s) => s.done).length}/${(task.subtasks || []).length})</span><ul class="impl-subtasks">${subtasks}</ul></section>` : ''}
          ${task.technicalNotesMarkdown ? `<section class="impl-drawer-section"><span class="rm-label">Notas técnicas</span><div class="idea-md" data-drawer-md="notes"></div></section>` : ''}

          <section class="impl-drawer-section impl-exec-controls">
            <label class="impl-control">Tamanho do LLM
              <select data-drawer-llm>${sizeOptions}</select>
            </label>
            <label class="impl-control">Estado
              <select data-drawer-status>${statusOptions}</select>
            </label>
          </section>
          <p class="impl-llm-hint" data-drawer-hint>${escapeHtml(LLM_SIZES.find((s) => s.id === task.llmSize)?.hint || '')}</p>

          <section class="impl-drawer-section">
            <div class="impl-prompt-actions">
              <span class="rm-label" style="flex:1">Prompt para o agente</span>
              <button type="button" class="btn tiny primary" data-drawer-download>Baixar</button>
              <button type="button" class="btn tiny" data-drawer-copy>Copiar</button>
            </div>
            <textarea class="impl-prompt-box" data-drawer-prompt readonly rows="12">${escapeHtml(initialPrompt)}</textarea>
          </section>

          <section class="impl-drawer-section impl-result">
            <span class="rm-label">Resultado da execução</span>
            <input type="text" class="impl-input" data-drawer-model placeholder="Modelo usado (ex.: GPT-5, Claude...)" value="${escapeHtml(task.executedModel || '')}">
            <textarea class="impl-textarea" data-drawer-result rows="4" placeholder="O que foi produzido, decisões, observações...">${escapeHtml(task.resultMarkdown || '')}</textarea>
            <textarea class="impl-textarea" data-drawer-links rows="2" placeholder="Links de saída (PR, commit, ficheiros) — um por linha">${escapeHtml(linksText)}</textarea>
            <div class="impl-prompt-actions">
              <button type="button" class="btn tiny primary" data-drawer-save-result>Guardar resultado</button>
              ${task.executedAt ? `<span class="impl-exec-at">Executada em ${escapeHtml(fmtDate(task.executedAt))}</span>` : ''}
            </div>
          </section>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (task.descriptionMarkdown) renderMarkdownPreview(task.descriptionMarkdown, overlay.querySelector('[data-drawer-md="desc"]'));
    if (task.technicalNotesMarkdown) renderMarkdownPreview(task.technicalNotesMarkdown, overlay.querySelector('[data-drawer-md="notes"]'));

    const close = () => { overlay.remove(); document.body.style.overflow = ''; };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-drawer-close]')?.addEventListener('click', close);
    overlay.querySelectorAll('[data-goto-requirement]').forEach((chip) => {
      chip.addEventListener('click', () => { close(); });
    });

    const promptBox = overlay.querySelector('[data-drawer-prompt]');
    const llmSel = overlay.querySelector('[data-drawer-llm]');
    llmSel?.addEventListener('change', () => {
      task.llmSize = llmSel.value;
      promptBox.value = buildTaskPrompt(task, task.llmSize, project);
      const hint = overlay.querySelector('[data-drawer-hint]');
      if (hint) hint.textContent = LLM_SIZES.find((s) => s.id === task.llmSize)?.hint || '';
      persistImplementation(project, { taskUpdates: [{ id: task.id, llmSize: task.llmSize }] });
    });

    overlay.querySelector('[data-drawer-status]')?.addEventListener('change', async (e) => {
      const status = e.currentTarget.value;
      task.status = status;
      const updated = await persistImplementation(project, { taskUpdates: [{ id: task.id, status }] });
      if (updated) window.PdosUI?.renderAll(updated);
    });

    overlay.querySelectorAll('[data-subtask]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = e.currentTarget.dataset.subtask;
        const payload = e.currentTarget.checked
          ? { taskUpdates: [{ id: task.id, subtaskDone: [id] }] }
          : { taskUpdates: [{ id: task.id, subtaskDone: [], subtaskUndone: [id] }] };
        const span = e.currentTarget.parentElement.querySelector('span');
        if (span) span.className = e.currentTarget.checked ? 'impl-sub-done' : '';
        persistImplementation(project, payload);
      });
    });

    overlay.querySelector('[data-drawer-download]')?.addEventListener('click', () => {
      const slug = (task.title || 'tarefa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      downloadTextFile(promptBox.value, `prompt-${slug || 'tarefa'}.md`);
    });
    overlay.querySelector('[data-drawer-copy]')?.addEventListener('click', async () => {
      await copyToClipboard(promptBox.value);
      showToast('Prompt copiado.');
    });

    overlay.querySelector('[data-drawer-save-result]')?.addEventListener('click', async () => {
      const model = overlay.querySelector('[data-drawer-model]').value;
      const result = overlay.querySelector('[data-drawer-result]').value;
      const links = overlay.querySelector('[data-drawer-links]').value
        .split('\n').map((l) => l.trim()).filter(Boolean)
        .map((line) => {
          const m = line.match(/^(.*?)(https?:\/\/\S+)$/);
          return m ? { label: m[1].trim(), url: m[2] } : { label: '', url: line };
        });
      const updated = await persistImplementation(project, {
        taskUpdates: [{ id: task.id, executedModel: model, resultMarkdown: result, outputLinks: links }],
      });
      if (updated) {
        showToast('Resultado guardado.');
        close();
        window.PdosUI?.renderAll(updated);
      }
    });
  }

  // ---- Proposal phase (commercial) ---------------------------------------
  function proposalCanViewBudget() {
    try { return typeof canViewBudget === 'function' ? canViewBudget() : true; } catch { return true; }
  }

  function formatMoney(value, currency) {
    const n = Number(value) || 0;
    const cur = currency || 'EUR';
    try {
      return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${cur} ${n.toLocaleString('pt-PT')}`;
    }
  }

  function proposalData(project) {
    const p = project.proposal && typeof project.proposal === 'object' ? project.proposal : {};
    return {
      headlineMarkdown: p.headlineMarkdown || '',
      valueJustificationMarkdown: p.valueJustificationMarkdown || '',
      currency: p.currency || 'EUR',
      totalValue: Number(p.totalValue) || 0,
      phases: Array.isArray(p.phases) ? p.phases : [],
      paymentTermsMarkdown: p.paymentTermsMarkdown || '',
      timelineMarkdown: p.timelineMarkdown || '',
    };
  }

  function proposalHasContent(p) {
    return Boolean(p.headlineMarkdown || p.valueJustificationMarkdown || p.phases.length || p.totalValue || p.paymentTermsMarkdown);
  }

  function renderProposalStage(project) {
    const p = proposalData(project);
    const showMoney = proposalCanViewBudget();
    const reqCount = (project.requirements || []).length;

    if (!proposalHasContent(p)) {
      return `
        <article class="pdos-card idea-empty">
          <h4>A proposta comercial ainda não foi gerada</h4>
          <p class="muted-text">Gere uma proposta a partir dos ${reqCount} requisitos, do roadmap e dos documentos. Pode dar instruções específicas (tom, foco, restrições de valor).</p>
          <textarea class="impl-textarea" data-proposal-instructions rows="3" placeholder="Instruções para a IA (opcional): foco comercial, restrições de valor, tom..."></textarea>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="commercial_proposal">Gerar proposta com IA</button>
          </div>
        </article>`;
    }

    const phaseCards = p.phases.map((ph, i) => `
      <article class="prop-phase">
        <header class="prop-phase-head">
          <h5>${escapeHtml(ph.name || `Fase ${i + 1}`)}</h5>
          ${showMoney ? `<span class="prop-phase-value">${escapeHtml(formatMoney(ph.value, p.currency))}</span>` : ''}
        </header>
        ${ph.justificationMarkdown ? `<div class="idea-md" data-prop-md="phase-just-${i}"></div>` : ''}
        ${(ph.deliverables || []).length ? `<ul class="prop-deliverables">${ph.deliverables.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
      </article>`).join('');

    return `
      <article class="pdos-card idea-canvas proposal-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">PROPOSTA COMERCIAL</span>
          <h2 class="idea-headline">Proposta &amp; valor</h2>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny ghost" data-proposal-regen>Regenerar com instruções</button>
          </div>
        </header>
        <div class="idea-md idea-main" data-prop-md="headline"></div>
        ${showMoney && p.totalValue ? `<div class="prop-total"><span class="rm-label">Valor total</span><strong>${escapeHtml(formatMoney(p.totalValue, p.currency))}</strong></div>` : ''}
        ${p.valueJustificationMarkdown ? `<section class="idea-block"><h4 class="idea-block-title">Justificação do valor</h4><div class="idea-md" data-prop-md="justification"></div></section>` : ''}
        ${phaseCards ? `<section class="idea-block"><h4 class="idea-block-title">Valor por fase</h4><div class="prop-phases">${phaseCards}</div></section>` : ''}
        ${p.timelineMarkdown ? `<section class="idea-block"><h4 class="idea-block-title">Cronograma</h4><div class="idea-md" data-prop-md="timeline"></div></section>` : ''}
        ${p.paymentTermsMarkdown ? `<section class="idea-block"><h4 class="idea-block-title">Condições de pagamento</h4><div class="idea-md" data-prop-md="payment"></div></section>` : ''}
        ${!showMoney ? '<p class="muted-text">Os valores comerciais estão ocultos para o seu perfil.</p>' : ''}
        <div class="prop-regen-panel hidden" data-proposal-panel>
          <textarea class="impl-textarea" data-proposal-instructions rows="3" placeholder="Instruções para regenerar (tom, foco, restrições de valor)..."></textarea>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" data-agent="commercial_proposal">Gerar proposta</button>
          </div>
        </div>
      </article>`;
  }

  function hydrateProposalStage(project) {
    const p = proposalData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-prop-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('headline', p.headlineMarkdown);
    fill('justification', p.valueJustificationMarkdown);
    fill('timeline', p.timelineMarkdown);
    fill('payment', p.paymentTermsMarkdown);
    p.phases.forEach((ph, i) => fill(`phase-just-${i}`, ph.justificationMarkdown));

    $('pdosCardFeed')?.querySelector('[data-proposal-regen]')?.addEventListener('click', () => {
      $('pdosCardFeed')?.querySelector('[data-proposal-panel]')?.classList.toggle('hidden');
    });
  }

  async function renderMermaidInFeed() {
    const project = window.state?.selectedProject;
    const wraps = $('pdosCardFeed')?.querySelectorAll('.pdos-mermaid-wrap[data-render-mermaid]');
    if (!wraps?.length || !window.mermaid || !project) return;
    const pack = (project.artifacts || []).find((a) => a.type === 'architecture');
    const src = project.technicalApproach?.architectureMermaid || pack?.metadata?.architectureMermaid || '';
    if (!src) return;
    for (const wrap of wraps) {
      const id = `mmd_${Math.random().toString(36).slice(2, 9)}`;
      try {
        const { svg } = await window.mermaid.render(id, src);
        wrap.innerHTML = svg;
        wrap.querySelectorAll('text, tspan').forEach((node) => {
          const text = (node.textContent || '').trim();
          if (text && /^(FR|TR|SR|NFR|BR|STK|REQ)-\d+/i.test(text)) {
            node.style.cursor = 'pointer';
            node.style.textDecoration = 'underline';
            node.addEventListener('click', (event) => {
              event.stopPropagation();
              window.navigateToRequirement?.(text);
            });
          }
        });
      } catch {
        wrap.innerHTML = `<pre class="minute-raw">${escapeHtml(src)}</pre>`;
      }
    }
  }

  async function renderMarkdownPreview(md, container) {
    if (!container) return;
    try {
      const res = await apiRequest('/markdown/render', { method: 'POST', body: { markdown: md } });
      container.innerHTML = res.html || '';
      container.classList.add('markdown-body');
    } catch {
      container.textContent = md;
    }
  }

  function wireCardFeedEvents(project) {
    $('pdosCardFeed')?.querySelectorAll('[data-open-capability]').forEach((btn) => {
      btn.addEventListener('click', () => openDrawer(project, 'capability', btn.dataset.openCapability));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-agent]').forEach((btn) => {
      btn.addEventListener('click', () => runAgent(btn.dataset.agent, project));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-resume-job]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const job = ensureArray(project.agentJobs).find((j) => j.id === btn.dataset.resumeJob);
        if (job) openJobWorkbench(job);
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-job-chunk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [jobId, idx] = String(btn.dataset.jobChunk).split(':');
        const job = ensureArray(project.agentJobs).find((j) => j.id === jobId);
        if (job) openJobWorkbench(job, Number(idx));
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-approve-review]').forEach((btn) => {
      btn.addEventListener('click', () => resolveReview(btn.dataset.approveReview, 'approved'));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-view-review]').forEach((btn) => {
      btn.addEventListener('click', () => openReviewDrawer(project, btn.dataset.viewReview));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-open-artifact]').forEach((btn) => {
      btn.addEventListener('click', () => openArtifactDrawer(project, btn.dataset.openArtifact));
    });
    $('pdosCardFeed')?.querySelector('[data-unlinked-reqs]')?.addEventListener('click', () => {
      const linked = new Set();
      (project.capabilities || []).forEach((c) => (c.requirementIds || []).forEach((id) => linked.add(id)));
      const unlinked = (project.requirements || []).filter((r) => !linked.has(r.id));
      showToast(`${unlinked.length} requisito(s) ainda sem funcionalidade atribuída`);
    });
    $('pdosCardFeed')?.querySelectorAll('[data-scroll-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        document.getElementById(btn.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        window.navigateToFilteredTab?.(btn.dataset.navTab, {
          deliveryStageId: btn.dataset.navStage,
          contentView: btn.dataset.navView || '',
        });
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-open-phase-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = (project.documents || []).find((d) => d.id === btn.dataset.openPhaseDoc);
        if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-open-phase-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openPhaseItem;
        const kind = btn.dataset.openPhaseKind;
        if (kind === 'document') {
          const doc = (project.documents || []).find((d) => d.id === id);
          if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
        } else if (kind === 'minute') {
          window.navigateToFilteredTab?.('atas', { deliveryStageId: window.state.deliverySelectedStageId });
        } else if (kind === 'question') {
          window.navigateToFilteredTab?.('perguntas', { deliveryStageId: window.state.deliverySelectedStageId });
        }
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-phase-add-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.navigateToFilteredTab?.(btn.dataset.phaseAddTab, { deliveryStageId: window.state.deliverySelectedStageId });
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-move-phase-item]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.movePhaseItem;
        const kind = sel.dataset.movePhaseKind;
        const target = sel.value;
        try {
          if (kind === 'document') {
            await apiRequest(`/projects/${project.id}/documents/${id}`, { method: 'PATCH', body: { deliveryStageId: target } });
          } else if (kind === 'minute') {
            await apiRequest(`/projects/${project.id}/meeting-minutes/${id}`, { method: 'PATCH', body: { targetStageId: target } });
          }
          showToast('Movido para a fase seleccionada');
          await reloadProject(project.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  function openDrawer(project, type, id) {
    const drawer = $('pdosDetailDrawer');
    const content = $('pdosDrawerContent');
    if (!drawer || !content) return;
    pdosState.drawerOpen = true;
    drawer.classList.remove('hidden');

    if (type === 'capability') {
      const cap = (project.capabilities || []).find((c) => c.id === id);
      const clusters = (project.requirementClusters || []).filter((cl) => cl.capabilityId === id || (cap?.clusterIds || []).includes(cl.id));
      content.innerHTML = `
        <div class="pdos-drawer-head">
          <h3>${escapeHtml(cap?.name || id)}</h3>
          <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
        </div>
        <div class="markdown-preview" id="pdosCapSummary"></div>
        <h4>Grupos de requisitos</h4>
        <div class="pdos-cluster-list">
          ${clusters.length ? clusters.map((cl) => `
            <button type="button" class="pdos-cluster-item" data-open-cluster="${escapeHtml(cl.id)}">
              <strong>${escapeHtml(cl.name)}</strong>
              <span>${(cl.requirementIds || []).length} requisitos</span>
            </button>
          `).join('') : '<p class="muted-text">Sem grupos — corre «Agrupar requisitos com IA» na fase Requisitos.</p>'}
        </div>
        <h4>Rastreabilidade (origem → requisito)</h4>
        <div id="pdosOnionLayers" class="pdos-onion"></div>
      `;
      renderMarkdownPreview(cap?.summaryMarkdown || '', $('pdosCapSummary'));
      content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
      content.querySelectorAll('[data-open-cluster]').forEach((btn) => {
        btn.addEventListener('click', () => openClusterDrawer(project, btn.dataset.openCluster));
      });
      loadOnion(project, 'capability', id);
    }
  }

  function openClusterDrawer(project, clusterId) {
    const content = $('pdosDrawerContent');
    const cl = (project.requirementClusters || []).find((c) => c.id === clusterId);
    if (!content || !cl) return;
    const reqs = (cl.requirementIds || []).map((rid) => project.requirements.find((r) => r.id === rid)).filter(Boolean);
    content.innerHTML = `
      <div class="pdos-drawer-head">
        <button type="button" class="btn tiny ghost" id="pdosDrawerBack">← Funcionalidade</button>
        <h3>${escapeHtml(cl.name)}</h3>
        <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
      </div>
      ${cl.clientRequestText ? `<blockquote class="pdos-client-request">"${escapeHtml(cl.clientRequestText)}"</blockquote>` : ''}
      <div class="pdos-req-list">
        ${reqs.map((r) => `
          <article class="pdos-req-item" data-req-id="${escapeHtml(r.id)}">
            <div class="pdos-req-head"><span>${escapeHtml(r.id)}</span><span>${escapeHtml(r.type)}</span></div>
            <strong>${escapeHtml(r.title)}</strong>
            <p>${escapeHtml(shortText(r.shall || r.need, 120))}</p>
            <div class="pdos-module-badges">${(r.moduleTags || [r.module]).filter(Boolean).map((m) =>
              `<button type="button" class="module-badge clickable" data-module-filter="${escapeHtml(m)}">${escapeHtml(m)}</button>`
            ).join('')}</div>
          </article>
        `).join('')}
      </div>
      <div id="pdosOnionLayers" class="pdos-onion"></div>
    `;
    content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
    content.querySelector('#pdosDrawerBack')?.addEventListener('click', () => {
      if (cl.capabilityId) openDrawer(project, 'capability', cl.capabilityId);
    });
    content.querySelectorAll('[data-module-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pdosState.moduleFilter = btn.dataset.moduleFilter;
        renderModuleNav();
        closeDrawer();
        renderCardFeed(project);
      });
    });
    loadOnion(project, 'cluster', clusterId);
  }

  async function loadOnion(project, nodeType, nodeId) {
    const el = $('pdosOnionLayers');
    if (!el || !project?.id) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/onion/${nodeType}/${encodeURIComponent(nodeId)}`);
      el.innerHTML = `
        <h4>Cebola de rastreabilidade</h4>
        ${(res.layers || []).map((l) => `
          <details class="pdos-onion-layer">
            <summary>${escapeHtml(l.nodeType)} — ${escapeHtml(l.nodeId)}</summary>
          </details>
        `).join('') || '<p class="muted-text">Sem ligações ainda. Usa Sync trace.</p>'}
      `;
    } catch { el.innerHTML = ''; }
  }

  function closeDrawer() {
    pdosState.drawerOpen = false;
    const drawer = $('pdosDetailDrawer');
    drawer?.classList.add('hidden');
    drawer?.classList.remove('hr-drawer-open');
  }

  function openAddInfoModal() {
    const modal = $('pdosAddInfoModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeAddInfoModal() {
    $('pdosAddInfoModal')?.classList.add('hidden');
  }

  async function submitAddInfo(e) {
    e.preventDefault();
    const project = window.state?.selectedProject;
    if (!project) return;
    const type = $('addInfoType')?.value;
    const stageId = $('addInfoStage')?.value || 'requirements';
    const bodyMarkdown = $('addInfoBody')?.value || '';
    const analyzeWithAgent = $('addInfoAnalyze')?.checked;
    try {
      await apiRequest(`/projects/${project.id}/add-information`, {
        method: 'POST',
        body: { type, stageId, bodyMarkdown, analyzeWithAgent },
      });
      showToast('Informação guardada');
      closeAddInfoModal();
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function runDiagramToRequirements(project, options = {}) {
    const diagrams = project.diagramArtifacts || [];
    const preselected = options.diagramArtifactId;
    if (preselected) {
      await submitDiagramToRequirementsPrompt(project, preselected, null);
      return;
    }
    openDiagramToReqModal(project, diagrams, options);
  }

  async function submitDiagramToRequirementsPrompt(project, diagramArtifactId, bodyMarkdown) {
    const res = await apiRequest(`/projects/${project.id}/prompt-runs`, {
      method: 'POST',
      body: {
        agentType: 'diagram_to_requirements',
        stageId: 'architecture',
        diagramArtifactId: diagramArtifactId || undefined,
        bodyMarkdown: diagramArtifactId ? undefined : bodyMarkdown,
      },
    });
    pdosState.pendingPromptRun = res.promptRun;
    openPromptWorkbench(res);
    showToast('Prompt Diagrama → Requisitos gerado');
  }

  function openDiagramToReqModal(project, diagrams, modalOptions = {}) {
    $('diagramToReqModal')?.remove();
    const diagramOptionHtml = diagrams.map((d) =>
      `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)} (${escapeHtml(d.type)})</option>`
    ).join('');
    document.body.insertAdjacentHTML('beforeend', `
      <div id="diagramToReqModal" class="modal-overlay" role="dialog" aria-labelledby="diagramToReqTitle">
        <div class="modal-card modal-card-wide">
          <div class="modal-head">
            <h3 id="diagramToReqTitle">Diagrama → Requisitos</h3>
            <button type="button" class="btn tiny ghost" id="diagramToReqClose" aria-label="Fechar">✕</button>
          </div>
          <p class="muted-text">Escolha um diagrama da fase de arquitectura ou cole o código fonte. Será gerado um prompt v2 para extrair requisitos.</p>
          ${diagrams.length ? `
            <label class="full">Diagrama existente
              <select id="diagramToReqSelect">
                <option value="">— Colar manualmente —</option>
                ${diagramOptionHtml}
              </select>
            </label>
          ` : '<p class="muted-text">Sem diagramas guardados — cole o texto abaixo.</p>'}
          <label class="full">Código do diagrama (Mermaid, PlantUML, etc.)
            <textarea id="diagramToReqPaste" rows="10" placeholder="Cole aqui se não seleccionou um diagrama existente..."></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn ghost" id="diagramToReqCancel">Cancelar</button>
            <button type="button" class="btn primary" id="diagramToReqConfirm">Gerar prompt</button>
          </div>
        </div>
      </div>
    `);
    const modal = $('diagramToReqModal');
    const close = () => modal?.remove();
    $('diagramToReqClose')?.addEventListener('click', close);
    $('diagramToReqCancel')?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const preselect = modalOptions.diagramArtifactId;
    if (preselect && $('diagramToReqSelect')) {
      $('diagramToReqSelect').value = preselect;
      $('diagramToReqSelect').dispatchEvent(new Event('change'));
    }
    $('diagramToReqSelect')?.addEventListener('change', (e) => {
      const d = diagrams.find((x) => x.id === e.target.value);
      const ta = $('diagramToReqPaste');
      if (d && ta) {
        ta.value = d.sourceText || '';
        ta.readOnly = true;
      } else if (ta) {
        ta.readOnly = false;
      }
    });
    $('diagramToReqConfirm')?.addEventListener('click', async () => {
      const diagramArtifactId = $('diagramToReqSelect')?.value || '';
      const bodyMarkdown = $('diagramToReqPaste')?.value?.trim() || '';
      if (!diagramArtifactId && !bodyMarkdown) {
        showToast('Seleccione um diagrama ou cole o código', 'error');
        return;
      }
      close();
      try {
        await submitDiagramToRequirementsPrompt(project, diagramArtifactId, bodyMarkdown);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function runArchitecturePackGeneration(project, options = {}) {
    try {
      const caps = project.capabilities || [];
      const capabilityId = options.capabilityId ?? $('archGenCapability')?.value ?? caps[0]?.id ?? '';
      const moduleTag = options.moduleTag ?? $('archGenModule')?.value ?? (pdosState.moduleFilter || 'Backend');
      const res = await apiRequest(`/projects/${project.id}/prompt-runs`, {
        method: 'POST',
        body: {
          agentType: 'requirements_to_architecture',
          stageId: 'architecture',
          capabilityId: capabilityId || undefined,
          moduleTag,
        },
      });
      pdosState.pendingPromptRun = res.promptRun;
      openPromptWorkbench(res);
      showToast('Prompt de arquitectura gerado — cole o JSON no workbench');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function runAgent(agentType, project) {
    if (agentType === 'requirements_to_architecture') {
      return runArchitecturePackGeneration(project);
    }
    if (agentType === 'diagram_to_requirements') {
      return runDiagramToRequirements(project);
    }
    // Para agentes pesados com muitos requisitos, divide em lotes para nao
    // sobrecarregar o pedido ao modelo.
    if (BATCHABLE_AGENT_TYPES.includes(agentType)
      && ensureArray(project.requirements).length > AGENT_JOB_THRESHOLD) {
      return startAgentJob(agentType, project);
    }
    try {
      const body = { agentType, stageId: window.state?.deliverySelectedStageId };
      if (agentType === 'commercial_proposal') {
        const ta = $('pdosCardFeed')?.querySelector('[data-proposal-instructions]');
        if (ta && ta.value.trim()) body.instructions = ta.value.trim();
      }
      const res = await apiRequest(`/projects/${project.id}/prompt-runs`, { method: 'POST', body });
      pdosState.pendingPromptRun = res.promptRun;
      openPromptWorkbench(res);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function setWorkbenchJobMode(on) {
    $('pdosJobBar')?.classList.toggle('hidden', !on);
    $('pdosJobSubmit')?.classList.toggle('hidden', !on);
    $('pdosPromptApply')?.classList.toggle('hidden', on);
    if (!on) $('pdosJobAuto')?.classList.add('hidden');
  }

  function openPromptWorkbench(res) {
    const modal = $('pdosPromptWorkbench');
    if (!modal) return;
    pdosState.activeJob = null;
    setWorkbenchJobMode(false);
    modal.classList.remove('hidden');
    $('pdosPromptSummary').textContent = res.promptRun?.summaryMarkdown || 'Prompt gerado.';
    $('pdosPromptRaw').value = res.prompt || '';
    $('pdosPromptOutput').value = '';
    $('pdosPromptRunId').value = res.promptRun?.id || '';
  }

  function closePromptWorkbench() {
    $('pdosPromptWorkbench')?.classList.add('hidden');
    setWorkbenchJobMode(false);
    pdosState.activeJob = null;
    pdosState.activeJobStep = '';
  }

  async function startAgentJob(agentType, project) {
    try {
      const res = await apiRequest(`/projects/${project.id}/agent-jobs`, {
        method: 'POST',
        body: { agentType, stageId: window.state?.deliverySelectedStageId },
      });
      showToast('Pedido dividido em lotes — responda um lote de cada vez');
      openJobWorkbench(res.agentJob);
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Escolhe o proximo passo do job: primeiro os lotes obrigatorios pendentes,
  // depois a consolidacao. Lotes deferidos (sem modulo) nao bloqueiam.
  function renderAgentJobsHtml(project) {
    const jobs = ensureArray(project.agentJobs).filter((j) => ['collecting', 'reconciling'].includes(j.status));
    if (!jobs.length) return '';
    return `
      <article class="pdos-card pdos-agent-jobs">
        <h4>Tarefas de IA em lotes</h4>
        <p class="muted-text">Pedidos grandes divididos em lotes — responda um de cada vez para não sobrecarregar o modelo.</p>
        ${jobs.map((job) => {
          const total = ensureArray(job.chunks).length;
          const done = ensureArray(job.chunks).filter((c) => c.status === 'done').length;
          const pendingDeferred = ensureArray(job.chunks).filter((c) => c.deferred && c.status !== 'done');
          const stateLabel = job.status === 'reconciling' ? 'Pronto para consolidação' : `${done}/${total} lotes concluídos`;
          return `
            <div class="pdos-job-row">
              <div class="pdos-job-row-info">
                <strong>${escapeHtml(agentTypeLabel(job.agentType))}</strong>
                <span class="muted-text"> · ${escapeHtml(stateLabel)}</span>
              </div>
              <div class="pdos-job-row-actions">
                <button type="button" class="btn tiny primary" data-resume-job="${escapeHtml(job.id)}">${job.status === 'reconciling' ? 'Consolidar' : 'Continuar'}</button>
                ${pendingDeferred.map((c) => `<button type="button" class="btn tiny" data-job-chunk="${escapeHtml(job.id)}:${c.index}">Definir: ${escapeHtml(c.label)}</button>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </article>`;
  }

  function nextJobStep(job) {
    const pendingRequired = ensureArray(job.chunks).find((c) => !c.deferred && c.status !== 'done');
    if (pendingRequired) return { type: 'chunk', chunk: pendingRequired };
    if (job.promptRunId || job.status === 'review_pending' || job.status === 'applied') return { type: 'done' };
    return { type: 'reconcile' };
  }

  function openJobWorkbench(job, forceChunkIndex = null) {
    const modal = $('pdosPromptWorkbench');
    if (!modal || !job) return;
    pdosState.activeJob = job;
    setWorkbenchJobMode(true);
    modal.classList.remove('hidden');
    $('pdosJobId').value = job.id;
    renderJobStep(job, forceChunkIndex);
  }

  function renderJobStep(job, forceChunkIndex = null) {
    pdosState.activeJob = job;
    let step;
    if (forceChunkIndex != null) {
      const c = ensureArray(job.chunks).find((x) => Number(x.index) === Number(forceChunkIndex));
      step = c ? { type: 'chunk', chunk: c } : nextJobStep(job);
    } else {
      step = nextJobStep(job);
    }

    const total = ensureArray(job.chunks).length;
    const doneCount = ensureArray(job.chunks).filter((c) => c.status === 'done').length;

    if (step.type === 'done') {
      closePromptWorkbench();
      return;
    }

    if (step.type === 'reconcile') {
      pdosState.activeJobStep = 'reconcile';
      $('pdosJobChunkIndex').value = '';
      $('pdosPromptSummary').textContent = 'Consolidação final. Recomendado: "Consolidar automaticamente (sem IA)" — junta os lotes sem pedir nada ao ChatGPT. Opcional: cole grupos de fusão da IA para unir funcionalidades parecidas.';
      $('pdosPromptRaw').value = job.reconcilePrompt || '';
      $('pdosPromptOutput').value = '';
      $('pdosJobBar').innerHTML = `<span class="pdos-job-step">Passo final: consolidação</span><span class="pdos-job-progress">${doneCount}/${total} lotes concluídos</span>`;
      $('pdosJobAuto')?.classList.remove('hidden');
      $('pdosJobSubmit').textContent = 'Submeter grupos da IA';
      refreshReconcilePrompt(job);
      return;
    }

    const chunk = step.chunk;
    pdosState.activeJobStep = 'chunk';
    $('pdosJobAuto')?.classList.add('hidden');
    $('pdosJobChunkIndex').value = chunk.index;
    const human = Number(chunk.index) + 1;
    $('pdosPromptSummary').textContent = `Lote ${human} de ${total}: ${chunk.label} (${chunk.requirementIds.length} requisitos)${chunk.deferred ? ' — opcional, pode definir mais tarde' : ''}`;
    $('pdosPromptRaw').value = chunk.prompt || '';
    $('pdosPromptOutput').value = '';
    const dots = ensureArray(job.chunks).map((c) => `<span class="pdos-job-dot${c.status === 'done' ? ' done' : ''}${c.deferred ? ' deferred' : ''}" title="${escapeHtml(c.label)}">${Number(c.index) + 1}</span>`).join('');
    $('pdosJobBar').innerHTML = `<div class="pdos-job-dots">${dots}</div><span class="pdos-job-progress">${doneCount}/${total} concluídos</span>`;
    $('pdosJobSubmit').textContent = 'Submeter lote e seguir';
  }

  // Recalcula o prompt de consolidacao (compacto) no servidor, util para jobs
  // criados antes desta versao.
  async function refreshReconcilePrompt(job) {
    const project = window.state?.selectedProject;
    if (!project || !job) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/refresh-reconcile`, { method: 'POST' });
      if (pdosState.activeJob?.id === job.id && pdosState.activeJobStep === 'reconcile' && res.agentJob?.reconcilePrompt) {
        pdosState.activeJob = res.agentJob;
        $('pdosPromptRaw').value = res.agentJob.reconcilePrompt;
      }
    } catch (err) {
      // mantem o prompt anterior se falhar
    }
  }

  // Consolidacao deterministica (sem IA): funde os lotes por codigo e envia para
  // revisao humana. Caminho recomendado e a prova de truncamento do ChatGPT.
  async function submitJobAuto() {
    const project = window.state?.selectedProject;
    const job = pdosState.activeJob;
    if (!project || !job) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/reconcile`, {
        method: 'POST',
        body: {},
      });
      showToast('Consolidado automaticamente — reveja e aprove para aplicar');
      closePromptWorkbench();
      await reloadProject(project.id);
      if (res.review?.id) openReviewDrawer(window.state.selectedProject, res.review.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function submitJobStep() {
    const project = window.state?.selectedProject;
    const job = pdosState.activeJob;
    if (!project || !job) return;
    const raw = $('pdosPromptOutput')?.value || '';
    if (!raw.trim()) {
      showToast('Cole o output da IA antes de submeter', 'error');
      return;
    }
    const normalized = normalizeJsonInput(raw);
    let parsed = null;
    try { parsed = JSON.parse(normalized); } catch {
      showToast('JSON inválido — use aspas rectas (" ") no output', 'error');
      return;
    }
    try {
      if (pdosState.activeJobStep === 'reconcile') {
        const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/reconcile`, {
          method: 'POST',
          body: { rawOutput: normalized, parsedOutput: parsed },
        });
        showToast('Consolidação submetida para revisão humana — aprove para aplicar');
        closePromptWorkbench();
        await reloadProject(project.id);
        if (res.review?.id) openReviewDrawer(window.state.selectedProject, res.review.id);
      } else {
        const idx = $('pdosJobChunkIndex').value;
        const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/chunks/${idx}`, {
          method: 'POST',
          body: { rawOutput: normalized, parsedOutput: parsed },
        });
        renderJobStep(res.agentJob);
        await reloadProject(project.id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function applyPromptOutput() {
    const project = window.state?.selectedProject;
    const runId = $('pdosPromptRunId')?.value;
    const raw = $('pdosPromptOutput')?.value || '';
    if (!project || !runId) return;
    if (!raw.trim()) {
      showToast('Cole o output da IA antes de submeter', 'error');
      return;
    }
    const normalized = normalizeJsonInput(raw);
    let parsed = null;
    try { parsed = JSON.parse(normalized); } catch {
      showToast('JSON inválido — use aspas rectas (" ") no output', 'error');
      return;
    }
    try {
      const res = await apiRequest(`/projects/${project.id}/prompt-runs/${runId}/apply`, {
        method: 'POST',
        body: { rawOutput: normalized, parsedOutput: parsed, deferApply: true },
      });
      showToast(res.deferred
        ? 'Submetido para revisão humana — aprove nos detalhes para aplicar'
        : 'Output aplicado');
      closePromptWorkbench();
      await reloadProject(project.id);
      if (res.review?.id) openReviewDrawer(window.state.selectedProject, res.review.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function pasteAlternative() {
    const project = window.state?.selectedProject;
    const runId = $('pdosPromptRunId')?.value;
    const raw = $('pdosAltOutput')?.value || '';
    if (!project || !runId || !raw) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/prompt-runs/${runId}/alternative`, {
        method: 'POST',
        body: { rawOutput: raw, modelName: $('pdosAltModel')?.value || 'external' },
      });
      $('pdosAltDiff').textContent = res.alternative?.diffSummary || 'Resposta alternativa guardada.';
      showToast('Comparar outputs disponível');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function resolveReview(reviewId, status) {
    const project = window.state?.selectedProject;
    if (!project) return;
    try {
      await apiRequest(`/projects/${project.id}/human-reviews/${reviewId}/resolve`, {
        method: 'POST',
        body: { status, applyChanges: status === 'approved' },
      });
      showToast(status === 'approved' ? 'Revisão aprovada e alterações aplicadas' : 'Revisão actualizada');
      closeDrawer();
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderReviewSectionsHtml(review, promptRun) {
    const sections = review.suggestedChanges?.sections || [];
    const parsed = review.suggestedChanges?.parsed || promptRun?.parsedOutput;
    const rawOutput = review.suggestedChanges?.rawOutput || promptRun?.rawOutput;

    if (sections.length) {
      const kindBadge = { created: 'badge-green', updated: 'badge-orange' };
      const kindLabel = { created: 'Novo', updated: 'Alterado' };
      return sections.map((section) => `
        <div class="review-section review-section-${escapeHtml(section.kind || 'created')}">
          <h4>
            <span class="section-badge ${kindBadge[section.kind] || 'badge-gray'}">${escapeHtml(kindLabel[section.kind] || section.kind || 'Item')}</span>
            ${escapeHtml(section.label || section.entityType || 'Alteração')}
          </h4>
          ${section.before ? `<div class="review-diff"><strong>Antes</strong><pre class="minute-raw">${escapeHtml(String(section.before).slice(0, 4000))}</pre></div>` : ''}
          ${section.after ? `<div class="review-diff"><strong>Conteúdo proposto</strong><pre class="minute-raw">${escapeHtml(String(section.after).slice(0, 4000))}</pre></div>` : ''}
          ${section.items?.length ? `<ul class="review-items">${section.items.map((item) => {
            const parts = Object.entries(item).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}`);
            return `<li>${parts.join(' · ')}</li>`;
          }).join('')}</ul>` : ''}
        </div>
      `).join('');
    }

    if (parsed) {
      return `<pre class="minute-raw">${escapeHtml(JSON.stringify(parsed, null, 2).slice(0, 16000))}</pre>`;
    }
    if (rawOutput && rawOutput.trim()) {
      return `<pre class="minute-raw">${escapeHtml(rawOutput.slice(0, 16000))}</pre>`;
    }
    return '<p class="muted-text">Sem output colado. Abra o Prompt Workbench, cole a resposta da IA e submeta para revisão.</p>';
  }

  async function openReviewDrawer(project, reviewId) {
    let review = (project.humanReviews || []).find((r) => r.id === reviewId);
    const drawer = $('pdosDetailDrawer');
    const content = $('pdosDrawerContent');
    if (!drawer || !content || !review) return;

    const promptRun = (project.promptRuns || []).find(
      (r) => r.id === review.promptRunId || r.id === review.sourceId
    );

    if ((!review.suggestedChanges || !review.bodyMarkdown) && promptRun && (promptRun.parsedOutput || promptRun.rawOutput)) {
      try {
        const res = await apiRequest(`/projects/${project.id}/human-reviews/${reviewId}/enrich`, { method: 'POST', body: {} });
        if (res.review) {
          review = res.review;
          const idx = (project.humanReviews || []).findIndex((r) => r.id === reviewId);
          if (idx >= 0) project.humanReviews[idx] = review;
        }
      } catch { /* fallback abaixo */ }
    }

    drawer.classList.remove('hidden');
    drawer.classList.add('hr-drawer-open');
    const agentLabel = promptRun ? agentFriendlyLabel(promptRun.agentType) : '';
    content.innerHTML = `
      <div class="pdos-drawer-head hr-drawer-head">
        <div>
          <span class="hr-card-status">Revisão humana</span>
          <h3>${escapeHtml(review.title)}</h3>
          ${agentLabel ? `<p class="muted-text">Origem: <strong>${escapeHtml(agentLabel)}</strong></p>` : ''}
        </div>
        <button type="button" class="btn tiny ghost pdos-drawer-close" aria-label="Fechar">Fechar</button>
      </div>
      <div class="hr-drawer-body">
        <section class="hr-drawer-section">
          <span class="rm-label">Resumo</span>
          <p class="review-summary">${escapeHtml(review.summaryMarkdown || '')}</p>
        </section>
        <section class="hr-drawer-section">
          <span class="rm-label">Alterações propostas (${review.decisionsCount || 0})</span>
          <div id="pdosReviewSections" class="review-sections hr-review-sections">${renderReviewSectionsHtml(review, promptRun)}</div>
        </section>
        ${review.bodyMarkdown ? `<section class="hr-drawer-section"><span class="rm-label">Detalhe narrativo</span><div id="pdosReviewMarkdown" class="markdown-preview idea-md"></div></section>` : ''}
      </div>
      <footer class="hr-drawer-footer">
        ${review.status === 'pending' ? `
          <button type="button" class="btn primary" data-approve-review="${escapeHtml(review.id)}">Aprovar e aplicar</button>
          <button type="button" class="btn" data-reject-review="${escapeHtml(review.id)}">Pedir alterações</button>
        ` : `<span class="chip">${escapeHtml(review.status)}</span>`}
        <button type="button" class="btn ghost pdos-drawer-close-footer">Fechar</button>
      </footer>
    `;

    if (review.bodyMarkdown) {
      await renderMarkdownPreview(review.bodyMarkdown, $('pdosReviewMarkdown'));
    }

    content.querySelectorAll('.pdos-drawer-close, .pdos-drawer-close-footer').forEach((btn) => {
      btn.addEventListener('click', closeDrawer);
    });
    content.querySelector('[data-approve-review]')?.addEventListener('click', () => resolveReview(reviewId, 'approved'));
    content.querySelector('[data-reject-review]')?.addEventListener('click', () => resolveReview(reviewId, 'changes_requested'));
  }

  async function relinkPhases() {
    const project = window.state?.selectedProject;
    if (!project) return;
    const btn = $('pdosRelinkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'A reaplicar…'; }
    try {
      const res = await apiRequest(`/projects/${project.id}/relink-phases`, { method: 'POST' });
      showToast(res.report?.summary || 'Ligações reaplicadas');
      await reloadProject(project.id);
      if (res.reviewId) openReviewDrawer(window.state.selectedProject, res.reviewId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reaplicar ligações entre fases'; }
    }
  }

  async function syncTraceLinks() {
    const project = window.state?.selectedProject;
    if (!project) return;
    try {
      await apiRequest(`/projects/${project.id}/trace-links/sync`, { method: 'POST' });
      if (typeof refreshTraceMap === 'function') await refreshTraceMap();
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function generateCommercialProposal() {
    const project = window.state?.selectedProject;
    if (!project) return;
    const btn = $('pdosGenProposalBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'A gerar…'; }
    try {
      const res = await apiRequest(`/projects/${project.id}/generate`, {
        method: 'POST',
        body: { mode: 'commercial' },
      });
      const outputs = res.generated?.outputs || res.outputs || {};
      const link = outputs.fullDocumentHtml || outputs.fullDocumentPdf || outputs.fullDocumentMarkdown;
      showToast('Proposta comercial gerada a partir da informação atual do projeto');
      await reloadProject(project.id);
      if (link) window.open(link, '_blank', 'noopener');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Gerar proposta comercial'; }
    }
  }

  async function reloadProject(projectId) {
    const res = await apiRequest(`/projects/${projectId}`);
    window.state.selectedProject = res.project;
    renderPdosShell(res.project);
    if (typeof renderProjectDetails === 'function') renderProjectDetails();
  }

  function renderPdosShell(project) {
    if (!project) return;
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    renderProjectHeader(project);
    renderGoldenTimeline(project);
    renderStageGuidance(project);
    renderCurrentFocus(project);
    renderStageConceptBanner();
    renderModuleNav();
    renderHumanReviewsSection(project);
    renderCardFeed(project);
    window.DiagramsUI?.renderShell?.(project);
  }

  function renderSnapshotsList(project) {
    const el = $('pdosSnapshotsList');
    if (!el) return;
    const snaps = project.versionSnapshots || [];
    el.innerHTML = snaps.length
      ? snaps.slice(0, 5).map((s) => `
        <div class="simple-item">
          <strong>${escapeHtml(s.label)}</strong>
          <small>${escapeHtml(s.createdAt)}</small>
          <button type="button" class="btn tiny" data-restore-snap="${escapeHtml(s.id)}">Restaurar</button>
        </div>
      `).join('')
      : '<span class="muted-text">Sem snapshots.</span>';
    el.querySelectorAll('[data-restore-snap]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Restaurar esta versão?')) return;
        try {
          await apiRequest(`/projects/${project.id}/snapshots/${btn.dataset.restoreSnap}/restore`, { method: 'POST' });
          showToast('Versão restaurada');
          await reloadProject(project.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  async function copyToClipboard(text) {
    return navigator.clipboard.writeText(String(text || ''));
  }

  function resolveDeliveryStageIdForRequirement(requirement) {
    const status = String(requirement?.status || '').toLowerCase();
    const type = String(requirement?.type || '').toLowerCase();
    if (status === 'delivered') return 'delivery';
    if (status === 'validated') return 'validation';
    if (status === 'in_development') return 'implementation';
    if (status === 'planned') return 'roadmap';
    if (type === 'test_case') return 'validation';
    return 'requirements';
  }

  function getDeliveryNodeKey(nodeType, nodeId) {
    return `${nodeType}:${nodeId}`;
  }

  function collectDeliveryFeedNodes(project) {
    const nodes = [];
    (project.requirements || []).forEach((req) => {
      nodes.push({
        nodeType: 'requirement',
        id: req.id,
        requirement: req,
        status: req.status,
        stageId: resolveDeliveryStageIdForRequirement(req),
      });
    });
    (project.artifacts || []).forEach((art) => {
      nodes.push({
        nodeType: 'artifact',
        id: art.id,
        artifact: art,
        type: art.type,
        status: art.status,
        stageId: art.stageId || 'requirements',
      });
    });
    return nodes;
  }

  async function loadTraceMap(projectId) {
    if (!projectId) {
      window.state.traceMap = null;
      return;
    }
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/trace-map`);
      window.state.traceMap = {
        nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
        links: Array.isArray(payload?.links) ? payload.links : [],
      };
    } catch {
      window.state.traceMap = null;
    }
  }

  function renderTracePanel(project) {
    if (!project) return;

    const levels = window.state?.config?.deliveryLevels || ['simple', 'standard', 'complete'];
    const levelSelect = $('deliveryLevelSelect');
    if (levelSelect) {
      const currentLevel = String(project.deliveryLevel || 'standard').toLowerCase();
      levelSelect.innerHTML = levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      levelSelect.value = levels.includes(currentLevel) ? currentLevel : 'standard';
    }

    const nodes = collectDeliveryFeedNodes(project);
    const traceMap = window.state.traceMap || { nodes: [], links: [] };
    $('traceMapMeta') && ($('traceMapMeta').textContent = `${traceMap.nodes.length} nodes • ${traceMap.links.length} links`);

    const feedNodes = nodes.filter((n) => n.stageId === window.state.deliverySelectedStageId);
    $('deliveryFeedTitle') && ($('deliveryFeedTitle').textContent = `Stage: ${window.state.deliverySelectedStageId}`);
    $('deliveryFeedMeta') && ($('deliveryFeedMeta').textContent = `${feedNodes.length} item(ns)`);

    $('deliveryFeedRail') && ($('deliveryFeedRail').innerHTML = feedNodes.length
      ? feedNodes.map((node) => {
        const title = node.nodeType === 'artifact' ? (node.artifact?.name || node.id) : (node.requirement?.title || node.id);
        const summary = node.nodeType === 'requirement' ? shortText(node.requirement?.shall || node.requirement?.need, 180) : shortText(node.artifact?.description, 120);
        return `
          <article class="delivery-card" data-delivery-node-type="${escapeHtml(node.nodeType)}" data-delivery-node-id="${escapeHtml(node.id)}">
            <div class="delivery-card-top"><span class="delivery-card-kind">${escapeHtml(node.nodeType)}</span><span>${escapeHtml(node.id)}</span></div>
            <h5>${escapeHtml(title)}</h5>
            <p>${escapeHtml(summary)}</p>
          </article>
        `;
      }).join('')
      : '<div class="delivery-empty-state">Sem itens neste estágio.</div>');

    const artifactTypes = window.state?.config?.artifactTypes || ['other'];
    const traceTypes = window.state?.config?.traceRelationshipTypes || [];
    const stageFlow = window.state?.config?.deliveryStageFlow || [];
    if ($('artifactType')) $('artifactType').innerHTML = artifactTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    if ($('artifactStageId')) $('artifactStageId').innerHTML = stageFlow.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`).join('');
    if ($('traceRelationshipType')) $('traceRelationshipType').innerHTML = traceTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

    $('artifactsList') && ($('artifactsList').innerHTML = (project.artifacts || []).slice(0, 20).map((a) =>
      `<div class="simple-item"><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.type)} · ${escapeHtml(a.status)}</small></div>`
    ).join('') || '<span class="muted-text">Sem artefactos.</span>');

    $('traceLinksList') && ($('traceLinksList').innerHTML = (project.traceLinks || []).slice(0, 20).map((l) =>
      `<div class="simple-item"><small>${escapeHtml(l.sourceType)}:${escapeHtml(l.sourceId)} → ${escapeHtml(l.relationshipType)} → ${escapeHtml(l.targetType)}:${escapeHtml(l.targetId)}</small></div>`
    ).join('') || '<span class="muted-text">Sem trace links.</span>');

    $('impactReportsList') && ($('impactReportsList').innerHTML = (project.impactReports || []).slice(0, 10).map((r) =>
      `<div class="simple-item"><strong>${escapeHtml(r.sourceType)}:${escapeHtml(r.sourceId)}</strong><small>${escapeHtml(r.createdAt)}</small>
        <button type="button" class="btn tiny" data-export-impact="${escapeHtml(r.id)}">Export MD</button></div>`
    ).join('') || '<span class="muted-text">Sem reports.</span>');

    $('impactReportsList')?.querySelectorAll('[data-export-impact]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await apiRequest(`/projects/${project.id}/impact-reports/${btn.dataset.exportImpact}/markdown`);
          await copyToClipboard(res.markdown);
          showToast('Impact report copiado (markdown)');
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  }

  function wireTraceEvents() {
    $('saveDeliveryLevelBtn')?.addEventListener('click', async () => {
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}`, { method: 'PATCH', body: { deliveryLevel: $('deliveryLevelSelect')?.value } });
        showToast('Delivery level guardado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });

    $('refreshTraceMapBtn')?.addEventListener('click', () => syncTraceLinks());

    $('addArtifactForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}/artifacts`, {
          method: 'POST',
          body: {
            type: $('artifactType')?.value,
            name: $('artifactName')?.value,
            stageId: $('artifactStageId')?.value,
            status: $('artifactStatus')?.value,
            relatedRequirementIds: ($('artifactRelatedIds')?.value || '').split(/[,\s]+/).filter(Boolean),
            description: $('artifactDescription')?.value,
            bodyMarkdown: $('artifactDescription')?.value,
          },
        });
        showToast('Artefacto guardado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });

    $('addTraceLinkForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}/trace-links`, {
          method: 'POST',
          body: {
            sourceType: $('traceSourceType')?.value,
            sourceId: $('traceSourceId')?.value,
            targetType: $('traceTargetType')?.value,
            targetId: $('traceTargetId')?.value,
            relationshipType: $('traceRelationshipType')?.value,
            confidence: Number($('traceConfidence')?.value || 0.8),
            validatedByHuman: $('traceValidatedByHuman')?.checked,
          },
        });
        showToast('Trace link criado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });

    $('generateImpactForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}/impact-report`, {
          method: 'POST',
          body: {
            sourceType: $('impactSourceType')?.value,
            sourceId: $('impactSourceId')?.value,
            includeUpstream: $('impactIncludeUpstream')?.checked,
          },
        });
        showToast('Impact report gerado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  async function renderAll(project) {
    if (!project) return;
    await loadTraceMap(project.id);
    renderPdosShell(project);
    renderTracePanel(project);
  }

  function wirePdosEvents() {
    $('pdosAddInfoForm')?.addEventListener('submit', submitAddInfo);
    $('pdosAddInfoCancel')?.addEventListener('click', closeAddInfoModal);
    $('pdosPromptClose')?.addEventListener('click', closePromptWorkbench);
    $('pdosPromptCopy')?.addEventListener('click', () => {
      copyToClipboard($('pdosPromptRaw')?.value).then(() => showToast('Prompt copiado'));
    });
    $('pdosPromptApply')?.addEventListener('click', applyPromptOutput);
    $('pdosJobSubmit')?.addEventListener('click', submitJobStep);
    $('pdosJobAuto')?.addEventListener('click', submitJobAuto);
    $('pdosAltSubmit')?.addEventListener('click', pasteAlternative);
    $('pdosDrawerOverlay')?.addEventListener('click', closeDrawer);
    document.querySelectorAll('[data-close-transition]').forEach((el) => {
      el.addEventListener('click', closeTransitionModal);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeAddInfoModal();
        closePromptWorkbench();
        closeTransitionModal();
      }
    });
  }

  window.PdosUI = {
    renderPdosShell,
    renderTracePanel,
    renderAll,
    loadTraceMap,
    wirePdosEvents,
    wireTraceEvents,
    closeDrawer,
    openPromptWorkbench,
    runArchitecturePackGeneration,
    runDiagramToRequirements,
    pdosState,
  };
  window.refreshTraceMap = () => loadTraceMap(window.state?.selectedProject?.id);
})();
