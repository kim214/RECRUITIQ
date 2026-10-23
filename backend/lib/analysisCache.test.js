const test = require('node:test');
const assert = require('node:assert/strict');
const { ANALYSIS_VERSION } = require('./analysisAudit');
const { SCORING_VERSION } = require('./scoringEngine');
const {
  documentsFingerprint,
  cacheKeys,
  staleReason,
  hasFreshAnalysis,
} = require('./analysisCache');

const job = {
  title: 'Python Developer',
  description: 'Build APIs',
  requiredSkills: ['Python'],
  scoringWeights: { skills: 35, experience: 25, education: 15, certifications: 10, projects: 10, job_specific: 5 },
};

function analyzedApp(overrides = {}) {
  const base = {
    resumeUrl: '/uploads/a/resume.pdf',
    transcriptUrl: '/uploads/a/transcript.pdf',
    certificatesUrl: ['/uploads/a/cert.pdf'],
    coverLetter: 'I use Python daily.',
    aiScore: 86,
    scoreBreakdown: { overall_score: 86, scoring_version: SCORING_VERSION },
    analysisStatus: { state: 'completed', step: 'COMPLETED' },
  };
  const keys = cacheKeys(job, { ...base, ...overrides });
  return {
    ...base,
    ...overrides,
    analysis: {
      overallScore: 86,
      audit: { ...keys, ...(overrides.analysis?.audit || {}) },
    },
  };
}

test('new document invalidates cache', () => {
  const app = analyzedApp();
  assert.equal(hasFreshAnalysis(app, job), true);
  const updated = analyzedApp({ resumeUrl: '/uploads/a/resume-v2.pdf' });
  updated.analysis.audit = app.analysis.audit;
  assert.equal(staleReason(updated, job), 'documents');
});

test('changed job requirements invalidate cache', () => {
  const app = analyzedApp();
  const changed = { ...job, description: 'Now also requires FastAPI' };
  assert.equal(staleReason(app, changed), 'job');
});

test('changed scoring weights only require a rescore', () => {
  const app = analyzedApp();
  const changed = { ...job, scoringWeights: { ...job.scoringWeights, skills: 50, experience: 10 } };
  assert.equal(staleReason(app, changed), 'scoring');
});

test('new analysis version invalidates cache', () => {
  const app = analyzedApp();
  app.analysis.audit.analysis_version = 'm0-old';
  app.analysis.audit.input_hash = 'stale';
  assert.equal(staleReason(app, job), 'analysis_version');
});

test('missing completed analysis is not treated as fresh', () => {
  assert.equal(staleReason({ resumeUrl: '/x' }, job), 'missing');
  assert.equal(staleReason(analyzedApp({ analysisStatus: { state: 'failed' }, aiScore: 10 }), job), 'missing');
});

test('documentsFingerprint changes when a URL or cover letter changes', () => {
  const a = documentsFingerprint({ resumeUrl: 'a', coverLetter: 'x' });
  const b = documentsFingerprint({ resumeUrl: 'b', coverLetter: 'x' });
  const c = documentsFingerprint({ resumeUrl: 'a', coverLetter: 'y' });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(cacheKeys(job, { resumeUrl: 'a' }).analysis_version, ANALYSIS_VERSION);
});
