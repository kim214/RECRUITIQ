/**
 * @deprecated Use ollamaAnalyzer.js — kept for backward-compatible status exports.
 */
const { checkOllamaHealth, isOllamaConfigured, DEFAULT_MODEL } = require('./ollamaAnalyzer');

function isLlmAvailable() {
  return isOllamaConfigured();
}

async function getActiveProviderInfo() {
  return checkOllamaHealth();
}

module.exports = {
  isLlmAvailable,
  getActiveProviderInfo,
  DEFAULT_MODEL,
};
