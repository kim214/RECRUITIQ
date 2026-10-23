const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { resolveUserId } = require('../lib/resolveUser');
const { assertApplicationAccess } = require('../lib/access');
const { assertOwnedDocumentUrls } = require('../lib/documentUrlPolicy');
const { statusNotification } = require('../lib/hiring');
const { presentApplication, presentApplications, presentPipeline } = require('../lib/privacy');

const router = express.Router();
const APPLICATION_STATUSES = [
  'submitted',
  'ai_screening',
  'shortlisted',
  'interview_scheduled',
  'hired',
  'rejected',
];

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const opts = {};
    if (req.user.role === 'applicant') opts.applicantId = userId;
    else if (req.user.role === 'employer') opts.employerId = userId;
    else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.query.jobId) opts.jobId = req.query.jobId;
    const apps = await db.listApplications(opts);
    res.json(presentApplications(apps, req.user.role));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Must be BEFORE /:id route
router.get('/job/:jobId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const employerId = await resolveUserId(req);
    if (req.user.role === 'employer') {
      const owns = await db.employerOwnsJob(employerId, req.params.jobId);
      if (!owns) {
        return res.status(403).json({
          message: 'This job belongs to another employer account. Log in with the account that posted the job.',
        });
      }
    }
    const apps = await db.listApplications({
      jobId: req.params.jobId,
      employerId: req.user.role === 'employer' ? employerId : undefined,
    });
    res.json(presentApplications(apps, req.user.role));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/pipeline/:jobId', requireRole('employer'), async (req, res) => {
  try {
    const db = getDb();
    const employerId = await resolveUserId(req);
    const owns = await db.employerOwnsJob(employerId, req.params.jobId);
    if (!owns) {
      return res.status(403).json({
        message: 'This job belongs to another employer account. Log in with the account that posted the job.',
      });
    }
    const pipeline = await db.getPipeline(req.params.jobId);
    res.json(presentPipeline(pipeline, req.user.role));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.id);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    await assertApplicationAccess(req, app);
    res.json(presentApplication(app, req.user.role));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.post('/', requireRole('applicant'), async (req, res) => {
  try {
    const db = getDb();
    const applicantId = await resolveUserId(req);
    if (!applicantId) return res.status(401).json({ message: 'Applicant account not found — log in again' });
    assertOwnedDocumentUrls(applicantId, req.body);
    const app = await db.createApplication(applicantId, req.body);
    res.status(201).json(presentApplication(app, req.user.role));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/status', requireRole('employer'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status is required' });
    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid application status' });
    }
    const db = getDb();
    const existing = await db.getApplication(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Application not found' });
    await assertApplicationAccess(req, existing, { action: 'update' });
    const actorId = await resolveUserId(req);
    const app = await db.updateApplicationStatus(req.params.id, status, actorId);
    if (status !== 'interview_scheduled') {
      const note = statusNotification(status, app.jobTitle || existing.jobTitle);
      if (note) {
        try {
          await db.createNotification({
            userId: app.applicantId || existing.applicantId || existing.applicant_id,
            ...note,
            meta: { applicationId: app.id, jobId: app.jobId || existing.jobId },
          });
        } catch (notifyErr) {
          console.warn('Notification skipped:', notifyErr.message);
        }
      }
    }
    res.json(presentApplication(app, req.user.role));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

module.exports = router;
