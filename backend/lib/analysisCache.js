/**
 * Skip unchanged analysis work.
 * Re-run only for new documents, job requirement changes, scoring config, or pipeline version.
 */

const crypto = require('crypto');
const { ANALYSIS_VERSION } = require('./analysisAudit');
const { SCORING_VERSION, resolveWeights } = require('./scoringEngine');
const { jobFingerprint } = require('./jobRequirementAnalyzer');

function documentsFingerprint(application) {
  const certs = application?.certificatesUrl || application?.certificates_url || [];
  const payload = [
    application?.resumeUrl || application?.resume_url || '',
    application?.transcriptUrl || application?.transcript_url || '',
    ...(Array.isArray(certs) ? certs : [certs]),
    application?.coverLetter || application?.cover_letter || '',
  ].map((v) => String(v || ''));
  return crypto.createHash('sha256').update(payload.join('\n')).digest('hex').slice(0, 32);
}

function cacheKeys(job, application) {
  const documents_hash = documentsFingerprint(application);
  const job_hash = jobFingerprint(job || {});
  const weights_hash = crypto.createHash('sha256')
    .update(JSON.stringify(resolveWeights(job || {})))
    .digest('hex')
    .slice(0, 24);
  const input_hash = crypto.createHash('sha256')
    .update([documents_hash, job_hash, weights_hash, ANALYSIS_VERSION, SCORING_VERSION].join('|'))
    .digest('hex')
    .slice(0, 32);
  return {
    documents_hash,
    job_hash,
    weights_hash,
    input_hash,
    analysis_version: ANALYSIS_VERSION,
    scoring_version: SCORING_VERSION,
  };
}

function storedCache(application) {
  return application?.analysis?.audit
    || application?.analysis_audit
    || application?.analysisStatus?.audit
    || application?.analysis_status?.audit
    || {};
}

function hasCompletedScore(application) {
  const status = application?.analysisStatus || application?.analysis_status;
  if (status?.state === 'failed') return false;
  const score = application?.scoreBreakdown?.overall_score
    ?? application?.score_breakdown?.overall_score
    ?? application?.aiScore
    ?? application?.analysis?.overallScore;
  return score != null;
}

function staleReason(application, job) {
  if (!application || !job) return 'missing';
  if (!hasCompletedScore(application)) return 'missing';
  const stored = storedCache(application);
  if (!stored.input_hash && !stored.documents_hash) return 'missing';
  const next = cacheKeys(job, application);
  if (stored.documents_hash && stored.documents_hash !== next.documents_hash) return 'documents';
  if (stored.job_hash && stored.job_hash !== next.job_hash) return 'job';
  if (stored.analysis_version && stored.analysis_version !== next.analysis_version) return 'analysis_version';
  if (
    (stored.weights_hash && stored.weights_hash !== next.weights_hash)
    || (stored.scoring_version && stored.scoring_version !== next.scoring_version)
  ) {
    return 'scoring';
  }
  if (stored.input_hash && stored.input_hash !== next.input_hash) return 'missing';
  return null;
}

function hasFreshAnalysis(application, job) {
  return staleReason(application, job) == null;
}

module.exports = {
  documentsFingerprint,
  cacheKeys,
  storedCache,
  hasCompletedScore,
  staleReason,
  hasFreshAnalysis,
};
