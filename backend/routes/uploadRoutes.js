const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole } = require('../middleware/auth');
const {
  BUCKET_NAME,
  getStorageClient,
  ensureResumesBucket,
  friendlyUploadError,
  isBucketMissingError,
} = require('../lib/storage');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const useSupabaseStorage = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

let bucketReady = false;
let bucketInitPromise = null;

async function initBucketOnce() {
  if (bucketReady) return;
  if (!bucketInitPromise) {
    bucketInitPromise = ensureResumesBucket()
      .then(() => { bucketReady = true; })
      .catch((err) => {
        bucketInitPromise = null;
        throw err;
      });
  }
  await bucketInitPromise;
}

async function uploadToSupabase(userId, file, folder) {
  const supabase = getStorageClient();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured.');
  }

  await initBucketOnce();

  const ext = path.extname(file.originalname);
  const filename = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  let { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false });

  if (error && isBucketMissingError(error)) {
    bucketReady = false;
    bucketInitPromise = null;
    await initBucketOnce();
    ({ data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false }));
  }

  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);
  return urlData.publicUrl;
}

// Local disk storage (development)
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* Vercel has read-only fs */ }
}

const diskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.user.id);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: (process.env.VERCEL || useSupabaseStorage) ? memoryStorage : diskStorage,
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
]), async (req, res) => {
  try {
    const urls = {};

    if (process.env.VERCEL || useSupabaseStorage) {
      if (!useSupabaseStorage) {
        return res.status(500).json({
          message: 'File upload requires Supabase on Vercel. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel env vars, then create a public "resumes" storage bucket.',
        });
      }
      if (req.files?.resume?.[0]) {
        urls.resumeUrl = await uploadToSupabase(req.user.id, req.files.resume[0], 'resume');
      }
      if (req.files?.transcript?.[0]) {
        urls.transcriptUrl = await uploadToSupabase(req.user.id, req.files.transcript[0], 'transcript');
      }
      if (req.files?.certificates?.length) {
        urls.certificatesUrl = await Promise.all(
          req.files.certificates.map((f, i) => uploadToSupabase(req.user.id, f, `cert-${i}`)),
        );
      }
    } else {
      const base = `/uploads/${req.user.id}`;
      if (req.files?.resume?.[0]) urls.resumeUrl = `${base}/${req.files.resume[0].filename}`;
      if (req.files?.transcript?.[0]) urls.transcriptUrl = `${base}/${req.files.transcript[0].filename}`;
      if (req.files?.certificates?.length) {
        urls.certificatesUrl = req.files.certificates.map((f) => `${base}/${f.filename}`);
      }
    }

    res.json(urls);
  } catch (err) {
    res.status(500).json({ message: friendlyUploadError(err) });
  }
});

module.exports = router;
