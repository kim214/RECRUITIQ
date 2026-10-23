/**
 * Persisted analysis pipeline steps.
 * No Redis — status lives on applications.analysis_status.
 */

const STEPS = [
  'QUEUED',
  'PROCESSING_DOCUMENTS',
  'EXTRACTING_INFORMATION',
  'ANALYZING_REQUIREMENTS',
  'MATCHING_CANDIDATE',
  'CALCULATING_SCORE',
  'COMPLETED',
];

const LABELS = {
  QUEUED: 'Queued',
  PROCESSING_DOCUMENTS: 'Processing documents',
  EXTRACTING_INFORMATION: 'Extracting information',
  ANALYZING_REQUIREMENTS: 'Analyzing requirements',
  MATCHING_CANDIDATE: 'Matching candidate',
  CALCULATING_SCORE: 'Calculating score',
  COMPLETED: 'Completed',
};

function stepLabel(step) {
  return LABELS[step] || String(step || 'Queued');
}

function buildStatus(step, extra = {}) {
  const normalized = STEPS.includes(step) ? step : 'QUEUED';
  const failed = extra.state === 'failed';
  return {
    state: failed ? 'failed' : (normalized === 'COMPLETED' ? 'completed' : normalized === 'QUEUED' ? 'queued' : 'processing'),
    step: failed ? (extra.step || normalized) : normalized,
    label: failed ? (extra.label || 'Failed') : stepLabel(normalized),
    detail: extra.detail || null,
    error: extra.error || null,
    origin: extra.origin || null,
    batch_id: extra.batch_id || extra.batchId || null,
    audit: extra.audit || null,
    cached: Boolean(extra.cached),
    updated_at: extra.updated_at || new Date().toISOString(),
  };
}

function isTerminal(status) {
  const state = status?.state;
  const step = status?.step;
  return state === 'completed' || state === 'failed' || step === 'COMPLETED';
}

function isActive(status) {
  return status?.state === 'queued' || status?.state === 'processing';
}

module.exports = {
  STEPS,
  LABELS,
  stepLabel,
  buildStatus,
  isTerminal,
  isActive,
};
