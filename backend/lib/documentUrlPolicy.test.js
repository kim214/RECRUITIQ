const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const {
  assertOwnedDocumentUrl,
  assertOwnedDocumentUrls,
  resolveLocalUploadPath,
  supabaseObjectPath,
} = require('./documentUrlPolicy');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

test('accepts the applicant local upload and supabase object', () => {
  assert.doesNotThrow(() => assertOwnedDocumentUrl(`/uploads/${USER}/resume.pdf`, USER));
  assert.doesNotThrow(() => assertOwnedDocumentUrl(
    `https://proj.supabase.co/storage/v1/object/public/resumes/${USER}/resume/file.pdf`,
    USER,
  ));
  assert.doesNotThrow(() => assertOwnedDocumentUrls(USER, {
    resumeUrl: `/uploads/${USER}/a.pdf`,
    certificatesUrl: [`/uploads/${USER}/c.pdf`],
  }));
});

test('rejects other users, traversal, and arbitrary HTTP', () => {
  assert.throws(() => assertOwnedDocumentUrl(`/uploads/${OTHER}/resume.pdf`, USER), /does not belong/);
  assert.throws(() => assertOwnedDocumentUrl('/uploads/../backend/.env', USER), /Invalid document URL/);
  assert.throws(() => assertOwnedDocumentUrl('https://evil.example/resume.pdf', USER), /Invalid document URL/);
  assert.throws(() => assertOwnedDocumentUrl('http://169.254.169.254/latest/meta-data/', USER), /Invalid document URL/);
  assert.throws(() => assertOwnedDocumentUrl(
    `https://proj.supabase.co/storage/v1/object/public/resumes/${OTHER}/resume/file.pdf`,
    USER,
  ), /does not belong/);
});

test('local path resolve stays inside the upload directory', () => {
  const root = path.join(os.tmpdir(), 'recruitiq-uploads');
  const ok = resolveLocalUploadPath(`/uploads/${USER}/resume.pdf`, root);
  assert.equal(ok, path.resolve(root, USER, 'resume.pdf'));
  assert.equal(resolveLocalUploadPath('/uploads/../secret.txt', root), null);
  assert.equal(supabaseObjectPath(`https://x.supabase.co/storage/v1/object/public/resumes/${USER}/a.pdf?token=1`), `${USER}/a.pdf`);
});
