const jwt = require('jsonwebtoken');

const DEV_SECRET = 'reqruit-iq-dev-secret-change-in-production';
const WEAK_SECRETS = new Set([
  DEV_SECRET,
  'change-this-to-a-long-random-secret',
  'secret',
  'jwt-secret',
]);

function isProduction(env = process.env) {
  return Boolean(env.VERCEL) || env.NODE_ENV === 'production';
}

function resolveJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  const strong = secret && !WEAK_SECRETS.has(secret) && secret.length >= 16;
  if (strong) return secret;
  if (isProduction(env)) {
    throw new Error('JWT_SECRET must be set to a unique value of at least 16 characters in production');
  }
  if (!secret) {
    console.warn('[auth] JWT_SECRET is not set. Using a development default. Do not use this in production.');
  } else {
    console.warn('[auth] JWT_SECRET looks weak. Set a unique value of at least 16 characters.');
  }
  return secret || DEV_SECRET;
}

const JWT_SECRET = resolveJwtSecret();

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, fullName: user.full_name || user.fullName },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

module.exports = { authMiddleware, requireRole, signToken, JWT_SECRET, resolveJwtSecret };
