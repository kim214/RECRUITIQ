/**
 * In-memory limiter for login/register. Per-instance only (weak on serverless,
 * still blocks casual brute force on a warm function).
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, message } = {}) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        message: message || 'Too many attempts. Try again later.',
      });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  message: 'Too many login attempts. Try again in a few minutes.',
});

module.exports = { createRateLimiter, authLimiter };
