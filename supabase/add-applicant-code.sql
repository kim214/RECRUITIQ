-- Public applicant IDs for NEW and EXISTING applicants.
-- This does not change emails or names on the account.
-- It adds applicant_code and fills it for every current applicant row.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS applicant_code TEXT;

UPDATE profiles
SET applicant_code = 'RQ-' || UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 8))
WHERE role = 'applicant'
  AND (applicant_code IS NULL OR applicant_code = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_applicant_code
  ON profiles(applicant_code)
  WHERE applicant_code IS NOT NULL;
