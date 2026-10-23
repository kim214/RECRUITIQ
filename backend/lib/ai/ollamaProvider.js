/**
 * Ollama provider — the only LLM backend for RecruitIQ.
 * URL, model, and secrets come from env; never called from the browser.
 */

function normalizeBaseUrl(raw) {
  return String(raw || 'http://127.0.0.1:11434')
    .trim()
    .replace(/\/v1\/?$/, '')
    .replace(/\/$/, '');
}

function getConfig() {
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
  return {
    baseUrl: normalizeBaseUrl(process.env.OLLAMA_BASE_URL),
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    fallbackModel: '', // one chat model only — never stack a second LLM on the VM
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || '',
    timeoutMs,
    primaryTimeoutMs: timeoutMs,
    healthTimeoutMs: Number(process.env.OLLAMA_HEALTH_TIMEOUT_MS || 8000),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || '30m',
    numCtx: Number(process.env.OLLAMA_NUM_CTX || 8192),
    hasApiKey: Boolean(process.env.OLLAMA_API_KEY),
  };
}

function requestHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_API_KEY) {
    headers['X-Ollama-Key'] = process.env.OLLAMA_API_KEY;
  }
  return headers;
}

function modelInstalled(installed, name) {
  if (!name) return false;
  return installed.some((n) => n === name || n.startsWith(`${name}:`));
}

function parseJsonContent(text) {
  const raw = (text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Ollama did not return JSON');
  return JSON.parse(body.slice(start, end + 1));
}

async function ollamaFetch(path, { method = 'GET', body, timeoutMs } = {}) {
  const { baseUrl, timeoutMs: defaultTimeout } = getConfig();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs || defaultTimeout),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
      ? `Ollama request timed out after ${timeoutMs || defaultTimeout}ms`
      : `Ollama unreachable at ${baseUrl}: ${err.message}`;
    throw new Error(reason);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err.slice(0, 400)}`);
  }
  return res.json();
}

function shouldFallback(err) {
  const msg = String(err?.message || '');
  if (/timed out/i.test(msg)) return false;
  return true;
}

async function streamChat(payload, timeoutMs) {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/api/chat`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({ ...payload, stream: true }),
      signal: AbortSignal.timeout(timeoutMs || cfg.timeoutMs),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
      ? `Ollama request timed out after ${timeoutMs || cfg.timeoutMs}ms`
      : `Ollama unreachable at ${cfg.baseUrl}: ${err.message}`;
    throw new Error(reason);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let model = payload.model;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let chunk;
      try { chunk = JSON.parse(trimmed); } catch { continue; }
      if (chunk.error) throw new Error(String(chunk.error));
      if (chunk.message?.content) content += chunk.message.content;
      if (chunk.model) model = chunk.model;
    }
  }
  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer.trim());
      if (chunk.message?.content) content += chunk.message.content;
      if (chunk.model) model = chunk.model;
    } catch { /* ignore trailing partial */ }
  }
  return { content, model };
}

async function generate({ prompt, system, model, temperature = 0.2, maxTokens = 2048, format, timeoutMs, keepAlive } = {}) {
  const cfg = getConfig();
  const useModel = model || cfg.model;
  if (!prompt) throw new Error('Ollama generate() requires a prompt');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const payload = {
    model: useModel,
    messages,
    keep_alive: keepAlive != null ? keepAlive : cfg.keepAlive,
    options: { temperature, num_predict: maxTokens, num_ctx: cfg.numCtx },
  };
  if (format) payload.format = format;

  const started = Date.now();
  try {
    const data = await streamChat(payload, timeoutMs || cfg.timeoutMs);
    console.log(`[ollama] ${useModel} chat ${Date.now() - started}ms chars=${prompt.length}`);
    return {
      content: data.content || '',
      model: data.model || useModel,
      raw: data,
    };
  } catch (err) {
    console.error(`[ollama] ${useModel} chat failed ${Date.now() - started}ms:`, err.message);
    throw err;
  }
}

async function generateWithFallback(opts = {}) {
  const cfg = getConfig();
  const models = [opts.model || cfg.model, cfg.fallbackModel].filter((m, i, arr) => m && arr.indexOf(m) === i);
  let lastError;
  for (const [index, model] of models.entries()) {
    try {
      const timeoutMs = index === 0 ? cfg.primaryTimeoutMs : cfg.timeoutMs;
      const keepAlive = index === 0 ? cfg.keepAlive : '0';
      return await generate({ ...opts, model, timeoutMs, keepAlive });
    } catch (err) {
      lastError = err;
      console.error(`Ollama generate failed (${model}):`, err.message);
      if (!cfg.fallbackModel || !shouldFallback(err)) break;
    }
  }
  throw lastError || new Error('Ollama generate failed — is Ollama running?');
}

async function structuredOutput(opts = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await generateWithFallback({
        ...opts,
        format: 'json',
        temperature: opts.temperature ?? 0.1,
      });
      return { ...result, parsed: parseJsonContent(result.content) };
    } catch (err) {
      lastErr = err;
      const jsonFail = /JSON|did not return JSON/i.test(err.message || '');
      if (!jsonFail || attempt === 2) throw err;
      console.error(`Ollama JSON parse failed, retrying (${attempt}):`, err.message);
    }
  }
  throw lastErr || new Error('Ollama structured output failed');
}

async function embeddings({ input, model } = {}) {
  const cfg = getConfig();
  const useModel = model || cfg.embeddingModel;
  if (!useModel) {
    throw new Error('Set OLLAMA_EMBEDDING_MODEL to enable embeddings');
  }
  const text = Array.isArray(input) ? input : [input];
  if (!text.length || text.some((t) => t == null || String(t).trim() === '')) {
    throw new Error('Ollama embeddings() requires non-empty input');
  }

  try {
    const data = await ollamaFetch('/api/embed', {
      method: 'POST',
      body: { model: useModel, input: text.length === 1 ? text[0] : text, keep_alive: cfg.keepAlive },
      timeoutMs: Math.min(cfg.timeoutMs, 60000),
    });
    const vectors = data.embeddings || (data.embedding ? [data.embedding] : []);
    if (!vectors.length) throw new Error('Ollama /api/embed returned no vectors');
    return { model: data.model || useModel, embeddings: vectors };
  } catch (err) {
    if (text.length !== 1) throw err;
    const data = await ollamaFetch('/api/embeddings', {
      method: 'POST',
      body: { model: useModel, prompt: text[0], keep_alive: cfg.keepAlive },
      timeoutMs: Math.min(cfg.timeoutMs, 60000),
    });
    if (!data.embedding) throw new Error('Ollama /api/embeddings returned no vector');
    return { model: data.model || useModel, embeddings: [data.embedding] };
  }
}

async function healthCheck() {
  const cfg = getConfig();
  try {
    const data = await ollamaFetch('/api/tags', { timeoutMs: cfg.healthTimeoutMs });
    const installed = (data.models || []).map((m) => m.name);
    const primaryOk = modelInstalled(installed, cfg.model);
    const fallbackOk = !cfg.fallbackModel || modelInstalled(installed, cfg.fallbackModel);
    const embeddingOk = cfg.embeddingModel ? modelInstalled(installed, cfg.embeddingModel) : null;
    return {
      available: primaryOk || fallbackOk,
      provider: 'ollama',
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      fallbackModel: cfg.fallbackModel,
      embeddingModel: cfg.embeddingModel || null,
      embeddingAvailable: embeddingOk,
      primaryAvailable: primaryOk,
      fallbackAvailable: fallbackOk,
      installedModels: installed,
      timeoutMs: cfg.timeoutMs,
      hasApiKey: cfg.hasApiKey,
      mode: 'ollama-only',
    };
  } catch (err) {
    return {
      available: false,
      provider: 'ollama',
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      fallbackModel: cfg.fallbackModel,
      embeddingModel: cfg.embeddingModel || null,
      embeddingAvailable: false,
      hasApiKey: cfg.hasApiKey,
      error: err.message,
      mode: 'ollama-only',
    };
  }
}

async function warmupModels() {
  const cfg = getConfig();
  const started = Date.now();
  try {
    await ollamaFetch('/api/generate', {
      method: 'POST',
      body: {
        model: cfg.model,
        prompt: 'ok',
        stream: false,
        keep_alive: cfg.keepAlive,
        options: { num_predict: 1 },
      },
      timeoutMs: Math.min(cfg.timeoutMs, 120000),
    });
    if (cfg.embeddingModel) {
      await ollamaFetch('/api/embed', {
        method: 'POST',
        body: { model: cfg.embeddingModel, input: 'ok', keep_alive: cfg.keepAlive },
        timeoutMs: 60000,
      });
    }
    console.log(`[ollama] models ready ${Date.now() - started}ms (${cfg.model}${cfg.embeddingModel ? `, ${cfg.embeddingModel}` : ''})`);
  } catch (err) {
    console.error(`[ollama] warmup failed ${Date.now() - started}ms:`, err.message);
  }
}

/** Browser-safe subset — never include baseUrl, models list, API key, or raw errors. */
function publicHealth(health) {
  const available = Boolean(health?.available);
  return {
    available,
    provider: 'ollama',
    model: health?.model || null,
    fallbackModel: health?.fallbackModel || null,
    embeddingModel: health?.embeddingModel || null,
    embeddingAvailable: health?.embeddingAvailable ?? null,
    primaryAvailable: Boolean(health?.primaryAvailable),
    fallbackAvailable: Boolean(health?.fallbackAvailable),
    mode: 'ollama-only',
    ...(available ? {} : { error: 'Ollama is unreachable or the configured model is not installed' }),
  };
}

module.exports = {
  getConfig,
  parseJsonContent,
  generate,
  generateWithFallback,
  structuredOutput,
  embeddings,
  healthCheck,
  warmupModels,
  publicHealth,
  shouldFallback,
};
