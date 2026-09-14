import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import CandidateModal from '../../components/CandidateModal.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';

export default function EmployerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  async function load() {
    const [stats, jobs, activity] = await Promise.all([api.employerStats(), api.getMyJobs(), api.getActivity()]);
    setData({ stats, jobs, activity });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  return (
    <PortalLayout
      role="employer"
      title="Employer Dashboard"
      subtitle="Manage hiring, candidates & AI rankings"
      action={<Link to="/employer/jobs/new" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">+ Post New Job</Link>}
    >
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-brand-600 to-cyan-600 p-6 text-white">
        <h2 className="text-2xl font-extrabold">Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}</h2>
        <p className="mt-1 text-indigo-100">Post roles, review applicants, and let AI rank your shortlist.</p>
      </div>
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!data ? <Loader /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active Jobs" value={data.stats.activeJobs ?? data.stats.totalJobs} href="/employer/jobs/new" accent="teal" />
            <StatCard label="Applications" value={data.stats.totalApplications} href="/employer/candidates" />
            <StatCard label="Pending Review" value={data.stats.pendingReview} href="/employer/rankings" accent="amber" />
            <StatCard label="Shortlisted" value={data.stats.shortlisted} href="/employer/shortlist" accent="rose" />
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="mb-4 font-bold">Recent Activity</h3>
              <div className="space-y-2">
                {(data.activity || []).slice(0, 8).map((a) => (
                  <button key={a.id} onClick={() => setSelected(a.id)} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50">
                    <div className="font-semibold">{a.applicantName || a.message}</div>
                    <div className="text-xs text-ink-500">{a.jobTitle} · {formatDate(a.createdAt)}</div>
                  </button>
                ))}
                {!data.activity?.length && <p className="text-sm text-ink-500">No recent activity.</p>}
              </div>
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="mb-4 font-bold">Your Jobs</h3>
              <div className="space-y-2">
                {data.jobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3">
                    <div>
                      <div className="font-semibold">{j.title}</div>
                      <div className="text-xs text-ink-500">{j.location || 'Remote'}</div>
                    </div>
                    <Link to={`/employer/rankings?job=${j.id}`} className="text-sm font-semibold text-brand-600">Rankings</Link>
                  </div>
                ))}
                {!data.jobs.length && <p className="text-sm text-ink-500">No jobs yet. Post your first role.</p>}
              </div>
            </section>
          </div>
        </>
      )}
      {selected && <CandidateModal applicationId={selected} onClose={() => setSelected(null)} onUpdated={load} />}
    </PortalLayout>
  );
}
