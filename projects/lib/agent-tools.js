/**
 * What each MCP tool actually lets an agent do.
 *
 * A persona declares the tools it needs; the runtime declares the tools it has. When
 * they disagree the platform can name the gap, but a bare id like `openspec.write`
 * tells an operator nothing about what it is or how to provide it. This is that
 * missing half: a plain description, and which side of the connection implements it.
 *
 * `surface` is the part that answers "how do I add this one":
 *   platform — the runtime calls back into the platform's HTTP API with its connector
 *              token. Nothing to install; the runtime just has to implement the call.
 *   local    — the runtime acts on the working clone and the machine it runs on.
 *              Needs filesystem access, and for tests, a runner it can execute.
 */

const TOOL_CATALOGUE = {
  // --- platform data: the runtime reads and writes through the platform API -------
  'project.read': {
    surface: 'platform',
    label: 'Ler o projecto',
    description: 'Ver o nome, o cliente, a fase actual e os módulos do projecto.',
  },
  'documents.read': {
    surface: 'platform',
    label: 'Ler documentos',
    description: 'Abrir os documentos e artefactos carregados no projecto.',
  },
  'requirements.read': {
    surface: 'platform',
    label: 'Ler requisitos',
    description: 'Consultar os requisitos STK/FR/RNF já registados.',
  },
  'requirements.write': {
    surface: 'platform',
    label: 'Escrever requisitos',
    description: 'Criar e actualizar requisitos. É assim que um levantamento devolve o que descobriu.',
  },
  'openspec.read': {
    surface: 'platform',
    label: 'Ler a OpenSpec',
    description: 'Ler as especificações em openspec/ — o que o sistema deve fazer.',
  },
  'openspec.write': {
    surface: 'platform',
    label: 'Escrever a OpenSpec',
    description: 'Propor especificações e pedidos de alteração em openspec/changes/.',
  },
  'architecture.read': {
    surface: 'platform',
    label: 'Ler a arquitectura',
    description: 'Ver o mapa de módulos e as fronteiras entre eles.',
  },
  'architecture.write': {
    surface: 'platform',
    label: 'Escrever a arquitectura',
    description: 'Definir módulos e as suas fronteiras — o que pertence a quem.',
  },
  'contracts.read': {
    surface: 'platform',
    label: 'Ler contratos',
    description: 'Consultar as interfaces acordadas entre módulos.',
  },
  'contracts.write': {
    surface: 'platform',
    label: 'Escrever contratos',
    description: 'Fixar as interfaces entre módulos antes de alguém as implementar.',
  },
  'tasks.read': {
    surface: 'platform',
    label: 'Ler tarefas',
    description: 'Ver as tarefas do projecto e o seu estado.',
  },
  'tasks.write': {
    surface: 'platform',
    label: 'Escrever tarefas',
    description: 'Decompor trabalho em tarefas. Sem isto o Tech Lead não produz unidades para os developers.',
  },
  'mockups.read': {
    surface: 'platform',
    label: 'Ler mockups',
    description: 'Abrir os mockups já aprovados para deles derivar requisitos.',
  },
  'mockups.write': {
    surface: 'platform',
    label: 'Escrever mockups',
    description: 'Produzir o mockup que o cliente aprova antes de existir qualquer código.',
  },

  // --- local: the runtime acts on the working clone, on your machine -------------
  'repo.read': {
    surface: 'local',
    label: 'Ler o repositório',
    description: 'Abrir ficheiros da cópia de trabalho local.',
  },
  'repo.search': {
    surface: 'local',
    label: 'Procurar no código',
    description: 'Procurar por texto e símbolos em toda a cópia de trabalho.',
  },
  'repo.patch': {
    surface: 'local',
    label: 'Alterar ficheiros',
    description: 'Devolver ficheiros alterados. Não faz commit: a plataforma escreve só depois da sua aceitação.',
  },
  'diff.read': {
    surface: 'local',
    label: 'Ler as alterações',
    description: 'Ver o diff pendente para o rever ou testar.',
  },
  'tests.run': {
    surface: 'local',
    label: 'Correr testes',
    description: 'Executar a suite de testes do projecto e devolver o resultado.',
  },
};

const SURFACE_LABELS = {
  platform: 'A plataforma serve esta — o runtime chama a API com o seu token de ligação.',
  local: 'O seu Mac serve esta — o runtime precisa de acesso à cópia de trabalho local.',
};

function describeTool(toolId) {
  const known = TOOL_CATALOGUE[toolId];
  if (known) return { id: toolId, known: true, ...known };
  // An unknown id is still worth showing: it is probably a typo in a persona or a
  // tool this platform version does not know about yet.
  return {
    id: toolId,
    known: false,
    surface: 'unknown',
    label: toolId,
    description: 'Ferramenta desconhecida por esta versão da plataforma.',
  };
}

function describeTools(toolIds = []) {
  return (Array.isArray(toolIds) ? toolIds : []).map(describeTool);
}

/**
 * The manifest fragment a runtime has to send so the platform stops reporting these
 * as missing. Copy-pasteable on purpose: naming the gap is only half an answer.
 */
function manifestSnippet(toolIds = [], { contractId = 'yourlab.agent-dispatch', version = 2 } = {}) {
  return JSON.stringify({
    capabilities: {
      protocol: { id: contractId, versions: [version] },
      tools: [...toolIds].sort(),
    },
  }, null, 2);
}

module.exports = {
  SURFACE_LABELS,
  TOOL_CATALOGUE,
  describeTool,
  describeTools,
  manifestSnippet,
};
