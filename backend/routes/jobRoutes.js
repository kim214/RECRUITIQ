const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { mine, status } = req.query;
    const opts = {};
    if (mine === '1' && req.user.role === 'employer') opts.employerId = req.user.id;
    if (status) opts.status = status;
    if (req.user.role === 'applicant') opts.openOnly = true;
    const jobs = await db.listJobs(opts);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
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
    const job = await db.createJob(req.user.id, req.body);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
