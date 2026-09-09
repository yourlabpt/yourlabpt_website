/**
 * Naming a missing tool is only half an answer. These pin the other half: every tool a
 * persona can ask for is described, says which side provides it, and comes with the
 * manifest needed to stop it being missing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tools = require('../lib/agent-tools');
const personas = require('../lib/agent-personas');

test('every tool a persona can require is described', () => {
  const required = new Set();
  for (const persona of personas.listPersonas()) {
    for (const tool of persona.allowedTools) required.add(tool);
  }
  const undescribed = [...required].filter((id) => !tools.TOOL_CATALOGUE[id]);
  assert.deepEqual(undescribed, [], 'a persona may never need a tool nobody can explain');
});

test('a description says what the tool does, not what it is called', () => {
  for (const [id, entry] of Object.entries(tools.TOOL_CATALOGUE)) {
    assert.ok(entry.description.length > 20, `${id} has no real description`);
    assert.notEqual(entry.description, id);
    assert.ok(['platform', 'local'].includes(entry.surface), `${id} has no surface`);
  }
});

test('an unknown tool is reported as unknown rather than silently dropped', () => {
  const described = tools.describeTool('nonsense.tool');
  assert.equal(described.known, false);
  assert.equal(described.surface, 'unknown');
  assert.match(described.description, /desconhecida/i);
  // The id survives, so a typo in a persona is visible instead of vanishing.
  assert.equal(described.id, 'nonsense.tool');
});

test('readiness reports missing tools with their explanation attached', () => {
  const report = personas.personaReadiness(
    { agents: [], tools: ['project.read', 'openspec.read', 'repo.read'] },
    {},
    { runtimeOnline: true },
  );
  const developer = report.find((row) => row.personaId === 'developer');
  const patch = developer.missingTools.find((tool) => tool.id === 'repo.patch');

  assert.ok(patch, 'repo.patch should be reported missing');
  // The operator learns what it is and who has to provide it, not just its id.
  assert.equal(patch.surface, 'local');
  assert.ok(patch.description.length > 20, 'a missing tool must explain itself');
  // And the tools it does have are described the same way.
  assert.equal(developer.tools.find((tool) => tool.id === 'repo.read').surface, 'local');
});

test('the manifest snippet is valid and contains exactly the tools asked for', () => {
  const snippet = tools.manifestSnippet(['tests.run', 'repo.patch']);
  const parsed = JSON.parse(snippet);
  assert.equal(parsed.capabilities.protocol.id, 'yourlab.agent-dispatch');
  assert.deepEqual(parsed.capabilities.tools, ['repo.patch', 'tests.run']);
});

test('the UI explains a gap and offers the fix, and reads the catalogue unscrolled', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'agents-admin-ui.js'), 'utf8');
  // A chip carries its own explanation.
  assert.match(ui, /title="\$\{escapeHtml\(tool\.label\)\} — \$\{escapeHtml\(tool\.description\)\}"/);
  // The gap is actionable, not just named.
  assert.match(ui, /Como adicionar estas ferramentas/);
  assert.match(ui, /function showHowToAdd/);
  assert.match(ui, /function renderToolCatalogue/);

  // A reference list is read end to end, so it must not sit in a capped scroller.
  assert.match(ui, /class="reference-list/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const capped = css.slice(css.indexOf('.repo-picker-list,\n.survey-list {'), css.indexOf('.repo-picker-list li,'));
  assert.match(capped, /max-height/);
  assert.doesNotMatch(capped, /reference-list/, 'a reference list must never be height-capped');
});
