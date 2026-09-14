require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, getDb } = require('./lib/db');
const { authMiddleware } = require('./middleware/auth');
const { resolveUserId } = require('./lib/resolveUser');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const aiRoutes = require('./routes/aiRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

const app = express();

app.use(cors());
app.use(express.json());

let dbReady = null;
function ensureDb() {
  if (!dbReady) dbReady = initDb();
  return dbReady;
}
app.use(async (_req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.VERCEL ? 'vercel' : 'local' });
});

app.use('/api', authMiddleware);
app.use('/api', async (req, res, next) => {
  try {
    const db = getDb();
    let user = null;
    if (req.user.email) {
      user = await db.findUserByEmail(String(req.user.email).trim().toLowerCase());
    }
    if (!user && req.user.id) {
      user = await db.findUserById(req.user.id);
    }
    if (user && (user.status || 'active') === 'banned') {
      return res.status(401).json({ message: 'Your account has been suspended. Contact an administrator.' });
    }
    next();
  } catch (err) {
    next(err);
  }
});

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
    const employerId = await resolveUserId(req);
    res.set('Cache-Control', 'no-store');
    res.json(await db.employerStats(employerId));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Access denied' });
    const db = getDb();
    const employerId = await resolveUserId(req);
    res.set('Cache-Control', 'no-store');
    res.json(await db.getActivity(employerId));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ai', aiRoutes);

if (!process.env.VERCEL) {
  const dist = path.join(__dirname, '..', 'client', 'dist');
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
