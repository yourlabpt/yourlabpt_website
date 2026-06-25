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

  function $(id) {
    return document.getElementById(id);
  }

  function getStageId() {
    return state.tabFilters?.deliveryStageId || state.deliverySelectedStageId || '';
  }

  function getAiArtifacts(project) {
    const stageId = getStageId() || 'requirements';
    return window.PhaseContent?.collectAiArtifacts?.(project, stageId) || [];
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
    if (meta) {
      meta.textContent = items.length
        ? `${items.length} artefacto(s) gerado(s) pela IA nesta fase — clique para ver e editar.`
        : 'Nenhum artefacto IA nesta fase. Gere conteúdo na Linha de Entrega ou importe output de agentes.';
    }

    if (!items.length) {
      el.innerHTML = `<p class="muted-text docs-empty-hint">Sem artefactos IA. Na fase Arquitectura, use «Gerar pacote de arquitectura»; noutras fases, corra agentes na Linha de Entrega.</p>`;
      return;
    }

    el.innerHTML = items.map((item) => `
      <article class="ai-artifact-card" data-ai-kind="${escapeHtml(item.kind)}" data-ai-id="${escapeHtml(item.id)}">
        <div class="ai-artifact-card-top">
          <span class="ai-artifact-kind">${escapeHtml(KIND_LABELS[item.kind] || item.typeLabel)}</span>
          <span class="ai-artifact-type">${escapeHtml(item.typeLabel)}</span>
        </div>
        <h4 class="ai-artifact-title">${escapeHtml(item.title)}</h4>
        <p class="ai-artifact-preview">${escapeHtml(item.preview || 'Sem pré-visualização.')}</p>
        <div class="ai-artifact-meta">
          <span>${item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-PT') : '—'}</span>
          ${item.status ? `<span class="ai-artifact-status">${escapeHtml(item.status)}</span>` : ''}
        </div>
        <button type="button" class="ai-artifact-open-btn" data-open-ai-artifact="${escapeHtml(item.kind)}:${escapeHtml(item.id)}">
          Ver e editar
        </button>
      </article>
    `).join('');

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

  function openAiArtifactModal(item, project) {
    const modal = $('aiArtifactModal');
    if (!modal || !item) return;

    docUiState.modalItem = item;
    docUiState.modalDirty = false;
    $('aiArtifactModalDirty')?.classList.add('hidden');
    $('aiArtifactModalTitle').textContent = item.title;
    $('aiArtifactModalKind').textContent = KIND_LABELS[item.kind] || item.typeLabel;

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
      <span>Tipo: <strong>${escapeHtml(item.typeLabel)}</strong></span>
      ${item.stageId ? `<span>Fase: <strong>${escapeHtml(stageLabel(item.stageId))}</strong></span>` : ''}
      ${item.status ? `<span>Estado: <strong>${escapeHtml(item.status)}</strong></span>` : ''}
    `;

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
    $('aiArtifactModalCancel')?.addEventListener('click', closeAiArtifactModal);
    $('aiArtifactModalSave')?.addEventListener('click', saveAiArtifactModal);
    $('aiArtifactModalCopy')?.addEventListener('click', () => {
      const text = $('aiArtifactContentInput')?.value || '';
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
