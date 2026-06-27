(function () {
  const docUiState = {
    activeView: 'uploads',
    modalItem: null,
    modalDirty: false,
  };

  const KIND_LABELS = {
    artifact: 'Artefacto técnico',
    prompt_run: 'Resposta IA',
    information_entry: 'Nota de fase',
    document: 'Documento gerado',
  };

  // Friendly names so the reader never sees agent slugs like "requirements_to_architecture".
  const AGENT_FRIENDLY = {
    requirement_grouping: 'Organização de requisitos',
    reverse_idea: 'Resumo da ideia',
    diagram_to_requirements: 'Requisitos a partir de diagrama',
    requirements_to_architecture: 'Pacote de arquitectura',
    capability_requirements: 'Requisitos da funcionalidade',
    stage_transition: 'Transição de fase',
    impact_regeneration: 'Propagação de impacto',
    meeting_classification: 'Classificação de ata',
    prompt_builder: 'Agente',
    agent_output: 'Resposta IA',
  };

  const STAGE_SEQUENCE = ['idea', 'discovery', 'requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery', 'operations'];

  function $(id) {
    return document.getElementById(id);
  }

  function getStageId() {
    return state.tabFilters?.deliveryStageId || state.deliverySelectedStageId || '';
  }

  function friendlyLabel(item) {
    if (item.kind === 'prompt_run') {
      const slug = String(item.raw?.agentType || item.typeLabel || '').trim();
      return AGENT_FRIENDLY[slug] || KIND_LABELS.prompt_run;
    }
    return KIND_LABELS[item.kind] || item.typeLabel;
  }

  function friendlyDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function stageOrderList() {
    return window.state?.config?.stageOrder || STAGE_SEQUENCE;
  }

  // Single readable place: when no phase filter is active, gather AI artifacts
  // from EVERY phase (deduped); otherwise just the filtered phase.
  function getAiArtifacts(project) {
    const collect = window.PhaseContent?.collectAiArtifacts;
    if (!collect) return [];
    const stageFilter = getStageId();
    if (stageFilter) return collect(project, stageFilter);

    const seen = new Set();
    const all = [];
    for (const sid of stageOrderList()) {
      for (const item of collect(project, sid)) {
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({ ...item, stageId: item.stageId || sid });
      }
    }
    return all.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }

  function getUploadDocuments(project) {
    let docs = Array.isArray(project?.documents) ? project.documents : [];
    const isAiDocument = (d) => {
      const docType = String(d?.docType || 'attachment');
      const origin = String(d?.origin || '');
      return origin === 'ai' || ['diagram', 'ai_response', 'architecture'].includes(docType);
    };
    docs = docs.filter((d) => !isAiDocument(d));
    const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
    if (stageFilter) {
      const resolve = window.PhaseContent?.resolveDocumentStageId || ((d) => d.deliveryStageId || 'discovery');
      docs = docs.filter((d) => resolve(d) === stageFilter);
    }
    return docs;
  }

  function renderDocumentsPage(project) {
    if (!project) return;

    const forcedView = state.tabFilters?.contentView;
    if (forcedView === 'aiArtifacts') docUiState.activeView = 'aiArtifacts';
    else if (forcedView === 'uploads') docUiState.activeView = 'uploads';

    renderViewTabs();
    renderFilterStrip(project);

    if (docUiState.activeView === 'aiArtifacts') {
      $('documentsUploadSection')?.classList.add('hidden');
      $('documentsAiSection')?.classList.remove('hidden');
      renderAiArtifactsList(project);
    } else {
      $('documentsUploadSection')?.classList.remove('hidden');
      $('documentsAiSection')?.classList.add('hidden');
      renderUploadsList(project);
    }
  }

  function renderViewTabs() {
    const el = $('documentsViewTabs');
    if (!el) return;
    el.innerHTML = `
      <button type="button" class="docs-view-tab ${docUiState.activeView === 'uploads' ? 'is-active' : ''}" data-docs-view="uploads">Anexos</button>
      <button type="button" class="docs-view-tab ${docUiState.activeView === 'aiArtifacts' ? 'is-active' : ''}" data-docs-view="aiArtifacts">Artefactos IA</button>
    `;
    el.querySelectorAll('[data-docs-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        docUiState.activeView = btn.dataset.docsView;
        state.tabFilters = state.tabFilters || {};
        state.tabFilters.contentView = btn.dataset.docsView === 'aiArtifacts' ? 'aiArtifacts' : '';
        renderDocumentsPage(state.selectedProject);
      });
    });
  }

  function renderFilterStrip(project) {
    const el = $('documentsFilterStrip');
    if (!el) return;
    const stageId = getStageId();
    const aiCount = getAiArtifacts(project).length;
    const uploadCount = getUploadDocuments(project).length;

    if (!stageId && docUiState.activeView !== 'aiArtifacts') {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    el.classList.remove('hidden');
    const stageName = stageId ? stageLabel(stageId) : '';
    const viewLabel = docUiState.activeView === 'aiArtifacts'
      ? `${aiCount} artefacto(s) IA${stageName ? ` · ${stageName}` : ''}`
      : `${uploadCount} anexo(s)${stageName ? ` · ${stageName}` : ''}`;

    el.innerHTML = `
      <div class="phase-context-strip is-compact">
        <div class="phase-context-strip-left">
          ${stageName ? `<span class="phase-context-pill is-small">${escapeHtml(stageName)}</span>` : ''}
          <span class="phase-context-tag is-muted">${escapeHtml(viewLabel)}</span>
        </div>
        ${stageId ? `<button type="button" class="phase-context-go is-ghost" id="docsClearStageFilter">Limpar filtro de fase</button>` : ''}
      </div>
    `;
    el.querySelector('#docsClearStageFilter')?.addEventListener('click', () => {
      state.tabFilters.deliveryStageId = '';
      state.tabFilters.contentView = docUiState.activeView === 'aiArtifacts' ? 'aiArtifacts' : '';
      renderDocumentsPage(state.selectedProject);
      renderPhaseContextBar?.();
    });
  }

  function renderAiArtifactsList(project) {
    const el = $('documentsAiList');
    const meta = $('documentsAiMeta');
    if (!el) return;

    const items = getAiArtifacts(project);
    const scoped = Boolean(getStageId());
    if (meta) {
      meta.textContent = items.length
        ? (scoped
          ? `${items.length} resultado(s) da IA nesta fase. Clique em «Ler» para a versão completa.`
          : `${items.length} resultado(s) gerados pela IA no projecto. Agrupados por fase — clique em «Ler».`)
        : 'Ainda não há resultados da IA. Corra agentes na Linha de Entrega para gerar conteúdo.';
    }

    if (!items.length) {
      el.innerHTML = `<p class="muted-text docs-empty-hint">Sem resultados da IA. Na fase Arquitectura use «Gerar pacote de arquitectura»; noutras fases, corra os agentes na Linha de Entrega.</p>`;
      return;
    }

    const cardHtml = (item) => `
      <article class="ai-read-card" data-ai-kind="${escapeHtml(item.kind)}" data-ai-id="${escapeHtml(item.id)}">
        <div class="ai-read-card-head">
          <span class="ai-read-kind">${escapeHtml(friendlyLabel(item))}</span>
          ${friendlyDate(item.updatedAt) ? `<span class="ai-read-date">${escapeHtml(friendlyDate(item.updatedAt))}</span>` : ''}
        </div>
        <h4 class="ai-read-title">${escapeHtml(item.title)}</h4>
        <p class="ai-read-excerpt">${escapeHtml(item.preview || 'Sem resumo.')}</p>
        <button type="button" class="btn tiny primary ai-read-open" data-open-ai-artifact="${escapeHtml(item.kind)}:${escapeHtml(item.id)}">Ler</button>
      </article>
    `;

    if (scoped) {
      el.innerHTML = `<div class="ai-read-list">${items.map(cardHtml).join('')}</div>`;
    } else {
      // Group by phase for a narrative, top-to-bottom reading order.
      const byStage = new Map();
      for (const item of items) {
        const sid = item.stageId || 'requirements';
        if (!byStage.has(sid)) byStage.set(sid, []);
        byStage.get(sid).push(item);
      }
      const orderedStages = stageOrderList().filter((sid) => byStage.has(sid));
      el.innerHTML = orderedStages.map((sid) => `
        <section class="ai-read-group">
          <h3 class="ai-read-group-title">${escapeHtml(stageLabel(sid))}<span class="ai-read-group-count">${byStage.get(sid).length}</span></h3>
          <div class="ai-read-list">${byStage.get(sid).map(cardHtml).join('')}</div>
        </section>
      `).join('');
    }

    el.querySelectorAll('[data-open-ai-artifact]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [kind, id] = btn.dataset.openAiArtifact.split(':');
        const item = items.find((entry) => entry.kind === kind && entry.id === id);
        if (item) openAiArtifactModal(item, project);
      });
    });
  }

  function renderUploadsList(project) {
    const el = $('documentsList');
    if (!el) return;
    const docs = getUploadDocuments(project);

    if (!docs.length) {
      el.innerHTML = `<div class="simple-item"><small>${getStageId() ? 'Sem anexos nesta fase.' : 'Sem documentos carregados.'}</small></div>`;
      return;
    }

    el.innerHTML = docs.map((doc) => {
      const name = doc.title || doc.originalName;
      const stage = doc.deliveryStageId ? stageLabel(doc.deliveryStageId) : '';
      return `
        <div class="simple-item doc-list-item">
          <button type="button" class="nav-link-btn" data-open-doc="${escapeHtml(doc.id)}">
            <strong>${escapeHtml(name)}</strong>
          </button>
          <small>${new Date(doc.uploadedAt || doc.createdAt).toLocaleString('pt-PT')}${stage ? ` · ${escapeHtml(stage)}` : ''}</small>
          <a href="/api/projects/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(doc.id)}/download" target="_blank" rel="noopener">Download</a>
        </div>
      `;
    }).join('');

    el.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = docs.find((d) => d.id === btn.dataset.openDoc);
        if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
      });
    });
  }

  async function renderReadPane(markdown) {
    const pane = $('aiArtifactReadPane');
    if (!pane) return;
    const md = String(markdown || '').trim();
    if (!md) {
      pane.innerHTML = '<p class="muted-text">Sem conteúdo legível.</p>';
      return;
    }
    try {
      const res = await apiRequest('/markdown/render', { method: 'POST', body: { markdown: md } });
      pane.innerHTML = res.html || escapeHtml(md);
    } catch {
      pane.textContent = md;
    }
  }

  function setAiModalMode(mode) {
    // mode: 'read' | 'edit'
    const editing = mode === 'edit';
    $('aiArtifactReadPane')?.classList.toggle('hidden', editing);
    $('aiArtifactEditForm')?.classList.toggle('hidden', !editing);
    $('aiArtifactEditToggle')?.classList.toggle('hidden', editing);
    $('aiArtifactModalSave')?.classList.toggle('hidden', !editing);
    $('aiArtifactModalCancel')?.classList.toggle('hidden', !editing);
  }

  function openAiArtifactModal(item, project) {
    const modal = $('aiArtifactModal');
    if (!modal || !item) return;

    docUiState.modalItem = item;
    docUiState.modalDirty = false;
    $('aiArtifactModalDirty')?.classList.add('hidden');
    $('aiArtifactModalTitle').textContent = item.title;
    $('aiArtifactModalKind').textContent = friendlyLabel(item);

    const readonly = !canEdit();
    const showTitle = item.kind === 'artifact' || item.kind === 'document';
    $('aiArtifactTitleField')?.classList.toggle('hidden', !showTitle);
    if ($('aiArtifactTitleInput')) {
      $('aiArtifactTitleInput').value = item.title;
      $('aiArtifactTitleInput').disabled = readonly;
    }

    $('aiArtifactContentInput').value = item.contentMarkdown || '';
    $('aiArtifactContentInput').disabled = readonly;

    const promptBlock = $('aiArtifactPromptBlock');
    if (promptBlock) {
      if (item.kind === 'prompt_run' && item.fullPrompt) {
        promptBlock.classList.remove('hidden');
        $('aiArtifactPromptInput').value = item.fullPrompt;
        $('aiArtifactPromptInput').disabled = true;
      } else {
        promptBlock.classList.add('hidden');
      }
    }

    $('aiArtifactModalMeta').innerHTML = `
      ${item.stageId ? `<span>Fase: <strong>${escapeHtml(stageLabel(item.stageId))}</strong></span>` : ''}
      <span>Tipo: <strong>${escapeHtml(friendlyLabel(item))}</strong></span>
    `;

    // Read-first: render the content as readable markdown; editing is opt-in.
    renderReadPane(item.contentMarkdown);
    setAiModalMode('read');
    $('aiArtifactEditToggle')?.classList.toggle('hidden', readonly || !item.editable);

    $('aiArtifactModalSave').disabled = readonly || !item.editable;
    modal.classList.remove('hidden');

    const contentInput = $('aiArtifactContentInput');
    const titleInput = $('aiArtifactTitleInput');
    if (contentInput) contentInput.oninput = markAiModalDirty;
    if (titleInput) titleInput.oninput = markAiModalDirty;
  }

  function markAiModalDirty() {
    docUiState.modalDirty = true;
    $('aiArtifactModalDirty')?.classList.remove('hidden');
  }

  function closeAiArtifactModal() {
    if (docUiState.modalDirty && !confirm('Existem alterações não guardadas. Fechar mesmo assim?')) return;
    $('aiArtifactModal')?.classList.add('hidden');
    docUiState.modalItem = null;
    docUiState.modalDirty = false;
  }

  async function saveAiArtifactModal() {
    const project = state.selectedProject;
    const item = docUiState.modalItem;
    if (!project || !item) return;

    const title = $('aiArtifactTitleInput')?.value?.trim();
    const contentMarkdown = $('aiArtifactContentInput')?.value ?? '';

    try {
      let res;
      if (item.kind === 'artifact') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/artifacts`, {
          method: 'POST',
          body: {
            id: item.id,
            type: item.raw?.type || item.typeLabel,
            name: title || item.title,
            bodyMarkdown: contentMarkdown,
            description: contentMarkdown.slice(0, 280),
            stageId: item.stageId,
            status: item.status,
            metadata: item.raw?.metadata,
          },
        });
      } else if (item.kind === 'document') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: {
            title: title || item.title,
            contentMarkdown,
          },
        });
      } else if (item.kind === 'prompt_run') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/prompt-runs/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: { summaryMarkdown: contentMarkdown },
        });
      } else if (item.kind === 'information_entry') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/information-entries/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: { bodyMarkdown: contentMarkdown },
        });
      }

      if (res?.project) {
        state.selectedProject = res.project;
        docUiState.modalDirty = false;
        $('aiArtifactModalDirty')?.classList.add('hidden');
        if (docUiState.modalItem) docUiState.modalItem.contentMarkdown = contentMarkdown;
        renderReadPane(contentMarkdown);
        setAiModalMode('read');
        renderDocumentsPage(state.selectedProject);
        renderProjectDetails?.();
        showToast('Artefacto guardado.', 'ok');
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function initDocumentsUi() {
    $('aiArtifactModalClose')?.addEventListener('click', closeAiArtifactModal);
    $('aiArtifactModalCancel')?.addEventListener('click', () => setAiModalMode('read'));
    $('aiArtifactModalSave')?.addEventListener('click', saveAiArtifactModal);
    $('aiArtifactEditToggle')?.addEventListener('click', () => setAiModalMode('edit'));
    $('aiArtifactModalCopy')?.addEventListener('click', () => {
      const text = $('aiArtifactContentInput')?.value || docUiState.modalItem?.contentMarkdown || '';
      navigator.clipboard?.writeText(text).then(() => showToast('Copiado.', 'ok'));
    });
  }

  window.DocumentsUI = {
    renderDocumentsPage,
    openAiArtifactModal,
    initDocumentsUi,
  };

  document.addEventListener('DOMContentLoaded', initDocumentsUi);
})();
