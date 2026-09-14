import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';

function Bar({ label, value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="capitalize text-ink-600">{label}</span>
        <span className="font-semibold text-ink-800">{value} ({pct}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.adminStats(), api.getUsers(), api.getApplications(), api.getJobs()])
      .then(([stats, users, applications, jobs]) => setData({ stats, users, applications, jobs }))
      .catch((e) => {
        setError(e.message);
        setData({ stats: {}, users: [], applications: [], jobs: [] });
      });
  }, []);

  const roleCounts = useMemo(() => {
    const counts = { admin: 0, employer: 0, applicant: 0 };
    (data?.users || []).forEach((u) => { counts[u.role] = (counts[u.role] || 0) + 1; });
    return counts;
  }, [data]);

  const stageCounts = useMemo(() => {
    const counts = {};
    (data?.applications || []).forEach((a) => {
      const key = a.stageLabel || a.status || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [data]);

  const stats = data?.stats || {};
  const userTotal = data?.users?.length || 0;
  const appTotal = data?.applications?.length || 0;

  return (
    <PortalLayout role="admin" title="Analytics" subtitle="Hiring volume, user mix, and pipeline health">
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!data ? <Loader /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total users" value={stats.totalUsers} accent="violet" href="/admin/users" />
            <StatCard label="Total jobs" value={stats.totalJobs} href="/admin/jobs" />
            <StatCard label="Applications" value={stats.totalApplications} accent="teal" href="/admin/applications" />
            <StatCard label="Shortlisted" value={stats.shortlistedTotal} accent="amber" />
            <StatCard label="AI analyzed" value={stats.analyzedApplications} accent="violet" />
            <StatCard label="Open jobs" value={stats.openJobs} accent="teal" />
            <StatCard label="Suspended users" value={stats.bannedUsers} accent="rose" />
            <StatCard label="Avg apps / job" value={stats.avgAppsPerJob} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="mb-4 font-bold">Users by role</h3>
              <div className="space-y-4">
                <Bar label="Admins" value={roleCounts.admin} total={userTotal} color="bg-violet-500" />
                <Bar label="Employers" value={roleCounts.employer} total={userTotal} color="bg-emerald-500" />
                <Bar label="Applicants" value={roleCounts.applicant} total={userTotal} color="bg-sky-500" />
              </div>
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="mb-4 font-bold">Applications by stage</h3>
              <div className="space-y-4">
                {Object.keys(stageCounts).length ? Object.entries(stageCounts).map(([label, value]) => (
                  <Bar key={label} label={label} value={value} total={appTotal} color="bg-brand-500" />
                )) : <p className="text-sm text-ink-500">No applications yet.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </PortalLayout>
  );
}
