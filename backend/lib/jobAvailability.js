function parseDeadline(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function requireFutureDeadline(value) {
  const iso = parseDeadline(value);
  if (!iso) throw new Error('Application deadline is required');
  if (new Date(iso).getTime() <= Date.now()) {
    throw new Error('Application deadline must be in the future');
  }
  return iso;
}

function deadlineHasPassed(deadline) {
  if (!deadline) return false;
  return Date.now() > new Date(deadline).getTime();
}

function enrichJob(job) {
  if (!job) return job;
  const deadline = job.applicationDeadline || job.application_deadline || null;
  const expired = deadlineHasPassed(deadline);
  const acceptingApplications = job.status === 'open' && !expired;
  let closedReason = null;
  if (!acceptingApplications) {
    if (expired) closedReason = 'deadline';
    else if (job.status === 'closed') closedReason = 'terminated';
    else closedReason = job.status || 'closed';
  }
  return {
    ...job,
    applicationDeadline: deadline,
    application_deadline: deadline,
    acceptingApplications,
    closedReason,
  };
}

function closedMessage(job) {
  const enriched = enrichJob(job);
  if (enriched.acceptingApplications) return null;
  if (enriched.closedReason === 'deadline') {
    return 'This job no longer accepts applications — the deadline has passed.';
  }
  return 'This job is closed and no longer accepts applications.';
}

module.exports = {
  parseDeadline,
  requireFutureDeadline,
  deadlineHasPassed,
  enrichJob,
  closedMessage,
};
