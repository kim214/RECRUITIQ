-- Cached claim evidence from application documents (Milestone 6).
-- Run in Supabase SQL Editor.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS evidence JSONB;
