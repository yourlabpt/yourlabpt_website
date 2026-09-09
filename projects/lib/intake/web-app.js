/**
 * The questions a web app has to answer before anyone builds it.
 *
 * This exists because an agent given a vague brief produces something plausible, and
 * the mistake only becomes visible at the end — when fixing it means a refactor. A
 * fixed core set is the floor: whatever else happens, these were asked.
 *
 * Each question declares what it feeds, so an unanswered one can be pointed at the
 * stage it blocks rather than being a generic "incomplete form". `why` is shown to the
 * person answering: a question whose purpose you cannot see gets a throwaway answer.
 *
 * The Product Owner asks follow-up rounds on top of this, where an answer is thin.
 * This set works with the runtime offline, so a project is never blocked on an agent
 * in order to be defined.
 */

const QUESTIONS = [
  // --- Quem e porquê: the idea itself -----------------------------------------
  {
    id: 'quem-usa',
    group: 'Quem e porquê',
    question: 'Quem vai usar isto todos os dias?',
    why: 'Sem papéis concretos os requisitos ficam genéricos, e o mockup acaba a servir toda a gente e ninguém.',
    feeds: { stage: 'idea', artifact: 'intention' },
    required: true,
    shape: 'text',
  },
  {
    id: 'processo-actual',
    group: 'Quem e porquê',
    question: 'Como é que essas pessoas fazem isto hoje, sem a aplicação?',
    why: 'O sistema novo substitui um processo que já existe. Descrevê-lo é o que evita construir algo que ninguém consegue adoptar.',
    feeds: { stage: 'idea', artifact: 'project_context' },
    required: true,
    shape: 'text',
  },
  {
    id: 'dor',
    group: 'Quem e porquê',
    question: 'O que é que corre mal nesse processo?',
    why: 'A dor concreta é o critério para decidir o que entra na primeira versão e o que pode esperar.',
    feeds: { stage: 'idea', artifact: 'intention' },
    required: true,
    shape: 'text',
  },
  {
    id: 'sucesso',
    group: 'Quem e porquê',
    question: 'Daqui a três meses, o que tem de ser verdade para isto ter valido a pena?',
    why: 'Um critério observável. Sem ele não há como fechar o projecto, nem como discordar de forma útil.',
    feeds: { stage: 'idea', artifact: 'intention' },
    required: true,
    shape: 'text',
  },

  // --- O que é: what Discovery turns into a mockup -----------------------------
  {
    id: 'acao-principal',
    group: 'O que é',
    question: 'Qual é a acção principal que alguém faz nesta aplicação?',
    why: 'Uma aplicação tem um verbo central e tudo o resto é apoio. É por aqui que o mockup começa.',
    feeds: { stage: 'discovery', artifact: 'ux_flow' },
    required: true,
    shape: 'text',
  },
  {
    id: 'ecras-certos',
    group: 'O que é',
    question: 'Que ecrãs existem de certeza?',
    why: 'O inventário inicial. Não precisa de estar completo — precisa de existir para o UX ter por onde pegar.',
    feeds: { stage: 'discovery', artifact: 'screen_inventory' },
    required: true,
    shape: 'text',
  },
  {
    id: 'fora-ambito',
    group: 'O que é',
    question: 'O que é que esta primeira versão NÃO vai fazer?',
    why: 'Orçamento fechado exige uma fronteira escrita. O que fica de fora agora é o que se orça à parte depois.',
    feeds: { stage: 'discovery', artifact: 'intention' },
    required: true,
    shape: 'text',
  },
  {
    id: 'referencias-visuais',
    group: 'O que é',
    question: 'Há alguma aplicação ou site que sirva de referência visual?',
    why: 'Uma referência poupa uma ronda inteira de mockup. Sem ela, a primeira versão é um palpite.',
    feeds: { stage: 'discovery', artifact: 'visual_reference' },
    required: false,
    shape: 'text',
  },

  // --- Dados: what the thing actually stores ----------------------------------
  {
    id: 'entidades',
    group: 'Dados',
    question: 'Que informação é que a aplicação guarda? (ex.: clientes, reservas, produtos)',
    why: 'As entidades definem o modelo de dados e, com ele, metade da arquitectura.',
    feeds: { stage: 'requirements', artifact: 'project_context' },
    required: true,
    shape: 'text',
  },
  {
    id: 'origem-dados',
    group: 'Dados',
    question: 'De onde vem essa informação? Escrita à mão, importada, ou vinda de outro sistema?',
    why: 'Importar dados que já existem é quase sempre mais trabalho do que o ecrã que os mostra.',
    feeds: { stage: 'requirements', artifact: 'project_context' },
    required: false,
    shape: 'text',
  },
  {
    id: 'quem-ve-o-que',
    group: 'Dados',
    question: 'Quem pode ver e alterar o quê?',
    why: 'Havendo mais do que um papel, a visibilidade atravessa todos os ecrãs — não se acrescenta no fim.',
    feeds: { stage: 'requirements', artifact: 'project_context' },
    required: false,
    shape: 'text',
  },

  // --- Acesso ------------------------------------------------------------------
  {
    id: 'login',
    group: 'Acesso',
    question: 'Precisa de contas e login? De que tipo?',
    why: 'Autenticação muda o arranque do projecto. Decidir tarde obriga a refazer ecrãs já aprovados.',
    feeds: { stage: 'requirements', artifact: 'project_context' },
    required: false,
    shape: 'choice',
    options: ['Não precisa', 'Email e password', 'Entrar com Google', 'Só por convite', 'Ainda não sei'],
  },

  // --- Integrações -------------------------------------------------------------
  {
    id: 'integracoes',
    group: 'Integrações',
    question: 'Tem de falar com que outros sistemas? (pagamentos, email, calendário, facturação, ERP)',
    why: 'Cada integração traz limites que não controlamos. É o que mais frequentemente destrói uma estimativa.',
    feeds: { stage: 'architecture', artifact: 'project_context' },
    required: false,
    shape: 'text',
  },

  // --- Realidade: the constraints that decide the architecture ------------------
  {
    id: 'escala',
    group: 'Realidade',
    question: 'Quantas pessoas usam isto ao mesmo tempo, realisticamente?',
    why: 'A diferença entre dez e dez mil é de arquitectura, não de esforço. Um número honesto agora evita sobre-engenharia.',
    feeds: { stage: 'architecture', artifact: 'project_context' },
    required: false,
    shape: 'text',
  },
  {
    id: 'telemovel',
    group: 'Realidade',
    question: 'Isto usa-se no telemóvel? É o principal?',
    why: '"Também no telemóvel" e "sobretudo no telemóvel" produzem desenhos diferentes logo no primeiro ecrã.',
    feeds: { stage: 'discovery', artifact: 'project_context' },
    required: false,
    shape: 'choice',
    options: ['Sobretudo telemóvel', 'Sobretudo computador', 'Os dois por igual', 'Ainda não sei'],
  },
  {
    id: 'prazo',
    group: 'Realidade',
    question: 'Há alguma data que não possa falhar? Porquê?',
    why: 'Uma data com motivo — uma feira, uma lei, uma época — ordena o roteiro. Uma data sem motivo costuma ser negociável.',
    feeds: { stage: 'roadmap', artifact: 'project_context' },
    required: false,
    shape: 'text',
  },

  // --- Entrega -----------------------------------------------------------------
  {
    id: 'alojamento',
    group: 'Entrega',
    question: 'Onde vai correr, e de quem são o domínio e as contas?',
    why: 'O cliente é dono do sistema e dos acessos. Confirmar isto no início evita uma entrega presa a contas que não lhe pertencem.',
    feeds: { stage: 'delivery', artifact: 'project_context' },
    required: false,
    shape: 'text',
  },
];

const GROUP_ORDER = [
  'Quem e porquê', 'O que é', 'Dados', 'Acesso', 'Integrações', 'Realidade', 'Entrega',
];

function questionById(id) {
  return QUESTIONS.find((entry) => entry.id === String(id || '')) || null;
}

function requiredQuestionIds() {
  return QUESTIONS.filter((entry) => entry.required).map((entry) => entry.id);
}

module.exports = { GROUP_ORDER, QUESTIONS, questionById, requiredQuestionIds };
