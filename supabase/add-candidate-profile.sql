-- Cached structured candidate profile from Ollama (Milestone 4).
-- Run in Supabase SQL Editor.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS candidate_profile JSONB;
