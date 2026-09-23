/**
 * Filling the yourlab/ artefacts from code that already exists, one artefact per step.
 *
 * The steps come from the repository survey, with no AI. Each step becomes one task and
 * one small call that returns whole files. The reply is checked by the same reader the
 * platform uses, and it is written only when a person presses Escrever. Order matters:
 * purpose first, requirements per module, then what hangs off them, and the fases last,
 * because they point at requirements.
 */
const fs = require('fs');
const path = require('path');
const openspecFormat = require('./openspec-format');
const workspaceFormat = require('./workspace-format');

const GUIDE = fs.readFileSync(path.join(__dirname, 'workspace-guide.md'), 'utf8');
const GUIDE_HEADING = {
  project: 'project.md',
  phase: 'phases/NN-name.md',
  diagram: 'diagrams/name.mmd',
  database: 'database.md',
  workflow: 'workflows/name.md',
  ideas: 'ideas.md',
  questions: 'questions.md',
  mockup: 'mockup/*.html',
  spec: 'openspec/specs/<capability>/spec.md',
};
const MAX_MODULES = 8;
const MAX_SOURCE_CHARS = 4000;

/** The part of GUIDE.md that says how one kind of file is written. */
function guideSection(kind) {
  const heading = `## ${GUIDE_HEADING[kind]}`;
  const lines = GUIDE.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return '';
  let fenced = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('```')) fenced = !fenced;
    // The guide's examples have their own ## headings inside fences.
    else if (!fenced && lines[i].startsWith('## ')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

function planSteps(survey) {
  if (!survey) return [];
  const readme = (survey.docs || []).filter((p) => /^readme(\.[a-z]+)?$/i.test(p));
  const manifests = survey.manifests || [];
  const modules = (survey.modules || []).slice(0, MAX_MODULES);
  const steps = [{
    key: 'project', kind: 'project', title: 'Propósito e contexto', target: 'yourlab/project.md',
    sources: [...readme, ...manifests].slice(0, 3), facts: '',
  }];
  for (const entry of modules) {
    const slug = openspecFormat.slugify(entry.name.split('/').pop()) || 'codigo';
    steps.push({
      key: `spec:${entry.name}`, kind: 'spec', area: entry.name, title: `Requisitos · ${entry.name}`,
      target: `openspec/specs/${slug}/spec.md`, sources: [], facts: '',
    });
  }
  if ((survey.schema || []).length) {
    steps.push({
      key: 'database', kind: 'database', title: 'Base de dados', target: 'yourlab/database.md',
      sources: survey.schema.filter((p) => !p.endsWith('/')).slice(0, 4), facts: '',
    });
  }
  if ((survey.routes || []).length) {
    steps.push({
      key: 'workflows', kind: 'workflow', title: 'Workflows', target: 'yourlab/workflows/',
      sources: readme.slice(0, 1), facts: `Rotas encontradas no código:\n${survey.routes.slice(0, 80).join('\n')}`,
    });
  }
  steps.push({
    key: 'diagram', kind: 'diagram', title: 'Arquitectura', target: 'yourlab/diagrams/arquitectura.mmd',
    sources: manifests.slice(0, 2),
    facts: `Módulos (pasta — ficheiros):\n${(survey.modules || []).map((entry) => `${entry.name} — ${entry.files}`).join('\n')}`,
  });
  steps.push({
    key: 'phases', kind: 'phase', title: 'Fases e features', target: 'yourlab/phases/',
    sources: [], facts: '', needsOutline: true,
  });
  return steps;
}

/**
 * What a reply may write: only files of the step's own kind, each checked by the reader
 * the platform uses. Its errors are shown with the proposal, not hidden.
 */
function checkFiles(step, rawFiles) {
  const files = [];
  for (const entry of Array.isArray(rawFiles) ? rawFiles.slice(0, 4) : []) {
    const filePath = String(entry?.path || '').trim();
    const content = String(entry?.content || '');
    if (workspaceFormat.kindOf(filePath) !== step.kind || !content.trim() || content.length > 20000) continue;
    const { findings } = workspaceFormat.readWorkspace([{ path: filePath, content }]);
    files.push({
      path: filePath,
      content: content.endsWith('\n') ? content : `${content}\n`,
      findings: findings.filter((finding) => finding.file === filePath).map((finding) => `${finding.level === 'error' ? 'Erro' : 'Aviso'} (linha ${finding.line}): ${finding.message}`),
    });
  }
  return files;
}

function readSources(files) {
  return files.map((file) => `### ${file.path}\n${String(file.content).slice(0, MAX_SOURCE_CHARS)}`).join('\n\n');
}

module.exports = { planSteps, guideSection, checkFiles, readSources, MAX_SOURCE_CHARS };
