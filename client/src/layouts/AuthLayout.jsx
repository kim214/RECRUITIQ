import Logo from '../components/Logo.jsx';

export default function AuthLayout({ title, subtitle, perks, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-ink-900 via-indigo-950 to-indigo-800 p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="relative max-w-md">
          <Logo variant="dark" className="mb-10 h-12" />
          <h2 className="text-3xl font-extrabold leading-tight">{title}</h2>
          <p className="mt-4 text-slate-300">{subtitle}</p>
          <ul className="mt-8 space-y-3 text-sm">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="flex flex-col items-center justify-center bg-ink-950 px-5 py-10">
        <div className="mb-6 lg:hidden">
          <Logo variant="dark" className="h-10" />
        </div>
        {children}
      </div>
    </div>
  );
}
