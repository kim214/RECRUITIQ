function stripSlash(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function listedOrigins(env = process.env) {
  const extra = String(env.CORS_ORIGINS || '')
    .split(',')
    .map(stripSlash)
    .filter(Boolean);
  return [
    env.PUBLIC_APP_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    ...extra,
  ].map(stripSlash).filter(Boolean);
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true;
  const normalized = stripSlash(origin);
  if (listedOrigins(env).includes(normalized)) return true;
  try {
    const host = new URL(origin).hostname;
    if (env.VERCEL && host.endsWith('.vercel.app')) return true;
  } catch {
    return false;
  }
  return false;
}

function corsOriginDelegate(origin, callback) {
  callback(null, isAllowedOrigin(origin));
}

module.exports = { listedOrigins, isAllowedOrigin, corsOriginDelegate };
