/**
 * Applicant document URLs must be this user's upload, not an arbitrary fetch target.
 */

const path = require('path');
const { BUCKET_NAME } = require('./storage');

function decodePath(url) {
  try {
    return decodeURIComponent(String(url).split('?')[0].split('#')[0]);
  } catch {
    return String(url || '');
  }
}

function collectDocumentUrls(data = {}) {
  const urls = [];
  if (data.resumeUrl || data.resume_url) urls.push(data.resumeUrl || data.resume_url);
  if (data.transcriptUrl || data.transcript_url) urls.push(data.transcriptUrl || data.transcript_url);
  const certs = data.certificatesUrl || data.certificates_url || [];
  for (const url of Array.isArray(certs) ? certs : [certs]) {
    if (url) urls.push(url);
  }
  return urls;
}

function localUploadRelative(url) {
  const clean = decodePath(url);
  if (!clean.startsWith('/uploads/')) return null;
  const rel = clean.slice('/uploads/'.length).replace(/\\/g, '/');
  if (!rel || rel.includes('..') || path.isAbsolute(rel) || rel.startsWith('/')) return null;
  return rel;
}

function supabaseObjectPath(url) {
  const clean = decodePath(url);
  const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
  const idx = clean.indexOf(marker);
  if (idx === -1) return null;
  const objectPath = clean.slice(idx + marker.length).replace(/\\/g, '/');
  if (!objectPath || objectPath.includes('..')) return null;
  return objectPath;
}

function ownedByApplicant(relativePath, applicantId) {
  const owner = `${applicantId}/`;
  return String(relativePath || '').startsWith(owner);
}

function invalidUrlError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function assertOwnedDocumentUrl(url, applicantId) {
  if (!url) return;
  if (!applicantId) throw invalidUrlError('Invalid document URL');
  const local = localUploadRelative(url);
  if (local) {
    if (!ownedByApplicant(local, applicantId)) {
      throw invalidUrlError('Document URL does not belong to this applicant');
    }
    return;
  }
  const objectPath = supabaseObjectPath(url);
  if (objectPath) {
    if (!ownedByApplicant(objectPath, applicantId)) {
      throw invalidUrlError('Document URL does not belong to this applicant');
    }
    return;
  }
  throw invalidUrlError('Invalid document URL');
}

function assertOwnedDocumentUrls(applicantId, data) {
  for (const url of collectDocumentUrls(data)) {
    assertOwnedDocumentUrl(url, applicantId);
  }
}

function resolveLocalUploadPath(url, uploadDir) {
  const rel = localUploadRelative(url);
  if (!rel) return null;
  const root = path.resolve(uploadDir);
  const filePath = path.resolve(root, rel);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (filePath !== root && !filePath.startsWith(prefix)) return null;
  return filePath;
}

module.exports = {
  collectDocumentUrls,
  localUploadRelative,
  supabaseObjectPath,
  assertOwnedDocumentUrl,
  assertOwnedDocumentUrls,
  resolveLocalUploadPath,
};
