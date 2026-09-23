/**
 * Every AI request leaves a performed task, so Tarefas is the one record of what the AI
 * was asked, what it cost and what it answered. Shared by the packs, the AI steps and
 * the Intenção mockup.
 */
const crypto = require('crypto');
const workItems = require('./work-items');

/**
 * Every AI request leaves a performed task. A request made for a task already open (an
 * AI step, a split) is noted on that task instead of opening another one.
 */
async function recordAiRun({ updateStore, appendActivity }, projectId, actorUserId, { title, request = '', target = '', outcome, taskId = '' }) {
  const summary = String(outcome?.result?.summary || outcome?.summary || '').slice(0, 400);
  const body = [
    request && `Pedido: ${request}`,
    target && `Alvo: \`${target}\``,
    `Modelo: ${outcome?.model || '—'} · custo: $${(Number(outcome?.costUsd) || 0).toFixed(4)}`,
    summary && `Resposta: ${summary}`,
  ].filter(Boolean).join('\n\n');
  let recorded = null;
  await updateStore(async (store) => {
    const project = store.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    const now = new Date().toISOString();
    const list = workItems.getWorkItems(project);
    const index = taskId ? list.findIndex((entry) => entry.id === taskId) : -1;
    if (index >= 0) {
      list[index] = workItems.addWorkItemUpdate(list[index], `**IA · ${title}**\n\n${body}`, { actorUserId, nowIso: () => now });
      recorded = list[index].id;
    } else {
      const record = workItems.normalizeWorkItem({
        id: `witem_${crypto.randomUUID()}`,
        title: `IA: ${title}${target ? ` — ${target.replace(/\/spec\.md$/, '').replace(/\/$/, '').split('/').pop()}` : ''}`,
        descriptionMarkdown: body,
        complexity: 'low',
        status: 'completed',
        // 'platform', not 'agent': an agent origin brings back the runtime controls.
        origin: 'platform',
        executorMode: 'human',
        deliveryStageId: 'unclassified',
        sourceRefs: [{ type: 'ai_run', id: crypto.randomUUID(), label: target || title }],
        createdAt: now,
        updatedAt: now,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      }, { project, actorUserId, nowIso: () => now });
      list.unshift(record);
      recorded = record.id;
    }
    workItems.setWorkItems(project, list.slice(0, 2000));
    appendActivity(store, { projectId, actorUserId, action: 'ai_run', details: { title, target, costUsd: outcome?.costUsd, model: outcome?.model, workItemId: recorded } });
  });
  return recorded;
}

module.exports = { recordAiRun };
