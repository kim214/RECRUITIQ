export default function EmptyState({ icon = '📭', title, message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <h3 className="text-lg font-bold text-ink-800">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{message}</p>
    </div>
  );
}
