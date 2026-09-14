export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
