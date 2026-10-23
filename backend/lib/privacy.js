const crypto = require('crypto');

const PLATFORM_NAME = 'RecruitIQ';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateApplicantCode() {
  let body = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i += 1) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `RQ-${body}`;
}

function derivedApplicantCode(id) {
  const hex = String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return hex ? `RQ-${hex}` : 'RQ-UNKNOWN';
}

function applicantCodeOf(record = {}) {
  return record.applicantCode
    || record.applicant_code
    || derivedApplicantCode(record.applicantId || record.applicant_id || (record.role === 'applicant' ? record.id : null));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactName(text, realName) {
  if (!text || !realName) return text;
  const full = String(realName).trim();
  let out = String(text);
  if (full.length > 1) {
    out = out.replace(new RegExp(escapeRegExp(full), 'gi'), 'Applicant');
  }
  const parts = full
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .sort((a, b) => b.length - a.length);
  for (const part of parts) {
    out = out.replace(new RegExp(escapeRegExp(part), 'gi'), 'Applicant');
  }
  return out;
}

function redactDeep(value, realName) {
  if (!realName || value == null) return value;
  if (typeof value === 'string') return redactName(value, realName);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, realName));
  if (typeof value === 'object') {
    const next = Array.isArray(value) ? [] : { ...value };
    Object.keys(value).forEach((key) => {
      next[key] = redactDeep(value[key], realName);
    });
    return next;
  }
  return value;
}

function stripCandidateProfile(profile) {
  if (!profile) return profile;
  const next = { ...profile };
  if (next.candidate && typeof next.candidate === 'object') {
    next.candidate = {
      ...next.candidate,
      name: null,
      email: null,
      phone: null,
      address: null,
      location: null,
      name_status: 'SEALED',
    };
  }
  return next;
}

function stripSupportingDocuments(docs) {
  if (!docs) return docs;
  const next = { ...docs };
  if (Array.isArray(next.certificates)) {
    next.certificates = next.certificates.map((cert) => ({
      ...cert,
      candidate_name: null,
      name: null,
    }));
  }
  if (next.transcript && typeof next.transcript === 'object') {
    next.transcript = { ...next.transcript, candidate_name: null, name: null };
  }
  return next;
}

function viewerSeesIdentity(role) {
  return role === 'admin' || role === 'applicant';
}

function anonymizeApplicationForEmployer(application) {
  if (!application) return application;
  const code = applicantCodeOf(application);
  const realName = application.applicantName || application.applicant_name;
  const cloned = redactDeep({ ...application }, realName);
  cloned.identitySealed = true;
  cloned.documentsSealed = true;
  cloned.applicantCode = code;
  cloned.applicantName = code;
  cloned.applicant_name = code;
  cloned.applicantEmail = null;
  cloned.applicant_email = null;
  cloned.applicantPhone = null;
  cloned.phone = null;
  cloned.coverLetter = null;
  cloned.cover_letter = null;
  cloned.resumeUrl = null;
  cloned.resume_url = null;
  cloned.transcriptUrl = null;
  cloned.certificatesUrl = [];
  cloned.hasDocuments = Boolean(
    application.resumeUrl || application.resume_url
    || application.transcriptUrl
    || (application.certificatesUrl || []).length,
  );
  cloned.candidateProfile = stripCandidateProfile(cloned.candidateProfile);
  cloned.candidate_profile = cloned.candidateProfile;
  cloned.supportingDocuments = stripSupportingDocuments(cloned.supportingDocuments);
  cloned.supporting_documents = cloned.supportingDocuments;
  return cloned;
}

function presentApplication(application, role) {
  if (!application) return application;
  const withCode = {
    ...application,
    applicantCode: applicantCodeOf(application),
  };
  if (role === 'employer') return anonymizeApplicationForEmployer(withCode);
  return withCode;
}

function presentApplications(list, role) {
  return (list || []).map((item) => presentApplication(item, role));
}

function presentPipeline(payload, role) {
  if (!payload?.pipeline) return payload;
  const pipeline = {};
  Object.entries(payload.pipeline).forEach(([stage, cards]) => {
    pipeline[stage] = presentApplications(cards, role);
  });
  return { ...payload, pipeline };
}

function presentInterview(interview, role) {
  if (!interview) return interview;
  const code = applicantCodeOf(interview);
  if (role === 'employer') {
    return {
      ...interview,
      identitySealed: true,
      applicantCode: code,
      applicantName: code,
      applicantEmail: null,
    };
  }
  if (role === 'applicant') {
    return {
      ...interview,
      applicantCode: code,
      employerName: interview.company || PLATFORM_NAME,
    };
  }
  return { ...interview, applicantCode: code };
}

function presentActivity(item, role) {
  if (!item) return item;
  const code = item.applicantCode || derivedApplicantCode(item.applicantId || item.applicationId);
  if (role !== 'employer') return { ...item, applicantCode: code };
  return {
    ...item,
    applicantCode: code,
    applicantName: code,
    applicantEmail: null,
    identitySealed: true,
  };
}

function presentMessage(message, { role, applicantCode } = {}) {
  if (!message) return message;
  const code = applicantCode || message.applicantCode;
  if (message.senderRole === 'employer') {
    return { ...message, senderName: PLATFORM_NAME };
  }
  if (role === 'employer' && message.senderRole === 'applicant') {
    return { ...message, senderName: code || 'Applicant' };
  }
  if (role === 'applicant' && message.senderRole === 'applicant') {
    return { ...message, senderName: message.mine ? 'You' : 'You' };
  }
  return message;
}

function employerMessageNotice(body) {
  const preview = String(body || '').slice(0, 140);
  const suffix = String(body || '').length > 140 ? '…' : '';
  return {
    title: `${PLATFORM_NAME} sent you a message`,
    body: `${PLATFORM_NAME}: ${preview}${suffix}`,
  };
}

function applicantMessageNotice(applicantCode, body) {
  const preview = String(body || '').slice(0, 140);
  const suffix = String(body || '').length > 140 ? '…' : '';
  const label = applicantCode || 'Applicant';
  return {
    title: `${label} sent a message`,
    body: `${label}: ${preview}${suffix}`,
  };
}

module.exports = {
  PLATFORM_NAME,
  generateApplicantCode,
  derivedApplicantCode,
  applicantCodeOf,
  redactName,
  viewerSeesIdentity,
  presentApplication,
  presentApplications,
  presentPipeline,
  presentInterview,
  presentActivity,
  presentMessage,
  employerMessageNotice,
  applicantMessageNotice,
};
