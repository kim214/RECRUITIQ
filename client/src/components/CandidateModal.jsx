import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { STAGE_ACTIONS, scoreTone, recommendationLabel, isAnalysisLive, formatDateTime, applicantLabel } from '../utils/format.js';
import Badge from './Badge.jsx';
import AnalysisProgress from './AnalysisProgress.jsx';
import InterviewScheduler from './InterviewScheduler.jsx';
import MessageThread from './MessageThread.jsx';

const DIMENSION_ORDER = [
  { key: 'skills', label: 'Skills' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
  { key: 'certifications', label: 'Certificates' },
  { key: 'projects', label: 'Projects' },
  { key: 'job_specific', label: 'Job-specific' },
];

function fileNameFromUrl(url, fallback) {
  if (!url) return fallback;
  try {
    const path = decodeURIComponent(new URL(url, 'https://local').pathname);
    const name = path.split('/').filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function analyzedDocuments(app, analysis) {
  const reviewed = analysis?.documentsReviewed || [];
  if (reviewed.length) return reviewed;
  const names = [];
  if (app.resumeUrl) names.push(fileNameFromUrl(app.resumeUrl, 'resume'));
  if (app.transcriptUrl) names.push(fileNameFromUrl(app.transcriptUrl, 'transcript'));
  (app.certificatesUrl || []).forEach((url, i) => {
    names.push(fileNameFromUrl(url, `certificate-${i + 1}`));
  });
  return names;
}

function groupedMatches(items) {
  return {
    matched: items.filter((item) => item.status === 'MATCH'),
    partial: items.filter((item) => item.status === 'PARTIAL_MATCH'),
    missing: items.filter((item) => item.status === 'NOT_FOUND' || item.status === 'UNCLEAR'),
  };
}

export default function CandidateModal({ applicationId, onClose, onUpdated }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [justShortlisted, setJustShortlisted] = useState(false);
  const [interview, setInterview] = useState(null);

  async function load() {
    const data = await api.getApplication(applicationId);
    setApp(data);
    try {
      const interviews = await api.getInterviews(`applicationId=${applicationId}`);
      setInterview((interviews || []).find((row) => row.status === 'scheduled') || interviews?.[0] || null);
    } catch {
      setInterview(null);
    }
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getApplication(applicationId);
        if (cancelled) return;
        setApp(data);
        if (!isAnalysisLive(data.analysisStatus)) return;
        setBusy(true);
        setPipelineStatus(data.analysisStatus);
        await api.waitForAnalysis(applicationId, {
          onProgress: (status, latest) => {
            if (cancelled) return;
            setPipelineStatus(status);
            if (latest) setApp(latest);
          },
        });
        if (!cancelled) {
          await load();
          onUpdated?.();
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  async function updateStatus(status) {
    if (status === 'interview_scheduled') {
      setScheduling(true);
      return;
    }
    setBusy(true);
    try {
      await api.updateApplicationStatus(applicationId, status);
      onUpdated?.();
      if (status === 'shortlisted') {
        const data = await load();
        setApp(data);
        setJustShortlisted(true);
        setScheduling(true);
        return;
      }
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    setBusy(true);
    setError('');
    setPipelineStatus({ state: 'queued', step: 'QUEUED', label: 'Queued' });
    try {
      await api.analyzeApplication(applicationId);
      await api.waitForAnalysis(applicationId, {
        onProgress: (status, latest) => {
          setPipelineStatus(status);
          if (latest) setApp(latest);
        },
      });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const evidenceItems = (app?.evidence?.items || []).filter((item) => {
    const q = why.trim().toLowerCase();
    if (!q) return true;
    return [item.value, item.type, item.evidence].some((part) => String(part || '').toLowerCase().includes(q));
  });
  const analysis = app?.analysis;
  const actions = STAGE_ACTIONS[app?.status] || [];
  const breakdown = app?.scoreBreakdown || analysis?.scoreBreakdown;
  const matchItems = app?.requirementMatches?.items || [];
  const groups = groupedMatches(matchItems);
  const documents = app ? analyzedDocuments(app, analysis) : [];
  const matchName = app?.aiScore != null
    ? (analysis?.matchLabel || breakdown?.match_label || recommendationLabel(app.aiScore, analysis?.recommendation || breakdown?.recommendation))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold">{applicantLabel(app) || 'Applicant'}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-ink-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
          {!app && !error && <p className="text-ink-500">Loading candidate...</p>}
          {app && (
            <>
              {app.identitySealed && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-ink-700">
                  <p className="font-semibold">Identity sealed</p>
                  <p className="mt-1 text-xs text-ink-500">This applicant is shown only as {applicantLabel(app)}. Name, email, address, and original files stay private. Message them through RecruitIQ.</p>
                </div>
              )}
              <p><strong>Applicant ID:</strong> <span className="font-mono">{applicantLabel(app)}</span></p>
              <p><strong>Job:</strong> {app.jobTitle}</p>
              <p><strong>Status:</strong> <Badge>{app.stageLabel}</Badge></p>
              {(justShortlisted || app.status === 'shortlisted' || scheduling) && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  {justShortlisted || app.status === 'shortlisted'
                    ? 'Shortlisted. Schedule an interview so the candidate gets time, join details, and a notification.'
                    : 'Set the interview time. The candidate is notified automatically.'}
                </div>
              )}
              {interview && interview.status === 'scheduled' && !scheduling && (
                <div className="rounded-xl border border-brand-100 bg-indigo-50 p-3 text-sm">
                  <p className="font-semibold text-ink-800">Interview scheduled</p>
                  <p className="text-ink-600">{formatDateTime(interview.startsAt)} · {interview.mode === 'online' ? 'Online' : interview.location}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link to="/employer/interviews" className="text-sm font-semibold text-brand-600">Open interview page</Link>
                    <button type="button" onClick={() => setScheduling(true)} className="text-sm font-semibold text-ink-600">Reschedule</button>
                  </div>
                </div>
              )}
              {scheduling && (
                <InterviewScheduler
                  application={app}
                  existing={interview?.status === 'scheduled' ? interview : null}
                  onCancel={() => setScheduling(false)}
                  onSaved={async () => {
                    setScheduling(false);
                    setJustShortlisted(false);
                    await load();
                    onUpdated?.();
                  }}
                />
              )}

              {(busy || isAnalysisLive(app.analysisStatus) || pipelineStatus) && (
                <AnalysisProgress status={pipelineStatus || app.analysisStatus} />
              )}
              {app.aiScore != null ? (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Overall Match</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h4 className={`inline-flex rounded-full px-2 py-0.5 text-sm font-bold ${scoreTone(app.aiScore)}`}>
                      {Math.round(app.aiScore)}%
                    </h4>
                    {matchName && (
                      <p className="text-sm font-bold text-ink-800">Recommendation: {matchName}</p>
                    )}
                  </div>

                  {breakdown?.dimensions && (
                    <div className="mt-3 space-y-0.5 text-xs text-ink-600">
                      <p className="font-semibold text-ink-800">Score breakdown</p>
                      {DIMENSION_ORDER.map(({ key, label }) => {
                        const dim = breakdown.dimensions[key];
                        if (!dim?.applicable) return <p key={key}>{label} —</p>;
                        return <p key={key}>{label} {dim.points}/{dim.max}</p>;
                      })}
                      <p className="font-semibold text-ink-800">Overall {Math.round(breakdown.overall_score ?? app.aiScore)}/100</p>
                    </div>
                  )}

                  {!!matchItems.length && (
                    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <p className="font-semibold text-ink-800">Matched</p>
                        {groups.matched.length === 0 && <p className="text-ink-500">None</p>}
                        {groups.matched.map((item) => (
                          <p key={`m-${item.priority}-${item.requirement}`} className="mt-1 text-emerald-700">
                            ✓ {item.requirement}
                          </p>
                        ))}
                        {groups.partial.map((item) => (
                          <p key={`p-${item.priority}-${item.requirement}`} className="mt-1 text-amber-700">
                            ~ {item.requirement}
                          </p>
                        ))}
                      </div>
                      <div>
                        <p className="font-semibold text-ink-800">Missing</p>
                        {groups.missing.length === 0 && <p className="text-ink-500">None</p>}
                        {groups.missing.map((item) => (
                          <p key={`x-${item.priority}-${item.requirement}`} className="mt-1 text-rose-700">
                            ⚠ {item.requirement}
                            <span className="ml-1 text-ink-400">{item.priority === 'PREFERRED' ? '(preferred)' : ''}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis?.strengths?.length > 0 && (
                    <p className="mt-3"><strong>Strengths:</strong> {analysis.strengths.join('; ')}</p>
                  )}
                  {analysis?.weaknesses?.length > 0 && (
                    <p className="mt-2"><strong>Gaps:</strong> {analysis.weaknesses.join('; ')}</p>
                  )}
                  {analysis?.summary && <p className="mt-2 text-ink-600">{analysis.summary}</p>}
                  {(analysis?.semanticMatch?.overall != null || analysis?.skillsMatch?.semanticMatch?.overall != null) && (
                    <p className="mt-2 text-xs text-ink-500">Semantic similarity {analysis.semanticMatch?.overall ?? analysis.skillsMatch.semanticMatch.overall}% (keyword matching unchanged)</p>
                  )}
                </div>
              ) : (
                <p className="text-ink-500">Not yet analyzed. Run Analyze with AI to see the match breakdown.</p>
              )}

              {!!documents.length && (
                <p><strong>Documents analyzed:</strong> {documents.join(', ')}</p>
              )}
              {analysis?.documentsFailed?.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {analysis.documentsFailed.map((label) => (
                    <p key={label}>{label} could not be analyzed.</p>
                  ))}
                  {(analysis.documentsReviewed?.length > 0 || documents.length > 0) && (
                    <p>Analysis is based on available documents.</p>
                  )}
                </div>
              )}
              {analysis?.audit && (
                <p className="text-xs text-ink-500">
                  Analyzed {formatDateTime(analysis.analyzedAt || analysis.audit.timestamp)}
                  {' · '}model {analysis.audit.model || analysis.modelVersion || 'unknown'}
                  {analysis.audit.embedding_model ? ` · embeddings ${analysis.audit.embedding_model}` : ' · embeddings off'}
                  {' · '}pipeline {analysis.audit.analysis_version}
                  {' · '}scoring {analysis.audit.scoring_version}
                  {analysis.audit.status === 'failed' ? ' · failed' : ''}
                </p>
              )}

              {!!(app.evidence?.items || []).length && (
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 text-xs text-ink-600">
                  <p className="mb-2 font-semibold text-ink-800">Evidence</p>
                  <input
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    placeholder="Ask: Python, AWS, Nairobi…"
                    className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  {evidenceItems.length === 0 && <p>No quoted evidence for that claim in the documents.</p>}
                  {evidenceItems.slice(0, 12).map((item) => (
                    <p key={`${item.type}-${item.value}`} className="mt-1">
                      <span className="font-semibold">{item.value}</span>
                      {' '}({item.type}) — “{item.evidence}”
                      <span className="text-ink-400"> [{item.source_document}]</span>
                    </p>
                  ))}
                </div>
              )}

              {app.coverLetter && (
                <p><strong>Cover letter:</strong><br />{app.coverLetter}</p>
              )}
              {app.documentsSealed ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-500">
                  Original resume and certificates stay sealed. AI analysis below is based on the files they uploaded.
                  {app.hasDocuments ? ' Documents were received.' : ''}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {app.resumeUrl && <a className="rounded-lg border px-3 py-1" href={app.resumeUrl} target="_blank" rel="noreferrer">Resume</a>}
                  {app.transcriptUrl && <a className="rounded-lg border px-3 py-1" href={app.transcriptUrl} target="_blank" rel="noreferrer">Transcript</a>}
                  {(app.certificatesUrl || []).map((u, i) => (
                    <a key={u} className="rounded-lg border px-3 py-1" href={u} target="_blank" rel="noreferrer">Cert {i + 1}</a>
                  ))}
                </div>
              )}

              {app.supportingDocuments && (app.supportingDocuments.certificates?.length || app.supportingDocuments.transcript) && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 text-xs text-ink-600">
                  <p className="mb-2 font-semibold text-ink-800">Certificates & transcript</p>
                  <p className="mb-2 text-amber-800">Uploaded files are treated as information detected, not as independently verified credentials.</p>
                  {(app.supportingDocuments.certificates || []).map((c, i) => (
                    <div key={`${c.certificate || c.label || i}`} className="mt-2">
                      <p><span className="font-semibold">{c.certificate || c.label || `Certificate ${i + 1}`}</span> — {c.verification_status}</p>
                      {c.unread && <p>{c.note}</p>}
                      {!c.unread && (
                        <p>
                          {[c.issuer && `Issuer: ${c.issuer}`, c.candidate_name && `Name: ${c.candidate_name}`, c.issue_date && `Issued: ${c.issue_date}`, c.expiry_date && `Expires: ${c.expiry_date}`, c.certificate_number && `No: ${c.certificate_number}`, c.relevant_domain && `Domain: ${c.relevant_domain}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                  {app.supportingDocuments.transcript && (
                    <div className="mt-2">
                      <p><span className="font-semibold">Transcript</span> — {app.supportingDocuments.transcript.verification_status}</p>
                      {app.supportingDocuments.transcript.unread && <p>{app.supportingDocuments.transcript.note}</p>}
                      {!app.supportingDocuments.transcript.unread && (
                        <>
                          <p>
                            {[app.supportingDocuments.transcript.institution, app.supportingDocuments.transcript.qualification, app.supportingDocuments.transcript.gpa && `GPA ${app.supportingDocuments.transcript.gpa}`, app.supportingDocuments.transcript.classification].filter(Boolean).join(' · ')}
                          </p>
                          {!!app.supportingDocuments.transcript.subjects?.length && (
                            <p>Subjects: {app.supportingDocuments.transcript.subjects.map((s) => [s.name, s.grade].filter(Boolean).join(' ')).join('; ')}</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {app.candidateProfile && (
                <div className="rounded-xl border border-slate-100 p-4 text-xs text-ink-600">
                  <p className="mb-2 font-semibold text-ink-800">Structured candidate profile</p>
                  <p><span className="font-semibold">Applicant:</span> {app.identitySealed ? applicantLabel(app) : (app.candidateProfile.candidate?.name || 'NOT_FOUND')} {app.identitySealed ? '(sealed)' : `(${app.candidateProfile.candidate?.name_status || 'UNKNOWN'})`}</p>
                  {!!app.candidateProfile.skills?.length && <p className="mt-1"><span className="font-semibold">Skills:</span> {app.candidateProfile.skills.join(', ')}</p>}
                  {!!app.candidateProfile.education?.length && (
                    <p className="mt-1"><span className="font-semibold">Education:</span> {app.candidateProfile.education.map((e) => [e.qualification, e.field, e.institution, e.dates].filter(Boolean).join(', ')).join('; ')}</p>
                  )}
                  {!!app.candidateProfile.experience?.length && (
                    <p className="mt-1"><span className="font-semibold">Employment:</span> {app.candidateProfile.experience.map((e) => [e.job_title, e.employer, [e.start_date, e.end_date].filter(Boolean).join('-')].filter(Boolean).join(' @ ')).join('; ')}</p>
                  )}
                  {!!app.candidateProfile.certifications?.length && <p className="mt-1"><span className="font-semibold">Certifications:</span> {app.candidateProfile.certifications.join(', ')}</p>}
                  {!!app.candidateProfile.languages?.length && <p className="mt-1"><span className="font-semibold">Languages:</span> {app.candidateProfile.languages.join(', ')}</p>}
                  {!!app.candidateProfile.projects?.length && <p className="mt-1"><span className="font-semibold">Projects:</span> {app.candidateProfile.projects.map((p) => p.name || p.description).filter(Boolean).join('; ')}</p>}
                </div>
              )}
              {['shortlisted', 'interview_scheduled', 'hired'].includes(app.status) && (
                <MessageThread applicationId={app.id} viewerRole="employer" />
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
              {busy ? (pipelineStatus?.label || 'Working...') : 'Analyze with AI'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
