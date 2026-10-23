/**
 * In-process analysis queue.
 * Persists step status on the application. Does not add Redis/Bull.
 */

const { getDb } = require('./db');
const { runAnalysisJob, runRescoreJob } = require('./analysisRunner');
const { buildStatus, isActive } = require('./analysisStatus');
const { buildAudit, compactAudit } = require('./analysisAudit');
const { staleReason, hasFreshAnalysis } = require('./analysisCache');

const pending = [];
const running = new Map();
const inflight = new Set();
let draining = false;

function defer(req, res, work) {
  const pendingWork = Promise.resolve().then(work).catch((err) => {
    console.error('[analysisQueue]', err.message);
  });
  if (res && typeof res.waitUntil === 'function') res.waitUntil(pendingWork);
  else if (req && typeof req.waitUntil === 'function') req.waitUntil(pendingWork);
  else setImmediate(() => pendingWork);
  return pendingWork;
}

async function writeStatus(db, applicationId, step, extra = {}) {
  const record = buildStatus(step, extra);
  try {
    if (db?.updateApplication) {
      await db.updateApplication(applicationId, { analysisStatus: record });
    }
  } catch (err) {
    console.error(`analysis_status save failed (${applicationId}):`, err.message);
  }
  return record;
}

async function processOne(db, item) {
  const applicationId = item.applicationId;
  if (running.has(applicationId)) return running.get(applicationId);

  const work = (async () => {
    const application = await db.getApplication(applicationId);
    if (!application) throw new Error('Application not found');
    const job = await db.getJob(application.jobId || application.job_id || item.jobId);
    if (!job) throw new Error('Job not found');
    const origin = item.origin || process.env.PUBLIC_APP_URL || 'http://localhost:3001';
    const onStep = (step, extra = {}) => writeStatus(db, applicationId, step, {
      origin,
      batch_id: item.batchId,
      ...extra,
    });
    const reason = item.force ? 'force' : staleReason(application, job);
    if (!reason) {
      await onStep('COMPLETED', { cached: true, audit: compactAudit(application.analysis?.audit) });
      return { cached: true };
    }
    if (reason === 'scoring') {
      return runRescoreJob({ db, job, application, onStep });
    }
    return runAnalysisJob({ db, job, application, origin, onStep });
  })().catch(async (err) => {
    const application = await db.getApplication(applicationId).catch(() => null);
    const audit = compactAudit(buildAudit({
      status: 'failed',
      errors: [err.message],
      application,
    }));
    await writeStatus(db, applicationId, item.step || 'QUEUED', {
      state: 'failed',
      error: err.message,
      origin: item.origin,
      batch_id: item.batchId,
      audit,
    });
    throw err;
  }).finally(() => {
    running.delete(applicationId);
    inflight.delete(applicationId);
  });

  running.set(applicationId, work);
  return work;
}

async function drain(db) {
  if (draining) return;
  draining = true;
  try {
    while (pending.length) {
      const item = pending.shift();
      try {
        await processOne(db, item);
      } catch (err) {
        console.error('[analysisQueue] job failed', item.applicationId, err.message);
      }
    }
  } finally {
    draining = false;
    if (pending.length) setImmediate(() => drain(db));
  }
}

function kick(db = getDb()) {
  if (!pending.length || draining) return;
  setImmediate(() => drain(db));
}

function isClaimed(applicationId) {
  return running.has(applicationId)
    || inflight.has(applicationId)
    || pending.some((item) => item.applicationId === applicationId);
}

function claimApplication(applicationId) {
  if (isClaimed(applicationId)) return false;
  inflight.add(applicationId);
  return true;
}

function releaseApplication(applicationId) {
  inflight.delete(applicationId);
}

async function enqueue(db, { applicationId, jobId, origin, batchId, force }, { req, res } = {}) {
  const application = await db.getApplication(applicationId);
  if (!application) throw new Error('Application not found');
  const job = await db.getJob(jobId || application.jobId || application.job_id);
  if (!job) throw new Error('Job not found');

  if (!force && hasFreshAnalysis(application, job)) {
    const cached = application.analysisStatus?.state === 'completed'
      ? { ...application.analysisStatus, cached: true }
      : await writeStatus(db, applicationId, 'COMPLETED', {
        origin,
        batch_id: batchId,
        cached: true,
        audit: compactAudit(application.analysis?.audit),
      });
    return cached;
  }
  if (running.has(applicationId) || isClaimed(applicationId)) {
    return application.analysisStatus || application.analysis_status;
  }
  // On Vercel a live row means another instance still owns the job.
  // Locally, nodemon restarts leave a stale "processing" row — resume it.
  if (!force && isActive(application.analysisStatus || application.analysis_status) && process.env.VERCEL) {
    return application.analysisStatus || application.analysis_status;
  }
  if (!claimApplication(applicationId)) {
    return application.analysisStatus || buildStatus('QUEUED', { origin, batch_id: batchId });
  }

  try {
    const status = await writeStatus(db, applicationId, 'QUEUED', { origin, batch_id: batchId });
    pending.push({ applicationId, jobId: job.id, origin, batchId, force });
    const work = drain(db);
    defer(req, res, () => work);
    return status;
  } catch (err) {
    inflight.delete(applicationId);
    throw err;
  }
}

async function enqueueMany(db, items, { req, res } = {}) {
  const statuses = [];
  let queued = 0;
  let reused = 0;
  for (const item of items) {
    const before = pending.length;
    const status = await enqueue(db, item, { req, res });
    statuses.push(status);
    if (status?.cached || (status?.state === 'completed' && pending.length === before)) reused += 1;
    else queued += 1;
  }
  return { statuses, queued, reused };
}

async function resumeIfNeeded(db, applicationId, origin, { req, res } = {}) {
  const application = await db.getApplication(applicationId);
  const status = application?.analysisStatus || application?.analysis_status;
  if (running.has(applicationId)) return status || buildStatus('PROCESSING_DOCUMENTS', { origin });
  if (!isActive(status)) return status || null;
  const item = {
    applicationId,
    jobId: application.jobId || application.job_id,
    origin: origin || status.origin,
    batchId: status.batch_id,
  };
  const work = processOne(db, item);
  if (process.env.VERCEL) {
    await work.catch(() => {});
  } else {
    defer(req, res, () => work);
  }
  const latest = await db.getApplication(applicationId);
  return latest?.analysisStatus || latest?.analysis_status || status;
}

function createMemoryQueue(processFn) {
  const items = [];
  let busy = false;
  const log = [];
  async function run() {
    if (busy) return;
    busy = true;
    try {
      while (items.length) {
        const job = items.shift();
        log.push(`start:${job.id}`);
        await processFn(job);
        log.push(`end:${job.id}`);
      }
    } finally {
      busy = false;
    }
  }
  return {
    log,
    async enqueue(job) {
      items.push(job);
      await Promise.resolve();
      setImmediate(run);
    },
    async idle() {
      for (let i = 0; i < 200; i += 1) {
        if (!busy && !items.length) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
  };
}

module.exports = {
  enqueue,
  enqueueMany,
  resumeIfNeeded,
  kick,
  createMemoryQueue,
  writeStatus,
  isClaimed,
  claimApplication,
  releaseApplication,
};
