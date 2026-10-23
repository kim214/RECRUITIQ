-- Deterministic scoring cache (Milestone 9).
-- Run in Supabase SQL Editor.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scoring_weights JSONB;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB;
