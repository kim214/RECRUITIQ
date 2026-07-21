# AI Setup Guide — OpenAI & Free Alternatives

Reqruit IQ supports **real AI analysis** (not fixed rule scores) via API keys.
The easiest **free** option is **Groq**. OpenAI is also supported.

---

## Quick pick

| Provider | Cost | Best for |
|----------|------|----------|
| **Groq** (recommended) | Free tier | Vercel production + local dev |
| **Google Gemini** | Free tier | Vercel production |
| **OpenAI** | Paid (small cost per analysis) | Highest quality |
| **Ollama** | 100% free local | Offline / your PC only |

---

## Option 1: Groq (FREE — recommended)

1. Sign up at **https://console.groq.com**
2. Create an API key
3. Add to **`backend/.env`** (local):
   ```env
   GROQ_API_KEY=gsk_your_key_here
   LLM_PROVIDER=groq
   ```
4. Add the **same vars** in **Vercel → Settings → Environment Variables**
5. Redeploy Vercel
6. Re-run **AI Rankings** on a job

Groq uses fast open models (default: `llama-3.3-70b-versatile`).

---

## Option 2: OpenAI

1. Get a key at **https://platform.openai.com/api-keys**
2. Add to `backend/.env`:
   ```env
   OPENAI_API_KEY=sk-your-key
   LLM_PROVIDER=openai
   ```
3. Add to Vercel env vars and redeploy

Default model: `gpt-4o-mini` (~$0.001 per candidate analysis).

---

## Option 3: Google Gemini (FREE tier)

1. Get a key at **https://aistudio.google.com/apikey**
2. Add to `backend/.env`:
   ```env
   GEMINI_API_KEY=your_key
   LLM_PROVIDER=gemini
   ```
3. Add to Vercel and redeploy

Default model: `gemini-1.5-flash`

---

## Option 4: Ollama (100% free, local only)

1. Install **https://ollama.com**
2. Run: `ollama pull llama3.2`
3. Add to `backend/.env`:
   ```env
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
   OLLAMA_MODEL=llama3.2
   ```
4. Start backend — AI runs on your machine (not on Vercel)

---

## Verify it works

After setting a key, restart the backend locally:

```powershell
cd backend
npm start
```

Check AI status (logged in as employer):

```
GET /api/ai/status
```

Should show:
```json
{ "llm": { "available": true, "provider": "groq", "model": "llama-3.3-70b-versatile" } }
```

Then run **Employer → AI Rankings → Run AI Analysis**.

In the candidate modal, the analysis should show a model like `groq:llama-3.3-70b-versatile` instead of `document-aware-v3`.

---

## Optional: Python AI service (local)

If you also run the Python service:

```powershell
cd recruit-ai
copy .env.example .env
# Add GROQ_API_KEY or OPENAI_API_KEY to recruit-ai/.env
pip install -r requirements.txt
uvicorn api:app --port 8000
```

In `backend/.env`:
```env
AI_SERVICE_URL=http://localhost:8000
```

The backend tries: Python service → built-in LLM → rule fallback.

---

## Vercel checklist

In **Vercel → Project → Settings → Environment Variables**, add **one** of:

| Variable | Example |
|----------|---------|
| `GROQ_API_KEY` | `gsk_...` |
| `LLM_PROVIDER` | `groq` |
| `OPENAI_API_KEY` | `sk-...` |
| `GEMINI_API_KEY` | `AI...` |

Keep existing: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`

**Do not** set `AI_SERVICE_URL` on Vercel unless you deployed the Python service to Railway/Render.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Still see `document-aware-v3` | No API key set — add Groq key to Vercel and redeploy |
| All candidates same score | Re-run analysis after adding key; ensure PDF resumes have text |
| Groq rate limit | Wait a minute or switch to Gemini |
| Ollama on Vercel | Ollama is local only — use Groq or Gemini on Vercel |
