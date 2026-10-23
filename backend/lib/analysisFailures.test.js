const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyError,
  partialDocumentNotes,
  applyPartialDocumentNotes,
  fallbackNarrative,
  narrativeFromMatches,
  isFastAnalysis,
} = require('./analysisFailures');

test('partial transcript failure does not imply a total failure', () => {
  const notes = partialDocumentNotes({
    parsedCount: 2,
    parsedLabels: ['Resume', 'Certificate 1'],
    failedLabels: ['Transcript'],
  });
  assert.deepEqual(notes, [
    'Transcript could not be analyzed.',
    'Analysis is based on available documents.',
  ]);
});

test('classifyError maps timeout, Ollama, JSON, OCR, PDF, and database cases', () => {
  assert.equal(classifyError({ name: 'TimeoutError', message: 'aborted' }).code, 'timeout');
  assert.equal(classifyError(new Error('Ollama unreachable at http://x')).code, 'ollama_unavailable');
  assert.equal(classifyError(new Error('Ollama did not return JSON')).code, 'invalid_json');
  assert.equal(classifyError(new Error('OCR failed')).code, 'ocr_failure');
  assert.equal(classifyError(new Error('PDF is corrupt')).code, 'corrupt_document');
  assert.equal(classifyError(new Error('Database is missing analysis_audit')).code, 'database_failure');
});

test('applyPartialDocumentNotes keeps existing analysis and adds recruiter copy', () => {
  const next = applyPartialDocumentNotes(
    { summary: 'Strong Python background.', weaknesses: ['Missing AWS'] },
    { parsedCount: 1, parsedLabels: ['Resume'], failedLabels: ['Transcript'] },
  );
  assert.equal(next.partial_documents, true);
  assert.ok(next.weaknesses.includes('Missing AWS'));
  assert.ok(next.weaknesses.includes('Transcript could not be analyzed.'));
  assert.match(next.summary, /Analysis is based on available documents/);
});

test('narrativeFromMatches summarizes matcher output without inventing a score', () => {
  const narrative = narrativeFromMatches(
    {
      requirementMatches: {
        items: [
          { status: 'MATCH', requirement: 'Python' },
          { status: 'PARTIAL_MATCH', requirement: 'AWS' },
          { status: 'NOT_FOUND', requirement: 'Kubernetes' },
        ],
      },
    },
    { overall_score: 72, match_label: 'Good Match' },
    { parsedCount: 1, parsedLabels: ['Resume'], failedLabels: [] },
  );
  assert.equal(narrative.overall_score, null);
  assert.equal(narrative.model_version, 'matcher');
  assert.match(narrative.summary, /72/);
  assert.ok(narrative.strengths.some((item) => /Python/.test(item)));
  assert.ok(narrative.weaknesses.some((item) => /Kubernetes/.test(item)));
});

test('isFastAnalysis defaults on and can be turned off', () => {
  const prev = process.env.ANALYSIS_FAST;
  delete process.env.ANALYSIS_FAST;
  assert.equal(isFastAnalysis(), true);
  process.env.ANALYSIS_FAST = '0';
  assert.equal(isFastAnalysis(), false);
  process.env.ANALYSIS_FAST = 'false';
  assert.equal(isFastAnalysis(), false);
  process.env.ANALYSIS_FAST = '1';
  assert.equal(isFastAnalysis(), true);
  if (prev === undefined) delete process.env.ANALYSIS_FAST;
  else process.env.ANALYSIS_FAST = prev;
});

test('fallbackNarrative never invents a score', () => {
  const narrative = fallbackNarrative(
    { parsedCount: 1, parsedLabels: ['Resume'], failedLabels: ['Transcript'] },
    { code: 'timeout', message: 'The request timed out.' },
  );
  assert.equal(narrative.overall_score, null);
  assert.equal(narrative.narrative_degraded, true);
  assert.ok(narrative.weaknesses.includes('Transcript could not be analyzed.'));
  assert.match(narrative.weaknesses.join(' '), /timed out/);
});
