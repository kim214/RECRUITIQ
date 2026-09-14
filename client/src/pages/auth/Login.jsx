import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { dashboardPath, useAuth } from '../../auth/AuthContext.jsx';
import { clearAuthStorage } from '../../api/client.js';

export default function Login() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const expired = params.get('expired') === '1';

  useEffect(() => {
    if (expired) clearAuthStorage();
  }, [expired]);

  useEffect(() => {
    if (ready && user && !expired) navigate(dashboardPath(user.role), { replace: true });
  }, [ready, user, expired, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setBusy(true);
    setError('');
    try {
      const next = await login(form.get('email'), form.get('password'));
      navigate(dashboardPath(next.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back to smarter hiring"
      subtitle="Sign in to access your dashboard, manage applications, and leverage AI-powered candidate insights."
      perks={['AI-ranked candidate shortlists', 'Real-time application tracking', 'Secure document management']}
    >
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-white shadow-glow">
        <p className="text-2xl font-extrabold">Login</p>
        <p className="mt-1 text-sm text-slate-400">Sign in to your RecruitIQ account</p>
        {expired && <p className="mt-4 rounded-lg bg-sky-500/20 px-3 py-2 text-sm text-sky-200">Your session expired. Please log in again.</p>}
        {error && <p className="mt-4 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <input name="email" type="email" required placeholder="Email" className="mt-6 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-emerald-400" />
        <input name="password" type="password" required placeholder="Password" className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-emerald-400" />
        <div className="mt-5 flex gap-3">
          <button disabled={busy} className="flex-1 rounded-xl bg-emerald-400 py-3 font-bold text-ink-900 disabled:opacity-60">{busy ? 'Signing in...' : 'Login'}</button>
          <Link to="/register" className="flex-1 rounded-xl border border-white/20 py-3 text-center font-semibold">Sign Up</Link>
        </div>
        <p className="mt-5 text-center text-xs text-slate-500">Demo: employer@reqruit.com / employer123</p>
      </form>
    </AuthLayout>
  );
}
