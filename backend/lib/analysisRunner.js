/**
 * Full candidate analysis pipeline with step callbacks.
 * Used by the background analysis queue — does not talk to the browser.
 */

const { prepareApplicationContext } = require('./candidateAnalyzer');
const { analyzeWithOllama, isOllamaConfigured } = require('./ollamaAnalyzer');
const { ensureJobRequirementProfile } = require('./jobRequirementAnalyzer');
const { ensureCandidateProfile } = require('./candidateProfileExtractor');
const { ensureSupportingDocuments } = require('./supportingDocumentAnalyzer');
const { ensureEvidence } = require('./evidenceBuilder');
const { ensureJobEmbeddings, ensureCandidateEmbeddings, compareEmbeddings } = require('./embeddingService');
const { ensureRequirementMatches } = require('./requirementMatcher');
const { ensureScoreBreakdown, applyScoreToAnalysis, computeScore } = require('./scoringEngine');
const { buildAudit, compactAudit } = require('./analysisAudit');
const { cacheKeys } = require('./analysisCache');
const {
  classifyError,
  applyPartialDocumentNotes,
  fallbackNarrative,
  narrativeFromMatches,
  isFastAnalysis,
  skipNarrativeLlm,
  emptyDocumentContext,
} = require('./analysisFailures');

async function safeStep(warnings, label, work) {
  try {
    return await work();
  } catch (err) {
    const classified = classifyError(err);
    warnings.push(`${label}: ${classified.message}`);
    console.error(`[analysis] ${label}:`, err.message);
    return null;
  }
}

async function runAnalysisJob({ db, job, application, origin, onStep = async () => {} }) {
  const warnings = [];

  await onStep('PROCESSING_DOCUMENTS');
  let context = await safeStep(warnings, 'Document processing', () => (
    prepareApplicationContext(application, { apiOrigin: origin })
  ));
  if (!context) context = emptyDocumentContext(application);
  const profileText = context.llmText || context.combinedText || application.coverLetter || application.cover_letter || '';

  await onStep('EXTRACTING_INFORMATION', { detail: 'Extracting candidate and job profiles' });
  // Job + candidate LLM calls hit different tables. Do not parallelize two
  // updates of the same application row — last write would drop fields.
  const [profileResult, jobProfileResult] = await Promise.all([
    safeStep(warnings, 'Candidate extraction', () => (
      ensureCandidateProfile(db, application, { text: profileText })
    )),
    safeStep(warnings, 'Job requirements', () => ensureJobRequirementProfile(db, job)),
  ]);
  let appWithProfile = profileResult || application;
  const jobWithProfile = jobProfileResult || job;

  if (!isFastAnalysis()) {
    await onStep('EXTRACTING_INFORMATION', { detail: 'Reading certificates and transcripts' });
    appWithProfile = await safeStep(warnings, 'Supporting documents', () => (
      ensureSupportingDocuments(db, appWithProfile, {
        job: jobWithProfile,
        sections: context.sections,
        sources: context.documentSources,
      })
    )) || appWithProfile;
  }

  appWithProfile = await safeStep(warnings, 'Evidence', () => (
    ensureEvidence(db, appWithProfile, {
      job: jobWithProfile,
      sections: context.sections,
    })
  )) || appWithProfile;

  await onStep('ANALYZING_REQUIREMENTS');
  const [jobEmbeddedResult, candidateEmbeddedResult] = await Promise.all([
    safeStep(warnings, 'Job embeddings', () => ensureJobEmbeddings(db, jobWithProfile)),
    safeStep(warnings, 'Candidate embeddings', () => ensureCandidateEmbeddings(db, appWithProfile)),
  ]);
  const jobEmbedded = jobEmbeddedResult || jobWithProfile;
  appWithProfile = candidateEmbeddedResult || appWithProfile;

  await onStep('MATCHING_CANDIDATE');
  appWithProfile = await safeStep(warnings, 'Requirement matching', () => (
    ensureRequirementMatches(db, appWithProfile, {
      job: jobEmbedded,
      sections: context.sections,
      docMeta: context.documentMeta,
    })
  )) || appWithProfile;

  await onStep('CALCULATING_SCORE');
  appWithProfile = await safeStep(warnings, 'Scoring', () => (
    ensureScoreBreakdown(db, appWithProfile, { job: jobEmbedded })
  )) || appWithProfile;
  const breakdown = appWithProfile.scoreBreakdown || appWithProfile.score_breakdown || computeScore(jobEmbedded, appWithProfile);

  let narrative = narrativeFromMatches(appWithProfile, breakdown, context.documentMeta);
  if (!skipNarrativeLlm() && isOllamaConfigured()) {
    await onStep('MATCHING_CANDIDATE', { detail: 'Writing recruiter summary' });
    try {
      narrative = await analyzeWithOllama(jobEmbedded, appWithProfile, profileText, context.documentMeta);
    } catch (err) {
      const classified = classifyError(err);
      warnings.push(`AI reasoning: ${classified.message}`);
      console.error('[analysis] AI reasoning:', err.message);
      narrative = narrativeFromMatches(appWithProfile, breakdown, context.documentMeta);
    }
  } else if (!isOllamaConfigured() && !skipNarrativeLlm()) {
    warnings.push('Ollama is not configured.');
    narrative = fallbackNarrative(context.documentMeta, {
      code: 'ollama_unavailable',
      message: 'Ollama is not configured.',
    });
  }

  let analysis = applyScoreToAnalysis(narrative, breakdown);
  analysis = applyPartialDocumentNotes(analysis, context.documentMeta);
  const semantic = compareEmbeddings(
    jobEmbedded.embeddingCache || jobEmbedded.embedding_cache,
    appWithProfile.embeddingCache || appWithProfile.embedding_cache,
  );
  if (semantic) analysis.semantic_match = semantic;
  else if (warnings.some((w) => /embedding/i.test(w))) {
    analysis.semantic_match = null;
  }

  const analyzedAt = new Date().toISOString();
  const audit = buildAudit({
    analysis,
    application: appWithProfile,
    docMeta: context.documentMeta,
    status: 'completed',
    errors: warnings,
    analyzedAt,
    cache: cacheKeys(jobEmbedded, appWithProfile),
  });
  analysis.analysis_audit = audit;
  analysis.analysis_version = audit.analysis_version;
  analysis.scoring_version = audit.scoring_version;
  analysis.embedding_model = audit.embedding_model;
  analysis.analyzed_at = analyzedAt;

  const saved = await db.saveAnalysis({
    application_id: application.id,
    job_id: application.jobId || application.job_id || job.id,
    ...analysis,
    ai_summary: analysis.ai_summary || analysis.summary,
  });

  await onStep('COMPLETED', { audit: compactAudit(audit) });
  return { analysis, application: appWithProfile, saved, context, job: jobEmbedded, audit, warnings };
}

async function runRescoreJob({ db, job, application, onStep = async () => {} }) {
  await onStep('CALCULATING_SCORE');
  let appWithProfile = await ensureRequirementMatches(db, application, { job });
  appWithProfile = await ensureScoreBreakdown(db, appWithProfile, { job, force: true });
  const breakdown = appWithProfile.scoreBreakdown || appWithProfile.score_breakdown || computeScore(job, appWithProfile);
  const previous = application.analysis || {};
  let analysis = applyScoreToAnalysis({
    summary: previous.summary || application.aiSummary,
    ai_summary: previous.summary || application.aiSummary,
    strengths: previous.strengths || [],
    weaknesses: previous.weaknesses || [],
    recommendation: previous.recommendation,
    model_version: previous.modelVersion,
    documents_reviewed: previous.documentsReviewed || [],
    documents_failed: previous.documentsFailed || [],
    semantic_match: previous.semanticMatch || null,
  }, breakdown);
  const analyzedAt = new Date().toISOString();
  const audit = buildAudit({
    analysis,
    application: appWithProfile,
    status: 'completed',
    errors: [],
    analyzedAt,
    cache: cacheKeys(job, appWithProfile),
  });
  analysis.analysis_audit = audit;
  analysis.analysis_version = audit.analysis_version;
  analysis.scoring_version = audit.scoring_version;
  analysis.embedding_model = audit.embedding_model;
  analysis.analyzed_at = analyzedAt;
  const saved = await db.saveAnalysis({
    application_id: application.id,
    job_id: application.jobId || application.job_id || job.id,
    ...analysis,
    ai_summary: analysis.ai_summary || analysis.summary,
  });
  await onStep('COMPLETED', { cached: true, audit: compactAudit(audit) });
  return { analysis, application: appWithProfile, saved, audit, warnings: [], cached: 'scoring' };
}

module.exports = { runAnalysisJob, runRescoreJob };
