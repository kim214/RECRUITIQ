import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Loader from '../../components/Loader.jsx';
import InterviewScheduler from '../../components/InterviewScheduler.jsx';
import MessageThread from '../../components/MessageThread.jsx';
import { api } from '../../api/client.js';
import { formatDateTime, interviewTone, mapsSearchUrl, rsvpTone, applicantLabel } from '../../utils/format.js';

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'past', label: 'Past' },
];

function isSameDay(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function EmployerInterviews() {
  const [params] = useSearchParams();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('upcoming');
  const [selectedId, setSelectedId] = useState(params.get('interview') || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await api.getInterviews();
    setItems(rows);
    return rows;
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setItems([]);
    });
  }, []);

  const selected = (items || []).find((row) => row.id === selectedId) || (items || []).find((row) => row.status === 'scheduled') || null;

  const visible = useMemo(() => {
    const list = items || [];
    const now = Date.now();
    if (filter === 'today') return list.filter((row) => isSameDay(row.startsAt) && row.status !== 'cancelled');
    if (filter === 'past') return list.filter((row) => new Date(row.startsAt).getTime() < now || row.status !== 'scheduled');
    return list.filter((row) => row.status === 'scheduled' && new Date(row.startsAt).getTime() >= now - 60 * 60 * 1000);
  }, [items, filter]);

  async function setStatus(id, status) {
    setBusy(true);
    setError('');
    try {
      await api.updateInterview(id, { status });
      const rows = await load();
      setSelectedId((current) => current || rows[0]?.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalLayout
      role="employer"
      title="Interviews"
      subtitle="Schedule, host, and follow up after shortlisting"
      action={<Link to="/employer/shortlist" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-ink-700">Back to shortlist</Link>}
    >
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!items ? <Loader /> : !items.length ? (
        <EmptyState
          icon="📅"
          title="No interviews yet"
          message="Shortlist a candidate, then schedule an online or on-site interview. The applicant is notified with everything they need to join."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-3">
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.id ? 'bg-brand-500 text-white' : 'bg-white text-ink-600 shadow-sm'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {visible.map((row) => (
                <button
                  key={row.id}
                  onClick={() => { setSelectedId(row.id); setEditing(false); }}
                  className={`w-full rounded-2xl border p-4 text-left shadow-sm ${selected?.id === row.id ? 'border-brand-400 bg-white ring-2 ring-brand-100' : 'border-slate-100 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono font-semibold text-ink-800">{applicantLabel(row)}</div>
                    <Badge tone={interviewTone(row.status)}>{row.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{row.jobTitle}</p>
                  <p className="mt-2 text-sm font-medium text-ink-700">{formatDateTime(row.startsAt)}</p>
                  <p className="text-xs capitalize text-ink-500">{row.mode} · {row.durationMinutes} min · RSVP {row.rsvp}</p>
                </button>
              ))}
              {!visible.length && <p className="rounded-xl bg-white p-4 text-sm text-ink-500">Nothing in this view.</p>}
            </div>
          </aside>

          {selected && (
            <section className="space-y-4">
              <div className="overflow-hidden rounded-3xl bg-white shadow-card">
                <div className="bg-gradient-to-r from-brand-600 to-cyan-600 px-6 py-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Hiring interview</p>
                  <h2 className="mt-1 font-mono text-2xl font-extrabold">{applicantLabel(selected)}</h2>
                  <p className="text-indigo-100">{selected.jobTitle} · {formatDateTime(selected.startsAt)} · {selected.durationMinutes} minutes</p>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Applicant</p>
                    <p className="mt-1 font-mono font-semibold">{applicantLabel(selected)}</p>
                    <p className="text-sm text-ink-500">Identity sealed — contact through RecruitIQ only</p>
                    {selected.aiScore != null && (
                      <p className="mt-2 text-sm font-semibold text-ink-700">AI match {Math.round(selected.aiScore)}%</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone={rsvpTone(selected.rsvp)}>RSVP {selected.rsvp}</Badge>
                      <Badge tone={interviewTone(selected.status)}>{selected.status}</Badge>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">How you will run it</p>
                    {selected.mode === 'online' ? (
                      <>
                        <p className="mt-1 font-semibold">Online meeting</p>
                        <p className="mt-1 break-all text-sm text-ink-600">{selected.meetingUrl}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a href={selected.meetingUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white">
                            Open meeting room
                          </a>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(selected.meetingUrl || '')}
                            className="rounded-lg border px-3 py-2 text-sm font-semibold"
                          >
                            Copy link
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-ink-500">Start the room a few minutes early. The candidate sees a Join button on their side.</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 font-semibold">On-site</p>
                        <p className="mt-1 text-sm text-ink-600">{selected.location}</p>
                        {mapsSearchUrl(selected.location) && (
                          <a href={mapsSearchUrl(selected.location)} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold">
                            Open in maps
                          </a>
                        )}
                        <p className="mt-2 text-xs text-ink-500">Share reception instructions in the candidate notes so they know where to go.</p>
                      </>
                    )}
                  </div>
                  {selected.employerNotes && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Private interviewer notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{selected.employerNotes}</p>
                    </div>
                  )}
                  {selected.applicantInstructions && (
                    <div className="rounded-2xl border border-slate-100 p-4 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Shared with candidate</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{selected.applicantInstructions}</p>
                    </div>
                  )}
                </div>
                {selected.status === 'scheduled' && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 px-6 py-4">
                    <button disabled={busy} onClick={() => setEditing((v) => !v)} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white">
                      {editing ? 'Hide scheduler' : 'Reschedule'}
                    </button>
                    <button disabled={busy} onClick={() => setStatus(selected.id, 'completed')} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white">
                      Mark complete
                    </button>
                    <button disabled={busy} onClick={() => setStatus(selected.id, 'cancelled')} className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white">
                      Cancel interview
                    </button>
                  </div>
                )}
              </div>
              {editing && selected.status === 'scheduled' && (
                <InterviewScheduler
                  application={{ id: selected.applicationId, applicantName: applicantLabel(selected), applicantCode: selected.applicantCode }}
                  existing={selected}
                  onCancel={() => setEditing(false)}
                  onSaved={async () => {
                    setEditing(false);
                    await load();
                  }}
                />
              )}
              <MessageThread applicationId={selected.applicationId} viewerRole="employer" />
            </section>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
