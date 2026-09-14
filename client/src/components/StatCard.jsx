import { Link } from 'react-router-dom';

const accents = {
  teal: 'from-emerald-50 to-white text-emerald-700',
  amber: 'from-amber-50 to-white text-amber-700',
  rose: 'from-rose-50 to-white text-rose-700',
  violet: 'from-violet-50 to-white text-violet-700',
  brand: 'from-indigo-50 to-white text-brand-600',
};

export default function StatCard({ label, value, href, accent = 'brand', icon }) {
  const body = (
    <div className={`rounded-2xl border border-slate-100 bg-gradient-to-br ${accents[accent]} p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-2 text-3xl font-extrabold text-ink-800">{value ?? '—'}</p>
        </div>
        {icon && <div className="rounded-xl bg-white/80 p-2.5 text-current shadow-sm">{icon}</div>}
      </div>
    </div>
  );
  return href ? <Link to={href}>{body}</Link> : body;
}
