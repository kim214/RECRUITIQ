const test = require('node:test');
const assert = require('node:assert/strict');
const { publicVmStatus } = require('./vmHealth');

test('publicVmStatus reports chat, embeddings, and OCR without leaking the host', () => {
  const status = publicVmStatus({
    available: true,
    baseUrl: 'http://10.1.2.3',
    model: 'qwen2.5:7b',
    fallbackModel: 'llama3.2:3b',
    embeddingModel: 'nomic-embed-text',
    embeddingAvailable: true,
    primaryAvailable: true,
    fallbackAvailable: true,
    installedModels: ['qwen2.5:7b'],
    hasApiKey: true,
  }, {
    configured: true,
    available: false,
    engine: 'tesseract',
  });

  const blob = JSON.stringify(status);
  assert.equal(status.llm.available, true);
  assert.equal(status.embeddings.available, true);
  assert.equal(status.embeddings.model, 'nomic-embed-text');
  assert.equal(status.ocr.pending, true);
  assert.equal(status.vm.chat, true);
  assert.equal(status.vm.ocr, false);
  assert.equal(status.llm.baseUrl, undefined);
  assert.doesNotMatch(blob, /10\.1\.2\.3/);
  assert.doesNotMatch(blob, /hasApiKey/);
});
