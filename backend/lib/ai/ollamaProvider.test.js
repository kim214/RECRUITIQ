const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonContent, getConfig, publicHealth, shouldFallback } = require('./ollamaProvider');

test('parseJsonContent reads raw JSON', () => {
  assert.deepEqual(parseJsonContent('{"ok":true,"n":1}'), { ok: true, n: 1 });
});

test('parseJsonContent reads fenced JSON', () => {
  const text = '```json\n{"ok": true}\n```';
  assert.deepEqual(parseJsonContent(text), { ok: true });
});

test('parseJsonContent rejects non-JSON', () => {
  assert.throws(() => parseJsonContent('not json'), /did not return JSON/);
});

test('getConfig uses env and never hard-codes the GCP host', () => {
  const prev = {
    base: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL,
    embed: process.env.OLLAMA_EMBEDDING_MODEL,
    keep: process.env.OLLAMA_KEEP_ALIVE,
    ctx: process.env.OLLAMA_NUM_CTX,
    primary: process.env.OLLAMA_PRIMARY_TIMEOUT_MS,
    timeout: process.env.OLLAMA_TIMEOUT_MS,
  };
  process.env.OLLAMA_BASE_URL = 'http://example.test:11434/v1';
  process.env.OLLAMA_MODEL = 'test-model';
  process.env.OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text';
  process.env.OLLAMA_KEEP_ALIVE = '15m';
  process.env.OLLAMA_NUM_CTX = '4096';
  process.env.OLLAMA_TIMEOUT_MS = '180000';
  delete process.env.OLLAMA_PRIMARY_TIMEOUT_MS;
  const cfg = getConfig();
  assert.equal(cfg.baseUrl, 'http://example.test:11434');
  assert.equal(cfg.model, 'test-model');
  assert.equal(cfg.embeddingModel, 'nomic-embed-text');
  assert.equal(cfg.keepAlive, '15m');
  assert.equal(cfg.numCtx, 4096);
  assert.equal(cfg.primaryTimeoutMs, 180000);
  assert.equal(cfg.fallbackModel, '');
  assert.equal(cfg.hasApiKey, Boolean(process.env.OLLAMA_API_KEY));
  const restore = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore('OLLAMA_BASE_URL', prev.base);
  restore('OLLAMA_MODEL', prev.model);
  restore('OLLAMA_EMBEDDING_MODEL', prev.embed);
  restore('OLLAMA_KEEP_ALIVE', prev.keep);
  restore('OLLAMA_NUM_CTX', prev.ctx);
  restore('OLLAMA_PRIMARY_TIMEOUT_MS', prev.primary);
  restore('OLLAMA_TIMEOUT_MS', prev.timeout);
});

test('shouldFallback does not stack a second model after a timeout', () => {
  assert.equal(shouldFallback(new Error('Ollama request timed out after 90000ms')), false);
  assert.equal(shouldFallback(new Error('Ollama error (502): Bad Gateway')), true);
  assert.equal(shouldFallback(new Error('Ollama unreachable at http://example: connect ECONNREFUSED')), true);
});

test('publicHealth strips baseUrl, installed models, API key, and raw errors', () => {
  const safe = publicHealth({
    available: false,
    baseUrl: 'http://10.0.0.8:11434',
    model: 'qwen2.5:7b',
    fallbackModel: 'llama3.2:3b',
    embeddingModel: 'nomic-embed-text',
    embeddingAvailable: false,
    primaryAvailable: false,
    fallbackAvailable: false,
    installedModels: ['qwen2.5:7b'],
    timeoutMs: 180000,
    hasApiKey: true,
    error: 'Ollama unreachable at http://10.0.0.8:11434: connect ECONNREFUSED',
    mode: 'ollama-only',
  });
  const blob = JSON.stringify(safe);
  assert.equal(safe.available, false);
  assert.equal(safe.model, 'qwen2.5:7b');
  assert.equal(safe.baseUrl, undefined);
  assert.equal(safe.installedModels, undefined);
  assert.equal(safe.hasApiKey, undefined);
  assert.doesNotMatch(blob, /10\.0\.0\.8/);
  assert.doesNotMatch(blob, /ECONNREFUSED/);
  assert.doesNotMatch(blob, /hasApiKey/);
});
