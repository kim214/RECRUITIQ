-- Cached structured requirement matches (Milestone 8).
-- Run in Supabase SQL Editor.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS requirement_matches JSONB;
