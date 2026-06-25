const API = '/api/projects';
const TOKEN_KEY = 'requirements_platform_token';
const NAV_RAIL_DOCKED_KEY = 'platform_navRail_docked';
const NAV_RAIL_EXPANDED_KEY = 'platform_navRail_expanded';
const NAV_RAIL_MORE_OPEN_KEY = 'platform_navRail_more_open';

const PROJECTLESS_TABS = new Set(['projetos', 'definicoes']);

const NAV_ICON_PATHS = {
  folder: 'M8 4h8l1 2h3v14H4V6h3z',
  timeline: 'M3 12h6l2-7 3 14 2-7h5',
  list: 'M8 7h8M8 12h8M8 17h5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  notes: 'M7 4h10v16H7zM9 8h6M9 12h4',
  help: 'M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.8-1.7 1.2-1.7 2.7M12 17h.01',
  chart: 'M4 19V5M4 19h16M8 17V9M12 17V6M16 17v-4',
  plan: 'M4 18h16M7 18V9M12 18V6M17 18v-4',
  bolt: 'M13 3L4 14h6l-1 7 9-11h-6z',
  clock: 'M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l.8-4h-7l.8 4a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a1.7 1.7 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.8 4h7l.8-4a8 8 0 0 0 1.7-1l2.4 1 2-3.5z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
};

const NAV_GROUPS = [
  {
    id: 'main',
    items: [{ id: 'projetos', label: 'Projetos', icon: 'folder' }],
  },
  {
    id: 'work',
    label: 'Trabalho',
    requiresProject: true,
    items: [
      { id: 'deliveryos', label: 'Entrega', icon: 'timeline' },
      { id: 'requisitos', label: 'Requisitos', icon: 'list' },
    ],
  },
  {
    id: 'more',
    label: 'Mais',
    requiresProject: true,
    collapsible: true,
    items: [
      { id: 'projeto', label: 'Visão', icon: 'chart' },
      { id: 'fases', label: 'Fases', icon: 'plan' },
      { id: 'gerar', label: 'Gerar', icon: 'bolt' },
      { id: 'atividade', label: 'Log', icon: 'clock' },
    ],
  },
  {
    id: 'system',
    items: [{ id: 'definicoes', label: 'Definições', icon: 'settings' }],
  },
];

/** Flat lookup for tab metadata */
const NAV_PAGES = NAV_GROUPS.flatMap((g) => g.items);

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  config: null,
  users: [],
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  traceMap: null,
  deliverySelectedStageId: 'requirements',
  selectedRequirementId: null,
  generationModulesSelected: [],
  selectedMinuteIds: [],
  questionFilters: {
    status: '',
    targetRole: '',
    byCurrentStage: true,
  },
  activeTab: 'projetos',
  tabFilters: {
    deliveryStageId: '',
    contentView: '',
    keepModule: false,
  },
  filters: {
    search: '',
    type: '',
    status: '',
    module: '',
    phase: '',
    priority: '',
    onlySmartIssues: false,
  },
};

const els = {
  loginCard: document.getElementById('loginCard'),
  workspace: document.getElementById('workspace'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginStatus: document.getElementById('loginStatus'),
  loginLogo: document.getElementById('loginLogo'),
  workspaceLogo: document.getElementById('workspaceLogo'),
  userChip: document.getElementById('userChip'),
  logoutBtn: document.getElementById('logoutBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  appLayout: document.getElementById('appLayout'),
  navRail: document.getElementById('navRail'),
  navRailItems: document.getElementById('navRailItems'),
  navRailExpandBtn: document.getElementById('navRailExpandBtn'),
  navRailDockBtn: document.getElementById('navRailDockBtn'),
  navRailOpenBtn: document.getElementById('navRailOpenBtn'),
  navRailBackdrop: document.getElementById('navRailBackdrop'),
  currentProjectChip: document.getElementById('currentProjectChip'),
  refreshProjectsBtn: document.getElementById('refreshProjectsBtn'),
  projectsPageGrid: document.getElementById('projectsPageGrid'),
  projectList: document.getElementById('projectList'),
  noProject: document.getElementById('noProject'),
  projectWorkspace: document.getElementById('projectWorkspace'),
  createProjectForm: document.getElementById('createProjectForm'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  settingsThemeToggleBtn: document.getElementById('settingsThemeToggleBtn'),
  settingsUsersCard: document.getElementById('settingsUsersCard'),
  settingsProjectSection: document.getElementById('settingsProjectSection'),
  settingsProjectHint: document.getElementById('settingsProjectHint'),
  settingsProjectBody: document.getElementById('settingsProjectBody'),
  phaseContextBar: document.getElementById('phaseContextBar'),
  usersList: document.getElementById('usersList'),
  createUserForm: document.getElementById('createUserForm'),
  newUserRole: document.getElementById('newUserRole'),
  newUserCanViewBudget: document.getElementById('newUserCanViewBudget'),
  assignMemberForm: document.getElementById('assignMemberForm'),
  assignUserId: document.getElementById('assignUserId'),
  projectMembers: document.getElementById('projectMembers'),
  saveProjectBtn: document.getElementById('saveProjectBtn'),
  saveAdvancedBtn: document.getElementById('saveAdvancedBtn'),
  projectName: document.getElementById('projectName'),
  projectClient: document.getElementById('projectClient'),
  projectStatus: document.getElementById('projectStatus'),
  projectCode: document.getElementById('projectCode'),
  projectRate: document.getElementById('projectRate'),
  projectCurrency: document.getElementById('projectCurrency'),
  projectLanguage: document.getElementById('projectLanguage'),
  projectBudgetMin: document.getElementById('projectBudgetMin'),
  projectBudgetMax: document.getElementById('projectBudgetMax'),
  projectDescription: document.getElementById('projectDescription'),
  summaryBusinessContext: document.getElementById('summaryBusinessContext'),
  summaryGoals: document.getElementById('summaryGoals'),
  summaryScope: document.getElementById('summaryScope'),
  summarySolution: document.getElementById('summarySolution'),
  projectKpis: document.getElementById('projectKpis'),
  projectReadability: document.getElementById('projectReadability'),
  uploadDocForm: document.getElementById('uploadDocForm'),
  docFile: document.getElementById('docFile'),
  documentsList: document.getElementById('documentsList'),
  addMeetingMinuteForm: document.getElementById('addMeetingMinuteForm'),
  meetingMinuteDate: document.getElementById('meetingMinuteDate'),
  meetingMinuteTitle: document.getElementById('meetingMinuteTitle'),
  meetingMinuteRaw: document.getElementById('meetingMinuteRaw'),
  meetingMinuteImpactScope: document.getElementById('meetingMinuteImpactScope'),
  minutesPromptObjective: document.getElementById('minutesPromptObjective'),
  minutesPromptExtraInstructions: document.getElementById('minutesPromptExtraInstructions'),
  buildMinutesPromptBtn: document.getElementById('buildMinutesPromptBtn'),
  minutesPromptOutput: document.getElementById('minutesPromptOutput'),
  requirementsChangeJson: document.getElementById('requirementsChangeJson'),
  importRequirementChangesBtn: document.getElementById('importRequirementChangesBtn'),
  minutesHistoryList: document.getElementById('minutesHistoryList'),
  minutesPromptHistoryList: document.getElementById('minutesPromptHistoryList'),
  minutePropagationPanel: document.getElementById('minutePropagationPanel'),
  analyzeMinutePropagationBtn: document.getElementById('analyzeMinutePropagationBtn'),
  generateMinutePropagationPromptBtn: document.getElementById('generateMinutePropagationPromptBtn'),
  addQuestionForm: document.getElementById('addQuestionForm'),
  questionText: document.getElementById('questionText'),
  questionContext: document.getElementById('questionContext'),
  questionTargetRole: document.getElementById('questionTargetRole'),
  questionCategory: document.getElementById('questionCategory'),
  questionPriority: document.getElementById('questionPriority'),
  questionStatus: document.getElementById('questionStatus'),
  questionDeliveryStage: document.getElementById('questionDeliveryStage'),
  questionDueDate: document.getElementById('questionDueDate'),
  questionLinkedRequirementIds: document.getElementById('questionLinkedRequirementIds'),
  questionFilterStatus: document.getElementById('questionFilterStatus'),
  questionFilterTargetRole: document.getElementById('questionFilterTargetRole'),
  questionsMeta: document.getElementById('questionsMeta'),
  questionsTable: document.getElementById('questionsTable'),
  sourceText: document.getElementById('sourceText'),
  saveSourceTextBtn: document.getElementById('saveSourceTextBtn'),
  buildPromptBtn: document.getElementById('buildPromptBtn'),
  aiPrompt: document.getElementById('aiPrompt'),
  aiJson: document.getElementById('aiJson'),
  importAiBtn: document.getElementById('importAiBtn'),
  addRequirementForm: document.getElementById('addRequirementForm'),
  reqType: document.getElementById('reqType'),
  reqTitle: document.getElementById('reqTitle'),
  reqStatus: document.getElementById('reqStatus'),
  reqPriority: document.getElementById('reqPriority'),
  reqPhase: document.getElementById('reqPhase'),
  reqDescription: document.getElementById('reqDescription'),
  reqSearch: document.getElementById('reqSearch'),
  reqFilterType: document.getElementById('reqFilterType'),
  reqFilterStatus: document.getElementById('reqFilterStatus'),
  reqFilterModule: document.getElementById('reqFilterModule'),
  reqOnlySmartIssues: document.getElementById('reqOnlySmartIssues'),
  requirementsMeta: document.getElementById('requirementsMeta'),
  submoduleSuggestions: document.getElementById('submoduleSuggestions'),
  reqModule: document.getElementById('reqModule'),
  reqSubmodule: document.getElementById('reqSubmodule'),
  reqRelatedIds: document.getElementById('reqRelatedIds'),
  requirementsTable: document.getElementById('requirementsTable'),
  implementationPlanView: document.getElementById('implementationPlanView'),
  requirementDetailPanel: document.getElementById('requirementDetailPanel'),
  requirementDetailEmpty: document.getElementById('requirementDetailEmpty'),
  requirementQuickView: document.getElementById('requirementQuickView'),
  requirementDetailForm: document.getElementById('requirementDetailForm'),
  saveRequirementDetailsBtn: document.getElementById('saveRequirementDetailsBtn'),
  deleteRequirementDetailsBtn: document.getElementById('deleteRequirementDetailsBtn'),
  detailReqId: document.getElementById('detailReqId'),
  detailReqType: document.getElementById('detailReqType'),
  detailReqStatus: document.getElementById('detailReqStatus'),
  detailReqPriority: document.getElementById('detailReqPriority'),
  detailReqPhase: document.getElementById('detailReqPhase'),
  detailReqModule: document.getElementById('detailReqModule'),
  detailReqSubmodule: document.getElementById('detailReqSubmodule'),
  detailReqVersion: document.getElementById('detailReqVersion'),
  detailReqTitle: document.getElementById('detailReqTitle'),
  detailReqNeed: document.getElementById('detailReqNeed'),
  detailReqShall: document.getElementById('detailReqShall'),
  detailReqCondition: document.getElementById('detailReqCondition'),
  detailReqMeasure: document.getElementById('detailReqMeasure'),
  detailReqRationale: document.getElementById('detailReqRationale'),
  detailReqVerification: document.getElementById('detailReqVerification'),
  detailReqAssumption: document.getElementById('detailReqAssumption'),
  detailReqStakeholderLink: document.getElementById('detailReqStakeholderLink'),
  detailReqLinkedFunctionalRequirement: document.getElementById('detailReqLinkedFunctionalRequirement'),
  detailReqBusinessValue: document.getElementById('detailReqBusinessValue'),
  detailReqTarget: document.getElementById('detailReqTarget'),
  detailReqRelatedIds: document.getElementById('detailReqRelatedIds'),
  detailReqNotes: document.getElementById('detailReqNotes'),
  phasesJson: document.getElementById('phasesJson'),
  integrationsJson: document.getElementById('integrationsJson'),
  risksText: document.getElementById('risksText'),
  assumptionsText: document.getElementById('assumptionsText'),
  riskAssumptionView: document.getElementById('riskAssumptionView'),
  commercialTermsJson: document.getElementById('commercialTermsJson'),
  technicalApproachJson: document.getElementById('technicalApproachJson'),
  generateTechnicalBtn: document.getElementById('generateTechnicalBtn'),
  generateCommercialBtn: document.getElementById('generateCommercialBtn'),
  dryRunToggle: document.getElementById('dryRunToggle'),
  generationModules: document.getElementById('generationModules'),
  generatedLinks: document.getElementById('generatedLinks'),
  refreshActivityBtn: document.getElementById('refreshActivityBtn'),
  activityList: document.getElementById('activityList'),
  globalStatus: document.getElementById('globalStatus'),
};

function statusOptions() {
  const source = state.config?.statusFlow || [];
  return source.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
}

function questionStatusOptions() {
  const source = state.config?.questionStatusFlow || ['open', 'sent', 'answered', 'resolved', 'blocked'];
  return source.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
}

function questionTargetOptions() {
  const source = state.config?.questionTargetFlow || ['client', 'partner', 'both'];
  return source.map((target) => `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`).join('');
}

function questionCategoryOptions() {
  const source = state.config?.questionCategoryFlow || ['scope', 'functional', 'non_functional', 'integration', 'data', 'business_rule', 'ux', 'security', 'timeline', 'pricing', 'other'];
  return source.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
}

async function apiRequest(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (!isForm) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body
      ? isForm
        ? body
        : JSON.stringify(body)
      : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text || 'Resposta inválida do servidor.' };
  }

  if (!response.ok) {
    const message = payload?.message || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function showToast(message, type = 'ok') {
  const el = els.globalStatus;
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3800);
}

function setLoginStatus(message, type = 'error') {
  els.loginStatus.className = `status ${type}`;
  els.loginStatus.textContent = message;
}

function clearLoginStatus() {
  els.loginStatus.className = 'status';
  els.loginStatus.textContent = '';
}

function isSuperAdmin() {
  return state.user?.role === 'super_admin';
}

function canEdit() {
  return isSuperAdmin();
}

function canViewBudget() {
  return state.user?.canViewBudget === true;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linesToArray(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(values) {
  return (Array.isArray(values) ? values : []).join('\n');
}

function valueToLines(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value || '');
}

function autoResizeTextarea(node) {
  if (!node || node.tagName !== 'TEXTAREA') return;
  node.style.height = 'auto';
  node.style.height = `${Math.max(node.scrollHeight, 64)}px`;
}

function refreshAutoResize(root = document) {
  Array.from(root.querySelectorAll('textarea')).forEach((node) => autoResizeTextarea(node));
}

function shortText(value, max = 240) {
  const text = String(value || '').trim();
  if (!text) return 'N/A';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function renderSimpleListHtml(items) {
  const safe = Array.isArray(items) ? items.filter((entry) => String(entry || '').trim()) : [];
  if (!safe.length) return '<p class="muted">N/A</p>';
  return `<ul>${safe.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`;
}

function splitRequirementIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .map((entry) => entry.toUpperCase());
  }
  return String(value || '')
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toUpperCase());
}

function joinRequirementIds(value) {
  return splitRequirementIds(value).join(', ');
}

function getArchitectureModules() {
  const modules = Array.isArray(state.config?.architectureModules) ? state.config.architectureModules : [];
  return modules.length ? modules : ['Frontend', 'Backend', 'Database'];
}

function normalizeForCompare(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeModuleToken(value) {
  const text = normalizeForCompare(value);
  if (!text) return null;
  const hasWord = (word) => new RegExp(`(^|\\s)${word}(\\s|$)`).test(text);

  if (text.includes('frontend') || text.includes('front end') || hasWord('ui') || hasWord('ux') || text.includes('client')) {
    return 'Frontend';
  }
  if (text.includes('database') || text.includes('base de dados') || text.includes('banco de dados') || text === 'db' || text.includes('schema') || text.includes('sql') || text.includes('postgres')) {
    return 'Database';
  }
  if (text.includes('backend') || text.includes('back end') || text.includes('api') || text.includes('server') || text.includes('servico')) {
    return 'Backend';
  }
  return null;
}

function normalizeModuleName(value) {
  const direct = normalizeModuleToken(value);
  if (direct) return direct;
  if (getArchitectureModules().includes(String(value || '').trim())) {
    return String(value || '').trim();
  }
  return 'Backend';
}

function normalizeSubmoduleName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatModuleLabel(requirement) {
  const tags = Array.isArray(requirement?.moduleTags) ? requirement.moduleTags.filter(Boolean) : [];
  if (tags.length) return tags.join(', ');
  const moduleName = normalizeModuleName(requirement?.module);
  const submodule = normalizeSubmoduleName(requirement?.submodule);
  return submodule ? `${moduleName} / ${submodule}` : moduleName;
}

function collectModules() {
  return getArchitectureModules().slice();
}

function collectSubmodules(project = state.selectedProject, moduleName = '') {
  const requirements = Array.isArray(project?.requirements) ? project.requirements : [];
  const selectedModule = moduleName ? normalizeModuleName(moduleName) : '';
  const values = requirements
    .filter((req) => !selectedModule || normalizeModuleName(req.module) === selectedModule)
    .map((req) => normalizeSubmoduleName(req.submodule))
    .filter(Boolean);
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

function getSelectedRequirement(project = state.selectedProject) {
  if (!project || !state.selectedRequirementId) return null;
  return (project.requirements || []).find((entry) => entry.id === state.selectedRequirementId) || null;
}

function getFilteredRequirements(items) {
  const search = String(state.filters.search || '').trim().toLowerCase();
  const type = String(state.filters.type || '');
  const status = String(state.filters.status || '');
  const module = String(state.filters.module || '');
  const onlySmartIssues = Boolean(state.filters.onlySmartIssues);

  return items.filter((req) => {
    if (type && req.type !== type) return false;
    if (status && req.status !== status) return false;
    if (module && normalizeModuleName(req.module) !== module) return false;
    if (onlySmartIssues && !(req.type === 'functional' && !req.smartIsValid)) return false;

    if (!search) return true;
    const searchable = [
      req.id,
      req.title,
      req.module,
      req.submodule,
      req.need,
      req.shall,
      req.condition,
      req.measure,
      req.rationale,
      req.verification,
      req.phase,
      joinRequirementIds(req.relatedRequirementIds),
    ].map((entry) => String(entry || '').toLowerCase()).join(' ');
    return searchable.includes(search);
  });
}

function setReadonlyByRole() {
  const readonly = !canEdit();

  const editableIds = [
    'saveProjectBtn', 'saveAdvancedBtn', 'assignMemberForm', 'createProjectForm', 'createUserForm',
    'uploadDocForm', 'addMeetingMinuteForm', 'addQuestionForm', 'saveSourceTextBtn', 'buildPromptBtn', 'buildMinutesPromptBtn', 'importRequirementChangesBtn', 'importAiBtn', 'addRequirementForm',
    'generateTechnicalBtn', 'generateCommercialBtn'
  ];

  editableIds.forEach((id) => {
    const el = els[id];
    if (!el) return;
    if (el.tagName === 'FORM') {
      Array.from(el.querySelectorAll('input, textarea, select, button')).forEach((node) => {
        node.disabled = readonly;
      });
      return;
    }
    el.disabled = readonly;
  });

  Array.from(els.requirementDetailForm.querySelectorAll('input, textarea, select')).forEach((node) => {
    if (node.id === 'detailReqId' || node.id === 'detailReqType') {
      return;
    }
    node.disabled = readonly;
  });
  els.saveRequirementDetailsBtn.disabled = readonly;
  els.deleteRequirementDetailsBtn.disabled = readonly;

  if (els.settingsUsersCard) els.settingsUsersCard.classList.toggle('hidden', !isSuperAdmin());
}

function setMonetaryVisibilityByRole() {
  const hideMonetary = !canViewBudget();

  Array.from(document.querySelectorAll('[data-sensitive-money]')).forEach((node) => {
    node.classList.toggle('hidden', hideMonetary);
  });
}

function syncBudgetAccessControl() {
  if (!els.newUserRole || !els.newUserCanViewBudget) return;
  const isPartner = els.newUserRole.value === 'partner';
  els.newUserCanViewBudget.disabled = !isPartner;
  if (!isPartner) {
    els.newUserCanViewBudget.checked = false;
  }
}

function renderUsersPanel() {
  if (!isSuperAdmin()) return;

  const visibleUsers = state.users.filter((user) => user.role !== 'super_admin');
  els.usersList.innerHTML = visibleUsers.length
    ? visibleUsers.map((user) => `
      <div class="simple-item">
        <strong>${escapeHtml(user.name)}</strong>
        <small>${escapeHtml(user.email)} • ${escapeHtml(user.role)}${user.canViewBudget ? ' • budget' : ''}</small>
      </div>
    `).join('')
    : '<div class="simple-item"><small>Sem utilizadores client/partner.</small></div>';

  els.assignUserId.innerHTML = visibleUsers
    .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>`)
    .join('');
}

function renderProjects() {
  renderProjectsPage();
  const selected = state.selectedProjectId;
  if (!state.projects.length) {
    if (els.projectList) {
      els.projectList.innerHTML = '<div class="simple-item"><small>Sem projetos ainda.</small></div>';
    }
    renderCurrentProjectChip();
    return;
  }

  if (els.projectList) {
    els.projectList.innerHTML = state.projects.map((project) => {
      const active = selected === project.id ? 'active' : '';
      return `
        <article class="project-item ${active}" data-project-id="${escapeHtml(project.id)}">
          <h4>${escapeHtml(project.name)}</h4>
          <p>${escapeHtml(project.clientName)} • ${escapeHtml(project.status || 'active')}</p>
        </article>
      `;
    }).join('');
  }
  renderCurrentProjectChip();
}

function renderProjectsPage() {
  const grid = els.projectsPageGrid;
  if (!grid) return;
  const selected = state.selectedProjectId;

  if (!state.projects.length) {
    grid.innerHTML = `
      <div class="projects-empty read-card">
        <h4>Ainda não há projectos</h4>
        <p class="muted-text">Use o formulário abaixo para criar o primeiro projecto.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.projects.map((project) => {
    const active = selected === project.id ? 'is-active' : '';
    const reqCount = Array.isArray(project.requirements) ? project.requirements.length : (project.requirementCount || 0);
    return `
      <article class="project-card ${active}" data-project-id="${escapeHtml(project.id)}">
        <div class="project-card-head">
          <h4>${escapeHtml(project.name)}</h4>
          <span class="project-card-status">${escapeHtml(project.status || 'active')}</span>
        </div>
        <p class="project-card-client">${escapeHtml(project.clientName || '—')}</p>
        <div class="project-card-meta">
          <span>${reqCount} requisitos</span>
          <span>${escapeHtml(project.proposalCode || project.id)}</span>
        </div>
        <button type="button" class="btn tiny primary project-card-open" data-project-id="${escapeHtml(project.id)}">Abrir projecto</button>
      </article>
    `;
  }).join('');
}

function renderCurrentProjectChip() {
  const chip = els.currentProjectChip;
  if (!chip) return;
  const project = state.selectedProject;
  if (!project) {
    chip.classList.add('hidden');
    chip.innerHTML = '';
    return;
  }
  chip.classList.remove('hidden');
  chip.innerHTML = `
    <strong>${escapeHtml(project.name)}</strong>
    <button type="button" class="btn tiny ghost" data-goto-tab="projetos" title="Trocar projecto">↔</button>
  `;
}

function navIconSvg(iconKey) {
  const path = NAV_ICON_PATHS[iconKey] || NAV_ICON_PATHS.folder;
  return `<svg class="nav-rail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function isNavGroupVisible(group) {
  if (group.requiresProject && !state.selectedProject) return false;
  return true;
}

function isNavPageRequiresProject(pageId) {
  const page = NAV_PAGES.find((p) => p.id === pageId);
  if (!page) return false;
  const group = NAV_GROUPS.find((g) => g.items.some((item) => item.id === pageId));
  return Boolean(group?.requiresProject);
}

function renderNavItem(item, { compact = false } = {}) {
  const active = state.activeTab === item.id;
  return `
    <button type="button"
      class="nav-rail-item ${active ? 'active' : ''}"
      data-nav-tab="${escapeHtml(item.id)}"
      title="${escapeHtml(item.label)}"
      aria-label="${escapeHtml(item.label)}"
      aria-current="${active ? 'page' : 'false'}">
      ${navIconSvg(item.icon)}
      <span class="nav-rail-label">${escapeHtml(item.label)}</span>
    </button>
  `;
}

const COLLAPSED_QUICK_NAV = ['projetos', 'deliveryos', 'requisitos', 'definicoes'];

function findNavItem(pageId) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.id === pageId);
    if (item) return item;
  }
  return null;
}

function renderNavRail() {
  const container = els.navRailItems;
  if (!container) return;

  const expanded = localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === 'true';
  const moreOpen = localStorage.getItem(NAV_RAIL_MORE_OPEN_KEY) === 'true';
  const active = state.activeTab;
  const activeInMore = NAV_GROUPS.find((g) => g.id === 'more')?.items.some((i) => i.id === active);

  let html = '';

  if (!expanded) {
    for (const pageId of COLLAPSED_QUICK_NAV) {
      const item = findNavItem(pageId);
      if (!item) continue;
      if (isNavPageRequiresProject(pageId) && !state.selectedProject) continue;
      html += renderNavItem(item);
    }
    if (state.selectedProject) {
      const moreActive = activeInMore || ['projeto', 'documentos', 'atas', 'perguntas', 'fases', 'gerar', 'atividade'].includes(active);
      html += `
        <button type="button" class="nav-rail-item nav-rail-more ${moreActive ? 'active' : ''}" data-nav-more-toggle title="Mais páginas" aria-label="Mais páginas">
          ${navIconSvg('more')}
          <span class="nav-rail-label">Mais</span>
        </button>
      `;
    }
    container.innerHTML = html;
    return;
  }

  for (const group of NAV_GROUPS) {
    if (!isNavGroupVisible(group)) continue;

    if (group.label && group.id === 'work') {
      html += `<div class="nav-rail-group-label">${escapeHtml(group.label)}</div>`;
    }

    if (group.collapsible && expanded) {
      const open = moreOpen || activeInMore;
      html += `<details class="nav-rail-group" ${open ? 'open' : ''} data-nav-group="more">
        <summary class="nav-rail-group-summary">${escapeHtml(group.label)}</summary>
        <div class="nav-rail-group-items">
          ${group.items.map((item) => renderNavItem(item)).join('')}
        </div>
      </details>`;
      continue;
    }

    html += group.items.map((item) => renderNavItem(item)).join('');
  }

  container.innerHTML = html;
}

function applyNavRailLayout() {
  const layout = els.appLayout;
  const rail = els.navRail;
  if (!layout || !rail) return;

  const docked = localStorage.getItem(NAV_RAIL_DOCKED_KEY) !== 'false';
  const expanded = localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === 'true';
  const overlayOpen = layout.classList.contains('nav-rail-open');

  layout.classList.toggle('is-docked', docked);
  layout.classList.toggle('is-overlay', !docked);
  layout.classList.toggle('is-expanded', expanded);
  layout.classList.toggle('is-collapsed', !expanded);

  if (els.navRailExpandBtn) {
    els.navRailExpandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    els.navRailExpandBtn.title = expanded ? 'Recolher menu' : 'Expandir menu';
    const path = els.navRailExpandBtn.querySelector('path');
    if (path) path.setAttribute('d', expanded ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6');
  }

  if (els.navRailDockBtn) {
    els.navRailDockBtn.setAttribute('aria-pressed', docked ? 'true' : 'false');
    els.navRailDockBtn.title = docked ? 'Modo sobreposto (libertar espaço)' : 'Fixar barra lateral';
    els.navRailDockBtn.querySelector('.nav-icon-docked')?.classList.toggle('hidden', !docked);
    els.navRailDockBtn.querySelector('.nav-icon-overlay')?.classList.toggle('hidden', docked);
  }

  els.navRailOpenBtn?.classList.toggle('hidden', docked || overlayOpen);
  els.navRailBackdrop?.classList.toggle('hidden', docked || !overlayOpen);

  if (docked) {
    layout.classList.remove('nav-rail-open');
    rail.style.transform = '';
    rail.style.left = '';
    rail.style.top = '';
  }
}

function setNavRailOverlayOpen(open) {
  els.appLayout?.classList.toggle('nav-rail-open', open);
  els.navRailBackdrop?.classList.toggle('hidden', !open);
  els.navRailOpenBtn?.classList.toggle('hidden', open);
  applyNavRailLayout();
}

function initNavRail() {
  if (localStorage.getItem(NAV_RAIL_DOCKED_KEY) === null) {
    localStorage.setItem(NAV_RAIL_DOCKED_KEY, 'true');
  }
  if (localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === null) {
    localStorage.setItem(NAV_RAIL_EXPANDED_KEY, 'false');
  }

  applyNavRailLayout();
  renderNavRail();

  els.navRailExpandBtn?.addEventListener('click', () => {
    const expanded = localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === 'true';
    localStorage.setItem(NAV_RAIL_EXPANDED_KEY, expanded ? 'false' : 'true');
    applyNavRailLayout();
    renderNavRail();
  });

  els.navRailDockBtn?.addEventListener('click', () => {
    const docked = localStorage.getItem(NAV_RAIL_DOCKED_KEY) !== 'false';
    localStorage.setItem(NAV_RAIL_DOCKED_KEY, docked ? 'false' : 'true');
    if (!docked) setNavRailOverlayOpen(false);
    applyNavRailLayout();
    renderNavRail();
  });

  els.navRailOpenBtn?.addEventListener('click', () => setNavRailOverlayOpen(true));
  els.navRailBackdrop?.addEventListener('click', () => setNavRailOverlayOpen(false));

  els.navRailItems?.addEventListener('click', (event) => {
    const moreBtn = event.target.closest('[data-nav-more-toggle]');
    if (moreBtn) {
      localStorage.setItem(NAV_RAIL_EXPANDED_KEY, 'true');
      localStorage.setItem(NAV_RAIL_MORE_OPEN_KEY, 'true');
      applyNavRailLayout();
      renderNavRail();
      return;
    }

    const btn = event.target.closest('[data-nav-tab]');
    if (!btn) return;
    switchToTab(btn.dataset.navTab);
    if (els.appLayout?.classList.contains('is-overlay')) {
      setNavRailOverlayOpen(false);
    }
  });

  els.navRailItems?.addEventListener('toggle', (event) => {
    const details = event.target.closest('details[data-nav-group="more"]');
    if (!details) return;
    localStorage.setItem(NAV_RAIL_MORE_OPEN_KEY, details.open ? 'true' : 'false');
  });

  window.addEventListener('resize', () => applyNavRailLayout());
}

function renderProjectDetails() {
  renderSettingsAvailability();
  renderNavRail();
  const project = state.selectedProject;

  els.projectWorkspace.classList.remove('hidden');

  if (!project) {
    const allowed = PROJECTLESS_TABS.has(state.activeTab);
    if (!allowed) {
      state.activeTab = 'projetos';
    }
    els.noProject.classList.toggle('hidden', state.activeTab !== 'projetos');
    document.querySelectorAll('.tab-panel').forEach((p) => {
      const show = p.dataset.panel === state.activeTab || (state.activeTab === 'projetos' && p.dataset.panel === 'projetos');
      p.classList.toggle('hidden', !show);
    });
    renderPhaseContextBar();
    renderProjectsPage();
    return;
  }

  els.noProject.classList.add('hidden');

  els.projectName.value = project.name || '';
  els.projectClient.value = project.clientName || '';
  els.projectStatus.value = project.status || 'active';
  els.projectCode.value = project.proposalCode || '';
  els.projectRate.value = project.hourlyRate || 30;
  els.projectCurrency.value = project.currency || 'EUR';
  els.projectLanguage.value = project.language || 'pt-PT';
  els.projectBudgetMin.value = project.targetBudgetMin || 5000;
  els.projectBudgetMax.value = project.targetBudgetMax || 6000;
  els.projectDescription.value = project.description || '';

  els.summaryBusinessContext.value = project.summary?.businessContext || '';
  els.summaryGoals.value = arrayToLines(project.summary?.goals || []);
  els.summaryScope.value = project.summary?.scopeInPlainLanguage || '';
  els.summarySolution.value = project.summary?.solutionOverview || '';

  els.sourceText.value = project.sourceText || '';
  els.aiPrompt.value = project.aiPrompt || '';
  if (els.requirementsChangeJson && !els.requirementsChangeJson.value) {
    els.requirementsChangeJson.value = '';
  }

  els.phasesJson.value = JSON.stringify(project.phases || [], null, 2);
  els.integrationsJson.value = JSON.stringify(project.integrations || [], null, 2);
  els.risksText.value = arrayToLines(project.risks || []);
  els.assumptionsText.value = arrayToLines(project.assumptions || []);
  els.commercialTermsJson.value = JSON.stringify(project.commercialTerms || {}, null, 2);
  els.technicalApproachJson.value = JSON.stringify(project.technicalApproach || {}, null, 2);

  renderProjectClarity(project);
  renderMembers(project);
  renderDocuments(project);
  renderMeetingMinutes(project);
  renderClarificationQuestions(project);
  renderRequirementModuleControls(project);
  renderRequirements(project);
  renderImplementationPlan(project);
  renderRiskAssumptionView(project);
  renderGenerated(project);
  if (window.PdosUI) window.PdosUI.renderAll(project);
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.panel !== state.activeTab);
  });
  renderPhaseContextBar();
  requestAnimationFrame(() => refreshAutoResize(els.projectWorkspace));
}

function renderProjectClarity(project) {
  const reqs = Array.isArray(project.requirements) ? project.requirements : [];
  const questions = Array.isArray(project.clarificationQuestions) ? project.clarificationQuestions : [];
  const openQuestions = questions.filter((entry) => ['open', 'sent', 'answered', 'blocked'].includes(String(entry.status || ''))).length;
  const byType = (type) => reqs.filter((entry) => entry.type === type).length;
  const functional = reqs.filter((entry) => entry.type === 'functional');
  const functionalValid = functional.filter((entry) => entry.smartIsValid).length;
  const smartRate = functional.length ? Math.round((functionalValid / functional.length) * 100) : 100;

  els.projectKpis.innerHTML = `
    <div class="kpi-box"><strong>${reqs.length}</strong><small>Requisitos totais</small></div>
    <div class="kpi-box"><strong>${byType('functional')}</strong><small>Funcionais</small></div>
    <div class="kpi-box"><strong>${byType('non_functional')}</strong><small>Não funcionais</small></div>
    <div class="kpi-box"><strong>${byType('test_case')}</strong><small>Testes / Aceite</small></div>
    <div class="kpi-box"><strong>${smartRate}%</strong><small>Cobertura SMART funcional</small></div>
    <div class="kpi-box"><strong>${(project.risks || []).length}</strong><small>Riscos principais</small></div>
    <div class="kpi-box"><strong>${openQuestions}</strong><small>Perguntas em aberto</small></div>
  `;

  const goals = (project.summary?.goals || []).slice(0, 4);
  const risks = (project.risks || []).slice(0, 3);

  els.projectReadability.innerHTML = `
    <article class="read-card">
      <h4>Contexto de Negócio</h4>
      <p>${escapeHtml(shortText(project.summary?.businessContext, 360))}</p>
    </article>
    <article class="read-card">
      <h4>Escopo em Linguagem Simples</h4>
      <p>${escapeHtml(shortText(project.summary?.scopeInPlainLanguage || project.summary?.solutionOverview, 360))}</p>
    </article>
    <article class="read-card">
      <h4>Objetivos Prioritários</h4>
      ${goals.length ? `<ul>${goals.map((goal) => `<li>${escapeHtml(goal)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
    </article>
    <article class="read-card">
      <h4>Riscos que Merecem Atenção</h4>
      ${risks.length ? `<ul>${risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
    </article>
  `;
}

function renderMembers(project) {
  const members = Array.isArray(project.members) ? project.members : [];
  if (!members.length) {
    els.projectMembers.innerHTML = '<div class="simple-item"><small>Sem membros associados.</small></div>';
    return;
  }

  const usersById = new Map(state.users.map((user) => [user.id, user]));
  els.projectMembers.innerHTML = members.map((member) => {
    const user = usersById.get(member.userId);
    const display = user ? `${user.name} (${user.email})` : member.userId;
    const removeBtn = canEdit()
      ? `<button class="btn tiny" data-action="remove-member" data-user-id="${escapeHtml(member.userId)}">Remover</button>`
      : '';

    return `
      <div class="simple-item">
        <strong>${escapeHtml(display)}</strong>
        <small>Perfil: ${escapeHtml(member.role || 'client')}</small>
        ${removeBtn}
      </div>
    `;
  }).join('');
}

function renderDocuments(project) {
  if (window.DocumentsUI?.renderDocumentsPage) {
    window.DocumentsUI.renderDocumentsPage(project);
    return;
  }
  let docs = Array.isArray(project.documents) ? project.documents : [];
  const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
  if (stageFilter && state.activeTab === 'documentos') {
    const resolve = window.PhaseContent?.resolveDocumentStageId || ((d) => d.deliveryStageId || 'discovery');
    docs = docs.filter((d) => resolve(d) === stageFilter);
  }
  if (!docs.length) {
    els.documentsList.innerHTML = `<div class="simple-item"><small>${stageFilter ? 'Sem documentos nesta fase.' : 'Sem documentos carregados.'}</small></div>`;
    return;
  }

  els.documentsList.innerHTML = docs.map((doc) => {
    const name = doc.title || doc.originalName;
    const stage = doc.deliveryStageId ? stageLabel(doc.deliveryStageId) : '';
    const typeLabel = doc.docType || 'anexo';
    return `
    <div class="simple-item doc-list-item">
      <button type="button" class="nav-link-btn" data-open-doc="${escapeHtml(doc.id)}">
        <strong>${escapeHtml(name)}</strong>
      </button>
      <small>${new Date(doc.uploadedAt || doc.createdAt).toLocaleString('pt-PT')} · ${typeLabel}${stage ? ` · ${escapeHtml(stage)}` : ''} ${doc.hasExtractedText || doc.contentMarkdown ? '· texto' : ''}</small>
      <a href="/api/projects/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(doc.id)}/download" target="_blank" rel="noopener">Download</a>
    </div>
  `;
  }).join('');

  els.documentsList.querySelectorAll('[data-open-doc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = docs.find((d) => d.id === btn.dataset.openDoc);
      if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
    });
  });
}

function renderMeetingMinutes(project) {
  let minutes = Array.isArray(project.meetingMinutes) ? project.meetingMinutes : [];
  const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
  if (stageFilter && state.activeTab === 'atas') {
    const resolve = window.PhaseContent?.resolveMeetingStageId || ((m) => m.targetStageId || m.impactScope || 'requirements');
    minutes = minutes.filter((m) => resolve(m) === stageFilter);
  }
  const promptHistory = Array.isArray(project.minutesPromptHistory) ? project.minutesPromptHistory : [];

  if (els.meetingMinuteDate && !els.meetingMinuteDate.value) {
    els.meetingMinuteDate.value = new Date().toISOString().slice(0, 10);
  }

  if (!minutes.length) {
    els.minutesHistoryList.innerHTML = '<div class="simple-item"><small>Sem atas registadas.</small></div>';
    els.minutesPromptHistoryList.innerHTML = promptHistory.length
      ? promptHistory.slice(0, 10).map((entry) => `
        <div class="simple-item">
          <strong>${escapeHtml(entry.objective || 'prompt')}</strong>
          <small>${new Date(entry.createdAt).toLocaleString('pt-PT')} • atas: ${(entry.minuteIds || []).join(', ') || 'n/a'}</small>
        </div>
      `).join('')
      : '<div class="simple-item"><small>Sem histórico de prompts.</small></div>';
    state.selectedMinuteIds = [];
    return;
  }

  const validIds = new Set(minutes.map((entry) => entry.id));
  const selectedSet = new Set((state.selectedMinuteIds || []).filter((id) => validIds.has(id)));
  if (!selectedSet.size && minutes[0]) {
    selectedSet.add(minutes[0].id);
  }
  state.selectedMinuteIds = Array.from(selectedSet);

  els.minutesHistoryList.innerHTML = minutes.slice(0, 80).map((entry) => {
    const checked = selectedSet.has(entry.id) ? 'checked' : '';
    const meetingDateLabel = entry.meetingDate || new Date(entry.createdAt).toISOString().slice(0, 10);
    const impactLabel = impactScopeLabel(entry.impactScope || 'requirements');
    const stageLabelText = stageLabel(entry.targetStageId || entry.impactScope || 'requirements');
    return `
      <div class="simple-item">
        <label class="checkline">
          <input type="checkbox" data-minute-id="${escapeHtml(entry.id)}" ${checked} />
          <strong>${escapeHtml(entry.title || `Ata ${meetingDateLabel}`)}</strong>
        </label>
        <div class="minute-meta">
          <small>${escapeHtml(meetingDateLabel)}</small>
          <span class="impact-badge">${escapeHtml(impactLabel)}</span>
          <small>Fase: ${escapeHtml(stageLabelText)}</small>
          <small>${new Date(entry.createdAt).toLocaleString('pt-PT')}</small>
        </div>
        <details class="collapsible">
          <summary>Ver texto raw</summary>
          <pre class="minute-raw">${escapeHtml(entry.rawText || '')}</pre>
        </details>
      </div>
    `;
  }).join('');

  els.minutesPromptHistoryList.innerHTML = promptHistory.length
    ? promptHistory.slice(0, 15).map((entry) => `
      <div class="simple-item">
        <strong>${escapeHtml(entry.objective || 'prompt')}</strong>
        <small>${new Date(entry.createdAt).toLocaleString('pt-PT')} • atas: ${(entry.minuteIds || []).join(', ') || 'n/a'}</small>
        <details class="collapsible">
          <summary>Ver prompt</summary>
          <pre class="minute-raw">${escapeHtml(entry.prompt || '')}</pre>
        </details>
      </div>
    `).join('')
    : '<div class="simple-item"><small>Sem histórico de prompts.</small></div>';
  renderMinutePropagationPanel();
}

function renderMinutePropagationPanel(plan) {
  const panel = els.minutePropagationPanel;
  if (!panel) return;
  const minuteIds = syncSelectedMinutesFromList();
  if (!minuteIds.length) {
    panel.innerHTML = '<p class="muted-text">Seleccione uma ou mais atas no histórico (checkbox) para ver o plano de propagação.</p>';
    return;
  }
  if (!plan) {
    panel.innerHTML = '<p class="muted-text">Clique em «Analisar impacto nas fases» para calcular quais etapas da linha dourada são afectadas.</p>';
    return;
  }
  const renderStageList = (title, ids) => {
    if (!ids?.length) return `<div class="propagation-block"><h5>${escapeHtml(title)}</h5><p class="muted-text">Nenhuma</p></div>`;
    return `
      <div class="propagation-block">
        <h5>${escapeHtml(title)}</h5>
        <ul class="propagation-stages">${ids.map((id) => `
          <li>
            <strong>${escapeHtml(stageLabel(id))}</strong>
            <button type="button" class="btn tiny ghost" data-set-stage="${escapeHtml(id)}" data-goto-tab="deliveryos">Ver fase</button>
          </li>
        `).join('')}</ul>
      </div>
    `;
  };
  panel.innerHTML = `
    <h4>Plano de propagação (${minuteIds.length} ata(s))</h4>
    ${plan.hints?.length ? `<p class="muted-text">${escapeHtml(plan.hints.join(' '))}</p>` : ''}
    <div class="propagation-grid">
      ${renderStageList('Fase principal', plan.primaryStageIds)}
      ${renderStageList('Rever para trás', plan.upstreamStageIds)}
      ${renderStageList('Actualizar para a frente', plan.downstreamStageIds)}
    </div>
  `;
}

async function handleAnalyzeMinutePropagation() {
  if (!state.selectedProject) return;
  const minuteIds = syncSelectedMinutesFromList();
  if (!minuteIds.length) {
    showToast('Seleccione pelo menos uma ata.', 'error');
    return;
  }
  try {
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes/propagation-plan`, {
      method: 'POST',
      body: { minuteIds },
    });
    renderMinutePropagationPanel(payload.plan);
    showToast('Plano de propagação calculado.', 'ok');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleGenerateMinutePropagationPrompt() {
  if (!state.selectedProject) return;
  const minuteIds = syncSelectedMinutesFromList();
  if (!minuteIds.length) {
    showToast('Seleccione pelo menos uma ata.', 'error');
    return;
  }
  try {
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes/propagation-prompt`, {
      method: 'POST',
      body: { minuteIds },
    });
    if (payload.plan) renderMinutePropagationPanel(payload.plan);
    if (payload.project) {
      state.selectedProject = payload.project;
      renderProjectDetails();
    }
    if (els.minutesPromptOutput && payload.prompt) {
      els.minutesPromptOutput.value = payload.prompt;
    }
    showToast('Prompt de propagação gerado — revisão humana criada.', 'ok');
    switchToTab('deliveryos');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function questionStageOptions(selected) {
  const stages = state.config?.stageOrder || ['requirements'];
  return stages.map((stageId) =>
    `<option value="${escapeHtml(stageId)}" ${stageId === (selected || 'requirements') ? 'selected' : ''}>${escapeHtml(stageLabel(stageId))}</option>`
  ).join('');
}

function getFilteredClarificationQuestions(project) {
  const questions = Array.isArray(project?.clarificationQuestions) ? project.clarificationQuestions : [];
  const statusFilter = String(state.questionFilters.status || '').trim();
  const targetFilter = String(state.questionFilters.targetRole || '').trim();
  const stageFilter = state.questionFilters.byCurrentStage && state.activeTab === 'perguntas'
    ? String(state.tabFilters?.deliveryStageId || state.deliverySelectedStageId || '').trim()
    : '';

  return questions.filter((entry) => {
    if (statusFilter && entry.status !== statusFilter) return false;
    if (targetFilter && entry.targetRole !== targetFilter) return false;
    if (stageFilter && entry.deliveryStageId !== stageFilter) return false;
    return true;
  });
}

function renderClarificationQuestions(project) {
  const allQuestions = Array.isArray(project?.clarificationQuestions) ? project.clarificationQuestions : [];
  const filtered = getFilteredClarificationQuestions(project);
  const tbody = els.questionsTable.querySelector('tbody');
  if (els.questionDeliveryStage && state.deliverySelectedStageId) {
    els.questionDeliveryStage.value = state.deliverySelectedStageId;
  }
  if (els.questionFilterStatus) {
    const value = state.questionFilters.status || '';
    if (Array.from(els.questionFilterStatus.options).some((opt) => opt.value === value)) {
      els.questionFilterStatus.value = value;
    }
  }
  if (els.questionFilterTargetRole) {
    const value = state.questionFilters.targetRole || '';
    if (Array.from(els.questionFilterTargetRole.options).some((opt) => opt.value === value)) {
      els.questionFilterTargetRole.value = value;
    }
  }
  const unresolved = allQuestions.filter((entry) => ['open', 'sent', 'answered', 'blocked'].includes(String(entry.status || ''))).length;
  const answered = allQuestions.filter((entry) => String(entry.status || '') === 'resolved').length;
  const byTarget = {
    client: allQuestions.filter((entry) => entry.targetRole === 'client').length,
    partner: allQuestions.filter((entry) => entry.targetRole === 'partner').length,
    both: allQuestions.filter((entry) => entry.targetRole === 'both').length,
  };
  els.questionsMeta.textContent = `${filtered.length} pergunta(s) no filtro (de ${allQuestions.length}) • Fase activa: ${stageLabel(state.deliverySelectedStageId || 'requirements')} • Em aberto: ${unresolved} • Resolvidas: ${answered} • Client: ${byTarget.client} • Partner: ${byTarget.partner} • Both: ${byTarget.both}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10">${allQuestions.length ? 'Nenhuma pergunta corresponde ao filtro.' : 'Sem perguntas registadas.'}</td></tr>`;
    return;
  }

  const canWrite = canEdit();
  const disabled = canWrite ? '' : 'disabled';
  const statusOptionsHtml = questionStatusOptions();
  const targetOptionsHtml = questionTargetOptions();
  const categoryOptionsHtml = questionCategoryOptions();

  tbody.innerHTML = filtered.map((entry) => {
    const linked = joinRequirementIds(entry.linkedRequirementIds);
    const dueDate = String(entry.dueDate || '').slice(0, 10);
    const contextText = entry.context ? `<div class="muted">Contexto: ${escapeHtml(shortText(entry.context, 150))}</div>` : '';
    const answerText = entry.answer ? escapeHtml(entry.answer) : '';

    if (!canWrite) {
      return `
        <tr data-question-id="${escapeHtml(entry.id)}" class="question-row readonly-row">
          <td data-label="ID">${escapeHtml(entry.id)}</td>
          <td data-label="Pergunta">
            <strong class="question-main-text">${escapeHtml(entry.question || '')}</strong>
            ${contextText}
            <div class="muted">Due: ${escapeHtml(dueDate || 'N/A')}</div>
          </td>
          <td data-label="Fase">${escapeHtml(stageLabel(entry.deliveryStageId || 'requirements'))}</td>
          <td data-label="Destino">${escapeHtml(entry.targetRole || 'client')}</td>
          <td data-label="Status">${escapeHtml(entry.status || 'open')}</td>
          <td data-label="Prioridade">${escapeHtml(entry.priority || 'medium')}</td>
          <td data-label="Categoria">${escapeHtml(entry.category || 'other')}</td>
          <td data-label="Requisitos">${escapeHtml(linked || '-')}</td>
          <td data-label="Resposta">${answerText || '-'}</td>
          <td data-label="Ações">-</td>
        </tr>
      `;
    }

    return `
      <tr data-question-id="${escapeHtml(entry.id)}" class="question-row editable-row">
        <td data-label="ID">${escapeHtml(entry.id)}</td>
        <td data-label="Pergunta">
          <span class="field-title">Pergunta</span>
          <textarea class="question-main-input" data-field="question" rows="4" ${disabled}>${escapeHtml(entry.question || '')}</textarea>
          <span class="field-title">Contexto</span>
          <textarea data-field="context" rows="3" placeholder="Contexto" ${disabled}>${escapeHtml(entry.context || '')}</textarea>
          <span class="field-title">Data limite</span>
          <input data-field="dueDate" type="date" value="${escapeHtml(dueDate)}" ${disabled} />
        </td>
        <td data-label="Fase">
          <select data-field="deliveryStageId" ${disabled}>${questionStageOptions(entry.deliveryStageId)}</select>
        </td>
        <td data-label="Destino">
          <select data-field="targetRole" ${disabled}>${targetOptionsHtml}</select>
        </td>
        <td data-label="Status">
          <select data-field="status" ${disabled}>${statusOptionsHtml}</select>
        </td>
        <td data-label="Prioridade">
          <select data-field="priority" ${disabled}>
            <option value="high" ${entry.priority === 'high' ? 'selected' : ''}>high</option>
            <option value="medium" ${entry.priority === 'medium' ? 'selected' : ''}>medium</option>
            <option value="low" ${entry.priority === 'low' ? 'selected' : ''}>low</option>
          </select>
        </td>
        <td data-label="Categoria">
          <select data-field="category" ${disabled}>${categoryOptionsHtml}</select>
        </td>
        <td data-label="Requisitos">
          <span class="field-title">IDs ligados</span>
          <input data-field="linkedRequirementIds" value="${escapeHtml(linked)}" ${disabled} />
        </td>
        <td data-label="Resposta">
          <span class="field-title">Resposta</span>
          <textarea class="question-answer-input" data-field="answer" rows="4" placeholder="Resposta do cliente/partner" ${disabled}>${answerText}</textarea>
        </td>
        <td data-label="Ações" class="question-actions-cell">
          <button class="btn primary" data-action="save-question">Guardar</button>
          <button class="btn" data-action="delete-question">Apagar</button>
        </td>
      </tr>
    `;
  }).join('');

  refreshAutoResize(els.questionsTable);

  if (canWrite) {
    filtered.forEach((entry) => {
      const row = tbody.querySelector(`tr[data-question-id="${entry.id}"]`);
      if (!row) return;
      const targetNode = row.querySelector('select[data-field="targetRole"]');
      const statusNode = row.querySelector('select[data-field="status"]');
      const categoryNode = row.querySelector('select[data-field="category"]');
      if (targetNode) targetNode.value = entry.targetRole || 'client';
      if (statusNode) statusNode.value = entry.status || 'open';
      if (categoryNode) categoryNode.value = entry.category || 'other';
    });
  }
}

function renderRequirementModuleControls(project) {
  const modules = collectModules(project);
  const requirements = Array.isArray(project?.requirements) ? project.requirements : [];
  const previousFilter = state.filters.module;
  const filterValue = modules.includes(previousFilter) ? previousFilter : '';
  state.filters.module = filterValue;

  els.reqFilterModule.innerHTML = `<option value="">Todos os módulos</option>${modules
    .map((moduleName) => `<option value="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</option>`)
    .join('')}`;
  els.reqFilterModule.value = filterValue;

  els.reqModule.innerHTML = modules
    .map((moduleName) => `<option value="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</option>`)
    .join('');
  const reqModuleValue = modules.includes(els.reqModule.value) ? els.reqModule.value : 'Backend';
  els.reqModule.value = reqModuleValue;
  els.detailReqModule.innerHTML = modules
    .map((moduleName) => `<option value="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</option>`)
    .join('');
  const detailModuleValue = modules.includes(els.detailReqModule.value) ? els.detailReqModule.value : 'Backend';
  els.detailReqModule.value = detailModuleValue;

  const selectedModuleForSubmoduleList = normalizeModuleName(els.reqModule.value || modules[0]);
  const submodules = collectSubmodules(project, selectedModuleForSubmoduleList);
  els.submoduleSuggestions.innerHTML = submodules
    .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
    .join('');

  const checked = new Set(state.generationModulesSelected || []);
  const hasMatchingSelection = modules.some((moduleName) => checked.has(moduleName));
  const shouldCheckAll = checked.size === 0 || !hasMatchingSelection;
  els.generationModules.innerHTML = modules
    .map((moduleName) => {
      const total = requirements.filter((entry) => normalizeModuleName(entry.module) === moduleName).length;
      const isChecked = shouldCheckAll || checked.has(moduleName);
      return `
        <label class="module-chip">
          <input type="checkbox" data-module-generate="${escapeHtml(moduleName)}" ${isChecked ? 'checked' : ''} />
          ${escapeHtml(moduleName)} (${total})
        </label>
      `;
    })
    .join('');
}

function renderImplementationPlan(project) {
  const requirements = Array.isArray(project?.requirements) ? project.requirements : [];
  const questions = Array.isArray(project?.clarificationQuestions) ? project.clarificationQuestions : [];
  const risks = Array.isArray(project?.risks) ? project.risks : [];
  const phases = Array.isArray(project?.phases) ? project.phases : [];
  const integrations = Array.isArray(project?.integrations) ? project.integrations : [];
  const technicalApproach = project?.technicalApproach || {};
  const blockedStatuses = new Set(['blocked']);
  const doneStatuses = new Set(['approved', 'done', 'completed', 'closed', 'resolved']);

  const unresolvedQuestions = questions.filter((entry) => !doneStatuses.has(String(entry.status || '').toLowerCase()));
  const functional = requirements.filter((entry) => entry.type === 'functional');
  const smartMissing = functional.filter((entry) => !entry.smartIsValid);
  const pendingRequirements = requirements.filter((entry) => !doneStatuses.has(String(entry.status || '').toLowerCase()));
  const blockedRequirements = requirements.filter((entry) => blockedStatuses.has(String(entry.status || '').toLowerCase()));

  const matchRequirementToPhase = (req) => {
    const reqPhase = normalizeForCompare(req?.phase);
    return phases.find((phase, index) => {
      const phaseName = String(phase?.name || `Fase ${index + 1}`).trim();
      const phaseToken = normalizeForCompare(phaseName);
      const phaseIdToken = normalizeForCompare(phase?.id);
      return Boolean(reqPhase && (reqPhase === phaseToken || reqPhase === phaseIdToken || reqPhase.includes(phaseToken)));
    }) || null;
  };

  const outOfPlan = [];
  const phaseRows = phases.map((phase, index) => {
    const phaseName = String(phase?.name || `Fase ${index + 1}`).trim();
    const phaseReqs = requirements
      .filter((req) => {
        const matched = matchRequirementToPhase(req);
        if (!matched && !outOfPlan.find((entry) => entry.id === req.id)) {
          outOfPlan.push(req);
        }
        return matched && matched.id === phase.id;
      })
      .slice()
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), 'pt-PT'));
    const approved = phaseReqs.filter((entry) => doneStatuses.has(String(entry.status || '').toLowerCase())).length;
    const pending = phaseReqs.length - approved;
    const durationWeeks = Number(phase?.durationWeeks || 0);
    const durationLabel = Number.isFinite(durationWeeks) && durationWeeks > 0 ? `${durationWeeks}sem` : '—';
    const objective = escapeHtml(shortText(String(phase?.objective || phase?.description || '').trim() || '—', 100));
    const highPri = phaseReqs
      .filter((e) => e.priority === 'high' && !doneStatuses.has(String(e.status || '').toLowerCase()))
      .slice(0, 3)
      .map((e) => `<span class="ip-tag ip-tag--high">${escapeHtml(e.id)}</span>`)
      .join('');

    return `
      <tr class="ip-phase-row">
        <td class="ip-phase-name">${index + 1}. ${escapeHtml(phaseName)}</td>
        <td class="ip-phase-dur">${durationLabel}</td>
        <td class="ip-phase-reqs">${phaseReqs.length}</td>
        <td class="ip-phase-done"><span class="ip-pill ip-pill--ok">${approved} ok</span> <span class="ip-pill ip-pill--pend">${pending} pend.</span></td>
        <td class="ip-phase-obj">${objective}</td>
        <td class="ip-phase-high">${highPri || '<span class="ip-muted">—</span>'}</td>
      </tr>
    `;
  }).join('');

  const nextActions = [
    ...pendingRequirements
      .filter((entry) => entry.priority === 'high')
      .slice(0, 5)
      .map((entry) => `<li>${escapeHtml(entry.id)} — ${escapeHtml(shortText(entry.title, 70))}</li>`),
    ...(outOfPlan.length ? [`<li class="ip-warn">${outOfPlan.length} requisito(s) sem fase atribuída</li>`] : []),
    ...(smartMissing.length ? [`<li class="ip-warn">${smartMissing.length} lacuna(s) SMART por fechar</li>`] : []),
  ].slice(0, 7);

  const moduleInsights = collectModules(project).map((moduleName) => {
    const moduleReqs = requirements.filter((entry) => normalizeModuleName(entry.module) === moduleName);
    const high = moduleReqs.filter((entry) => entry.priority === 'high').length;
    const blocked = moduleReqs.filter((entry) => blockedStatuses.has(String(entry.status || '').toLowerCase())).length;
    return `<tr><td>${escapeHtml(moduleName)}</td><td>${moduleReqs.length}</td><td>${high}</td><td>${blocked}</td></tr>`;
  });

  const stackHighlights = Array.isArray(technicalApproach?.stack) ? technicalApproach.stack.slice(0, 6) : [];
  const integrationHighlights = integrations.slice(0, 6).map((e) => {
    const name = String(e?.name || 'Integração').trim();
    const phase = String(e?.phase || '').trim();
    return `<span class="ip-tag">${escapeHtml(name)}${phase ? ` · ${escapeHtml(phase)}` : ''}</span>`;
  });

  els.implementationPlanView.innerHTML = `
    <div class="ip-kpi-row">
      <div class="ip-kpi"><span>${requirements.length}</span><small>Requisitos</small></div>
      <div class="ip-kpi"><span>${pendingRequirements.length}</span><small>Pendentes</small></div>
      <div class="ip-kpi"><span>${blockedRequirements.length}</span><small>Bloqueados</small></div>
      <div class="ip-kpi"><span>${unresolvedQuestions.length}</span><small>Questões</small></div>
      <div class="ip-kpi"><span>${smartMissing.length}</span><small>SMART gaps</small></div>
      <div class="ip-kpi"><span>${risks.length}</span><small>Riscos</small></div>
    </div>

    <details class="ip-section" open>
      <summary>Fases de Implementação</summary>
      ${phases.length ? `
        <div class="ip-table-wrap">
          <table class="ip-table">
            <thead><tr><th>Fase</th><th>Duração</th><th>Req.</th><th>Estado</th><th>Objetivo</th><th>Alta prioridade</th></tr></thead>
            <tbody>${phaseRows}</tbody>
          </table>
        </div>
      ` : '<p class="ip-empty">Sem fases definidas.</p>'}
    </details>

    <details class="ip-section">
      <summary>Próximos Passos</summary>
      ${nextActions.length ? `<ul class="ip-list">${nextActions.join('')}</ul>` : '<p class="ip-empty">Sem ações prioritárias pendentes.</p>'}
    </details>

    <details class="ip-section">
      <summary>Módulos de Arquitetura</summary>
      ${moduleInsights.length ? `
        <div class="ip-table-wrap">
          <table class="ip-table">
            <thead><tr><th>Módulo</th><th>Req.</th><th>Alta prior.</th><th>Bloqueados</th></tr></thead>
            <tbody>${moduleInsights.join('')}</tbody>
          </table>
        </div>
      ` : '<p class="ip-empty">Sem módulos classificados.</p>'}
    </details>

    <details class="ip-section">
      <summary>Stack e Integrações</summary>
      <div class="ip-two-col">
        <div>
          <p class="ip-label">Stack técnica</p>
          <div class="ip-tag-list">${stackHighlights.length ? stackHighlights.map((s) => `<span class="ip-tag">${escapeHtml(s)}</span>`).join('') : '<span class="ip-muted">Não definida.</span>'}</div>
        </div>
        <div>
          <p class="ip-label">Integrações previstas</p>
          <div class="ip-tag-list">${integrationHighlights.length ? integrationHighlights.join('') : '<span class="ip-muted">Nenhuma definida.</span>'}</div>
        </div>
      </div>
    </details>
  `;
}

function renderRequirements(project) {
  if (window.RequirementsUI?.renderGroupedRequirements) {
    window.RequirementsUI.renderGroupedRequirements(project);
    return;
  }
  const items = Array.isArray(project.requirements) ? project.requirements : [];
  const filtered = getFilteredRequirements(items);
  const prepared = filtered;
  const tbody = els.requirementsTable.querySelector('tbody');

  if (!prepared.length) {
    tbody.innerHTML = `<tr><td colspan="3">${items.length ? 'Nenhum requisito corresponde ao filtro.' : 'Sem requisitos ainda.'}</td></tr>`;
    els.requirementsMeta.textContent = `0 requisitos no filtro atual (de ${items.length} totais).`;
    state.selectedRequirementId = null;
    renderRequirementDetailEditor(project);
    return;
  }

  const statuses = statusOptions();
  tbody.innerHTML = prepared.map((req) => {
    const locked = !canEdit();
    const disabled = locked ? 'disabled' : '';
    const title = escapeHtml(req.title || '');
    const phase = escapeHtml(req.phase || 'Backlog');
    const moduleName = escapeHtml(formatModuleLabel(req));
    const relations = splitRequirementIds(req.relatedRequirementIds);
    const relationsText = relations.length ? `${relations.slice(0, 2).join(', ')}${relations.length > 2 ? ` +${relations.length - 2}` : ''}` : '-';
    const summaryLine = shortText(req.need || req.shall || req.description || req.businessValue, 120);
    const summaryMeta = `${req.phase || 'Backlog'} • ${formatModuleLabel(req)}`;
    const smartInfo = req.type === 'functional'
      ? (req.smartIsValid
        ? '<span class="smart-ok">OK</span>'
        : `<span class="smart-issue">Falta: ${escapeHtml((req.smartValidationErrors || []).join(', '))}</span>`)
      : '-';

    return `
      <tr data-requirement-id="${escapeHtml(req.id)}" ${state.selectedRequirementId === req.id ? 'class="selected-row"' : ''}>
        <td>${escapeHtml(req.id)}</td>
        <td>${escapeHtml(req.type)}</td>
        <td class="req-summary">
          <p>${escapeHtml(summaryLine)}</p>
          <small>${escapeHtml(summaryMeta)}</small>
        </td>
      </tr>
    `;
  }).join('');

  prepared.forEach((req) => {
    const row = tbody.querySelector(`tr[data-requirement-id="${req.id}"]`);
    if (!row) return;
    const statusSelect = row.querySelector('select[data-field="status"]');
    if (statusSelect) {
      statusSelect.value = req.status || 'draft';
    }
  });

  const selectedInFiltered = prepared.some((entry) => entry.id === state.selectedRequirementId);
  if (!selectedInFiltered) {
    state.selectedRequirementId = prepared[0]?.id || null;
  }

  const functional = items.filter((entry) => entry.type === 'functional');
  const smartMissing = functional.filter((entry) => !entry.smartIsValid).length;
  const moduleCount = new Set(items.map((entry) => normalizeModuleName(entry.module))).size;
  const submoduleCount = new Set(items.map((entry) => `${normalizeModuleName(entry.module)}::${normalizeSubmoduleName(entry.submodule) || 'General'}`)).size;
  els.requirementsMeta.textContent = `${prepared.length} requisitos no filtro atual (de ${items.length} totais) • Módulos: ${moduleCount} • Submódulos: ${submoduleCount} • Funcionais com lacunas SMART: ${smartMissing}`;

  renderRequirementDetailEditor(project);
}

function renderGenerated(project) {
  const generated = Array.isArray(project.generated) ? project.generated : [];
  if (!generated.length) {
    els.generatedLinks.innerHTML = '<div class="simple-item"><small>Nenhum pacote gerado ainda.</small></div>';
    return;
  }

  const latest = generated[0];
  const outputs = latest.outputs || {};
  const links = Object.entries(outputs)
    .filter(([, value]) => value)
    .map(([key, value]) => `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(key)}</a>`)
    .join(' • ');

  els.generatedLinks.innerHTML = `
    <div class="simple-item">
      <strong>Última geração (${escapeHtml(latest.mode)})</strong>
      <small>${new Date(latest.generatedAt).toLocaleString('pt-PT')}</small>
      <small>Módulos: ${latest.selectedModules?.length ? escapeHtml(latest.selectedModules.join(', ')) : 'todos'}</small>
      <div>${links || '<small>Sem ficheiros disponíveis</small>'}</div>
    </div>
  `;
}

function renderRequirementDetailEditor(project) {
  const req = getSelectedRequirement(project);
  if (!req) {
    els.requirementDetailEmpty.classList.remove('hidden');
    els.requirementQuickView.classList.add('hidden');
    els.requirementDetailForm.classList.add('hidden');
    return;
  }

  els.requirementDetailEmpty.classList.add('hidden');
  els.requirementQuickView.classList.remove('hidden');
  els.requirementDetailForm.classList.remove('hidden');

  els.requirementQuickView.innerHTML = `
    <h4>Leitura rápida: ${escapeHtml(req.id || '')} - ${escapeHtml(req.title || '')}</h4>
    <p><strong>Módulo:</strong> ${escapeHtml(formatModuleLabel(req))}</p>
    <p><strong>Need:</strong> ${escapeHtml(shortText(req.need || req.description, 220))}</p>
    <p><strong>Shall:</strong> ${escapeHtml(shortText(req.shall || req.description, 240))}</p>
    <p><strong>Condition + Measure:</strong> ${escapeHtml(shortText(`${req.condition || 'N/A'} | ${req.measure || 'N/A'}`, 260))}</p>
    <p><strong>Relações:</strong> ${escapeHtml(joinRequirementIds(req.relatedRequirementIds) || 'N/A')}</p>
    <p><strong>Status:</strong> ${escapeHtml(req.status || 'draft')} • <strong>Prioridade:</strong> ${escapeHtml(req.priority || 'medium')} • <strong>Fase:</strong> ${escapeHtml(req.phase || 'Backlog')}</p>
  `;

  els.detailReqId.value = req.id || '';
  els.detailReqType.value = req.type || '';
  els.detailReqStatus.value = req.status || 'draft';
  els.detailReqPriority.value = req.priority || 'medium';
  els.detailReqPhase.value = req.phase || 'Backlog';
  els.detailReqModule.value = normalizeModuleName(req.module);
  els.detailReqSubmodule.value = normalizeSubmoduleName(req.submodule);
  els.detailReqVersion.value = req.versionRevision || '1.0';
  els.detailReqTitle.value = req.title || '';
  els.detailReqNeed.value = req.need || '';
  els.detailReqShall.value = req.shall || '';
  els.detailReqCondition.value = req.condition || '';
  els.detailReqMeasure.value = req.measure || '';
  els.detailReqRationale.value = req.rationale || '';
  els.detailReqVerification.value = req.verification || '';
  els.detailReqAssumption.value = req.assumption || '';
  els.detailReqStakeholderLink.value = req.stakeholderRequirementLink || '';
  els.detailReqLinkedFunctionalRequirement.value = req.linkedFunctionalRequirement || '';
  els.detailReqBusinessValue.value = req.businessValue || req.reason || '';
  els.detailReqTarget.value = req.target || '';
  els.detailReqRelatedIds.value = joinRequirementIds(req.relatedRequirementIds);
  els.detailReqNotes.value = req.notes || '';

  const detailSubmodules = collectSubmodules(project, els.detailReqModule.value);
  els.submoduleSuggestions.innerHTML = detailSubmodules
    .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
    .join('');
}

function renderRiskAssumptionView(project) {
  const risks = Array.isArray(project.risks) ? project.risks : [];
  const assumptions = Array.isArray(project.assumptions) ? project.assumptions : [];
  const phases = Array.isArray(project.phases) ? project.phases : [];

  const topRisks = risks.slice(0, 5);
  const topAssumptions = assumptions.slice(0, 5);
  const phaseHighlights = phases.slice(0, 3).map((phase) => `${phase.name || 'Fase'} (${phase.durationWeeks || 'n/d'} semanas)`);

  els.riskAssumptionView.innerHTML = `
    <article class="read-card">
      <h4>Riscos Prioritários</h4>
      ${topRisks.length ? `<ul>${topRisks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
      <small>Total: ${risks.length}</small>
    </article>
    <article class="read-card">
      <h4>Assunções do Projeto</h4>
      ${topAssumptions.length ? `<ul>${topAssumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
      <small>Total: ${assumptions.length}</small>
    </article>
    <article class="read-card">
      <h4>Fases em Destaque</h4>
      ${phaseHighlights.length ? `<ul>${phaseHighlights.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
    </article>
    <article class="read-card">
      <h4>Integrações Planeadas</h4>
      <p>${(project.integrations || []).length} integração(ões) registadas.</p>
    </article>
  `;
}

async function loadConfig() {
  state.config = await apiRequest('/config');
  els.reqStatus.innerHTML = statusOptions();
  els.detailReqStatus.innerHTML = statusOptions();
  els.reqFilterStatus.innerHTML = `<option value="">Todos os status</option>${statusOptions()}`;
  els.questionStatus.innerHTML = questionStatusOptions();
  els.questionFilterStatus.innerHTML = `<option value="">Todos os status</option>${questionStatusOptions()}`;
  els.questionTargetRole.innerHTML = questionTargetOptions();
  els.questionFilterTargetRole.innerHTML = `<option value="">Todos os destinos</option>${questionTargetOptions()}`;
  els.questionCategory.innerHTML = questionCategoryOptions();
  els.questionStatus.value = 'open';
  els.questionTargetRole.value = 'client';
}

async function loadCurrentUser() {
  const payload = await apiRequest('/auth/me');
  state.user = payload.user;
}

async function loadUsers() {
  if (!isSuperAdmin()) {
    state.users = [state.user];
    return;
  }
  const payload = await apiRequest('/users');
  state.users = payload.users || [];
}

async function loadProjects(selectId) {
  const payload = await apiRequest('/projects');
  state.projects = payload.projects || [];
  renderProjects();

  if (selectId) {
    state.selectedProjectId = selectId;
  } else if (state.selectedProjectId && state.projects.some((p) => p.id === state.selectedProjectId)) {
    // keep current selection
  } else {
    state.selectedProjectId = null;
  }

  if (state.selectedProjectId) {
    await loadProjectById(state.selectedProjectId, { switchTab: false });
  } else {
    state.selectedProject = null;
    renderProjects();
    renderProjectDetails();
    switchToTab(state.activeTab || 'projetos');
  }
}

async function loadProjectById(projectId, options = {}) {
  state.selectedProjectId = projectId;
  const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}`);
  state.selectedProject = payload.project;
  if (!getSelectedRequirement(state.selectedProject)) {
    state.selectedRequirementId = state.selectedProject?.requirements?.[0]?.id || null;
  }
  renderProjects();
  renderProjectDetails();
  if (options.switchTab !== false) {
    switchToTab('deliveryos');
  }
  await loadActivity();
}

function stageLabel(stageId) {
  const focus = state.config?.stageFocus?.[stageId];
  if (focus) return focus.split('—')[0].trim();
  const flow = (state.config?.deliveryStageFlow || []).find((entry) => entry.id === stageId);
  return flow?.label || stageId;
}

function impactScopeLabel(scopeId) {
  const entry = (state.config?.meetingImpactScopes || []).find((item) => item.id === scopeId);
  return entry?.label || scopeId;
}

function renderSettingsAvailability() {
  const hasProject = Boolean(state.selectedProject);
  if (els.settingsProjectHint) {
    els.settingsProjectHint.classList.toggle('hidden', hasProject);
  }
  if (els.settingsProjectBody) {
    els.settingsProjectBody.classList.toggle('hidden', !hasProject);
  }
  const levelSelect = document.getElementById('deliveryLevelSelect');
  if (levelSelect && hasProject) {
    levelSelect.value = state.selectedProject.deliveryLevel || 'standard';
  }
}

function renderPhaseContextBar() {
  const bar = els.phaseContextBar;
  if (!bar) return;

  const hideBar = !state.selectedProject
    || state.activeTab === 'definicoes'
    || state.activeTab === 'projetos'
    || state.activeTab === 'deliveryos';

  if (hideBar) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  const stageId = state.deliverySelectedStageId || 'requirements';
  const stageName = stageLabel(stageId);
  const hasStageFilter = Boolean(state.tabFilters?.deliveryStageId);

  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="phase-context-strip">
      <div class="phase-context-strip-left">
        <span class="phase-context-pill">${escapeHtml(stageName)}</span>
        ${hasStageFilter ? '<span class="phase-context-tag">filtro activo</span>' : '<span class="phase-context-tag is-muted">fase seleccionada</span>'}
      </div>
      <button type="button" class="phase-context-go" data-goto-tab="deliveryos" data-set-stage="${escapeHtml(stageId)}">
        Ver conteúdo na Linha de Entrega
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
}

function navigateToRequirement(requirementId) {
  if (!requirementId || !state.selectedProject) return;
  state.selectedRequirementId = requirementId;
  switchToTab('requisitos');
  renderRequirements(state.selectedProject);
  if (window.RequirementsUI?.openRequirementModal) {
    window.RequirementsUI.openRequirementModal(requirementId, state.selectedProject);
    return;
  }
  const row = els.requirementsTable.querySelector(`tr[data-requirement-id="${requirementId}"]`);
  if (row) {
    row.classList.add('row-highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    row.click();
  }
}

function navigateToFilteredTab(tabId, filters = {}) {
  state.tabFilters = state.tabFilters || {};
  if (filters.deliveryStageId) {
    state.tabFilters.deliveryStageId = filters.deliveryStageId;
    state.deliverySelectedStageId = filters.deliveryStageId;
  }
  if (filters.module) {
    state.filters.module = filters.module;
    state.tabFilters.keepModule = true;
  }
  if (filters.phase) state.filters.phase = filters.phase;
  if (filters.contentView) {
    state.tabFilters.contentView = filters.contentView;
  } else if (filters.deliveryStageId && tabId !== 'documentos') {
    state.tabFilters.contentView = '';
  }
  if (filters.clearStage) {
    state.tabFilters.deliveryStageId = '';
  }
  if (tabId === 'perguntas') {
    state.questionFilters.byCurrentStage = Boolean(filters.deliveryStageId);
  }
  if (tabId === 'atas' && filters.deliveryStageId) {
    state.tabFilters.deliveryStageId = filters.deliveryStageId;
  }
  switchToTab(tabId);
}

function switchToTab(tabId) {
  const target = tabId || 'projetos';
  if (isNavPageRequiresProject(target) && !state.selectedProject) {
    showToast('Seleccione ou crie um projecto primeiro.', 'error');
    state.activeTab = 'projetos';
  } else {
    state.activeTab = target;
  }

  const activeId = state.activeTab;
  const tabs = document.getElementById('sectionTabs');
  tabs?.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === activeId);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.panel !== activeId);
  });

  els.noProject?.classList.toggle('hidden', state.selectedProject || activeId !== 'projetos');
  renderNavRail();
  renderSettingsAvailability();
  renderPhaseContextBar();

  if (activeId === 'definicoes') {
    renderUsersPanel();
    setReadonlyByRole();
  }
  if (activeId === 'projetos') {
    renderProjectsPage();
  }
  if (state.selectedProject && activeId === 'requisitos') {
    renderRequirements(state.selectedProject);
  }
  if (state.selectedProject && activeId === 'documentos') {
    renderDocuments(state.selectedProject);
  }
  if (state.selectedProject && activeId === 'atas') {
    renderMeetingMinutes(state.selectedProject);
  }
  if (state.selectedProject && activeId === 'perguntas') {
    renderClarificationQuestions(state.selectedProject);
  }
  if (state.selectedProject && activeId === 'atas') {
    renderMinutePropagationPanel();
  }
}

window.switchToTab = switchToTab;
window.navigateToRequirement = navigateToRequirement;
window.navigateToFilteredTab = navigateToFilteredTab;
window.renderPhaseContextBar = renderPhaseContextBar;

async function loadActivity() {
  const project = state.selectedProject;
  if (!project) {
    els.activityList.innerHTML = '<div class="simple-item"><small>Selecione um projeto.</small></div>';
    return;
  }

  const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/activity`);
  const activity = payload.activity || [];

  if (!activity.length) {
    els.activityList.innerHTML = '<div class="simple-item"><small>Sem atividade registada.</small></div>';
    return;
  }

  els.activityList.innerHTML = activity.slice(0, 100).map((entry) => {
    const details = entry.details ? JSON.stringify(entry.details) : '';
    return `
      <div class="simple-item">
        <strong>${escapeHtml(entry.action)}</strong>
        <small>${new Date(entry.at).toLocaleString('pt-PT')} • ${escapeHtml(entry.actorUserId || '')}</small>
        ${details ? `<small>${escapeHtml(details)}</small>` : ''}
      </div>
    `;
  }).join('');
}

function readProjectPatchFromForm() {
  return {
    name: els.projectName.value.trim(),
    clientName: els.projectClient.value.trim(),
    status: els.projectStatus.value,
    proposalCode: els.projectCode.value.trim(),
    hourlyRate: Number(els.projectRate.value || 30),
    currency: els.projectCurrency.value.trim() || 'EUR',
    language: els.projectLanguage.value.trim() || 'pt-PT',
    targetBudgetMin: Number(els.projectBudgetMin.value || 5000),
    targetBudgetMax: Number(els.projectBudgetMax.value || 6000),
    description: els.projectDescription.value,
    summary: {
      businessContext: els.summaryBusinessContext.value,
      goals: linesToArray(els.summaryGoals.value),
      scopeInPlainLanguage: els.summaryScope.value,
      solutionOverview: els.summarySolution.value,
    },
  };
}

function readAdvancedPatch() {
  return {
    phases: safeParseJson(els.phasesJson.value, 'Fases JSON inválido'),
    integrations: safeParseJson(els.integrationsJson.value, 'Integrações JSON inválido'),
    risks: linesToArray(els.risksText.value),
    assumptions: linesToArray(els.assumptionsText.value),
    commercialTerms: safeParseJson(els.commercialTermsJson.value, 'Termos comerciais JSON inválido'),
    technicalApproach: safeParseJson(els.technicalApproachJson.value, 'Abordagem técnica JSON inválido'),
  };
}

function safeParseJson(text, errorMessage) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(errorMessage);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearLoginStatus();

  try {
    const payload = await apiRequest('/auth/login', {
      method: 'POST',
      body: {
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value,
      },
    });

    state.token = payload.token;
    localStorage.setItem(TOKEN_KEY, state.token);
    await bootstrapAppAfterLogin();
  } catch (error) {
    setLoginStatus(error.message, 'error');
  }
}

async function bootstrapAppAfterLogin() {
  window.state = state;
  await loadCurrentUser();
  await loadUsers();
  await loadProjects();

  els.userChip.textContent = `${state.user.name} • ${state.user.role}`;
  els.loginCard.classList.add('hidden');
  els.workspace.classList.remove('hidden');
  setReadonlyByRole();
  setMonetaryVisibilityByRole();
  syncBudgetAccessControl();
  renderUsersPanel();
  window.PdosUI?.wirePdosEvents();
  window.PdosUI?.wireTraceEvents();
  initNavRail();
  switchToTab(state.selectedProject ? state.activeTab : 'projetos');
}

async function handleLogout() {
  try {
    if (state.token) {
      await apiRequest('/auth/logout', { method: 'POST' });
    }
  } catch {
    // ignore
  }

  state.token = '';
  state.user = null;
  state.projects = [];
  state.selectedProject = null;
  state.selectedProjectId = null;
  state.selectedMinuteIds = [];
  state.generationModulesSelected = [];
  state.questionFilters.status = '';
  state.questionFilters.targetRole = '';
  localStorage.removeItem(TOKEN_KEY);
  els.workspace.classList.add('hidden');
  els.loginCard.classList.remove('hidden');
  showToast('Sessão terminada.', 'ok');
}

async function handleCreateProject(event) {
  event.preventDefault();
  try {
    const payload = await apiRequest('/projects', {
      method: 'POST',
      body: {
        name: document.getElementById('newProjectName').value.trim(),
        clientName: document.getElementById('newProjectClient').value.trim(),
        hourlyRate: Number(document.getElementById('newProjectRate').value || 30),
        currency: document.getElementById('newProjectCurrency').value.trim() || 'EUR',
      },
    });

    showToast('Projeto criado com sucesso.', 'ok');
    event.target.reset();
    await loadProjects(payload.project.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  try {
    await apiRequest('/users', {
      method: 'POST',
      body: {
        name: document.getElementById('newUserName').value.trim(),
        email: document.getElementById('newUserEmail').value.trim(),
        role: document.getElementById('newUserRole').value,
        canViewBudget: document.getElementById('newUserRole').value === 'partner' && Boolean(els.newUserCanViewBudget?.checked),
        password: document.getElementById('newUserPassword').value,
      },
    });

    showToast('Utilizador criado.', 'ok');
    event.target.reset();
    syncBudgetAccessControl();
    await loadUsers();
    renderUsersPanel();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSaveProject() {
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}`, {
      method: 'PATCH',
      body: readProjectPatchFromForm(),
    });

    showToast('Projeto atualizado.', 'ok');
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSaveAdvanced() {
  if (!state.selectedProject) return;
  try {
    const patch = readAdvancedPatch();
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}`, {
      method: 'PATCH',
      body: patch,
    });

    showToast('Dados avançados guardados.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSaveSourceText() {
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/source-text`, {
      method: 'POST',
      body: { sourceText: els.sourceText.value },
    });
    showToast('Texto base guardado.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleBuildPrompt() {
  if (!state.selectedProject) return;
  try {
    await handleSaveSourceText();
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/build-prompt`, {
      method: 'POST',
      body: { extraInstructions: '' },
    });

    els.aiPrompt.value = payload.prompt || '';
    showToast('Pre-prompt gerado.', 'ok');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleImportAi() {
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/import-ai`, {
      method: 'POST',
      body: { aiJson: els.aiJson.value },
    });

    showToast('Estrutura AI importada com sucesso.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleUploadDocument(event) {
  event.preventDefault();
  if (!state.selectedProject) return;
  if (!els.docFile.files?.length) {
    showToast('Selecione um ficheiro.', 'error');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('document', els.docFile.files[0]);

    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/documents/upload`, {
      method: 'POST',
      body: formData,
      isForm: true,
    });

    showToast('Documento carregado.', 'ok');
    event.target.reset();
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleAddMeetingMinute(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes`, {
      method: 'POST',
      body: {
        meetingDate: els.meetingMinuteDate.value,
        title: els.meetingMinuteTitle.value,
        rawText: els.meetingMinuteRaw.value,
        impactScope: els.meetingMinuteImpactScope?.value || 'requirements',
      },
    });

    showToast('Ata guardada em histórico raw.', 'ok');
    els.meetingMinuteTitle.value = '';
    els.meetingMinuteRaw.value = '';
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function syncSelectedMinutesFromList() {
  const checkboxes = Array.from(els.minutesHistoryList.querySelectorAll('input[type="checkbox"][data-minute-id]'));
  const selected = checkboxes
    .filter((node) => node.checked)
    .map((node) => node.getAttribute('data-minute-id'))
    .filter(Boolean);
  state.selectedMinuteIds = selected;
  return selected;
}

async function handleBuildMinutesPrompt() {
  if (!state.selectedProject) return;

  try {
    const minuteIds = syncSelectedMinutesFromList();
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/build-minutes-prompt`, {
      method: 'POST',
      body: {
        minuteIds,
        objective: els.minutesPromptObjective.value,
        extraInstructions: els.minutesPromptExtraInstructions.value,
      },
    });

    els.minutesPromptOutput.value = payload.prompt || '';
    showToast('Pre-prompt de alterações gerado com atas e respostas.', 'ok');
    if (payload.project) {
      state.selectedProject = payload.project;
      renderProjectDetails();
    } else {
      await loadProjectById(state.selectedProject.id);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleImportRequirementChanges() {
  if (!state.selectedProject) return;

  try {
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/import-requirement-changes`, {
      method: 'POST',
      body: { changeJson: els.requirementsChangeJson.value },
    });

    const result = payload.result || {};
    showToast(`Alterações aplicadas: +${result.added || 0}, atualizados ${result.updated || 0}, excluídos ${result.excluded || 0}.`, 'ok');
    els.requirementsChangeJson.value = '';
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleAddQuestion(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/questions`, {
      method: 'POST',
      body: {
        question: els.questionText.value,
        context: els.questionContext.value,
        targetRole: els.questionTargetRole.value,
        category: els.questionCategory.value,
        priority: els.questionPriority.value,
        status: els.questionStatus.value || 'open',
        deliveryStageId: els.questionDeliveryStage?.value || state.deliverySelectedStageId || 'requirements',
        dueDate: els.questionDueDate.value,
        linkedRequirementIds: splitRequirementIds(els.questionLinkedRequirementIds.value),
      },
    });

    showToast('Pergunta de clarificação guardada.', 'ok');
    event.target.reset();
    els.questionStatus.value = 'open';
    els.questionTargetRole.value = 'client';
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function readQuestionPatchFromRow(row) {
  return {
    question: row.querySelector('[data-field="question"]')?.value || '',
    context: row.querySelector('[data-field="context"]')?.value || '',
    targetRole: row.querySelector('[data-field="targetRole"]')?.value || 'client',
    status: row.querySelector('[data-field="status"]')?.value || 'open',
    priority: row.querySelector('[data-field="priority"]')?.value || 'medium',
    category: row.querySelector('[data-field="category"]')?.value || 'other',
    deliveryStageId: row.querySelector('[data-field="deliveryStageId"]')?.value || 'requirements',
    dueDate: row.querySelector('[data-field="dueDate"]')?.value || '',
    linkedRequirementIds: splitRequirementIds(row.querySelector('[data-field="linkedRequirementIds"]')?.value || ''),
    answer: row.querySelector('[data-field="answer"]')?.value || '',
  };
}

async function handleQuestionsTableClick(event) {
  if (!state.selectedProject || !canEdit()) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = event.target.closest('tr[data-question-id]');
  if (!row) return;
  const questionId = row.getAttribute('data-question-id');
  if (!questionId) return;

  if (button.dataset.action === 'delete-question') {
    if (!confirm(`Apagar pergunta ${questionId}?`)) return;
    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/questions/${encodeURIComponent(questionId)}`, {
        method: 'DELETE',
      });
      showToast('Pergunta removida.', 'ok');
      await loadProjectById(state.selectedProject.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (button.dataset.action === 'save-question') {
    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/questions/${encodeURIComponent(questionId)}`, {
        method: 'PATCH',
        body: readQuestionPatchFromRow(row),
      });
      showToast('Pergunta atualizada.', 'ok');
      await loadProjectById(state.selectedProject.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleQuestionsTableKeydown(event) {
  if (!state.selectedProject || !canEdit()) return;
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
  const row = event.target.closest('tr[data-question-id]');
  if (!row) return;
  const saveButton = row.querySelector('button[data-action="save-question"]');
  if (!saveButton) return;
  event.preventDefault();
  saveButton.click();
}

async function handleAddRequirement(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements`, {
      method: 'POST',
      body: {
        type: els.reqType.value,
        title: els.reqTitle.value,
        status: els.reqStatus.value || 'draft',
        priority: els.reqPriority.value,
        phase: els.reqPhase.value,
        module: normalizeModuleName(els.reqModule.value),
        submodule: normalizeSubmoduleName(els.reqSubmodule.value),
        relatedRequirementIds: splitRequirementIds(els.reqRelatedIds.value),
        description: els.reqDescription.value,
      },
    });

    showToast('Requisito adicionado.', 'ok');
    event.target.reset();
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRequirementsTableClick(event) {
  if (!state.selectedProject) return;
  const button = event.target.closest('button[data-action]');
  const row = event.target.closest('tr[data-requirement-id]');
  if (!row) return;
  const requirementId = row.getAttribute('data-requirement-id');

  if (!button) {
    if (state.selectedRequirementId !== requirementId) {
      state.selectedRequirementId = requirementId;
      renderRequirements(state.selectedProject);
    }
    return;
  }

  if (button.dataset.action === 'edit-req') {
    state.selectedRequirementId = requirementId;
    renderRequirements(state.selectedProject);
    els.requirementDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (!canEdit()) {
    return;
  }

  if (button.dataset.action === 'delete-req') {
    if (!confirm(`Apagar requisito ${requirementId}?`)) {
      return;
    }

    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(requirementId)}`, {
        method: 'DELETE',
      });

      showToast('Requisito removido.', 'ok');
      await loadProjectById(state.selectedProject.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (button.dataset.action === 'save-req') {
    const title = row.querySelector('input[data-field="title"]')?.value || '';
    const status = row.querySelector('select[data-field="status"]')?.value || 'draft';
    const priority = row.querySelector('select[data-field="priority"]')?.value || 'medium';
    const phase = row.querySelector('input[data-field="phase"]')?.value || 'Backlog';

    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(requirementId)}`, {
        method: 'PATCH',
        body: { title, status, priority, phase },
      });

      showToast('Requisito atualizado.', 'ok');
      await loadProjectById(state.selectedProject.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleAssignMember(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/members`, {
      method: 'POST',
      body: {
        userId: els.assignUserId.value,
        role: document.getElementById('assignMemberRole').value,
      },
    });

    showToast('Membro associado.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRemoveMemberClick(event) {
  const button = event.target.closest('button[data-action="remove-member"]');
  if (!button || !state.selectedProject || !canEdit()) return;

  const userId = button.dataset.userId;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });

    showToast('Membro removido.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function getSelectedModulesForGeneration() {
  const checkboxes = Array.from(els.generationModules.querySelectorAll('input[type="checkbox"][data-module-generate]'));
  const selected = checkboxes
    .filter((node) => node.checked)
    .map((node) => node.getAttribute('data-module-generate'))
    .filter(Boolean);
  state.generationModulesSelected = selected;
  return selected;
}

async function handleGenerate(mode) {
  if (!state.selectedProject) return;

  try {
    const selectedModules = getSelectedModulesForGeneration();
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/generate`, {
      method: 'POST',
      body: {
        mode,
        dryRun: els.dryRunToggle.checked,
        selectedModules,
      },
    });

    showToast('Bundle gerado com sucesso.', 'ok');

    const outputs = payload.outputs || {};
    const list = Object.entries(outputs)
      .filter(([, value]) => value)
      .map(([key, value]) => `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(key)}</a>`)
      .join(' • ');

    els.generatedLinks.innerHTML = `<div class="simple-item"><strong>Resultado</strong><div>${list || 'Sem links.'}</div></div>`;
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function readRequirementDetailPatch() {
  return {
    title: els.detailReqTitle.value,
    need: els.detailReqNeed.value,
    shall: els.detailReqShall.value,
    condition: els.detailReqCondition.value,
    measure: els.detailReqMeasure.value,
    rationale: els.detailReqRationale.value,
    verification: els.detailReqVerification.value,
    assumption: els.detailReqAssumption.value,
    stakeholderRequirementLink: els.detailReqStakeholderLink.value,
    priority: els.detailReqPriority.value,
    status: els.detailReqStatus.value,
    phase: els.detailReqPhase.value,
    module: normalizeModuleName(els.detailReqModule.value),
    submodule: normalizeSubmoduleName(els.detailReqSubmodule.value),
    versionRevision: els.detailReqVersion.value,
    linkedFunctionalRequirement: els.detailReqLinkedFunctionalRequirement.value,
    businessValue: els.detailReqBusinessValue.value,
    target: els.detailReqTarget.value,
    relatedRequirementIds: splitRequirementIds(els.detailReqRelatedIds.value),
    reason: els.detailReqBusinessValue.value,
    notes: els.detailReqNotes.value,
  };
}

async function handleSaveRequirementDetails() {
  if (!state.selectedProject || !state.selectedRequirementId || !canEdit()) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(state.selectedRequirementId)}`, {
      method: 'PATCH',
      body: readRequirementDetailPatch(),
    });

    showToast('Requisito atualizado com framework completo.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleDeleteRequirementDetails() {
  if (!state.selectedProject || !state.selectedRequirementId || !canEdit()) return;
  if (!confirm(`Apagar requisito ${state.selectedRequirementId}?`)) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(state.selectedRequirementId)}`, {
      method: 'DELETE',
    });
    state.selectedRequirementId = null;
    showToast('Requisito removido.', 'ok');
    await loadProjectById(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

const THEME_KEY = 'requirements_platform_theme';

function themeIconSvg(theme) {
  if (theme === 'light') {
    return '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  return '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function applyThemeLogos(theme) {
  const logoMode = theme === 'light' ? 'light' : 'dark';
  [els.loginLogo, els.workspaceLogo].forEach((logoEl) => {
    if (!logoEl) return;
    const logoDark = logoEl.getAttribute('data-logo-dark');
    const logoLight = logoEl.getAttribute('data-logo-light');
    const src = logoMode === 'light' ? logoLight : logoDark;
    if (src) logoEl.setAttribute('src', src);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggleBtn.innerHTML = themeIconSvg(theme);
  applyThemeLogos(theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function wireEvents() {
  els.loginForm.addEventListener('submit', handleLogin);
  els.logoutBtn.addEventListener('click', handleLogout);
  els.themeToggleBtn.addEventListener('click', toggleTheme);
  els.refreshProjectsBtn.addEventListener('click', () => loadProjects(state.selectedProjectId).catch((e) => showToast(e.message, 'error')));
  els.openSettingsBtn?.addEventListener('click', () => switchToTab('definicoes'));
  els.settingsThemeToggleBtn?.addEventListener('click', toggleTheme);
  els.analyzeMinutePropagationBtn?.addEventListener('click', handleAnalyzeMinutePropagation);
  els.generateMinutePropagationPromptBtn?.addEventListener('click', handleGenerateMinutePropagationPrompt);
  document.addEventListener('click', (event) => {
    const filterBtn = event.target.closest('[data-goto-filter-tab]');
    if (filterBtn && !filterBtn.disabled) {
      event.preventDefault();
      navigateToFilteredTab(filterBtn.getAttribute('data-goto-filter-tab'), {
        deliveryStageId: filterBtn.getAttribute('data-goto-filter-stage'),
      });
      return;
    }
    const gotoBtn = event.target.closest('[data-goto-tab]');
    if (gotoBtn) {
      event.preventDefault();
      const tabId = gotoBtn.getAttribute('data-goto-tab');
      const stageId = gotoBtn.getAttribute('data-set-stage');
      if (stageId) state.deliverySelectedStageId = stageId;
      switchToTab(tabId);
      if (state.selectedProject && window.PdosUI?.renderAll) {
        window.PdosUI.renderAll(state.selectedProject);
      }
      return;
    }
    const reqLink = event.target.closest('[data-goto-requirement]');
    if (reqLink) {
      event.preventDefault();
      navigateToRequirement(reqLink.getAttribute('data-goto-requirement'));
    }
  });
  els.createProjectForm.addEventListener('submit', handleCreateProject);
  els.createUserForm.addEventListener('submit', handleCreateUser);
  els.newUserRole?.addEventListener('change', syncBudgetAccessControl);
  els.saveProjectBtn.addEventListener('click', handleSaveProject);
  els.saveAdvancedBtn.addEventListener('click', handleSaveAdvanced);
  els.uploadDocForm.addEventListener('submit', handleUploadDocument);
  els.addMeetingMinuteForm.addEventListener('submit', handleAddMeetingMinute);
  els.addQuestionForm.addEventListener('submit', handleAddQuestion);
  els.saveSourceTextBtn.addEventListener('click', handleSaveSourceText);
  els.buildPromptBtn.addEventListener('click', handleBuildPrompt);
  els.buildMinutesPromptBtn.addEventListener('click', handleBuildMinutesPrompt);
  els.importRequirementChangesBtn.addEventListener('click', handleImportRequirementChanges);
  els.importAiBtn.addEventListener('click', handleImportAi);
  els.addRequirementForm.addEventListener('submit', handleAddRequirement);
  els.assignMemberForm.addEventListener('submit', handleAssignMember);
  els.generateTechnicalBtn.addEventListener('click', () => handleGenerate('technical'));
  els.generateCommercialBtn.addEventListener('click', () => handleGenerate('commercial'));
  els.refreshActivityBtn.addEventListener('click', () => loadActivity().catch((e) => showToast(e.message, 'error')));
  els.saveRequirementDetailsBtn.addEventListener('click', handleSaveRequirementDetails);
  els.deleteRequirementDetailsBtn.addEventListener('click', handleDeleteRequirementDetails);

  els.projectList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-project-id]');
    if (!item) return;
    const projectId = item.getAttribute('data-project-id');
    loadProjectById(projectId).catch((error) => showToast(error.message, 'error'));
  });

  els.projectsPageGrid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-project-id]');
    if (!card) return;
    const projectId = card.getAttribute('data-project-id');
    loadProjectById(projectId).catch((error) => showToast(error.message, 'error'));
  });

  els.projectMembers.addEventListener('click', handleRemoveMemberClick);
  els.requirementsTable.addEventListener('click', handleRequirementsTableClick);
  els.questionsTable.addEventListener('click', handleQuestionsTableClick);
  els.questionsTable.addEventListener('keydown', handleQuestionsTableKeydown);
  els.generationModules.addEventListener('change', () => {
    state.generationModulesSelected = getSelectedModulesForGeneration();
  });
  els.minutesHistoryList.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.matches('input[type="checkbox"][data-minute-id]')) {
      syncSelectedMinutesFromList();
      renderMinutePropagationPanel();
    }
  });
  els.reqModule.addEventListener('change', () => {
    if (!state.selectedProject) return;
    const submodules = collectSubmodules(state.selectedProject, els.reqModule.value);
    els.submoduleSuggestions.innerHTML = submodules
      .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
      .join('');
  });
  els.detailReqModule.addEventListener('change', () => {
    if (!state.selectedProject) return;
    const submodules = collectSubmodules(state.selectedProject, els.detailReqModule.value);
    els.submoduleSuggestions.innerHTML = submodules
      .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
      .join('');
  });

  const refreshRequirementsWithFilters = () => {
    state.filters.search = els.reqSearch.value || '';
    state.filters.type = els.reqFilterType.value || '';
    state.filters.status = els.reqFilterStatus.value || '';
    state.filters.module = els.reqFilterModule.value || '';
    state.filters.onlySmartIssues = Boolean(els.reqOnlySmartIssues.checked);
    if (state.selectedProject) {
      renderRequirements(state.selectedProject);
    }
  };

  els.reqSearch.addEventListener('input', refreshRequirementsWithFilters);
  els.reqFilterType.addEventListener('change', refreshRequirementsWithFilters);
  els.reqFilterStatus.addEventListener('change', refreshRequirementsWithFilters);
  els.reqFilterModule.addEventListener('change', refreshRequirementsWithFilters);
  els.reqOnlySmartIssues.addEventListener('change', refreshRequirementsWithFilters);
  els.questionFilterStatus.addEventListener('change', () => {
    state.questionFilters.status = els.questionFilterStatus.value || '';
    if (state.selectedProject) renderClarificationQuestions(state.selectedProject);
  });
  els.questionFilterTargetRole.addEventListener('change', () => {
    state.questionFilters.targetRole = els.questionFilterTargetRole.value || '';
    if (state.selectedProject) renderClarificationQuestions(state.selectedProject);
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target && target.tagName === 'TEXTAREA') {
      autoResizeTextarea(target);
    }
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!target || !target.matches('input, textarea, select')) return;
    if (window.innerWidth > 860) return;
    setTimeout(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
  });
}

async function bootstrap() {
  // Restore saved theme before anything renders
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  wireEvents();

  try {
    await loadConfig();
  } catch (error) {
    setLoginStatus(`Falha ao carregar configuração: ${error.message}`, 'error');
    return;
  }

  if (!state.token) {
    return;
  }

  try {
    await bootstrapAppAfterLogin();
  } catch (error) {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    setLoginStatus(`Sessão inválida: ${error.message}`, 'error');
  }
}

bootstrap();
