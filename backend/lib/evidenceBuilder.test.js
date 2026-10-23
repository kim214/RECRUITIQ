const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findSnippet,
  buildEvidence,
  findEvidenceFor,
  hasFreshEvidence,
  evidenceFingerprint,
} = require('./evidenceBuilder');

const sections = [
  { label: 'Resume', text: 'Jane Doe. Developed backend APIs using Python and FastAPI at Acme Ltd. BSc Computer Science, University of Nairobi.' },
  { label: 'Certificate 1', text: 'AWS Certified Cloud Practitioner issued by Amazon Web Services.' },
];

const application = {
  candidateProfile: {
    source_hash: 'abc',
    skills: ['Python', 'InventedSkill'],
    experience: [{ job_title: 'Backend engineer', employer: 'Acme Ltd' }],
    education: [{ qualification: 'BSc Computer Science', institution: 'University of Nairobi' }],
    certifications: ['AWS Certified Cloud Practitioner'],
  },
};

test('findSnippet returns surrounding quote', () => {
  const snippet = findSnippet(sections[0].text, 'Python');
  assert.match(snippet, /Python/);
  assert.match(snippet, /backend APIs/i);
});

test('buildEvidence only keeps claims found in documents', () => {
  const record = buildEvidence(application, {
    job: { requiredSkills: ['Python', 'Rust'] },
    sections,
  });
  const python = record.items.find((i) => i.value === 'Python');
  assert.ok(python);
  assert.equal(python.type, 'skill');
  assert.equal(python.source_document, 'Resume');
  assert.match(python.evidence, /Python/);
  assert.equal(record.items.some((i) => i.value === 'InventedSkill'), false);
  assert.equal(record.items.some((i) => i.value === 'Rust'), false);
  assert.ok(record.items.some((i) => i.value === 'Acme Ltd'));
});

test('findEvidenceFor answers why a skill was claimed', () => {
  const record = buildEvidence(application, { job: {}, sections });
  const hits = findEvidenceFor({ evidence: record }, 'Python');
  assert.equal(hits.length, 1);
  assert.match(hits[0].evidence, /Python/);
});

test('hasFreshEvidence uses source hash', () => {
  const record = buildEvidence(application, { job: {}, sections });
  assert.equal(hasFreshEvidence({ ...application, evidence: record }, sections), true);
  assert.equal(hasFreshEvidence({ ...application, evidence: { ...record, source_hash: 'old' } }, sections), false);
  assert.equal(evidenceFingerprint(application, sections), record.source_hash);
});
