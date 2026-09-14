import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';

const ROLES = ['admin', 'employer', 'applicant'];

function roleTone(role) {
  if (role === 'admin') return 'brand';
  if (role === 'employer') return 'success';
  return 'info';
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'applicant', company: '', password: '' });
  const [created, setCreated] = useState(null);

  async function load() {
    const rows = await api.getUsers();
    setUsers(rows);
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setUsers([]);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && (u.status || 'active') !== statusFilter) return false;
      if (!q) return true;
      return [u.fullName, u.email, u.company, u.role].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [users, query, roleFilter, statusFilter]);

  async function createUser(e) {
    e.preventDefault();
    setBusyId('create');
    setError('');
    setNotice('');
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        company: form.company.trim() || undefined,
      };
      if (form.password.trim()) payload.password = form.password.trim();
      const result = await api.createUser(payload);
      setCreated(result);
      setShowCreate(false);
      setForm({ fullName: '', email: '', role: 'applicant', company: '', password: '' });
      setNotice(result.emailSent
        ? `Account created for ${result.user.email}. A welcome email was sent.`
        : `Account created for ${result.user.email}. Copy the temporary password below — email is not configured.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function changeRole(user, role) {
    if (role === user.role) return;
    if (!window.confirm(`Change ${user.fullName}'s role from ${user.role} to ${role}? They will be emailed.`)) return;
    setBusyId(user.id);
    setError('');
    try {
      const updated = await api.updateUser(user.id, { role });
      setNotice(updated.emailSent
        ? `${user.fullName} is now ${role}. A notification email was sent.`
        : `${user.fullName} is now ${role}. Email was not sent (mail not configured).`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function toggleBan(user) {
    const next = (user.status || 'active') === 'banned' ? 'active' : 'banned';
    const label = next === 'banned' ? 'suspend' : 'reinstate';
    if (!window.confirm(`${label[0].toUpperCase() + label.slice(1)} ${user.fullName}?`)) return;
    setBusyId(user.id);
    setError('');
    try {
      const updated = await api.updateUser(user.id, { status: next });
      setNotice(updated.emailSent
        ? `${user.fullName} was ${next === 'banned' ? 'suspended' : 'reinstated'} and emailed.`
        : `${user.fullName} was ${next === 'banned' ? 'suspended' : 'reinstated'}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Permanently delete ${user.fullName} (${user.email})? This cannot be undone.`)) return;
    setBusyId(user.id);
    setError('');
    try {
      await api.deleteUser(user.id);
      setNotice(`${user.fullName} was removed.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Users"
      subtitle="Create accounts, assign roles, suspend, or remove users"
      action={(
        <button onClick={() => { setShowCreate(true); setError(''); }} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          + Add user
        </button>
      )}
    >
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
      {created?.temporaryPassword && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Temporary password for {created.user.email}</p>
          <p className="mt-1 font-mono text-base">{created.temporaryPassword}</p>
          <p className="mt-1 text-xs">Share this securely. {created.emailSent ? 'It was also emailed to the user.' : 'Configure RESEND_API_KEY or SMTP to email it automatically.'}</p>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, company" className="w-full max-w-sm rounded-xl border-2 border-slate-200 px-3 py-2.5" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-xl border-2 border-slate-200 px-3 py-2.5">
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border-2 border-slate-200 px-3 py-2.5">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Suspended</option>
        </select>
      </div>

      {!users ? <Loader /> : !filtered.length ? (
        <EmptyState icon="👤" title="No users" message="No accounts match your filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const banned = (u.status || 'active') === 'banned';
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{u.fullName}</div>
                      {u.company && <div className="text-xs text-ink-500">{u.company}</div>}
                      {isMe && <div className="text-xs text-brand-600">You</div>}
                    </td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={busyId === u.id || isMe}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm capitalize"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={banned ? 'danger' : roleTone(u.role)}>{banned ? 'suspended' : 'active'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={busyId === u.id || isMe}
                          onClick={() => toggleBan(u)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${banned ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}
                        >
                          {banned ? 'Reinstate' : 'Suspend'}
                        </button>
                        <button
                          disabled={busyId === u.id || isMe}
                          onClick={() => removeUser(u)}
                          className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={createUser}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-extrabold text-ink-800">Add user</h2>
            <p className="mt-1 text-sm text-ink-500">They can sign in immediately with the password you set, or a generated one.</p>
            <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Full name" className="mt-4 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5" />
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="mt-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 capitalize">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {form.role === 'employer' && (
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company (optional)" className="mt-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5" />
            )}
            <input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password (leave blank to auto-generate)" className="mt-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5" />
            <div className="mt-5 flex gap-3">
              <button disabled={busyId === 'create'} className="flex-1 rounded-xl bg-brand-500 py-2.5 font-semibold text-white disabled:opacity-60">
                {busyId === 'create' ? 'Creating...' : 'Create user'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </PortalLayout>
  );
}
