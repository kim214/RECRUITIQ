require('dotenv').config();

async function main() {
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employer@reqruit.com', password: 'employer123' }),
  });
  const auth = await login.json();
  console.log('login_http=', login.status, 'role=', auth.user && auth.user.role);
  if (!auth.token) {
    console.log('login_body=', JSON.stringify(auth).slice(0, 400));
    process.exit(1);
  }

  const st = await fetch('http://localhost:3001/api/ai/status', {
    headers: { Authorization: 'Bearer ' + auth.token },
  });
  const body = await st.json();
  console.log('ai_status_http=', st.status);
  console.log(JSON.stringify(body, null, 2));

  const t0 = Date.now();
  const chat = await fetch(`${process.env.OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ollama-Key': process.env.OLLAMA_API_KEY,
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL,
      messages: [{ role: 'user', content: 'Reply with JSON {"ok":true} only' }],
      stream: false,
      format: 'json',
      options: { num_predict: 32 },
    }),
    signal: AbortSignal.timeout(120000),
  });
  console.log('chat_http=', chat.status, 'ms=', Date.now() - t0);
  const cj = await chat.json();
  console.log('chat_preview=', (cj.message && cj.message.content || '').slice(0, 200));
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
