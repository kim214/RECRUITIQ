/**
 * Evidence-based candidate–job matching (no fabricated skills or scores).
 * Used when the Python AI service / OpenAI is unavailable (e.g. Vercel).
 */

const SKILL_ALIASES = {
  js: 'javascript',
  'node.js': 'nodejs',
  node: 'nodejs',
  ts: 'typescript',
  py: 'python',
  'c#': 'csharp',
  'c++': 'cpp',
  reactjs: 'react',
  vuejs: 'vue',
  postgres: 'postgresql',
  mongo: 'mongodb',
  aws: 'amazon web services',
  gcp: 'google cloud',
  ms: 'microsoft',
  'ms office': 'microsoft office',
  excel: 'microsoft excel',
  seo: 'search engine optimization',
  crm: 'customer relationship management',
  ict: 'information technology',
  hr: 'human resources',
  ui: 'user interface',
  ux: 'user experience',
};

const EDUCATION_LEVELS = [
  { level: 6, patterns: [/ph\.?\s*d|doctorate|doctoral/i] },
  { level: 5, patterns: [/master'?s?|msc|m\.sc|mba|m\.a\.?/i] },
  { level: 4, patterns: [/bachelor'?s?|b\.sc|bsc|undergraduate|degree in/i] },
  { level: 3, patterns: [/associate|diploma in/i] },
  { level: 2, patterns: [/diploma|certificate course/i] },
  { level: 1, patterns: [/high school|secondary|kcse|o-?level/i] },
];

function normalizeSkill(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim().replace(/[^\w\s+#.+-]/g, ' ');
  s = SKILL_ALIASES[s] || s;
  return s.replace(/\s+/g, ' ').trim();
}

function tokenizeSkill(skill) {
  return normalizeSkill(skill).split(/[\s/|]+/).filter(Boolean);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skillMentioned(requiredSkill, text) {
  const norm = normalizeSkill(requiredSkill);
  if (!norm) return 'missing';

  if (new RegExp(`\\b${escapeRegex(norm)}\\b`, 'i').test(text)) return 'matched';

  if (text.includes(norm)) return 'matched';

  const tokens = tokenizeSkill(requiredSkill);
  const hits = tokens.filter((t) => t.length > 2 && (new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(text) || text.includes(t)));
  if (hits.length === tokens.length && tokens.length) return 'matched';
  if (hits.length > 0) return 'partial';

  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
    if (canonical === norm || norm.includes(canonical) || alias === norm) {
      if (new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(text) || text.includes(canonical)) return 'matched';
    }
  }

  const words = norm.split(' ').filter((w) => w.length > 3);
  if (words.length > 1 && words.every((w) => text.includes(w))) return 'partial';

  return 'missing';
}

function scoreSkills(requiredSkills, text) {
  const required = (requiredSkills || []).map((s) => String(s).trim()).filter(Boolean);
  if (!required.length) {
    return { score: null, matched: [], partial: [], missing: [], weight: 0 };
  }

  const matched = [];
  const partial = [];
  const missing = [];

  required.forEach((skill) => {
    const result = skillMentioned(skill, text);
    if (result === 'matched') matched.push(skill);
    else if (result === 'partial') partial.push(skill);
    else missing.push(skill);
  });

  const points = matched.length + partial.length * 0.45;
  const score = Math.round((points / required.length) * 100);
  return { score, matched, partial, missing, weight: 0.45 };
}

function extractExperienceYears(text) {
  if (!text) return { years: null, source: 'none' };

  const patterns = [
    /(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/i,
    /(?:experience|exp)[:\s]+(\d+)\+?\s*(?:years?|yrs?)/i,
    /(\d+)\+?\s*(?:years?|yrs?)\s+(?:in|working|professional)/i,
    /over\s+(\d+)\s*(?:years?|yrs?)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { years: parseInt(m[1], 10), source: 'explicit' };
  }

  const rangePattern = /(\d{4})\s*[-–—to]+\s*(\d{4}|present|current|now)/gi;
  let rangeYears = 0;
  let match;
  const currentYear = new Date().getFullYear();
  while ((match = rangePattern.exec(text)) !== null) {
    const start = parseInt(match[1], 10);
    const endRaw = match[2].toLowerCase();
    const end = /present|current|now/.test(endRaw) ? currentYear : parseInt(endRaw, 10);
    if (start >= 1970 && end >= start && end <= currentYear + 1) {
      rangeYears += end - start;
    }
  }
  if (rangeYears > 0) {
    return { years: Math.min(rangeYears, 40), source: 'work_history' };
  }

  const roleMatches = text.match(/(?:worked|served|employed|intern(?:ship)?|position).{0,40}(\d+)\s*(?:years?|yrs?)/gi);
  if (roleMatches?.length) {
    const nums = roleMatches.map((s) => parseInt(s.match(/\d+/)[0], 10));
    return { years: Math.max(...nums), source: 'inferred' };
  }

  return { years: null, source: 'none' };
}

function parseEducationLevel(text) {
  if (!text) return 0;
  for (const { level, patterns } of EDUCATION_LEVELS) {
    if (patterns.some((p) => p.test(text))) return level;
  }
  return 0;
}

function parseRequiredEducationLevel(required) {
  if (!required) return 0;
  const str = String(required).toLowerCase();
  if (/ph\.?d|doctorate/.test(str)) return 6;
  if (/master|mba|msc/.test(str)) return 5;
  if (/bachelor|degree|undergraduate|b\.sc/.test(str)) return 4;
  if (/diploma|associate/.test(str)) return 3;
  if (/certificate|certification/.test(str)) return 2;
  return 0;
}

function scoreEducation(requiredEducation, text, options = {}) {
  const eduSource = (options.transcriptText || text || '').toLowerCase();
  const fromTranscript = !!options.transcriptText;

  if (!requiredEducation) {
    return {
      score: null,
      meets_requirement: true,
      details: fromTranscript
        ? 'Transcript reviewed; no specific education requirement for this role.'
        : 'No specific education requirement listed for this role.',
      weight: 0,
    };
  }

  const requiredLevel = parseRequiredEducationLevel(requiredEducation);
  const candidateLevel = parseEducationLevel(eduSource);
  const reqLabel = requiredEducation;

  if (candidateLevel === 0) {
    return {
      score: 25,
      meets_requirement: false,
      details: fromTranscript
        ? `Transcript reviewed. Job requires: ${reqLabel}. No matching qualification found in transcript or other documents.`
        : `Job requires: ${reqLabel}. No matching education credentials found in the application documents.`,
      weight: 0.15,
    };
  }

  if (candidateLevel >= requiredLevel) {
    const bonus = Math.min(15, (candidateLevel - requiredLevel) * 5);
    return {
      score: Math.min(100, 85 + bonus),
      meets_requirement: true,
      details: fromTranscript
        ? `Transcript confirms education meeting requirement (${reqLabel}).`
        : `Education level in submitted documents meets or exceeds the requirement (${reqLabel}).`,
      weight: 0.15,
    };
  }

  const gap = requiredLevel - candidateLevel;
  return {
    score: Math.max(15, 70 - gap * 20),
    meets_requirement: false,
    details: fromTranscript
      ? `Transcript reviewed. Job requires ${reqLabel}; submitted records suggest a lower level.`
      : `Job requires ${reqLabel}. Documents suggest a lower education level than required.`,
    weight: 0.15,
  };
}

function scoreExperience(requiredYears, text, extracted) {
  const req = Number(requiredYears) || 0;
  const { years, source } = extracted;

  if (req === 0) {
    return {
      score: years != null ? Math.min(100, 60 + years * 8) : null,
      candidate_years: years,
      required_years: 0,
      details: years != null
        ? `Candidate mentions ~${years} year(s) of experience (no minimum required).`
        : 'No experience years stated; job has no minimum requirement.',
      weight: years != null ? 0.3 : 0,
    };
  }

  if (years == null) {
    return {
      score: 20,
      candidate_years: null,
      required_years: req,
      details: `Job requires ${req}+ year(s). Candidate did not state experience years in their application.`,
      weight: 0.3,
    };
  }

  let score;
  if (years >= req) {
    const extra = Math.min(20, (years - req) * 5);
    score = Math.min(100, 75 + extra);
  } else {
    const shortfall = req - years;
    score = Math.max(10, 75 - shortfall * 15);
  }

  const confidence = source === 'explicit' ? '' : ' (estimated from application text)';
  return {
    score,
    candidate_years: years,
    required_years: req,
    details: `Candidate: ~${years} year(s)${confidence}. Required: ${req} year(s).`,
    weight: 0.3,
  };
}

function scoreCertifications(requiredCerts, text) {
  const required = (requiredCerts || []).map((c) => String(c).trim()).filter(Boolean);
  if (!required.length) return { score: null, matched: [], missing: [], weight: 0 };

  const matched = [];
  const missing = [];
  required.forEach((cert) => {
    const norm = normalizeSkill(cert);
    if (text.includes(norm) || tokenizeSkill(cert).every((t) => t.length > 2 && text.includes(t))) {
      matched.push(cert);
    } else {
      missing.push(cert);
    }
  });

  const score = Math.round((matched.length / required.length) * 100);
  return { score, matched, missing, weight: 0.1 };
}

function buildSummary(job, applicantName, overall, skills, experience, education, certs, dataQuality, docMeta) {
  const name = applicantName || 'The candidate';
  const parts = [`${name} received an overall match score of ${overall}% for "${job.title}".`];

  if (docMeta?.parsedCount) {
    parts.push(`Reviewed ${docMeta.parsedCount} uploaded document(s): ${docMeta.parsedLabels.join(', ')}.`);
  }
  if (docMeta?.failedCount) {
    parts.push(`${docMeta.failedCount} document(s) could not be fully read${docMeta.failedLabels.length ? ` (${docMeta.failedLabels.join(', ')})` : ''}.`);
  }

  if (skills.score != null) {
    parts.push(
      `Skills: ${skills.score}% — confirmed ${skills.matched.length}/${(job.requiredSkills || job.required_skills || []).length} required skills`
      + (skills.partial.length ? `, partial overlap on ${skills.partial.join(', ')}` : '')
      + (skills.missing.length ? `; not evidenced: ${skills.missing.join(', ')}` : '') + '.',
    );
  }

  if (experience.score != null) {
    parts.push(`Experience: ${experience.score}% — ${experience.details}`);
  }

  if (education.score != null) {
    parts.push(`Education: ${education.score}% — ${education.details}`);
  }

  if (certs.score != null && (job.requiredCertifications || job.required_certifications || []).length) {
    parts.push(
      `Certifications: ${certs.score}% — ${certs.matched.length} of ${(job.requiredCertifications || job.required_certifications).length} required certifications referenced.`,
    );
  }

  if (dataQuality === 'low') {
    parts.push('Note: limited readable text in submitted documents — upload PDF/DOCX files with selectable text for best accuracy.');
  } else if (dataQuality === 'none') {
    parts.push('Note: no readable text found in cover letter or uploaded documents — score reflects missing evidence.');
  }

  return parts.join(' ');
}

function buildStrengths(skills, experience, education, certs) {
  const strengths = [];
  if (skills.matched.length) strengths.push(`Demonstrates required skills: ${skills.matched.slice(0, 4).join(', ')}`);
  if (skills.partial.length) strengths.push(`Related experience with: ${skills.partial.slice(0, 3).join(', ')}`);
  if (experience.candidate_years != null && experience.score >= 70) {
    strengths.push(`Experience aligns with role requirements (~${experience.candidate_years} years)`);
  }
  if (education.meets_requirement && education.score >= 70) strengths.push('Education appears to meet job requirements');
  if (certs.matched?.length) strengths.push(`Holdings/certifications mentioned: ${certs.matched.join(', ')}`);
  return strengths.slice(0, 4);
}

function buildWeaknesses(skills, experience, education, certs, dataQuality, docMeta) {
  const weaknesses = [];
  if (skills.missing.length) weaknesses.push(`Required skills not found in documents: ${skills.missing.slice(0, 4).join(', ')}`);
  if (experience.score != null && experience.score < 60) weaknesses.push(experience.details);
  if (education.score != null && !education.meets_requirement) weaknesses.push(education.details);
  if (certs.missing?.length) weaknesses.push(`Certifications not found in documents: ${certs.missing.join(', ')}`);
  if (docMeta?.failedCount) {
    weaknesses.push(`Could not extract text from: ${docMeta.failedLabels.slice(0, 3).join(', ')} — use PDF or Word format`);
  }
  if (dataQuality === 'none') weaknesses.push('No readable cover letter or document text — unable to verify qualifications');
  else if (dataQuality === 'low') weaknesses.push('Documents contain little extractable text — scores may under-represent the candidate');
  return weaknesses.slice(0, 6);
}

function gatherApplicationText(application) {
  const chunks = [
    application.coverLetter,
    application.cover_letter,
  ].filter(Boolean);
  return chunks.join('\n').trim();
}

function assessDataQuality(text, docMeta) {
  const len = (text || '').replace(/\s+/g, ' ').trim().length;
  if (docMeta?.parsedCount > 0 && len >= 200) return 'good';
  if (docMeta?.parsedCount > 0 && len >= 80) return 'low';
  if (len < 30) return docMeta?.parsedCount ? 'low' : 'none';
  if (len < 120) return 'low';
  return 'good';
}

async function prepareApplicationContext(application, options = {}) {
  const { extractApplicationDocuments } = require('./documentExtractor');
  const coverText = gatherApplicationText(application);
  const docResult = await extractApplicationDocuments(application, options);

  const sections = [];
  if (coverText) sections.push({ label: 'Cover Letter', text: coverText });
  (docResult.sections || []).forEach((s) => sections.push(s));

  const combinedText = sections
    .map((s) => `--- ${s.label} ---\n${s.text}`)
    .join('\n\n');

  const parsedLabels = (docResult.sources || []).filter((s) => s.ok).map((s) => s.label);
  const failedLabels = (docResult.sources || []).filter((s) => !s.ok).map((s) => s.label);

  return {
    combinedText,
    sections,
    documentSources: docResult.sources || [],
    documentMeta: {
      parsedCount: docResult.parsedCount || 0,
      failedCount: docResult.failedCount || 0,
      parsedLabels,
      failedLabels,
    },
  };
}

function analyzeApplication(job, application, applicantProfile = {}, context = {}) {
  const rawText = context.combinedText || gatherApplicationText(application);
  const text = rawText.toLowerCase();
  const docMeta = context.documentMeta || null;
  const dataQuality = assessDataQuality(rawText, docMeta);
  const applicantName = applicantProfile.full_name || applicantProfile.fullName || application.applicantName;

  const transcriptSection = context.sections?.find((s) => s.label === 'Transcript');
  const transcriptText = transcriptSection?.text?.toLowerCase() || '';

  const reqSkills = job.requiredSkills || job.required_skills || [];
  const reqExp = job.minExperience ?? job.experience_years ?? 0;
  const reqEdu = job.requiredEducation || job.required_education || null;
  const reqCerts = job.requiredCertifications || job.required_certifications || [];

  const skills = scoreSkills(reqSkills, text);
  const extracted = extractExperienceYears(text);
  const experience = scoreExperience(reqExp, text, extracted);
  const education = scoreEducation(reqEdu, text, { transcriptText });
  const certs = scoreCertifications(reqCerts, text);

  const components = [
    skills.score != null ? { score: skills.score, weight: skills.weight || 0.45 } : null,
    experience.score != null ? { score: experience.score, weight: experience.weight || 0.3 } : null,
    education.score != null ? { score: education.score, weight: education.weight || 0.15 } : null,
    certs.score != null ? { score: certs.score, weight: certs.weight || 0.1 } : null,
  ].filter(Boolean);

  let overall;
  if (!components.length) {
    overall = 30;
  } else {
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    overall = Math.round(components.reduce((s, c) => s + c.score * (c.weight / totalWeight), 0));
  }

  if (dataQuality === 'none') overall = Math.min(overall, 35);
  else if (dataQuality === 'low' && !docMeta?.parsedCount) overall = Math.min(overall, Math.max(overall - 10, 45));

  overall = Math.max(0, Math.min(100, overall));

  const recommendation = overall >= 82 ? 'strong_yes'
    : overall >= 68 ? 'yes'
      : overall >= 48 ? 'maybe'
        : 'no';

  const strengths = buildStrengths(skills, experience, education, certs);
  const weaknesses = buildWeaknesses(skills, experience, education, certs, dataQuality, docMeta);

  if (!strengths.length && dataQuality !== 'none') {
    strengths.push('Some overlap with role requirements — review documents manually for hidden qualifications');
  }

  const ai_summary = buildSummary(job, applicantName, overall, skills, experience, education, certs, dataQuality, docMeta);

  return {
    overall_score: overall,
    skills_match: {
      score: skills.score ?? 0,
      matched: skills.matched,
      missing: skills.missing,
      partial: skills.partial,
    },
    education_match: {
      score: education.score ?? 0,
      meets_requirement: education.meets_requirement,
      details: education.details,
    },
    experience_match: {
      score: experience.score ?? 0,
      candidate_years: experience.candidate_years,
      required_years: experience.required_years,
      details: experience.details,
    },
    ai_summary,
    strengths: strengths.length ? strengths : ['Review application documents manually'],
    weaknesses: weaknesses.length ? weaknesses : ['No major gaps identified from available documents'],
    recommendation,
    model_version: 'document-aware-v4',
    data_quality: dataQuality,
    documents_reviewed: docMeta?.parsedLabels || [],
    documents_failed: docMeta?.failedLabels || [],
    certifications_match: certs.score != null ? { score: certs.score, matched: certs.matched, missing: certs.missing } : null,
  };
}

module.exports = {
  analyzeApplication,
  prepareApplicationContext,
  gatherApplicationText,
  extractExperienceYears,
  scoreSkills,
};
