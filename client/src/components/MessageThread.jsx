import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { formatDateTime } from '../utils/format.js';

export default function MessageThread({ applicationId, viewerRole = 'employer' }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await api.getMessages(applicationId);
    setMessages(rows || []);
  }

  useEffect(() => {
    if (!applicationId) return undefined;
    let cancelled = false;
    load().catch((e) => {
      if (!cancelled) setError(e.message);
    });
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applicationId]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const row = await api.sendMessage(applicationId, draft.trim());
      setMessages((prev) => [...prev, row]);
      setDraft('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const hint = viewerRole === 'employer'
    ? 'Messages are delivered as RecruitIQ. The applicant never sees your name.'
    : 'Ask about the interview or next steps. The employer sees only your applicant ID.';

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-sm font-bold text-ink-800">Messages</p>
      <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {!messages.length && <p className="text-xs text-ink-500">No messages yet.</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl px-3 py-2 text-sm ${m.mine ? 'ml-8 bg-brand-500 text-white' : 'mr-8 bg-white text-ink-700 shadow-sm'}`}
          >
            <div className={`text-[11px] font-semibold ${m.mine ? 'text-white/80' : 'text-ink-400'}`}>
              {m.mine ? 'You' : m.senderName} · {formatDateTime(m.createdAt)}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={viewerRole === 'employer' ? 'Write as RecruitIQ…' : 'Ask a question…'}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          maxLength={2000}
        />
        <button disabled={busy || !draft.trim()} className="rounded-lg bg-ink-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}
