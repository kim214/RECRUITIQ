import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Loader from '../../components/Loader.jsx';
import MessageThread from '../../components/MessageThread.jsx';
import { api } from '../../api/client.js';
import { formatDateTime, interviewTone, mapsSearchUrl, rsvpTone } from '../../utils/format.js';

const PREP = [
  'Confirm the time in your calendar',
  'Have a copy of your resume nearby',
  'Prepare 2–3 questions about the role',
  'Join or arrive 5 minutes early',
];

export default function ApplicantInterviews() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const rows = await api.getInterviews();
    setItems(rows);
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setItems([]);
    });
  }, []);

  const next = useMemo(() => {
    const list = (items || []).filter((row) => row.status === 'scheduled');
    return list.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))[0] || null;
  }, [items]);

  async function rsvp(id, value) {
    setBusy(true);
    setError('');
    try {
      await api.rsvpInterview(id, value);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PortalLayout role="applicant" title="Interviews" subtitle="See time, how to join, and talk to the employer">
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!items ? <Loader /> : !items.length ? (
        <EmptyState
          icon="🗓️"
          title="No interviews scheduled"
          message="When an employer shortlists you and books a time, it will appear here with the join link or address."
        />
      ) : (
        <div className="space-y-6">
          {next && (
            <section className="overflow-hidden rounded-3xl bg-white shadow-card">
              <div className="bg-gradient-to-r from-emerald-700 to-cyan-700 px-6 py-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Your next interview</p>
                <h2 className="mt-1 text-2xl font-extrabold">{next.jobTitle}</h2>
                <p className="text-emerald-50">{next.company || 'Employer'} · {formatDateTime(next.startsAt)} · {next.durationMinutes} minutes</p>
              </div>
              <div className="grid gap-4 p-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      {next.mode === 'online' ? 'Join online' : 'Where to go'}
                    </p>
                    {next.mode === 'online' ? (
                      <>
                        <p className="mt-1 text-sm text-ink-600">This is a video interview. Use the button below when it is time — no extra software required beyond the meeting link.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            href={next.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${next.canJoin || !next.joinOpensSoon ? 'bg-emerald-600' : 'bg-slate-400'}`}
                          >
                            {next.canJoin ? 'Join interview' : 'Open meeting link'}
                          </a>
                          <button type="button" onClick={() => copyLink(next.meetingUrl)} className="rounded-lg border px-4 py-2 text-sm font-semibold">
                            {copied ? 'Copied' : 'Copy link'}
                          </button>
                        </div>
                        {next.joinOpensSoon && !next.canJoin && (
                          <p className="mt-2 text-xs text-ink-500">The Join button highlights 15 minutes before start time.</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="mt-1 font-semibold text-ink-800">{next.location}</p>
                        <p className="mt-1 text-sm text-ink-600">Plan to arrive 10 minutes early and check in at reception unless the employer says otherwise.</p>
                        {mapsSearchUrl(next.location) && (
                          <a href={mapsSearchUrl(next.location)} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                            Get directions
                          </a>
                        )}
                      </>
                    )}
                  </div>
                  {next.applicantInstructions && (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">From the employer</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-cyan-950">{next.applicantInstructions}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={rsvpTone(next.rsvp)}>Your RSVP: {next.rsvp}</Badge>
                    {next.rsvp !== 'confirmed' && (
                      <button disabled={busy} onClick={() => rsvp(next.id, 'confirmed')} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        I can attend
                      </button>
                    )}
                    {next.rsvp !== 'declined' && (
                      <button disabled={busy} onClick={() => rsvp(next.id, 'declined')} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">
                        I cannot attend
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-sm font-bold text-ink-800">Quick prep</p>
                  <ul className="mt-2 space-y-2 text-sm text-ink-600">
                    {PREP.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-emerald-600">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="border-t border-slate-100 p-6">
                <MessageThread applicationId={next.applicationId} viewerRole="applicant" />
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-5 shadow-card">
            <h3 className="mb-3 font-bold">All interviews</h3>
            <div className="space-y-2">
              {items.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <div>
                    <div className="font-semibold">{row.jobTitle}</div>
                    <div className="text-xs text-ink-500">{formatDateTime(row.startsAt)} · {row.mode === 'online' ? 'Online' : row.location}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={interviewTone(row.status)}>{row.status}</Badge>
                    {row.mode === 'online' && row.status === 'scheduled' && row.meetingUrl && (
                      <a href={row.meetingUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600">Join</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </PortalLayout>
  );
}
