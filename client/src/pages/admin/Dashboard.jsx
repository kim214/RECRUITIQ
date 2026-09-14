import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.adminStats(),
      api.getUsers(),
      api.getJobs(),
      api.getApplications(),
      api.getAiStatus().catch(() => ({ available: false })),
    ])
      .then(([stats, users, jobs, applications, ai]) => {
        setData({ stats, users, jobs, applications, ai });
      })
      .catch((e) => {
        setError(e.message);
        setData({ stats: {}, users: [], jobs: [], applications: [], ai: { available: false } });
      });
  }, []);

  const llm = data?.ai?.llm || data?.ai || {};

  return (
    <PortalLayout role="admin" title="Admin Dashboard" subtitle="Platform health, people, and hiring activity">
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-violet-700 to-brand-600 p-6 text-white">
        <h2 className="text-2xl font-extrabold">Welcome{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}</h2>
        <p className="mt-1 text-violet-100">Create users, assign roles, suspend accounts, and keep listings in order.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/admin/users" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700">Manage users</Link>
          <Link to="/admin/jobs" className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white">Moderate jobs</Link>
        </div>
      </div>
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!data ? <Loader /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Users" value={data.stats.totalUsers} href="/admin/users" accent="violet" />
            <StatCard label="Employers" value={data.stats.employers} accent="teal" />
            <StatCard label="Applicants" value={data.stats.applicants} />
            <StatCard label="Suspended" value={data.stats.bannedUsers} href="/admin/users" accent="rose" />
            <StatCard label="Open jobs" value={data.stats.openJobs ?? data.stats.totalJobs} href="/admin/jobs" accent="amber" />
            <StatCard label="Applications" value={data.stats.totalApplications} href="/admin/applications" accent="teal" />
            <StatCard label="AI analyzed" value={data.stats.analyzedApplications} accent="violet" />
            <StatCard label="Admins" value={data.stats.admins} />
          </div>

          <div className={`mt-6 rounded-2xl border p-4 ${llm.available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">AI ranking {llm.available ? 'connected' : 'unavailable'}</p>
            <p className="text-sm opacity-80">
              {llm.available
                ? `Model ${llm.model || llm.currentModel || 'Ollama'} is reachable for candidate ranking.`
                : 'The ranking service is offline. Employers can still post jobs and collect applications.'}
            </p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold">Recent users</h3>
                <Link to="/admin/users" className="text-sm font-semibold text-brand-600">View all</Link>
              </div>
              <div className="space-y-2">
                {data.users.slice(0, 6).map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                    <div>
                      <div className="font-semibold">{u.fullName}</div>
                      <div className="text-xs text-ink-500">{u.email} · {formatDate(u.createdAt)}</div>
                    </div>
                    <Badge tone={(u.status || 'active') === 'banned' ? 'danger' : 'brand'}>{u.status === 'banned' ? 'suspended' : u.role}</Badge>
                  </div>
                ))}
                {!data.users.length && <p className="text-sm text-ink-500">No users yet.</p>}
              </div>
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold">Latest applications</h3>
                <Link to="/admin/applications" className="text-sm font-semibold text-brand-600">View all</Link>
              </div>
              <div className="space-y-2">
                {data.applications.slice(0, 6).map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-100 px-3 py-2">
                    <div className="font-semibold">{a.applicantName}</div>
                    <div className="text-xs text-ink-500">{a.jobTitle} · {a.stageLabel || a.status} · {formatDate(a.appliedAt)}</div>
                  </div>
                ))}
                {!data.applications.length && <p className="text-sm text-ink-500">No applications yet.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </PortalLayout>
  );
}
