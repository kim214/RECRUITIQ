-- Interviews, in-app messages, and notifications.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

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

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS applicant_rsvp TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_interviews_employer ON interviews(employer_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant ON interviews(applicant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_application ON messages(application_id, created_at);

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
