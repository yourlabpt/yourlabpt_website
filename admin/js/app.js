import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { escapeHtml, renderInquiries, renderProjects } from './render.js';
import { parseProjectInput, prepareReplacePayload } from './projects.js';

const state = {
    allInquiries: [],
    projectItems: [],
    activeTab: 'inquiries',
    autoRefreshId: null
};

const el = {
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    passwordInput: document.getElementById('password-input'),
    refreshBtn: document.getElementById('refresh-btn'),
    exportBtn: document.getElementById('export-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    tabInquiries: document.getElementById('tabInquiries'),
    tabProjects: document.getElementById('tabProjects'),
    inquiriesView: document.getElementById('inquiriesView'),
    projectsView: document.getElementById('projectsView'),
    totalCount: document.getElementById('totalCount'),
    projectCount: document.getElementById('projectCount'),
    lastUpdate: document.getElementById('lastUpdate'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    content: document.getElementById('content'),
    projectJsonInput: document.getElementById('projectJsonInput'),
    applyProjectBtn: document.getElementById('apply-project-btn'),
    replaceProjectsBtn: document.getElementById('replace-projects-btn'),
    clearProjectInputBtn: document.getElementById('clear-project-input-btn'),
    projectStatus: document.getElementById('projectStatus'),
    projectList: document.getElementById('projectList')
};

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function setProjectStatus(message, isError = false) {
    if (!el.projectStatus) return;
    el.projectStatus.textContent = message || '';
    el.projectStatus.style.color = isError ? 'var(--danger-color)' : 'var(--success-color)';
}

function showLoginOverlay(message = '') {
    el.loginOverlay.classList.remove('hidden');
    el.loginError.textContent = message;
    if (el.passwordInput) {
        el.passwordInput.value = '';
        el.passwordInput.focus();
    }
}

function hideLoginOverlay() {
    el.loginOverlay.classList.add('hidden');
    el.loginError.textContent = '';
}

function handleUnauthorized(message = 'Session expired. Please sign in again.') {
    clearToken();
    showLoginOverlay(message);
}

function updateStats() {
    el.totalCount.textContent = String(state.allInquiries.length);
    el.projectCount.textContent = String(state.projectItems.length);
    el.lastUpdate.textContent = new Date().toLocaleString();
}

function switchTab(tab) {
    state.activeTab = tab === 'projects' ? 'projects' : 'inquiries';
    const showProjects = state.activeTab === 'projects';

    el.inquiriesView.classList.toggle('hidden', showProjects);
    el.projectsView.classList.toggle('hidden', !showProjects);
    el.tabInquiries.classList.toggle('active', !showProjects);
    el.tabProjects.classList.toggle('active', showProjects);
}

function applyInquiryFilter(query) {
    const normalizedQuery = String(query || '').toLowerCase().trim();
    if (!normalizedQuery) {
        renderInquiries(el.content, state.allInquiries);
        return;
    }

    const filtered = state.allInquiries.filter((inquiry) => {
        const name = (inquiry.contact && inquiry.contact.name || '').toLowerCase();
        const email = (inquiry.contact && inquiry.contact.email || '').toLowerCase();
        const summary = (inquiry.businessIdea || '').toLowerCase();
        return name.includes(normalizedQuery) || email.includes(normalizedQuery) || summary.includes(normalizedQuery);
    });

    renderInquiries(el.content, filtered);
}

async function loadInquiries() {
    try {
        const { response, data } = await apiRequest('/api/inquiries', {
            token: getToken()
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load inquiries.');
        }

        state.allInquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
        applyInquiryFilter(el.searchInput.value);
        updateStats();
    } catch (error) {
        showToast(error.message || 'Failed to load inquiries.', true);
    }
}

async function loadProjects() {
    try {
        const { response, data } = await apiRequest('/api/project-showcase');
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load projects.');
        }

        state.projectItems = Array.isArray(data.projects) ? data.projects : [];
        renderProjects(el.projectList, state.projectItems);
        updateStats();
    } catch (error) {
        setProjectStatus(error.message || 'Failed to load projects from server.', true);
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const password = (el.passwordInput.value || '').trim();
    if (!password) return;

    try {
        const { response, data } = await apiRequest('/api/admin/login', {
            method: 'POST',
            body: { password }
        });

        if (!response.ok || !data.token) {
            el.loginError.textContent = data.error || 'Invalid password.';
            return;
        }

        setToken(data.token);
        hideLoginOverlay();

        await Promise.all([loadInquiries(), loadProjects()]);
        switchTab('inquiries');
        showToast('Authenticated successfully.');
    } catch (_) {
        el.loginError.textContent = 'Could not reach the server. Is it running?';
    }
}

async function logout() {
    try {
        await apiRequest('/api/admin/logout', {
            method: 'POST',
            token: getToken()
        });
    } catch (_) {
        // Ignore logout network errors.
    }

    clearToken();
    showLoginOverlay();
}

async function applyProjectPayload() {
    try {
        const parsed = parseProjectInput(el.projectJsonInput.value);
        const { response, data } = await apiRequest('/api/project-showcase/apply', {
            method: 'POST',
            token: getToken(),
            body: { payload: parsed }
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to apply payload.');
        }

        state.projectItems = Array.isArray(data.projects) ? data.projects : [];
        renderProjects(el.projectList, state.projectItems);
        updateStats();
        setProjectStatus(`Applied successfully. Actions: ${(data.actions || []).join(', ') || 'done'}.`);
        showToast('Project payload applied.');
    } catch (error) {
        setProjectStatus(error.message || 'Invalid JSON payload.', true);
        showToast(error.message || 'Could not apply payload.', true);
    }
}

async function replaceAllProjects() {
    try {
        const parsed = parseProjectInput(el.projectJsonInput.value);
        const payload = prepareReplacePayload(parsed);

        const { response, data } = await apiRequest('/api/project-showcase', {
            method: 'PUT',
            token: getToken(),
            body: { payload }
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to replace collection.');
        }

        state.projectItems = Array.isArray(data.projects) ? data.projects : [];
        renderProjects(el.projectList, state.projectItems);
        updateStats();
        setProjectStatus(`Collection replaced. Total projects: ${state.projectItems.length}.`);
        showToast('Project collection replaced.');
    } catch (error) {
        setProjectStatus(error.message || 'Could not replace collection.', true);
        showToast(error.message || 'Could not replace collection.', true);
    }
}

async function deleteProject(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    if (!window.confirm(`Delete project "${cleanId}"?`)) return;

    try {
        const { response, data } = await apiRequest(`/api/project-showcase/${encodeURIComponent(cleanId)}`, {
            method: 'DELETE',
            token: getToken()
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to delete project.');
        }

        state.projectItems = Array.isArray(data.projects) ? data.projects : [];
        renderProjects(el.projectList, state.projectItems);
        updateStats();
        setProjectStatus(`Deleted project: ${cleanId}`);
        showToast('Project deleted.');
    } catch (error) {
        setProjectStatus(error.message || 'Could not delete project.', true);
        showToast(error.message || 'Could not delete project.', true);
    }
}

async function deleteInquiry(filename) {
    if (!filename) return;
    if (!window.confirm('Delete this inquiry?')) return;

    try {
        const { response, data } = await apiRequest(`/api/inquiries/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            token: getToken()
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete inquiry.');
        }

        showToast('Inquiry deleted.');
        await loadInquiries();
    } catch (error) {
        showToast(error.message || 'Failed to delete inquiry.', true);
    }
}

function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text)
        .then(() => showToast(successMessage))
        .catch(() => showToast('Failed to copy content.', true));
}

function copyInquiryByFilename(filename) {
    const inquiry = state.allInquiries.find((item) => item.filename === filename);
    if (!inquiry) {
        showToast(`Inquiry not found: ${escapeHtml(filename)}`, true);
        return;
    }

    const payload = {
        contact: inquiry.contact || {},
        businessIdea: inquiry.businessIdea || '',
        details: inquiry.details || {}
    };

    copyToClipboard(JSON.stringify(payload, null, 2), 'Inquiry copied.');
}

function copyProjectById(projectId) {
    const project = state.projectItems.find((item) => String(item.id || '') === String(projectId || ''));
    if (!project) {
        showToast(`Project not found: ${escapeHtml(projectId)}`, true);
        return;
    }

    copyToClipboard(JSON.stringify(project, null, 2), 'Project JSON copied.');
}

async function refreshData() {
    if (state.activeTab === 'projects') {
        await loadProjects();
    } else {
        await loadInquiries();
    }
    showToast('Data refreshed.');
}

function exportData() {
    if (state.activeTab === 'projects') {
        if (!state.projectItems.length) {
            showToast('No projects to export.', true);
            return;
        }

        const blob = new Blob([JSON.stringify(state.projectItems, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `yourlab_projects_${new Date().toISOString().split('T')[0]}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        showToast('Projects exported.');
        return;
    }

    if (!state.allInquiries.length) {
        showToast('No inquiries to export.', true);
        return;
    }

    const blob = new Blob([JSON.stringify(state.allInquiries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `yourlab_inquiries_${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Inquiries exported.');
}

function handleInquiriesActions(event) {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id || '';

    if (action === 'copy-inquiry') {
        copyInquiryByFilename(id);
    }

    if (action === 'delete-inquiry') {
        deleteInquiry(id);
    }
}

function handleProjectsActions(event) {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id || '';

    if (action === 'copy-project') {
        copyProjectById(id);
    }

    if (action === 'delete-project') {
        deleteProject(id);
    }
}

function bindEvents() {
    el.loginForm.addEventListener('submit', handleLoginSubmit);

    el.logoutBtn.addEventListener('click', logout);
    el.refreshBtn.addEventListener('click', refreshData);
    el.exportBtn.addEventListener('click', exportData);

    el.tabInquiries.addEventListener('click', () => switchTab('inquiries'));
    el.tabProjects.addEventListener('click', () => switchTab('projects'));

    el.clearSearchBtn.addEventListener('click', () => {
        el.searchInput.value = '';
        applyInquiryFilter('');
    });

    el.searchInput.addEventListener('input', (event) => {
        applyInquiryFilter(event.target.value || '');
    });

    el.applyProjectBtn.addEventListener('click', applyProjectPayload);
    el.replaceProjectsBtn.addEventListener('click', replaceAllProjects);
    el.clearProjectInputBtn.addEventListener('click', () => {
        el.projectJsonInput.value = '';
        setProjectStatus('');
    });

    el.content.addEventListener('click', handleInquiriesActions);
    el.projectList.addEventListener('click', handleProjectsActions);
}

function startAutoRefresh() {
    if (state.autoRefreshId) {
        clearInterval(state.autoRefreshId);
    }

    state.autoRefreshId = setInterval(() => {
        if (!getToken()) return;
        if (state.activeTab === 'inquiries') {
            loadInquiries();
        }
    }, 15000);
}

async function boot() {
    bindEvents();

    if (getToken()) {
        hideLoginOverlay();
        await Promise.all([loadInquiries(), loadProjects()]);
        switchTab('inquiries');
    } else {
        showLoginOverlay();
    }

    startAutoRefresh();
}

boot();
