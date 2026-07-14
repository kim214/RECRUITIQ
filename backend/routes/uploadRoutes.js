const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.user.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, PNG, JPG files allowed'));
  },
});

router.post('/', requireRole('applicant'), upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'transcript', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]), (req, res) => {
  const base = `/uploads/${req.user.id}`;
  const urls = {};
  if (req.files?.resume?.[0]) urls.resumeUrl = `${base}/${req.files.resume[0].filename}`;
  if (req.files?.transcript?.[0]) urls.transcriptUrl = `${base}/${req.files.transcript[0].filename}`;
  if (req.files?.certificates?.length) {
    urls.certificatesUrl = req.files.certificates.map((f) => `${base}/${f.filename}`);
  }
  res.json(urls);
});

module.exports = router;
