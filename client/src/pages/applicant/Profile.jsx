import PortalLayout from '../../layouts/PortalLayout.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  return (
    <PortalLayout role="applicant" title="Profile">
      <div className="max-w-lg rounded-2xl bg-white p-6 shadow-card">
        <Row label="Full name" value={user?.fullName} />
        <Row label="Email" value={user?.email} />
        <Row label="Role" value={user?.role} />
        {user?.company && <Row label="Company" value={user.company} />}
      </div>
    </PortalLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 font-medium capitalize">{value || '—'}</div>
    </div>
  );
}
