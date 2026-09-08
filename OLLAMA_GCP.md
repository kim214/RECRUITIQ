# Deploy Ollama on Google Cloud for RecruitIQ (Live Production)

This guide puts **Ollama** on a Google Cloud VM and connects your **Vercel** app to it.

```
Browser → Vercel (RecruitIQ API) → Google Cloud VM (Ollama + models)
                ↓
            Supabase (database + files)
```

---

## What you need

| Item | Notes |
|------|--------|
| Google Cloud account | [console.cloud.google.com](https://console.cloud.google.com) |
| Billing enabled | Ollama needs ~4–8 GB RAM — free `e2-micro` is **too small** |
| Vercel project | Your live RecruitIQ site |
| ~30 minutes | First-time setup |

**Recommended VM:** `e2-standard-2` (2 vCPU, 8 GB RAM) — runs `gemma2:2b` comfortably.

**Estimated cost:** ~$25–40/month (varies by region; stop the VM when not testing to save money).

---

## Part 1 — Create the Google Cloud project

1. Open **[Google Cloud Console](https://console.cloud.google.com)**
2. Top bar → **Select a project** → **New Project**
3. Name: `recruitiq-ollama` → **Create**
4. Make sure the new project is selected

---

## Part 2 — Enable Compute Engine

1. Menu ☰ → **APIs & Services** → **Library**
2. Search **Compute Engine API** → **Enable**
3. Wait until enabled (~1 minute)

---

## Part 3 — Create the VM

1. Menu ☰ → **Compute Engine** → **VM instances**
2. Click **Create instance**

| Setting | Value |
|---------|--------|
| **Name** | `ollama-server` |
| **Region** | Pick one close to you (e.g. `europe-west1`) |
| **Machine type** | `e2-standard-2` (2 vCPU, 8 GB memory) |
| **Boot disk** | Ubuntu 22.04 LTS, **30 GB** minimum |
| **Firewall** | ✅ Allow HTTP traffic, ✅ Allow HTTPS traffic |

3. Click **Create**
4. Wait until the VM shows a green checkmark
5. Note the **External IP** (e.g. `34.123.45.67`)

---

## Part 4 — SSH into the VM

1. On the VM instances page, click **SSH** next to `ollama-server`
2. A browser terminal opens — run the commands below

---

## Part 5 — Install Ollama + your models

Copy and paste this entire block into the SSH terminal:

```bash
# Update system
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull your models (same as on your PC)
ollama pull gemma2:2b
ollama pull qwen2.5:0.5b

# Verify
ollama list
curl -s http://127.0.0.1:11434/api/tags
```

You should see both models listed.

---

## Part 6 — Keep Ollama running after reboot

```bash
sudo systemctl enable ollama
sudo systemctl start ollama
sudo systemctl status ollama
```

---

## Part 7 — Secure public access (required)

**Never expose Ollama on port 11434 without protection.** Use Nginx + API key.

### 7a. Install Nginx

```bash
sudo apt-get install -y nginx apache2-utils
```

### 7b. Choose a secret API key

Generate a long random string (save it — you'll add it to Vercel):

```bash
openssl rand -hex 32
```

Example output: `a1b2c3d4e5f6...` — this is your **`OLLAMA_API_KEY`**.

### 7c. Create Nginx config

Replace `YOUR_API_KEY_HERE` with the key you generated:

```bash
sudo tee /etc/nginx/sites-available/ollama << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        # Only allow requests with the correct API key
        if ($http_x_ollama_key != "YOUR_API_KEY_HERE") {
            return 401;
        }

        proxy_pass http://127.0.0.1:11434;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;

        client_max_body_size 20M;
    }
}
EOF
```

**Edit the file and replace the placeholder:**

```bash
sudo nano /etc/nginx/sites-available/ollama
# Change YOUR_API_KEY_HERE to your real key, save (Ctrl+O, Enter, Ctrl+X)
```

Enable the site:

```bash
sudo ln -sf /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 7d. Open firewall for HTTP (port 80)

1. Google Cloud Console → **VPC network** → **Firewall**
2. Click **Create firewall rule**
3. Settings:
   - Name: `allow-ollama-http`
   - Targets: All instances in the network
   - Source IPv4: `0.0.0.0/0`
   - Protocols: **tcp:80**
4. **Create**

### 7e. Test from the VM

```bash
# Should fail (no key)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/tags

# Should return 200 with model list
curl -s -H "X-Ollama-Key: YOUR_API_KEY_HERE" http://127.0.0.1/api/tags
```

---

## Part 8 — Test from your PC

Replace `EXTERNAL_IP` and `YOUR_API_KEY`:

```powershell
curl.exe -H "X-Ollama-Key: YOUR_API_KEY_HERE" http://EXTERNAL_IP/api/tags
```

If you see JSON with `gemma2:2b` and `qwen2.5:0.5b`, Ollama is live.

---

## Part 9 — Configure Vercel

1. Open **[vercel.com](https://vercel.com)** → your RecruitIQ project
2. **Settings** → **Environment Variables**
3. Add these (Production + Preview + Development):

| Name | Value |
|------|--------|
| `LLM_PROVIDER` | `ollama` |
| `OLLAMA_BASE_URL` | `http://YOUR_EXTERNAL_IP` (no trailing slash) |
| `OLLAMA_MODEL` | `gemma2:2b` |
| `OLLAMA_FALLBACK_MODEL` | `qwen2.5:0.5b` |
| `OLLAMA_API_KEY` | Same secret key from Part 7 |
| `OLLAMA_TIMEOUT_MS` | `240000` |
| `JWT_SECRET` | (keep existing) |
| `SUPABASE_URL` | (keep existing) |
| `SUPABASE_SERVICE_KEY` | (keep existing) |

4. **Save** → **Deployments** → **Redeploy** latest deployment

---

## Part 10 — Verify live AI

1. Open your live site → login as employer
2. Go to **AI Rankings** → select a job → **Run AI Analysis**
3. First run may take **1–3 minutes** (model loads on the VM)

Check Ollama status (employer login required):

```
https://your-app.vercel.app/api/ai/status
```

---

## Vercel timeout warning

AI analysis can take **1–3 minutes**. Vercel limits:

| Plan | Max function time |
|------|-------------------|
| Hobby | ~60 seconds (may timeout) |
| Pro | Up to 300 seconds with config |

This repo sets `maxDuration: 300` in `vercel.json` for the API. **Pro plan recommended** for reliable live Ollama.

If you stay on Hobby and get timeouts, either:
- Upgrade Vercel to Pro, or
- Move the backend to **Google Cloud Run** or **Railway** (same VM region, longer timeouts)

---

## Optional — HTTPS with a domain

For production, use a domain instead of raw IP:

1. Point `ollama.yourdomain.com` A record → VM external IP
2. Install Certbot on the VM:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ollama.yourdomain.com
```

3. Set Vercel: `OLLAMA_BASE_URL=https://ollama.yourdomain.com`

---

## Optional — Stop VM to save money

When not demoing:

1. Compute Engine → VM instances → **Stop** `ollama-server`
2. You are not charged for CPU/RAM while stopped (small disk charge remains)

Start again before using live AI.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401` from Ollama URL | Wrong `OLLAMA_API_KEY` in Vercel — must match Nginx config |
| `Connection refused` | VM stopped, Nginx down, or firewall blocking port 80 |
| `Ollama error 500` | SSH in, run `sudo systemctl status ollama` |
| Vercel timeout | Upgrade to Pro or reduce model size / use faster VM |
| Out of memory | Upgrade to `e2-standard-4` or use only `qwen2.5:0.5b` |
| Slow first request | Normal — model loads into RAM on first use |

**VM logs:**

```bash
sudo journalctl -u ollama -f
sudo tail -f /var/log/nginx/error.log
```

---

## Quick reference

| Where | Value |
|-------|--------|
| GCP VM | `ollama-server` |
| Ollama (internal) | `http://127.0.0.1:11434` |
| Public URL | `http://EXTERNAL_IP` or `https://ollama.yourdomain.com` |
| Auth header | `X-Ollama-Key: your-secret-key` |
| Vercel env | `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, `LLM_PROVIDER=ollama` |
