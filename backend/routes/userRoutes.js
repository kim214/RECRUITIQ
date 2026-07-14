const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const db = getDb();
    const users = await db.listUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
