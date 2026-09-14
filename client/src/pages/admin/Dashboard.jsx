import { useEffect, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.adminStats().then(setStats).catch(() => setStats({}));
  }, []);
  return (
    <PortalLayout role="admin" title="Admin Dashboard">
      {!stats ? <Loader /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Users" value={stats.totalUsers} href="/admin/users" accent="violet" />
          <StatCard label="Employers" value={stats.employers} accent="teal" />
          <StatCard label="Applicants" value={stats.applicants} />
          <StatCard label="Open Jobs" value={stats.openJobs ?? stats.totalJobs} href="/admin/jobs" accent="amber" />
        </div>
      )}
    </PortalLayout>
  );
}
