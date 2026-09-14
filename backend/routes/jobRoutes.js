const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { resolveUserId } = require('../lib/resolveUser');

const router = express.Router();

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
}

router.get('/', async (req, res) => {
  try {
    noCache(res);
    const db = getDb();
    const opts = {};

    if (req.user.role === 'employer') {
      const employerId = await resolveUserId(req);
      if (!employerId) return res.status(401).json({ message: 'Employer account not found — log in again' });
      opts.employerId = employerId;
    } else if (req.user.role === 'applicant') {
      opts.excludeDraft = true;
    }

    if (req.query.status && req.user.role !== 'applicant') {
      opts.status = req.query.status;
    }

    const jobs = await db.listJobs(opts);
    if (req.user.role === 'applicant') {
      jobs.sort((a, b) => Number(!!b.acceptingApplications) - Number(!!a.acceptingApplications));
    }
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/mine', requireRole('employer'), async (req, res) => {
  try {
    noCache(res);
    const db = getDb();
    const employerId = await resolveUserId(req);
    if (!employerId) return res.status(401).json({ message: 'Employer account not found — log in again' });
    const jobs = await db.listJobs({ employerId });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    noCache(res);
    const db = getDb();
    const job = await db.getJob(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (req.user.role === 'employer') {
      const employerId = await resolveUserId(req);
      const owns = await db.employerOwnsJob(employerId, job.id);
      if (!owns) {
        return res.status(403).json({ message: 'You can only view jobs you created.' });
      }
    } else if (req.user.role === 'applicant' && job.status === 'draft') {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireRole('employer'), async (req, res) => {
  try {
    const db = getDb();
    const employerId = await resolveUserId(req);
    if (!employerId) return res.status(401).json({ message: 'Employer account not found — log in again' });
    const job = await db.createJob(employerId, req.body);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id', requireRole('admin', 'employer'), async (req, res) => {
  try {
    const { status, applicationDeadline } = req.body;
    if (status && !['open', 'closed', 'draft'].includes(status)) {
      return res.status(400).json({ message: 'Invalid job status' });
    }
    const db = getDb();
    const job = await db.getJob(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (req.user.role === 'employer') {
      const employerId = await resolveUserId(req);
      const owns = await db.employerOwnsJob(employerId, job.id);
      if (!owns) {
        return res.status(403).json({ message: 'You can only update jobs you created.' });
      }
      if (status && !['open', 'closed'].includes(status)) {
        return res.status(400).json({ message: 'Employers can only open or close their own jobs.' });
      }
    }

    const patch = {};
    if (status) patch.status = status;
    if (applicationDeadline !== undefined) patch.applicationDeadline = applicationDeadline;
    res.json(await db.updateJob(req.params.id, patch));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const db = getDb();
    const job = await db.getJob(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    await db.deleteJob(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
