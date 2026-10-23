const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessApplication, applicantIdOf, jobIdOf } = require('./access');

const app = { id: 'a1', applicantId: 'cand-1', jobId: 'job-9' };

test('applicantIdOf / jobIdOf accept camel or snake case', () => {
  assert.equal(applicantIdOf({ applicant_id: 'x' }), 'x');
  assert.equal(jobIdOf({ job_id: 'y' }), 'y');
  assert.equal(applicantIdOf(app), 'cand-1');
  assert.equal(jobIdOf(app), 'job-9');
});

test('admin can access any application', () => {
  assert.equal(canAccessApplication({ role: 'admin', userId: 'other' }, app), true);
});

test('applicant can only access their own application', () => {
  assert.equal(canAccessApplication({ role: 'applicant', userId: 'cand-1' }, app), true);
  assert.equal(canAccessApplication({ role: 'applicant', userId: 'cand-2' }, app), false);
  assert.equal(canAccessApplication({ role: 'applicant', userId: null }, app), false);
});

test('employer access requires job ownership', () => {
  assert.equal(canAccessApplication({ role: 'employer', userId: 'emp-1' }, app, { ownsJob: true }), true);
  assert.equal(canAccessApplication({ role: 'employer', userId: 'emp-1' }, app, { ownsJob: false }), false);
  assert.equal(canAccessApplication({ role: 'employer', userId: 'emp-1' }, app), false);
});

test('unknown roles and missing applications are denied', () => {
  assert.equal(canAccessApplication({ role: 'guest', userId: 'x' }, app), false);
  assert.equal(canAccessApplication({ role: 'admin', userId: 'x' }, null), false);
});
