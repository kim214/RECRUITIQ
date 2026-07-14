-- Transfer all jobs to your employer account
-- Run this in Supabase → SQL Editor

UPDATE jobs
SET employer_id = (
  SELECT id FROM profiles WHERE email = 'nathankimutai59@gmail.com'
)
WHERE employer_id != (
  SELECT id FROM profiles WHERE email = 'nathankimutai59@gmail.com'
);

-- Verify: should show your email as employer
SELECT j.title, p.email AS employer_email, p.full_name
FROM jobs j
JOIN profiles p ON j.employer_id = p.id;

-- Verify: applications linked to your jobs
SELECT a.id, p.email AS applicant_email, j.title AS job_title, a.status
FROM applications a
JOIN jobs j ON a.job_id = j.id
JOIN profiles p ON a.applicant_id = p.id;
