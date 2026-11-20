/**
 * Editing diagrams and workflows by their structure, as text in and text out.
 *
 * The file stays the only truth: every operation takes the file's text and returns new
 * text, touching only the lines it must, so a hand-written diagram keeps its comments,
 * styles and order. Loaded by the browser (window.ArtefactEdit) and by the server
 * (require), so the code links the studio writes are the ones the server reads.
 *
 * Code links, the bridge between a drawing and the repository:
 *   diagram   %% code: NodeId = src/auth        (one line per node)
 *   workflow  - Código: src/auth, src/routes    (one line per file)
 */
(function factory(root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArtefactEdit = api;
}(typeof self !== 'undefined' ? self : this, () => {
  /* ------------------------------------------------------------ flowchart */

  const HEADER = /^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)?\s*$/i;
  const SKIP = /^\s*(subgraph\b|end\s*$|classDef\b|class\b|style\b|linkStyle\b|click\b|direction\b)/;
  const LINK_LINE = /^\s*%%\s*code:\s*([^=]+?)\s*=\s*(.+?)\s*$/i;
  const ID = /^[A-Za-z0-9_À-ÿ-]+/;
  // Longest openers first, so «([» is not read as «(».
  const SHAPES = [['((', '))'], ['([', '])'], ['[(', ')]'], ['[[', ']]'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']];
  const TEXT_LINK = /^\s*(<?)(--|==|-\.)\s+([^-=.|][^|]*?)\s+(-->|==>|\.->|---|===|-\.-)\s*/;
  const OP_LINK = /^\s*(<?[-=.ox]*?(?:-->|==>|-\.->|---|===|-\.-|--[ox]|==[ox]|<-->))\s*(?:\|([^|]*)\|)?\s*/;

  function lines(source) { return String(source || '').split('\n'); }

  /** One node reference at `at` in `line`: its id, and its shape and label if written there. */
  function readRef(line, at) {
    const rest = line.slice(at);
    const id = rest.match(ID);
    if (!id) return null;
    let end = at + id[0].length;
    const after = line.slice(end);
    for (const [open, close] of SHAPES) {
      if (!after.startsWith(open)) continue;
      const closeAt = after.indexOf(close, open.length);
      if (closeAt < 0) break;
      const raw = after.slice(open.length, closeAt);
      return {
        id: id[0],
        shape: [open, close],
        label: raw.trim().replace(/^"(.*)"$/s, '$1'),
        labelStart: end + open.length,
        labelEnd: end + closeAt,
        end: end + closeAt + close.length,
      };
    }
    return { id: id[0], shape: null, label: '', end };
  }

  /** A statement line as node references and the links between them, or null. */
  function readStatement(line) {
    let at = line.length - line.trimStart().length;
    const refs = [];
    const links = [];
    let ref = readRef(line, at);
    if (!ref) return null;
    refs.push(ref);
    at = ref.end;
    while (at < line.length) {
      const rest = line.slice(at);
      if (!rest.trim() || rest.trim() === ';') break;
      const text = rest.match(TEXT_LINK);
      const op = text ? null : rest.match(OP_LINK);
      if (!text && !op) return null;
      links.push(text ? (text[3] || '').trim() : (op[2] || '').trim());
      at += (text || op)[0].length;
      ref = readRef(line, at);
      if (!ref) return null;
      refs.push(ref);
      at = ref.end;
    }
    return { refs, links };
  }

  function parseFlowchart(source) {
    const all = lines(source);
    const headerIndex = all.findIndex((line) => line.trim() && !line.trim().startsWith('%%'));
    const header = all[headerIndex]?.match(HEADER);
    const nodes = new Map();
    const edges = [];
    const links = {};
    let title = '';
    all.forEach((line, index) => {
      const trimmed = line.trim();
      const link = trimmed.match(LINK_LINE);
      if (link) { links[link[1].trim()] = link[2].trim(); return; }
      const titleMatch = trimmed.match(/^%%\s*title:\s*(.+)$/i);
      if (titleMatch) { title = titleMatch[1].trim(); return; }
      if (!trimmed || trimmed.startsWith('%%') || index === headerIndex || SKIP.test(line)) return;
      const statement = readStatement(line);
      if (!statement) return;
      statement.refs.forEach((ref) => {
        const known = nodes.get(ref.id);
        if (!known) nodes.set(ref.id, { id: ref.id, label: ref.label || ref.id, defined: Boolean(ref.shape), line: index });
        else if (ref.shape && !known.defined) Object.assign(known, { label: ref.label || ref.id, defined: true, line: index });
      });
      for (let i = 0; i < statement.links.length; i += 1) {
        edges.push({ from: statement.refs[i].id, to: statement.refs[i + 1].id, label: statement.links[i], line: index });
      }
    });
    return {
      editable: Boolean(header),
      direction: header?.[2]?.toUpperCase() || 'TD',
      title,
      nodes: [...nodes.values()],
      edges,
      links,
    };
  }

  function quote(label) {
    const clean = String(label || '').replace(/"/g, "'").replace(/\n+/g, ' ').trim();
    return /[()[\]{}|;<>#&]/.test(clean) ? `"${clean}"` : clean;
  }

  function slugId(label, taken) {
    const base = String(label || 'No').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join('').slice(0, 24) || 'No';
    let id = /^[0-9]/.test(base) ? `N${base}` : base;
    let n = 2;
    while (taken.has(id)) { id = `${base}${n}`; n += 1; }
    return id;
  }

  /** Where new lines go: after the last statement, before trailing code links and blanks. */
  function insertAt(all) {
    let at = all.length;
    while (at > 0 && (!all[at - 1].trim() || LINK_LINE.test(all[at - 1].trim()))) at -= 1;
    return at;
  }

  function renameNode(source, id, label) {
    const all = lines(source);
    for (let index = 0; index < all.length; index += 1) {
      if (all[index].trim().startsWith('%%') || SKIP.test(all[index])) continue;
      const statement = readStatement(all[index]);
      const ref = statement?.refs.find((entry) => entry.id === id && entry.shape);
      if (ref) {
        all[index] = all[index].slice(0, ref.labelStart) + quote(label) + all[index].slice(ref.labelEnd);
        return all.join('\n');
      }
    }
    all.splice(insertAt(all), 0, `  ${id}[${quote(label)}]`);
    return all.join('\n');
  }

  function addNode(source, label, fromId = '') {
    const parsed = parseFlowchart(source);
    const id = slugId(label, new Set(parsed.nodes.map((node) => node.id)));
    const all = lines(source);
    const added = [`  ${id}[${quote(label)}]`];
    if (fromId) added.push(`  ${fromId} --> ${id}`);
    all.splice(insertAt(all), 0, ...added);
    return { source: all.join('\n'), id };
  }

  function addEdge(source, from, to, label = '') {
    const all = lines(source);
    all.splice(insertAt(all), 0, `  ${from} -->${label ? `|${quote(label).replace(/\|/g, '/')}|` : ''} ${to}`);
    return all.join('\n');
  }

  /** A statement rewritten without some of its links: the rest as single edges, shapes kept. */
  function rebuild(line, statement, keep) {
    const indent = line.match(/^\s*/)[0];
    const out = [];
    const shaped = new Set();
    statement.refs.forEach((ref, index) => {
      if (index === statement.refs.length - 1) return;
      if (!keep(index)) return;
      const left = statement.refs[index];
      const right = statement.refs[index + 1];
      const show = (ref_) => {
        if (!ref_.shape || shaped.has(ref_.id)) return ref_.id;
        shaped.add(ref_.id);
        return `${ref_.id}${ref_.shape[0]}${quote(ref_.label)}${ref_.shape[1]}`;
      };
      out.push(`${indent}${show(left)} -->${statement.links[index] ? `|${statement.links[index]}|` : ''} ${show(right)}`);
    });
    // A node written only on a removed link must not disappear with it.
    const used = new Set(out.flatMap((entry) => readStatement(entry)?.refs.map((ref) => ref.id) || []));
    statement.refs.forEach((ref) => {
      if (used.has(ref.id)) return;
      used.add(ref.id);
      out.push(ref.shape ? `${indent}${ref.id}${ref.shape[0]}${quote(ref.label)}${ref.shape[1]}` : `${indent}${ref.id}`);
    });
    return out;
  }

  function removeEdge(source, from, to) {
    const all = lines(source);
    const out = [];
    let done = false;
    all.forEach((line) => {
      const statement = !done && !line.trim().startsWith('%%') && !SKIP.test(line) ? readStatement(line) : null;
      const index = statement ? statement.links.findIndex((_, i) => statement.refs[i].id === from && statement.refs[i + 1].id === to) : -1;
      if (index < 0) { out.push(line); return; }
      done = true;
      out.push(...rebuild(line, statement, (i) => i !== index));
    });
    return out.join('\n');
  }

  function removeNode(source, id) {
    const out = [];
    for (const line of lines(source)) {
      const trimmed = line.trim();
      const link = trimmed.match(LINK_LINE);
      if (link && link[1].trim() === id) continue;
      if (/^\s*(class|style)\s+/.test(line) && line.split(/[\s,]+/).includes(id)) continue;
      const statement = !trimmed.startsWith('%%') && !SKIP.test(line) ? readStatement(line) : null;
      if (!statement || !statement.refs.some((ref) => ref.id === id)) { out.push(line); continue; }
      const kept = rebuild(line, statement, (i) => statement.refs[i].id !== id && statement.refs[i + 1].id !== id)
        .filter((entry) => { const s = readStatement(entry); return !s?.refs.some((ref) => ref.id === id); });
      out.push(...kept);
    }
    return out.join('\n');
  }

  function setLink(source, id, path) {
    const all = lines(source).filter((line) => { const link = line.trim().match(LINK_LINE); return !link || link[1].trim() !== id; });
    const clean = String(path || '').trim().replace(/^\/+|\/+$/g, '');
    if (clean) {
      while (all.length && !all[all.length - 1].trim()) all.pop();
      all.push(`%% code: ${id} = ${clean}`, '');
    }
    return all.join('\n');
  }

  function setDirection(source, direction) {
    const all = lines(source);
    const index = all.findIndex((line) => HEADER.test(line));
    if (index >= 0) all[index] = all[index].replace(HEADER, (_, kind) => `${kind} ${direction}`);
    return all.join('\n');
  }

  /* ------------------------------------------------------------ workflow */

  const STEP = /^\s*\d+[.)]\s+(.*)$/;
  const CODE_LINE = /^\s*[-*]\s*C[óo]digo:\s*(.*)$/i;

  function parseWorkflow(source) {
    const all = lines(source);
    let title = '';
    const steps = [];
    const before = [];
    const after = [];
    let code = [];
    for (const line of all) {
      if (!title && /^#\s+/.test(line)) { title = line.replace(/^#\s+/, '').trim(); continue; }
      const code_ = line.match(CODE_LINE);
      if (code_) { code = code_[1].split(',').map((entry) => entry.trim()).filter(Boolean); continue; }
      const step = line.match(STEP);
      if (step) { steps.push(step[1].trim()); continue; }
      (steps.length ? after : before).push(line);
    }
    const trim = (list) => { const copy = [...list]; while (copy.length && !copy[0].trim()) copy.shift(); while (copy.length && !copy[copy.length - 1].trim()) copy.pop(); return copy; };
    return { title, steps, code, before: trim(before), after: trim(after) };
  }

  function serializeWorkflow({ title, steps, code = [], before = [], after = [] }) {
    const out = [`# ${String(title || 'Workflow').trim()}`];
    if (code.length) out.push(`- Código: ${code.join(', ')}`);
    if (before.length) out.push('', ...before);
    if (steps.length) out.push('', ...steps.map((step, index) => `${index + 1}. ${String(step).replace(/\n+/g, ' ').trim()}`));
    if (after.length) out.push('', ...after);
    return `${out.join('\n')}\n`;
  }

  /** The repository paths an artefact is linked to: one node's, or all of them. */
  function codeLinksOf(filePath, source, nodeId = '') {
    if (/\.mmd$/.test(filePath)) {
      const { links } = parseFlowchart(source);
      return nodeId ? (links[nodeId] ? [links[nodeId]] : []) : [...new Set(Object.values(links))];
    }
    if (/^yourlab\/workflows\//.test(filePath)) return parseWorkflow(source).code;
    return [];
  }

  /* ------------------------------------------------------------ against the code */

  /** A module name as a Mermaid node id. */
  function moduleNodeId(name) {
    return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mod';
  }

  /** The module a path belongs to: the longest module name it sits under. */
  function moduleOf(filePath, names) {
    let best = '';
    for (const name of names) {
      if ((filePath === name || filePath.startsWith(`${name}/`)) && name.length > best.length) best = name;
    }
    return best;
  }

  /**
   * A drawn diagram against the code: which nodes point at folders that exist, which
   * point nowhere, which have no link (with a suggestion when a module has its name),
   * and which modules nobody drew.
   */
  function compareWithCode(parsed, modules) {
    const names = modules.map((entry) => entry.name);
    const linkedTo = new Set();
    const nodes = parsed.nodes.map((node) => {
      const path = parsed.links[node.id] || '';
      const module = path ? moduleOf(path, names) : '';
      if (module) linkedTo.add(module);
      const suggestion = !path ? names.find((name) => moduleNodeId(name).toLowerCase() === node.id.toLowerCase()
        || name.split('/').pop().toLowerCase() === node.label.toLowerCase()
        || name.split('/').pop().toLowerCase() === node.id.toLowerCase()) || '' : '';
      return { id: node.id, label: node.label, path, state: !path ? 'unlinked' : module ? 'linked' : 'missing', suggestion };
    });
    return { nodes, undrawn: names.filter((name) => !linkedTo.has(name)) };
  }

  return {
    parseFlowchart, renameNode, addNode, addEdge, removeEdge, removeNode, setLink, setDirection,
    parseWorkflow, serializeWorkflow, codeLinksOf, moduleNodeId, moduleOf, compareWithCode,
  };
}));
