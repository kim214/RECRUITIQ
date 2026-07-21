const { createClient } = require('@supabase/supabase-js');

const BUCKET_NAME = 'resumes';

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isBucketMissingError(err) {
  const msg = (err?.message || err?.error || String(err)).toLowerCase();
  return msg.includes('bucket not found') || msg.includes('not found') && msg.includes('bucket');
}

async function ensureResumesBucket() {
  const supabase = getStorageClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (exists) return { created: false, bucket: BUCKET_NAME };

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ],
  });

  if (createError) {
    const msg = createError.message?.toLowerCase() || '';
    if (msg.includes('already exists')) return { created: false, bucket: BUCKET_NAME };
    throw createError;
  }

  return { created: true, bucket: BUCKET_NAME };
}

function friendlyUploadError(err) {
  if (isBucketMissingError(err)) {
    return (
      'Storage bucket "resumes" is missing in Supabase. ' +
      'Open Supabase → Storage → New bucket → name it "resumes" → set Public → Create. ' +
      'Or run: cd backend && npm run setup:storage'
    );
  }
  return err.message || 'Upload failed';
}

module.exports = {
  BUCKET_NAME,
  getStorageClient,
  ensureResumesBucket,
  friendlyUploadError,
  isBucketMissingError,
};
