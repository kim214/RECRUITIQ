require('dotenv').config();
const { getConfig, embeddings, healthCheck } = require('../lib/ai/ollamaProvider');

function headers() {
  const out = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_API_KEY) out['X-Ollama-Key'] = process.env.OLLAMA_API_KEY;
  return out;
}

function modelInstalled(installed, name) {
  if (!name) return false;
  return installed.some((n) => n === name || n.startsWith(`${name}:`));
}

async function pullModel(baseUrl, name) {
  console.log(`pulling ${name} …`);
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model: name, stream: true }),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama pull failed (${res.status}): ${err.slice(0, 400)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let lastStatus = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const status = row.status || row.error;
        if (status && status !== lastStatus) {
          lastStatus = status;
          const extra = row.completed && row.total
            ? ` ${Math.round((row.completed / row.total) * 100)}%`
            : '';
          console.log(`  ${status}${extra}`);
        }
        if (row.error) throw new Error(row.error);
      } catch (err) {
        if (err.message && !/JSON/.test(err.message)) throw err;
      }
    }
  }
}

async function main() {
  const cfg = getConfig();
  const want = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
  console.log('target', { host: new URL(cfg.baseUrl).host, model: want });

  let health = await healthCheck();
  if (!health.available && health.error) {
    console.error('FAIL', health.error);
    process.exit(1);
  }

  const installed = health.installedModels || [];
  console.log('installed', installed);

  if (!modelInstalled(installed, want)) {
    await pullModel(cfg.baseUrl, want);
    health = await healthCheck();
  } else {
    console.log(`${want} already installed`);
  }

  const ok = modelInstalled(health.installedModels || [], want);
  if (!ok) {
    console.error(`FAIL: ${want} is not installed after pull`);
    process.exit(1);
  }

  const emb = await embeddings({ input: 'recruitiq candidate matching', model: want });
  console.log('embeddings', {
    model: emb.model,
    dims: emb.embeddings[0] && emb.embeddings[0].length,
  });
  console.log('PASS');
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
