const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { prepareApplicationContext } = require('../lib/candidateAnalyzer');
const { analyzeWithOllama, checkOllamaHealth, isOllamaConfigured } = require('../lib/ollamaAnalyzer');

const router = express.Router();

function requestOrigin(req) {
  if (req.headers.origin) return req.headers.origin;
  if (req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      return `${u.protocol}//${u.host}`;
    } catch { /* ignore */ }
  }
  return process.env.PUBLIC_APP_URL || 'http://localhost:3001';
}

async function runAnalysis(job, app, req) {
  const context = await prepareApplicationContext(app, { apiOrigin: requestOrigin(req) });
  const profileText = context.combinedText || app.coverLetter || app.cover_letter || '';

  if (!isOllamaConfigured()) {
    throw new Error('AI is configured for Ollama only. Set LLM_PROVIDER=ollama in backend/.env');
  }

  const analysis = await analyzeWithOllama(job, app, profileText, context.documentMeta);
  return { analysis, context };
}

router.get('/status', requireRole('employer', 'admin'), async (_req, res) => {
  const ollama = await checkOllamaHealth();
  res.json({ llm: ollama, mode: 'ollama-only' });
});

router.post('/analyze/:applicationId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    const job = await db.getJob(app.jobId);

    const { analysis } = await runAnalysis(job, app, req);
    const saved = await db.saveAnalysis({
      application_id: app.id,
      job_id: app.jobId,
      ...analysis,
      ai_summary: analysis.ai_summary || analysis.summary,
    });
    res.json({ analysis: saved, application: await db.getApplication(app.id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/rank/:jobId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const job = await db.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const apps = await db.listApplications({ jobId: req.params.jobId });
    const results = [];

    for (const app of apps) {
      const { analysis } = await runAnalysis(job, app, req);
      await db.saveAnalysis({ application_id: app.id, job_id: job.id, ...analysis });
      results.push({ ...app, aiScore: analysis.overall_score, analysis });
    }

    results.sort((a, b) => b.aiScore - a.aiScore);

    const rankedApps = await db.listApplications({ jobId: req.params.jobId });
    const ranked = rankedApps
      .filter((a) => a.aiScore != null)
      .sort((a, b) => b.aiScore - a.aiScore);

    res.json({ rankings: ranked, job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/rankings/:jobId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const apps = await db.listApplications({ jobId: req.params.jobId });
    const ranked = apps
      .filter((a) => a.aiScore != null)
      .sort((a, b) => b.aiScore - a.aiScore);
    res.json({ rankings: ranked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
