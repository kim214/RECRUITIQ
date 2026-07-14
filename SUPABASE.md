# Supabase Setup for Reqruit IQ

Follow these steps in order. Takes about 10 minutes.

---

## Step 1: Create a Supabase project

1. Go to **[https://supabase.com](https://supabase.com)** and sign in
2. Click **New Project**
3. Fill in:
   - **Name:** `reqruit-iq`
   - **Database Password:** choose a strong password and **save it**
   - **Region:** pick the closest to you (e.g. `South Asia` or `West EU`)
4. Click **Create new project** and wait ~2 minutes

---

## Step 2: Run the database schema

1. In your Supabase project, open **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the file `supabase/schema.sql` from this project
4. Copy **all** the SQL and paste it into the editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see **Success. No rows returned**

This creates 4 tables: `profiles`, `jobs`, `applications`, `ai_analyses`

---

## Step 3: Get your API keys

1. Go to **Project Settings** (gear icon) → **API**
2. Copy these two values:

| Setting | Where to find it | Goes in `.env` as |
|---------|------------------|-------------------|
| Project URL | `https://xxxxx.supabase.co` | `SUPABASE_URL` |
| service_role key | Under "Project API keys" → **service_role** (secret) | `SUPABASE_SERVICE_KEY` |

> Use the **service_role** key, NOT the anon key. The backend needs full database access.

---

## Step 4: Configure the backend

Edit `backend/.env` (create it from `.env.example` if needed):

```env
PORT=3001
JWT_SECRET=any-long-random-string-you-make-up

SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...your-service-role-key

AI_SERVICE_URL=http://localhost:8000
```

Replace `YOUR_PROJECT_ID` and paste your real service_role key.

---

## Step 5: Seed demo data

In PowerShell:

```powershell
cd C:\Users\HP\Desktop\REQRUITIQ\backend
npm run seed:supabase
```

Expected output:
```
Connecting to Supabase...
  ✓ admin: admin@reqruit.com
  ✓ employer: employer@reqruit.com
  ✓ applicant: applicant@reqruit.com
  ✓ Sample job created
Seed complete!
```

---

## Step 6: Restart the backend

Stop the running backend (Ctrl+C) and start again:

```powershell
cd C:\Users\HP\Desktop\REQRUITIQ\backend
npm start
```

Look for this line in the console:
```
Database: Supabase connected
```

If you see `Local JSON store` instead, your `.env` values are wrong or missing.

---

## Step 7: Verify in Supabase

1. Open **Table Editor** in Supabase
2. Check **profiles** — should have 3 users
3. Check **jobs** — should have 1 sample job

---

## Step 8: Test the app

Open: **http://localhost:3001/frontend/home/index.html**

Login with:
- `employer@reqruit.com` / `employer123`
- `applicant@reqruit.com` / `applicant123`

---

## Database tables

```
profiles        → users (admin, employer, applicant)
jobs            → job postings
applications    → candidate applications
ai_analyses     → AI scoring results
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `relation "profiles" does not exist` | Run `supabase/schema.sql` in SQL Editor |
| `Supabase init failed` | Check URL and service_role key in `.env` |
| Still using local JSON | Restart backend after editing `.env` |
| `Invalid API key` | Use **service_role** key, not anon key |
| Seed says table missing | Run schema.sql first |

---

## Optional: Storage buckets (for resumes later)

In Supabase → **Storage** → create buckets:
- `resumes` (private)
- `transcripts` (private)
- `certificates` (private)

File upload UI can be added in a future update.
