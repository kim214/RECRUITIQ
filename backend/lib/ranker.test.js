const test = require('node:test');
const assert = require('node:assert/strict');
const { rankApplications, rankingScore } = require('./ranker');

test('ranks by deterministic score descending with Strong/Good/Potential labels', () => {
  const ranked = rankApplications([
    { id: '4', applicantName: 'Mary Wanjiku', scoreBreakdown: { overall_score: 73, match_label: 'Potential Match' } },
    { id: '1', applicantName: 'Jane Doe', scoreBreakdown: { overall_score: 94, match_label: 'Strong Match' } },
    { id: '3', applicantName: 'Peter Smith', scoreBreakdown: { overall_score: 82, match_label: 'Good Match' } },
    { id: '2', applicantName: 'John Doe', scoreBreakdown: { overall_score: 89, match_label: 'Good Match' } },
  ]);
  assert.deepEqual(ranked.map((r) => [r.rank, r.applicantName, r.aiScore, r.matchLabel]), [
    [1, 'Jane Doe', 94, 'Strong Match'],
    [2, 'John Doe', 89, 'Good Match'],
    [3, 'Peter Smith', 82, 'Good Match'],
    [4, 'Mary Wanjiku', 73, 'Potential Match'],
  ]);
});

test('prefers score_breakdown over an LLM overall_score', () => {
  const app = {
    applicantName: 'A',
    aiScore: 99,
    analysis: { overallScore: 99, matchLabel: 'Strong Match' },
    scoreBreakdown: { overall_score: 61, match_label: 'Potential Match' },
  };
  assert.equal(rankingScore(app), 61);
  const ranked = rankApplications([
    app,
    { applicantName: 'B', scoreBreakdown: { overall_score: 80, match_label: 'Good Match' } },
  ]);
  assert.equal(ranked[0].applicantName, 'B');
  assert.equal(ranked[1].aiScore, 61);
  assert.equal(ranked[1].matchLabel, 'Potential Match');
});

test('equal scores sort by name and stay stable', () => {
  const rows = [
    { applicantName: 'Zed', scoreBreakdown: { overall_score: 70 } },
    { applicantName: 'Ann', scoreBreakdown: { overall_score: 70 } },
  ];
  const a = rankApplications(rows);
  const b = rankApplications(rows);
  assert.equal(a[0].applicantName, 'Ann');
  assert.equal(a[1].applicantName, 'Zed');
  assert.deepEqual(a.map((r) => r.applicantName), b.map((r) => r.applicantName));
});

test('unscored candidates are omitted', () => {
  const ranked = rankApplications([
    { applicantName: 'Done', scoreBreakdown: { overall_score: 50 } },
    { applicantName: 'Pending' },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].applicantName, 'Done');
  assert.equal(ranked[0].rank, 1);
});
