/**
 * The rules in UI-RULES.md, enforced. Each of these was a real complaint: browser
 * checkboxes, bullet-dotted commit lists, and an error message that named nothing the
 * operator could act on.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const UI_FILES = fs.readdirSync(path.join(ROOT, 'public'))
  .filter((name) => name.endsWith('.js'));

test('every checkbox is a pill or a selection dot, never a raw browser checkbox', () => {
  const css = read('public', 'styles.css');

  // The input is present for the keyboard and the screen reader, but never drawn.
  assert.match(css, /\.checkline input\[type="checkbox"\][^}]*opacity: 0;/s);
  // On is the identity colour, from a token — never a literal.
  assert.match(css, /\.checkline:has\(input\[type="checkbox"\]:checked\)[^}]*var\(--accent\)/s);
  // Focus has to remain visible once the input itself is not.
  assert.match(css, /\.checkline:has\(input\[type="checkbox"\]:focus-visible\)/);
  // Dense rows get the circular selection target instead.
  assert.match(css, /\.check-dot\s*\{[^}]*appearance: none;/s);

  const offenders = [];
  for (const name of UI_FILES) {
    const source = read('public', name);
    const re = /<input[^>]*type="checkbox"[^>]*>/g;
    for (const tag of source.match(re) || []) {
      if (!tag.includes('check-dot')) offenders.push(`${name}: ${tag.slice(0, 90)}`);
    }
  }
  // Anything left must be inside a `.checkline` label, which the CSS turns into a pill.
  for (const entry of offenders) {
    const [name] = entry.split(':');
    assert.match(read('public', name), /checkline/, `${entry} is neither a pill nor a dot`);
  }

  // No checkbox anywhere is left to the browser's own tick rendering.
  const checkboxRules = css.split('}').filter((rule) => /checkbox|select-cb|card-select|check-dot/.test(rule));
  for (const rule of checkboxRules) {
    assert.doesNotMatch(rule, /accent-color/, `browser-drawn checkbox left in: ${rule.trim().slice(0, 70)}`);
  }
});

test('commits render as rows, never as a bulleted list', () => {
  const source = read('public', 'project-repository-ui.js');
  assert.match(source, /<ul class="commit-list/);
  assert.doesNotMatch(source, /<ul class="mt-8">/);

  const css = read('public', 'styles.css');
  assert.match(css, /\.commit-list\s*\{[^}]*list-style: none;/s);
  // And any list rendered without a class loses the browser disc too.
  assert.match(css, /ul:not\(\[class\]\)\s*\{[^}]*list-style: none;/s);
});

test('a persona is an agent: no matching layer, no "no compatible agent"', () => {
  const personas = read('lib', 'agent-personas.js');
  const ui = read('public', 'agents-admin-ui.js');

  // The matcher and its vocabulary are gone.
  assert.doesNotMatch(personas, /personaCandidateAgents|personaBindingReport/);
  assert.doesNotMatch(ui, /Sem agente compatível|boundAgentId|pinnedAgentMissing/);

  // The persona's own id is the agent identity sent to the runtime.
  assert.match(personas, /agentId: persona\.id,/);
  assert.match(personas, /function personaReadiness/);

  // A name the runtime never registered is not a reason to refuse work.
  const contract = read('lib', 'agent-connector-contract.js');
  assert.doesNotMatch(contract, /reasons\.push\(`agent:/);
  // Capability still gates, and is judged per agent when the manifest names one.
  assert.match(contract, /reasons\.push\(`tool:/);
  assert.match(contract, /const scopedTools = agent \?/);
});

test('the readiness states name something the operator can act on', () => {
  const ui = read('public', 'agents-admin-ui.js');
  for (const state of ['Runtime desligado', 'Desactivada', 'Faltam', 'Pronta']) {
    assert.match(ui, new RegExp(state), `missing readiness state: ${state}`);
  }
  // A missing tool is named, not counted away into a generic failure.
  assert.match(ui, /O runtime ligado não expõe \$\{escapeHtml\(persona\.missingTools\.join/);
});

test('colours come from theme tokens, not literals, in the new components', () => {
  const css = read('public', 'styles.css');
  const blocks = css.split('\n\n').filter((block) => /^\s*(\/\*[^*]*\*\/\s*)?\.(checkline|check-dot|commit-list|commit-sha|commit-message|commit-author|agent-tool)/.test(block));
  assert.ok(blocks.length > 0);
  for (const block of blocks) {
    // Colour literals are only allowed inside a data: URI (the tick glyph).
    const withoutDataUris = block.replace(/url\("data:[^"]*"\)/g, '');
    assert.doesNotMatch(withoutDataUris, /#[0-9a-fA-F]{3,8}\b/, `hex literal in: ${block.slice(0, 80)}`);
  }
});
