const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { analyzeApplication, prepareApplicationContext } = require('../lib/candidateAnalyzer');

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

router.post('/analyze/:applicationId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    const job = await db.getJob(app.jobId);

    const { context, analysis: localAnalysis } = await analyzeWithDocuments(job, app, req);
    const profileText = context.combinedText || app.coverLetter || app.cover_letter || '';

    let result = await callAiService(`/analyze/${req.params.applicationId}`, {
      job,
      application: app,
      profile_text: profileText,
    });

    if (!result) {
      result = { analysis: localAnalysis };
    }

    const analysis = result.analysis || result;
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
    const enrichedApps = [];

    for (const app of apps) {
      const { context, analysis } = await analyzeWithDocuments(job, app, req);
      enrichedApps.push({
        ...app,
        profile_text: context.combinedText,
        documents_reviewed: context.documentMeta?.parsedLabels || [],
        _context: context,
        _analysis: analysis,
      });
    }

    let rankings = await callAiService(`/rank/${req.params.jobId}`, { job, applications: enrichedApps });

    if (!rankings) {
      const results = [];
      for (const app of enrichedApps) {
        await db.saveAnalysis({ application_id: app.id, job_id: job.id, ...app._analysis });
        results.push({ ...app, aiScore: app._analysis.overall_score, analysis: app._analysis });
      }
      results.sort((a, b) => b.aiScore - a.aiScore);
      rankings = { rankings: results };
    } else {
      for (const item of rankings.rankings || []) {
        if (item.analysis) {
          await db.saveAnalysis({
            application_id: item.application_id || item.id,
            job_id: req.params.jobId,
            ...item.analysis,
          });
        }
      }
    }

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
