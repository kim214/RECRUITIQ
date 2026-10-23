-- Cached structured job requirements from Ollama (Milestone 2).
-- Run in Supabase SQL Editor.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS requirement_profile JSONB;
