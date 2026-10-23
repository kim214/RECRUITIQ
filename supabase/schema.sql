-- Reqruit IQ — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS / PROFILES ───
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  applicant_code TEXT UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'employer', 'applicant')),
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'banned')),
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
  application_deadline    TIMESTAMPTZ,
  requirement_profile     JSONB,
  embedding_cache         JSONB,
  scoring_weights         JSONB,
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
  candidate_profile JSONB,
  supporting_documents JSONB,
  evidence JSONB,
  embedding_cache JSONB,
  requirement_matches JSONB,
  score_breakdown JSONB,
  analysis_status JSONB,
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
  model_version     TEXT DEFAULT 'ollama',
  analysis_version  TEXT,
  scoring_version   TEXT,
  embedding_model   TEXT,
  analysis_audit    JSONB,
  UNIQUE(application_id)
);

-- ─── INDEXES ───
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(application_deadline);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_job ON ai_analyses(job_id);

-- ─── INTERVIEWS / NOTIFICATIONS / MESSAGES ───
CREATE TABLE IF NOT EXISTS interviews (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id         UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_id                 UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employer_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  applicant_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode                   TEXT NOT NULL CHECK (mode IN ('online', 'onsite')),
  starts_at              TIMESTAMPTZ NOT NULL,
  duration_minutes       INTEGER NOT NULL DEFAULT 45,
  status                 TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  applicant_rsvp         TEXT NOT NULL DEFAULT 'pending' CHECK (applicant_rsvp IN ('pending', 'confirmed', 'declined')),
  meeting_url            TEXT,
  location               TEXT,
  applicant_instructions TEXT,
  employer_notes         TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  meta       JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_employer ON interviews(employer_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant ON interviews(applicant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_application ON messages(application_id, created_at);

-- ─── ENABLE RLS, deny anon (backend uses service_role which bypasses RLS) ───
-- Existing projects: run supabase/enable-rls-deny-anon.sql.
-- Do not add anon/authenticated policies; the browser never queries Postgres.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- After running this, seed demo data from your terminal:
--   cd backend && npm run seed:supabase
-- Existing projects: also run supabase/add-user-status.sql so admins can suspend accounts.
-- Existing projects: also run supabase/add-job-deadline.sql so postings store application deadlines.
-- Existing projects: also run supabase/add-job-requirement-profile.sql so job requirements can be cached.
-- Existing projects: also run supabase/add-candidate-profile.sql so extracted candidate profiles can be cached.
-- Existing projects: also run supabase/add-supporting-documents.sql so certificate/transcript analysis can be cached.
-- Existing projects: also run supabase/add-application-evidence.sql so claim evidence can be cached.
-- Existing projects: also run supabase/add-embedding-cache.sql so job/candidate embeddings can be cached.
-- Existing projects: also run supabase/add-requirement-matches.sql so requirement MATCH/NOT_FOUND rows can be cached.
-- Existing projects: also run supabase/add-scoring-engine.sql so per-job weights and score breakdowns can be cached.
-- Existing projects: also run supabase/add-analysis-status.sql so async analysis steps can be stored.
-- Existing projects: also run supabase/enable-rls-deny-anon.sql so the anon key cannot read tables.
-- Existing projects: also run supabase/add-analysis-audit.sql so analysis model/pipeline versions are stored.
-- Existing projects: also run supabase/add-hiring-flow.sql so interviews, notifications, and messages exist.
-- Existing projects: also run supabase/add-applicant-code.sql so employers see public applicant IDs instead of names.
