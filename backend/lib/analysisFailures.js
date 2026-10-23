/**
 * Recruiter-facing failure classification for the analysis pipeline.
 * Partial document failures must not abort scoring.
 */

function classifyError(err) {
  const message = String(err?.message || err || 'Unknown error');
  const name = err?.name || '';
  if (name === 'TimeoutError' || name === 'AbortError' || /timed out|timeout/i.test(message)) {
    return { code: 'timeout', message: 'The request timed out.' };
  }
  if (/unreachable|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(message)) {
    return { code: 'ollama_unavailable', message: 'Ollama is unavailable.' };
  }
  if (/not valid JSON|did not return JSON/i.test(message)) {
    return { code: 'invalid_json', message: 'The AI response was not valid JSON.' };
  }
  if (/model.*not found|not installed|Ollama error \(404\)/i.test(message)) {
    return { code: 'model_unavailable', message: 'The configured AI model is not available.' };
  }
  if (/OCR/i.test(message)) {
    return { code: 'ocr_failure', message: 'OCR could not read a scanned document.' };
  }
  if (/corrupt|malformed|invalid pdf/i.test(message)) {
    return { code: 'corrupt_document', message: 'A document could not be read because it is corrupted.' };
  }
  if (/Database is missing|supabase/i.test(message)) {
    return { code: 'database_failure', message: 'A database update failed.' };
  }
  if (/PDF|pdf-parse|no readable text/i.test(message)) {
    return { code: 'pdf_failure', message: 'A PDF could not be read.' };
  }
  return { code: 'unknown', message };
}

function failedDocumentLabels(docMeta) {
  return [...new Set(docMeta?.failedLabels || [])];
}

function partialDocumentNotes(docMeta) {
  const failed = failedDocumentLabels(docMeta);
  if (!failed.length) return [];
  const notes = failed.map((label) => `${label} could not be analyzed.`);
  if (docMeta?.parsedCount > 0 || (docMeta?.parsedLabels || []).length) {
    notes.push('Analysis is based on available documents.');
  }
  return notes;
}

function applyPartialDocumentNotes(analysis, docMeta) {
  const notes = partialDocumentNotes(docMeta);
  if (!notes.length) return analysis || {};
  const weaknesses = [...(analysis?.weaknesses || [])];
  for (const note of notes) {
    if (!weaknesses.some((item) => String(item).includes(note))) weaknesses.push(note);
  }
  let summary = analysis?.summary || analysis?.ai_summary || '';
  const basedOn = 'Analysis is based on available documents.';
  if (notes.includes(basedOn) && !summary.includes(basedOn)) {
    summary = [summary, basedOn].filter(Boolean).join(' ').trim();
  }
  return {
    ...(analysis || {}),
    weaknesses,
    summary,
    ai_summary: summary,
    documents_reviewed: analysis?.documents_reviewed || docMeta?.parsedLabels || [],
    documents_failed: analysis?.documents_failed || failedDocumentLabels(docMeta),
    partial_documents: true,
  };
}

function fallbackNarrative(docMeta, classified) {
  const notes = partialDocumentNotes(docMeta);
  const reason = classified?.message || 'AI reasoning was unavailable.';
  const weaknesses = [...notes];
  if (!weaknesses.some((item) => item.includes('AI reasoning'))) {
    weaknesses.push(`AI reasoning skipped: ${reason}`);
  }
  const summary = notes.includes('Analysis is based on available documents.')
    ? 'Analysis is based on available documents.'
    : 'Score is based on requirement matching of available documents.';
  return {
    overall_score: null,
    skills_match: { score: 0, matched: [], partial: [], missing: [] },
    experience_match: { score: 0, candidate_years: null, required_years: 0, details: '' },
    education_match: { score: 0, meets_requirement: false, details: '' },
    certifications_match: { score: null, matched: [], missing: [] },
    ai_summary: summary,
    summary,
    strengths: [],
    weaknesses,
    recommendation: 'maybe',
    model_version: 'ollama:unavailable',
    data_quality: docMeta?.parsedCount ? 'low' : 'none',
    documents_reviewed: docMeta?.parsedLabels || [],
    documents_failed: failedDocumentLabels(docMeta),
    narrative_degraded: true,
  };
}

function matchItemsOf(application) {
  return application?.requirementMatches?.items
    || application?.requirement_matches?.items
    || [];
}

function narrativeFromMatches(application, breakdown, docMeta) {
  const items = matchItemsOf(application);
  const matched = items.filter((item) => item.status === 'MATCH').map((item) => item.requirement).filter(Boolean);
  const partial = items.filter((item) => item.status === 'PARTIAL_MATCH').map((item) => item.requirement).filter(Boolean);
  const missing = items
    .filter((item) => item.status === 'NOT_FOUND' || item.status === 'UNCLEAR')
    .map((item) => item.requirement)
    .filter(Boolean);
  const score = Math.round(Number(breakdown?.overall_score ?? application?.aiScore ?? 0));
  const label = breakdown?.match_label || 'Match';
  const summary = `Match score ${score}/100 (${label}) from requirement matching of uploaded documents. ${matched.length} item(s) matched${missing.length ? `; ${missing.length} not found in the files` : ''}.`;
  return {
    overall_score: null,
    skills_match: { score: 0, matched, partial, missing },
    experience_match: { score: 0, candidate_years: null, required_years: 0, details: '' },
    education_match: { score: 0, meets_requirement: false, details: '' },
    certifications_match: { score: null, matched: [], missing: [] },
    ai_summary: summary,
    summary,
    strengths: matched.slice(0, 5).map((req) => `Documented: ${req}`),
    weaknesses: [
      ...partial.slice(0, 3).map((req) => `Partial evidence: ${req}`),
      ...missing.slice(0, 5).map((req) => `Not found: ${req}`),
      ...partialDocumentNotes(docMeta),
    ].slice(0, 8),
    recommendation: 'maybe',
    model_version: 'matcher',
    data_quality: docMeta?.parsedCount ? 'good' : 'low',
    documents_reviewed: docMeta?.parsedLabels || [],
    documents_failed: failedDocumentLabels(docMeta),
    narrative_degraded: false,
  };
}

function isFastAnalysis() {
  const raw = String(process.env.ANALYSIS_FAST || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function skipNarrativeLlm() {
  return isFastAnalysis();
}

function emptyDocumentContext(application) {
  const cover = application?.coverLetter || application?.cover_letter || '';
  return {
    combinedText: cover,
    llmText: cover,
    chunks: [],
    sections: cover ? [{ label: 'Cover Letter', text: cover, llmText: cover, chunks: [] }] : [],
    documentSources: [],
    documentMeta: {
      parsedCount: 0,
      failedCount: 0,
      parsedLabels: [],
      failedLabels: [],
      scannedLabels: [],
      truncated: false,
    },
  };
}

module.exports = {
  classifyError,
  partialDocumentNotes,
  applyPartialDocumentNotes,
  fallbackNarrative,
  narrativeFromMatches,
  isFastAnalysis,
  skipNarrativeLlm,
  emptyDocumentContext,
  failedDocumentLabels,
};
