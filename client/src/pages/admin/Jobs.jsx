import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { formatDate } from '../../utils/format.js';

export default function AdminJobs() {
  const [jobs, setJobs] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    setJobs(await api.getJobs());
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setJobs([]);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs || []).filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (!q) return true;
      return [j.title, j.employerName, j.location].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [jobs, query, statusFilter]);

  async function setStatus(job, status) {
    setBusyId(job.id);
    setError('');
    try {
      await api.updateJob(job.id, { status });
      setNotice(`${job.title} is now ${status}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function removeJob(job) {
    if (!window.confirm(`Delete “${job.title}” and its applications?`)) return;
    setBusyId(job.id);
    setError('');
    try {
      await api.deleteJob(job.id);
      setNotice(`${job.title} was deleted.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <PortalLayout role="admin" title="Jobs" subtitle="Review, close, or remove listings across the platform">
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, employer, location" className="w-full max-w-sm rounded-xl border-2 border-slate-200 px-3 py-2.5" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border-2 border-slate-200 px-3 py-2.5">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="draft">Draft</option>
        </select>
      </div>
      {!jobs ? <Loader /> : !filtered.length ? (
        <EmptyState icon="💼" title="No jobs" message="No job listings match your filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Employer</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Apps</th>
                <th className="px-4 py-3">Posted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{j.title}</td>
                  <td className="px-4 py-3">{j.employerName || '—'}</td>
                  <td className="px-4 py-3">{j.location || 'Remote'}</td>
                  <td className="px-4 py-3">{j.applicationCount ?? 0}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(j.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={j.status === 'open' ? 'success' : j.status === 'closed' ? 'danger' : 'warning'}>{j.status || 'open'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {j.status !== 'closed' && (
                        <button disabled={busyId === j.id} onClick={() => setStatus(j, 'closed')} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-40">
                          Close
                        </button>
                      )}
                      {j.status !== 'open' && (
                        <button disabled={busyId === j.id} onClick={() => setStatus(j, 'open')} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-40">
                          Reopen
                        </button>
                      )}
                      <button disabled={busyId === j.id} onClick={() => removeJob(j)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  );
}
