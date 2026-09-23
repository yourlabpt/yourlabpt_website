/**
 * How each artefact looks in its own format. Pure: a piece read on the server
 * (lib/workspace-format.js pieceOf / the snapshot) goes in, markup comes out. The browser
 * never parses the files — the viewer, the live preview while editing, AI proposals and
 * Resumo all draw the same reading.
 *
 * Colour only where it means something: a state that is done, blocked or needs a look.
 */
(function initArtefactViews() {
  function kit() { return window.IosKit; }
  function esc(value) { return kit().escapeHtml(value); }

  const TYPE_FALLBACK = {
    stakeholder: { prefix: 'STK', label: 'Stakeholder' },
    functional: { prefix: 'FR', label: 'Funcional' },
    non_functional: { prefix: 'RNF', label: 'Não Funcional' },
    test_case: { prefix: 'TC', label: 'Teste / Aceite' },
    undefined: { prefix: 'UQ', label: 'Não Definido' },
    out_of_scope: { prefix: 'OOS', label: 'Fora de Escopo' },
  };
  // Labels come from the platform config (REQUIREMENT_TYPE_META); this is the order.
  function requirementTypes() {
    const config = window.state?.config?.types || {};
    return Object.fromEntries(Object.keys(TYPE_FALLBACK).map((id) => [id, { ...TYPE_FALLBACK[id], ...(config[id] || {}) }]));
  }

  const TYPE_WORD = { ideia: 'Ideia', resgate: 'Resgate', consolidacao: 'Consolidação' };
  const STAGE_WORD = {
    idea: 'Ideia', discovery: 'Descoberta', requirements: 'Requisitos', architecture: 'Arquitectura', roadmap: 'Plano',
    implementation: 'Construção', validation: 'Validação', delivery: 'Entrega', operations: 'Manutenção',
  };
  const PHASE_BADGE = { in_progress: ['green', 'Em curso'], done: ['gray', 'Concluída'], planned: ['gray', 'Planeada'] };
  const IDEA_BADGE = { accepted: ['green', 'Aceite'], rejected: ['gray', 'Rejeitada'], exploring: ['gray', 'A explorar'], new: ['gray', 'Nova'] };

  function prose(text, extra = '') {
    return text ? `<p class="av-prose ${extra}">${esc(text).replace(/\n{2,}/g, '</p><p class="av-prose">').replace(/\n/g, '<br>')}</p>` : '';
  }
  function block(title, body) {
    return body ? `<section class="av-block"><h3 class="av-label">${esc(title)}</h3>${body}</section>` : '';
  }
  function bullets(items) {
    return items?.length ? `<ul class="av-bullets">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  }
  function empty(text) {
    return `<p class="av-empty">${esc(text)}</p>`;
  }

  /* ------------------------------------------------------------ one renderer per kind */

  function project(piece, opts) {
    const k = kit();
    const meta = [piece.client && `Cliente: ${piece.client}`, TYPE_WORD[piece.type], piece.stage && `Etapa: ${STAGE_WORD[piece.stage] || piece.stage}`].filter(Boolean);
    return `
      <header class="av-hero">
        <h2 class="av-title">${esc(piece.name || 'Sem nome')}</h2>
        <div class="av-meta">${meta.map((entry) => `<span class="ios-chip">${esc(entry)}</span>`).join('')}${opts.generated ? k.badge('amber', 'Gerado do código · por rever') : ''}</div>
      </header>
      ${block('Propósito', prose(piece.purpose, 'is-lead') || empty('Ainda sem propósito.'))}
      ${block('Contexto', prose(piece.context))}
      ${block('Riscos', bullets(piece.risks))}
      ${block('Assunções', bullets(piece.assumptions))}`;
  }

  function ideas(list) {
    if (!list?.length) return empty('Ainda sem ideias.');
    const k = kit();
    return `<div class="ios-list">${list.map((idea) => {
      const [tone, word] = IDEA_BADGE[idea.state] || IDEA_BADGE.new;
      return `
        <div class="ios-row is-static av-row-top">
          <span class="ios-row-main">
            <span class="ios-row-title ios-wrap">${esc(idea.title)}</span>
            ${idea.text ? `<span class="ios-row-sub ios-wrap">${esc(idea.text)}</span>` : ''}
          </span>
          ${k.badge(tone, word)}
        </div>`;
    }).join('')}</div>`;
  }

  function questions(list) {
    if (!list?.length) return empty('Ainda sem perguntas.');
    const k = kit();
    const open = list.filter((q) => q.state !== 'answered');
    const answered = list.filter((q) => q.state === 'answered');
    const row = (q) => `
      <div class="ios-row is-static av-row-top">
        <span class="ios-row-main">
          <span class="ios-row-title ios-wrap">${esc(q.question)}</span>
          ${q.answer ? `<span class="ios-row-sub ios-wrap av-answer">${esc(q.answer)}</span>` : ''}
          ${q.notes ? `<span class="ios-row-sub ios-wrap">${esc(q.notes)}</span>` : ''}
        </span>
        <span class="ios-chip">${q.audience === 'client' ? 'Cliente' : 'Equipa'}</span>
        ${q.state === 'answered' ? '' : k.badge('amber', 'Aberta')}
      </div>`;
    return `
      ${open.length ? `<h3 class="av-label">Em aberto · ${open.length}</h3><div class="ios-list">${open.map(row).join('')}</div>` : ''}
      ${answered.length ? `<h3 class="av-label">Respondidas · ${answered.length}</h3><div class="ios-list">${answered.map(row).join('')}</div>` : ''}`;
  }

  function phase(piece, opts) {
    const k = kit();
    const [tone, word] = PHASE_BADGE[piece.status] || PHASE_BADGE.planned;
    const known = new Set(opts.capabilities || []);
    const features = piece.features?.length ? `<div class="ios-list">${piece.features.map((feature) => `
      <div class="ios-row is-static av-row-top">
        <span class="ios-row-main">
          <span class="ios-row-title ios-wrap">${esc(feature.title)}</span>
          ${feature.text ? `<span class="ios-row-sub ios-wrap">${esc(feature.text)}</span>` : ''}
          ${feature.requirements.length ? `<span class="av-chips">${feature.requirements.map((cap) => (known.has(cap)
    ? `<button type="button" class="ios-chip is-link" data-ws-open="openspec/specs/${esc(cap)}/spec.md">${esc(cap)}</button>`
    : `<span class="ios-chip is-missing" title="Não existe em openspec/specs/">${esc(cap)}</span>`)).join('')}</span>` : ''}
        </span>
      </div>`).join('')}</div>` : '';
    return `
      <header class="av-hero">
        <p class="av-kicker">Fase ${piece.number}</p>
        <h2 class="av-title">${esc(piece.title)}</h2>
        <div class="av-meta">${k.badge(tone, word)}${piece.weeks ? `<span class="ios-chip">${piece.weeks} semana${piece.weeks === 1 ? '' : 's'}</span>` : ''}</div>
      </header>
      ${block('Objetivo', prose(piece.objective, 'is-lead'))}
      ${block(`Features${piece.features?.length ? ` · ${piece.features.length}` : ''}`, features || empty('Ainda sem features.'))}
      ${block('Entregáveis', piece.deliverables?.length ? `<ul class="av-checklist">${piece.deliverables.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '')}`;
  }

  // Mermaid prints the %% title itself, so the view adds no heading of its own.
  function diagram(piece) {
    return `<div class="av-diagram" data-av-mermaid="${esc(piece.source)}">A desenhar…</div>`;
  }

  function database(piece) {
    if (!piece?.entities?.length) return empty('Ainda sem entidades.');
    return `<div class="av-entities">${piece.entities.map((entity) => `
      <section class="av-entity">
        <h3 class="av-entity-name">${esc(entity.name)} <span class="ios-count">${entity.fields.length}</span></h3>
        ${entity.fields.length ? `<table class="av-table">
          <thead><tr><th>Campo</th><th>Tipo</th><th>Notas</th></tr></thead>
          <tbody>${entity.fields.map((field) => `<tr><td><code>${esc(field.name)}</code></td><td>${esc(field.type)}</td><td>${esc(field.notes)}</td></tr>`).join('')}</tbody>
        </table>` : empty('Sem campos.')}
        ${entity.notes ? prose(entity.notes) : ''}
      </section>`).join('')}</div>`;
  }

  function workflow(piece) {
    // The title is the viewer's own heading; the view is the steps.
    return `
      ${piece.steps?.length ? `<ol class="av-steps">${piece.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>` : empty('Ainda sem passos.')}`;
  }

  function mockup(piece) {
    // Same rule as the served mockup: no scripts, nothing loaded from this page.
    return `<iframe class="av-screen" sandbox="" referrerpolicy="no-referrer" title="${esc(piece.file)}" srcdoc="${esc(piece.html)}"></iframe>`;
  }

  function requirementFold(entry, opts = {}) {
    const k = kit();
    const { requirement, capability } = entry;
    const meta = [opts.showCapability ? capability : '', requirement.module, requirement.priority].filter(Boolean).join(' · ');
    const scenarios = requirement.scenarios.map((scenario) => `
      <div class="ios-row is-static">
        <span class="ios-row-main">
          <span class="ios-row-title ios-wrap">${esc(scenario.title)}</span>
          <span class="ios-row-sub ios-wrap">${esc([scenario.when && `QUANDO ${scenario.when}`, scenario.then && `ENTÃO ${scenario.then}`].filter(Boolean).join(' · '))}</span>
        </span>
      </div>`).join('');
    return `
      <details class="ios-fold">
        <summary class="ios-row">
          ${requirement.id ? `<span class="ios-chip">${esc(requirement.id)}</span>` : ''}
          <span class="ios-row-main">
            <span class="ios-row-title ios-wrap">${esc(requirement.title)}</span>
            ${meta ? `<span class="ios-row-sub">${esc(meta)}</span>` : ''}
          </span>
          ${requirement.scenarios.length ? k.badge('gray', `${requirement.scenarios.length} cenário${requirement.scenarios.length === 1 ? '' : 's'}`) : ''}
        </summary>
        <div class="ios-fold-body">
          ${requirement.shall ? `<p class="av-prose">${esc(requirement.shall)}</p>` : ''}
          ${requirement.rationale ? `<p class="ios-footnote">Porque: ${esc(requirement.rationale)}</p>` : ''}
          ${scenarios ? `<h3 class="av-label">Cenários de aceitação</h3><div class="ios-list ios-sublist">${scenarios}</div>` : ''}
          ${opts.showCapability ? `<div class="ios-card-actions"><button type="button" class="btn" data-ws-open="${esc(entry.path)}">Abrir ${esc(capability)}</button></div>` : ''}
        </div>
      </details>`;
  }

  /** Requirements grouped by the six types, in order — one capability or all of them. */
  function byType(entries, opts = {}) {
    const types = requirementTypes();
    const sections = Object.entries(types).map(([id, meta]) => {
      const list = entries.filter((entry) => entry.requirement.type === id);
      if (!list.length) return '';
      return `
        <section class="av-block">
          <h3 class="av-label">${esc(meta.label)} · ${list.length} <span class="av-prefix">${esc(meta.prefix)}</span></h3>
          <div class="ios-list ios-fold-list">${list.map((entry) => requirementFold(entry, opts)).join('')}</div>
        </section>`;
    }).join('');
    return sections || empty('Ainda sem requisitos.');
  }

  function spec(piece) {
    const entries = (piece.requirements || []).map((requirement) => ({ requirement, capability: piece.capability, path: piece.file }));
    const untyped = entries.filter((entry) => entry.requirement.type === 'undefined').length;
    return `
      <header class="av-hero">
        <p class="av-kicker">Capacidade</p>
        <h2 class="av-title">${esc(piece.title || piece.capability)}</h2>
        <div class="av-meta"><span class="ios-chip">${entries.length} requisito${entries.length === 1 ? '' : 's'}</span>${untyped ? kit().badge('amber', `${untyped} por definir`) : ''}</div>
      </header>
      ${byType(entries)}`;
  }

  /** Everything the snapshot holds as requirements, across capabilities, by type. */
  function requirementsOverview(snap) {
    const entries = [];
    for (const specEntry of snap?.requirements || []) {
      for (const requirement of specEntry.requirements) {
        entries.push({ requirement, capability: specEntry.capability, path: `openspec/specs/${specEntry.capability}/spec.md` });
      }
    }
    return `
      <header class="av-hero">
        <h2 class="av-title">Requisitos por tipo</h2>
        <div class="av-meta"><span class="ios-chip">${entries.length} em ${(snap?.requirements || []).length} capacidades</span></div>
      </header>
      ${byType(entries, { showCapability: true })}
      <p class="ios-footnote">O tipo vem da linha <code>&lt;!-- yourlab: type=… --&gt;</code> de cada requisito. Sem ela, fica em Não Definido.</p>`;
  }

  function findingsBanner(findings) {
    if (!findings?.length) return '';
    const errors = findings.filter((finding) => finding.level === 'error').length;
    return `
      <div class="av-findings ${errors ? 'is-error' : ''}">
        <strong>${errors ? `${errors} erro${errors === 1 ? '' : 's'} de formato` : `${findings.length} aviso${findings.length === 1 ? '' : 's'}`}</strong>
        <ul>${findings.map((finding) => `<li>${finding.line ? `<button type="button" class="av-line" data-av-line="${finding.line}">linha ${finding.line}</button> ` : ''}${esc(finding.message)}</li>`).join('')}</ul>
      </div>`;
  }

  /**
   * One file, drawn. `view` is what pieceOf returns: { kind, piece, findings, generated }.
   */
  function render(view, opts = {}) {
    if (!view?.kind) return empty('Nada para mostrar.');
    const { kind, piece } = view;
    const body = !piece ? empty('Ainda vazio.')
      : kind === 'project' ? project(piece, { ...opts, generated: view.generated })
        : kind === 'ideas' ? ideas(piece)
          : kind === 'questions' ? questions(piece)
            : kind === 'phase' ? phase(piece, opts)
              : kind === 'diagram' ? diagram(piece)
                : kind === 'database' ? database(piece)
                  : kind === 'workflow' ? workflow(piece)
                    : kind === 'mockup' ? mockup(piece)
                      : kind === 'spec' ? spec(piece)
                        : empty('Formato desconhecido.');
    return `${opts.hideFindings ? '' : findingsBanner(view.findings)}<div class="av-doc av-${kind}">${body}</div>`;
  }

  /** Draws what needs a script after the markup exists: Mermaid diagrams. */
  function hydrate(host) {
    const nodes = host?.querySelectorAll?.('[data-av-mermaid]') || [];
    if (!nodes.length) return;
    window.ensureMermaidLoaded?.().then((mermaid) => {
      nodes.forEach((node, index) => {
        // Mermaid throws on a half-written diagram; that is normal while typing.
        mermaid.render(`av-diagram-${Date.now()}-${index}`, node.dataset.avMermaid.trim())
          .then(({ svg }) => { node.innerHTML = svg; })
          .catch((error) => { node.innerHTML = empty(String(error.message || error).split('\n')[0]); });
      });
    }).catch(() => nodes.forEach((node) => { node.innerHTML = empty('Mermaid não disponível.'); }));
  }

  /* ------------------------------------------------------------ one line per artefact */

  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  /**
   * What Resumo and the list say about each artefact. `target` is what the viewer opens:
   * a file path or a group key.
   */
  function summaries(snap) {
    if (!snap) return [];
    const reqs = (snap.requirements || []).flatMap((entry) => entry.requirements);
    const untyped = reqs.filter((requirement) => requirement.type === 'undefined').length;
    const openQuestions = (snap.questions || []).filter((q) => q.state !== 'answered').length;
    const inProgress = (snap.phases || []).filter((p) => p.status === 'in_progress').length;
    const entities = snap.database?.entities?.length || 0;
    return [
      { key: 'project', icon: 'sparkle', label: 'Propósito', target: 'yourlab/project.md', sub: snap.project?.purpose ? snap.project.purpose.split('\n')[0] : 'Por escrever' },
      { key: 'ideas', icon: 'notes', label: 'Ideias', target: 'yourlab/ideas.md', sub: snap.ideas?.length ? plural(snap.ideas.length, 'ideia', 'ideias') : 'Nenhuma' },
      { key: 'phases', icon: 'plan', label: 'Fases', target: snap.phases?.[0]?.file || '@group:phase', sub: snap.phases?.length ? `${plural(snap.phases.length, 'fase', 'fases')}${inProgress ? ` · ${inProgress} em curso` : ''}` : 'Nenhuma' },
      { key: 'requirements', icon: 'list', label: 'Requisitos', target: '@requisitos', sub: reqs.length ? `${plural(reqs.length, 'requisito', 'requisitos')}${untyped ? ` · ${untyped} por definir` : ''}` : 'Nenhum' },
      { key: 'diagrams', icon: 'branch', label: 'Arquitectura', target: snap.diagrams?.[0]?.file || '@group:diagram', sub: snap.diagrams?.length ? plural(snap.diagrams.length, 'diagrama', 'diagramas') : 'Nenhum' },
      { key: 'database', icon: 'layers', label: 'Base de dados', target: 'yourlab/database.md', sub: entities ? plural(entities, 'entidade', 'entidades') : 'Nenhuma' },
      { key: 'workflows', icon: 'refresh', label: 'Workflows', target: snap.workflows?.[0]?.file || '@group:workflow', sub: snap.workflows?.length ? plural(snap.workflows.length, 'workflow', 'workflows') : 'Nenhum' },
      { key: 'mockup', icon: 'image', label: 'Mockup', target: snap.mockup?.screens?.length ? `yourlab/mockup/${snap.mockup.entry || snap.mockup.screens[0].file}` : '@group:mockup', sub: snap.mockup?.screens?.length ? plural(snap.mockup.screens.length, 'ecrã', 'ecrãs') : 'Nenhum' },
      { key: 'questions', icon: 'help', label: 'Perguntas', target: 'yourlab/questions.md', sub: snap.questions?.length ? `${plural(snap.questions.length, 'pergunta', 'perguntas')}${openQuestions ? ` · ${openQuestions} em aberto` : ''}` : 'Nenhuma' },
    ];
  }

  window.ArtefactViews = {
    render,
    hydrate,
    requirementsOverview,
    requirementTypes,
    findingsBanner,
    summaries,
  };
})();
