/**
 * Creates the public "resumes" bucket in Supabase Storage (required for Vercel uploads).
 * Usage: cd backend && npm run setup:storage
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ensureResumesBucket } = require('../lib/storage');

(async () => {
  try {
    console.log('Checking Supabase Storage...');
    const result = await ensureResumesBucket();
    if (result.created) {
      console.log(`Created public bucket "${result.bucket}" successfully.`);
    } else {
      console.log(`Bucket "${result.bucket}" already exists.`);
    }
    console.log('Applicant document uploads should work on Vercel now.');
    process.exit(0);
  } catch (err) {
    console.error('Setup failed:', err.message);
    console.error('\nManual fix: Supabase Dashboard → Storage → New bucket → name: resumes → Public → Create');
    process.exit(1);
  }
})();
