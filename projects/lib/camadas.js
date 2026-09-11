/**
 * The planning layers, and the test that keeps the bottom one honest.
 *
 * A camada is the *size* of what is being decided, not the kind of work:
 *
 *   0  Refinar intenção   minutes   throwaway, against something you can look at
 *   1  Visão              months    explicitly too big for one pass
 *   2  Epic               weeks     a coherent slice of the vision
 *   3  Feature            days      a slice of an epic
 *   4  Tarefa             hours     what an agent can finish in one run
 *
 * There is deliberately **no `camada` field** on anything. Each layer is already a
 * distinct thing in this codebase, and a field repeating that would be a fifth vocabulary
 * to keep in sync with the other four. `camadaOf` is a reading of what something is.
 */
const LAYERS = [
  { camada: 0, label: 'Intenção', lives: 'mockupSessions[]' },
  { camada: 1, label: 'Visão', lives: 'project.vision / project.constitution' },
  { camada: 2, label: 'Epic', lives: 'project.epics[]' },
  { camada: 3, label: 'Feature', lives: 'coordination work item with an epicId' },
  { camada: 4, label: 'Tarefa', lives: 'execution work item' },
];

const LABEL_BY_CAMADA = new Map(LAYERS.map((entry) => [entry.camada, entry.label]));

/**
 * At most one testable statement. More than one means the task is really two.
 *
 * Counted from the shapes people actually write acceptance criteria in — a checklist, a
 * numbered list, a bullet list, or one plain sentence — rather than from prose length,
 * which measures care rather than size.
 */
function countCriteria(markdown) {
  const lines = String(markdown || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const listed = lines.filter((line) => (
    /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line) || /^- \[[ xX]\]\s*/.test(line)
  ));
  if (listed.length) return listed.length;
  // No list: count sentences that actually assert something.
  const prose = lines.join(' ').trim();
  if (!prose) return 0;
  return prose.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).filter((part) => part.trim().length > 3).length;
}

function label(camada) {
  return LABEL_BY_CAMADA.get(camada) || '';
}

/** What layer this work item sits at. */
function camadaOfWorkItem(item) {
  if (!item) return null;
  return item.taskRole === 'coordination' ? 3 : 4;
}

/**
 * Whether a Camada 4 task is actually Camada 4 sized.
 *
 * The test from the methodology, verbatim in intent: if it cannot be described, executed
 * **and verified** in a single agent run with no human intervention half way, it is too
 * big and belongs back at Camada 3.
 *
 * Returns findings, not a refusal. This is a platform for building new things, and the
 * only hard gates in it are the two the policy names; everything else says what is wrong
 * and where to fix it, which is the interface rule this follows.
 */
function cutTestFindings(item) {
  if (!item || item.taskRole === 'coordination') return [];
  const findings = [];
  const criteria = countCriteria(item.acceptanceCriteriaMarkdown);

  if (criteria === 0) {
    findings.push({
      code: 'sem-criterio',
      message: 'Esta tarefa não diz como se reconhece que ficou feita. Sem isso ninguém — pessoa ou agente — consegue verificá-la.',
      fixWhere: 'Critérios de aceitação',
    });
  } else if (criteria > 1) {
    findings.push({
      code: 'criterios-a-mais',
      message: `Esta tarefa tem ${criteria} critérios. Uma tarefa de Camada 4 tem um: se são vários, são várias tarefas — volte à Camada 3 e parta-a.`,
      fixWhere: 'Camada 3',
    });
  }

  // A task that spans modules cannot be verified in one pass, because the thing that
  // proves it works lives somewhere the task does not own.
  const modules = new Set((item.repositoryPaths || [])
    .map((path) => String(path).split('/')[0])
    .filter(Boolean));
  if (modules.size > 1) {
    findings.push({
      code: 'multi-modulo',
      message: `Esta tarefa toca ${modules.size} módulos. Atravessar uma fronteira num só passo é o que torna a revisão impossível — parta-a por módulo.`,
      fixWhere: 'Camada 3',
    });
  }

  if (!String(item.descriptionMarkdown || '').trim()) {
    findings.push({
      code: 'sem-descricao',
      message: 'Esta tarefa não tem instruções. Um agente que a receba assim está a adivinhar.',
      fixWhere: 'Instruções',
    });
  }

  return findings;
}

/** One sentence for the interface, or empty when the task is the right size. */
function cutTestSummary(item) {
  const findings = cutTestFindings(item);
  return findings.length ? findings[0].message : '';
}

module.exports = {
  LAYERS,
  camadaOfWorkItem,
  countCriteria,
  cutTestFindings,
  cutTestSummary,
  label,
};
