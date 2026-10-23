-- Async analysis pipeline status (Milestone 11).
-- Run in Supabase SQL Editor.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS analysis_status JSONB;
