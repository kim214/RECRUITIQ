const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { resolveUserId } = require('../lib/resolveUser');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const opts = {};
    if (req.user.role === 'applicant') opts.applicantId = userId;
    if (req.user.role === 'employer') opts.employerId = userId;
    if (req.query.jobId) opts.jobId = req.query.jobId;
    const apps = await db.listApplications(opts);
    res.json(apps);
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
    res.json(apps);
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
    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.id);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    res.json(app);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireRole('applicant'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.createApplication(req.user.id, req.body);
    res.status(201).json(app);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/status', requireRole('employer'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status is required' });
    const db = getDb();
    const app = await db.updateApplicationStatus(req.params.id, status, req.user.id);
    res.json(app);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
