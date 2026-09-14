import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { dashboardPath, useAuth } from '../../auth/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('applicant');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setBusy(true);
    setError('');
    try {
      const next = await register({
        fullName: form.get('fullName'),
        email: form.get('email'),
        password: form.get('password'),
        role,
        company: form.get('company'),
      });
      navigate(dashboardPath(next.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Start hiring — or finding — your next role"
      subtitle="Create a free account in under a minute. Choose your role and get instant access to your portal."
      perks={['Free to get started — no credit card', 'Employer or applicant — your choice', 'AI matching from day one']}
    >
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-white shadow-glow">
        <p className="text-2xl font-extrabold">Sign Up</p>
        {error && <p className="mt-4 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">I am joining as</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {['applicant', 'employer'].map((r) => (
            <button type="button" key={r} onClick={() => setRole(r)} className={`rounded-xl border px-3 py-2 capitalize ${role === r ? 'border-emerald-400 bg-emerald-400/10' : 'border-white/10'}`}>
              {r}
            </button>
          ))}
        </div>
        <input name="fullName" required placeholder="Full name" className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
        {role === 'employer' && (
          <input name="company" placeholder="Company name" className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
        )}
        <input name="email" type="email" required placeholder="Email address" className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
        <input name="password" type="password" required minLength={6} placeholder="Password (6+ characters)" className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none" />
        <div className="mt-5 flex gap-3">
          <button disabled={busy} className="flex-1 rounded-xl bg-emerald-400 py-3 font-bold text-ink-900">{busy ? 'Creating...' : 'Sign Up'}</button>
          <Link to="/login" className="flex-1 rounded-xl border border-white/20 py-3 text-center font-semibold">Login</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
