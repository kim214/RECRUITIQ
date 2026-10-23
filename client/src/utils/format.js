export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRecordDate(record) {
  return formatDate(record?.appliedAt || record?.updatedAt || record?.createdAt);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function applicantLabel(record) {
  return record?.applicantCode || record?.applicantName || 'Applicant';
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'U';
}

export const PIPELINE_COLUMNS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'ai_screening', label: 'AI Screening' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview_scheduled', label: 'Interview' },
  { key: 'hired', label: 'Hired' },
  { key: 'rejected', label: 'Rejected' },
];

export const STAGE_ACTIONS = {
  submitted: [
    { status: 'ai_screening', label: 'Send to AI Screening', className: 'bg-accent-500 text-white' },
    { status: 'shortlisted', label: 'Shortlist', className: 'bg-emerald-500 text-white' },
    { status: 'rejected', label: 'Reject', className: 'bg-rose-500 text-white' },
  ],
  ai_screening: [
    { status: 'shortlisted', label: 'Shortlist', className: 'bg-emerald-500 text-white' },
    { status: 'rejected', label: 'Reject', className: 'bg-rose-500 text-white' },
  ],
  shortlisted: [
    { status: 'interview_scheduled', label: 'Schedule Interview', className: 'bg-brand-500 text-white' },
    { status: 'rejected', label: 'Reject', className: 'bg-rose-500 text-white' },
  ],
  interview_scheduled: [
    { status: 'hired', label: 'Mark Hired', className: 'bg-emerald-500 text-white' },
    { status: 'rejected', label: 'Reject', className: 'bg-rose-500 text-white' },
  ],
};

export function scoreTone(score) {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800';
  if (score >= 60) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

export function recommendationLabel(score, recommendation) {
  const n = Number(score);
  if (Number.isFinite(n)) {
    if (n >= 82) return 'Strong Match';
    if (n >= 68) return 'Good Match';
    if (n >= 48) return 'Potential Match';
    return 'Poor Match';
  }
  const labels = {
    strong_yes: 'Strong Match',
    yes: 'Good Match',
    maybe: 'Potential Match',
    no: 'Poor Match',
  };
  return labels[recommendation] || null;
}

export const ANALYSIS_STEPS = [
  { key: 'QUEUED', label: 'Queued' },
  { key: 'PROCESSING_DOCUMENTS', label: 'Processing documents' },
  { key: 'EXTRACTING_INFORMATION', label: 'Extracting information' },
  { key: 'ANALYZING_REQUIREMENTS', label: 'Analyzing requirements' },
  { key: 'MATCHING_CANDIDATE', label: 'Matching candidate' },
  { key: 'CALCULATING_SCORE', label: 'Calculating score' },
  { key: 'COMPLETED', label: 'Completed' },
];

export function analysisStepIndex(status) {
  if (!status) return -1;
  if (status.state === 'completed' || status.step === 'COMPLETED') return ANALYSIS_STEPS.length - 1;
  const idx = ANALYSIS_STEPS.findIndex((s) => s.key === status.step);
  return idx;
}

export function isAnalysisLive(status) {
  return status?.state === 'queued' || status?.state === 'processing';
}

export function toDatetimeLocalValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultInterviewLocalValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(10);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toDatetimeLocalValue(d);
}

export function mapsSearchUrl(location) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export function interviewTone(status) {
  if (status === 'scheduled') return 'success';
  if (status === 'completed') return 'info';
  if (status === 'cancelled') return 'danger';
  return 'info';
}

export function rsvpTone(rsvp) {
  if (rsvp === 'confirmed') return 'success';
  if (rsvp === 'declined') return 'danger';
  return 'warning';
}

export function notificationTone(type) {
  if (type === 'hired' || type === 'shortlisted' || type === 'interview_confirmed') return 'success';
  if (type === 'rejected' || type === 'interview_cancelled' || type === 'interview_declined') return 'danger';
  if (type === 'message') return 'brand';
  return 'info';
}
