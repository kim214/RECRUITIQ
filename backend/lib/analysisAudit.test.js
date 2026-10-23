const test = require('node:test');
const assert = require('node:assert/strict');
const { SCORING_VERSION } = require('./scoringEngine');
const {
  ANALYSIS_VERSION,
  buildAudit,
  compactAudit,
  chatModel,
} = require('./analysisAudit');

const application = {
  requirementMatches: {
    items: [
      { requirement: 'Python', status: 'MATCH', priority: 'REQUIRED', category: 'skills' },
      { requirement: 'Docker', status: 'NOT_FOUND', priority: 'PREFERRED', category: 'skills' },
    ],
  },
  scoreBreakdown: {
    scoring_version: SCORING_VERSION,
    overall_score: 86,
    match_label: 'Strong Match',
    skills_score: 32,
  },
  embeddingCache: { model: 'nomic-embed-text' },
};

const analysis = {
  model_version: 'ollama:qwen2.5:7b',
  overall_score: 86,
  scoring_version: SCORING_VERSION,
  score_breakdown: application.scoreBreakdown,
};

test('chatModel strips the ollama: prefix and distinguishes models', () => {
  assert.equal(chatModel({ model_version: 'ollama:qwen2.5:7b' }), 'qwen2.5:7b');
  assert.equal(chatModel({ model_version: 'ollama:llama3.2:3b' }), 'llama3.2:3b');
  assert.notEqual(
    chatModel({ model_version: 'ollama:qwen2.5:7b' }),
    chatModel({ model_version: 'ollama:llama3.2:3b' }),
  );
});

test('buildAudit records model, versions, documents, matches, score, and errors', () => {
  const audit = buildAudit({
    analysis,
    application,
    docMeta: {
      parsedLabels: ['Resume', 'Certificate'],
      failedLabels: ['Transcript'],
      scannedLabels: ['Transcript'],
      truncated: false,
    },
    analyzedAt: '2026-09-16T08:00:00.000Z',
  });
  assert.equal(audit.model, 'qwen2.5:7b');
  assert.equal(audit.embedding_model, 'nomic-embed-text');
  assert.equal(audit.analysis_version, ANALYSIS_VERSION);
  assert.equal(audit.scoring_version, SCORING_VERSION);
  assert.equal(audit.timestamp, '2026-09-16T08:00:00.000Z');
  assert.equal(audit.status, 'completed');
  assert.deepEqual(audit.documents.analyzed, ['Resume', 'Certificate']);
  assert.deepEqual(audit.documents.failed, ['Transcript']);
  assert.equal(audit.matching[0].status, 'MATCH');
  assert.equal(audit.score_breakdown.overall_score, 86);
  assert.ok(audit.errors.some((e) => /Transcript/.test(e)));
  assert.equal(audit.degraded, true);
});

test('Model A and Model B audits are distinguishable', () => {
  const a = buildAudit({ analysis: { ...analysis, model_version: 'ollama:qwen2.5:7b' }, application });
  const b = buildAudit({ analysis: { ...analysis, model_version: 'ollama:llama3.2:3b' }, application });
  assert.notEqual(a.model, b.model);
  assert.equal(a.analysis_version, b.analysis_version);
  assert.equal(a.scoring_version, b.scoring_version);
});

test('failed audit keeps versions without inventing a score', () => {
  const audit = buildAudit({
    status: 'failed',
    errors: ['Ollama unreachable'],
    analyzedAt: '2026-09-16T08:01:00.000Z',
  });
  assert.equal(audit.status, 'failed');
  assert.equal(audit.score_breakdown, null);
  assert.ok(audit.errors.includes('Ollama unreachable'));
  assert.equal(audit.analysis_version, ANALYSIS_VERSION);
  const compact = compactAudit(audit);
  assert.equal(compact.model, audit.model);
  assert.equal(compact.matching, undefined);
});
