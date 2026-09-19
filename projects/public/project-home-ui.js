/**
 * Resumo — the project's home.
 *
 * Opening a project answers where it stands before anything else: which stage, what the
 * Execução is doing right now and what it has cost, what failed or waits, and the plan.
 * On a phone the same page also lists the project's sections, because there is no
 * sidebar to hold them.
 *
 * Read-only. Every action here is a way through to the screen that owns it.
 */
(function initProjectHomeUi() {
  const state = {
    project: null,
    orchestration: null,
    error: '',
    loading: false,
    requestSeq: 0,
  };

  const KIND_LABELS = { construcao: 'Construção', levantamento: 'Levantamento', refinamento: 'Refinamento' };

  function kit() { return window.IosKit; }

  function truncate(text, max) {
    const value = String(text || '').trim();
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
  }

  function firstSentence(text, max) {
    const sentence = String(text || '').split(/(?<=[.!?])\s/)[0] || '';
    return truncate(sentence, max);
  }

  function money(value, currency) {
    return kit().money(value, currency);
  }

  function duration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    if (!hours) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------ parts */

  function header(project, entry, stage) {
    const k = kit();
    const snap = window.WorkspaceUI?.forProject?.(project.id);
    // What the app is for, from the repository when it says so.
    const about = firstSentence(snap?.project?.purpose || project.description, 90);
    const subtitle = [project.clientName, about].filter(Boolean).join(' · ');
    return `
      <header class="ios-page-head">
        <div>
          <h1 class="ios-large-title">${k.escapeHtml(project.name)}</h1>
          ${subtitle ? `<p class="ios-subtitle ios-desktop-only">${k.escapeHtml(subtitle)}</p>` : ''}
          <p class="ios-subtitle ios-mobile-only">${k.escapeHtml([project.clientName, k.stageText(stage)].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="ios-page-actions">${k.projectStatusBadge(project, entry)}</div>
      </header>`;
  }

  function stageTrack(project, stage) {
    const k = kit();
    const stages = Array.isArray(project.stages) && project.stages.length
      ? project.stages
      : (window.state?.config?.deliveryStageFlow || []);
    if (!stages.length) return '';
    const current = stage?.index ?? -1;
    return `
      <div class="ios-stage-track" style="--stages: ${stages.length}">
        ${stages.map((entry, index) => `
          <div class="ios-stage ${index < current ? 'is-done' : index === current ? 'is-current' : ''}">
            <span class="ios-stage-bar"></span>
            <span class="ios-stage-label">${k.escapeHtml(k.stageLabel(entry.id))}</span>
          </div>`).join('')}
      </div>`;
  }

  function executionCard() {
    const k = kit();
    const data = state.orchestration;

    if (!data) {
      const text = state.loading ? 'A ler a execução…' : (state.error || 'Não foi possível ler a execução.');
      return `<section class="ios-card ios-exec"><p class="ios-empty">${k.escapeHtml(text)}</p></section>`;
    }

    const execucao = data.execucao;
    if (!execucao) {
      return `
        <section class="ios-card ios-exec">
          <div class="ios-exec-head">
            <span class="ios-row-main">
              <span class="ios-exec-title">Sem execução em curso</span>
              <span class="ios-row-sub">${k.escapeHtml(data.blockedReason || 'Pode começar uma nova execução a partir de Tarefas.')}</span>
            </span>
            <button type="button" class="btn primary" data-nav-go="tarefas">Abrir Tarefas</button>
          </div>
        </section>`;
    }

    const history = Array.isArray(execucao.history) ? execucao.history : [];
    const lastRun = (personaId) => [...history].reverse().find((run) => run.personaId === personaId) || null;
    const waitingId = execucao.status === 'waiting_human' ? execucao.question?.personaId : '';

    // Where each persona stands. Drawn twice: as a list on a wide screen, and as a
    // segmented bar with one sentence on a phone.
    const steps = (data.chain || []).map((persona) => {
      const run = lastRun(persona.id);
      if (persona.id === execucao.currentPersonaId) return { persona, status: 'current', sub: '' };
      if (persona.id === waitingId) return { persona, status: 'waiting', sub: execucao.question?.text || '' };
      if (run?.outcome === 'failed' && execucao.status === 'halted') {
        return { persona, status: 'failed', sub: execucao.haltReason || run.summary || 'Falhou' };
      }
      if (run?.outcome === 'completed') return { persona, status: 'done', sub: run.summary || 'Concluído' };
      return { persona, status: 'next', sub: '' };
    });

    const stepList = steps.map(({ persona, status, sub }) => {
      const trailing = status === 'current'
        ? k.badge('green', 'A correr')
        : status === 'waiting' ? k.badge('amber', 'À espera de si') : '';
      return `
        <li class="ios-step is-${status}">
          <span class="ios-step-mark">${status === 'done' ? k.icon('check', 14) : ''}</span>
          <span class="ios-row-main">
            <span class="ios-row-title">${k.escapeHtml(persona.label)}</span>
            ${sub ? `<span class="ios-row-sub">${k.escapeHtml(truncate(sub, 90))}</span>` : ''}
          </span>
          ${trailing}
        </li>`;
    }).join('');

    const budget = execucao.budget || {};
    const spent = Number(budget.spentUsd) || 0;
    const costCap = Number(budget.maxCostUsd) || 0;
    const seconds = Number(budget.elapsedSeconds) || 0;
    const hoursCap = Number(budget.maxHours) || 0;
    const costText = money(spent, budget.currency);
    const costCapText = costCap ? money(costCap, budget.currency) : 'sem limite';
    const timeText = duration(seconds);
    const timeCapText = hoursCap ? `${hoursCap} h` : 'sem limite';
    const meter = (label, value, cap, pct) => `
      <div class="ios-meter">
        <div class="ios-meter-head"><span>${label}</span><span><strong>${k.escapeHtml(value)}</strong> de ${k.escapeHtml(cap)}</span></div>
        <div class="ios-meter-bar"><span class="${pct >= 80 ? 'is-high' : ''}" style="width: ${Math.min(100, Math.round(pct))}%"></span></div>
      </div>`;

    const statusBadge = {
      running: k.badge('green', 'A correr'),
      waiting_human: k.badge('amber', 'À espera de si'),
      halted: k.badge('red', 'Parada'),
      paused_budget: k.badge('amber', 'Sem orçamento'),
    }[execucao.status] || '';

    const answer = execucao.status === 'waiting_human' && execucao.question
      ? `<button type="button" class="btn primary" data-nav-go="${k.describeQuestion(execucao.question).tab}">Responder</button>`
      : '';
    const headAction = answer || (execucao.status === 'halted' || execucao.status === 'paused_budget' ? statusBadge : '');

    const active = steps.find((step) => step.status !== 'done' && step.status !== 'next');
    const sentence = [active?.persona.label, execucao.goal].filter(Boolean).join(' · ');
    const started = execucao.startedAt ? `Começou ${k.ago(execucao.startedAt)}` : '';

    return `
      <section class="ios-card ios-exec">
        <div class="ios-exec-full">
          <div class="ios-exec-head">
            <span class="ios-row-main">
              <span class="ios-exec-title">Execução · ${k.escapeHtml(KIND_LABELS[execucao.kind] || 'Construção')}</span>
              <span class="ios-row-sub">${k.escapeHtml([started, execucao.goal].filter(Boolean).join(' · '))}</span>
            </span>
            ${headAction}
          </div>
          ${stepList ? `<ol class="ios-steps">${stepList}</ol>` : ''}
          <div class="ios-meters">
            ${meter('Custo', costText, costCapText, costCap ? (spent / costCap) * 100 : 0)}
            ${meter('Tempo', timeText, timeCapText, hoursCap ? (seconds / (hoursCap * 3600)) * 100 : 0)}
          </div>
        </div>
        <div class="ios-exec-compact">
          <div class="ios-exec-compact-head"><span class="ios-card-title">Execução</span>${statusBadge}</div>
          ${steps.length ? `<div class="ios-chain-dots" aria-hidden="true">${steps.map((step) => `<span class="is-${step.status}"></span>`).join('')}</div>` : ''}
          ${sentence ? `<p class="ios-exec-sentence">${k.escapeHtml(sentence)}</p>` : ''}
          <div class="ios-exec-figures"><span>${k.escapeHtml(costText)} de ${k.escapeHtml(costCapText)}</span><span>${k.escapeHtml(timeText)} de ${k.escapeHtml(timeCapText)}</span></div>
          ${answer}
        </div>
      </section>`;
  }

  function attention(entry) {
    const k = kit();
    const items = entry?.attention || [];
    if (!items.length) return '';
    return `
      <section class="ios-section">
        <h2 class="ios-group-label">Precisa de si</h2>
        <div class="ios-list">
          ${items.map((item) => `
            <button type="button" class="ios-row" data-nav-go="tarefas">
              <span class="ios-tile ${item.tone === 'failed' ? 'is-danger' : ''}">${k.icon(item.tone === 'failed' ? 'alert' : 'check')}</span>
              <span class="ios-row-main">
                <span class="ios-row-title">${k.escapeHtml(item.title)}</span>
                <span class="ios-row-sub">${k.escapeHtml(item.label)}</span>
              </span>
              ${k.icon('chevron', 14, 'ios-chevron')}
            </button>`).join('')}
        </div>
      </section>`;
  }

  function phases(project) {
    const k = kit();
    const snap = window.WorkspaceUI?.forProject?.(project.id);
    // The repository's fases when it has them; the platform's older record otherwise.
    const list = snap?.phases?.length
      ? snap.phases.map((phase) => ({ name: phase.title, weeks: phase.weeks, status: phase.status }))
      : (project.phases || []).map((phase, index) => ({
        name: String(phase.name || '').replace(/^\s*fase\s*\d+\s*[-–·:]\s*/i, '').trim() || `Fase ${index + 1}`,
        weeks: Number(phase.durationWeeks) || 0,
        status: '',
      }));
    if (!list.length) return '';
    const badges = { in_progress: k.badge('green', 'Em curso'), done: k.badge('gray', 'Concluída') };
    return `
      <section class="ios-section">
        <div class="ios-section-head">
          <h2 class="ios-section-title">Fases</h2>
          <button type="button" class="btn ghost" data-nav-go="plano">Ver plano</button>
        </div>
        <div class="ios-list">
          ${list.map((phase, index) => `
            <button type="button" class="ios-row" data-nav-go="plano">
              <span class="ios-row-index">${index + 1}</span>
              <span class="ios-row-main"><span class="ios-row-title">${k.escapeHtml(phase.name)}</span></span>
              ${badges[phase.status] || (phase.weeks ? `<span class="ios-row-meta">${phase.weeks} semana${phase.weeks === 1 ? '' : 's'}</span>` : '')}
              ${k.icon('chevron', 14, 'ios-chevron')}
            </button>`).join('')}
        </div>
      </section>`;
  }

  /** What is still undecided, from the repository's questions.md. */
  function openQuestions(project) {
    const k = kit();
    const snap = window.WorkspaceUI?.forProject?.(project.id);
    const client = window.isClientUser?.() === true;
    const open = (snap?.questions || []).filter((question) => question.state === 'open' && (!client || question.audience === 'client'));
    if (!open.length) return '';
    return `
      <section class="ios-section">
        <h2 class="ios-group-label">Perguntas em aberto · ${open.length}</h2>
        <div class="ios-list">
          ${open.map((question) => `
            <div class="ios-row is-static">
              <span class="ios-tile">${k.icon('help', 16)}</span>
              <span class="ios-row-main">
                <span class="ios-row-title ios-wrap">${k.escapeHtml(question.question)}</span>
                <span class="ios-row-sub">${question.audience === 'client' ? 'Para o cliente' : 'Para a equipa'}</span>
              </span>
            </div>`).join('')}
        </div>
      </section>`;
  }

  /** On a phone there is no sidebar, so the project's sections are listed on its home. */
  function sections(project, entry) {
    const k = kit();
    const groups = window.getProjectNavGroups?.() || [];
    const phaseCount = Array.isArray(project.phases) ? project.phases.length : 0;
    // A count where one says something at a glance, as the mockup's rows do.
    const trailing = {
      plano: phaseCount ? `${phaseCount} fase${phaseCount === 1 ? '' : 's'}` : '',
      tarefas: entry?.tasks ? String(entry.tasks) : '',
    };
    return groups.map((group) => {
      const items = group.items.filter((item) => item.id !== 'projeto');
      if (!items.length) return '';
      return `
        <section class="ios-section">
          <h2 class="ios-group-label">${k.escapeHtml(group.label)}</h2>
          <div class="ios-list">
            ${items.map((item) => `
              <button type="button" class="ios-row" data-nav-go="${k.escapeHtml(item.id)}">
                <span class="ios-row-icon">${window.navIconSvg?.(item.icon) || ''}</span>
                <span class="ios-row-main"><span class="ios-row-title">${k.escapeHtml(item.label)}</span></span>
                ${trailing[item.id] ? `<span class="ios-row-meta">${k.escapeHtml(trailing[item.id])}</span>` : ''}
                ${k.icon('chevron', 14, 'ios-chevron')}
              </button>`).join('')}
          </div>
        </section>`;
    }).join('');
  }

  function paint() {
    const host = document.getElementById('projectHome');
    const project = state.project;
    if (!host || !project || !kit()) return;
    const client = window.isClientUser?.() === true;
    const entry = window.ResumeUI?.entryFor?.(project.id) || null;
    const stage = window.WorkspaceUI?.stageOf?.(project.id, entry?.stage || null) || entry?.stage || null;
    // A client sees where the project stands and what it is for — not the agents' run.
    host.classList.toggle('ios-home-client', client);
    host.innerHTML = `
      ${header(project, entry, stage)}
      ${stageTrack(project, stage)}
      ${client ? '' : executionCard()}
      <div class="ios-home-aside">
        ${client ? '' : attention(entry)}
        ${window.WorkspaceUI?.statusCard?.(project) || ''}
        ${openQuestions(project)}
        ${phases(project)}
      </div>
      <div class="ios-home-sections">${sections(project, entry)}</div>`;
  }

  async function loadOrchestration(projectId) {
    const seq = ++state.requestSeq;
    state.loading = true;
    state.error = '';
    paint();
    try {
      const data = await window.apiRequest(`/${encodeURIComponent(projectId)}/orchestration`);
      if (seq !== state.requestSeq) return;
      state.orchestration = data;
    } catch (error) {
      if (seq !== state.requestSeq) return;
      state.orchestration = null;
      state.error = error.message;
    } finally {
      if (seq === state.requestSeq) {
        state.loading = false;
        paint();
      }
    }
  }

  function render(project) {
    if (!project) return;
    if (state.project?.id !== project.id) state.orchestration = null;
    state.project = project;
    paint();
    window.WorkspaceUI?.load?.(project.id);
    if (window.isClientUser?.() !== true) {
      loadOrchestration(project.id);
      window.ResumeUI?.load?.();
    }
  }

  document.addEventListener('click', (event) => {
    const go = event.target?.closest?.('#projectHome [data-nav-go]');
    if (go) window.switchToTab?.(go.dataset.navGo);
  });

  window.ProjectHomeUI = {
    render,
    refreshAttention: () => { if (state.project) paint(); },
  };

  // The repository's documentation arrives after the page; draw again when it does.
  window.WorkspaceUI?.subscribe?.(() => { if (state.project) paint(); });
})();
