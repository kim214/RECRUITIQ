-- Reqruit IQ — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS / PROFILES ───
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'employer', 'applicant')),
  company       TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── JOBS ───
CREATE TABLE IF NOT EXISTS jobs (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employer_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  description             TEXT NOT NULL,
  location                TEXT,
  employment_type         TEXT DEFAULT 'full-time',
  salary_min              INTEGER,
  salary_max              INTEGER,
  required_skills         TEXT[] DEFAULT '{}',
  required_education      TEXT,
  required_certifications TEXT[] DEFAULT '{}',
  experience_years        INTEGER DEFAULT 0,
  status                  TEXT DEFAULT 'open' CHECK (status IN ('open','closed','draft')),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── APPLICATIONS ───
CREATE TABLE IF NOT EXISTS applications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status           TEXT DEFAULT 'applied' CHECK (status IN (
    'applied','ai_screening','shortlisted','interview','hired','rejected'
  )),
  cover_letter     TEXT,
  resume_url       TEXT,
  transcript_url   TEXT,
  certificates_url TEXT[] DEFAULT '{}',
  applied_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, applicant_id)
);

-- ─── AI ANALYSIS RESULTS ───
CREATE TABLE IF NOT EXISTS ai_analyses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  overall_score     DECIMAL(5,2),
  skills_match      JSONB,
  education_match   JSONB,
  experience_match  JSONB,
  ai_summary        TEXT,
  strengths         TEXT[] DEFAULT '{}',
  weaknesses        TEXT[] DEFAULT '{}',
  recommendation    TEXT CHECK (recommendation IN ('strong_yes','yes','maybe','no')),
  analyzed_at       TIMESTAMPTZ DEFAULT NOW(),
  model_version     TEXT DEFAULT 'gpt-4o-mini',
  UNIQUE(application_id)
);

-- ─── INDEXES ───
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_job ON ai_analyses(job_id);

-- ─── DISABLE RLS (backend uses service_role key) ───
-- For production you may enable RLS later; service_role bypasses it.
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses DISABLE ROW LEVEL SECURITY;

-- After running this, seed demo data from your terminal:
--   cd backend && npm run seed:supabase
