export default function Loader({ message = 'Loading...' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-500">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
