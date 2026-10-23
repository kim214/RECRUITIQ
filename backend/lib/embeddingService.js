/**
 * Cached Ollama embeddings for jobs and candidates.
 * Keyword matching stays in place; this adds semantic vectors for later matching.
 */

const crypto = require('crypto');
const aiService = require('./ai/aiService');

function embeddingsEnabled() {
  return Boolean(aiService.getConfig().embeddingModel);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

function meanVector(vectors) {
  const list = (vectors || []).filter((v) => Array.isArray(v) && v.length);
  if (!list.length) return null;
  const dim = list[0].length;
  const out = new Array(dim).fill(0);
  for (const vec of list) {
    if (vec.length !== dim) continue;
    for (let i = 0; i < dim; i++) out[i] += Number(vec[i]) || 0;
  }
  for (let i = 0; i < dim; i++) out[i] /= list.length;
  return out;
}

function bestCosine(jobVectors, candidateVectors) {
  if (!jobVectors?.length || !candidateVectors?.length) return null;
  let best = 0;
  for (const jv of jobVectors) {
    for (const cv of candidateVectors) {
      const score = cosineSimilarity(jv, cv);
      if (score != null && score > best) best = score;
    }
  }
  return best;
}

function collectJobItems(job) {
  const profile = job?.requirementProfile || job?.requirement_profile || {};
  const items = [];
  const push = (group, value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    items.push({ key: `${group}:${text.toLowerCase()}`, group, text });
  };
  for (const s of profile.required_skills || job.requiredSkills || job.required_skills || []) push('skills', s);
  for (const s of profile.preferred_skills || []) push('skills', s);
  for (const s of profile.education_requirements || []) push('education', s);
  if (job.requiredEducation || job.required_education) push('education', job.requiredEducation || job.required_education);
  for (const s of profile.experience_requirements || []) push('experience', s);
  for (const s of profile.certifications || job.requiredCertifications || job.required_certifications || []) push('certifications', s);
  const blob = [job.title, ...(profile.required_skills || job.requiredSkills || [])].filter(Boolean).join('. ');
  if (blob) items.push({ key: 'job:summary', group: 'job', text: blob.slice(0, 500) });
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  }).slice(0, 24);
}

function collectCandidateItems(application) {
  const profile = application?.candidateProfile || application?.candidate_profile || {};
  const supporting = application?.supportingDocuments || application?.supporting_documents || {};
  const items = [];
  const push = (group, value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    items.push({ key: `${group}:${text.toLowerCase()}`, group, text });
  };
  for (const s of profile.skills || []) push('skills', s);
  for (const exp of profile.experience || []) {
    push('experience', [exp.job_title, exp.employer].filter(Boolean).join(' at '));
  }
  for (const p of profile.projects || []) push('projects', p.name || p.description);
  for (const c of profile.certifications || []) push('certifications', c);
  for (const c of supporting.certificates || []) push('certifications', c.certificate);
  const blob = [
    profile.candidate?.name,
    ...(profile.skills || []),
    ...(profile.experience || []).map((e) => e.job_title),
  ].filter(Boolean).join('. ');
  if (blob) items.push({ key: 'candidate:summary', group: 'candidate', text: blob.slice(0, 500) });
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  }).slice(0, 24);
}

function itemsFingerprint(items, model) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ model, items: items.map((i) => i.key) }))
    .digest('hex')
    .slice(0, 24);
}

function hasFreshEmbeddings(cache, items, model) {
  if (!cache || cache.model !== model || !Array.isArray(cache.items) || !cache.items.length) return false;
  if (!cache.items.every((i) => Array.isArray(i.vector) && i.vector.length)) return false;
  return cache.source_hash === itemsFingerprint(items, model);
}

async function embedItems(items) {
  const model = aiService.getConfig().embeddingModel;
  if (!model || !items.length) return null;
  const texts = items.map((i) => i.text);
  let vectors;
  try {
    const result = await aiService.embeddings({ input: texts });
    vectors = result.embeddings;
  } catch (err) {
    vectors = [];
    for (const text of texts) {
      const result = await aiService.embeddings({ input: text });
      vectors.push(result.embeddings[0]);
    }
  }
  if (!vectors || vectors.length !== items.length) {
    throw new Error('Embedding count did not match input texts');
  }
  return {
    model,
    source_hash: itemsFingerprint(items, model),
    analyzed_at: new Date().toISOString(),
    items: items.map((item, i) => ({ ...item, vector: vectors[i] })),
  };
}

function compareEmbeddings(jobCache, candidateCache) {
  const jobItems = jobCache?.items || [];
  const candItems = candidateCache?.items || [];
  if (!jobItems.length || !candItems.length) return null;

  const byGroup = (items, group) => items.filter((i) => i.group === group).map((i) => i.vector);
  const skills = bestCosine(byGroup(jobItems, 'skills'), byGroup(candItems, 'skills'));
  const experience = bestCosine(byGroup(jobItems, 'experience'), byGroup(candItems, 'experience'));
  const certifications = bestCosine(byGroup(jobItems, 'certifications'), byGroup(candItems, 'certifications'));
  const jobMean = meanVector(jobItems.map((i) => i.vector));
  const candMean = meanVector(candItems.map((i) => i.vector));
  const overall = cosineSimilarity(jobMean, candMean);

  const toPct = (n) => (n == null ? null : Math.round(Math.max(0, Math.min(1, n)) * 100));
  return {
    skills: toPct(skills),
    experience: toPct(experience),
    certifications: toPct(certifications),
    overall: toPct(overall),
    model: jobCache.model || candidateCache.model,
    keyword_matching: 'unchanged',
  };
}

async function ensureJobEmbeddings(db, job) {
  if (!job || !embeddingsEnabled()) return job;
  const items = collectJobItems(job);
  const model = aiService.getConfig().embeddingModel;
  const cache = job.embeddingCache || job.embedding_cache;
  if (hasFreshEmbeddings(cache, items, model) || !items.length) {
    return { ...job, embeddingCache: cache || job.embeddingCache };
  }
  try {
    const next = await embedItems(items);
    if (db?.updateJob) return db.updateJob(job.id, { embeddingCache: next });
    return { ...job, embeddingCache: next, embedding_cache: next };
  } catch (err) {
    console.error(`Job embeddings failed (${job.id || job.title}):`, err.message);
    return job;
  }
}

async function ensureCandidateEmbeddings(db, application) {
  if (!application || !embeddingsEnabled()) return application;
  const items = collectCandidateItems(application);
  const model = aiService.getConfig().embeddingModel;
  const cache = application.embeddingCache || application.embedding_cache;
  if (hasFreshEmbeddings(cache, items, model) || !items.length) {
    return { ...application, embeddingCache: cache || application.embeddingCache };
  }
  try {
    const next = await embedItems(items);
    if (db?.updateApplication) return db.updateApplication(application.id, { embeddingCache: next });
    return { ...application, embeddingCache: next, embedding_cache: next };
  } catch (err) {
    console.error(`Candidate embeddings failed (${application.id}):`, err.message);
    return application;
  }
}

module.exports = {
  embeddingsEnabled,
  cosineSimilarity,
  meanVector,
  bestCosine,
  collectJobItems,
  collectCandidateItems,
  itemsFingerprint,
  hasFreshEmbeddings,
  embedItems,
  compareEmbeddings,
  ensureJobEmbeddings,
  ensureCandidateEmbeddings,
};
