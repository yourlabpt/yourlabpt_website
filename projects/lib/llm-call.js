/**
 * One chat completion against DeepInfra (OpenAI-compatible), with the key and model
 * configured in Definições da plataforma. Every AI feature on the platform goes through
 * here — no Agent Runtime, no personas, no routing.
 *
 * Returns `{ error, status }` for states the operator can fix (no key), and throws for
 * transport/provider failures so callers can word them.
 */
const llmProviderSettings = require('./llm-provider-settings');
const llmOptions = require('./llm-options');

const TIMEOUT_MS = 120000;

function costOf(model, usage) {
  const seed = llmOptions.SEED_OPTIONS.find((option) => option.model === model);
  if (!seed || !usage) return 0;
  const input = Number(usage.prompt_tokens) || 0;
  const output = Number(usage.completion_tokens) || 0;
  return (input * seed.pricing.inputPer1M + output * seed.pricing.outputPer1M) / 1e6;
}

async function complete({ dataDir, prompt, maxTokens = 4000, fetchImpl = fetch }) {
  const credential = await llmProviderSettings.resolveProviderCredential(dataDir, 'deepinfra');
  if (!credential) {
    return { error: 'Falta a chave da DeepInfra. Adicione-a em Definições da plataforma → IA.', status: 409 };
  }
  const url = `${credential.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential.apiKey}` },
    body: JSON.stringify({
      model: credential.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    // Never echo an auth failure body — it can carry the key back.
    throw new Error(response.status === 401 || response.status === 403
      ? `DeepInfra rejeitou a chave (${response.status}).`
      : `DeepInfra respondeu ${response.status}.`);
  }
  const body = await response.json();
  return {
    text: String(body?.choices?.[0]?.message?.content || ''),
    usage: body?.usage || null,
    costUsd: costOf(credential.model, body?.usage),
    model: credential.model,
  };
}

module.exports = { complete, costOf };
