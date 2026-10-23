const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');
const { resolveUserId } = require('../lib/resolveUser');
const { assertApplicationAccess } = require('../lib/access');
const {
  hiringMissingError,
  httpError,
  validateInterviewInput,
  validateInterviewPatch,
  mapInterview,
  mapMessage,
  interviewInviteNotification,
} = require('../lib/hiring');
const {
  applicantCodeOf,
  presentInterview: sealInterview,
  presentMessage,
  employerMessageNotice,
  applicantMessageNotice,
} = require('../lib/privacy');

const router = express.Router();

async function safeNotify(db, payload) {
  try {
    return await db.createNotification(payload);
  } catch (err) {
    console.warn('Notification skipped:', err.message);
    return null;
  }
}

function userDisplay(user) {
  if (!user) return { name: 'Someone', role: null, company: null };
  return {
    name: user.full_name || user.fullName || 'Someone',
    role: user.role || null,
    company: user.company || null,
  };
}

async function presentInterview(db, row, viewerRole) {
  if (!row) return null;
  let app = null;
  try {
    app = await db.getApplication(row.application_id);
  } catch {
    app = null;
  }
  const employer = await db.findUserById(row.employer_id).catch(() => null);
  const employerInfo = userDisplay(employer);
  return sealInterview(mapInterview(row, {
    applicationId: row.application_id,
    jobId: row.job_id,
    jobTitle: app?.jobTitle,
    company: employerInfo.company || 'Employer',
    employerName: employerInfo.company || 'Employer',
    applicantName: app?.applicantName,
    applicantEmail: app?.applicantEmail,
    applicantCode: applicantCodeOf(app || {}),
    aiScore: app?.aiScore ?? null,
    stageLabel: app?.stageLabel || null,
  }, { viewerRole }), viewerRole);
}

async function loadScopedInterview(req, db) {
  const row = await db.getInterview(req.params.id);
  if (!row) {
    throw httpError('Interview not found', 404);
  }
  const app = await db.getApplication(row.application_id);
  if (!app) throw httpError('Interview not found', 404);
  await assertApplicationAccess(req, app);
  return { row, app };
}

router.get('/interviews', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const role = req.user.role;
    const applicationId = req.query.applicationId || undefined;
    let rows;
    if (role === 'employer') {
      rows = await db.listInterviews({ employerId: userId, applicationId });
    } else if (role === 'applicant') {
      rows = await db.listInterviews({ applicantId: userId, applicationId });
    } else if (role === 'admin') {
      rows = await db.listInterviews({ applicationId });
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }
    const items = await Promise.all(rows.map((row) => presentInterview(db, row, role)));
    res.json(items);
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 500).json({ message: wrapped.message });
  }
});

router.post('/interviews', requireRole('employer'), async (req, res) => {
  try {
    const db = getDb();
    const employerId = await resolveUserId(req);
    const applicationId = req.body.applicationId || req.body.application_id;
    if (!applicationId) throw httpError('Application is required.');
    const app = await db.getApplication(applicationId);
    if (!app) throw httpError('Application not found', 404);
    await assertApplicationAccess(req, app, { action: 'update' });
    if (!['shortlisted', 'interview_scheduled', 'interview'].includes(app.status)) {
      throw httpError('Shortlist the candidate before scheduling an interview.');
    }
    const fields = validateInterviewInput(req.body);
    const existing = (await db.listInterviews({ applicationId }))
      .filter((row) => row.status === 'scheduled');
    let row;
    let isReschedule = false;
    if (existing.length) {
      row = await db.updateInterview(existing[0].id, { ...fields, status: 'scheduled', applicant_rsvp: 'pending' });
      isReschedule = true;
    } else {
      row = await db.createInterview({
        application_id: app.id,
        job_id: app.jobId || app.job_id,
        employer_id: employerId,
        applicant_id: app.applicantId || app.applicant_id,
        applicant_rsvp: 'pending',
        status: 'scheduled',
        ...fields,
      });
    }
    if (app.status !== 'interview_scheduled') {
      await db.updateApplicationStatus(app.id, 'interview_scheduled', employerId);
    }
    const invite = interviewInviteNotification({
      jobTitle: app.jobTitle,
      mode: fields.mode,
      startsAt: fields.starts_at,
      isReschedule,
    });
    await safeNotify(db, {
      userId: app.applicantId || app.applicant_id,
      ...invite,
      meta: { applicationId: app.id, interviewId: row.id, jobId: app.jobId || app.job_id },
    });
    res.status(isReschedule ? 200 : 201).json(await presentInterview(db, row, 'employer'));
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 400).json({ message: wrapped.message });
  }
});

router.patch('/interviews/:id', requireRole('employer'), async (req, res) => {
  try {
    const db = getDb();
    const { row, app } = await loadScopedInterview(req, db);
    const patch = validateInterviewPatch(req.body, row);
    if (!Object.keys(patch).length) throw httpError('Nothing to update.');
    if (patch.starts_at && patch.starts_at !== row.starts_at) {
      patch.applicant_rsvp = 'pending';
    }
    const updated = await db.updateInterview(row.id, patch);
    const detailsChanged = ['starts_at', 'mode', 'meeting_url', 'location', 'applicant_instructions']
      .some((key) => patch[key] !== undefined && patch[key] !== row[key]);
    if (detailsChanged && patch.status !== 'cancelled') {
      const invite = interviewInviteNotification({
        jobTitle: app.jobTitle,
        mode: updated.mode,
        startsAt: updated.starts_at,
        isReschedule: Boolean(patch.starts_at && patch.starts_at !== row.starts_at),
      });
      await safeNotify(db, {
        userId: app.applicantId || app.applicant_id,
        ...invite,
        meta: { applicationId: app.id, interviewId: updated.id },
      });
    } else if (patch.status === 'cancelled') {
      await safeNotify(db, {
        userId: app.applicantId || app.applicant_id,
        type: 'interview_cancelled',
        title: 'Interview cancelled',
        body: `The interview for ${app.jobTitle} was cancelled. Check notifications or message the employer if you have questions.`,
        link: '/applicant/interviews',
        meta: { applicationId: app.id, interviewId: updated.id },
      });
    } else if (patch.status === 'completed') {
      await safeNotify(db, {
        userId: app.applicantId || app.applicant_id,
        type: 'interview_completed',
        title: 'Interview marked complete',
        body: `Thanks for attending the ${app.jobTitle} interview. The employer will share next steps.`,
        link: '/applicant/applications',
        meta: { applicationId: app.id, interviewId: updated.id },
      });
    }
    res.json(await presentInterview(db, updated, 'employer'));
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 400).json({ message: wrapped.message });
  }
});

router.patch('/interviews/:id/rsvp', requireRole('applicant'), async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const { row, app } = await loadScopedInterview(req, db);
    if ((app.applicantId || app.applicant_id) !== userId) {
      throw httpError('Interview not found', 404);
    }
    if (row.status !== 'scheduled') {
      throw httpError('This interview is no longer open to RSVP.');
    }
    const patch = validateInterviewPatch({ rsvp: req.body.rsvp || req.body.applicant_rsvp }, row);
    const updated = await db.updateInterview(row.id, patch);
    const confirmed = patch.applicant_rsvp === 'confirmed';
    const code = applicantCodeOf(app);
    await safeNotify(db, {
      userId: row.employer_id,
      type: confirmed ? 'interview_confirmed' : 'interview_declined',
      title: confirmed ? 'Applicant confirmed the interview' : 'Applicant cannot attend',
      body: confirmed
        ? `${code} confirmed the ${app.jobTitle} interview.`
        : `${code} declined the ${app.jobTitle} interview. Reschedule from Interviews.`,
      link: '/employer/interviews',
      meta: { applicationId: app.id, interviewId: updated.id },
    });
    res.json(await presentInterview(db, updated, 'applicant'));
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 400).json({ message: wrapped.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const unreadOnly = String(req.query.unread || '') === '1' || String(req.query.unread || '') === 'true';
    const items = await db.listNotifications(userId, { unreadOnly });
    const unread = unreadOnly ? items : items.filter((n) => !n.read);
    res.json({ items, unreadCount: unread.length });
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 500).json({ message: wrapped.message });
  }
});

router.patch('/notifications/read-all', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const items = await db.markAllNotificationsRead(userId);
    res.json({ items, unreadCount: 0 });
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 500).json({ message: wrapped.message });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const item = await db.markNotificationRead(req.params.id, userId);
    res.json(item);
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || 400).json({ message: wrapped.message });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const applicationId = req.query.applicationId;
    if (!applicationId) {
      return res.status(400).json({ message: 'applicationId is required' });
    }
    const app = await db.getApplication(applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    await assertApplicationAccess(req, app);
    const rows = await db.listMessages(app.id);
    const cache = new Map();
    const items = [];
    const code = applicantCodeOf(app);
    for (const row of rows) {
      if (!cache.has(row.sender_id)) {
        cache.set(row.sender_id, userDisplay(await db.findUserById(row.sender_id).catch(() => null)));
      }
      const sender = cache.get(row.sender_id);
      items.push(presentMessage(mapMessage(row, {
        senderName: sender.name,
        senderRole: sender.role,
        mine: row.sender_id === userId,
      }), { role: req.user.role, applicantCode: code }));
    }
    res.json(items);
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || err.status || 500).json({ message: wrapped.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const db = getDb();
    const userId = await resolveUserId(req);
    const applicationId = req.body.applicationId || req.body.application_id;
    if (!applicationId) throw httpError('Application is required.');
    const app = await db.getApplication(applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    await assertApplicationAccess(req, app, { action: req.user.role === 'employer' ? 'update' : undefined });
    const body = String(req.body.body || '').trim();
    if (body.length < 1) throw httpError('Write a message first.');
    if (body.length > 2000) throw httpError('Messages can be up to 2000 characters.');
    const row = await db.createMessage({ applicationId: app.id, senderId: userId, body });
    const sender = userDisplay(await db.findUserById(userId));
    const code = applicantCodeOf(app);
    const recipientId = req.user.role === 'employer'
      ? (app.applicantId || app.applicant_id)
      : (await db.getJob(app.jobId || app.job_id).then((job) => job?.employerId || job?.employer_id).catch(() => null));
    if (recipientId) {
      const notice = req.user.role === 'employer'
        ? employerMessageNotice(body)
        : applicantMessageNotice(code, body);
      await safeNotify(db, {
        userId: recipientId,
        type: 'message',
        ...notice,
        link: req.user.role === 'employer' ? '/applicant/notifications' : '/employer/interviews',
        meta: { applicationId: app.id },
      });
    }
    res.status(201).json(presentMessage(mapMessage(row, {
      senderName: sender.name,
      senderRole: sender.role,
      mine: true,
    }), { role: req.user.role, applicantCode: code }));
  } catch (err) {
    const wrapped = hiringMissingError(err);
    res.status(wrapped.status || err.status || 400).json({ message: wrapped.message });
  }
});

module.exports = router;
