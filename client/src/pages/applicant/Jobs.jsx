import { useEffect, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';

export default function ApplicantJobs() {
  const [jobs, setJobs] = useState(null);
  const [applyJob, setApplyJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');

  useEffect(() => {
    api.getJobs().then(setJobs).catch((e) => {
      setError(e.message);
      setJobs([]);
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.resume.files[0]) {
      setError('Please upload your resume.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('resume', form.resume.files[0]);
      if (form.transcript.files[0]) fd.append('transcript', form.transcript.files[0]);
      [...form.certificates.files].forEach((f) => fd.append('certificates', f));
      const urls = await api.uploadDocuments(fd);
      await api.applyToJob({
        jobId: applyJob.id,
        coverLetter: form.coverLetter.value,
        resumeUrl: urls.resumeUrl,
        transcriptUrl: urls.transcriptUrl,
        certificatesUrl: urls.certificatesUrl || [],
      });
      setOk('Application submitted successfully!');
      setTimeout(() => {
        setApplyJob(null);
        setOk('');
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalLayout role="applicant" title="Browse Open Jobs" subtitle="AI-matched roles from verified employers">
      {!jobs ? <Loader /> : !jobs.length ? (
        <EmptyState icon="📋" title="No open jobs" message="Check back soon — employers are posting new roles regularly." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {jobs.map((j) => (
            <article key={j.id} className="rounded-2xl bg-white p-5 shadow-card">
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">{j.employmentType || 'Full-time'}</span>
              <h3 className="mt-3 text-lg font-bold">{j.title}</h3>
              <p className="text-sm text-ink-500">📍 {j.location || 'Remote'} · {j.employerName || 'Company'}</p>
              <p className="mt-2 text-sm text-ink-600">{j.description?.slice(0, 180)}{j.description?.length > 180 ? '...' : ''}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(j.requiredSkills || []).map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{s}</span>
                ))}
              </div>
              <button onClick={() => { setApplyJob(j); setError(''); setOk(''); }} className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
                Apply Now
              </button>
            </article>
          ))}
        </div>
      )}

      {applyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setApplyJob(null)}>
          <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Apply: {applyJob.title}</h2>
              <button type="button" onClick={() => setApplyJob(null)}>✕</button>
            </div>
            {error && <p className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
            {ok && <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{ok}</p>}
            <label className="mb-1 block text-sm font-semibold">Cover Letter *</label>
            <textarea name="coverLetter" required rows={4} className="mb-4 w-full rounded-xl border-2 border-slate-200 p-3" />
            <label className="mb-1 block text-sm font-semibold">Resume (PDF or DOC) *</label>
            <input name="resume" type="file" accept=".pdf,.doc,.docx" className="mb-4 w-full" />
            <label className="mb-1 block text-sm font-semibold">Academic Transcript</label>
            <input name="transcript" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="mb-4 w-full" />
            <label className="mb-1 block text-sm font-semibold">Certificates</label>
            <input name="certificates" type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="mb-4 w-full" />
            <button disabled={busy} className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white">{busy ? 'Submitting...' : 'Submit Application'}</button>
          </form>
        </div>
      )}
    </PortalLayout>
  );
}
