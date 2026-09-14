import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { formatDateTime } from '../../utils/format.js';

function statusTone(job) {
  if (job.acceptingApplications) return 'success';
  if (job.closedReason === 'deadline') return 'warning';
  return 'danger';
}

function statusLabel(job) {
  if (job.acceptingApplications) return 'Accepting applications';
  if (job.closedReason === 'deadline') return 'Deadline passed';
  return 'Terminated';
}

export default function EmployerJobs() {
  const [params] = useSearchParams();
  const [jobs, setJobs] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [openId, setOpenId] = useState(params.get('posted') || '');

  async function load() {
    setJobs(await api.getMyJobs());
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setJobs([]);
    });
  }, []);

  useEffect(() => {
    if (params.get('posted')) setNotice('Job published and saved. Applicants can apply until the deadline.');
  }, [params]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs || []).filter((j) => {
      if (filter === 'open' && !j.acceptingApplications) return false;
      if (filter === 'closed' && j.acceptingApplications) return false;
      if (!q) return true;
      return [j.title, j.location, j.description].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [jobs, query, filter]);

  async function terminate(job) {
    if (!window.confirm(`Terminate “${job.title}”? Applicants will be told it no longer accepts applications.`)) return;
    setBusyId(job.id);
    setError('');
    try {
      await api.updateJob(job.id, { status: 'closed' });
      setNotice(`${job.title} was terminated.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function reopen(job) {
    setBusyId(job.id);
    setError('');
    try {
      await api.updateJob(job.id, { status: 'open' });
      setNotice(`${job.title} is open again.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <PortalLayout
      role="employer"
      title="My Jobs"
      subtitle="Every posting is stored in the database. Close a role anytime."
      action={<Link to="/employer/jobs/new" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">+ Post Job</Link>}
    >
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your postings" className="w-full max-w-sm rounded-xl border-2 border-slate-200 px-3 py-2.5" />
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'open', label: 'Accepting' },
            { id: 'closed', label: 'Closed' },
          ].map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.id ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-600'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {!jobs ? <Loader /> : !filtered.length ? (
        <EmptyState icon="💼" title="No job postings" message="Publish a role to save it here. You can terminate it later from this page." />
      ) : (
        <div className="space-y-4">
          {filtered.map((j) => (
            <article key={j.id} className="rounded-2xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-ink-800">{j.title}</h3>
                    <Badge tone={statusTone(j)}>{statusLabel(j)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {j.location || 'Remote'} · {j.employmentType || 'Full-time'} · {j.applicationCount ?? 0} applications
                  </p>
                  <p className="mt-1 text-sm text-ink-600">
                    Apply by {formatDateTime(j.applicationDeadline)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setOpenId(openId === j.id ? '' : j.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-ink-700">
                    {openId === j.id ? 'Hide details' : 'View details'}
                  </button>
                  {j.acceptingApplications ? (
                    <button disabled={busyId === j.id} onClick={() => terminate(j)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">
                      Terminate
                    </button>
                  ) : j.closedReason === 'terminated' ? (
                    <button disabled={busyId === j.id} onClick={() => reopen(j)} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-40">
                      Reopen
                    </button>
                  ) : null}
                </div>
              </div>
              {openId === j.id && (
                <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-ink-700">
                  <p className="whitespace-pre-wrap">{j.description}</p>
                  {!!(j.requiredSkills || []).length && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {(j.requiredSkills || []).map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link to={`/employer/candidates?job=${j.id}`} className="font-semibold text-brand-600">Candidates</Link>
                    <Link to={`/employer/rankings?job=${j.id}`} className="font-semibold text-brand-600">AI Rankings</Link>
                    <Link to={`/employer/shortlist?job=${j.id}`} className="font-semibold text-brand-600">Shortlist</Link>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
