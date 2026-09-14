import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { formatDate } from '../../utils/format.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'ai_screening', label: 'AI Screening' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'interview_scheduled', label: 'Interview' },
  { id: 'hired', label: 'Hired' },
  { id: 'rejected', label: 'Rejected' },
];

function stageTone(status) {
  if (status === 'hired' || status === 'shortlisted') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'ai_screening') return 'brand';
  if (status === 'interview_scheduled') return 'warning';
  return 'info';
}

export default function AdminApplications() {
  const [apps, setApps] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getApplications().then(setApps).catch((e) => {
      setError(e.message);
      setApps([]);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps || []).filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (!q) return true;
      return [a.applicantName, a.applicantEmail, a.jobTitle].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [apps, query, filter]);

  return (
    <PortalLayout role="admin" title="Applications" subtitle="All candidate applications across employers">
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      <div className="mb-4">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicant, email, or job" className="w-full max-w-sm rounded-xl border-2 border-slate-200 px-3 py-2.5" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.id ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-600'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {!apps ? <Loader /> : !filtered.length ? (
        <EmptyState icon="📄" title="No applications" message="No applications match your filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">AI Score</th>
                <th className="px-4 py-3">Applied</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{a.applicantName}</div>
                    <div className="text-xs text-ink-500">{a.applicantEmail}</div>
                  </td>
                  <td className="px-4 py-3">{a.jobTitle}</td>
                  <td className="px-4 py-3"><Badge tone={stageTone(a.status)}>{a.stageLabel || a.status}</Badge></td>
                  <td className="px-4 py-3">{a.aiScore != null ? Math.round(a.aiScore) : '—'}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(a.appliedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  );
}
