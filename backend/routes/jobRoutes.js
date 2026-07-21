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
    const { mine, status } = req.query;
    const opts = {};
    if (mine === '1' && req.user.role === 'employer') {
      opts.employerId = await resolveUserId(req);
    }
    if (status) opts.status = status;
    if (req.user.role === 'applicant') opts.openOnly = true;
    const jobs = await db.listJobs(opts);
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

module.exports = router;
