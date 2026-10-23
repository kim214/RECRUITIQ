require('dotenv').config();
const ai = require('../lib/ai/aiService');
const { checkOcrHealth } = require('../lib/ocrService');

function publicHealth(health) {
  const { error, ...rest } = health;
  return { ...rest, error: error || undefined };
}

async function main() {
  const cfg = ai.getConfig();
  console.log('config', {
    provider: ai.provider,
    configured: ai.isConfigured(),
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    fallbackModel: cfg.fallbackModel,
    embeddingModel: cfg.embeddingModel || null,
    timeoutMs: cfg.timeoutMs,
    hasApiKey: cfg.hasApiKey,
  });

  const health = await ai.healthCheck();
  console.log('health', publicHealth(health));
  if (!health.available) {
    console.error('FAIL: Ollama chat model is not available');
    process.exit(1);
  }

  const t0 = Date.now();
  const structured = await ai.structuredOutput({
    prompt: 'Reply with JSON {"ok":true,"service":"recruitiq"} only.',
    maxTokens: 64,
    temperature: 0,
  });
  console.log('structured', {
    ms: Date.now() - t0,
    model: structured.model,
    parsed: structured.parsed,
  });
  if (!structured.parsed || structured.parsed.ok !== true) {
    console.error('FAIL: structuredOutput did not return { ok: true }');
    process.exit(1);
  }

  if (cfg.embeddingModel) {
    try {
      const emb = await ai.embeddings({ input: 'recruitiq candidate matching' });
      console.log('embeddings', {
        model: emb.model,
        dims: emb.embeddings[0] && emb.embeddings[0].length,
      });
    } catch (err) {
      console.warn('embeddings skipped:', err.message);
    }
  } else {
    console.log('embeddings skipped: OLLAMA_EMBEDDING_MODEL not set');
  }

  const ocr = await checkOcrHealth();
  console.log('ocr', { configured: ocr.configured, available: ocr.available, engine: ocr.engine || null });
  if (!ocr.available) console.warn('OCR sidecar not reachable yet — analysis will skip scans until it is');

  console.log('PASS');
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
