import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { defaultInterviewLocalValue, toDatetimeLocalValue } from '../utils/format.js';

export default function InterviewScheduler({ application, existing, onCancel, onSaved }) {
  const [mode, setMode] = useState(existing?.mode || 'online');
  const [startsAt, setStartsAt] = useState(
    existing?.startsAt ? toDatetimeLocalValue(existing.startsAt) : defaultInterviewLocalValue(),
  );
  const [durationMinutes, setDurationMinutes] = useState(existing?.durationMinutes || 45);
  const [meetingUrl, setMeetingUrl] = useState(existing?.meetingUrl || '');
  const [location, setLocation] = useState(existing?.location || '');
  const [applicantInstructions, setApplicantInstructions] = useState(existing?.applicantInstructions || '');
  const [employerNotes, setEmployerNotes] = useState(existing?.employerNotes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing) return;
    setMode(existing.mode || 'online');
    setStartsAt(existing.startsAt ? toDatetimeLocalValue(existing.startsAt) : defaultInterviewLocalValue());
    setDurationMinutes(existing.durationMinutes || 45);
    setMeetingUrl(existing.meetingUrl || '');
    setLocation(existing.location || '');
    setApplicantInstructions(existing.applicantInstructions || '');
    setEmployerNotes(existing.employerNotes || '');
  }, [existing]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        applicationId: application.id,
        mode,
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: Number(durationMinutes),
        meetingUrl,
        location,
        applicantInstructions,
        employerNotes,
      };
      const saved = existing?.id && existing.status === 'scheduled'
        ? await api.updateInterview(existing.id, payload)
        : await api.scheduleInterview(payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-brand-100 bg-gradient-to-br from-indigo-50 to-white p-4">
      <div>
        <p className="text-sm font-bold text-ink-800">
          {existing?.status === 'scheduled' ? 'Reschedule interview' : 'Schedule interview'}
        </p>
        <p className="text-xs text-ink-500">
          {application.applicantCode || application.applicantName || 'The applicant'} will be notified with time, {mode === 'online' ? 'join link' : 'location'}, and any instructions you share. They will see RecruitIQ as the sender, not your name.
        </p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-600">
          Type
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-ink-800">
            <option value="online">Online</option>
            <option value="onsite">On-site</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-600">
          Duration
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-ink-800">
            {[15, 30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>{n} minutes</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-600 sm:col-span-2">
          Date & time
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        {mode === 'online' ? (
          <label className="text-xs font-semibold text-ink-600 sm:col-span-2">
            Meeting link
            <input
              required
              type="url"
              placeholder="https://meet.google.com/…"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        ) : (
          <label className="text-xs font-semibold text-ink-600 sm:col-span-2">
            Location
            <input
              required
              placeholder="Office address or room"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        )}
        <label className="text-xs font-semibold text-ink-600 sm:col-span-2">
          Instructions for the candidate
          <textarea
            rows={2}
            placeholder="Join 5 minutes early, bring ID, who they will meet…"
            value={applicantInstructions}
            onChange={(e) => setApplicantInstructions(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink-600 sm:col-span-2">
          Private interviewer notes
          <textarea
            rows={2}
            placeholder="Only visible to your team — questions to ask, score reminders…"
            value={employerNotes}
            onChange={(e) => setEmployerNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Saving…' : existing?.status === 'scheduled' ? 'Update & notify candidate' : 'Schedule & notify candidate'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-500 hover:bg-white">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
