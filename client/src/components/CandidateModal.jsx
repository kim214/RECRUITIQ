import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { STAGE_ACTIONS, scoreTone } from '../utils/format.js';
import Badge from './Badge.jsx';

export default function CandidateModal({ applicationId, onClose, onUpdated }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.getApplication(applicationId);
    setApp(data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [applicationId]);

  async function updateStatus(status) {
    setBusy(true);
    try {
      await api.updateApplicationStatus(applicationId, status);
      onUpdated?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    setBusy(true);
    try {
      await api.analyzeApplication(applicationId);
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const analysis = app?.analysis;
  const actions = STAGE_ACTIONS[app?.status] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold">{app?.applicantName || 'Candidate'}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-ink-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
          {!app && !error && <p className="text-ink-500">Loading candidate...</p>}
          {app && (
            <>
              <p><strong>Email:</strong> {app.applicantEmail}</p>
              <p><strong>Job:</strong> {app.jobTitle}</p>
              <p><strong>Status:</strong> <Badge>{app.stageLabel}</Badge></p>
              {analysis?.documentsReviewed?.length > 0 && (
                <p><strong>Documents reviewed:</strong> {analysis.documentsReviewed.join(', ')}</p>
              )}
              {analysis?.documentsFailed?.length > 0 && (
                <p className="text-amber-700"><strong>Could not read:</strong> {analysis.documentsFailed.join(', ')}</p>
              )}
              {app.coverLetter && (
                <p><strong>Cover letter:</strong><br />{app.coverLetter}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {app.resumeUrl && <a className="rounded-lg border px-3 py-1" href={app.resumeUrl} target="_blank" rel="noreferrer">Resume</a>}
                {app.transcriptUrl && <a className="rounded-lg border px-3 py-1" href={app.transcriptUrl} target="_blank" rel="noreferrer">Transcript</a>}
                {(app.certificatesUrl || []).map((u, i) => (
                  <a key={u} className="rounded-lg border px-3 py-1" href={u} target="_blank" rel="noreferrer">Cert {i + 1}</a>
                ))}
              </div>
              {app.aiScore != null ? (
                <div className="rounded-xl bg-slate-50 p-4">
                  <h4 className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-sm font-bold ${scoreTone(app.aiScore)}`}>
                    AI Match {Math.round(app.aiScore)}%
                  </h4>
                  {analysis?.summary && <p className="mt-2 text-ink-600">{analysis.summary}</p>}
                  {analysis?.skillsMatch && (
                    <p className="mt-2">
                      <strong>Skills ({Math.round(analysis.skillsMatch.score ?? 0)}%):</strong>{' '}
                      {(analysis.skillsMatch.matched || []).map((s) => (
                        <span key={`m-${s}`} className="mr-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{s}</span>
                      ))}
                      {(analysis.skillsMatch.partial || []).map((s) => (
                        <span key={`p-${s}`} className="mr-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{s}</span>
                      ))}
                      {(analysis.skillsMatch.missing || []).map((s) => (
                        <span key={`x-${s}`} className="mr-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800">{s}</span>
                      ))}
                    </p>
                  )}
                  {analysis?.experienceMatch?.details && (
                    <p className="mt-2"><strong>Experience ({Math.round(analysis.experienceMatch.score ?? 0)}%):</strong> {analysis.experienceMatch.details}</p>
                  )}
                  {analysis?.educationMatch?.details && (
                    <p className="mt-2"><strong>Education ({Math.round(analysis.educationMatch.score ?? 0)}%):</strong> {analysis.educationMatch.details}</p>
                  )}
                  {analysis?.strengths?.length > 0 && <p className="mt-2"><strong>Strengths:</strong> {analysis.strengths.join('; ')}</p>}
                  {analysis?.weaknesses?.length > 0 && <p className="mt-2"><strong>Gaps:</strong> {analysis.weaknesses.join('; ')}</p>}
                </div>
              ) : (
                <p className="text-ink-500">Not yet analyzed by AI. Run AI Rankings first.</p>
              )}
            </>
          )}
        </div>
        {app && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-6 py-4">
            {actions.map((a) => (
              <button key={a.status} disabled={busy} onClick={() => updateStatus(a.status)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${a.className} disabled:opacity-50`}>
                {a.label}
              </button>
            ))}
            <button disabled={busy} onClick={analyze} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Working...' : 'Analyze with AI'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
