import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import JobSelect from '../../components/JobSelect.jsx';
import CandidateModal from '../../components/CandidateModal.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { recommendationLabel, isAnalysisLive, applicantLabel } from '../../utils/format.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'ai_screening', label: 'AI Screening' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'interview_scheduled', label: 'Interview' },
  { id: 'hired', label: 'Hired' },
  { id: 'rejected', label: 'Rejected' },
];

export default function Candidates() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job') || '';
  const [apps, setApps] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  async function load(id) {
    if (!id) return setApps([]);
    const rows = await api.jobApplications(id);
    setApps(rows);
  }

  useEffect(() => {
    if (!jobId) return;
    load(jobId).catch((e) => setError(e.message));
  }, [jobId]);

  const live = apps.some((a) => isAnalysisLive(a.analysisStatus));
  useEffect(() => {
    if (!jobId || !live) return undefined;
    const timer = setInterval(() => {
      load(jobId).catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, live]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return apps.filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (!q) return true;
      return applicantLabel(a).toLowerCase().includes(q) || String(a.id || '').toLowerCase().includes(q);
    });
  }, [apps, query, filter]);

  return (
    <PortalLayout role="employer" title="Candidates">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <JobSelect value={jobId} onChange={(id) => setParams(id ? { job: id } : {})} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicant ID" className="w-full max-w-sm rounded-xl border-2 border-slate-200 px-3 py-2.5" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.id ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-600'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!jobId ? (
        <EmptyState icon="👥" title="Select a job" message="Choose a job to review its applicants." />
      ) : !filtered.length ? (
        <EmptyState icon="👥" title="No candidates" message="No candidates match your filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Applicant ID</th>
                <th className="px-4 py-3">Privacy</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">AI Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono font-semibold">{applicantLabel(a)}</td>
                  <td className="px-4 py-3"><Badge>Sealed</Badge></td>
                  <td className="px-4 py-3"><Badge>{a.stageLabel}</Badge></td>
                  <td className="px-4 py-3">
                    {isAnalysisLive(a.analysisStatus)
                      ? a.analysisStatus.label
                      : a.aiScore != null
                        ? `${Math.round(a.aiScore)}% · ${a.analysis?.matchLabel || recommendationLabel(a.aiScore, a.analysis?.recommendation)}`
                        : '—'}
                  </td>
                  <td className="px-4 py-3"><button onClick={() => setSelected(a.id)} className="rounded-lg border px-3 py-1 text-xs font-semibold">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && <CandidateModal applicationId={selected} onClose={() => setSelected(null)} onUpdated={() => load(jobId)} />}
    </PortalLayout>
  );
}
