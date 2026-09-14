import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const links = [
  { to: '/features', label: 'Features' },
  { to: '/#how-it-works', label: 'How it works', hash: true },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicLayout({ children }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-white to-cyan-50/40">
      <nav className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo variant="light" className="h-11" />
          <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className={`${open ? 'flex' : 'hidden'} absolute left-0 right-0 top-full flex-col gap-3 border-b border-slate-100 bg-white p-4 md:static md:flex md:flex-row md:items-center md:gap-6 md:border-0 md:bg-transparent md:p-0`}>
            {links.map((l) =>
              l.hash ? (
                <Link key={l.label} to={l.to} className="text-sm font-medium text-ink-500 hover:text-brand-600" onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              ) : (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-brand-600' : 'text-ink-500 hover:text-brand-600'}`} onClick={() => setOpen(false)}>
                  {l.label}
                </NavLink>
              )
            )}
            {user ? (
              <Link to={`/${user.role === 'admin' ? 'admin' : user.role}`} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg border-2 border-slate-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-brand-500 hover:text-brand-600">
                  Login
                </Link>
                <Link to="/register" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-glow hover:bg-brand-600">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
      <main key={location.pathname}>{children}</main>
      <footer className="mt-16 bg-ink-900 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo variant="dark" className="mb-4 h-11" />
            <p className="text-sm leading-relaxed text-slate-400">AI-powered recruitment platform helping teams hire smarter and job seekers land the right roles faster.</p>
          </div>
          <div>
            <h4 className="mb-3 font-bold text-white">Product</h4>
            <div className="flex flex-col gap-2 text-sm">
              <Link to="/features">Features</Link>
              <Link to="/#how-it-works">How it works</Link>
            </div>
          </div>
          <div>
            <h4 className="mb-3 font-bold text-white">Company</h4>
            <div className="flex flex-col gap-2 text-sm">
              <Link to="/about">About us</Link>
              <Link to="/contact">Contact</Link>
            </div>
          </div>
          <div>
            <h4 className="mb-3 font-bold text-white">Account</h4>
            <div className="flex flex-col gap-2 text-sm">
              <Link to="/login">Login</Link>
              <Link to="/register">Sign up</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-500">© 2026 RecruitIQ. All rights reserved.</div>
      </footer>
    </div>
  );
}
