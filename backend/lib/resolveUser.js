const { getDb } = require('./db');

/**
 * Resolve the canonical user id from the database (fixes stale JWT ids after re-seed/migration).
 */
async function resolveUserId(req) {
  if (!req.user) return null;
  const db = getDb();
  // Prefer email — stable when JWT user id is outdated after DB changes
  if (req.user.email) {
    const byEmail = await db.findUserByEmail(req.user.email.trim().toLowerCase());
    if (byEmail) return byEmail.id;
  }
  if (req.user.id) {
    const byId = await db.findUserById(req.user.id);
    if (byId) return byId.id;
  }
  return req.user.id || null;
}

module.exports = { resolveUserId };
