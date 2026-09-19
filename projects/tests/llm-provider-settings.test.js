const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  normalizeSettings,
  publicSettings,
  readLlmProviderSettings,
  writeProviderSettings,
  resolveProviderCredential,
  verifyProvider,
} = require('../lib/llm-provider-settings');

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'llm-provider-'));
}

describe('llm provider settings', () => {
  it('defaults to both known providers, deepinfra not ready without a key', () => {
    const settings = normalizeSettings({});
    assert.ok(settings.providers.deepinfra);
    assert.ok(settings.providers.ollama);
    const pub = publicSettings(settings);
    assert.equal(pub.providers.deepinfra.ready, false);
    // Ollama needs no key to be usable.
    assert.equal(pub.providers.ollama.ready, true);
  });

  it('stores a key encrypted, never returns it, and exposes a fingerprint', async () => {
    const dir = await tmpDir();
    const saved = await writeProviderSettings(dir, 'deepinfra', { apiKey: 'sk-super-secret-value' }, 'tester');
    const raw = await fs.readFile(path.join(dir, 'llm-provider.secret.json'), 'utf8');
    assert.equal(raw.includes('sk-super-secret-value'), false);

    const pub = publicSettings(saved, dir);
    assert.equal(pub.providers.deepinfra.hasApiKey, true);
    assert.equal(pub.providers.deepinfra.ready, true);
    assert.ok(pub.providers.deepinfra.apiKeyFingerprint);
    assert.equal(JSON.stringify(pub).includes('sk-super-secret-value'), false);

    const credential = await resolveProviderCredential(dir, 'deepinfra');
    assert.equal(credential.apiKey, 'sk-super-secret-value');
  });

  it('changing the key clears a previous verification', async () => {
    const dir = await tmpDir();
    await writeProviderSettings(dir, 'deepinfra', { apiKey: 'sk-one' });
    await verifyProvider(dir, 'deepinfra', async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'deepseek-ai/DeepSeek-V3' }] }),
    }));
    let settings = await readLlmProviderSettings(dir);
    assert.ok(settings.providers.deepinfra.verifiedAt);

    await writeProviderSettings(dir, 'deepinfra', { apiKey: 'sk-two' });
    settings = await readLlmProviderSettings(dir);
    assert.equal(settings.providers.deepinfra.verifiedAt, '');
  });

  it('verify records a clear error on a rejected credential without leaking it', async () => {
    const dir = await tmpDir();
    await writeProviderSettings(dir, 'deepinfra', { apiKey: 'sk-bad' });
    await assert.rejects(
      verifyProvider(dir, 'deepinfra', async () => ({ ok: false, status: 401, text: async () => 'sk-bad leaked here' })),
      (error) => {
        assert.match(error.message, /rejeitou a credencial/);
        assert.equal(error.message.includes('sk-bad'), false);
        return true;
      }
    );
    const settings = await readLlmProviderSettings(dir);
    assert.match(settings.providers.deepinfra.lastError, /rejeitou a credencial/);
  });

  it('refuses to verify a provider with no credential stored', async () => {
    const dir = await tmpDir();
    await assert.rejects(verifyProvider(dir, 'deepinfra', async () => ({ ok: true, json: async () => ({}) })));
  });

  it('ollama can be resolved and verified without an api key', async () => {
    const dir = await tmpDir();
    const credential = await resolveProviderCredential(dir, 'ollama');
    assert.equal(credential.apiKey, '');
    const result = await verifyProvider(dir, 'ollama', async (url) => {
      assert.match(url, /\/api\/tags$/);
      return { ok: true, json: async () => ({ models: [{ name: 'llama3.1:8b' }] }) };
    });
    assert.equal(result.sampleModel, 'llama3.1:8b');
  });
});
