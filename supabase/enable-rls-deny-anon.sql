-- Milestone 14: enable RLS with no anon/authenticated policies.
-- The Express API uses SUPABASE_SERVICE_KEY (service_role), which bypasses RLS.
-- The browser must not query these tables directly (no supabase-js, no anon key).
-- Run in Supabase SQL Editor.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY statements on purpose. With RLS on and zero policies,
-- the anon and authenticated roles cannot read or write rows.
-- Do not add policies unless you later introduce Supabase Auth + browser queries.
