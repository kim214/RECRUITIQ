export default function Badge({ children, tone = 'info' }) {
  const tones = {
    info: 'bg-sky-100 text-sky-800',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-rose-100 text-rose-800',
    brand: 'bg-brand-100 text-brand-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone] || tones.info}`}>
      {children}
    </span>
  );
}
