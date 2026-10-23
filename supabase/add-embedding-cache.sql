-- Cached Ollama embeddings for jobs and applications (Milestone 7).
-- Run in Supabase SQL Editor.
-- JSONB is used so local + Vercel work without pgvector.
-- Optional later: CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS embedding_cache JSONB;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS embedding_cache JSONB;
