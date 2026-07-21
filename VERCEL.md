# Deploy Reqruit IQ to Vercel

## What gets deployed

| Component | On Vercel | Notes |
|-----------|-----------|-------|
| Frontend (HTML/CSS/JS) | ✅ Static hosting | All portals |
| Backend API (Express) | ✅ Serverless function | `/api/*` routes |
| Supabase database | ✅ External | Already configured |
| File uploads | ✅ Supabase Storage | Create `resumes` bucket |
| AI service (Python) | ❌ Not on Vercel | Uses built-in local AI scoring |

---

## Step 1: Create Supabase Storage bucket

1. Open your Supabase project → **Storage**
2. Click **New bucket**
3. Name: `resumes`
4. Set to **Public** (so resume links work)
5. Click **Create**

---

## Step 2: Deploy to Vercel

### Option A — Vercel website (easiest)

1. Go to **https://vercel.com** and sign in with GitHub
2. Click **Add New Project**
3. Import your repo: `kim214/RECRUITIQ`
4. Vercel auto-detects settings from `vercel.json`
5. Add **Environment Variables** (see Step 3)
6. Click **Deploy**

### Option B — Vercel CLI

```powershell
npm install -g vercel
cd C:\Users\HP\Desktop\REQRUITIQ
vercel login
vercel
```

Follow prompts. For production:
```powershell
vercel --prod
```

---

## Step 3: Environment variables on Vercel

In Vercel Dashboard → your project → **Settings** → **Environment Variables**, add:

| Name | Value |
|------|-------|
| `JWT_SECRET` | A long random secret string |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `AI_SERVICE_URL` | Leave empty on Vercel unless Python AI is on Railway/Render |
| `GROQ_API_KEY` | **Free AI** — get from https://console.groq.com |
| `LLM_PROVIDER` | `groq` (free) or `openai` or `gemini` |
| `OPENAI_API_KEY` | Optional — paid OpenAI analysis |
| `GEMINI_API_KEY` | Optional — free tier Google Gemini |

Apply to: **Production**, **Preview**, and **Development**

---

## Step 4: Your live URLs

After deploy, Vercel gives you a URL like:
```
https://reqruit-iq.vercel.app
```

| Page | URL |
|------|-----|
| Home | `https://your-app.vercel.app/home/index.html` |
| Login | `https://your-app.vercel.app/home/login.html` |
| Employer | `https://your-app.vercel.app/employer/dashboard.html` |
| Applicant | `https://your-app.vercel.app/applicant/dashboard.html` |
| API health | `https://your-app.vercel.app/api/health` |

---

## Step 5: Verify deployment

1. Open `https://your-app.vercel.app/api/health`
   - Should show: `{"status":"ok","env":"vercel"}`
2. Open `https://your-app.vercel.app/home/login.html`
3. Login with your accounts

---

## Local development still works

```powershell
cd backend
npm start
```
Open: http://localhost:3001/frontend/home/index.html

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API returns 500 | Check env vars in Vercel settings |
| Login fails | Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` |
| Upload fails | Create public `resumes` bucket in Supabase Storage |
| Page not found | Use `/home/index.html` not `/frontend/home/index.html` |
| AI analysis slow | Normal on serverless — uses built-in scoring |

---

## Note on AI service

The Python AI service (`recruit-ai/`) does not run on Vercel. The backend automatically uses **built-in AI scoring** when no external AI service is configured. This works for candidate ranking without OpenAI.

To use GPT-powered AI later, deploy `recruit-ai/` to **Railway** or **Render** and set `AI_SERVICE_URL` in Vercel env vars.
