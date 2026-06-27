/**
 * Ajuda contextual — conceitos da plataforma (topbar) e por fase (Linha de Entrega).
 */
(function () {
  const PLATFORM_INTRO = [
    'Selecciona um projecto e trabalha na Linha de Entrega, fase a fase.',
    'Requisitos, documentos e atas ficam ligados à fase onde os criaste.',
    'Usa os contadores e cartões para abrir detalhes — a ajuda completa está aqui.',
  ];

  const CONCEPT_LINKS = {
    capability: { tab: 'deliveryos', label: 'Ver funcionalidades na Linha de Entrega' },
    cluster: { tab: 'deliveryos', label: 'Ver grupos na Linha de Entrega' },
    requirement: { tab: 'requisitos', label: 'Abrir requisitos' },
    architecturePack: { tab: 'deliveryos', label: 'Ver arquitectura na Linha de Entrega' },
    module: { tab: 'deliveryos', label: 'Filtrar por módulo técnico' },
    humanReview: { tab: 'deliveryos', label: 'Revisões pendentes' },
    artifact: { tab: 'documentos', label: 'Ver documentos e artefactos IA' },
    traceLink: { tab: 'deliveryos', label: 'Mapa de ligações' },
    stage: { tab: 'deliveryos', label: 'Linha de entrega' },
    promptRun: { tab: 'deliveryos', label: 'Agentes na Linha de Entrega' },
    snapshot: { tab: 'definicoes', label: 'Definições do projecto' },
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function helpIconSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.3 1.8c0 1.8-2.8 2-2.8 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor"/></svg>`;
  }

  function getConcepts() {
    return window.state?.config?.platformConcepts || {};
  }

  function renderConceptBlock(key, concept, { compact = false } = {}) {
    if (!concept) return '';
    const link = CONCEPT_LINKS[key];
    const detailParts = [concept.short];
    if (concept.example) detailParts.push(`Exemplo: ${concept.example}`);
    const detail = detailParts.join('\n\n');

    if (compact) {
      return `
        <details class="help-concept">
          <summary><strong>${escapeHtml(concept.title)}</strong> — ${escapeHtml(concept.short)}</summary>
          <div class="help-concept-body">
            ${concept.example ? `<p><em>${escapeHtml(concept.example)}</em></p>` : ''}
            ${link ? `<button type="button" class="btn tiny ghost help-goto" data-help-tab="${escapeHtml(link.tab)}">${escapeHtml(link.label)} →</button>` : ''}
          </div>
        </details>`;
    }

    return `
      <details class="help-concept">
        <summary><strong>${escapeHtml(concept.title)}</strong></summary>
        <div class="help-concept-body">
          <p>${escapeHtml(concept.short)}</p>
          ${concept.example ? `<p class="help-example"><strong>Exemplo:</strong> ${escapeHtml(concept.example)}</p>` : ''}
          ${link ? `<button type="button" class="btn tiny ghost help-goto" data-help-tab="${escapeHtml(link.tab)}">${escapeHtml(link.label)} →</button>` : ''}
        </div>
      </details>`;
  }

  function renderPlatformHelp() {
    const concepts = getConcepts();
    const explore = [
      { tab: 'projetos', label: 'Projectos', hint: 'Escolher ou criar projecto' },
      { tab: 'deliveryos', label: 'Linha de entrega', hint: 'Fases e conteúdo do projecto' },
      { tab: 'requisitos', label: 'Requisitos', hint: 'Lista completa agrupada' },
      { tab: 'definicoes', label: 'Definições', hint: 'Utilizadores e configuração avançada' },
    ];

    return `
      <section class="help-section">
        <h3 class="help-section-title">Como funciona</h3>
        <ul class="help-bullets">${PLATFORM_INTRO.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </section>
      <section class="help-section">
        <h3 class="help-section-title">Conceitos da plataforma</h3>
        <p class="help-section-lead">Clique num conceito para ler a explicação completa e ir ao sítio certo.</p>
        <div class="help-concept-list">
          ${Object.entries(concepts).map(([key, c]) => renderConceptBlock(key, c)).join('')}
        </div>
      </section>
      <section class="help-section">
        <h3 class="help-section-title">Explorar</h3>
        <div class="help-link-grid">
          ${explore.map((item) => `
            <button type="button" class="help-link-card help-goto" data-help-tab="${escapeHtml(item.tab)}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.hint)}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function getStageLabel(stageId, project) {
    const flow = window.state?.config?.deliveryStageFlow || [];
    const fromProject = (project?.stages || []).find((s) => s.id === stageId);
    const fromFlow = flow.find((s) => s.id === stageId);
    return fromProject?.label || fromFlow?.label || stageId;
  }

  function renderPhaseHelp(project, stageId) {
    const sid = stageId || window.state?.deliverySelectedStageId || 'requirements';
    const focus = window.state?.config?.stageFocus?.[sid] || '';
    const nextHint = window.state?.config?.stageNextHint?.[sid] || '';
    const conceptKeys = window.state?.config?.stageConceptKeys?.[sid] || [];
    const concepts = getConcepts();
    const tabLinks = window.state?.config?.stageTabLinks?.[sid] || [];
    const summary = window.PhaseContent?.getStageContentSummary(project, sid);
    const counts = summary?.counts || {};
    const stageName = getStageLabel(sid, project);

    const contentTiles = [
      { key: 'requirements', tab: 'requisitos', label: 'Requisitos', count: counts.requirements },
      { key: 'minutes', tab: 'atas', label: 'Atas', count: counts.minutes },
      { key: 'documents', tab: 'documentos', label: 'Anexos', count: counts.documents },
      { key: 'questions', tab: 'perguntas', label: 'Perguntas', count: counts.questions },
      { key: 'aiArtifacts', tab: 'documentos', view: 'aiArtifacts', label: 'Artefactos IA', count: counts.aiArtifacts },
    ].filter((t) => t.count > 0);

    return `
      <section class="help-section">
        <h3 class="help-section-title">${escapeHtml(stageName)}</h3>
        ${focus ? `<p class="help-lead">${escapeHtml(focus)}</p>` : ''}
      </section>
      ${nextHint ? `
        <section class="help-section">
          <details class="help-concept" open>
            <summary><strong>Próximo passo sugerido</strong></summary>
            <div class="help-concept-body"><p>${escapeHtml(nextHint)}</p></div>
          </details>
        </section>
      ` : ''}
      ${conceptKeys.length ? `
        <section class="help-section">
          <h3 class="help-section-title">Conceitos desta fase</h3>
          <div class="help-concept-list">
            ${conceptKeys.map((key) => renderConceptBlock(key, concepts[key], { compact: true })).join('')}
          </div>
        </section>
      ` : ''}
      ${contentTiles.length ? `
        <section class="help-section">
          <h3 class="help-section-title">Conteúdo nesta fase</h3>
          <div class="help-link-grid">
            ${contentTiles.map((t) => `
              <button type="button" class="help-link-card help-goto"
                data-help-tab="${escapeHtml(t.tab)}"
                data-help-stage="${escapeHtml(sid)}"
                ${t.view ? `data-help-view="${escapeHtml(t.view)}"` : ''}>
                <strong>${escapeHtml(t.label)}</strong>
                <span>${t.count} item(ns) · abrir filtrado</span>
              </button>
            `).join('')}
          </div>
        </section>
      ` : ''}
      ${tabLinks.length ? `
        <section class="help-section">
          <h3 class="help-section-title">Onde trabalhar</h3>
          <div class="help-link-grid">
            ${tabLinks.map((link) => `
              <button type="button" class="help-link-card help-goto"
                data-help-tab="${escapeHtml(link.tab)}"
                data-help-stage="${escapeHtml(sid)}">
                <strong>${escapeHtml(link.label)}</strong>
                <span>${escapeHtml(link.hint || '')}</span>
              </button>
            `).join('')}
          </div>
        </section>
      ` : ''}
    `;
  }

  function wireHelpDrawerContent(container) {
    container?.querySelectorAll('.help-goto').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.helpTab;
        const stage = btn.dataset.helpStage || '';
        const view = btn.dataset.helpView || '';
        closeHelpDrawer();
        if (stage) window.state.deliverySelectedStageId = stage;
        if (tab === 'deliveryos') {
          window.switchToTab?.('deliveryos');
          if (window.state?.selectedProject && window.PdosUI?.renderAll) {
            window.PdosUI.renderAll(window.state.selectedProject);
          }
          return;
        }
        window.navigateToFilteredTab?.(tab, {
          deliveryStageId: stage,
          contentView: view,
        });
      });
    });
  }

  function openHelpDrawer({ eyebrow, title, html }) {
    const drawer = $('helpDrawer');
    const content = $('helpDrawerContent');
    if (!drawer || !content) return;
    $('helpDrawerEyebrow').textContent = eyebrow || '';
    $('helpDrawerTitle').textContent = title || 'Ajuda';
    content.innerHTML = html || '';
    wireHelpDrawerContent(content);
    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('help-drawer-open');
  }

  function closeHelpDrawer() {
    const drawer = $('helpDrawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('help-drawer-open');
  }

  function openPlatformHelp() {
    openHelpDrawer({
      eyebrow: 'YourLab · Projects Platform',
      title: 'Ajuda da plataforma',
      html: renderPlatformHelp(),
    });
  }

  function openPhaseHelp(project) {
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    openHelpDrawer({
      eyebrow: 'Linha de entrega',
      title: `Ajuda — ${getStageLabel(stageId, project)}`,
      html: renderPhaseHelp(project, stageId),
    });
  }

  function wireHelpEvents() {
    $('platformHelpBtn')?.addEventListener('click', () => openPlatformHelp());
    $('helpDrawerClose')?.addEventListener('click', closeHelpDrawer);
    $('helpDrawerOverlay')?.addEventListener('click', closeHelpDrawer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('helpDrawer')?.classList.contains('hidden')) {
        closeHelpDrawer();
      }
    });
    document.addEventListener('click', (event) => {
      const phaseBtn = event.target.closest('#pdosPhaseHelpBtn');
      if (phaseBtn && window.state?.selectedProject) {
        openPhaseHelp(window.state.selectedProject);
      }
    });
  }

  window.HelpUI = {
    helpIconSvg,
    openPlatformHelp,
    openPhaseHelp,
    closeHelpDrawer,
    wireHelpEvents,
  };
})();
