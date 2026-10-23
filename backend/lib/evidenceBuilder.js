/**
 * Links important candidate claims to quotes in uploaded documents.
 * Deterministic — does not invent evidence or call Ollama.
 */

const crypto = require('crypto');

function normalizeValue(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function findSnippet(text, value, window = 90) {
  const hay = String(text || '');
  const needle = normalizeValue(value);
  if (!hay || needle.length < 2) return null;
  const idx = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 40);
  const end = Math.min(hay.length, idx + needle.length + window);
  let snippet = hay.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < hay.length) snippet = `${snippet}…`;
  return snippet.slice(0, 240);
}

function sourceName(section) {
  return section?.label || section?.source_document || 'application';
}

function locateClaim(sections, value) {
  for (const section of sections || []) {
    const text = section.text || section.llmText || '';
    const evidence = findSnippet(text, value);
    if (evidence) {
      return { evidence, source_document: sourceName(section) };
    }
  }
  return null;
}

function addClaim(bucket, type, value) {
  const clean = normalizeValue(value);
  if (!clean || clean.length > 120) return;
  const key = `${type}:${clean.toLowerCase()}`;
  if (bucket.has(key)) return;
  bucket.set(key, { type, value: clean });
}

function collectClaims(application, job) {
  const bucket = new Map();
  const profile = application?.candidateProfile || application?.candidate_profile || {};
  const supporting = application?.supportingDocuments || application?.supporting_documents || {};

  for (const skill of profile.skills || []) addClaim(bucket, 'skill', skill);
  for (const exp of profile.experience || []) {
    addClaim(bucket, 'experience', exp.job_title);
    addClaim(bucket, 'employer', exp.employer);
  }
  for (const edu of profile.education || []) {
    addClaim(bucket, 'education', edu.qualification);
    addClaim(bucket, 'education', edu.institution);
  }
  for (const cert of profile.certifications || []) addClaim(bucket, 'certification', cert);
  for (const project of profile.projects || []) addClaim(bucket, 'project', project.name);
  for (const lang of profile.languages || []) addClaim(bucket, 'language', lang);

  for (const cert of supporting.certificates || []) {
    addClaim(bucket, 'certification', cert.certificate);
    addClaim(bucket, 'issuer', cert.issuer);
  }
  if (supporting.transcript) {
    addClaim(bucket, 'education', supporting.transcript.qualification);
    addClaim(bucket, 'education', supporting.transcript.institution);
  }

  for (const skill of job?.requiredSkills || job?.required_skills || []) {
    addClaim(bucket, 'skill', skill);
  }
  for (const cert of job?.requiredCertifications || job?.required_certifications || []) {
    addClaim(bucket, 'certification', cert);
  }

  return [...bucket.values()].slice(0, 50);
}

function evidenceFingerprint(application, sections) {
  const profile = application?.candidateProfile || application?.candidate_profile || {};
  const supporting = application?.supportingDocuments || application?.supporting_documents || {};
  const payload = {
    profile: profile.source_hash || '',
    supporting: supporting.source_hash || '',
    sections: (sections || []).map((s) => `${s.label}:${String(s.text || '').slice(0, 400)}`),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function hasFreshEvidence(application, sections) {
  const stored = application?.evidence;
  const items = stored?.items || (Array.isArray(stored) ? stored : null);
  if (!stored || typeof stored !== 'object' || !stored.source_hash || !items) return false;
  return stored.source_hash === evidenceFingerprint(application, sections);
}

function buildEvidence(application, { job = {}, sections = [] } = {}) {
  const items = [];
  const seen = new Set();
  for (const claim of collectClaims(application, job)) {
    const located = locateClaim(sections, claim.value);
    if (!located) continue;
    const key = `${claim.type}:${claim.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      type: claim.type,
      value: claim.value,
      evidence: located.evidence,
      source_document: located.source_document,
    });
  }

  const llmQuotes = (application?.candidateProfile || application?.candidate_profile || {}).evidence || [];
  for (const row of llmQuotes) {
    const value = normalizeValue(row.field || row.value);
    const quote = normalizeValue(row.quote || row.evidence);
    if (!value || !quote) continue;
    const located = locateClaim(sections, quote) || locateClaim(sections, value);
    if (!located) continue;
    const key = `skill:${value.toLowerCase()}`;
    if (seen.has(key) || seen.has(`${row.field}:${value.toLowerCase()}`)) continue;
    items.push({
      type: row.field || 'general',
      value,
      evidence: quote.length > 20 && located.evidence.includes(quote.slice(0, 20)) ? quote : located.evidence,
      source_document: located.source_document,
    });
  }

  return {
    items: items.slice(0, 40),
    source_hash: evidenceFingerprint(application, sections),
    analyzed_at: new Date().toISOString(),
  };
}

function findEvidenceFor(application, query) {
  const items = application?.evidence?.items || [];
  const q = normalizeValue(query).toLowerCase();
  if (!q) return items;
  const exact = items.filter((item) => String(item.value || '').toLowerCase().includes(q));
  if (exact.length) return exact;
  return items.filter((item) => (
    String(item.type || '').toLowerCase().includes(q)
    || String(item.evidence || '').toLowerCase().includes(q)
  ));
}

async function ensureEvidence(db, application, { job, sections = [], force = false } = {}) {
  if (!application) return application;
  if (!force && hasFreshEvidence(application, sections)) {
    return application;
  }
  const record = buildEvidence(application, { job, sections });
  try {
    if (db?.updateApplication) {
      return db.updateApplication(application.id, { evidence: record });
    }
  } catch (err) {
    console.error(`Evidence save failed (${application.id}):`, err.message);
  }
  return { ...application, evidence: record };
}

function formatEvidenceForPrompt(application) {
  const items = application?.evidence?.items || [];
  if (!items.length) return '';
  const lines = items.slice(0, 20).map((item) => (
    `- ${item.type}: ${item.value} ← "${item.evidence}" (${item.source_document})`
  ));
  return `
EVIDENCE (quotes from documents only):
${lines.join('\n')}
`;
}

module.exports = {
  findSnippet,
  locateClaim,
  collectClaims,
  buildEvidence,
  findEvidenceFor,
  evidenceFingerprint,
  hasFreshEvidence,
  ensureEvidence,
  formatEvidenceForPrompt,
};
