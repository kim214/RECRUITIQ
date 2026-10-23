/**
 * Analysis audit snapshot (Milestone 15).
 * Records which model/pipeline produced a score so later model changes are visible.
 */

const aiService = require('./ai/aiService');
const { SCORING_VERSION } = require('./scoringEngine');

const ANALYSIS_VERSION = 'm16-v1';

function configuredModels() {
  const cfg = aiService.getConfig();
  return {
    model: cfg.model || null,
    fallback_model: cfg.fallbackModel || null,
    embedding_model: cfg.embeddingModel || null,
  };
}

function chatModel(analysis, cfg = configuredModels()) {
  const raw = analysis?.model_version || analysis?.model;
  if (!raw) return cfg.model;
  return String(raw).replace(/^ollama:/, '');
}

function embeddingModelUsed(application, cfg = configuredModels()) {
  const cache = application?.embeddingCache || application?.embedding_cache;
  return cache?.model || cfg.embedding_model || null;
}

function documentAudit(docMeta) {
  return {
    analyzed: docMeta?.parsedLabels || [],
    failed: docMeta?.failedLabels || [],
    scanned: docMeta?.scannedLabels || [],
    truncated: Boolean(docMeta?.truncated),
  };
}

function summarizeMatches(application) {
  const items = application?.requirementMatches?.items
    || application?.requirement_matches?.items
    || [];
  return items.map((item) => ({
    requirement: item.requirement,
    status: item.status,
    priority: item.priority,
    category: item.category || null,
  }));
}

function scoreSnapshot(analysis, application) {
  const scoring = analysis?.score_breakdown
    || application?.scoreBreakdown
    || application?.score_breakdown
    || {};
  if (scoring.overall_score == null && analysis?.overall_score == null) return null;
  return {
    overall_score: scoring.overall_score ?? analysis?.overall_score ?? null,
    match_label: scoring.match_label || analysis?.match_label || null,
    skills_score: scoring.skills_score ?? null,
    experience_score: scoring.experience_score ?? null,
    education_score: scoring.education_score ?? null,
    certification_score: scoring.certification_score ?? null,
    project_score: scoring.project_score ?? null,
    job_specific_score: scoring.job_specific_score ?? null,
  };
}

function collectErrors({ errors = [], docMeta, application, cfg } = {}) {
  const list = [...errors];
  for (const label of docMeta?.failedLabels || []) {
    list.push(`${label} could not be read`);
  }
  const cache = application?.embeddingCache || application?.embedding_cache;
  if (cfg?.embedding_model && !cache?.model) {
    list.push('Embeddings were not generated');
  }
  return list;
}

function compactAudit(audit) {
  if (!audit) return null;
  return {
    model: audit.model,
    embedding_model: audit.embedding_model,
    analysis_version: audit.analysis_version,
    scoring_version: audit.scoring_version,
    timestamp: audit.timestamp,
    status: audit.status,
  };
}

function buildAudit({
  analysis,
  application,
  docMeta,
  status = 'completed',
  errors = [],
  analyzedAt,
  cache,
} = {}) {
  const cfg = configuredModels();
  const scoring = analysis?.score_breakdown
    || application?.scoreBreakdown
    || application?.score_breakdown
    || {};
  return {
    model: chatModel(analysis, cfg),
    embedding_model: embeddingModelUsed(application, cfg),
    analysis_version: ANALYSIS_VERSION,
    scoring_version: scoring.scoring_version || analysis?.scoring_version || SCORING_VERSION,
    timestamp: analyzedAt || new Date().toISOString(),
    status,
    documents: documentAudit(docMeta),
    matching: summarizeMatches(application),
    score_breakdown: scoreSnapshot(analysis, application),
    errors: collectErrors({ errors, docMeta, application, cfg }),
    fallback_model: cfg.fallback_model,
    degraded: Boolean(
      (errors && errors.length)
      || (docMeta?.failedLabels || []).length
      || status === 'failed',
    ),
    ...(cache && {
      input_hash: cache.input_hash,
      documents_hash: cache.documents_hash,
      job_hash: cache.job_hash,
      weights_hash: cache.weights_hash,
    }),
  };
}

module.exports = {
  ANALYSIS_VERSION,
  configuredModels,
  chatModel,
  buildAudit,
  compactAudit,
  documentAudit,
  summarizeMatches,
};
