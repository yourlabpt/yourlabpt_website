const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const settings = require('../lib/llm-provider-settings');
const { complete, costOf } = require('../lib/llm-call');

test('llm-call: no key is a fixable state, a key sends one chat completion with the chosen model', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-call-'));
  const none = await complete({ dataDir, prompt: 'x', fetchImpl: () => { throw new Error('not called'); } });
  assert.equal(none.status, 409);

  await settings.writeProviderSettings(dataDir, 'deepinfra', { apiKey: 'sk-test', model: 'deepseek-ai/DeepSeek-V3' });
  let sent;
  const reply = await complete({
    dataDir,
    prompt: 'olá',
    fetchImpl: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1e6, completion_tokens: 0 } }) };
    },
  });
  assert.equal(sent.url, 'https://api.deepinfra.com/v1/openai/chat/completions');
  assert.equal(sent.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(sent.body.model, 'deepseek-ai/DeepSeek-V3');
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'olá' }]);
  assert.equal(reply.text, '{"ok":true}');
  assert.equal(reply.costUsd, 0.27);
  assert.equal(costOf('unknown/model', { prompt_tokens: 5 }), 0);

  await assert.rejects(
    complete({ dataDir, prompt: 'x', fetchImpl: async () => ({ ok: false, status: 401 }) }),
    /rejeitou a chave \(401\)/,
  );
});
