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

  function renderStageConceptBanner(stageId) {
    const el = $('pdosConceptBanner');
    if (!el) return;
    const keys = getStageConceptKeys(stageId);
    const concepts = getPlatformConcepts();
    if (!keys.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="pdos-concept-banner">
        <p class="pdos-concept-banner-lead">Nesta fase trabalhas principalmente com:</p>
        <dl class="pdos-concept-list">
          ${keys.map((key) => {
            const c = concepts[key];
            if (!c) return '';
            return `
              <div class="pdos-concept-item">
                <dt>${escapeHtml(c.title)}</dt>
                <dd>
                  ${escapeHtml(c.short)}
                  ${c.example ? `<span class="pdos-concept-example">${escapeHtml(c.example)}</span>` : ''}
                </dd>
              </div>`;
          }).join('')}
        </dl>
      </div>`;
  }

  function renderPlatformGlossary() {
    const el = $('pdosPlatformGlossary');
    if (!el) return;
    const concepts = getPlatformConcepts();
    el.innerHTML = Object.entries(concepts).map(([, c]) => `
      <div class="pdos-glossary-item">
        <strong>${escapeHtml(c.title)}</strong>
        <p>${escapeHtml(c.short)}${c.example ? ` <em>${escapeHtml(c.example)}</em>` : ''}</p>
      </div>
    `).join('');
  }

  const pdosState = {
    moduleFilter: '',
    drawerOpen: false,
    drawerLevel: 1,
    selectedCapabilityId: '',
    selectedClusterId: '',
    pendingPromptRun: null,
  };

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
      <div class="pdos-header-grid">
        <div class="pdos-header-main">
          <p class="pdos-header-eyebrow">${escapeHtml(project.clientName || 'Cliente')}</p>
          <h2>${escapeHtml(project.name)}</h2>
          ${desc ? `<p class="pdos-header-desc">${escapeHtml(shortText(desc, 420))}</p>` : '<p class="pdos-header-desc muted-text">Sem descrição — adiciona contexto do projecto.</p>'}
          ${goals.length ? `<ul class="pdos-header-goals">${goals.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="pdos-header-side">
          <div class="pdos-header-meta">
            <span class="chip">${escapeHtml(project.status || 'active')}</span>
            <span class="chip accent">${escapeHtml(project.deliveryLevel || 'standard')}</span>
          </div>
          ${project.nextDecision ? `<p class="pdos-next-decision"><strong>Próxima decisão:</strong> ${escapeHtml(project.nextDecision)}</p>` : ''}
          <div class="pdos-header-actions">
            <button class="btn primary" id="pdosRelinkBtn" type="button" title="Reaplica de forma determinística as ligações entre ideia, requisitos, arquitetura, desenvolvimento e monitorização. Gera um log para revisão.">Reaplicar ligações entre fases</button>
            <button class="btn" id="pdosGenProposalBtn" type="button" title="Gera uma proposta comercial com estimativa a partir da arquitetura, requisitos e informação atual do projeto.">Gerar proposta comercial</button>
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
        renderStageConceptBanner(window.state.deliverySelectedStageId);
        renderCardFeed(project);
        renderTracePanel(project);
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
    const el = $('pdosStageGuidance');
    if (!el) return;
    const stageId = window.state?.deliverySelectedStageId || resolveProcessStageId(project, getStages(project));
    const stages = getStages(project);
    const idx = getStageOrder().indexOf(stageId);
    const focus = window.state?.config?.stageFocus?.[stageId] || '';
    const nextHint = window.state?.config?.stageNextHint?.[stageId] || '';
    const prev = idx > 0 ? stages[idx - 1] : null;
    const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;

    el.innerHTML = `
      <div class="pdos-guidance-grid">
        <div class="pdos-guidance-focus">
          <span class="pdos-section-label">Foco neste estágio</span>
          <p>${escapeHtml(focus)}</p>
        </div>
        <div class="pdos-guidance-next">
          <span class="pdos-section-label">Como proceder</span>
          <p>${escapeHtml(nextHint)}</p>
          <div class="pdos-guidance-actions">
            ${prev ? `<button type="button" class="btn tiny" data-transition-back="${escapeHtml(prev.id)}" data-transition-to="${escapeHtml(stageId)}">← Desde ${escapeHtml(prev.label)}</button>` : ''}
            ${next ? `<button type="button" class="btn tiny primary" data-transition-fwd="${escapeHtml(stageId)}" data-transition-to="${escapeHtml(next.id)}">Avançar → ${escapeHtml(next.label)}</button>` : ''}
          </div>
        </div>
      </div>
    `;

    el.querySelectorAll('[data-transition-fwd]').forEach((btn) => {
      btn.addEventListener('click', () => runStageTransition(btn.dataset.transitionFwd, btn.dataset.transitionTo, 'forward', project));
    });
    el.querySelectorAll('[data-transition-back]').forEach((btn) => {
      btn.addEventListener('click', () => runStageTransition(btn.dataset.transitionTo, btn.dataset.transitionBack, 'backward', project));
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

  function renderCurrentFocus(project) {
    const el = $('pdosCurrentFocus');
    if (!el) return;
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    const stages = getStages(project);
    const stage = stages.find((s) => s.id === stageId);
    const focus = window.state?.config?.stageFocus?.[stageId] || 'Avançar o projecto fase a fase';
    const pendingReviews = (project.humanReviews || []).filter((r) => r.status === 'pending').length;
    el.innerHTML = `
      <div class="pdos-focus-inner">
        <div class="pdos-focus-top">
          <span class="pdos-focus-label">A trabalhar agora</span>
          <strong class="pdos-focus-stage">${escapeHtml(stage?.label || stageId)}</strong>
        </div>
        <p class="pdos-focus-text">${escapeHtml(focus)}</p>
        ${pendingReviews ? `<span class="pdos-focus-badge">${pendingReviews} revisão(ões) pendente(s)</span>` : ''}
      </div>
    `;
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

  function isArchitectureArtifact(artifact) {
    const type = String(artifact?.type || '').toLowerCase();
    const stageId = String(artifact?.stageId || '').toLowerCase();
    return stageId === 'architecture'
      || type === 'architecture'
      || type === 'architecture_object'
      || type === 'data_entity'
      || type === 'api_endpoint';
  }

  function renderArchitectureFeed(project) {
    const arts = (project.artifacts || []).filter(isArchitectureArtifact);
    const pack = arts.find((a) => a.type === 'architecture');
    const objects = arts.filter((a) => a.type === 'architecture_object');
    const entities = arts.filter((a) => a.type === 'data_entity');
    const endpoints = arts.filter((a) => a.type === 'api_endpoint');
    const summary = project.technicalApproach?.architectureSummary;
    const mermaidSrc = project.technicalApproach?.architectureMermaid || pack?.metadata?.architectureMermaid || '';

    let html = `
      <article class="pdos-card pdos-arch-explorer">
        <h4>Explorador de arquitectura</h4>
        <p>Visão geral da aplicação — clique nos componentes ou requisitos para ir mais fundo.</p>
        ${summary ? `<p class="muted-text"><strong>Resumo:</strong> ${escapeHtml(summary)}</p>` : ''}
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" data-agent="requirements_to_architecture">Gerar pacote de arquitectura</button>
          <button type="button" class="btn tiny" data-goto-tab="requisitos">Ver requisitos</button>
          <button type="button" class="btn tiny" data-agent="diagram_to_requirements">Diagrama → Requisitos</button>
        </div>
      </article>
    `;

    if (mermaidSrc) {
      html += `
        <article class="pdos-card pdos-arch-diagram">
          <h4>Diagrama</h4>
          <div class="pdos-mermaid-wrap" data-render-mermaid="1"></div>
          <p class="muted-text">Referências a requisitos no diagrama são clicáveis quando aparecem como IDs (ex.: FR-01).</p>
        </article>
      `;
    }

    const archDocs = (project.documents || []).filter(
      (d) => (d.deliveryStageId || 'architecture') === 'architecture' || d.docType === 'diagram'
    );
    if (archDocs.length) {
      html += `
        <article class="pdos-card">
          <h4>Documentos e diagramas da fase</h4>
          <ul class="review-items">
            ${archDocs.map((d) => `
              <li>
                <button type="button" class="nav-link-btn" data-open-phase-doc="${escapeHtml(d.id)}">
                  ${escapeHtml(d.title || d.originalName)} <small class="muted-text">(${escapeHtml(d.docType || 'doc')})</small>
                </button>
              </li>
            `).join('')}
          </ul>
        </article>
      `;
    }

    if (!arts.length) {
      html += `<article class="pdos-card pdos-card-empty"><p>Sem arquitectura publicada. Submeta o output da IA e aprove a revisão humana.</p></article>`;
      return html;
    }

    html += `
      <article class="pdos-card pdos-card-summary">
        <h4>Resumo da arquitectura</h4>
        <div class="pdos-summary-grid">
          <div><strong>${objects.length || (pack?.metadata?.architectureObjects?.length || 0)}</strong><span>Componentes</span></div>
          <div><strong>${entities.length || (pack?.metadata?.dataEntities?.length || 0)}</strong><span>Entidades</span></div>
          <div><strong>${endpoints.length || (pack?.metadata?.apiEndpoints?.length || 0)}</strong><span>Endpoints</span></div>
        </div>
      </article>
    `;

    if (pack) {
      html += `
        <article class="pdos-card pdos-card-arch">
          <h4>${escapeHtml(pack.name)}</h4>
          <p>${escapeHtml(shortText(pack.description || pack.bodyMarkdown, 160))}</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny" data-open-artifact="${escapeHtml(pack.id)}">Ver pacote completo</button>
          </div>
        </article>
      `;
    }

    if (objects.length) {
      html += `<article class="pdos-card"><h4>Componentes / Serviços</h4><ul class="review-items arch-object-list">${objects.map((a) => {
        const reqLinks = formatRequirementLinks(a.relatedRequirementIds || a.metadata?.requirementIds);
        return `<li class="arch-object-item">
          <button type="button" class="arch-object-btn" data-open-artifact="${escapeHtml(a.id)}">
            <strong>${escapeHtml(a.name)}</strong>
            ${a.metadata?.componentType ? `<span class="muted-text">(${escapeHtml(a.metadata.componentType)})</span>` : ''}
          </button>
          ${reqLinks ? `<div class="arch-req-links">${reqLinks}</div>` : ''}
        </li>`;
      }).join('')}</ul></article>`;
    }
    if (entities.length) {
      html += `<article class="pdos-card"><h4>Entidades de dados</h4><ul class="review-items">${entities.map((a) => {
        const reqLinks = formatRequirementLinks(a.relatedRequirementIds || a.metadata?.requirementIds);
        return `<li><button type="button" class="arch-object-btn" data-open-artifact="${escapeHtml(a.id)}"><strong>${escapeHtml(a.name)}</strong></button>${reqLinks ? `<div class="arch-req-links">${reqLinks}</div>` : ''}</li>`;
      }).join('')}</ul></article>`;
    }
    if (endpoints.length) {
      html += `<article class="pdos-card"><h4>API Endpoints</h4><ul class="review-items">${endpoints.map((a) => {
        const reqLinks = formatRequirementLinks(a.relatedRequirementIds || a.metadata?.requirementIds);
        return `<li><button type="button" class="arch-object-btn" data-open-artifact="${escapeHtml(a.id)}"><code>${escapeHtml(a.name)}</code></button>${reqLinks ? `<div class="arch-req-links">${reqLinks}</div>` : ''}</li>`;
      }).join('')}${endpoints.length > 10 ? `<li class="muted-text">…</li>` : ''}</ul></article>`;
    }

    return html;
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

  function renderPhaseStatTile({ tab, label, count, stageId, hint, view }) {
    const empty = !count;
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

  function renderPhaseContentStrip(project, stageId) {
    const summary = window.PhaseContent?.getStageContentSummary(project, stageId);
    if (!summary) return '';
    const { counts } = summary;
    const tiles = [
      { tab: 'requisitos', label: 'Requisitos', count: counts.requirements },
      { tab: 'atas', label: 'Atas', count: counts.minutes },
      { tab: 'documentos', label: 'Anexos', count: counts.documents, view: 'uploads' },
      { tab: 'perguntas', label: 'Clarificações', count: counts.questions },
      { tab: 'documentos', label: 'Artefactos IA', count: counts.aiArtifacts, view: 'aiArtifacts' },
    ];
    return `
      <article class="pdos-card pdos-phase-content-card">
        <span class="pdos-section-label">Conteúdo desta fase</span>
        <p class="pdos-phase-content-hint muted-text">Clica num card para abrir a secção filtrada desta fase.</p>
        <div class="pdos-stat-tiles">
          ${tiles.map((t) => renderPhaseStatTile({ ...t, stageId })).join('')}
        </div>
      </article>
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

  function renderPhaseInlineContent(project, stageId) {
    const summary = window.PhaseContent?.getStageContentSummary(project, stageId);
    if (!summary) return '';
    const { items } = summary;
    const sections = [];

    const minuteRows = (items.minutes || []).map((m) => renderPhaseItemRow({
      id: m.id,
      kind: 'minute',
      title: m.title || `Ata ${(m.meetingDate || m.createdAt || '').slice(0, 10)}`,
      meta: (m.meetingDate || m.createdAt || '').slice(0, 10),
      currentStageId: window.PhaseContent.resolveMeetingStageId(m),
      project,
      canMove: true,
    })).join('');
    sections.push({ label: 'Atas', count: (items.minutes || []).length, body: minuteRows, addTab: 'atas' });

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
      <article class="pdos-card pdos-phase-inline-card">
        <span class="pdos-section-label">Conteúdo desta fase</span>
        <p class="muted-text pdos-phase-content-hint">Atas, documentos e perguntas vivem dentro da fase. Mudar a fase de uma ata ou documento move-o e passa a vê-lo apenas nessa fase.</p>
        ${sectionsHtml}
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

    let html = renderPhaseContentStrip(project, stageId);
    html += renderPhaseInlineContent(project, stageId);

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
          <p class="pdos-card-hint muted-text">Funcionalidade = o que o produto faz. Grupo = requisitos relacionados dentro dessa funcionalidade.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" data-agent="requirement_grouping" title="Agrupa requisitos soltos em funcionalidades e grupos">Agrupar requisitos com IA</button>
            <button type="button" class="btn tiny" data-agent="reverse_idea">Gerar resumo da ideia</button>
            <button type="button" class="btn tiny" data-unlinked-reqs>Ver sem funcionalidade</button>
          </div>
        </article>
      `;

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
        html += `
          <article class="pdos-card pdos-card-empty">
            <p>Sem funcionalidades ainda. Usa <strong>Agrupar requisitos com IA</strong> para organizar os requisitos em blocos de valor (ex.: Login, Pagamentos, Cupons).</p>
          </article>
        `;
      }
    } else if (stageId === 'architecture') {
      html += renderArchitectureFeed(project);
    } else if (stageId === 'idea') {
      html += `
        <article class="pdos-card">
          <h4>Resumo da ideia</h4>
          <div id="pdosIdeaBriefPreview" class="markdown-preview"></div>
          <p class="muted-text pdos-card-hint">Texto inicial: problema, utilizadores-alvo e âmbito do primeiro release.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" data-agent="reverse_idea">Gerar a partir dos requisitos</button>
          </div>
        </article>
      `;
    } else {
      html += `<article class="pdos-card"><h4>${escapeHtml(stageId)}</h4><p>${escapeHtml(window.state?.config?.stageFocus?.[stageId] || '')}</p></article>`;
    }

    const pendingReviews = (project.humanReviews || []).filter((r) => r.status === 'pending');
    if (pendingReviews.length) {
      html += `
        <article class="pdos-card pdos-card-review">
          <h4>Revisão humana (${pendingReviews.length})</h4>
          ${pendingReviews.slice(0, 3).map((r) => `
            <div class="review-item">
              <strong>${escapeHtml(r.title)}</strong>
              <p>${escapeHtml(shortText(r.summaryMarkdown, 100))}</p>
              <small>${r.readingTimeMinutes || 5} min leitura · ${r.decisionsCount || 0} alteração(ões)</small>
              <div class="pdos-card-actions">
                <button type="button" class="btn tiny primary" data-approve-review="${escapeHtml(r.id)}">Aprovar</button>
                <button type="button" class="btn tiny" data-view-review="${escapeHtml(r.id)}">Ver detalhes</button>
              </div>
            </div>
          `).join('')}
        </article>
      `;
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

    if (stageId === 'idea' && project.ideaBriefMarkdown) {
      renderMarkdownPreview(project.ideaBriefMarkdown, $('pdosIdeaBriefPreview'));
    }

    wireCardFeedEvents(project);
    renderMermaidInFeed();
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
        <p class="muted-text pdos-drawer-hint">Cada grupo reúne requisitos relacionados dentro desta funcionalidade.</p>
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
    $('pdosDetailDrawer')?.classList.add('hidden');
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

  async function runAgent(agentType, project) {
    try {
      const body = { agentType, stageId: window.state?.deliverySelectedStageId };
      if (agentType === 'requirements_to_architecture') {
        const cap = (project.capabilities || [])[0];
        body.capabilityId = cap?.id;
        body.moduleTag = 'Backend';
      }
      const res = await apiRequest(`/projects/${project.id}/prompt-runs`, { method: 'POST', body });
      pdosState.pendingPromptRun = res.promptRun;
      openPromptWorkbench(res);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function openPromptWorkbench(res) {
    const modal = $('pdosPromptWorkbench');
    if (!modal) return;
    modal.classList.remove('hidden');
    $('pdosPromptSummary').textContent = res.promptRun?.summaryMarkdown || 'Prompt gerado.';
    $('pdosPromptRaw').value = res.prompt || '';
    $('pdosPromptOutput').value = '';
    $('pdosPromptRunId').value = res.promptRun?.id || '';
  }

  function closePromptWorkbench() {
    $('pdosPromptWorkbench')?.classList.add('hidden');
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
      await reloadProject(project.id);
      if (status !== 'approved') closeDrawer();
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
    content.innerHTML = `
      <div class="pdos-drawer-head">
        <h3>${escapeHtml(review.title)}</h3>
        <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
      </div>
      <p class="review-summary">${escapeHtml(review.summaryMarkdown)}</p>
      ${promptRun ? `<p class="muted-text">Agente: <strong>${escapeHtml(promptRun.agentType)}</strong> · ${escapeHtml(promptRun.targetOutput || '')}</p>` : ''}
      <details class="collapsible" open>
        <summary>Detalhes técnicos (${review.decisionsCount || 0} alteração(ões))</summary>
        <div id="pdosReviewSections" class="review-sections">${renderReviewSectionsHtml(review, promptRun)}</div>
      </details>
      ${review.bodyMarkdown ? `<details class="collapsible"><summary>Resumo em markdown</summary><div id="pdosReviewMarkdown" class="markdown-preview"></div></details>` : ''}
      <div class="pdos-card-actions">
        ${review.status === 'pending' ? `
          <button type="button" class="btn primary" data-approve-review="${escapeHtml(review.id)}">Aprovar e aplicar</button>
          <button type="button" class="btn" data-reject-review="${escapeHtml(review.id)}">Pedir alterações</button>
        ` : `<span class="chip">${escapeHtml(review.status)}</span>`}
      </div>
    `;

    if (review.bodyMarkdown) {
      await renderMarkdownPreview(review.bodyMarkdown, $('pdosReviewMarkdown'));
    }

    content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
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
    renderStageConceptBanner(stageId);
    renderModuleNav();
    renderCardFeed(project);
    renderPlatformGlossary();
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
    pdosState,
  };
  window.refreshTraceMap = () => loadTraceMap(window.state?.selectedProject?.id);
})();
