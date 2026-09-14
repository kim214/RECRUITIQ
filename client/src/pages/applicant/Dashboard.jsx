import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';

export default function ApplicantDashboard() {
  const { user } = useAuth();
  const [apps, setApps] = useState(null);

  useEffect(() => {
    api.getApplications().then(setApps).catch(() => setApps([]));
  }, []);

  const list = apps || [];
  const pending = list.filter((a) => ['submitted', 'ai_screening'].includes(a.status)).length;

  return (
    <PortalLayout role="applicant" title="Applicant Dashboard" action={<Link to="/applicant/jobs" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Browse Jobs</Link>}>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-700 to-cyan-700 p-6 text-white">
        <h2 className="text-2xl font-extrabold">Hello{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}</h2>
        <p className="text-emerald-50">Track applications and discover new roles.</p>
      </div>
      {!apps ? <Loader /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Applications" value={list.length} href="/applicant/applications" accent="teal" />
            <StatCard label="In review" value={pending} href="/applicant/applications" accent="amber" />
            <StatCard label="Open jobs" value="Browse" href="/applicant/jobs" />
          </div>
          <section className="mt-8 rounded-2xl bg-white p-5 shadow-card">
            <h3 className="mb-4 font-bold">Recent applications</h3>
            <div className="space-y-2">
              {list.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3">
                  <div>
                    <div className="font-semibold">{a.jobTitle}</div>
                    <div className="text-xs text-ink-500">{formatDate(a.createdAt)}</div>
                  </div>
                  <Badge>{a.stageLabel}</Badge>
                </div>
              ))}
              {!list.length && <p className="text-sm text-ink-500">You haven’t applied yet.</p>}
            </div>
          </section>
        </>
      )}
    </PortalLayout>
  );
}
