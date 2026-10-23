-- Cached certificate/transcript analysis from Ollama (Milestone 5).
-- Run in Supabase SQL Editor.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS supporting_documents JSONB;
