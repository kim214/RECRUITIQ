/**
 * LLM-powered candidate analysis (OpenAI, Groq, Gemini, Ollama).
 * Works on Vercel — no Python service required when an API key is set.
 */

const MATCHER_SYSTEM = `You are an expert recruitment analyst. Score candidates ONLY from evidence in their profile text and parsed documents.
Rules:
- Never invent skills, degrees, or years of experience not present in the text.
- If information is missing, score that dimension low and explain what is missing.
- skills score = (matched required skills / total required) * 100, with partial credit for related skills.
- overall_score = weighted average: skills 45%, experience 30%, education 15%, certifications 10%.
- Be conservative when data is sparse.
Return valid JSON only:
{
  "overall_score": number,
  "skills_match": { "score": number, "matched": [], "missing": [], "partial": [] },
  "education_match": { "score": number, "meets_requirement": boolean, "details": string },
  "experience_match": { "score": number, "candidate_years": number|null, "required_years": number, "details": string },
  "strengths": [],
  "weaknesses": [],
  "recommendation": "strong_yes"|"yes"|"maybe"|"no",
  "summary": string
}`;

function buildUserPrompt(job, applicantName, profileText) {
  return `Job Requirements:
Title: ${job.title}
Description: ${(job.description || '').slice(0, 2000)}
Required skills: ${JSON.stringify(job.requiredSkills || job.required_skills || [])}
Required education: ${job.requiredEducation || job.required_education || 'None specified'}
Experience years required: ${job.minExperience ?? job.experience_years ?? 0}
Required certifications: ${JSON.stringify(job.requiredCertifications || job.required_certifications || [])}

Candidate: ${applicantName || 'Unknown'}

Application text (cover letter + parsed documents — use ONLY facts from here):
${(profileText || '').slice(0, 12000) || '(No text available)'}`;
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
    if (p.name === 'ollama' || (p.apiKey && !p.apiKey.startsWith('sk-your'))) return p;
    return null;
  }

  const order = ['groq', 'openai', 'gemini'];
  for (const key of order) {
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
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider.name} error (${res.status}): ${err.slice(0, 200)}`);
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
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function normalizeAnalysis(parsed, providerName, docMeta) {
  const summary = parsed.summary || parsed.ai_summary || '';
  return {
    overall_score: Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score) || 0))),
    skills_match: parsed.skills_match || { score: 0, matched: [], missing: [], partial: [] },
    education_match: parsed.education_match || { score: 0, meets_requirement: false, details: '' },
    experience_match: parsed.experience_match || { score: 0, candidate_years: null, required_years: 0, details: '' },
    strengths: parsed.strengths || [],
    weaknesses: parsed.weaknesses || [],
    recommendation: parsed.recommendation || 'maybe',
    ai_summary: summary,
    summary,
    model_version: `${providerName}:${resolveProvider()?.model || 'unknown'}`,
    documents_reviewed: docMeta?.parsedLabels || [],
    documents_failed: docMeta?.failedLabels || [],
  };
}

async function analyzeWithLlm(job, application, profileText, docMeta) {
  const provider = resolveProvider();
  if (!provider) return null;

  const userPrompt = buildUserPrompt(job, application.applicantName, profileText);

  try {
    let content;
    if (provider.name === 'gemini') {
      content = await callGemini(provider, MATCHER_SYSTEM, userPrompt);
    } else {
      content = await callOpenAiCompatible(provider, MATCHER_SYSTEM, userPrompt);
    }

    const parsed = parseJsonContent(content);
    return normalizeAnalysis(parsed, provider.name, docMeta);
  } catch (err) {
    console.error('LLM analysis failed:', err.message);
    return null;
  }
}

function getActiveProviderInfo() {
  const p = resolveProvider();
  if (!p) return { available: false };
  return { available: true, provider: p.name, model: p.model };
}

module.exports = {
  isLlmAvailable,
  analyzeWithLlm,
  getActiveProviderInfo,
};
