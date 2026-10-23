/**
 * Candidate analysis prompts + narrative. Final scores come from scoringEngine.
 * Transport lives in lib/ai (Ollama provider).
 */

const aiService = require('./ai/aiService');
const { formatProfileForPrompt } = require('./jobRequirementAnalyzer');
const { formatCandidateProfileForPrompt } = require('./candidateProfileExtractor');
const { formatSupportingForPrompt } = require('./supportingDocumentAnalyzer');
const { formatEvidenceForPrompt } = require('./evidenceBuilder');
const { formatMatchesForPrompt } = require('./requirementMatcher');

const ANALYSIS_SYSTEM = `You are a senior recruitment analyst. Evaluate how well a candidate fits a job using ONLY evidence from their application documents.

Rules:
- Never invent skills, degrees, or experience not supported by the text.
- Strengths and weaknesses must cite real evidence. Missing documents or vague applications belong in weaknesses.
- Do NOT invent a final overall score. The backend calculates overall_score from requirement matches and job weights.
- recommendation is narrative only; the backend may replace it from the calculated score.

Return ONLY valid JSON with this exact shape:
{
  "summary": "",
  "strengths": [],
  "weaknesses": [],
  "recommendation": "maybe"
}`;

function buildUserPrompt(job, application, profileText, docMeta) {
  const reqSkills = job.requiredSkills || job.required_skills || [];
  const reqCerts = job.requiredCertifications || job.required_certifications || [];
  const minExp = job.minExperience ?? job.experience_years ?? 0;
  const reqEdu = job.requiredEducation || job.required_education || 'None specified';

  const docsNote = docMeta?.parsedLabels?.length
    ? `Documents parsed: ${docMeta.parsedLabels.join(', ')}`
    : 'No documents could be parsed — rely on cover letter if present';
  const failedNote = docMeta?.failedLabels?.length
    ? `\nDocuments failed to read: ${docMeta.failedLabels.join(', ')}`
    : '';
  const scannedNote = docMeta?.scannedLabels?.length
    ? `\nScanned/image documents with no extractable text: ${docMeta.scannedLabels.join(', ')}`
    : '';
  const truncatedNote = docMeta?.truncated
    ? '\nLong documents were truncated before analysis.'
    : '';

  return `JOB POSTING
Title: ${job.title}
Location: ${job.location || 'Not specified'}
Type: ${job.employmentType || job.employment_type || 'full-time'}
Minimum experience (years): ${minExp}
Required education: ${reqEdu}
Required skills: ${JSON.stringify(reqSkills)}
Required certifications: ${JSON.stringify(reqCerts)}
${formatProfileForPrompt(job)}
Description:
${(job.description || '').slice(0, 3500)}

CANDIDATE
Applicant ID: ${application.applicantCode || application.applicant_code || 'Unknown'}
Do not include or invent a personal name, email, phone, or home address in the summary.
${formatCandidateProfileForPrompt(application)}
${formatSupportingForPrompt(application)}
${formatEvidenceForPrompt(application)}
${formatMatchesForPrompt(application)}
${docsNote}${failedNote}${scannedNote}${truncatedNote}

APPLICATION TEXT (resume, cover letter, certificates, transcript):
${(profileText || '').slice(0, 12000) || '(No readable application text — score conservatively and note missing evidence in weaknesses)'}

Analyze thoroughly and return the JSON assessment.`;
}

function normalizeAnalysis(parsed, job, docMeta, model) {
  const summary = parsed.summary || parsed.ai_summary || '';
  const strengths = (Array.isArray(parsed.strengths) ? parsed.strengths : []).slice(0, 5);
  const weaknesses = (Array.isArray(parsed.weaknesses) ? parsed.weaknesses : []).slice(0, 6);

  return {
    overall_score: null,
    skills_match: { score: 0, matched: [], partial: [], missing: [] },
    experience_match: { score: 0, candidate_years: null, required_years: job.minExperience ?? job.experience_years ?? 0, details: '' },
    education_match: { score: 0, meets_requirement: false, details: '' },
    certifications_match: { score: null, matched: [], missing: [] },
    ai_summary: summary,
    summary,
    strengths: strengths.length ? strengths : ['Review application manually for additional context'],
    weaknesses: weaknesses.length ? weaknesses : ['No major gaps identified from available text'],
    recommendation: ['strong_yes', 'yes', 'maybe', 'no'].includes(parsed.recommendation)
      ? parsed.recommendation
      : 'maybe',
    model_version: `ollama:${model}`,
    data_quality: docMeta?.parsedCount ? 'good' : profileQuality(docMeta),
    documents_reviewed: docMeta?.parsedLabels || [],
    documents_failed: docMeta?.failedLabels || [],
  };
}

function profileQuality(docMeta) {
  if (!docMeta) return 'low';
  if (docMeta.parsedCount > 0) return 'good';
  if (docMeta.failedCount > 0) return 'low';
  return 'none';
}

async function analyzeWithOllama(job, application, profileText, docMeta) {
  const userPrompt = buildUserPrompt(job, application, profileText, docMeta);
  const { parsed, model } = await aiService.structuredOutput({
    system: ANALYSIS_SYSTEM,
    prompt: userPrompt,
    temperature: 0.1,
    maxTokens: 2048,
  });
  return normalizeAnalysis(parsed, job, docMeta, model);
}

async function checkOllamaHealth() {
  return aiService.healthCheck();
}

function isOllamaConfigured() {
  return aiService.isConfigured();
}

module.exports = {
  analyzeWithOllama,
  checkOllamaHealth,
  isOllamaConfigured,
  get DEFAULT_MODEL() {
    return aiService.getConfig().model;
  },
  get FALLBACK_MODEL() {
    return aiService.getConfig().fallbackModel;
  },
};
