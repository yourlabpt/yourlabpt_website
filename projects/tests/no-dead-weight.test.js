/**
 * Cleanup that stays clean.
 *
 * Written after removing two orphaned modules and 266 unused CSS rules — and after a
 * first attempt at the CSS corrupted it, because a line-based edit cannot see a
 * selector list spread over several lines. These pin both the result and the method.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('every lib module is reachable from api.js', () => {
  const seen = new Set();
  (function walk(file) {
    const abs = path.resolve(file);
    if (seen.has(abs) || !fs.existsSync(abs)) return;
    seen.add(abs);
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(/require\((['"])(\.[^'"]+)\1\)/g)) {
      let target = path.resolve(path.dirname(abs), m[2]);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.js');
      else if (!target.endsWith('.js')) target += '.js';
      walk(target);
    }
  }(path.join(ROOT, 'api.js')));

  const modules = [];
  for (const entry of fs.readdirSync(path.join(ROOT, 'lib'), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(ROOT, 'lib', entry.name))) {
        if (f.endsWith('.js')) modules.push(path.join(ROOT, 'lib', entry.name, f));
      }
    } else if (entry.name.endsWith('.js')) modules.push(path.join(ROOT, 'lib', entry.name));
  }

  const orphans = modules.filter((f) => !seen.has(f)).map((f) => path.relative(ROOT, f));
  assert.deepEqual(orphans, [], 'um modulo que nada alcanca e peso morto');
});

test('every browser script is actually loaded', () => {
  const html = read('public', 'index.html');
  const loaded = new Set([...html.matchAll(/static\/([a-z0-9-]+\.js)/g)].map((m) => m[1]));
  const orphans = fs.readdirSync(path.join(ROOT, 'public'))
    .filter((f) => f.endsWith('.js') && !loaded.has(f));
  assert.deepEqual(orphans, []);
});

test('the stylesheet is structurally sound', () => {
  const css = read('public', 'styles.css');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close, 'chavetas desequilibradas partem tudo a partir dali');

  // A selector list left dangling by a bad edit: a line ending in `,` followed by a
  // declaration rather than another selector. This is what the first attempt produced.
  const lines = css.split('\n');
  const dangling = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!/,\s*$/.test(lines[i]) || !/^\s*[.#@a-zA-Z\[]/.test(lines[i])) continue;
    const next = lines[i + 1].trim();
    // A declaration ends in `;`. A selector continues with `,` or opens with `{` —
    // `input:not([type="checkbox"]),` is a selector, not a property called `input`.
    const isDeclaration = /^[a-z-]+\s*:[^;{]*;\s*$/.test(next) && !next.startsWith('--');
    if (isDeclaration) dangling.push(i + 1);
  }
  assert.deepEqual(dangling, [], 'selector solto: uma lista de selectores foi cortada a meio');
});

test('no editor backup of a source file gets committed', () => {
  const { execSync } = require('node:child_process');
  const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n');
  // Source backups are noise: git already keeps the history. Data backups under
  // data/ are deliberately not covered here — those are the only copy of a
  // pre-migration state and are not ours to discard.
  const strays = tracked.filter((f) => /^(public|lib|tests)\/.*\.(bak|orig|old|save)$/.test(f));
  assert.deepEqual(strays, []);
});

test('the modules removed as dead are still gone', () => {
  for (const gone of ['lib/project-store.js', 'lib/snapshot-storage.js']) {
    assert.equal(fs.existsSync(path.join(ROOT, gone)), false, `${gone} voltou`);
  }
  // Their successors are the reason they could go.
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'blob-store.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'split-store.js')));
});
