# Reqruit IQ — Setup & Run Guide

AI-powered job recruitment platform with employer, applicant, and admin portals.

## Quick Start (Local Mode — No Supabase Required)

The app runs out of the box with a local JSON database. Demo accounts are created automatically.

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Start the API server

```bash
npm start
```

Server runs at **http://localhost:3001**

Open the app: **http://localhost:3001/frontend/home/index.html**

### 3. (Optional) Start AI service for smarter matching

```bash
cd recruit-ai
pip install -r requirements.txt
# Copy .env.example to .env and add OPENAI_API_KEY for GPT-powered analysis
uvicorn api:app --reload --port 8000
```

Without the AI service or OpenAI key, the backend uses a built-in local scoring engine.

---

## Demo Accounts

| Role      | Email                  | Password     |
|-----------|------------------------|--------------|
| Admin     | admin@reqruit.com      | admin123     |
| Employer  | employer@reqruit.com   | employer123  |
| Applicant | applicant@reqruit.com  | applicant123 |

---

## Full Workflow Test

1. **Login as employer** → Post a job with required skills
2. **Login as applicant** → Browse jobs → Apply with a cover letter mentioning your skills
3. **Login as employer** → AI Rankings → Run AI Analysis
4. **Shortlisting** → Click candidates → Shortlist / Schedule interview / Hire
5. **Login as admin** → View platform stats

---

## Supabase Setup (Production)

### 1. Create project at [supabase.com](https://supabase.com)

### 2. Run schema

Open **SQL Editor** → paste contents of `supabase/schema.sql` → Run

### 3. Configure backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET=your-long-random-secret
AI_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=sk-...
```

Restart the backend — it will automatically switch from local JSON to Supabase.

---

## Project Structure

```
REQRUITIQ/
├── backend/          Node.js Express API
├── frontend/         HTML/CSS/JS portals
├── recruit-ai/       Python FastAPI AI agents
├── supabase/         Database schema
└── SETUP.md          This file
```

## AI Agents

| Agent   | File                          | Purpose                          |
|---------|-------------------------------|----------------------------------|
| Parser  | recruit-ai/agents/parser.py   | Extract skills from documents    |
| Matcher | recruit-ai/agents/matcher.py  | Score candidate vs job requirements |
| Ranker  | recruit-ai/agents/ranker.py   | Batch rank all applicants        |

Set `OPENAI_API_KEY` in `recruit-ai/.env` for GPT-4o-mini powered analysis. Without it, local keyword matching is used.

---

## Troubleshooting

- **Port 3001 in use**: Change `PORT` in `backend/.env`
- **CORS errors**: Always access frontend via `http://localhost:3001/frontend/...` not by opening HTML files directly
- **AI service not connecting**: Ensure `uvicorn` is running on port 8000; backend falls back to local scoring automatically
