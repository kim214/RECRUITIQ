import { useEffect, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';

export default function AdminAnalytics() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.adminStats().then(setStats).catch(() => setStats({}));
  }, []);
  return (
    <PortalLayout role="admin" title="Analytics">
      {!stats ? <Loader /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total users" value={stats.totalUsers} accent="violet" />
          <StatCard label="Total jobs" value={stats.totalJobs} />
          <StatCard label="Applications" value={stats.totalApplications} accent="teal" />
        </div>
      )}
    </PortalLayout>
  );
}
