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
        { title: 'Ligar a plataforma', text: 'Em Definições da plataforma: ligue a conta GitHub, active um modelo e, se quiser, a entrada com Google.', tab: 'definicoesPlataforma' },
        { title: 'Criar um projecto', text: 'Em Projetos → Novo projecto. Depois, em Definições do projecto, ligue o repositório — de preferência com cópia local.', tab: 'projetos' },
        { title: 'Pôr o projecto no repositório', text: 'Em Resumo, cartão Documentação: se já há código, «Levantar o código»; depois «Criar pasta yourlab». O yourlab/GUIDE.md explica a qualquer IA como escrever os ficheiros.', tab: 'projeto' },
        { title: 'Escrever os artefactos', text: 'Em Artefactos: escolha um ficheiro, edite e Guardar. Fica no repositório e deixa uma tarefa. «Analisar impacto com IA» diz o que mais foi afectado.', tab: 'plano' },
        { title: 'Dos requisitos ao código', text: 'Em Requisitos, arrumados por tipo. Num requisito: «Gerar testes» → escrever → «Gerar o código» → escrever → «Os artefactos ainda dizem o mesmo?». Nada é escrito sem carregar em escrever.', tab: 'requisitos' },
        { title: 'Trabalhar as tarefas', text: 'Em Tarefas. Uma tarefa grande de mais: «Dividir em tarefas pequenas».', tab: 'tarefas' },
        { title: 'Todos os dias: Hoje', text: 'O que espera por si em todos os projectos — tarefas a rever e o que falhou.', tab: 'hoje' },
        { title: 'Dar acesso a pessoas', text: 'Contas novas, incluindo as de Google, aparecem em Definições da plataforma → Contas. O acesso a cada projecto dá-se em Definições do projecto → Quem pode aceder.', tab: 'definicoesPlataforma' },
      ],
      note: 'Os botões de IA precisam do Agent Runtime ligado e de um modelo activo (Definições da plataforma).',
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

  /** Opens the first steps once per person, on their first login in this browser. */
  function openFirstUse(user) {
    if (!user?.id) return;
    const key = `yourlab-first-use:${user.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      return; // no storage: better never than every time
    }
    openPlatformHelp();
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
  }

  window.HelpUI = {
    helpIconSvg,
    openPlatformHelp,
    openFirstUse,
    openPhaseHelp,
    closeHelpDrawer,
    wireHelpEvents,
  };
})();
