const test = require('node:test');
const assert = require('node:assert/strict');
const { STEPS, buildStatus, isTerminal, isActive, stepLabel } = require('./analysisStatus');
const { createMemoryQueue, claimApplication, isClaimed, releaseApplication } = require('./analysisQueue');

test('pipeline steps cover queued through completed', () => {
  assert.deepEqual(STEPS, [
    'QUEUED',
    'PROCESSING_DOCUMENTS',
    'EXTRACTING_INFORMATION',
    'ANALYZING_REQUIREMENTS',
    'MATCHING_CANDIDATE',
    'CALCULATING_SCORE',
    'COMPLETED',
  ]);
  assert.equal(stepLabel('PROCESSING_DOCUMENTS'), 'Processing documents');
  assert.equal(stepLabel('ANALYZING_REQUIREMENTS'), 'Analyzing requirements');
});

test('buildStatus maps steps to queued / processing / completed', () => {
  assert.equal(buildStatus('QUEUED').state, 'queued');
  assert.equal(buildStatus('MATCHING_CANDIDATE').state, 'processing');
  assert.equal(buildStatus('COMPLETED').state, 'completed');
  assert.equal(isTerminal(buildStatus('COMPLETED')), true);
  assert.equal(isActive(buildStatus('QUEUED')), true);
  const failed = buildStatus('CALCULATING_SCORE', { state: 'failed', error: 'timeout', audit: { model: 'qwen2.5:7b' } });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.error, 'timeout');
  const detailed = buildStatus('EXTRACTING_INFORMATION', { detail: 'Extracting the candidate profile' });
  assert.equal(detailed.detail, 'Extracting the candidate profile');
  assert.equal(detailed.state, 'processing');
  assert.equal(failed.audit.model, 'qwen2.5:7b');
  assert.equal(isTerminal(failed), true);
});

test('memory queue runs jobs one at a time', async () => {
  const seen = [];
  const q = createMemoryQueue(async (job) => {
    seen.push(`start:${job.id}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
    seen.push(`end:${job.id}`);
  });
  await q.enqueue({ id: 'a' });
  await q.enqueue({ id: 'b' });
  await q.idle();
  assert.deepEqual(q.log, ['start:a', 'end:a', 'start:b', 'end:b']);
  assert.deepEqual(seen, ['start:a', 'end:a', 'start:b', 'end:b']);
});

test('claimApplication prevents a second enqueue of the same application', () => {
  const id = 'claim-test-app';
  assert.equal(claimApplication(id), true);
  assert.equal(claimApplication(id), false);
  assert.equal(isClaimed(id), true);
  releaseApplication(id);
  assert.equal(isClaimed(id), false);
  assert.equal(claimApplication(id), true);
  releaseApplication(id);
});
