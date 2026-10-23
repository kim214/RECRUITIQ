const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequirementMatches, collectRequirements } = require('./requirementMatcher');

const job = {
  title: 'Python Developer',
  requiredSkills: ['Python', 'FastAPI', 'PostgreSQL'],
  minExperience: 2,
  requirementProfile: {
    required_skills: ['Python', 'FastAPI', 'PostgreSQL'],
    preferred_skills: ['Docker', 'AWS'],
    education_requirements: ["Bachelor's in Computer Science"],
    certifications: [],
  },
};

test('collects required vs preferred separately', () => {
  const rows = collectRequirements(job);
  assert.ok(rows.some((r) => r.requirement === 'Python' && r.priority === 'REQUIRED'));
  assert.ok(rows.some((r) => r.requirement === 'Docker' && r.priority === 'PREFERRED'));
});

test('MATCH / PARTIAL / NOT_FOUND with evidence, no auto-reject', () => {
  const application = {
    candidateProfile: {
      source_hash: 'c1',
      skills: ['Python', 'FastAPI'],
      education: [{ qualification: "Bachelor's in Computer Science", institution: 'UoN' }],
    },
    evidence: {
      items: [{ type: 'skill', value: 'Python', evidence: 'Developed backend APIs using Python.', source_document: 'Resume' }],
    },
  };
  const sections = [{
    label: 'Resume',
    text: 'Developed backend APIs using Python, FastAPI, and PostgreSQL. Bachelor in Computer Science.',
  }];
  const result = buildRequirementMatches(job, application, { sections, docMeta: { parsedCount: 1 } });
  const byName = Object.fromEntries(result.items.map((i) => [i.requirement, i]));
  assert.equal(byName.Python.status, 'MATCH');
  assert.match(byName.Python.evidence, /Python/);
  assert.equal(byName.FastAPI.status, 'MATCH');
  assert.equal(byName.Docker.status, 'NOT_FOUND');
  assert.equal(byName.Docker.priority, 'PREFERRED');
  assert.equal(byName.Docker.impact, 'preferred_gap');
  assert.equal(byName.AWS.impact, 'preferred_gap');
  assert.equal(byName.PostgreSQL.status, 'MATCH');
  assert.equal(result.auto_rejected, false);
  assert.equal(result.auto_reject_configured, false);
  assert.ok(result.summary.required_missing < result.summary.required_total);
});

test('missing preferred does not equal missing required', () => {
  const application = {
    candidateProfile: { skills: ['Python'] },
  };
  const result = buildRequirementMatches(job, application, {
    sections: [{ label: 'Resume', text: 'Python developer with APIs' }],
    docMeta: { parsedCount: 1 },
  });
  const docker = result.items.find((i) => i.requirement === 'Docker');
  const postgres = result.items.find((i) => i.requirement === 'PostgreSQL');
  assert.equal(docker.impact, 'preferred_gap');
  assert.equal(postgres.impact, 'required_gap');
  assert.notEqual(docker.impact, postgres.impact);
});

test('does not auto-reject unless configured', () => {
  const application = { candidateProfile: { skills: [] } };
  const missing = buildRequirementMatches(job, application, {
    sections: [{ label: 'Resume', text: 'I work hard.' }],
    docMeta: { parsedCount: 1 },
  });
  assert.equal(missing.auto_rejected, false);
  const rejected = buildRequirementMatches({ ...job, autoRejectMissingRequired: true }, application, {
    sections: [{ label: 'Resume', text: 'I work hard.' }],
    docMeta: { parsedCount: 1 },
  });
  assert.equal(rejected.auto_rejected, true);
});
