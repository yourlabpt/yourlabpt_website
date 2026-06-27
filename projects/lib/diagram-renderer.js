const { validateDiagramSource } = require('./diagram-validation');

/**
 * Rendering adapter — Mermaid is client-side; server validates and returns metadata.
 * PlantUML, BPMN, DOT are stubbed with clear TODO messages.
 */

function renderDiagram({ notation, sourceText }) {
  const validation = validateDiagramSource({ notation, sourceText });
  const warnings = [...validation.warnings];
  const errors = [...validation.errors];

  if (notation === 'mermaid') {
    if (validation.valid) {
      return {
        svg: null,
        renderMode: 'client-mermaid',
        warnings: [
          ...warnings,
          { code: 'client_render', message: 'Pré-visualização Mermaid renderizada no browser.' },
        ],
        errors,
      };
    }
    return { svg: null, renderMode: 'client-mermaid', warnings, errors };
  }

  if (notation === 'plantuml') {
    return {
      svg: null,
      renderMode: 'stub-plantuml',
      warnings: [
        ...warnings,
        {
          code: 'plantuml_todo',
          message: 'Renderização PlantUML no servidor pendente (TODO: serviço PlantUML ou jar local).',
        },
      ],
      errors,
    };
  }

  if (notation === 'dot') {
    return {
      svg: null,
      renderMode: 'stub-dot',
      warnings: [
        ...warnings,
        { code: 'dot_todo', message: 'Renderização Graphviz DOT pendente (TODO: graphviz no servidor).' },
      ],
      errors,
    };
  }

  if (notation === 'bpmn_xml') {
    return {
      svg: null,
      renderMode: 'stub-bpmn',
      warnings: [
        ...warnings,
        { code: 'bpmn_todo', message: 'Renderização BPMN pendente (TODO: adaptador bpmn-js).' },
      ],
      errors,
    };
  }

  if (notation === 'openapi' || notation === 'asyncapi' || notation === 'json_schema' || notation === 'yaml_meta' || notation === 'dmn_yaml') {
    return {
      svg: null,
      renderMode: 'structured-text',
      warnings: [
        ...warnings,
        { code: 'text_preview', message: 'Contratos YAML/JSON são mostrados como texto formatado.' },
      ],
      errors,
    };
  }

  return {
    svg: null,
    renderMode: 'unknown',
    warnings,
    errors: [...errors, { code: 'unsupported_render', message: `Renderização não disponível para ${notation}.` }],
  };
}

module.exports = {
  renderDiagram,
};
