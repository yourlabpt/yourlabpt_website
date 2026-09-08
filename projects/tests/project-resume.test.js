/**
 * The entry screen answers "what happened while I was away". These pin the three
 * counts it is built on, and the ordering rule that puts decisions above busywork.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resume = require('../lib/project-resume');

function project(overrides = {}) {
  return {
    id: 'prj_1',
    name: 'Sistema de Reservas',
    clientName: 'Grupo Ferreira',
    updatedAt: '2026-09-01T10:00:00.000Z',
    repository: { provider: 'github', owner: 'yourlab', name: 'reservas' },
    workItems: [],
    execucoes: [],
    ...overrides,
  };
}

function workItem(overrides = {}) {
  return {
    id: `witem_${Math.random().toString(16).slice(2)}`,
    title: 'Tarefa',
    status: 'planned',
    executorMode: 'agent',
    ...overrides,
  };
}

test('counts what waits, what runs and what stopped', () => {
  const summary = resume.summarizeProject(project({
    workItems: [
      workItem({ status: 'waiting_review' }),
      workItem({ status: 'failed' }),
      workItem({ status: 'planned' }),
    ],
    execucoes: [{ id: 'exec_1', status: 'running', goal: 'Construir reservas', budget: {} }],
  }));

  assert.equal(summary.awaitingReview, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.running, 1);
  assert.equal(summary.hasRepository, true);
});

test('an Execução holding a question is itself something to answer', () => {
  const summary = resume.summarizeProject(project({
    execucoes: [{
      id: 'exec_1',
      status: 'waiting_human',
      goal: 'Construir reservas',
      question: { text: 'Aprova o mockup?', personaId: 'ux' },
      budget: {},
    }],
  }));

  assert.equal(summary.awaitingReview, 1);
  assert.equal(summary.running, 0);
  assert.equal(summary.execucao.question.text, 'Aprova o mockup?');
});

test('a stopped Execução counts as something broken, with its reason', () => {
  const summary = resume.summarizeProject(project({
    execucoes: [{ id: 'exec_1', status: 'halted', goal: 'x', haltReason: 'Sem unidades de trabalho', budget: {} }],
  }));

  assert.equal(summary.failed, 1);
  assert.equal(summary.running, 0);
  assert.equal(summary.execucao.haltReason, 'Sem unidades de trabalho');
});

test('a project with no repository is reported as unable to execute', () => {
  const summary = resume.summarizeProject(project({ repository: null }));
  assert.equal(summary.hasRepository, false);
});

test('projects asking for a decision sort above projects merely running', () => {
  const built = resume.buildResume([
    project({ id: 'prj_running', execucoes: [{ id: 'e1', status: 'running', goal: 'a', budget: {} }] }),
    project({ id: 'prj_waiting', workItems: [workItem({ status: 'waiting_review' })] }),
    project({ id: 'prj_idle' }),
  ]);

  assert.deepEqual(built.projects.map((entry) => entry.projectId), ['prj_waiting', 'prj_running', 'prj_idle']);
  assert.equal(built.totals.awaitingReview, 1);
  assert.equal(built.totals.running, 1);
  assert.equal(built.totals.projects, 3);
});

test('the resume is partner/admin only and leads the Projetos page', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  assert.match(api, /app\.get\('\/api\/projects\/resume', authMiddleware, requireRole\('super_admin', 'partner'\)/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  // Rendered from renderProjectsPage, so it does not depend on the route taken.
  assert.match(app, /window\.ResumeUI\?\.render\?\.\(\);/);

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="resumePanel"/);
  assert.match(html, /resume-ui\.js\?v=\d+/);
});
