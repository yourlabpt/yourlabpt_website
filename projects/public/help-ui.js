/**
 * Ajuda: primeiros passos por tipo de conta (topbar «?», e Conta no telemóvel), e a
 * ajuda por fase que o ecrã antigo de entrega ainda usa.
 */
(function () {
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

  /**
   * First steps, one walkthrough per kind of login. Each step says what to do and where,
   * and its button goes there. Written for someone opening the platform for the first
   * time; it opens by itself once, and stays under «?» (and under Conta on a phone).
   */
  const FIRST_STEPS = {
    super_admin: {
      role: 'Administrador',
      lead: 'Tem acesso a tudo: a plataforma, todos os projectos e as ferramentas de engenharia.',
      steps: [
        { title: 'Ligar a plataforma', text: 'Em Definições da plataforma: ligue a conta GitHub, cole a chave da DeepInfra e, se quiser, active a entrada com Google.', tab: 'definicoesPlataforma' },
        { title: 'Criar um projecto', text: 'Em Projetos → Novo projecto. Depois, em Definições do projecto, ligue o repositório — de preferência com cópia local.', tab: 'projetos' },
        { title: 'Pôr o projecto no repositório', text: 'Em Resumo, cartão Documentação: se já há código, «Levantar o código»; depois «Criar pasta yourlab». O yourlab/GUIDE.md explica a qualquer IA como escrever os ficheiros.', tab: 'projeto' },
        { title: 'Preencher a partir do código', text: 'Em Artefactos, «Criar tarefas de IA»: um passo por artefacto (propósito, requisitos por módulo, base de dados, workflows, arquitectura, fases). Em cada um, «Executar com IA», rever e «Escrever».', tab: 'plano' },
        { title: 'Escrever os artefactos', text: 'Em Artefactos: escolha um ficheiro, edite e Guardar. Fica no repositório e deixa uma tarefa. «Analisar impacto com IA» diz o que mais foi afectado.', tab: 'plano' },
        { title: 'Dos requisitos ao código', text: 'Em Requisitos, arrumados por tipo. Num requisito: «Gerar testes» → escrever → «Gerar o código» → escrever → «Os artefactos ainda dizem o mesmo?». Nada é escrito sem carregar em escrever.', tab: 'requisitos' },
        { title: 'Trabalhar as tarefas', text: 'Em Tarefas. Uma tarefa grande de mais: «Dividir em tarefas pequenas».', tab: 'tarefas' },
        { title: 'Todos os dias: Hoje', text: 'O que espera por si em todos os projectos — tarefas a rever e o que falhou.', tab: 'hoje' },
        { title: 'Dar acesso a pessoas', text: 'Contas novas, incluindo as de Google, aparecem em Definições da plataforma → Contas. O acesso a cada projecto dá-se em Definições do projecto → Quem pode aceder.', tab: 'definicoesPlataforma' },
      ],
      note: 'Os botões de IA precisam da chave da DeepInfra (Definições da plataforma → IA).',
    },
    partner: {
      role: 'Parceiro',
      lead: 'Trabalha nos projectos a que tem acesso: artefactos, requisitos, testes, código e tarefas.',
      steps: [
        { title: 'Os seus projectos', text: 'Em Projetos vê os projectos a que o administrador lhe deu acesso.', tab: 'projetos' },
        { title: 'Todos os dias: Hoje', text: 'O que espera por si — tarefas a rever e o que falhou.', tab: 'hoje' },
        { title: 'Escrever os artefactos', text: 'Em Artefactos: escolha um ficheiro, edite e Guardar. Fica no repositório e deixa uma tarefa. «Analisar impacto com IA» diz o que mais foi afectado.', tab: 'plano' },
        { title: 'Dos requisitos ao código', text: 'Em Requisitos, por tipo: «Gerar testes» → «Gerar o código» → «Os artefactos ainda dizem o mesmo?». Nada é escrito sem carregar em escrever.', tab: 'requisitos' },
        { title: 'Trabalhar as tarefas', text: 'Em Tarefas. Uma tarefa grande de mais: «Dividir em tarefas pequenas».', tab: 'tarefas' },
        { title: 'A sua conta', text: 'Em Conta: os seus dados e a sua password.', tab: 'conta' },
      ],
      note: 'Ligar repositórios, criar a pasta yourlab e as definições da plataforma são do administrador.',
    },
    client: {
      role: 'Cliente',
      lead: 'Acompanha os seus projectos: onde estão, para que servem e como vão ficar.',
      steps: [
        { title: 'Os seus projectos', text: 'Em Projetos vê os projectos a que tem acesso. Se entrou com Google pela primeira vez e não vê nenhum, o administrador ainda lhe vai dar acesso.', tab: 'projetos' },
        { title: 'O resumo de cada projecto', text: 'Em que etapa está, para que serve a aplicação, as fases e as perguntas que esperam uma resposta sua.', tab: 'projeto' },
        { title: 'Ver o mockup', text: 'No Resumo, «Ver mockup» mostra os ecrãs da aplicação como vão ficar.', tab: 'projeto' },
        { title: 'A sua conta', text: 'Em Conta: os seus dados e a sua password. No telemóvel, está no separador Definições.', tab: 'conta' },
      ],
      note: 'Tem uma resposta ou uma dúvida sobre o projecto? Fale com o seu contacto na YourLab.',
    },
  };

  function firstStepsFor(role) {
    return FIRST_STEPS[role] || FIRST_STEPS.client;
  }

  function renderPlatformHelp() {
    const guide = firstStepsFor(window.state?.user?.role);
    return `
      <section class="help-section">
        <p class="help-section-lead">${escapeHtml(guide.lead)}</p>
        <div class="ios-card-actions"><button type="button" class="btn primary" data-help-tour>Ver o tutorial guiado</button></div>
        <div class="ios-list">
          ${guide.steps.map((step, index) => `
            <div class="ios-row is-static">
              <span class="ios-row-index">${index + 1}</span>
              <span class="ios-row-main">
                <span class="ios-row-title">${escapeHtml(step.title)}</span>
                <span class="ios-row-sub ios-wrap">${escapeHtml(step.text)}</span>
              </span>
              ${step.tab ? `<button type="button" class="btn tiny help-goto" data-help-tab="${escapeHtml(step.tab)}">Ir</button>` : ''}
            </div>`).join('')}
        </div>
        ${guide.note ? `<p class="ios-footnote">${escapeHtml(guide.note)}</p>` : ''}
      </section>`;
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
        if (!stage && !view) {
          window.switchToTab?.(tab);
          return;
        }
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
      eyebrow: firstStepsFor(window.state?.user?.role).role,
      title: 'Primeiros passos',
      html: renderPlatformHelp(),
    });
  }

  /* ------------------------------------------------------------ guided tour */

  // One step at a time: the page opens, the place is lit, a card says what to do there.
  const tour = { guide: null, index: 0, spot: null, card: null };

  function tourTarget(step) {
    if (!step?.tab) return null;
    const candidates = [
      ...document.querySelectorAll(`[data-nav-tab="${step.tab}"]`),
      ...document.querySelectorAll(`[data-mobile-tab="${step.tab}"]`),
    ];
    return candidates.find((node) => node.getClientRects().length && !node.closest('[hidden]')) || null;
  }

  function placeTour() {
    const { spot, card } = tour;
    if (!spot || !card) return;
    const target = tourTarget(tour.guide.steps[tour.index - 1]);
    if (!target) {
      spot.hidden = true;
      card.classList.add('is-centered');
      card.style.left = '';
      card.style.top = '';
      return;
    }
    target.scrollIntoView({ block: 'nearest' });
    const rect = target.getBoundingClientRect();
    Object.assign(spot.style, { left: `${rect.left - 4}px`, top: `${rect.top - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
    spot.hidden = false;
    card.classList.remove('is-centered');
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    // Beside the target when there is room (sidebar), otherwise above or below it (tab bar).
    let left = rect.right + 16;
    let top = rect.top;
    if (left + width > window.innerWidth - 16) {
      left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
      top = rect.top > height + 24 ? rect.top - height - 16 : rect.bottom + 16;
    }
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(16, Math.min(top, window.innerHeight - height - 16))}px`;
  }

  function paintTour() {
    const { guide, index, card } = tour;
    const total = guide.steps.length;
    // Index 0 is the welcome; steps are 1..total; total+1 is the closing note.
    const step = index >= 1 && index <= total ? guide.steps[index - 1] : null;
    if (step?.tab && tourTarget(step)) window.switchToTab?.(step.tab);
    const title = index === 0 ? `Bem-vindo · ${guide.role}` : step ? step.title : 'Está pronto';
    const text = index === 0 ? guide.lead : step ? step.text : (guide.note || 'Pode rever estes passos a qualquer momento em «?».');
    card.innerHTML = `
      <p class="tour-count">${index === 0 ? 'Primeiros passos' : step ? `Passo ${index} de ${total}` : 'Fim'}</p>
      <h3 class="tour-title">${escapeHtml(title)}</h3>
      <p class="tour-text">${escapeHtml(text)}</p>
      ${step?.tab && !tourTarget(step) ? '<p class="tour-hint">Abra um projecto para ver este sítio.</p>' : ''}
      <div class="tour-actions">
        ${index > 0 ? '<button type="button" class="btn" data-tour="back">Anterior</button>' : '<button type="button" class="btn" data-tour="close">Agora não</button>'}
        <button type="button" class="btn primary" data-tour="next">${index === 0 ? 'Começar' : step ? 'Seguinte' : 'Concluir'}</button>
      </div>
      ${index > 0 && step ? '<button type="button" class="tour-skip" data-tour="close">Sair do tutorial</button>' : ''}`;
    requestAnimationFrame(placeTour);
    card.querySelector('[data-tour="next"]')?.focus();
  }

  function closeTour() {
    tour.spot?.remove();
    tour.card?.remove();
    Object.assign(tour, { spot: null, card: null });
    window.removeEventListener('resize', placeTour);
    document.removeEventListener('keydown', tourKeys, true);
  }

  function tourKeys(event) {
    if (event.key === 'Escape') { event.stopPropagation(); closeTour(); }
    if (event.key === 'ArrowRight') tourMove(1);
    if (event.key === 'ArrowLeft') tourMove(-1);
  }

  function tourMove(delta) {
    const next = tour.index + delta;
    if (next < 0) return;
    if (next > tour.guide.steps.length + 1) { closeTour(); return; }
    tour.index = next;
    paintTour();
  }

  function startTour() {
    closeHelpDrawer();
    closeTour();
    tour.guide = firstStepsFor(window.state?.user?.role);
    tour.index = 0;
    tour.spot = Object.assign(document.createElement('div'), { className: 'tour-spot', hidden: true });
    tour.card = Object.assign(document.createElement('div'), { className: 'tour-card is-centered' });
    tour.card.setAttribute('role', 'dialog');
    tour.card.setAttribute('aria-label', 'Tutorial');
    tour.card.addEventListener('click', (event) => {
      const action = event.target.closest('[data-tour]')?.dataset.tour;
      if (action === 'next') tourMove(1);
      else if (action === 'back') tourMove(-1);
      else if (action === 'close') closeTour();
    });
    document.body.append(tour.spot, tour.card);
    window.addEventListener('resize', placeTour);
    document.addEventListener('keydown', tourKeys, true);
    paintTour();
  }

  /** Starts the guided tour once per person, on their first login in this browser. */
  function openFirstUse(user) {
    if (!user?.id) return;
    const key = `yourlab-first-use:${user.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      return; // no storage: better never than every time
    }
    startTour();
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
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-help-tour]')) startTour();
    });
    $('helpDrawerClose')?.addEventListener('click', closeHelpDrawer);
    $('helpDrawerOverlay')?.addEventListener('click', closeHelpDrawer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('helpDrawer')?.classList.contains('hidden')) {
        closeHelpDrawer();
      }
    });
  }

  window.HelpUI = {
    helpIconSvg,
    openPlatformHelp,
    openFirstUse,
    startTour,
    openPhaseHelp,
    closeHelpDrawer,
    wireHelpEvents,
  };
})();
