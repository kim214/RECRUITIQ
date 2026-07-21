/**
 * LLM layer for hybrid analysis — semantic review + professional narrative.
 */
function recommendationFromScore(score) {
  if (score >= 82) return 'strong_yes';
  if (score >= 68) return 'yes';
  if (score >= 48) return 'maybe';
  return 'no';
}

const HYBRID_SYSTEM = `You are a senior recruitment analyst. You receive PRE-COMPUTED EVIDENCE from parsed resumes and job requirements.

YOUR TASKS:
1. Review the application text for required skills marked "missing" or "partial" — if clearly present under different wording, add them to skill_adjustments with a short quote from the text.
2. Do NOT invent qualifications not supported by the application text.
3. Do NOT contradict the evidence scores for experience/education unless the text clearly proves the evidence is wrong — if so, explain in weaknesses only.
4. Write a specific, professional summary (3-5 sentences) citing concrete facts from documents.
5. List 3-5 evidence-based strengths and 3-5 gaps/weaknesses.
6. Give hiring recommendation aligned with the evidence overall score.

Return ONLY valid JSON:
{
  "skill_adjustments": {
    "add_to_matched": [{"skill": "exact required skill name", "quote": "exact phrase from application"}],
    "add_to_partial": [{"skill": "skill name", "quote": "phrase"}]
  },
  "summary": "detailed paragraph",
  "strengths": ["specific strength with evidence"],
  "weaknesses": ["specific gap with evidence"],
  "recommendation": "strong_yes|yes|maybe|no"
}`;

function buildEvidenceBlock(job, applicantName, evidence) {
  const sm = evidence.skills_match || {};
  const em = evidence.experience_match || {};
  const ed = evidence.education_match || {};
  return `EVIDENCE REPORT (from document parsing — treat as ground truth for scoring):
Candidate: ${applicantName || 'Unknown'}
Overall score (computed): ${evidence.overall_score}%
Data quality: ${evidence.data_quality || 'unknown'}
Documents parsed: ${(evidence.documents_reviewed || []).join(', ') || 'none'}
Documents failed: ${(evidence.documents_failed || []).join(', ') || 'none'}

Skills (${sm.score ?? 0}%):
- Matched: ${(sm.matched || []).join(', ') || 'none'}
- Partial: ${(sm.partial || []).join(', ') || 'none'}
- Missing: ${(sm.missing || []).join(', ') || 'none'}

Experience (${em.score ?? 0}%): ${em.details || 'N/A'}
Education (${ed.score ?? 0}%): ${ed.details || 'N/A'}
Meets education requirement: ${ed.meets_requirement ? 'yes' : 'no'}`;
}

function buildUserPrompt(job, applicantName, profileText, evidence) {
  const reqSkills = job.requiredSkills || job.required_skills || [];
  return `${buildEvidenceBlock(job, applicantName, evidence)}

JOB POSTING:
Title: ${job.title}
Location: ${job.location || 'Not specified'}
Type: ${job.employmentType || job.employment_type || 'full-time'}
Description:
${(job.description || '').slice(0, 4000)}

Required skills (exact names for adjustments): ${JSON.stringify(reqSkills)}
Required education: ${job.requiredEducation || job.required_education || 'None'}
Minimum experience (years): ${job.minExperience ?? job.experience_years ?? 0}
Required certifications: ${JSON.stringify(job.requiredCertifications || job.required_certifications || [])}

FULL APPLICATION TEXT (resume, cover letter, transcript, certificates):
${(profileText || '').slice(0, 16000) || '(No readable text extracted)'}

Review carefully. Only add skills to skill_adjustments if the required skill is clearly demonstrated in the text above.`;
}

function resolveProvider() {
  const forced = (process.env.LLM_PROVIDER || 'auto').toLowerCase();
  const providers = {
    groq: {
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    },
    openai: {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    gemini: {
      name: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },
    ollama: {
      name: 'ollama',
      apiKey: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
      model: process.env.OLLAMA_MODEL || 'llama3.2',
    },
  };

  if (forced !== 'auto' && providers[forced]) {
    const p = providers[forced];
    if (p.name === 'ollama' || (p.apiKey && !String(p.apiKey).startsWith('sk-your'))) return p;
    return null;
  }

  for (const key of ['groq', 'openai', 'gemini']) {
    const p = providers[key];
    if (p.apiKey && !String(p.apiKey).startsWith('sk-your') && p.apiKey !== 'paste') return p;
  }
  if (forced === 'ollama' || process.env.LLM_PROVIDER === 'ollama') return providers.ollama;
  return null;
}

function isLlmAvailable() {
  return !!resolveProvider();
}

function parseJsonContent(text) {
  const raw = (text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('LLM did not return JSON');
  return JSON.parse(body.slice(start, end + 1));
}

async function callOpenAiCompatible(provider, systemPrompt, userPrompt) {
  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
  };

  if (provider.name !== 'groq' || provider.model.includes('llama')) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider.name} error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(provider, systemPrompt, userPrompt) {
  const model = provider.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function normalizeLlmResult(parsed, provider) {
  return {
    skill_adjustments: parsed.skill_adjustments || { add_to_matched: [], add_to_partial: [] },
    summary: parsed.summary || parsed.ai_summary || '',
    ai_summary: parsed.summary || parsed.ai_summary || '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
    recommendation: parsed.recommendation || 'maybe',
    model_version: `${provider.name}:${provider.model}`,
  };
}

async function analyzeWithLlm(job, application, profileText, docMeta, evidenceAnalysis) {
  const provider = resolveProvider();
  if (!provider) return null;

  const userPrompt = buildUserPrompt(
    job,
    application.applicantName,
    profileText,
    evidenceAnalysis || { overall_score: 0, skills_match: {}, experience_match: {}, education_match: {} },
  );

  try {
    let content;
    if (provider.name === 'gemini') {
      content = await callGemini(provider, HYBRID_SYSTEM, userPrompt);
    } else {
      content = await callOpenAiCompatible(provider, HYBRID_SYSTEM, userPrompt);
    }

    const parsed = parseJsonContent(content);
    const result = normalizeLlmResult(parsed, provider);
    result.documents_reviewed = docMeta?.parsedLabels || evidenceAnalysis?.documents_reviewed || [];
    result.documents_failed = docMeta?.failedLabels || evidenceAnalysis?.documents_failed || [];

    if (!result.summary && evidenceAnalysis?.ai_summary) {
      result.summary = evidenceAnalysis.ai_summary;
    }
    if (!result.recommendation && evidenceAnalysis?.overall_score != null) {
      result.recommendation = recommendationFromScore(evidenceAnalysis.overall_score);
    }

    return result;
  } catch (err) {
    console.error('LLM analysis failed:', err.message);
    return null;
  }
}

function getActiveProviderInfo() {
  const p = resolveProvider();
  if (!p) return { available: false };
  return { available: true, provider: p.name, model: p.model, mode: 'hybrid' };
}

module.exports = {
  isLlmAvailable,
  analyzeWithLlm,
  getActiveProviderInfo,
};
