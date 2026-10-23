/**
 * @deprecated Use lib/ai/aiService.js — kept for backward-compatible status exports.
 */
const aiService = require('./ai/aiService');

function isLlmAvailable() {
  return aiService.isConfigured();
}

async function getActiveProviderInfo() {
  return aiService.healthCheck();
}

module.exports = {
  isLlmAvailable,
  getActiveProviderInfo,
  get DEFAULT_MODEL() {
    return aiService.getConfig().model;
  },
};
