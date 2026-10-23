const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getOcrConfig,
  resolveOcrBaseUrl,
  isRemoteOcrConfigured,
  isOcrEnabled,
  mimeForType,
} = require('./ocrService');

test('OCR is off unless OCR_BASE_URL or OCR_ENABLED is set', () => {
  const prev = {
    url: process.env.OCR_BASE_URL,
    enabled: process.env.OCR_ENABLED,
    vercel: process.env.VERCEL,
    ollama: process.env.OLLAMA_BASE_URL,
  };
  delete process.env.OCR_BASE_URL;
  delete process.env.OCR_ENABLED;
  delete process.env.VERCEL;
  delete process.env.OLLAMA_BASE_URL;
  assert.equal(isRemoteOcrConfigured(), false);
  assert.equal(isOcrEnabled(), false);
  assert.equal(resolveOcrBaseUrl(), '');

  process.env.OLLAMA_BASE_URL = 'http://vm.example';
  assert.equal(resolveOcrBaseUrl(), 'http://vm.example');
  assert.equal(isOcrEnabled(), false, 'Ollama URL alone does not enable OCR');

  process.env.VERCEL = '1';
  process.env.OCR_ENABLED = '1';
  assert.equal(isOcrEnabled(), false, 'Vercel must not run local Tesseract');

  delete process.env.VERCEL;
  process.env.OCR_BASE_URL = 'http://ocr.example:3100/';
  assert.equal(getOcrConfig().baseUrl, 'http://ocr.example:3100');
  assert.equal(isRemoteOcrConfigured(), true);
  assert.equal(isOcrEnabled(), true);
  assert.equal(mimeForType('png'), 'image/png');
  assert.equal(mimeForType('pdf'), 'application/pdf');

  if (prev.url === undefined) delete process.env.OCR_BASE_URL;
  else process.env.OCR_BASE_URL = prev.url;
  if (prev.enabled === undefined) delete process.env.OCR_ENABLED;
  else process.env.OCR_ENABLED = prev.enabled;
  if (prev.vercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = prev.vercel;
  if (prev.ollama === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = prev.ollama;
});
