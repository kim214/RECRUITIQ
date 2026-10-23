const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProfile,
  mergeEmployerHints,
  hasFreshProfile,
  jobFingerprint,
} = require('./jobRequirementAnalyzer');

test('normalizeProfile separates required vs preferred and drops empties', () => {
  const profile = normalizeProfile({
    required_skills: ['Python', ' python ', '', 'FastAPI'],
    preferred_skills: ['Docker', 'Python', 'AWS'],
    education_requirements: ["Bachelor's in CS"],
    experience_requirements: ['3+ years'],
    certifications: null,
    responsibilities: ['Build APIs'],
    other_requirements: ['On-site Nairobi'],
  });
  assert.deepEqual(profile.required_skills, ['Python', 'FastAPI']);
  assert.deepEqual(profile.preferred_skills, ['Docker', 'AWS']);
  assert.deepEqual(profile.certifications, []);
  assert.equal(profile.responsibilities[0], 'Build APIs');
});

test('mergeEmployerHints keeps employer skills as required', () => {
  const merged = mergeEmployerHints(
    { required_skills: ['SQL'], preferred_skills: ['React'] },
    { requiredSkills: ['React', 'Node.js'], requiredEducation: "Bachelor's", minExperience: 2, requiredCertifications: ['AWS'] },
  );
  assert.ok(merged.required_skills.includes('React'));
  assert.ok(merged.required_skills.includes('Node.js'));
  assert.equal(merged.preferred_skills.includes('React'), false);
  assert.ok(merged.education_requirements[0].includes('Bachelor'));
  assert.ok(merged.experience_requirements[0].includes('2'));
  assert.ok(merged.certifications.includes('AWS'));
});

test('missing requirements stay empty', () => {
  const profile = normalizeProfile({});
  assert.deepEqual(profile.required_skills, []);
  assert.deepEqual(profile.preferred_skills, []);
  assert.deepEqual(profile.other_requirements, []);
});

test('hasFreshProfile uses source hash', () => {
  const job = { title: 'Eng', description: 'Build stuff', requiredSkills: ['JS'], minExperience: 0 };
  const hash = jobFingerprint(job);
  assert.equal(hasFreshProfile({ ...job, requirementProfile: { source_hash: hash, required_skills: ['JS'] } }), true);
  assert.equal(hasFreshProfile({ ...job, requirementProfile: { source_hash: 'old', required_skills: ['JS'] } }), false);
});
