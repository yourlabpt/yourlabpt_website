/**
 * Producing one Camada 0 screen.
 *
 * This is the one agent call that does **not** go through `startAgentRun`, and that is
 * deliberate rather than an oversight. `startAgentRun` requires a canonical work item
 * and writes persona history; a Camada 0 turn must do neither, or the throwaway loop
 * would fill Tarefas with disposable rows and move the fingerprints the Execução reads.
 * Everything else about it is the same platform contract: the persona is `ux`, the
 * engine comes from routing, and the cost comes back and is recorded.
 *
 * The prompt asks for one static screen with no logic and no real data — which is also
 * exactly what the render sandbox allows, so the two agree by construction rather than
 * by discipline.
 */
const llmCall = require('./llm-call');

const MOCKUP_CAMADA = 0;

function instructionsFor({ session, requestText, previousHtml }) {
  const lines = [
    'Produza UM ecrã estático em HTML para o cliente ver e decidir.',
    '',
    'Intenção:',
    session.promptText,
  ];
  if (requestText) {
    lines.push('', 'Alteração pedida nesta iteração:', requestText);
  }
  if (previousHtml) {
    lines.push(
      '',
      'Parta da versão anterior e altere só o que foi pedido — não recomece do zero.',
      'Versão anterior:',
      previousHtml.slice(0, 20000),
    );
  }
  lines.push(
    '',
    'Regras, sem excepção:',
    '- Um único documento HTML completo, nada mais na resposta.',
    '- Sem <script>. Sem pedidos de rede. Sem imagens externas.',
    '- CSS apenas em <style> ou inline.',
    '- Dados de exemplo plausíveis e escritos em português.',
    '- É um ecrã para decidir, não um protótipo funcional: nada tem de reagir a cliques.',
  );
  return lines.join('\n');
}

/**
 * Pulls a full HTML document out of whatever the model returned.
 *
 * Models wrap HTML in fences or preambles often enough that refusing those would fail
 * the loop for a cosmetic reason. Anything with no document in it at all is a real
 * failure and is reported as one.
 */
function extractHtml(raw) {
  const text = String(raw || '');
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!doctype html|<html[\s>]/i);
  if (start >= 0) return body.slice(start).trim();
  // No document tag, but real markup — wrap it rather than discard a usable screen.
  if (/<[a-z][\s\S]*>/i.test(body)) {
    return `<!doctype html>\n<meta charset="utf-8">\n${body}`;
  }
  return '';
}

/** Builds the runner the routes call. `complete` is injectable for tests. */
function createMockupRunner(deps) {
  const { dataDir, complete = llmCall.complete } = deps;

  return async function startMockupRun({ session, requestText, previousHtml }) {
    try {
      const reply = await complete({
        dataDir,
        prompt: instructionsFor({ session, requestText, previousHtml }),
        maxTokens: 8000,
      });
      if (reply.error) return reply;
      const html = extractHtml(reply.text);
      if (!html) {
        return { error: 'O modelo não devolveu um ecrã HTML utilizável.', status: 502 };
      }
      return { html, summary: '', costUsd: Math.max(0, Number(reply.costUsd) || 0), llmOptionId: reply.model };
    } catch (error) {
      return { error: `A DeepInfra não respondeu: ${error.message}`, status: 502 };
    }
  };
}

module.exports = { createMockupRunner, extractHtml, instructionsFor, MOCKUP_CAMADA };
