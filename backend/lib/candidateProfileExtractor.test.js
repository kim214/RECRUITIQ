const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProfile,
  hasFreshProfile,
  applicationFingerprint,
  isAbsent,
} = require('./candidateProfileExtractor');

test('missing fields become empty / NOT_FOUND, never invented', () => {
  const profile = normalizeProfile({
    candidate: { name: 'NOT_FOUND' },
    skills: ['Python', 'n/a', 'UNKNOWN', ''],
    education: [],
    experience: [{ job_title: 'Unknown', employer: 'NONE' }],
    certifications: ['NOT_FOUND'],
    languages: null,
  }, {});
  assert.equal(profile.candidate.name, null);
  assert.equal(profile.candidate.name_status, 'NOT_FOUND');
  assert.deepEqual(profile.skills, ['Python']);
  assert.deepEqual(profile.certifications, []);
  assert.deepEqual(profile.experience, []);
  assert.equal(isAbsent('UNKNOWN'), true);
});

test('personal names are not copied from the account onto the profile', () => {
  const profile = normalizeProfile(
    { candidate: { name: 'Sam Applicant' } },
    { applicantName: 'Sam Applicant' },
    'I work hard and learn quickly.',
  );
  assert.equal(profile.candidate.name, null);
  assert.equal(profile.candidate.name_status, 'NOT_FOUND');
});

test('object NOT_FOUND list items are dropped', () => {
  const profile = normalizeProfile({
    skills: [{ status: 'NOT_FOUND' }, 'Python', {}],
    certifications: [{ name: 'UNKNOWN' }],
    languages: [{ language: 'NOT_FOUND' }],
  }, {}, 'Python developer');
  assert.deepEqual(profile.skills, ['Python']);
  assert.deepEqual(profile.certifications, []);
  assert.deepEqual(profile.languages, []);
});

test('experience keeps titles, employers, and dates', () => {
  const profile = normalizeProfile({
    candidate: { name: 'Jane Doe' },
    experience: [{
      job_title: 'Python Developer',
      employer: 'Acme',
      start_date: '2022',
      end_date: '2024',
      highlights: 'Built APIs',
    }],
    skills: ['Python', 'SQL'],
  });
  assert.equal(profile.experience[0].job_title, 'Python Developer');
  assert.equal(profile.experience[0].employer, 'Acme');
  assert.deepEqual(profile.skills, ['Python', 'SQL']);
});

test('hasFreshProfile uses source hash of application text', () => {
  const application = { applicantName: 'Jane', resumeUrl: '/r.pdf' };
  const text = 'Python developer at Acme';
  const hash = applicationFingerprint(application, text);
  assert.equal(hasFreshProfile({ ...application, candidateProfile: { source_hash: hash, skills: ['Python'] } }, text), true);
  assert.equal(hasFreshProfile({ ...application, candidateProfile: { source_hash: 'old', skills: ['Python'] } }, text), false);
  assert.equal(hasFreshProfile({ ...application, candidateProfile: { skills: ['Python'] } }, text), false);
});
