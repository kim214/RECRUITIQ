const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { resolveUserId } = require('../lib/resolveUser');
const { findEvidenceFor } = require('../lib/evidenceBuilder');
const { checkVmIntegrations } = require('../lib/vmHealth');
const { enqueue, enqueueMany, resumeIfNeeded } = require('../lib/analysisQueue');
const { rankApplications } = require('../lib/ranker');
const { isTerminal } = require('../lib/analysisStatus');
const { createRateLimiter } = require('../lib/rateLimit');
const { presentApplication, presentApplications } = require('../lib/privacy');

const router = express.Router();
const aiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT || 40),
  message: 'Too many analysis requests. Try again in a minute.',
});

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

async function assertCanAnalyze(req, app, job) {
  if (!app) {
    const err = new Error('Application not found');
    err.status = 404;
    throw err;
  }
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  if (req.user.role === 'employer') {
    const employerId = await resolveUserId(req);
    const db = getDb();
    const owns = await db.employerOwnsJob(employerId, job.id);
    if (!owns) {
      const err = new Error('You can only analyze applicants for jobs you created.');
      err.status = 403;
      throw err;
    }
  }
}

function httpErrorMessage(err) {
  return err?.message || err?.details || err?.hint || 'Internal server error';
}

router.get('/status', requireRole('employer', 'admin'), async (_req, res) => {
  try {
    const status = await checkVmIntegrations();
    res.json({
      ...status,
      llm: status.llm,
      mode: 'ollama-only',
    });
  } catch (err) {
    res.status(500).json({ message: httpErrorMessage(err) });
  }
});

router.get('/evidence/:applicationId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    const job = await db.getJob(app.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (req.user.role === 'employer') {
      const employerId = await resolveUserId(req);
      const owns = await db.employerOwnsJob(employerId, job.id);
      if (!owns) return res.status(403).json({ message: 'You can only view evidence for jobs you created.' });
    }
    const q = req.query.q || req.query.skill || '';
    const items = findEvidenceFor(app, q);
    const sealed = presentApplication({ ...app, evidence: { items } }, req.user.role);
    res.json({
      applicationId: app.id,
      query: q || null,
      items: sealed.evidence?.items || items,
      question: q
        ? `Why did RecruitIQ say this candidate has ${q}?`
        : 'Supporting evidence for extracted claims',
    });
  } catch (err) {
    res.status(500).json({ message: httpErrorMessage(err) });
  }
});

router.get('/progress/:applicationId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    const job = await db.getJob(app.jobId);
    await assertCanAnalyze(req, app, job);
    const status = await resumeIfNeeded(db, app.id, requestOrigin(req), { req, res });
    const latest = await db.getApplication(app.id);
    res.json({
      applicationId: app.id,
      queued: !isTerminal(status),
      analysisStatus: status || latest?.analysisStatus || null,
      application: presentApplication(latest, req.user.role),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: httpErrorMessage(err) });
  }
});

router.post('/analyze/:applicationId', aiLimiter, requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.applicationId);
    const job = app ? await db.getJob(app.jobId) : null;
    await assertCanAnalyze(req, app, job);

    const analysisStatus = await enqueue(db, {
      applicationId: app.id,
      jobId: job.id,
      origin: requestOrigin(req),
      force: req.query.force === '1' || req.body?.force === true,
    }, { req, res });

    const queued = analysisStatus?.state === 'queued' || analysisStatus?.state === 'processing';
    res.status(queued ? 202 : 200).json({
      queued,
      cached: Boolean(analysisStatus?.cached) || analysisStatus?.state === 'completed',
      applicationId: app.id,
      analysisStatus,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: httpErrorMessage(err) });
  }
});

router.post('/rank/:jobId', aiLimiter, requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const job = await db.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (req.user.role === 'employer') {
      const employerId = await resolveUserId(req);
      const owns = await db.employerOwnsJob(employerId, job.id);
      if (!owns) return res.status(403).json({ message: 'You can only rank candidates for jobs you created.' });
    }

    const apps = await db.listApplications({ jobId: req.params.jobId });
    const origin = requestOrigin(req);
    const batchId = req.params.jobId;
    const force = req.query.force === '1' || req.body?.force === true;
    const result = await enqueueMany(db, apps.map((app) => ({
      applicationId: app.id,
      jobId: job.id,
      origin,
      batchId,
      force,
    })), { req, res });

    res.status(result.queued ? 202 : 200).json({
      queued: result.queued > 0,
      jobId: job.id,
      count: result.queued,
      reused: result.reused,
    });
  } catch (err) {
    res.status(500).json({ message: httpErrorMessage(err) });
  }
});

router.get('/rankings/:jobId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    if (req.user.role === 'employer') {
      const employerId = await resolveUserId(req);
      const owns = await db.employerOwnsJob(employerId, req.params.jobId);
      if (!owns) return res.status(403).json({ message: 'You can only view rankings for jobs you created.' });
    }
    const apps = await db.listApplications({ jobId: req.params.jobId });
    const ranked = presentApplications(rankApplications(apps), req.user.role);
    const pending = presentApplications(
      apps.filter((a) => a.analysisStatus?.state === 'queued' || a.analysisStatus?.state === 'processing'),
      req.user.role,
    );
    res.json({
      rankings: ranked,
      pending: pending.map((a) => ({
        id: a.id,
        applicantName: a.applicantName,
        applicantCode: a.applicantCode,
        analysisStatus: a.analysisStatus,
      })),
      queued: pending.length > 0,
    });
  } catch (err) {
    res.status(500).json({ message: httpErrorMessage(err) });
  }
});

module.exports = router;
