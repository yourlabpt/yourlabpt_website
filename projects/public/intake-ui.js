/**
 * The questions that define a project.
 *
 * Placed on Entregas, next to where an unanswered question blocks the work, rather than
 * on a screen of its own — the fix belongs beside the problem. Each question shows why
 * it is being asked: a question whose purpose you cannot see gets a throwaway answer,
 * and a throwaway answer is exactly what sends an agent off building the wrong thing.
 */
(function initIntakeUi() {
  const state = { projectId: '', data: null, loading: false, dirty: new Map() };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function answerFor(questionId) {
    if (state.dirty.has(questionId)) return state.dirty.get(questionId);
    return state.data?.answers?.find((entry) => entry.questionId === questionId)?.answer || '';
  }

  function field(question) {
    const value = answerFor(question.id);
    if (question.shape === 'choice') {
      const options = ['<option value="">—</option>'].concat(
        (question.options || []).map((option) => `
          <option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`),
      ).join('');
      return `<select data-intake-id="${escapeHtml(question.id)}">${options}</select>`;
    }
    // Short by default so seventeen questions stay scannable; it grows with the answer.
    return `<textarea data-intake-id="${escapeHtml(question.id)}" data-min-height="38" rows="1"
      placeholder="Escreva o que sabe. Vale mais uma resposta curta e honesta do que nenhuma.">${escapeHtml(value)}</textarea>`;
  }

  function renderQuestion(question, missingIds) {
    const missing = missingIds.has(question.id);
    return `
      <li class="intake-question${missing ? ' is-missing' : ''}">
        <label>
          <span class="intake-ask">
            ${escapeHtml(question.question)}
            ${question.required ? '<span class="intake-required">obrigatória</span>' : ''}
          </span>
          <span class="intake-why">${escapeHtml(question.why)}</span>
          ${field(question)}
        </label>
      </li>`;
  }

  function paint() {
    const host = $('pdosIntakeBody');
    const shell = $('pdosIntake');
    if (!host || !shell) return;
    if (state.loading && !state.data) { host.innerHTML = '<p class="muted-text">A carregar…</p>'; return; }
    if (!state.data) { shell.hidden = true; return; }
    shell.hidden = false;

    const { questions, groupOrder, missingRequired } = state.data;
    const missingIds = new Set(missingRequired.map((entry) => entry.id));
    const answered = questions.filter((question) => answerFor(question.id).trim()).length;

    const summary = $('pdosIntakeSummary');
    if (summary) {
      summary.innerHTML = missingRequired.length
        ? `<span class="section-badge badge-amber">Faltam ${missingRequired.length}</span>
           <span class="muted-text">${answered} de ${questions.length} respondidas</span>`
        : `<span class="section-badge badge-green">Definido</span>
           <span class="muted-text">${answered} de ${questions.length} respondidas</span>`;
    }

    const groups = groupOrder
      .map((group) => {
        const rows = questions.filter((question) => question.group === group);
        if (!rows.length) return '';
        return `
          <section class="intake-group">
            <h4>${escapeHtml(group)}</h4>
            <ul class="intake-list">${rows.map((question) => renderQuestion(question, missingIds)).join('')}</ul>
          </section>`;
      })
      .join('');

    host.innerHTML = `
      ${missingRequired.length ? `
        <p class="muted-text">
          Enquanto estas faltarem, uma execução é recusada — os agentes estariam a
          trabalhar sobre suposições.
        </p>` : ''}
      ${groups}
      <div class="settings-save-row mt-12">
        <button type="button" class="btn primary" id="intakeSaveBtn"${state.dirty.size ? '' : ' disabled'}>
          ${state.dirty.size ? `Guardar ${state.dirty.size} resposta(s)` : 'Sem alterações'}
        </button>
      </div>`;
  }

  async function load(projectId) {
    if (!projectId) return;
    if (projectId !== state.projectId) { state.dirty.clear(); state.data = null; }
    state.projectId = projectId;
    state.loading = true;
    paint();
    try {
      state.data = await window.apiRequest(`/${encodeURIComponent(projectId)}/intake`);
    } catch {
      state.data = null;
    } finally {
      state.loading = false;
      paint();
    }
  }

  async function save() {
    if (!state.dirty.size) return;
    const answers = [...state.dirty.entries()].map(([questionId, answer]) => ({ questionId, answer }));
    const payload = await window.apiRequest(`/${encodeURIComponent(state.projectId)}/intake`, {
      method: 'PATCH',
      body: { answers },
    });
    state.dirty.clear();
    state.data = { ...state.data, answers: payload.answers, missingRequired: payload.missingRequired };
    window.showToast?.('Respostas guardadas.', 'ok');
    paint();
    // The gate may have just lifted, so the production line has to be re-read.
    window.ClientPortalUI?.refresh?.(window.state?.selectedProject, { force: true });
  }

  // Typing must not repaint: it would rebuild the field and lose the caret.
  document.addEventListener('input', (event) => {
    const id = event.target?.dataset?.intakeId;
    if (!id) return;
    state.dirty.set(id, event.target.value);
    const button = $('intakeSaveBtn');
    if (button) {
      button.disabled = false;
      button.textContent = `Guardar ${state.dirty.size} resposta(s)`;
    }
  });

  document.addEventListener('change', (event) => {
    const id = event.target?.dataset?.intakeId;
    if (id && event.target.tagName === 'SELECT') state.dirty.set(id, event.target.value);
  });

  document.addEventListener('click', (event) => {
    if (event.target?.id === 'intakeSaveBtn') {
      save().catch((error) => window.showToast?.(error.message, 'error'));
    }
  });

  window.IntakeUI = { render: (project) => load(project?.id), refresh: () => load(state.projectId) };
})();
