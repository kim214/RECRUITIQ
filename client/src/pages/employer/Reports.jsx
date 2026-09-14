import { useEffect, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import StatCard from '../../components/StatCard.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';

export default function Reports() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.employerStats().then(setStats).catch(() => setStats({}));
  }, []);

  return (
    <PortalLayout role="employer" title="Reports">
      {!stats ? <Loader /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Applications" value={stats.totalApplications} />
          <StatCard label="Shortlisted" value={stats.shortlisted} accent="rose" />
          <StatCard label="Hired" value={stats.hired} accent="teal" />
          <StatCard label="Rejected" value={stats.rejected} accent="amber" />
        </div>
      )}
    </PortalLayout>
  );
}
