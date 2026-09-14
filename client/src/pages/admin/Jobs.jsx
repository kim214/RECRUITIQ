import { useEffect, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';

export default function AdminJobs() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    api.getJobs().then(setJobs).catch(() => setJobs([]));
  }, []);
  return (
    <PortalLayout role="admin" title="Jobs">
      {!jobs ? <Loader /> : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Employer</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{j.title}</td>
                  <td className="px-4 py-3">{j.employerName || '—'}</td>
                  <td className="px-4 py-3">{j.location || 'Remote'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  );
}
