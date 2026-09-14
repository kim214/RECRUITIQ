-- Run in Supabase SQL Editor so admins can ban users.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'banned'));

UPDATE profiles SET status = 'active' WHERE status IS NULL;
