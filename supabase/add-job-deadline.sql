-- Run in Supabase SQL Editor so job postings can store application deadlines.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS application_deadline TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(application_deadline);
