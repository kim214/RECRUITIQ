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
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (_req, res) => {
  res.redirect('/frontend/home/index.html');
});

app.use('/api/auth', authRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Reqruit IQ API running at http://localhost:${PORT}`);
    console.log(`Open app: http://localhost:${PORT}/frontend/home/index.html`);
    console.log('Demo accounts:');
    console.log('  admin@reqruit.com / admin123');
    console.log('  nathankimutai59@gmail.com (employer — your account)');
    console.log('  applicant@reqruit.com / applicant123');
  });
}

start();
