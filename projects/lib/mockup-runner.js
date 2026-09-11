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
const agentPersonas = require('./agent-personas');
const agentPlatformSettings = require('./agent-platform-settings');
const llmOptions = require('./llm-options');

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

/**
 * Builds the runner the routes call.
 *
 * Returns `{ error, status }` rather than throwing when the platform simply is not
 * connected to anything — that is a state the operator can fix, and it deserves a
 * sentence saying where, not a stack trace.
 */
function createMockupRunner(deps) {
  const { dataDir, runtime, connectorStore, agentConnectionMode } = deps;

  return async function startMockupRun({ session, requestText, previousHtml }) {
    if (agentConnectionMode === 'disabled') {
      return { error: 'Execução por agente desactivada nesta instalação.', status: 503 };
    }
    if (agentConnectionMode === 'remote_pull' && !connectorStore?.activeConnector()) {
      return {
        error: 'Nenhum Agent Runtime emparelhado. Empareleie um em Definições → Agent Runtime antes de gerar mockups.',
        status: 409,
      };
    }

    const settings = await agentPlatformSettings.readAgentPlatformSettings(dataDir);
    const persona = agentPersonas.resolvePersona('ux', settings.personas);
    // Camada 0 is refinement: the routing rule already sends camada <= 2 to the cheap
    // engine, so this asks the same question every other dispatch asks.
    const routed = agentPlatformSettings.routeForPersona(settings, {
      personaId: 'ux',
      camada: MOCKUP_CAMADA,
    });
    if (!routed.option) {
      return {
        error: 'Nenhum modelo activo. Active um em Definições da plataforma → Modelos.',
        status: 409,
      };
    }

    try {
      const created = await runtime.createJob({
        agentId: persona.id,
        agentType: persona.taskTypes[0],
        instructions: instructionsFor({ session, requestText, previousHtml }),
        llm: llmOptions.wireSpec(routed.option),
        options: {
          modelProfileId: routed.profileId,
          llmOptionId: routed.option.id,
          // One screen, one pass. A mockup that needs planning waves is not a mockup.
          planningWaveSize: 1,
          enableWebSearch: false,
        },
      });
      const html = extractHtml(created?.output ?? created?.result ?? created?.text);
      if (!html) {
        return { error: 'O agente não devolveu um ecrã HTML utilizável.', status: 502 };
      }
      return {
        html,
        summary: String(created?.summary || '').slice(0, 400),
        costUsd: Math.max(0, Number(created?.costUsed) || 0),
        llmOptionId: routed.option.id,
      };
    } catch (error) {
      return { error: `O Agent Runtime não respondeu: ${error.message}`, status: 502 };
    }
  };
}

module.exports = { createMockupRunner, extractHtml, instructionsFor, MOCKUP_CAMADA };
