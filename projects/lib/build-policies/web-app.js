/**
 * How this platform builds a web app.
 *
 * The nine delivery stages are the spine; this is the opinion layered on them — what
 * each stage must produce, who is accountable, what has to be answered before it can
 * start, and what a late change to its output ripples into.
 *
 * It is data on purpose. A new rule is an edit here, not a deployment, and a second
 * product type is a sibling file rather than a branch in the code.
 *
 * It guides rather than blocks. Only two things ever refuse: an unanswered required
 * intake question, and a change to an artifact a human already approved. Everything
 * else is a finding recorded on the task.
 */

const PRODUCT_TYPE = 'web_app';

/**
 * Artifacts nobody produces because they come from the person, not from a persona.
 * The intake is what fills them — before it existed, three artifacts were consumed
 * by personas and produced by nothing at all.
 */
const ROOT_ARTIFACTS = ['intention', 'project_context', 'visual_reference'];

/**
 * `camada` is the planning layer a stage belongs to: 0 refining intention against
 * something you can look at, 1 the vision, 2 an epic, 3 a feature, 4 a task an agent can
 * finish in one pass. It is the *size* of what is being decided, where `stage` is the
 * *kind* of work — an epic runs its own pass through the stages.
 *
 * It is declared here rather than inferred because it decides real things: which model
 * runs (camadas 0-2 stay cheap so the loop stays a loop) and which EARS patterns the
 * requirements at that layer may use.
 */
const STAGES = [
  {
    stage: 'idea',
    camada: 1,
    owner: 'product_owner',
    produces: ['intention', 'project_context'],
    requiresAnswered: ['quem-usa', 'processo-actual', 'dor', 'sucesso'],
    doneWhen: 'Sabe-se quem usa, o que faz hoje sem isto, o que corre mal, e como se reconhece que resultou.',
  },
  {
    stage: 'discovery',
    camada: 0,
    owner: 'ux',
    produces: ['ux_flow', 'ux_mockup', 'screen_inventory', 'component_inventory'],
    requiresAnswered: ['acao-principal', 'ecras-certos', 'fora-ambito'],
    doneWhen: 'Existe um mockup aprovado e um inventário dos ecrãs que a primeira versão tem.',
    // Approval is what turns a mockup into something the rest of the chain may build
    // on. Without this declared, three personas consumed an artifact nobody produced.
    approvalTransforms: { ux_mockup: 'ux_mockup_approved' },
  },
  {
    stage: 'requirements',
    camada: 2,
    owner: 'product_owner',
    produces: ['openspec_change', 'acceptance_criteria', 'module_list'],
    requiresAnswered: ['entidades'],
    doneWhen: 'Cada ecrã do mockup tem requisitos e critérios de aceitação que se conseguem verificar.',
  },
  {
    stage: 'architecture',
    camada: 3,
    owner: 'module_architect',
    produces: ['module_spec', 'module_dependency_graph', 'interface_contract'],
    requiresAnswered: [],
    doneWhen: 'Os módulos e as fronteiras entre eles estão definidos, e cada um tem dono.',
  },
  {
    stage: 'roadmap',
    camada: 3,
    owner: 'orchestrator',
    produces: ['implementation_order', 'implementation_task'],
    requiresAnswered: [],
    doneWhen: 'O trabalho está cortado em unidades por módulo, numa ordem que respeita as dependências.',
  },
  {
    stage: 'implementation',
    camada: 4,
    owner: 'developer',
    produces: ['code_change', 'module_tests'],
    requiresAnswered: [],
    doneWhen: 'O código existe na sandbox, com testes, e ainda não foi para o repositório.',
  },
  {
    stage: 'validation',
    camada: 4,
    owner: 'tester',
    produces: ['test_report', 'structured_failures'],
    requiresAnswered: [],
    doneWhen: 'Os critérios de aceitação foram verificados e as falhas estão descritas de forma accionável.',
  },
  {
    stage: 'delivery',
    camada: 4,
    owner: 'orchestrator',
    produces: [],
    requiresAnswered: ['alojamento'],
    doneWhen: 'Está a correr onde vai viver, em contas que pertencem ao cliente.',
  },
  {
    stage: 'operations',
    camada: 4,
    owner: 'orchestrator',
    produces: [],
    requiresAnswered: [],
    doneWhen: 'O cliente consegue usar e manter o sistema sem depender de nós para tudo.',
  },
];

/**
 * Upstream reconciliation — the rules that are not derivable.
 *
 * Downstream impact needs no declaration: if an artifact changes, everything that
 * consumes it is affected, and `consumes`/`produces` already says who that is. What no
 * graph can tell you is when a later decision means an *earlier* one is no longer true.
 * That is judgement, so each rule carries the sentence that explains it — the persona
 * receives that sentence, not just the instruction.
 */
const PROPAGATION = [
  {
    when: 'ux_mockup',
    reconcile: 'intention',
    owner: 'product_owner',
    rule: 'Um ecrã novo que a ideia não previa é uma capacidade nova: a ideia passa a incluí-la, em vez de o mockup ficar a contradizê-la.',
  },
  {
    when: 'openspec_change',
    reconcile: 'intention',
    owner: 'product_owner',
    rule: 'Um requisito que não serve nenhum dos objectivos da ideia ou está a mais, ou a ideia estava incompleta. Decida qual, e escreva a decisão.',
  },
  {
    when: 'module_spec',
    reconcile: 'openspec_change',
    owner: 'product_owner',
    rule: 'Se a arquitectura mostra que um requisito não é construível como está escrito, é o requisito que se corrige — não o código que se contorce para o cumprir.',
  },
  {
    when: 'code_change',
    reconcile: 'module_spec',
    owner: 'module_architect',
    rule: 'Código que atravessa a fronteira de um módulo significa que a fronteira estava mal traçada. Actualize o módulo em vez de repetir a excepção.',
  },
  {
    when: 'structured_failures',
    reconcile: 'acceptance_criteria',
    owner: 'product_owner',
    rule: 'Um teste que falha por o critério estar ambíguo é um problema do critério. Reescreva-o antes de mandar corrigir o código.',
  },
];

module.exports = { PRODUCT_TYPE, PROPAGATION, ROOT_ARTIFACTS, STAGES };
