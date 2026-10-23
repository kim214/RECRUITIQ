/**
 * RecruitIQ AI service — Ollama only for now.
 * Call this from the backend. Do not import from client code.
 */

const ollama = require('./ollamaProvider');

function isConfigured() {
  return (process.env.LLM_PROVIDER || 'ollama').toLowerCase() === 'ollama';
}

const aiService = {
  provider: 'ollama',
  isConfigured,
  getConfig: ollama.getConfig,
  generate: (opts) => ollama.generate(opts),
  generateWithFallback: (opts) => ollama.generateWithFallback(opts),
  structuredOutput: (opts) => ollama.structuredOutput(opts),
  embeddings: (opts) => ollama.embeddings(opts),
  healthCheck: () => ollama.healthCheck(),
  warmupModels: () => ollama.warmupModels(),
};

module.exports = aiService;
