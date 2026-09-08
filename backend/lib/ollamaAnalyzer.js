/**
 * Ollama-only candidate analysis — reads resumes and produces scores, rankings, and summaries.
 */

const OLLAMA_CHAT_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
  .replace(/\/v1\/?$/, '')
  .replace(/\/$/, '') + '/api/chat';

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma2:2b';
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'qwen2.5:0.5b';
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);

const ANALYSIS_SYSTEM = `You are a senior recruitment analyst. Evaluate how well a candidate fits a job using ONLY evidence from their application documents.

Rules:
- Never invent skills, degrees, or experience not supported by the text.
- Scores must reflect real evidence — missing documents or vague applications get lower scores.
- Use exact required skill names from the job when listing matched/partial/missing.
- Partial = related experience or synonym, not a direct match.
- overall_score (0-100) = holistic job fit weighted toward skills (45%), experience (30%), education (15%), certifications (10%).
- recommendation must align with overall_score: strong_yes (82+), yes (68-81), maybe (48-67), no (0-47).

Return ONLY valid JSON with this exact shape:
{
  "overall_score": 0,
  "skills_match": { "score": 0, "matched": [], "partial": [], "missing": [] },
  "experience_match": { "score": 0, "candidate_years": null, "required_years": 0, "details": "" },
  "education_match": { "score": 0, "meets_requirement": false, "details": "" },
  "certifications_match": { "score": 0, "matched": [], "missing": [] },
  "summary": "",
  "strengths": [],
  "weaknesses": [],
  "recommendation": "maybe"
}`;

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
}

function recommendationFromScore(score) {
  if (score >= 82) return 'strong_yes';
  if (score >= 68) return 'yes';
  if (score >= 48) return 'maybe';
  return 'no';
}

function parseJsonContent(text) {
  const raw = (text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Ollama did not return JSON');
  return JSON.parse(body.slice(start, end + 1));
}

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

  return `JOB POSTING
Title: ${job.title}
Location: ${job.location || 'Not specified'}
Type: ${job.employmentType || job.employment_type || 'full-time'}
Minimum experience (years): ${minExp}
Required education: ${reqEdu}
Required skills: ${JSON.stringify(reqSkills)}
Required certifications: ${JSON.stringify(reqCerts)}

Description:
${(job.description || '').slice(0, 3500)}

CANDIDATE
Name: ${application.applicantName || 'Unknown'}
${docsNote}${failedNote}

APPLICATION TEXT (resume, cover letter, certificates, transcript):
${(profileText || '').slice(0, 14000) || '(No readable application text — score conservatively and note missing evidence in weaknesses)'}

Analyze thoroughly and return the JSON assessment.`;
}

async function callOllama(model, systemPrompt, userPrompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_API_KEY) {
    headers['X-Ollama-Key'] = process.env.OLLAMA_API_KEY;
  }

  const res = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.1, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  return data.message?.content || '';
}

function normalizeAnalysis(parsed, job, docMeta, model) {
  const reqSkills = job.requiredSkills || job.required_skills || [];
  const reqCerts = job.requiredCertifications || job.required_certifications || [];
  const minExp = Number(job.minExperience ?? job.experience_years ?? 0) || 0;

  const skills = parsed.skills_match || {};
  const experience = parsed.experience_match || {};
  const education = parsed.education_match || {};
  const certs = parsed.certifications_match || {};

  const skills_match = {
    score: clamp(skills.score ?? 0),
    matched: Array.isArray(skills.matched) ? skills.matched : [],
    partial: Array.isArray(skills.partial) ? skills.partial : [],
    missing: Array.isArray(skills.missing)
      ? skills.missing
      : reqSkills.filter((s) => !skills.matched?.includes(s) && !skills.partial?.includes(s)),
  };

  const experience_match = {
    score: clamp(experience.score ?? 0),
    candidate_years: experience.candidate_years ?? null,
    required_years: experience.required_years ?? minExp,
    details: experience.details || 'Experience assessed from application text.',
  };

  const education_match = {
    score: clamp(education.score ?? 0),
    meets_requirement: !!education.meets_requirement,
    details: education.details || 'Education assessed from application text.',
  };

  const certifications_match = reqCerts.length
    ? {
      score: clamp(certs.score ?? 0),
      matched: Array.isArray(certs.matched) ? certs.matched : [],
      missing: Array.isArray(certs.missing) ? certs.missing : [],
    }
    : { score: null, matched: [], missing: [] };

  let overall_score = clamp(parsed.overall_score ?? parsed.overallScore ?? 0);
  if (!parsed.overall_score && !parsed.overallScore) {
    const parts = [
      { score: skills_match.score, weight: 0.45 },
      { score: experience_match.score, weight: 0.3 },
      { score: education_match.score, weight: 0.15 },
      certifications_match.score != null
        ? { score: certifications_match.score, weight: 0.1 }
        : null,
    ].filter(Boolean);
    const totalW = parts.reduce((s, p) => s + p.weight, 0);
    overall_score = totalW
      ? clamp(parts.reduce((s, p) => s + p.score * (p.weight / totalW), 0))
      : 30;
  }

  if (!docMeta?.parsedCount && !(parsed.summary || '').length) {
    overall_score = Math.min(overall_score, 40);
  }

  const summary = parsed.summary || parsed.ai_summary || '';
  const strengths = (Array.isArray(parsed.strengths) ? parsed.strengths : []).slice(0, 5);
  const weaknesses = (Array.isArray(parsed.weaknesses) ? parsed.weaknesses : []).slice(0, 6);
  const recommendation = ['strong_yes', 'yes', 'maybe', 'no'].includes(parsed.recommendation)
    ? parsed.recommendation
    : recommendationFromScore(overall_score);

  return {
    overall_score,
    skills_match,
    experience_match,
    education_match,
    certifications_match,
    ai_summary: summary,
    summary,
    strengths: strengths.length ? strengths : ['Review application manually for additional context'],
    weaknesses: weaknesses.length ? weaknesses : ['No major gaps identified from available text'],
    recommendation,
    model_version: `ollama:${model}`,
    data_quality: docMeta?.parsedCount ? 'good' : (profileQuality(docMeta)),
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
  const models = [DEFAULT_MODEL, FALLBACK_MODEL].filter((m, i, arr) => m && arr.indexOf(m) === i);
  const userPrompt = buildUserPrompt(job, application, profileText, docMeta);

  let lastError;
  for (const model of models) {
    try {
      const content = await callOllama(model, ANALYSIS_SYSTEM, userPrompt);
      const parsed = parseJsonContent(content);
      return normalizeAnalysis(parsed, job, docMeta, model);
    } catch (err) {
      lastError = err;
      console.error(`Ollama analysis failed (${model}):`, err.message);
    }
  }

  throw lastError || new Error('Ollama analysis failed — is Ollama running? Run: ollama serve');
}

async function checkOllamaHealth() {
  try {
    const base = OLLAMA_CHAT_URL.replace('/api/chat', '');
    const headers = {};
    if (process.env.OLLAMA_API_KEY) {
      headers['X-Ollama-Key'] = process.env.OLLAMA_API_KEY;
    }
    const res = await fetch(`${base}/api/tags`, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const installed = (data.models || []).map((m) => m.name);
    const primaryOk = installed.some((n) => n === DEFAULT_MODEL || n.startsWith(`${DEFAULT_MODEL}:`));
    const fallbackOk = !FALLBACK_MODEL || installed.some((n) => n === FALLBACK_MODEL || n.startsWith(`${FALLBACK_MODEL}:`));
    return {
      available: primaryOk || fallbackOk,
      provider: 'ollama',
      model: DEFAULT_MODEL,
      fallbackModel: FALLBACK_MODEL,
      installedModels: installed,
      mode: 'ollama-only',
    };
  } catch (err) {
    return { available: false, provider: 'ollama', error: err.message };
  }
}

function isOllamaConfigured() {
  return (process.env.LLM_PROVIDER || 'ollama').toLowerCase() === 'ollama';
}

module.exports = {
  analyzeWithOllama,
  checkOllamaHealth,
  isOllamaConfigured,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
};
