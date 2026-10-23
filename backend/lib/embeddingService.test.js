const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cosineSimilarity,
  meanVector,
  collectJobItems,
  collectCandidateItems,
  hasFreshEmbeddings,
  itemsFingerprint,
  compareEmbeddings,
} = require('./embeddingService');

test('cosineSimilarity is 1 for identical vectors and ~0 for orthogonal', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(cosineSimilarity([1, 1], [2, 2]) > 0.99);
});

test('collects job and candidate texts without dropping keyword fields', () => {
  const jobItems = collectJobItems({
    title: 'Python Developer',
    requiredSkills: ['Python', 'SQL'],
    requirementProfile: { preferred_skills: ['Docker'], certifications: ['AWS'] },
  });
  assert.ok(jobItems.some((i) => i.text === 'Python' && i.group === 'skills'));
  assert.ok(jobItems.some((i) => i.group === 'job'));

  const candItems = collectCandidateItems({
    candidateProfile: {
      skills: ['Python'],
      experience: [{ job_title: 'Backend engineer', employer: 'Acme' }],
      projects: [{ name: 'Hiring dashboard' }],
      certifications: ['AWS Cloud Practitioner'],
    },
  });
  assert.ok(candItems.some((i) => i.text === 'Python'));
  assert.ok(candItems.some((i) => i.group === 'experience'));
  assert.ok(candItems.some((i) => i.group === 'projects'));
});

test('hasFreshEmbeddings requires matching hash, model, and vectors', () => {
  const items = [{ key: 'skills:python', group: 'skills', text: 'Python' }];
  const model = 'nomic-embed-text';
  const hash = itemsFingerprint(items, model);
  assert.equal(hasFreshEmbeddings({
    model,
    source_hash: hash,
    items: [{ ...items[0], vector: [0.1, 0.2] }],
  }, items, model), true);
  assert.equal(hasFreshEmbeddings({
    model,
    source_hash: 'old',
    items: [{ ...items[0], vector: [0.1, 0.2] }],
  }, items, model), false);
});

test('compareEmbeddings scores similar skill vectors without replacing keywords', () => {
  const result = compareEmbeddings(
    { model: 'nomic-embed-text', items: [{ group: 'skills', vector: [1, 0] }] },
    { model: 'nomic-embed-text', items: [{ group: 'skills', vector: [0.9, 0.1] }] },
  );
  assert.ok(result.skills > 80);
  assert.equal(result.keyword_matching, 'unchanged');
  assert.equal(meanVector([[2, 0], [0, 2]])[0], 1);
});
