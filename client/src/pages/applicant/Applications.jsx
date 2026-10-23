import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';
import { formatRecordDate, recommendationLabel } from '../../utils/format.js';

export default function Applications() {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    api.getApplications().then(setApps).catch(() => setApps([]));
  }, []);

  return (
    <PortalLayout role="applicant" title="My Applications">
      {!apps ? <Loader /> : !apps.length ? (
        <EmptyState icon="📄" title="No applications yet" message="Browse open jobs and apply with your resume." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">AI Score</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{a.jobTitle}</td>
                  <td className="px-4 py-3"><Badge>{a.stageLabel}</Badge></td>
                  <td className="px-4 py-3">
                    {a.aiScore != null
                      ? `${Math.round(a.aiScore)}% · ${a.analysis?.matchLabel || recommendationLabel(a.aiScore, a.analysis?.recommendation)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{formatRecordDate(a)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-ink-500">{a.analysis?.summary || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {['interview_scheduled', 'interview'].includes(a.status) ? (
                      <Link to="/applicant/interviews" className="font-semibold text-brand-600">View interview</Link>
                    ) : ['shortlisted', 'hired'].includes(a.status) ? (
                      <Link to="/applicant/notifications" className="font-semibold text-brand-600">Updates</Link>
                    ) : null}
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
