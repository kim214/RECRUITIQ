const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { analyzeApplication, prepareApplicationContext } = require('../lib/candidateAnalyzer');
const { isLlmAvailable, getActiveProviderInfo } = require('../lib/llmAnalyzer');
const { runHybridAnalysis } = require('../lib/hybridAnalyzer');

const router = express.Router();
const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

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

async function callAiService(path, body) {
  if (!process.env.AI_SERVICE_URL && process.env.VERCEL) return null;
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || `AI service error (${res.status})`);
    }
    return res.json();
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      return null;
    }
    throw err;
  }
}

async function analyzeWithDocuments(job, app, req) {
  const context = await prepareApplicationContext(app, { apiOrigin: requestOrigin(req) });
  const analysis = analyzeApplication(job, app, { full_name: app.applicantName }, context);
  return { analysis, context };
}

async function runAnalysis(job, app, req) {
  const { context, analysis: evidenceAnalysis } = await analyzeWithDocuments(job, app, req);
  const profileText = context.combinedText || app.coverLetter || app.cover_letter || '';

  if (isLlmAvailable()) {
    const hybrid = await runHybridAnalysis(job, app, profileText, context.documentMeta, evidenceAnalysis);
    return { analysis: hybrid, context };
  }

  const serviceResult = await callAiService(`/analyze/${app.id}`, {
    job,
    application: app,
    profile_text: profileText,
  });
  if (serviceResult?.analysis) {
    return { analysis: serviceResult.analysis, context };
  }

  return { analysis: evidenceAnalysis, context };
}

router.get('/status', requireRole('employer', 'admin'), (_req, res) => {
  res.json({
    llm: getActiveProviderInfo(),
    pythonServiceUrl: process.env.AI_SERVICE_URL || null,
  });
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
