/**
 * Remote OCR on the GCP VM (system Tesseract).
 * Default target is the same host as Ollama so Nginx can expose POST /ocr.
 */

function normalizeBaseUrl(raw) {
  return String(raw || '').trim().replace(/\/$/, '');
}

function resolveOcrBaseUrl() {
  return normalizeBaseUrl(process.env.OCR_BASE_URL)
    || normalizeBaseUrl(process.env.OLLAMA_BASE_URL);
}

function getOcrConfig() {
  return {
    baseUrl: resolveOcrBaseUrl(),
    explicit: Boolean(normalizeBaseUrl(process.env.OCR_BASE_URL)),
    apiKey: process.env.OCR_API_KEY || process.env.OLLAMA_API_KEY || '',
    timeoutMs: Number(process.env.OCR_TIMEOUT_MS || 60000),
    healthTimeoutMs: Number(process.env.OCR_HEALTH_TIMEOUT_MS || 4000),
  };
}

function isRemoteOcrConfigured() {
  return Boolean(normalizeBaseUrl(process.env.OCR_BASE_URL));
}

function isOcrEnabled() {
  if (String(process.env.OCR_ENABLED || '').trim() === '0') return false;
  if (isRemoteOcrConfigured()) return true;
  if (process.env.VERCEL) return false;
  return String(process.env.OCR_ENABLED || '').trim() === '1';
}

function mimeForType(type) {
  if (type === 'png') return 'image/png';
  if (type === 'jpeg') return 'image/jpeg';
  if (type === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function ocrHeaders(cfg, extra = {}) {
  const headers = { ...extra };
  if (cfg.apiKey) {
    headers['X-OCR-Key'] = cfg.apiKey;
    headers['X-Ollama-Key'] = cfg.apiKey;
  }
  return headers;
}

let healthCache = { at: 0, value: null };

function clearOcrHealthCache() {
  healthCache = { at: 0, value: null };
}

async function probeOcr(baseUrl, cfg) {
  const paths = [`${baseUrl}/ocr/health`, `${baseUrl}/health`];
  let lastError = null;
  for (const url of paths) {
    try {
      const res = await fetch(url, {
        headers: ocrHeaders(cfg),
        signal: AbortSignal.timeout(cfg.healthTimeoutMs),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false && (data.engine === 'tesseract' || data.ok === true)) {
        return { configured: true, available: true, engine: data.engine || 'tesseract' };
      }
      lastError = data.message || `OCR error (${res.status})`;
    } catch (err) {
      lastError = err.message;
    }
  }
  return { configured: Boolean(cfg.explicit), available: false, error: lastError };
}

async function checkOcrHealth() {
  const cfg = getOcrConfig();
  if (!cfg.baseUrl) {
    return { configured: false, available: false };
  }
  const now = Date.now();
  if (healthCache.value && now - healthCache.at < 30000) return healthCache.value;
  const value = await probeOcr(cfg.baseUrl, cfg);
  healthCache = { at: now, value };
  return value;
}

async function ocrReady() {
  if (String(process.env.OCR_ENABLED || '').trim() === '0') return false;
  const health = await checkOcrHealth();
  return Boolean(health.available);
}

async function recognizeRemote(buffer, { filename = 'document', type = '' } = {}) {
  const cfg = getOcrConfig();
  if (!cfg.baseUrl) throw new Error('OCR_BASE_URL is not set');
  if (!buffer?.length) throw new Error('OCR requires a document buffer');

  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/ocr`, {
      method: 'POST',
      headers: ocrHeaders(cfg, {
        'Content-Type': mimeForType(type),
        'X-Filename': encodeURIComponent(filename),
      }),
      body: buffer,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
      ? `OCR timed out after ${cfg.timeoutMs}ms`
      : `OCR unreachable: ${err.message}`;
    throw new Error(reason);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `OCR error (${res.status})`);
  }
  return {
    text: String(data.text || '').trim(),
    engine: data.engine || 'tesseract',
  };
}

module.exports = {
  getOcrConfig,
  resolveOcrBaseUrl,
  isRemoteOcrConfigured,
  isOcrEnabled,
  mimeForType,
  recognizeRemote,
  checkOcrHealth,
  ocrReady,
  clearOcrHealthCache,
};
