const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CERT_DETECTED,
  TRANSCRIPT_DETECTED,
  collectBundles,
  hasFreshSupporting,
  supportingFingerprint,
  normalizeSupporting,
  normalizeTranscript,
} = require('./supportingDocumentAnalyzer');

const job = {
  title: 'Python Developer',
  requiredSkills: ['Python', 'AWS'],
  requiredEducation: "Bachelor's",
  requiredCertifications: ['AWS Cloud Practitioner'],
};

test('certificates never marked verified', () => {
  const result = normalizeSupporting({
    certificates: [{
      certificate: 'AWS Cloud Practitioner',
      issuer: 'Amazon Web Services',
      candidate_name: 'Jane Doe',
      issue_date: '2024-01-15',
      expiry_date: '2027-01-15',
      certificate_number: 'AWS-123',
      relevant_domain: 'Cloud',
      relevant_to_job: true,
      relevance_reason: 'Matches required AWS cert',
    }],
    transcript: null,
  }, {
    certificateTexts: [{ label: 'Certificate 1', text: 'AWS Cloud Practitioner Amazon Web Services Jane Doe AWS-123 2024-01-15 2027-01-15' }],
    transcriptText: '',
    unread: [],
  }, job);

  assert.equal(result.certificates[0].verified, false);
  assert.equal(result.certificates[0].verification_status, CERT_DETECTED);
  assert.equal(result.certificates[0].issuer, 'Amazon Web Services');
  assert.equal(result.certificates[0].certificate_number, 'AWS-123');
});

test('transcript keeps GPA/subjects from text and does not fabricate', () => {
  const text = 'University of Nairobi BSc Computer Science GPA 3.80 Classification Second Class Data Structures A';
  const transcript = normalizeTranscript({
    institution: 'University of Nairobi',
    qualification: 'BSc Computer Science',
    gpa: '3.80',
    classification: 'Second Class',
    subjects: [{ name: 'Data Structures', grade: 'A' }, { name: 'Invented Alchemy', grade: 'A+' }],
    relevant_subjects: ['Data Structures'],
  }, text, job);

  assert.equal(transcript.verified, false);
  assert.equal(transcript.verification_status, TRANSCRIPT_DETECTED);
  assert.equal(transcript.gpa, '3.80');
  assert.ok(transcript.subjects.some((s) => s.name === 'Data Structures' && s.grade === 'A'));
  assert.equal(transcript.subjects.some((s) => s.name === 'Invented Alchemy'), false);
});

test('fabricated GPA is dropped', () => {
  const transcript = normalizeTranscript({ gpa: '4.00', subjects: [] }, 'Official transcript. Courses pending.', job);
  assert.equal(transcript.gpa, null);
});

test('unread scanned certificate is not treated as authentic content', () => {
  const bundles = collectBundles([], [{ label: 'Certificate 1', ok: false, error: 'scanned_no_text' }]);
  const result = normalizeSupporting({ certificates: [], transcript: null }, bundles, job);
  assert.equal(result.certificates[0].unread, true);
  assert.equal(result.certificates[0].verified, false);
  assert.equal(result.certificates[0].verification_status, CERT_DETECTED);
});

test('fresh cache uses supporting hash including job', () => {
  const application = { id: 'a1' };
  const bundles = { transcriptText: 'GPA 3.8', certificateTexts: [], unreadLabels: [] };
  const hash = supportingFingerprint(application, job, bundles);
  assert.equal(hasFreshSupporting({ supportingDocuments: { source_hash: hash } }, job, bundles), true);
  assert.equal(hasFreshSupporting({ supportingDocuments: { source_hash: hash } }, { ...job, title: 'Other' }, bundles), false);
});
