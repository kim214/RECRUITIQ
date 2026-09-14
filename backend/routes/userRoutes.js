const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { notifyRoleChanged, notifyAccountCreated, notifyAccountStatus } = require('../lib/mailer');

const router = express.Router();
const ROLES = ['admin', 'employer', 'applicant'];

function generatePassword() {
  return crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, 'x').slice(0, 14);
}

function activeAdmins(users) {
  return users.filter((u) => u.role === 'admin' && (u.status || 'active') === 'active');
}

router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const db = getDb();
    const users = await db.listUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { email, password, fullName, role, company } = req.body;
    if (!email || !fullName || !role) {
      return res.status(400).json({ message: 'Email, full name, and role are required' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role must be admin, employer, or applicant' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const temporaryPassword = password || generatePassword();
    const db = getDb();
    const user = await db.createUser({ email, password: temporaryPassword, fullName, role, company });
    let emailSent = false;
    try {
      emailSent = !!(await notifyAccountCreated(user, temporaryPassword)).sent;
    } catch (err) {
      console.error('Welcome email failed:', err.message);
    }
    res.status(201).json({ user, temporaryPassword, emailSent });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { role, status, fullName, company } = req.body;
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (status && !['active', 'banned'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or banned' });
    }

    const db = getDb();
    const existing = await db.findUserById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'User not found' });

    if (req.params.id === req.user.id) {
      if (status === 'banned') return res.status(400).json({ message: 'You cannot suspend your own account' });
      if (role && role !== 'admin') return res.status(400).json({ message: 'You cannot remove your own admin role' });
    }

    const demotingAdmin = existing.role === 'admin' && ((role && role !== 'admin') || status === 'banned');
    if (demotingAdmin) {
      const users = await db.listUsers();
      if (activeAdmins(users).length <= 1) {
        return res.status(400).json({ message: 'Cannot demote or suspend the last active admin' });
      }
    }

    const previousRole = existing.role;
    const previousStatus = existing.status || 'active';
    const user = await db.updateUser(req.params.id, { role, status, fullName, company });

    let emailSent = false;
    if (role && role !== previousRole) {
      try {
        emailSent = !!(await notifyRoleChanged(user, previousRole, role)).sent || emailSent;
      } catch (err) {
        console.error('Role-change email failed:', err.message);
      }
    }
    if (status && status !== previousStatus) {
      try {
        emailSent = !!(await notifyAccountStatus(user, status === 'banned')).sent || emailSent;
      } catch (err) {
        console.error('Status email failed:', err.message);
      }
    }

    res.json({ ...user, emailSent });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const db = getDb();
    const existing = await db.findUserById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'User not found' });
    if (existing.role === 'admin') {
      const users = await db.listUsers();
      if (activeAdmins(users).length <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last active admin' });
      }
    }
    await db.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
