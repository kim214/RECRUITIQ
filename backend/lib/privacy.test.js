const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateApplicantCode,
  derivedApplicantCode,
  presentApplication,
  presentMessage,
  presentInterview,
  employerMessageNotice,
  PLATFORM_NAME,
} = require('./privacy');

test('generated applicant codes are RQ- prefixed and unique-ish', () => {
  const a = generateApplicantCode();
  const b = generateApplicantCode();
  assert.match(a, /^RQ-[A-Z0-9]{8}$/);
  assert.notEqual(a, b);
});

test('employers only see the applicant code, never name email or files', () => {
  const app = presentApplication({
    id: 'app-1',
    applicantId: '11111111-2222-3333-4444-555555555555',
    applicantCode: 'RQ-TESTCODE',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.com',
    coverLetter: 'I am Jane Doe from Nairobi',
    resumeUrl: '/uploads/x/resume.pdf',
    transcriptUrl: '/uploads/x/t.pdf',
    certificatesUrl: ['/uploads/x/c.pdf'],
    candidateProfile: { candidate: { name: 'Jane Doe', name_status: 'FOUND' } },
    analysis: { summary: 'Jane Doe has strong Python skills' },
  }, 'employer');
  assert.equal(app.applicantName, 'RQ-TESTCODE');
  assert.equal(app.applicantCode, 'RQ-TESTCODE');
  assert.equal(app.applicantEmail, null);
  assert.equal(app.resumeUrl, null);
  assert.equal(app.coverLetter, null);
  assert.equal(app.candidateProfile.candidate.name, null);
  assert.equal(app.identitySealed, true);
  assert.match(app.analysis.summary, /Applicant has strong Python/);
  assert.doesNotMatch(JSON.stringify(app), /Jane Doe/);
  assert.doesNotMatch(JSON.stringify(app), /jane@example.com/);
});

test('applicants and admins still see the real name', () => {
  const raw = { applicantName: 'Jane Doe', applicantEmail: 'jane@example.com', applicantCode: 'RQ-TESTCODE' };
  assert.equal(presentApplication(raw, 'applicant').applicantName, 'Jane Doe');
  assert.equal(presentApplication(raw, 'admin').applicantEmail, 'jane@example.com');
});

test('employer chat is branded RecruitIQ to the applicant', () => {
  const msg = presentMessage(
    { senderRole: 'employer', senderName: 'James Kipsang', body: 'Can you do Tuesday?', mine: false },
    { role: 'applicant', applicantCode: 'RQ-TESTCODE' },
  );
  assert.equal(msg.senderName, PLATFORM_NAME);
  assert.equal(employerMessageNotice('Hello').title, 'RecruitIQ sent you a message');
});

test('applicant chat appears as the applicant id to employers', () => {
  const msg = presentMessage(
    { senderRole: 'applicant', senderName: 'Jane Doe', body: 'Yes', mine: false },
    { role: 'employer', applicantCode: 'RQ-TESTCODE' },
  );
  assert.equal(msg.senderName, 'RQ-TESTCODE');
});

test('derived codes are stable for a uuid', () => {
  assert.equal(derivedApplicantCode('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), 'RQ-AAAAAAAA');
});

test('employer interview cards hide email', () => {
  const row = presentInterview({
    applicantName: 'Jane',
    applicantEmail: 'jane@x.com',
    applicantCode: 'RQ-TESTCODE',
    company: 'Acme',
    employerName: 'James',
  }, 'employer');
  assert.equal(row.applicantName, 'RQ-TESTCODE');
  assert.equal(row.applicantEmail, null);
});
