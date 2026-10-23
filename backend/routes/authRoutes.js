const express = require('express');
const { getDb } = require('../lib/db');
const { signToken, authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../lib/rateLimit');
const { applicantCodeOf } = require('../lib/privacy');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name || user.fullName,
    role: user.role,
    status: user.status || 'active',
    company: user.company,
    applicantCode: user.role === 'applicant' ? applicantCodeOf(user) : null,
  };
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, fullName, role, company } = req.body;
    if (!email || !password || !fullName || !role) {
      return res.status(400).json({ message: 'Email, password, full name, and role are required' });
    }
    if (!['employer', 'applicant'].includes(role)) {
      return res.status(400).json({ message: 'Role must be employer or applicant' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const db = getDb();
    const user = await db.createUser({ email, password, fullName, role, company });
    const mapped = publicUser(user);
    const token = signToken(mapped);
    res.status(201).json({ token, user: mapped });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const db = getDb();
    const user = await db.findUserByEmail(email);
    if (!user || !(await db.verifyPassword(user, password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if ((user.status || 'active') === 'banned') {
      return res.status(403).json({ message: 'Your account has been suspended. Contact an administrator.' });
    }
    const mapped = publicUser(user);
    const token = signToken(mapped);
    res.json({ token, user: mapped });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    let user = await db.findUserById(req.user.id);
    if (!user && req.user.email) {
      user = await db.findUserByEmail(req.user.email);
    }
    if (!user) {
      return res.status(401).json({ message: 'Session expired — please log in again' });
    }
    if ((user.status || 'active') === 'banned') {
      return res.status(401).json({ message: 'Your account has been suspended. Contact an administrator.' });
    }
    const mapped = publicUser(user);
    const token = signToken({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    });
    res.json({ ...mapped, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
