import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatRecordDate, formatDateTime } from '../../utils/format.js';

export default function ApplicantDashboard() {
  const { user } = useAuth();
  const [apps, setApps] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.getApplications().then(setApps).catch(() => setApps([]));
    api.getInterviews().then(setInterviews).catch(() => setInterviews([]));
    api.getNotifications(true).then((data) => setUnread(data.unreadCount || 0)).catch(() => setUnread(0));
  }, []);

  const list = apps || [];
  const pending = list.filter((a) => ['submitted', 'ai_screening'].includes(a.status)).length;
  const nextInterview = (interviews || [])
    .filter((row) => row.status === 'scheduled')
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))[0];

  return (
    <PortalLayout role="applicant" title="Applicant Dashboard" action={<Link to="/applicant/jobs" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Browse Jobs</Link>}>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-700 to-cyan-700 p-6 text-white">
        <h2 className="text-2xl font-extrabold">Hello{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}</h2>
        <p className="text-emerald-50">Track applications and discover new roles.</p>
        {user?.applicantCode && (
          <p className="mt-2 font-mono text-sm text-emerald-100">Your applicant ID: {user.applicantCode} · employers never see your name</p>
        )}
      </div>
      {!apps ? <Loader /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Applications" value={list.length} href="/applicant/applications" accent="teal" />
            <StatCard label="In review" value={pending} href="/applicant/applications" accent="amber" />
            <StatCard label="Notifications" value={unread} href="/applicant/notifications" />
          </div>
          {nextInterview && (
            <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-700 to-cyan-700 px-5 py-4 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Upcoming interview</p>
                  <p className="text-lg font-extrabold">{nextInterview.jobTitle}</p>
                  <p className="text-sm text-emerald-50">{formatDateTime(nextInterview.startsAt)} · {nextInterview.mode === 'online' ? 'Online' : 'On-site'}</p>
                </div>
                <Link to="/applicant/interviews" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-800">
                  {nextInterview.mode === 'online' ? 'View & join' : 'View details'}
                </Link>
              </div>
            </section>
          )}
          {!nextInterview && list.some((a) => a.status === 'shortlisted') && (
            <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              You’ve been shortlisted. Watch <Link className="font-semibold underline" to="/applicant/notifications">Notifications</Link> for an interview invite.
            </section>
          )}
          <section className="mt-8 rounded-2xl bg-white p-5 shadow-card">
            <h3 className="mb-4 font-bold">Recent applications</h3>
            <div className="space-y-2">
              {list.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3">
                  <div>
                    <div className="font-semibold">{a.jobTitle}</div>
                    <div className="text-xs text-ink-500">{formatRecordDate(a)}</div>
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
