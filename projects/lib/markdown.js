const path = require('path');

function requireServerPkg(name) {
  return require(require.resolve(name, {
    paths: [path.join(__dirname, '..', '..', 'server', 'node_modules')],
  }));
}

const { marked } = requireServerPkg('marked');
const DOMPurify = requireServerPkg('isomorphic-dompurify');

marked.setOptions({ gfm: true, breaks: true });

function renderMarkdownToHtml(markdown) {
  const source = String(markdown || '').trim();
  if (!source) return '';
  const raw = marked.parse(source);
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'rel', 'class'],
  });
}

function extractMermaidBlocks(markdown) {
  const blocks = [];
  const re = /```mermaid\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(String(markdown || ''))) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function stripMermaidFromMarkdown(markdown) {
  return String(markdown || '').replace(/```mermaid\n[\s\S]*?```/g, (block) => {
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    return `<div class="mermaid-placeholder" data-mermaid-id="${id}"></div>`;
  });
}

module.exports = {
  renderMarkdownToHtml,
  extractMermaidBlocks,
  stripMermaidFromMarkdown,
};
