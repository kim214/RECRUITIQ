require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, getDb } = require('./lib/db');
const { authMiddleware } = require('./middleware/auth');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const aiRoutes = require('./routes/aiRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Initialize database once (works for local server + Vercel serverless)
let dbReady = null;
function ensureDb() {
  if (!dbReady) dbReady = initDb();
  return dbReady;
}
app.use(async (_req, _res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    next(err);
  }
});

// Static files (local dev only — Vercel serves frontend via vercel.json)
if (!process.env.VERCEL) {
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.get('/', (_req, res) => {
    res.redirect('/frontend/home/index.html');
  });
}

app.use('/api/auth', authRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.VERCEL ? 'vercel' : 'local' });
});

app.use('/api', authMiddleware);

app.get('/api/stats/admin', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });
    const db = getDb();
    res.json(await db.adminStats());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/stats/employer', async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Access denied' });
    const db = getDb();
    res.json(await db.employerStats(req.user.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Access denied' });
    const db = getDb();
    res.json(await db.getActivity(req.user.id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ai', aiRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
