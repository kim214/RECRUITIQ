const INTERVIEW_MODES = ['online', 'onsite'];
const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled'];
const INTERVIEW_RSVPS = ['pending', 'confirmed', 'declined'];

function hiringMissingError(err) {
  const msg = String(err?.message || err || '');
  if (/relation .*interviews|could not find the table.*interviews/i.test(msg)) {
    return new Error('Database is missing interviews. Run supabase/add-hiring-flow.sql in the SQL Editor.');
  }
  if (/relation .*notifications|could not find the table.*notifications/i.test(msg)) {
    return new Error('Database is missing notifications. Run supabase/add-hiring-flow.sql in the SQL Editor.');
  }
  if (/relation .*messages|could not find the table.*messages/i.test(msg)) {
    return new Error('Database is missing messages. Run supabase/add-hiring-flow.sql in the SQL Editor.');
  }
  return err instanceof Error ? err : new Error(msg || 'Hiring data error');
}

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function validateInterviewInput(body = {}, { allowPast = false } = {}) {
  const mode = String(body.mode || '').trim();
  if (!INTERVIEW_MODES.includes(mode)) {
    throw httpError('Choose an online or on-site interview.');
  }
  const startsAt = body.startsAt || body.starts_at;
  const when = new Date(startsAt);
  if (!startsAt || Number.isNaN(when.getTime())) {
    throw httpError('Pick a valid interview date and time.');
  }
  if (!allowPast && when.getTime() < Date.now() - 60 * 1000) {
    throw httpError('Interview time must be in the future.');
  }
  const durationMinutes = Math.min(240, Math.max(15, Number(body.durationMinutes || body.duration_minutes || 45)));
  const meetingUrl = String(body.meetingUrl || body.meeting_url || '').trim();
  const location = String(body.location || '').trim();
  if (mode === 'online' && !/^https?:\/\//i.test(meetingUrl)) {
    throw httpError('Online interviews need a meeting link (https://...).');
  }
  if (mode === 'onsite' && location.length < 4) {
    throw httpError('On-site interviews need a location.');
  }
  return {
    mode,
    starts_at: when.toISOString(),
    duration_minutes: durationMinutes,
    meeting_url: mode === 'online' ? meetingUrl : null,
    location: mode === 'onsite' ? location : null,
    applicant_instructions: String(body.applicantInstructions || body.applicant_instructions || '').trim().slice(0, 2000) || null,
    employer_notes: String(body.employerNotes || body.employer_notes || '').trim().slice(0, 4000) || null,
  };
}

function validateInterviewPatch(body = {}, existing = {}) {
  const patch = {};
  const scheduleTouched = [
    'mode', 'startsAt', 'starts_at', 'durationMinutes', 'duration_minutes',
    'meetingUrl', 'meeting_url', 'location', 'applicantInstructions',
    'applicant_instructions', 'employerNotes', 'employer_notes',
  ].some((key) => body[key] !== undefined && body[key] !== null && body[key] !== '');

  if (scheduleTouched) {
    Object.assign(patch, validateInterviewInput({
      mode: body.mode || existing.mode,
      startsAt: body.startsAt || body.starts_at || existing.starts_at,
      durationMinutes: body.durationMinutes || body.duration_minutes || existing.duration_minutes,
      meetingUrl: body.meetingUrl !== undefined ? body.meetingUrl : (body.meeting_url !== undefined ? body.meeting_url : existing.meeting_url),
      location: body.location !== undefined ? body.location : existing.location,
      applicantInstructions: body.applicantInstructions !== undefined ? body.applicantInstructions : existing.applicant_instructions,
      employerNotes: body.employerNotes !== undefined ? body.employerNotes : existing.employer_notes,
    }));
    if (existing.status === 'cancelled') patch.status = 'scheduled';
  } else {
    if (body.employerNotes !== undefined || body.employer_notes !== undefined) {
      patch.employer_notes = String(body.employerNotes || body.employer_notes || '').trim().slice(0, 4000) || null;
    }
    if (body.applicantInstructions !== undefined || body.applicant_instructions !== undefined) {
      patch.applicant_instructions = String(body.applicantInstructions || body.applicant_instructions || '').trim().slice(0, 2000) || null;
    }
  }

  if (body.status) {
    if (!INTERVIEW_STATUSES.includes(body.status)) {
      throw httpError('Invalid interview status.');
    }
    patch.status = body.status;
  }
  if (body.rsvp || body.applicant_rsvp) {
    const rsvp = String(body.rsvp || body.applicant_rsvp);
    if (!INTERVIEW_RSVPS.includes(rsvp)) {
      throw httpError('Choose confirm or decline.');
    }
    patch.applicant_rsvp = rsvp;
  }
  return patch;
}

function joinWindow(startsAt, durationMinutes = 45) {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return { canJoin: false, upcoming: false, ended: true };
  const duration = Math.max(15, Number(durationMinutes) || 45) * 60 * 1000;
  const now = Date.now();
  const opens = start - 15 * 60 * 1000;
  const closes = start + duration + 15 * 60 * 1000;
  return {
    canJoin: now >= opens && now <= closes,
    upcoming: now < opens,
    ended: now > closes,
    opensAt: new Date(opens).toISOString(),
  };
}

function mapInterview(row, extras = {}, { viewerRole } = {}) {
  if (!row) return null;
  const window = joinWindow(row.starts_at, row.duration_minutes);
  const mapped = {
    id: row.id,
    applicationId: row.application_id || extras.applicationId,
    jobId: row.job_id || extras.jobId,
    jobTitle: extras.jobTitle || row.job_title || 'Role',
    company: extras.company || row.company || null,
    employerId: row.employer_id || extras.employerId,
    employerName: extras.employerName || row.employer_name || null,
    applicantId: row.applicant_id || extras.applicantId,
    applicantName: extras.applicantName || row.applicant_name || 'Candidate',
    applicantEmail: extras.applicantEmail || row.applicant_email || '',
    applicantCode: extras.applicantCode || row.applicant_code || null,
    mode: row.mode,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes || 45,
    status: row.status || 'scheduled',
    rsvp: row.applicant_rsvp || 'pending',
    meetingUrl: row.meeting_url || null,
    location: row.location || null,
    applicantInstructions: row.applicant_instructions || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aiScore: extras.aiScore ?? null,
    stageLabel: extras.stageLabel || null,
    canJoin: row.mode === 'online' && row.status === 'scheduled' && window.canJoin,
    joinOpensSoon: row.mode === 'online' && row.status === 'scheduled' && window.upcoming,
  };
  if (viewerRole === 'employer' || viewerRole === 'admin') {
    mapped.employerNotes = row.employer_notes || null;
  }
  return mapped;
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || '',
    link: row.link || null,
    read: Boolean(row.read_at),
    readAt: row.read_at || null,
    createdAt: row.created_at,
    meta: row.meta || null,
  };
}

function mapMessage(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    senderId: row.sender_id,
    senderName: extras.senderName || 'Someone',
    senderRole: extras.senderRole || null,
    mine: extras.mine === true,
    body: row.body,
    createdAt: row.created_at,
  };
}

function statusNotification(status, jobTitle) {
  const title = jobTitle || 'your application';
  if (status === 'shortlisted') {
    return {
      type: 'shortlisted',
      title: 'You have been shortlisted',
      body: `${title} — the employer wants to move you forward. Watch for an interview invite.`,
      link: '/applicant/interviews',
    };
  }
  if (status === 'interview_scheduled' || status === 'interview') {
    return {
      type: 'interview_scheduled',
      title: 'Interview scheduled',
      body: `An interview was scheduled for ${title}. Open Interviews to see time and how to join.`,
      link: '/applicant/interviews',
    };
  }
  if (status === 'rejected') {
    return {
      type: 'rejected',
      title: 'Application update',
      body: `${title} was not taken forward this time.`,
      link: '/applicant/applications',
    };
  }
  if (status === 'hired') {
    return {
      type: 'hired',
      title: 'You have been hired',
      body: `Congratulations — ${title} marked you as hired.`,
      link: '/applicant/applications',
    };
  }
  return null;
}

function interviewInviteNotification({ jobTitle, mode, startsAt, isReschedule }) {
  const when = startsAt
    ? new Date(startsAt).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    : 'soon';
  const place = mode === 'online' ? 'online' : 'on site';
  return {
    type: isReschedule ? 'interview_rescheduled' : 'interview_scheduled',
    title: isReschedule ? 'Interview rescheduled' : 'Interview scheduled',
    body: `${jobTitle || 'Your interview'} is ${place} on ${when}. Open Interviews for details${mode === 'online' ? ' and the join link' : ' and the address'}.`,
    link: '/applicant/interviews',
  };
}

module.exports = {
  INTERVIEW_MODES,
  INTERVIEW_STATUSES,
  INTERVIEW_RSVPS,
  hiringMissingError,
  httpError,
  validateInterviewInput,
  validateInterviewPatch,
  joinWindow,
  mapInterview,
  mapNotification,
  mapMessage,
  statusNotification,
  interviewInviteNotification,
};
