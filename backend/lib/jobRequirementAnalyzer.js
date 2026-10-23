const crypto = require('crypto');
const aiService = require('./ai/aiService');

const PROFILE_SYSTEM = `You extract structured hiring requirements from a job posting.

Rules:
- Use only information stated or clearly implied in the posting and employer-provided fields.
- Distinguish REQUIRED skills (must-have) from PREFERRED skills (nice-to-have, plus, bonus, or optional).
- Do not invent tools, degrees, or certifications that are not in the posting.
- If a category is not specified, return an empty array.
- Keep items short and specific (e.g. "Python", "Bachelor's in Computer Science", "3+ years backend experience").
- Return ONLY valid JSON with this exact shape:
{
  "required_skills": [],
  "preferred_skills": [],
  "education_requirements": [],
  "experience_requirements": [],
  "certifications": [],
  "responsibilities": [],
  "other_requirements": []
}`;

function emptyProfile() {
  return {
    required_skills: [],
    preferred_skills: [],
    education_requirements: [],
    experience_requirements: [],
    certifications: [],
    responsibilities: [],
    other_requirements: [],
  };
}

function normalizeList(value) {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!text || text.length > 160) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 40) break;
  }
  return out;
}

function jobFingerprint(job) {
  const payload = {
    title: job.title || '',
    description: job.description || '',
    requiredSkills: job.requiredSkills || job.required_skills || [],
    requiredEducation: job.requiredEducation || job.required_education || '',
    requiredCertifications: job.requiredCertifications || job.required_certifications || [],
    minExperience: job.minExperience ?? job.experience_years ?? 0,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function normalizeProfile(parsed = {}) {
  const required_skills = normalizeList(parsed.required_skills);
  const requiredSet = new Set(required_skills.map((s) => s.toLowerCase()));
  const preferred_skills = normalizeList(parsed.preferred_skills).filter((s) => !requiredSet.has(s.toLowerCase()));
  return {
    required_skills,
    preferred_skills,
    education_requirements: normalizeList(parsed.education_requirements),
    experience_requirements: normalizeList(parsed.experience_requirements),
    certifications: normalizeList(parsed.certifications),
    responsibilities: normalizeList(parsed.responsibilities),
    other_requirements: normalizeList(parsed.other_requirements),
  };
}

function mergeEmployerHints(profile, job) {
  const merged = normalizeProfile(profile);
  const employerSkills = normalizeList(job.requiredSkills || job.required_skills);
  const requiredSet = new Set(merged.required_skills.map((s) => s.toLowerCase()));
  for (const skill of employerSkills) {
    if (!requiredSet.has(skill.toLowerCase())) {
      merged.required_skills.push(skill);
      requiredSet.add(skill.toLowerCase());
    }
  }
  merged.preferred_skills = merged.preferred_skills.filter((s) => !requiredSet.has(s.toLowerCase()));

  const employerCerts = normalizeList(job.requiredCertifications || job.required_certifications);
  const certSet = new Set(merged.certifications.map((s) => s.toLowerCase()));
  for (const cert of employerCerts) {
    if (!certSet.has(cert.toLowerCase())) {
      merged.certifications.push(cert);
      certSet.add(cert.toLowerCase());
    }
  }

  const edu = (job.requiredEducation || job.required_education || '').trim();
  if (edu && !merged.education_requirements.some((e) => e.toLowerCase() === edu.toLowerCase())) {
    merged.education_requirements.unshift(edu);
  }

  const years = Number(job.minExperience ?? job.experience_years ?? 0) || 0;
  if (years > 0) {
    const hint = `${years}+ years of experience`;
    if (!merged.experience_requirements.some((e) => e.toLowerCase().includes(`${years}`))) {
      merged.experience_requirements.unshift(hint);
    }
  }
  return merged;
}

function hasFreshProfile(job) {
  const profile = job.requirementProfile || job.requirement_profile;
  if (!profile || typeof profile !== 'object') return false;
  if (profile.source_hash) return profile.source_hash === jobFingerprint(job);
  const keys = ['required_skills', 'preferred_skills', 'education_requirements', 'experience_requirements', 'certifications', 'responsibilities', 'other_requirements'];
  return keys.some((k) => Array.isArray(profile[k]) && profile[k].length);
}

function buildExtractionPrompt(job) {
  return `JOB TITLE: ${job.title || ''}
LOCATION: ${job.location || 'Not specified'}
TYPE: ${job.employmentType || job.employment_type || 'full-time'}
EMPLOYER-LISTED REQUIRED SKILLS: ${JSON.stringify(job.requiredSkills || job.required_skills || [])}
EMPLOYER-LISTED EDUCATION: ${job.requiredEducation || job.required_education || 'None'}
EMPLOYER-LISTED CERTIFICATIONS: ${JSON.stringify(job.requiredCertifications || job.required_certifications || [])}
MINIMUM EXPERIENCE YEARS: ${job.minExperience ?? job.experience_years ?? 0}

JOB DESCRIPTION:
${(job.description || '').slice(0, 8000)}

Extract the structured requirement profile.`;
}

async function extractJobRequirementProfile(job) {
  const { parsed, model } = await aiService.structuredOutput({
    system: PROFILE_SYSTEM,
    prompt: buildExtractionPrompt(job),
    temperature: 0,
    maxTokens: 1200,
  });
  const merged = mergeEmployerHints(parsed, job);
  return {
    ...merged,
    source_hash: jobFingerprint(job),
    model,
    analyzed_at: new Date().toISOString(),
  };
}

async function ensureJobRequirementProfile(db, job, { force = false } = {}) {
  if (!job) return job;
  if (!force && hasFreshProfile(job)) {
    return {
      ...job,
      requirementProfile: job.requirementProfile || job.requirement_profile,
    };
  }
  if (!aiService.isConfigured()) return job;
  try {
    const profile = await extractJobRequirementProfile(job);
    const existingSkills = job.requiredSkills || job.required_skills || [];
    const patch = {
      requirementProfile: profile,
      requiredSkills: existingSkills.length ? existingSkills : profile.required_skills,
    };
    if (db?.updateJob) {
      return db.updateJob(job.id, patch);
    }
    return { ...job, requirementProfile: profile, requirement_profile: profile };
  } catch (err) {
    console.error(`Job requirement extraction failed (${job.id || job.title}):`, err.message);
    return job;
  }
}

function formatProfileForPrompt(job) {
  const profile = job.requirementProfile || job.requirement_profile;
  if (!profile) return '';
  return `
STRUCTURED REQUIREMENTS (cached):
Required skills: ${JSON.stringify(profile.required_skills || [])}
Preferred skills: ${JSON.stringify(profile.preferred_skills || [])}
Education: ${JSON.stringify(profile.education_requirements || [])}
Experience: ${JSON.stringify(profile.experience_requirements || [])}
Certifications: ${JSON.stringify(profile.certifications || [])}
Responsibilities: ${JSON.stringify(profile.responsibilities || [])}
Other: ${JSON.stringify(profile.other_requirements || [])}
`;
}

module.exports = {
  emptyProfile,
  normalizeList,
  normalizeProfile,
  mergeEmployerHints,
  jobFingerprint,
  hasFreshProfile,
  extractJobRequirementProfile,
  ensureJobRequirementProfile,
  formatProfileForPrompt,
};
