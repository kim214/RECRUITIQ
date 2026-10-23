-- Analysis audit / versioning (Milestone 15).
-- Run in Supabase SQL Editor.
-- Extends ai_analyses so a Model A result is distinguishable from a later Model B result.
-- Does not add a second analyses table; unique(application_id) still stores the latest run.

ALTER TABLE ai_analyses
  ADD COLUMN IF NOT EXISTS analysis_version TEXT;

ALTER TABLE ai_analyses
  ADD COLUMN IF NOT EXISTS scoring_version TEXT;

ALTER TABLE ai_analyses
  ADD COLUMN IF NOT EXISTS embedding_model TEXT;

ALTER TABLE ai_analyses
  ADD COLUMN IF NOT EXISTS analysis_audit JSONB;
