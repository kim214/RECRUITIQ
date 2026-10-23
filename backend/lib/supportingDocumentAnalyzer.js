/**
 * Certificate and transcript analysis (Ollama JSON).
 * Cached on applications.supporting_documents.
 * Never treats an upload as authentic/verified.
 */

const crypto = require('crypto');
const aiService = require('./ai/aiService');
const { jobFingerprint } = require('./jobRequirementAnalyzer');
const { isAbsent, cleanString, normalizeList } = require('./candidateProfileExtractor');

const CERT_DETECTED = 'Certificate information detected';
const TRANSCRIPT_DETECTED = 'Transcript information detected';

const SYSTEM_PROMPT = `You extract facts from certificate and transcript documents for hiring.

Rules:
- Use ONLY text from the documents. Never invent grades, GPA, certificate numbers, dates, issuers, or qualifications.
- If a field is absent, use null or [].
- Do not say a certificate or transcript is authentic, verified, genuine, or official-beyond-the-text.
- skills/subjects must be strings.
- Return ONLY valid JSON:
{
  "certificates": [{
    "certificate": null,
    "issuer": null,
    "candidate_name": null,
    "issue_date": null,
    "expiry_date": null,
    "certificate_number": null,
    "relevant_domain": null,
    "relevance_reason": null,
    "relevant_to_job": false
  }],
  "transcript": {
    "institution": null,
    "qualification": null,
    "subjects": [{ "name": null, "grade": null }],
    "gpa": null,
    "classification": null,
    "relevant_subjects": []
  }
}`;

function supportingFingerprint(application, job, bundles) {
  const payload = {
    job: jobFingerprint(job || {}),
    transcript: bundles.transcriptText || '',
    certificates: bundles.certificateTexts || [],
    unread: bundles.unreadLabels || [],
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function collectBundles(sections = [], sources = []) {
  const transcriptSection = (sections || []).find((s) => /transcript/i.test(s.label || ''));
  const certificateSections = (sections || []).filter((s) => /certificate/i.test(s.label || ''));
  const unread = (sources || []).filter((s) => !s.ok && /(transcript|certificate)/i.test(s.label || ''));
  return {
    transcriptText: (transcriptSection?.llmText || transcriptSection?.text || '').trim(),
    certificateTexts: certificateSections.map((s) => ({
      label: s.label,
      text: (s.llmText || s.text || '').trim(),
    })).filter((s) => s.text),
    unreadLabels: unread.map((s) => s.label),
    unread,
  };
}

function mentionedIn(text, value) {
  if (value == null || value === '') return false;
  const needle = String(value).trim();
  if (!needle || needle.length < 2) return false;
  return String(text || '').toLowerCase().includes(needle.toLowerCase());
}

function normalizeCertificate(raw, text, job) {
  const source = typeof raw === 'object' && raw ? raw : { certificate: raw };
  const combined = text || '';
  const certificate = cleanString(source.certificate || source.name);
  const issuer = cleanString(source.issuer);
  const candidate_name = cleanString(source.candidate_name);
  const issue_date = cleanString(source.issue_date, 40);
  const expiry_date = cleanString(source.expiry_date, 40);
  const certificate_number = cleanString(source.certificate_number, 80);
  const relevant_domain = cleanString(source.relevant_domain, 80);
  const relevance_reason = cleanString(source.relevance_reason, 200);
  const jobSkills = job?.requiredSkills || job?.required_skills || [];
  const reqCerts = job?.requiredCertifications || job?.required_certifications || [];
  const hay = `${certificate || ''} ${issuer || ''} ${relevant_domain || ''}`.toLowerCase();
  const overlap = [...jobSkills, ...reqCerts].some((s) => hay.includes(String(s).toLowerCase()));
  return {
    certificate,
    issuer,
    candidate_name,
    issue_date,
    expiry_date,
    certificate_number,
    relevant_domain,
    relevant_to_job: !!(source.relevant_to_job && (overlap || relevance_reason)),
    relevance_reason,
    verification_status: CERT_DETECTED,
    verified: false,
  };
}

function normalizeSubjects(items, text) {
  return (Array.isArray(items) ? items : []).slice(0, 40).map((row) => {
    const item = typeof row === 'object' && row ? row : { name: row };
    const name = cleanString(item.name || item.subject);
    if (!name) return null;
    if (text && !mentionedIn(text, name) && !mentionedIn(text, name.split(/\s+/)[0])) return null;
    let grade = cleanString(item.grade, 20);
    if (grade && text) {
      const gradeOk = mentionedIn(text, grade)
        || (grade.length <= 2 && new RegExp(`(?:^|[\\s])${grade.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:$|[\\s])`, 'i').test(text));
      if (!gradeOk) grade = null;
    }
    return { name, grade };
  }).filter(Boolean);
}

function normalizeGpa(value, text) {
  if (isAbsent(value)) return null;
  const raw = String(value).trim();
  if (text && !mentionedIn(text, raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    const variants = [String(num), num.toFixed(1), num.toFixed(2)];
    if (!variants.some((v) => mentionedIn(text, v))) return null;
  }
  return raw;
}

function emptyTranscript() {
  return {
    institution: null,
    qualification: null,
    subjects: [],
    gpa: null,
    classification: null,
    relevant_subjects: [],
    verification_status: TRANSCRIPT_DETECTED,
    verified: false,
  };
}

function normalizeTranscript(raw, text, job) {
  if (!text) return null;
  const source = typeof raw === 'object' && raw ? raw : {};
  const reqEdu = String(job?.requiredEducation || job?.required_education || '').toLowerCase();
  const subjects = normalizeSubjects(source.subjects, text);
  const relevant_subjects = normalizeList(source.relevant_subjects).filter((s) => mentionedIn(text, s) || subjects.some((x) => x.name.toLowerCase() === s.toLowerCase()));
  return {
    institution: cleanString(source.institution),
    qualification: cleanString(source.qualification),
    subjects,
    gpa: normalizeGpa(source.gpa, text),
    classification: cleanString(source.classification, 80),
    relevant_subjects,
    verification_status: TRANSCRIPT_DETECTED,
    verified: false,
    matches_job_education: !!(reqEdu && String(source.qualification || '').toLowerCase().includes(reqEdu.split(' ')[0])),
  };
}

function unreadPlaceholder(label, kind) {
  return {
    label,
    unread: true,
    certificate: kind === 'certificate' ? null : undefined,
    verification_status: kind === 'transcript' ? TRANSCRIPT_DETECTED : CERT_DETECTED,
    verified: false,
    note: 'No extractable text (scanned or unreadable). Information detected from upload only — not verified.',
  };
}

function normalizeSupporting(parsed, bundles, job) {
  const certText = bundles.certificateTexts.map((c) => c.text).join('\n');
  const certificates = (Array.isArray(parsed.certificates) ? parsed.certificates : [])
    .slice(0, 8)
    .map((row, i) => normalizeCertificate(row, bundles.certificateTexts[i]?.text || certText, job))
    .filter((c) => c.certificate || c.issuer || c.certificate_number);
  for (const unread of bundles.unread || []) {
    if (/certificate/i.test(unread.label || '')) {
      certificates.push(unreadPlaceholder(unread.label, 'certificate'));
    }
  }
  let transcript = null;
  if (bundles.transcriptText) {
    transcript = normalizeTranscript(parsed.transcript, bundles.transcriptText, job);
  } else if ((bundles.unread || []).some((s) => /transcript/i.test(s.label || ''))) {
    const unread = (bundles.unread || []).find((s) => /transcript/i.test(s.label || ''));
    transcript = unreadPlaceholder(unread?.label || 'Transcript', 'transcript');
  }
  return { certificates, transcript };
}

function hasFreshSupporting(application, job, bundles) {
  const stored = application?.supportingDocuments || application?.supporting_documents;
  if (!stored || typeof stored !== 'object' || !stored.source_hash) return false;
  return stored.source_hash === supportingFingerprint(application, job, bundles);
}

function buildPrompt(job, bundles) {
  const certBlocks = bundles.certificateTexts.length
    ? bundles.certificateTexts.map((c) => `--- ${c.label} ---\n${c.text.slice(0, 2500)}`).join('\n\n')
    : '(No readable certificate text)';
  const transcriptBlock = bundles.transcriptText
    ? bundles.transcriptText.slice(0, 4000)
    : '(No readable transcript text)';
  return `JOB TITLE: ${job?.title || ''}
JOB REQUIRED SKILLS: ${JSON.stringify(job?.requiredSkills || job?.required_skills || [])}
JOB REQUIRED EDUCATION: ${job?.requiredEducation || job?.required_education || 'None'}
JOB REQUIRED CERTIFICATIONS: ${JSON.stringify(job?.requiredCertifications || job?.required_certifications || [])}

CERTIFICATES:
${certBlocks}

TRANSCRIPT:
${transcriptBlock}

Extract certificate and transcript facts. Do not invent grades or claim authenticity.`;
}

function emptySupporting(bundles, job, application) {
  return {
    ...normalizeSupporting({ certificates: [], transcript: null }, bundles, job),
    source_hash: supportingFingerprint(application, job, bundles),
    model: null,
    analyzed_at: new Date().toISOString(),
  };
}

async function extractSupportingDocuments(application, job, bundles) {
  const { parsed, model } = await aiService.structuredOutput({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(job, bundles),
    temperature: 0,
    maxTokens: 1400,
  });
  return {
    ...normalizeSupporting(parsed, bundles, job),
    source_hash: supportingFingerprint(application, job, bundles),
    model,
    analyzed_at: new Date().toISOString(),
  };
}

async function ensureSupportingDocuments(db, application, { job, sections = [], sources = [], force = false } = {}) {
  if (!application) return application;
  const bundles = collectBundles(sections, sources);
  if (!force && hasFreshSupporting(application, job, bundles)) {
    return {
      ...application,
      supportingDocuments: application.supportingDocuments || application.supporting_documents,
    };
  }

  const hasReadable = bundles.transcriptText || bundles.certificateTexts.length;
  const hasUnread = (bundles.unread || []).length > 0;
  let record;
  if (!hasReadable && !hasUnread) {
    record = emptySupporting(bundles, job, application);
  } else if (!hasReadable && hasUnread) {
    record = emptySupporting(bundles, job, application);
  } else if (!aiService.isConfigured()) {
    return application;
  } else {
    try {
      record = await extractSupportingDocuments(application, job, bundles);
    } catch (err) {
      console.error(`Supporting document analysis failed (${application.id}):`, err.message);
      return application;
    }
  }

  try {
    if (db?.updateApplication) {
      return db.updateApplication(application.id, { supportingDocuments: record });
    }
  } catch (err) {
    console.error(`Supporting document save failed (${application.id}):`, err.message);
  }
  return { ...application, supportingDocuments: record, supporting_documents: record };
}

function formatSupportingForPrompt(application) {
  const stored = application?.supportingDocuments || application?.supporting_documents;
  if (!stored) return '';
  return `
SUPPORTING DOCUMENTS (cached; not independently verified):
Certificates: ${JSON.stringify(stored.certificates || [])}
Transcript: ${JSON.stringify(stored.transcript || null)}
Note: Uploaded certificates/transcripts mean information was detected, not that they are authentic.
`;
}

module.exports = {
  CERT_DETECTED,
  TRANSCRIPT_DETECTED,
  collectBundles,
  supportingFingerprint,
  hasFreshSupporting,
  normalizeSupporting,
  normalizeCertificate,
  normalizeTranscript,
  extractSupportingDocuments,
  ensureSupportingDocuments,
  formatSupportingForPrompt,
};
