/**
 * Structured candidate profile from application text (Ollama JSON).
 * Cached on applications.candidate_profile. Does not invent facts.
 */

const crypto = require('crypto');
const aiService = require('./ai/aiService');

const PROFILE_SYSTEM = `You extract a structured candidate profile from application documents.

Rules:
- Use ONLY information stated in the documents. Never invent names, jobs, dates, skills, or credentials.
- If a field is not present, use null for scalars and [] for lists. You may set status to NOT_FOUND or UNKNOWN.
- skills, qualifications, certifications, and languages must be arrays of strings, never objects.
- Do not copy job requirements into the candidate profile.
- Keep items short and specific.
- evidence must quote short phrases that actually appear in the text.
- Return ONLY valid JSON with this exact shape:
{
  "candidate": { "name": null },
  "education": [{ "institution": "", "qualification": "", "field": "", "dates": "" }],
  "qualifications": [],
  "skills": [],
  "experience": [{ "job_title": "", "employer": "", "start_date": "", "end_date": "", "highlights": "" }],
  "projects": [{ "name": "", "description": "", "technologies": [] }],
  "certifications": [],
  "languages": [],
  "evidence": [{ "field": "", "quote": "" }]
}`;

const ABSENT = /^(not[_ ]?found|unknown|n\/?a|none|null|nil|-|not specified|not mentioned)$/i;

function isAbsent(value) {
  if (value == null) return true;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return !text || ABSENT.test(text);
}

function scalarFrom(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object') {
    if (value.status && ABSENT.test(String(value.status).trim())) return null;
    return value.name || value.skill || value.language || value.certification
      || value.qualification || value.value || value.text || null;
  }
  return null;
}

function cleanString(value, max = 160) {
  const raw = scalarFrom(value);
  if (isAbsent(raw)) return null;
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (/^\[object object\]$/i.test(text)) return null;
  return text.slice(0, max) || null;
}

function textMentions(haystack, needle) {
  if (!haystack || !needle) return false;
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

function normalizeList(value, maxItems = 40) {
  const items = Array.isArray(value) ? value : (value && !isAbsent(value) ? [value] : []);
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const text = cleanString(raw);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeEducation(items) {
  return (Array.isArray(items) ? items : []).slice(0, 12).map((row) => {
    const item = typeof row === 'object' && row ? row : { qualification: row };
    const institution = cleanString(item.institution);
    const qualification = cleanString(item.qualification);
    const field = cleanString(item.field);
    const dates = cleanString(item.dates);
    if (!institution && !qualification && !field) return null;
    return { institution, qualification, field, dates };
  }).filter(Boolean);
}

function normalizeExperience(items) {
  return (Array.isArray(items) ? items : []).slice(0, 16).map((row) => {
    const item = typeof row === 'object' && row ? row : { job_title: row };
    const job_title = cleanString(item.job_title || item.title);
    const employer = cleanString(item.employer || item.company);
    const start_date = cleanString(item.start_date, 40);
    const end_date = cleanString(item.end_date, 40);
    const highlights = cleanString(item.highlights || item.description, 240);
    if (!job_title && !employer) return null;
    return { job_title, employer, start_date, end_date, highlights };
  }).filter(Boolean);
}

function normalizeProjects(items) {
  return (Array.isArray(items) ? items : []).slice(0, 12).map((row) => {
    const item = typeof row === 'object' && row ? row : { name: row };
    const name = cleanString(item.name);
    const description = cleanString(item.description, 240);
    const technologies = normalizeList(item.technologies, 12);
    if (!name && !description) return null;
    return { name, description, technologies };
  }).filter(Boolean);
}

function normalizeEvidence(items) {
  return (Array.isArray(items) ? items : []).slice(0, 12).map((row) => {
    const item = typeof row === 'object' && row ? row : { quote: row };
    const field = cleanString(item.field, 40);
    const quote = cleanString(item.quote, 200);
    if (!quote) return null;
    return { field: field || 'general', quote };
  }).filter(Boolean);
}

function emptyProfile() {
  return {
    candidate: { name: null, name_status: 'NOT_FOUND' },
    education: [],
    qualifications: [],
    skills: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
    evidence: [],
  };
}

function applicationFingerprint(application, text) {
  const payload = {
    code: application?.applicantCode || application?.applicant_code || '',
    resume: application?.resumeUrl || application?.resume_url || '',
    transcript: application?.transcriptUrl || application?.transcript_url || '',
    certs: application?.certificatesUrl || application?.certificates_url || [],
    text: String(text || '').slice(0, 20000),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function normalizeProfile(parsed = {}, application = {}, text = '') {
  const extractedName = cleanString(parsed.candidate?.name || parsed.name);
  let name = null;
  let name_status = 'NOT_FOUND';
  if (extractedName && textMentions(text, extractedName)) {
    name = extractedName;
    name_status = 'FOUND';
  }

  return {
    candidate: { name, name_status },
    education: normalizeEducation(parsed.education),
    qualifications: normalizeList(parsed.qualifications),
    skills: normalizeList(parsed.skills),
    experience: normalizeExperience(parsed.experience),
    projects: normalizeProjects(parsed.projects),
    certifications: normalizeList(parsed.certifications),
    languages: normalizeList(parsed.languages),
    evidence: normalizeEvidence(parsed.evidence),
  };
}

function hasFreshProfile(application, text) {
  const profile = application?.candidateProfile || application?.candidate_profile;
  if (!profile || typeof profile !== 'object') return false;
  if (!profile.source_hash) return false;
  return profile.source_hash === applicationFingerprint(application, text);
}

function buildExtractionPrompt(application, text) {
  return `APPLICANT ID: ${application.applicantCode || application.applicant_code || 'UNKNOWN'}

APPLICATION TEXT:
${(text || '').slice(0, 12000) || '(No readable text)'}

Extract the structured candidate profile. Do not invent a personal name. Use NOT_FOUND when a field is absent. If a name appears in the documents, extract it only as document text — employers will not see it.`;
}

async function extractCandidateProfile(application, text) {
  const { parsed, model } = await aiService.structuredOutput({
    system: PROFILE_SYSTEM,
    prompt: buildExtractionPrompt(application, text),
    temperature: 0,
    maxTokens: 1600,
  });
  return {
    ...normalizeProfile(parsed, application, text),
    source_hash: applicationFingerprint(application, text),
    model,
    analyzed_at: new Date().toISOString(),
  };
}

async function ensureCandidateProfile(db, application, { text = '', force = false } = {}) {
  if (!application) return application;
  if (!force && hasFreshProfile(application, text)) {
    return {
      ...application,
      candidateProfile: application.candidateProfile || application.candidate_profile,
    };
  }

  let profile;
  const usable = String(text || '').replace(/\s+/g, ' ').trim().length >= 30;
  if (!usable) {
    profile = {
      ...emptyProfile(),
      candidate: normalizeProfile({}, application, text).candidate,
      source_hash: applicationFingerprint(application, text),
      model: null,
      analyzed_at: new Date().toISOString(),
    };
  } else if (!aiService.isConfigured()) {
    return application;
  } else {
    try {
      profile = await extractCandidateProfile(application, text);
    } catch (err) {
      console.error(`Candidate profile extraction failed (${application.id || application.applicantName}):`, err.message);
      return application;
    }
  }

  try {
    if (db?.updateApplication) {
      return db.updateApplication(application.id, { candidateProfile: profile });
    }
  } catch (err) {
    console.error(`Candidate profile save failed (${application.id}):`, err.message);
    return { ...application, candidateProfile: profile, candidate_profile: profile };
  }
  return { ...application, candidateProfile: profile, candidate_profile: profile };
}

function formatCandidateProfileForPrompt(application) {
  const profile = application?.candidateProfile || application?.candidate_profile;
  if (!profile) return '';
  return `
STRUCTURED CANDIDATE PROFILE (cached, from documents only):
Name: ${profile.candidate?.name || 'NOT_FOUND'} (${profile.candidate?.name_status || 'UNKNOWN'})
Skills: ${JSON.stringify(profile.skills || [])}
Education: ${JSON.stringify(profile.education || [])}
Qualifications: ${JSON.stringify(profile.qualifications || [])}
Experience: ${JSON.stringify(profile.experience || [])}
Job titles: ${JSON.stringify((profile.experience || []).map((e) => e.job_title).filter(Boolean))}
Employers: ${JSON.stringify((profile.experience || []).map((e) => e.employer).filter(Boolean))}
Projects: ${JSON.stringify(profile.projects || [])}
Certifications: ${JSON.stringify(profile.certifications || [])}
Languages: ${JSON.stringify(profile.languages || [])}
`;
}

module.exports = {
  emptyProfile,
  isAbsent,
  cleanString,
  normalizeList,
  normalizeProfile,
  applicationFingerprint,
  hasFreshProfile,
  extractCandidateProfile,
  ensureCandidateProfile,
  formatCandidateProfileForPrompt,
};
