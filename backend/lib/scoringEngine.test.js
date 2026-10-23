const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequirementMatches } = require('./requirementMatcher');
const {
  DEFAULT_WEIGHTS,
  resolveWeights,
  computeScore,
  applyScoreToAnalysis,
  recommendationFromScore,
  matchLabel,
} = require('./scoringEngine');

const job = {
  title: 'Python Developer',
  requiredSkills: ['Python', 'FastAPI', 'PostgreSQL'],
  minExperience: 2,
  requirementProfile: {
    required_skills: ['Python', 'FastAPI', 'PostgreSQL'],
    preferred_skills: ['Docker', 'AWS'],
    education_requirements: ["Bachelor's in Computer Science"],
    experience_requirements: ['2+ years of experience'],
    certifications: ['AWS Certified Cloud Practitioner'],
    other_requirements: ['English'],
  },
};

function scoredApplication(overrides = {}) {
  const application = {
    candidateProfile: {
      source_hash: 'c1',
      skills: ['Python', 'FastAPI', 'PostgreSQL'],
      education: [{ qualification: "Bachelor's in Computer Science", institution: 'UoN' }],
      certifications: ['AWS Certified Cloud Practitioner'],
      languages: ['English'],
      projects: [{ name: 'API platform', description: 'FastAPI service', technologies: ['Python', 'FastAPI'] }],
      ...overrides.candidateProfile,
    },
    evidence: { items: [], source_hash: 'e1' },
  };
  const sections = [{
    label: 'Resume',
    text: overrides.text || 'Developed backend APIs using Python, FastAPI, and PostgreSQL. Bachelor in Computer Science. AWS Certified Cloud Practitioner. English. 3 years of experience.',
  }];
  const matches = buildRequirementMatches(job, application, { sections, docMeta: { parsedCount: 1 } });
  return { ...application, requirementMatches: matches, ...overrides.extra };
}

test('default weights sum to 100', () => {
  const weights = resolveWeights({});
  const total = Object.values(weights).reduce((s, n) => s + n, 0);
  assert.equal(total, 100);
  assert.equal(weights.skills, DEFAULT_WEIGHTS.skills);
});

test('identical inputs produce identical scores', () => {
  const application = scoredApplication();
  const a = computeScore(job, application);
  const b = computeScore(job, application);
  assert.equal(a.overall_score, b.overall_score);
  assert.equal(a.skills_score, b.skills_score);
  assert.equal(a.experience_score, b.experience_score);
  assert.equal(a.education_score, b.education_score);
  assert.equal(a.certification_score, b.certification_score);
  assert.equal(a.project_score, b.project_score);
  assert.equal(a.job_specific_score, b.job_specific_score);
  assert.equal(a.source_hash, b.source_hash);
  assert.deepEqual(a.weights, b.weights);
});

test('backend score ignores LLM overall_score', () => {
  const application = scoredApplication();
  const breakdown = computeScore(job, application);
  const merged = applyScoreToAnalysis({ overall_score: 99, recommendation: 'strong_yes', skills_match: { score: 4 } }, breakdown);
  assert.equal(merged.overall_score, breakdown.overall_score);
  assert.notEqual(merged.overall_score, 99);
  assert.equal(merged.recommendation, recommendationFromScore(breakdown.overall_score));
  assert.equal(merged.skills_match.score, breakdown.skills_match.score);
});

test('missing preferred hurts less than missing required', () => {
  const strong = scoredApplication();
  const missingPreferred = scoredApplication({
    candidateProfile: { skills: ['Python', 'FastAPI', 'PostgreSQL'] },
    text: 'Python FastAPI PostgreSQL. Bachelor in Computer Science. AWS Certified Cloud Practitioner. English. 3 years of experience.',
  });
  const missingRequired = scoredApplication({
    candidateProfile: { skills: ['Python', 'FastAPI'] },
    text: 'Python FastAPI Docker AWS. Bachelor in Computer Science. AWS Certified Cloud Practitioner. English. 3 years of experience.',
  });
  const preferredScore = computeScore(job, missingPreferred);
  const requiredScore = computeScore(job, missingRequired);
  const baseline = computeScore(job, strong);
  assert.ok(preferredScore.skills_score >= requiredScore.skills_score);
  assert.ok(baseline.overall_score >= preferredScore.overall_score);
  assert.ok(preferredScore.overall_score > requiredScore.overall_score);
});

test('custom job weights change the overall score', () => {
  const application = scoredApplication();
  const defaultScore = computeScore(job, application);
  const weighted = computeScore({
    ...job,
    scoringWeights: {
      skills: 70,
      experience: 10,
      education: 5,
      certifications: 5,
      projects: 5,
      job_specific: 5,
    },
  }, application);
  assert.equal(weighted.weights.skills, 70);
  assert.notEqual(weighted.skills_score, defaultScore.skills_score);
  assert.equal(weighted.source_hash === defaultScore.source_hash, false);
});

test('produces dimension points that sum toward overall / 100', () => {
  const application = scoredApplication();
  const result = computeScore(job, application);
  const earned = result.skills_score
    + result.experience_score
    + result.education_score
    + result.certification_score
    + result.project_score
    + result.job_specific_score;
  const possible = Object.values(result.dimensions)
    .filter((d) => d.applicable)
    .reduce((sum, d) => sum + d.max, 0);
  assert.equal(result.overall_score, Math.round((earned / possible) * 100));
  assert.ok(result.dimensions.skills.max === 35);
  assert.ok(result.skills_score <= 35);
  assert.ok(result.overall_score >= 0 && result.overall_score <= 100);
  assert.equal(result.match_label, matchLabel(result.overall_score));
  assert.equal(result.recommendation, recommendationFromScore(result.overall_score));
});
