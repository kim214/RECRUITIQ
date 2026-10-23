/**
 * Combined health for every GCP VM integration: Ollama chat, embeddings, OCR.
 * Browser-safe. Does not include host, API keys, or raw errors.
 */

const { healthCheck, publicHealth } = require('./ai/ollamaProvider');
const { checkOcrHealth, isRemoteOcrConfigured } = require('./ocrService');

function publicOcr(ocr) {
  const configured = Boolean(ocr?.configured || isRemoteOcrConfigured());
  const available = Boolean(ocr?.available);
  return {
    configured,
    available,
    engine: available ? (ocr.engine || 'tesseract') : null,
    pending: configured && !available,
  };
}

function publicEmbeddings(ollama) {
  const model = ollama?.embeddingModel || null;
  return {
    configured: Boolean(model),
    available: ollama?.embeddingAvailable === true,
    model,
  };
}

function publicVmStatus(ollama, ocr) {
  const llm = publicHealth(ollama || {});
  const embeddings = publicEmbeddings(ollama);
  const ocrPublic = publicOcr(ocr);
  return {
    llm,
    embeddings,
    ocr: ocrPublic,
    vm: {
      chat: Boolean(llm.available),
      embeddings: Boolean(embeddings.available),
      ocr: Boolean(ocrPublic.available),
    },
    mode: 'ollama-only',
  };
}

async function checkVmIntegrations() {
  const ollama = await healthCheck();
  const ocr = await checkOcrHealth();
  return publicVmStatus(ollama, ocr);
}

module.exports = {
  publicOcr,
  publicEmbeddings,
  publicVmStatus,
  checkVmIntegrations,
};
