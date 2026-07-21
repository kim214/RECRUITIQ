const { getDb } = require('./db');

/**
 * Resolve the canonical user id from the database (fixes stale JWT ids after re-seed/migration).
 */
async function resolveUserId(req) {
  if (!req.user) return null;
  const db = getDb();
  if (req.user.id) {
    const byId = await db.findUserById(req.user.id);
    if (byId) return byId.id;
  }
  if (req.user.email) {
    const byEmail = await db.findUserByEmail(req.user.email);
    if (byEmail) return byEmail.id;
  }
  return req.user.id || null;
}

module.exports = { resolveUserId };
