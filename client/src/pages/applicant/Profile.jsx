import PortalLayout from '../../layouts/PortalLayout.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useState } from 'react';

export default function Profile() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!user?.applicantCode) return;
    try {
      await navigator.clipboard.writeText(user.applicantCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PortalLayout role="applicant" title="Profile">
      <div className="max-w-lg space-y-4">
        {user?.applicantCode && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Your applicant ID</p>
            <p className="mt-2 font-mono text-2xl font-extrabold text-ink-800">{user.applicantCode}</p>
            <p className="mt-2 text-sm text-emerald-900">
              Employers never see your name, email, or address. They only see this ID. Keep it if you need support.
            </p>
            <button onClick={copyCode} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
              {copied ? 'Copied' : 'Copy ID'}
            </button>
          </div>
        )}
        <div className="rounded-2xl bg-white p-6 shadow-card">
          <Row label="Full name" value={user?.fullName} privateNote="Visible only to you" />
          <Row label="Email" value={user?.email} privateNote="Visible only to you" />
          <Row label="Role" value={user?.role} />
          {user?.company && <Row label="Company" value={user.company} />}
        </div>
      </div>
    </PortalLayout>
  );
}

function Row({ label, value, privateNote }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 font-medium ${label === 'Role' ? 'capitalize' : ''}`}>{value || '—'}</div>
      {privateNote && <div className="mt-0.5 text-xs text-ink-400">{privateNote}</div>}
    </div>
  );
}
