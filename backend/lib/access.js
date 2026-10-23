const { getDb } = require('./db');
const { resolveUserId } = require('./resolveUser');

function applicantIdOf(application) {
  return application?.applicantId || application?.applicant_id || null;
}

function jobIdOf(application) {
  return application?.jobId || application?.job_id || null;
}

/**
 * Pure isolation rules. Employer ownership is passed in (async lookup lives in assertApplicationAccess).
 */
function canAccessApplication({ role, userId }, application, { ownsJob } = {}) {
  if (!application) return false;
  if (role === 'admin') return true;
  if (role === 'applicant') return Boolean(userId) && applicantIdOf(application) === userId;
  if (role === 'employer') return Boolean(ownsJob);
  return false;
}

function accessDeniedError(role, action) {
  const updating = action === 'update';
  if (role === 'employer') {
    const err = new Error(updating
      ? 'You can only update applications for jobs you created.'
      : 'You can only view applications for jobs you created.');
    err.status = 403;
    return err;
  }
  const err = new Error('Application not found');
  err.status = 404;
  return err;
}

async function assertApplicationAccess(req, application, { action } = {}) {
  if (!application) {
    const err = new Error('Application not found');
    err.status = 404;
    throw err;
  }
  const db = getDb();
  const userId = await resolveUserId(req);
  const role = req.user?.role;
  let ownsJob = false;
  if (role === 'employer') {
    const jobId = jobIdOf(application);
    ownsJob = jobId ? await db.employerOwnsJob(userId, jobId) : false;
  }
  if (!canAccessApplication({ role, userId }, application, { ownsJob })) {
    throw accessDeniedError(role, action);
  }
  return { userId, ownsJob };
}

module.exports = {
  applicantIdOf,
  jobIdOf,
  canAccessApplication,
  assertApplicationAccess,
};
