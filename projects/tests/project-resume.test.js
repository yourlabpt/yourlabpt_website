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

test('the resume is partner/admin only, leads the Projetos page and fills Hoje', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  assert.match(api, /app\.get\('\/api\/projects\/resume', authMiddleware, requireRole\('super_admin', 'partner'\)/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  // Rendered from renderProjectsPage and from the Hoje tab, so neither depends on the
  // route taken to get there.
  assert.match(app, /window\.ResumeUI\?\.renderProjects\?\.\(state\.projects, state\.selectedProjectId\);/);
  assert.match(app, /window\.ResumeUI\?\.renderHoje\?\.\(\);/);

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="resumePanel"/);
  assert.match(html, /id="hojePanel"/);
  assert.match(html, /resume-ui\.js\?v=\d+/);
  assert.match(html, /project-home-ui\.js\?v=\d+/);
});

test('says where the project stands: the first stage not yet approved', () => {
  const summary = resume.summarizeProject(project({
    stages: [
      { id: 'idea', status: 'approved' },
      { id: 'discovery', status: 'done' },
      { id: 'requirements', status: 'in_progress' },
      { id: 'architecture', status: 'not_started' },
    ],
  }));
  assert.deepEqual(summary.stage, { id: 'requirements', index: 2, total: 4 });
});

test('names what waits and what failed, so the screen can say which task', () => {
  const summary = resume.summarizeProject(project({
    workItems: [
      workItem({ id: 'w1', title: 'Rever login', status: 'waiting_review' }),
      workItem({ id: 'w2', title: 'Arquitectura', status: 'failed' }),
      workItem({ status: 'planned' }),
    ],
  }));
  assert.deepEqual(summary.attention.map((entry) => [entry.id, entry.tone]), [['w1', 'review'], ['w2', 'failed']]);
});

test('carries what an open question is about', () => {
  const summary = resume.summarizeProject(project({
    execucoes: [{
      id: 'exec_1', status: 'waiting_human', goal: 'Construir', budget: {},
      question: { personaId: 'ux', kind: 'review', text: 'Aprovar o mockup?', artifact: 'ux_mockup', raisedAt: '2026-09-01T11:00:00.000Z' },
    }],
  }));
  assert.equal(summary.execucao.question.artifact, 'ux_mockup');
  assert.equal(summary.execucao.question.raisedAt, '2026-09-01T11:00:00.000Z');
  assert.equal(summary.execucao.question.personaLabel, 'UX Agent');
});

test('carries the task count and what the Execução has spent against its cap', () => {
  const summary = resume.summarizeProject(project({
    workItems: [workItem(), workItem(), workItem({ status: 'completed' })],
    execucoes: [{ id: 'exec_1', status: 'running', goal: 'Construir', budget: { spentUsd: 3.4, maxCostUsd: 15, currency: 'EUR' } }],
  }));
  assert.equal(summary.tasks, 3);
  assert.deepEqual(summary.execucao.budget, { spentUsd: 3.4, maxCostUsd: 15, currency: 'EUR' });
});
