const express = require('express');
const { getDb } = require('../lib/db');
const { signToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role, company } = req.body;
    if (!email || !password || !fullName || !role) {
      return res.status(400).json({ message: 'Email, password, full name, and role are required' });
    }
    if (!['employer', 'applicant'].includes(role)) {
      return res.status(400).json({ message: 'Role must be employer or applicant' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const db = getDb();
    const user = await db.createUser({ email, password, fullName, role, company });
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
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
    const mapped = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      company: user.company,
    };
    const token = signToken(mapped);
    res.json({ token, user: mapped });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.findUserById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'Session expired — please log in again' });
    }
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      company: user.company,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
