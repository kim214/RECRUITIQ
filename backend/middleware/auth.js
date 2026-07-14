const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'reqruit-iq-dev-secret-change-in-production';

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

module.exports = { authMiddleware, requireRole, signToken, JWT_SECRET };
