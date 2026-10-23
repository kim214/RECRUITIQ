/**
 * Candidate-vs-job requirement matching.
 * MATCH | PARTIAL_MATCH | NOT_FOUND | UNCLEAR
 * Required vs preferred. Does not auto-reject. Does not compute overall score.
 */

const crypto = require('crypto');
const { skillMentioned, normalizeSkill } = require('./candidateAnalyzer');
const { locateClaim } = require('./evidenceBuilder');
const { cosineSimilarity } = require('./embeddingService');
const { jobFingerprint } = require('./jobRequirementAnalyzer');

const STATUSES = ['MATCH', 'PARTIAL_MATCH', 'NOT_FOUND', 'UNCLEAR'];
const SEMANTIC_PARTIAL = 0.72;
const SEMANTIC_MATCH = 0.88;

function list(value) {
  return (Array.isArray(value) ? value : []).map((v) => String(v || '').trim()).filter(Boolean);
}

function collectRequirements(job) {
  const profile = job?.requirementProfile || job?.requirement_profile || {};
  const rows = [];
  const seen = new Set();
  const add = (requirement, category, priority) => {
    const text = String(requirement || '').trim();
    if (!text) return;
    const key = `${category}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ requirement: text, category, priority });
  };

  for (const s of profile.required_skills?.length ? profile.required_skills : (job.requiredSkills || job.required_skills || [])) {
    add(s, 'skill', 'REQUIRED');
  }
  for (const s of profile.preferred_skills || []) add(s, 'skill', 'PREFERRED');
  for (const s of profile.education_requirements?.length ? profile.education_requirements : [job.requiredEducation || job.required_education]) {
    add(s, 'education', 'REQUIRED');
  }
  for (const s of profile.experience_requirements || []) add(s, 'experience', 'REQUIRED');
  const years = Number(job.minExperience ?? job.experience_years ?? 0) || 0;
  if (years > 0) add(`${years}+ years of experience`, 'experience', 'REQUIRED');
  for (const s of profile.certifications?.length ? profile.certifications : (job.requiredCertifications || job.required_certifications || [])) {
    add(s, 'certification', 'REQUIRED');
  }
  return rows.slice(0, 40);
}

function combinedText(application, sections) {
  const profile = application?.candidateProfile || application?.candidate_profile || {};
  const bits = [
    ...(profile.skills || []),
    ...(profile.certifications || []),
    ...(profile.qualifications || []),
    ...(profile.education || []).map((e) => [e.qualification, e.institution, e.field].filter(Boolean).join(' ')),
    ...(profile.experience || []).map((e) => [e.job_title, e.employer, e.highlights].filter(Boolean).join(' ')),
    ...(sections || []).map((s) => s.text || s.llmText || ''),
  ];
  return bits.join('\n').toLowerCase();
}

function profileLists(application) {
  const profile = application?.candidateProfile || application?.candidate_profile || {};
  const supporting = application?.supportingDocuments || application?.supporting_documents || {};
  return {
    skills: list(profile.skills),
    certs: [
      ...list(profile.certifications),
      ...list((supporting.certificates || []).map((c) => c.certificate)),
    ],
    education: [
      ...list((profile.education || []).map((e) => e.qualification)),
      ...list((profile.education || []).map((e) => e.institution)),
      supporting.transcript?.qualification,
      supporting.transcript?.institution,
    ].filter(Boolean),
  };
}

function exactInList(requirement, values) {
  const want = normalizeSkill(requirement);
  return (values || []).some((v) => {
    const got = normalizeSkill(v);
    return got === want || got.includes(want) || want.includes(got);
  });
}

function semanticHit(requirement, jobCache, candidateCache) {
  const jobItems = jobCache?.items || [];
  const candItems = candidateCache?.items || [];
  if (!jobItems.length || !candItems.length) return null;
  const want = String(requirement).toLowerCase();
  const jobVec = jobItems.find((i) => i.text && i.text.toLowerCase() === want)?.vector
    || jobItems.find((i) => i.text && i.text.toLowerCase().includes(want))?.vector;
  if (!jobVec) return null;
  let best = 0;
  let peer = null;
  for (const item of candItems) {
    const score = cosineSimilarity(jobVec, item.vector);
    if (score != null && score > best) {
      best = score;
      peer = item.text;
    }
  }
  return { score: best, peer };
}

function classifyRequirement(req, { text, lists, sections, evidenceItems, jobCache, candidateCache, unclear }) {
  if (unclear) {
    return {
      ...req,
      status: 'UNCLEAR',
      evidence: null,
      source_document: null,
      impact: req.priority === 'REQUIRED' ? 'required_unclear' : 'preferred_unclear',
    };
  }

  const located = locateClaim(sections, req.requirement);
  const evidenceHit = (evidenceItems || []).find((e) => String(e.value || '').toLowerCase().includes(req.requirement.toLowerCase()));
  const listPool = req.category === 'certification' ? lists.certs
    : req.category === 'education' ? lists.education
      : lists.skills;
  const listed = exactInList(req.requirement, listPool);
  const keyword = text ? skillMentioned(req.requirement, text) : 'missing';
  const semantic = semanticHit(req.requirement, jobCache, candidateCache);

  let status = 'NOT_FOUND';
  if (listed || keyword === 'matched' || located || evidenceHit) status = 'MATCH';
  else if (keyword === 'partial' || (semantic && semantic.score >= SEMANTIC_PARTIAL)) status = 'PARTIAL_MATCH';
  if (status === 'PARTIAL_MATCH' && semantic && semantic.score >= SEMANTIC_MATCH && listed) status = 'MATCH';

  const evidence = located?.evidence
    || evidenceHit?.evidence
    || (listed ? `Listed in structured candidate profile: ${req.requirement}` : null)
    || (semantic && status === 'PARTIAL_MATCH' ? `Semantic similarity to "${semantic.peer}" (${Math.round(semantic.score * 100)}%)` : null);

  let impact = 'none';
  if (status === 'NOT_FOUND' || status === 'UNCLEAR') {
    impact = req.priority === 'REQUIRED' ? 'required_gap' : 'preferred_gap';
  }

  return {
    ...req,
    status,
    evidence,
    source_document: located?.source_document || evidenceHit?.source_document || null,
    semantic_score: semantic ? Math.round(semantic.score * 100) : null,
    impact,
  };
}

function matchFingerprint(job, application) {
  const profile = application?.candidateProfile || application?.candidate_profile || {};
  const supporting = application?.supportingDocuments || application?.supporting_documents || {};
  const payload = {
    job: jobFingerprint(job || {}),
    candidate: profile.source_hash || '',
    supporting: supporting.source_hash || '',
    evidence: application?.evidence?.source_hash || '',
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function buildRequirementMatches(job, application, { sections = [], docMeta = {} } = {}) {
  const unclear = !docMeta?.parsedCount && !(application?.candidateProfile || application?.candidate_profile)?.skills?.length;
  const text = combinedText(application, sections);
  const lists = profileLists(application);
  const evidenceItems = application?.evidence?.items || [];
  const jobCache = job?.embeddingCache || job?.embedding_cache;
  const candidateCache = application?.embeddingCache || application?.embedding_cache;
  const items = collectRequirements(job).map((req) => classifyRequirement(req, {
    text,
    lists,
    sections,
    evidenceItems,
    jobCache,
    candidateCache,
    unclear,
  }));

  const required = items.filter((i) => i.priority === 'REQUIRED');
  const preferred = items.filter((i) => i.priority === 'PREFERRED');
  const autoRejectConfigured = !!(job?.autoRejectMissingRequired || job?.auto_reject_missing_required);
  const requiredGaps = required.filter((i) => i.status === 'NOT_FOUND').length;

  return {
    items,
    summary: {
      required_total: required.length,
      required_match: required.filter((i) => i.status === 'MATCH').length,
      required_partial: required.filter((i) => i.status === 'PARTIAL_MATCH').length,
      required_missing: requiredGaps,
      preferred_total: preferred.length,
      preferred_match: preferred.filter((i) => i.status === 'MATCH').length,
      preferred_missing: preferred.filter((i) => i.status === 'NOT_FOUND').length,
    },
    auto_rejected: autoRejectConfigured && requiredGaps > 0,
    auto_reject_configured: autoRejectConfigured,
    source_hash: matchFingerprint(job, application),
    analyzed_at: new Date().toISOString(),
  };
}

function hasFreshMatches(application, job) {
  const stored = application?.requirementMatches || application?.requirement_matches;
  if (!stored?.source_hash || !Array.isArray(stored.items)) return false;
  return stored.source_hash === matchFingerprint(job, application);
}

async function ensureRequirementMatches(db, application, { job, sections = [], docMeta = {}, force = false } = {}) {
  if (!application || !job) return application;
  if (!force && hasFreshMatches(application, job)) {
    return {
      ...application,
      requirementMatches: application.requirementMatches || application.requirement_matches,
    };
  }
  const record = buildRequirementMatches(job, application, { sections, docMeta });
  try {
    if (db?.updateApplication) {
      return db.updateApplication(application.id, { requirementMatches: record });
    }
  } catch (err) {
    console.error(`Requirement match save failed (${application.id}):`, err.message);
  }
  return { ...application, requirementMatches: record, requirement_matches: record };
}

function formatMatchesForPrompt(application) {
  const stored = application?.requirementMatches || application?.requirement_matches;
  if (!stored?.items?.length) return '';
  const lines = stored.items.map((i) => {
    const mark = i.status === 'MATCH' ? 'MATCH' : i.status === 'PARTIAL_MATCH' ? 'PARTIAL_MATCH' : i.status;
    return `- [${i.priority}] ${i.requirement}: ${mark}${i.evidence ? ` — ${i.evidence}` : ''}`;
  });
  return `
REQUIREMENT MATCHES (required gaps count more than preferred gaps; do not auto-reject):
${lines.join('\n')}
`;
}

module.exports = {
  STATUSES,
  collectRequirements,
  buildRequirementMatches,
  matchFingerprint,
  hasFreshMatches,
  ensureRequirementMatches,
  formatMatchesForPrompt,
};
