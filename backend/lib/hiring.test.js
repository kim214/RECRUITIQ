const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateInterviewInput,
  validateInterviewPatch,
  mapInterview,
  statusNotification,
  interviewInviteNotification,
} = require('./hiring');

test('online interviews require a meeting URL', () => {
  assert.throws(
    () => validateInterviewInput({ mode: 'online', startsAt: new Date(Date.now() + 3600000).toISOString() }),
    /meeting link/,
  );
});

test('onsite interviews require a location', () => {
  assert.throws(
    () => validateInterviewInput({ mode: 'onsite', startsAt: new Date(Date.now() + 3600000).toISOString() }),
    /location/,
  );
});

test('valid online interview is accepted', () => {
  const startsAt = new Date(Date.now() + 3600000).toISOString();
  const row = validateInterviewInput({
    mode: 'online',
    startsAt,
    meetingUrl: 'https://meet.google.com/abc-defg',
    durationMinutes: 30,
    employerNotes: 'Ask about Python projects',
  });
  assert.equal(row.mode, 'online');
  assert.equal(row.meeting_url, 'https://meet.google.com/abc-defg');
  assert.equal(row.location, null);
  assert.equal(row.duration_minutes, 30);
  assert.equal(row.employer_notes, 'Ask about Python projects');
});

test('mapInterview hides employer notes from applicants', () => {
  const row = {
    id: 'i1',
    application_id: 'a1',
    mode: 'online',
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    duration_minutes: 45,
    status: 'scheduled',
    meeting_url: 'https://zoom.us/j/1',
    employer_notes: 'secret',
    applicant_instructions: 'Join 5 minutes early',
  };
  const applicantView = mapInterview(row, {}, { viewerRole: 'applicant' });
  const employerView = mapInterview(row, {}, { viewerRole: 'employer' });
  assert.equal(applicantView.employerNotes, undefined);
  assert.equal(applicantView.applicantInstructions, 'Join 5 minutes early');
  assert.equal(employerView.employerNotes, 'secret');
});

test('status notifications cover shortlist hire and reject', () => {
  assert.equal(statusNotification('shortlisted', 'Engineer').type, 'shortlisted');
  assert.equal(statusNotification('hired', 'Engineer').type, 'hired');
  assert.equal(statusNotification('rejected', 'Engineer').type, 'rejected');
  assert.equal(statusNotification('ai_screening', 'Engineer'), null);
});

test('interview invite copy mentions join for online', () => {
  const note = interviewInviteNotification({
    jobTitle: 'Engineer',
    mode: 'online',
    startsAt: new Date('2026-09-20T10:00:00Z').toISOString(),
  });
  assert.match(note.body, /join link/);
  assert.equal(note.link, '/applicant/interviews');
});

test('validateInterviewPatch can complete without a new time', () => {
  const patch = validateInterviewPatch(
    { status: 'completed' },
    { mode: 'online', starts_at: new Date().toISOString(), duration_minutes: 45, meeting_url: 'https://x.com' },
  );
  assert.equal(patch.status, 'completed');
  assert.equal(patch.starts_at, undefined);
});
