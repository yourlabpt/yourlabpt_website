(function () {
  const reqUiState = {
    collapsedModules: new Set(),
    collapsedPhases: new Set(),
    modalDirty: false,
    modalReqId: null,
    dragReqId: null,
    groupMode: 'module',
    groupingIndex: new Map(),
  };

  // Liga cada requisito a funcionalidade/grupo a partir de project.capabilities
  // e project.requirementClusters (o resultado do agrupamento com IA).
  function buildGroupingIndex(project) {
    const index = new Map();
    const caps = Array.isArray(project?.capabilities) ? project.capabilities : [];
    const clusters = Array.isArray(project?.requirementClusters) ? project.requirementClusters : [];
    for (const cap of caps) {
      for (const rid of (cap.requirementIds || [])) {
        const key = String(rid);
        if (!index.has(key)) index.set(key, { capabilityId: cap.id, capabilityName: cap.name, clusterId: '', clusterName: '' });
      }
    }
    for (const cl of clusters) {
      for (const rid of (cl.requirementIds || [])) {
        const key = String(rid);
        const entry = index.get(key) || { capabilityId: '', capabilityName: '', clusterId: '', clusterName: '' };
        entry.clusterId = cl.id;
        entry.clusterName = cl.name;
        if (!entry.capabilityName && cl.capabilityId) {
          const cap = caps.find((c) => c.id === cl.capabilityId);
          if (cap) { entry.capabilityId = cap.id; entry.capabilityName = cap.name; }
        }
        index.set(key, entry);
      }
    }
    return index;
  }

  // Agrupa por funcionalidade -> grupo (espelha a estrutura módulo -> fase).
  function groupRequirementsByCapability(items) {
    const index = reqUiState.groupingIndex;
    const tree = new Map();
    for (const req of items) {
      const g = index.get(String(req.id));
      const capName = (g && g.capabilityName) || 'Sem funcionalidade';
      const clName = (g && g.clusterName) || 'Sem grupo';
      if (!tree.has(capName)) tree.set(capName, new Map());
      const cls = tree.get(capName);
      if (!cls.has(clName)) cls.set(clName, []);
      cls.get(clName).push(req);
    }
    const sortNames = (a, b, sentinel) => {
      if (a === sentinel) return 1;
      if (b === sentinel) return -1;
      return a.localeCompare(b, 'pt');
    };
    return [...tree.keys()]
      .sort((a, b) => sortNames(a, b, 'Sem funcionalidade'))
      .map((cap) => ({
        module: cap,
        phases: [...tree.get(cap).keys()]
          .sort((a, b) => sortNames(a, b, 'Sem grupo'))
          .map((cl) => ({ phase: cl, requirements: tree.get(cap).get(cl) })),
      }));
  }

  const FIELD_HELP = {
    id: 'Identificador único do requisito no projecto.',
    type: 'Classificação do requisito (stakeholder, funcional, etc.).',
    title: 'Título curto e descritivo do requisito.',
    shall: 'Enunciado «shall» — o que o sistema deve fazer.',
    need: 'Necessidade do stakeholder (formato «As a… I need…»).',
    module: 'Área principal da arquitetura responsável por implementar este requisito.',
    phase: 'Momento da Linha de Entrega em que este requisito será tratado.',
    status: 'Estado actual de validação ou implementação do requisito.',
    priority: 'Prioridade relativa para planeamento e implementação.',
    submodule: 'Sub-área ou componente dentro do módulo.',
    measure: 'Condições objetivas para considerar o requisito concluído (critérios de aceitação).',
    related: 'IDs de requisitos relacionados ou dependentes.',
    notes: 'Observações internas, decisões ou contexto adicional.',
  };

  function $(id) {
    return document.getElementById(id);
  }

  // Módulos canónicos partilhados com a linha de entrega (moduleTags). A
  // pagina de requisitos passa a usar moduleTags como fonte única, em vez do
  // antigo campo único req.module, para manter tudo coerente.
  const MODULE_PRIORITY = ['Database', 'Backend', 'Frontend'];
  function moduleTagsOf(req) {
    const tags = Array.isArray(req?.moduleTags) ? req.moduleTags.filter(Boolean) : [];
    if (tags.length) return tags;
    const m = normalizeModuleName(req?.module);
    return m ? [m] : [];
  }
  function primaryModuleOf(req) {
    const tags = moduleTagsOf(req);
    if (!tags.length) return 'Outro';
    return MODULE_PRIORITY.find((m) => tags.includes(m)) || tags[0];
  }

  function groupRequirements(items) {
    const tree = new Map();
    for (const req of items) {
      const mod = primaryModuleOf(req);
      const phase = String(req.phase || 'Backlog').trim() || 'Backlog';
      if (!tree.has(mod)) tree.set(mod, new Map());
      const phases = tree.get(mod);
      if (!phases.has(phase)) phases.set(phase, []);
      phases.get(phase).push(req);
    }
    const modules = [...tree.keys()].sort((a, b) => a.localeCompare(b, 'pt'));
    return modules.map((mod) => ({
      module: mod,
      phases: [...tree.get(mod).keys()].sort((a, b) => a.localeCompare(b, 'pt')).map((phase) => ({
        phase,
        requirements: tree.get(mod).get(phase),
      })),
    }));
  }

  function collectPhases(items) {
    return [...new Set(items.map((r) => String(r.phase || 'Backlog').trim() || 'Backlog'))].sort((a, b) => a.localeCompare(b, 'pt'));
  }

  function getFilteredForUi(project) {
    const items = Array.isArray(project?.requirements) ? project.requirements : [];
    let filtered = getFilteredRequirements(items);

    const phaseFilter = String(state.filters.phase || '').trim();
    if (phaseFilter) {
      filtered = filtered.filter((r) => (String(r.phase || 'Backlog').trim() || 'Backlog') === phaseFilter);
    }

    const priorityFilter = String(state.filters.priority || '').trim();
    if (priorityFilter) {
      filtered = filtered.filter((r) => (r.priority || 'medium') === priorityFilter);
    }

    const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
    if (stageFilter && state.activeTab === 'requisitos') {
      const resolve = window.PhaseContent?.resolveRequirementStageId || ((r) => r.deliveryStageId || 'requirements');
      filtered = filtered.filter((r) => resolve(r) === stageFilter);
    }

    return filtered;
  }

  function renderFilterBanner() {
    const el = $('reqTabFilterBanner');
    if (!el) return;
    const parts = [];
    const stageId = state.tabFilters?.deliveryStageId;
    if (stageId && state.activeTab === 'requisitos') {
      parts.push(stageLabel(stageId));
    }
    if (state.filters.module) parts.push(state.filters.module);
    if (state.filters.phase) parts.push(state.filters.phase);
    if (!parts.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="phase-context-strip is-compact">
        <div class="phase-context-strip-left">
          <span class="phase-context-tag">filtro</span>
          <span class="phase-context-pill is-small">${escapeHtml(parts.join(' · '))}</span>
        </div>
        <button type="button" class="phase-context-go is-ghost" id="reqClearTabFilters">Limpar</button>
      </div>
    `;
    el.querySelector('#reqClearTabFilters')?.addEventListener('click', () => {
      state.tabFilters = state.tabFilters || {};
      state.tabFilters.deliveryStageId = '';
      state.filters.phase = '';
      if (!state.tabFilters.keepModule) state.filters.module = '';
      state.tabFilters.keepModule = false;
      renderRequirements(state.selectedProject);
    });
  }

  function stkRootForReq(req, project) {
    if (!req || req.type === 'stakeholder') return '';
    if (req.stakeholderRequirementLink) return req.stakeholderRequirementLink;
    const reqs = project?.requirements || [];
    if (req.parentId) {
      const parent = reqs.find((r) => r.id === req.parentId);
      if (parent?.type === 'stakeholder') return parent.id;
    }
    if (req.type === 'test_case' && req.linkedFunctionalRequirement) {
      const fr = reqs.find((r) => r.id === req.linkedFunctionalRequirement);
      if (fr?.stakeholderRequirementLink) return fr.stakeholderRequirementLink;
    }
    return '';
  }

  function syncReqViewTabs() {
    const mode = reqUiState.groupMode || 'module';
    document.querySelectorAll('#reqViewSwitcher .req-view-btn').forEach((btn) => {
      const active = btn.dataset.reqView === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function renderGroupedRequirements(project) {
    const container = $('requirementsGroupedView');
    const legacyTable = $('requirementsTable')?.closest('.requirements-list-col');
    if (!container) return;

    renderFilterBanner();
    reqUiState.groupingIndex = buildGroupingIndex(project);
    const groupBySel = $('reqGroupBy');
    if (groupBySel) groupBySel.value = reqUiState.groupMode;
    syncReqViewTabs();
    const filtered = getFilteredForUi(project);

    if (reqUiState.groupMode === 'vmap' || reqUiState.groupMode === 'implmap') {
      if (legacyTable) legacyTable.classList.add('hidden');
      $('requirementDetailPanel')?.classList.add('hidden');
      if (window.RequirementsMapUI?.renderRequirementsMap) {
        window.RequirementsMapUI.renderRequirementsMap(project, reqUiState.groupMode);
      } else {
        container.innerHTML = '<p class="muted-text">Mapa indisponível.</p>';
      }
      return;
    }

    container.classList.remove('req-map-container');
    const grouped = reqUiState.groupMode === 'capability'
      ? groupRequirementsByCapability(filtered)
      : groupRequirements(filtered);

    if (legacyTable) legacyTable.classList.add('hidden');
    $('requirementDetailPanel')?.classList.add('hidden');

    if (!filtered.length) {
      const total = (project.requirements || []).length;
      container.innerHTML = `<p class="muted-text">${total ? 'Nenhum requisito corresponde ao filtro.' : 'Sem requisitos ainda.'}</p>`;
      updateMeta(project, filtered);
      return;
    }

    container.innerHTML = grouped.map(({ module, phases }) => {
      const modCollapsed = reqUiState.collapsedModules.has(module);
      const modCount = phases.reduce((n, p) => n + p.requirements.length, 0);
      return `
        <details class="req-module-group" data-module="${escapeHtml(module)}" ${modCollapsed ? '' : 'open'}>
          <summary class="req-module-summary">
            <span class="req-module-name">${escapeHtml(module)}</span>
            <span class="req-count-badge">${modCount}</span>
          </summary>
          <div class="req-module-body">
            ${phases.map(({ phase, requirements }) => {
              const phaseKey = `${module}::${phase}`;
              const phaseCollapsed = reqUiState.collapsedPhases.has(phaseKey);
              return `
                <details class="req-phase-group" data-phase-key="${escapeHtml(phaseKey)}" ${phaseCollapsed ? '' : 'open'}>
                  <summary class="req-phase-summary">
                    <span>${escapeHtml(phase)}</span>
                    <span class="req-count-badge">${requirements.length}</span>
                  </summary>
                  <div class="req-phase-dropzone" data-module="${escapeHtml(module)}" data-phase="${escapeHtml(phase)}">
                    ${requirements.map((req) => renderReqCard(req, project)).join('')}
                  </div>
                </details>
              `;
            }).join('')}
          </div>
        </details>
      `;
    }).join('');

    wireGroupedEvents(project);
    updateMeta(project, filtered);
    populatePhaseFilter(project);
  }

  function renderReqCard(req, project) {
    const summary = shortText(req.shall || req.need || req.description || req.title, 100);
    const status = escapeHtml(req.status || 'draft');
    const priority = escapeHtml(req.priority || 'medium');
    const locked = !canEdit();
    const draggable = !locked && !['capability', 'vmap', 'implmap'].includes(reqUiState.groupMode);
    const diagramCount = window.DiagramsUI?.diagramsForRequirement?.(project, req.id)?.length
      || (req.linkedDiagramIds || []).length
      || 0;
    const grp = reqUiState.groupingIndex?.get(String(req.id));
    let capBadge = '';
    if (grp && grp.capabilityName) {
      const label = grp.clusterName ? `${grp.capabilityName} · ${grp.clusterName}` : grp.capabilityName;
      capBadge = `<span class="req-card-cap" title="Funcionalidade · grupo (agrupamento com IA)">${escapeHtml(label)}</span>`;
    }
    const modTags = moduleTagsOf(req);
    const modBadges = modTags.length
      ? `<span class="req-card-modules">${modTags.map((t) => `<span class="req-mod-badge">${escapeHtml(t)}</span>`).join('')}</span>`
      : '';
    const stkRoot = stkRootForReq(req, project);
    const stkBadge = stkRoot
      ? `<span class="req-card-stk" title="Stakeholder raiz (V-cycle)">↑ ${escapeHtml(stkRoot)}</span>`
      : (req.type !== 'stakeholder' && req.type !== 'out_of_scope'
        ? '<span class="req-card-stk is-missing" title="Sem stakeholder ligado">Sem STK</span>'
        : '');
    return `
      <article class="req-card ${locked ? 'req-card-locked' : ''}" draggable="${draggable ? 'true' : 'false'}" data-req-id="${escapeHtml(req.id)}">
        <span class="req-drag-handle" title="Arrastar para outro módulo/fase" aria-hidden="true">⠿</span>
        <button type="button" class="req-card-main" data-open-req="${escapeHtml(req.id)}">
          <span class="req-card-id">${escapeHtml(req.id)}</span>
          <span class="req-card-type">${escapeHtml(req.type)}</span>
          <strong class="req-card-title">${escapeHtml(req.title || summary)}</strong>
          ${modBadges}
          ${stkBadge}
          ${capBadge}
          <small class="req-card-meta">${status} · ${priority}${diagramCount ? ` · <span class="req-diagram-badge" title="${diagramCount} diagrama(s) ligado(s)">${diagramCount} diag</span>` : ''}</small>
        </button>
      </article>
    `;
  }

  function updateMeta(project, filtered) {
    const el = $('requirementsMeta');
    if (!el) return;
    const items = project.requirements || [];
    const functional = items.filter((e) => e.type === 'functional');
    const smartMissing = functional.filter((e) => !e.smartIsValid).length;
    const moduleCount = new Set(items.map((e) => normalizeModuleName(e.module))).size;
    el.textContent = `${filtered.length} requisitos no filtro (${items.length} totais) · ${moduleCount} módulos · Lacunas SMART: ${smartMissing}`;
  }

  function populatePhaseFilter(project) {
    const sel = $('reqFilterPhase');
    if (!sel) return;
    const current = state.filters.phase || '';
    const phases = collectPhases(project.requirements || []);
    sel.innerHTML = `<option value="">Todas as fases</option>${phases.map((p) =>
      `<option value="${escapeHtml(p)}" ${p === current ? 'selected' : ''}>${escapeHtml(p)}</option>`
    ).join('')}`;
  }

  function wireGroupedEvents(project) {
    const container = $('requirementsGroupedView');
    if (!container) return;

    container.querySelectorAll('.req-module-group').forEach((node) => {
      node.addEventListener('toggle', () => {
        const mod = node.dataset.module;
        if (node.open) reqUiState.collapsedModules.delete(mod);
        else reqUiState.collapsedModules.add(mod);
      });
    });

    container.querySelectorAll('.req-phase-group').forEach((node) => {
      node.addEventListener('toggle', () => {
        const key = node.dataset.phaseKey;
        if (node.open) reqUiState.collapsedPhases.delete(key);
        else reqUiState.collapsedPhases.add(key);
      });
    });

    container.querySelectorAll('[data-open-req]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openRequirementModal(btn.dataset.openReq, project);
      });
    });

    // Em modo "por funcionalidade" o arrastar (que reatribui módulo/fase) não se
    // aplica — a associação vem do agrupamento, não da posição.
    if (!canEdit() || reqUiState.groupMode === 'capability') return;

    container.querySelectorAll('.req-card[draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        reqUiState.dragReqId = card.dataset.reqId;
        card.classList.add('req-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.reqId);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('req-dragging');
        reqUiState.dragReqId = null;
        container.querySelectorAll('.req-phase-dropzone').forEach((z) => z.classList.remove('req-drop-target'));
      });
    });

    container.querySelectorAll('.req-phase-dropzone').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('req-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('req-drop-target'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('req-drop-target');
        const reqId = e.dataTransfer.getData('text/plain') || reqUiState.dragReqId;
        if (!reqId) return;
        moveRequirement(reqId, zone.dataset.module, zone.dataset.phase, project);
      });
    });
  }

  async function moveRequirement(reqId, newModule, newPhase, project) {
    const req = (project.requirements || []).find((r) => r.id === reqId);
    if (!req) return;
    const backup = { module: req.module, phase: req.phase, moduleTags: req.moduleTags };
    if (primaryModuleOf(req) === newModule && (backup.phase || 'Backlog') === newPhase) return;

    // Mover entre módulos reescreve moduleTags (fonte única partilhada com a
    // linha de entrega), mantendo as duas vistas coerentes.
    req.module = newModule;
    req.moduleTags = [newModule];
    req.phase = newPhase;
    renderGroupedRequirements(project);

    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
        { method: 'PATCH', body: { module: newModule, phase: newPhase, moduleTags: [newModule] } }
      );
      state.selectedProject = res.project;
      renderGroupedRequirements(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      showToast('Requisito movido com sucesso.', 'ok');
    } catch (error) {
      req.module = backup.module;
      req.phase = backup.phase;
      req.moduleTags = backup.moduleTags;
      renderGroupedRequirements(project);
      showToast(error.message || 'Erro ao mover requisito.', 'error');
    }
  }

  function helperLabel(text, helpKey) {
    const help = FIELD_HELP[helpKey] || '';
    return `<span class="field-label">${escapeHtml(text)}${help ? `<small class="field-help">${escapeHtml(help)}</small>` : ''}</span>`;
  }

  function openRequirementModal(reqId, project) {
    const modal = $('requirementEditModal');
    const req = (project?.requirements || []).find((r) => r.id === reqId);
    if (!modal || !req) return;

    reqUiState.modalReqId = reqId;
    reqUiState.modalDirty = false;
    state.selectedRequirementId = reqId;

    $('reqModalDirty')?.classList.add('hidden');
    $('reqModalTitle').textContent = `${req.id} — Editar requisito`;

    const form = $('requirementModalForm');
    form.innerHTML = `
      <label>${helperLabel('ID', 'id')}<input id="modalReqId" readonly value="${escapeHtml(req.id)}" /></label>
      <label>${helperLabel('Tipo', 'type')}<input id="modalReqType" readonly value="${escapeHtml(req.type)}" /></label>
      <label>${helperLabel('Status', 'status')}<select id="modalReqStatus">${statusOptions()}</select></label>
      <label>${helperLabel('Prioridade', 'priority')}
        <select id="modalReqPriority">
          <option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
        </select>
      </label>
      <label>${helperLabel('Módulo', 'module')}
        <select id="modalReqModule">
          <option value="Frontend">Frontend</option><option value="Backend">Backend</option><option value="Database">Database</option>
        </select>
      </label>
      <label>${helperLabel('Fase de implementação', 'phase')}<input id="modalReqPhase" /></label>
      <label>${helperLabel('Submódulo', 'submodule')}<input id="modalReqSubmodule" list="submoduleSuggestions" /></label>
      <label class="full">${helperLabel('Título', 'title')}<input id="modalReqTitle" /></label>
      <label class="full">${helperLabel('Need', 'need')}<textarea id="modalReqNeed" rows="2"></textarea></label>
      <label class="full">${helperLabel('Shall / Descrição', 'shall')}<textarea id="modalReqShall" rows="3"></textarea></label>
      <label class="full">${helperLabel('Critérios de aceitação (Measure)', 'measure')}<textarea id="modalReqMeasure" rows="2"></textarea></label>
      <label class="full">${helperLabel('Dependências / IDs relacionados', 'related')}<textarea id="modalReqRelatedIds" rows="2"></textarea></label>
      <label class="full">${helperLabel('Notas', 'notes')}<textarea id="modalReqNotes" rows="2"></textarea></label>
      ${window.DiagramsUI?.renderRequirementDiagramLinks?.(project, reqId) || ''}
    `;

    $('modalReqStatus').value = req.status || 'draft';
    $('modalReqPriority').value = req.priority || 'medium';
    $('modalReqModule').value = normalizeModuleName(req.module);
    $('modalReqPhase').value = req.phase || 'Backlog';
    $('modalReqSubmodule').value = normalizeSubmoduleName(req.submodule);
    $('modalReqTitle').value = req.title || '';
    $('modalReqNeed').value = req.need || '';
    $('modalReqShall').value = req.shall || req.description || '';
    $('modalReqMeasure').value = req.measure || '';
    $('modalReqRelatedIds').value = joinRequirementIds(req.relatedRequirementIds);
    $('modalReqNotes').value = req.notes || '';

    const readonly = !canEdit();
    form.querySelectorAll('input, textarea, select').forEach((node) => {
      if (node.id === 'modalReqId' || node.id === 'modalReqType') return;
      node.disabled = readonly;
      node.addEventListener('input', markModalDirty);
      node.addEventListener('change', markModalDirty);
    });
    $('reqModalSave').disabled = readonly;
    $('reqModalDelete').classList.toggle('hidden', readonly);

    modal.classList.remove('hidden');
  }

  function markModalDirty() {
    reqUiState.modalDirty = true;
    $('reqModalDirty')?.classList.remove('hidden');
  }

  function closeRequirementModal() {
    if (reqUiState.modalDirty && !confirm('Existem alterações não guardadas. Fechar mesmo assim?')) return;
    $('requirementEditModal')?.classList.add('hidden');
    reqUiState.modalDirty = false;
    reqUiState.modalReqId = null;
  }

  async function saveRequirementModal() {
    const project = state.selectedProject;
    const reqId = reqUiState.modalReqId;
    if (!project || !reqId) return;

    const req = (project.requirements || []).find((r) => r.id === reqId);
    const newModule = $('modalReqModule')?.value;
    const body = {
      status: $('modalReqStatus')?.value,
      priority: $('modalReqPriority')?.value,
      module: newModule,
      phase: $('modalReqPhase')?.value,
      submodule: $('modalReqSubmodule')?.value,
      title: $('modalReqTitle')?.value,
      need: $('modalReqNeed')?.value,
      shall: $('modalReqShall')?.value,
      measure: $('modalReqMeasure')?.value,
      relatedRequirementIds: splitRequirementIds($('modalReqRelatedIds')?.value),
      notes: $('modalReqNotes')?.value,
    };

    // Só reescreve moduleTags quando o módulo é alterado manualmente, para não
    // apagar a classificação multi-módulo vinda do agrupamento.
    if (req && normalizeModuleName(req.module) !== normalizeModuleName(newModule)) {
      body.moduleTags = [newModule];
    }

    if (!String(body.title || '').trim()) {
      showToast('O título é obrigatório.', 'error');
      return;
    }

    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
        { method: 'PATCH', body }
      );
      state.selectedProject = res.project;
      reqUiState.modalDirty = false;
      $('reqModalDirty')?.classList.add('hidden');
      closeRequirementModal();
      renderGroupedRequirements(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      showToast('Requisito guardado.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function deleteRequirementModal() {
    const project = state.selectedProject;
    const reqId = reqUiState.modalReqId;
    if (!project || !reqId || !confirm('Apagar este requisito? Esta acção não pode ser desfeita.')) return;
    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
        { method: 'DELETE' }
      );
      state.selectedProject = res.project;
      reqUiState.modalDirty = false;
      reqUiState.modalReqId = null;
      $('requirementEditModal')?.classList.add('hidden');
      renderGroupedRequirements(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      showToast('Requisito apagado.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function exportRequirementsMarkdown(project) {
    const grouped = groupRequirements(project.requirements || []);
    let md = '# Requisitos do Projeto\n\n';
    for (const { module, phases } of grouped) {
      md += `## ${module}\n\n`;
      for (const { phase, requirements } of phases) {
        md += `### ${phase}\n\n`;
        for (const req of requirements) {
          md += `#### ${req.id} — ${req.title || 'Sem título'}\n\n`;
          md += `- **Tipo:** ${req.type || 'n/d'}\n`;
          md += `- **Status:** ${req.status || 'draft'}\n`;
          md += `- **Prioridade:** ${req.priority || 'medium'}\n`;
          md += `- **Módulo:** ${formatModuleLabel(req)}\n`;
          if (req.shall || req.description) md += `- **Descrição:** ${req.shall || req.description}\n`;
          if (req.measure) md += `- **Critérios de aceitação:** ${req.measure}\n`;
          if (req.notes) md += `- **Notas:** ${req.notes}\n`;
          md += '\n';
        }
      }
    }
    return md;
  }

  function exportRequirementsJson(project) {
    const grouped = groupRequirements(project.requirements || []);
    return {
      modules: grouped.map(({ module, phases }) => ({
        name: module,
        phases: phases.map(({ phase, requirements }) => ({
          name: phase,
          requirements: requirements.map((r) => ({ ...r })),
        })),
      })),
    };
  }

  function downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport(format) {
    const project = state.selectedProject;
    if (!project) return;
    const slug = (project.name || 'projecto').replace(/\s+/g, '_').slice(0, 40);
    if (format === 'md') {
      downloadText(exportRequirementsMarkdown(project), `${slug}_requisitos.md`, 'text/markdown');
    } else {
      downloadText(JSON.stringify(exportRequirementsJson(project), null, 2), `${slug}_requisitos.json`, 'application/json');
    }
    showToast(`Exportação ${format.toUpperCase()} concluída.`, 'ok');
  }

  function openDocumentViewer(doc, project) {
    const modal = $('documentViewerModal');
    const body = $('documentViewerBody');
    const title = $('documentViewerTitle');
    if (!modal || !body) return;

    const name = doc.title || doc.originalName || 'Documento';
    title.textContent = name;
    const content = doc.contentMarkdown || doc.extractedText || '';
    const format = doc.diagramFormat || (doc.docType === 'diagram' ? 'mermaid' : '');

    if (format === 'mermaid' && content && window.mermaid) {
      body.innerHTML = `<div class="doc-mermaid-wrap" id="docMermaidPreview"></div><pre class="minute-raw doc-source-copy">${escapeHtml(content)}</pre>`;
      const wrap = $('docMermaidPreview');
      const id = `doc_mmd_${Date.now()}`;
      window.mermaid.render(id, content).then(({ svg }) => {
        wrap.innerHTML = svg;
      }).catch(() => {
        wrap.innerHTML = `<p class="muted-text">Pré-visualização indisponível. Copie o código Mermaid abaixo.</p>`;
      });
    } else if (format === 'json' || doc.contentType?.includes('json')) {
      try {
        body.innerHTML = `<pre class="minute-raw">${escapeHtml(JSON.stringify(JSON.parse(content), null, 2))}</pre>`;
      } catch {
        body.innerHTML = `<pre class="minute-raw">${escapeHtml(content)}</pre>`;
      }
    } else if (content) {
      body.innerHTML = `<pre class="minute-raw">${escapeHtml(content)}</pre>`;
    } else {
      body.innerHTML = `<p class="muted-text">Sem conteúdo inline. <a href="/api/projects/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(doc.id)}/download" target="_blank" rel="noopener">Descarregar ficheiro</a></p>`;
    }

    $('documentViewerCopy')?.replaceWith($('documentViewerCopy').cloneNode(true));
    $('documentViewerCopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(content).then(() => showToast('Copiado.', 'ok'));
    });

    modal.classList.remove('hidden');
  }

  function initRequirementsUi() {
    syncReqViewTabs();
    $('reqExportMd')?.addEventListener('click', () => handleExport('md'));
    $('reqExportJson')?.addEventListener('click', () => handleExport('json'));
    $('reqModalClose')?.addEventListener('click', closeRequirementModal);
    $('reqModalCancel')?.addEventListener('click', closeRequirementModal);
    $('reqModalSave')?.addEventListener('click', saveRequirementModal);
    $('reqModalDelete')?.addEventListener('click', deleteRequirementModal);
    $('documentViewerClose')?.addEventListener('click', () => $('documentViewerModal')?.classList.add('hidden'));
    $('reqFilterPhase')?.addEventListener('change', (e) => {
      state.filters.phase = e.target.value;
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
    $('reqFilterPriority')?.addEventListener('change', (e) => {
      state.filters.priority = e.target.value;
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
    $('reqGroupBy')?.addEventListener('change', (e) => {
      reqUiState.groupMode = e.target.value || 'module';
      syncReqViewTabs();
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
    $('reqViewSwitcher')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-req-view]');
      if (!btn) return;
      reqUiState.groupMode = btn.dataset.reqView || 'module';
      const sel = $('reqGroupBy');
      if (sel) sel.value = reqUiState.groupMode;
      syncReqViewTabs();
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
  }

  function setGroupMode(mode) {
    reqUiState.groupMode = mode || 'module';
    const sel = $('reqGroupBy');
    if (sel) sel.value = reqUiState.groupMode;
    syncReqViewTabs();
  }

  function openRequirementsMap(mode, options = {}) {
    setGroupMode(mode || 'vmap');
    if (window.RequirementsMapUI?.setMapFocus) {
      window.RequirementsMapUI.setMapFocus(options.focusStakeholderId, options.focusRequirementId);
    }
    if (typeof switchToTab === 'function') switchToTab('requisitos');
    else if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
  }

  window.RequirementsUI = {
    renderGroupedRequirements,
    openRequirementModal,
    openDocumentViewer,
    initRequirementsUi,
    groupRequirements,
    exportRequirementsMarkdown,
    exportRequirementsJson,
    getFilteredForUi,
    updateMeta,
    setGroupMode,
    openRequirementsMap,
  };

  window.openRequirementsMap = openRequirementsMap;

  document.addEventListener('DOMContentLoaded', initRequirementsUi);
})();
