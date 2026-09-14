import { NavLink, Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { initials } from '../utils/format.js';

const NAV = {
  employer: {
    badge: 'Employer Portal',
    items: [
      { to: '/employer', label: 'Dashboard', end: true },
      { to: '/employer/jobs/new', label: 'Post Job' },
      { to: '/employer/candidates', label: 'Candidates' },
      { to: '/employer/shortlist', label: 'Shortlisting' },
      { to: '/employer/rankings', label: 'AI Rankings' },
      { to: '/employer/reports', label: 'Reports' },
    ],
  },
  applicant: {
    badge: 'Applicant Portal',
    items: [
      { to: '/applicant', label: 'Dashboard', end: true },
      { to: '/applicant/jobs', label: 'Browse Jobs' },
      { to: '/applicant/applications', label: 'My Applications' },
      { to: '/applicant/profile', label: 'Profile' },
    ],
  },
  admin: {
    badge: 'Admin Portal',
    items: [
      { to: '/admin', label: 'Dashboard', end: true },
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/jobs', label: 'Jobs' },
      { to: '/admin/applications', label: 'Applications' },
      { to: '/admin/analytics', label: 'Analytics' },
    ],
  },
};

export default function PortalLayout({ role, title, subtitle, action, children }) {
  const { user, logout } = useAuth();
  const nav = NAV[role];
  const sidebarTone =
    role === 'applicant'
      ? 'from-[#0c1222] via-[#0f2a2a] to-[#0d1f1e]'
      : role === 'admin'
        ? 'from-[#0c1222] via-[#1a1035] to-[#150d28]'
        : 'from-[#0c1222] via-[#111827] to-[#0f172a]';

  return (
    <div className="min-h-screen bg-ink-50">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-gradient-to-b ${sidebarTone} text-slate-300 lg:flex`}>
        <div className="border-b border-white/10 px-5 py-5">
          <Logo variant="dark" className="h-9" />
        </div>
        <div className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">{nav.badge}</div>
        <nav className="mt-4 flex-1 space-y-1 px-3">
          {nav.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-white/10 text-white shadow-inner' : 'hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/20 font-bold text-cyan-200">
              {initials(user?.fullName)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{user?.fullName}</div>
              <div className="truncate text-xs capitalize text-slate-400">{user?.role}</div>
            </div>
          </div>
          <button onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-white">
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
          <div>
            <h1 className="text-xl font-extrabold text-ink-800">{title}</h1>
            {subtitle && <p className="text-sm text-ink-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="hidden text-sm text-ink-500 hover:text-brand-600 sm:inline">Home</Link>
            {action}
          </div>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {nav.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-600'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="p-5 md:p-8">{children}</div>
      </div>
    </div>
  );
}
