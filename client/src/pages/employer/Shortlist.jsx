import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import JobSelect from '../../components/JobSelect.jsx';
import CandidateModal from '../../components/CandidateModal.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { PIPELINE_COLUMNS, recommendationLabel, applicantLabel } from '../../utils/format.js';

export default function Shortlist() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job') || '';
  const [pipeline, setPipeline] = useState({});
  const [selected, setSelected] = useState(null);

  async function load(id) {
    if (!id) return setPipeline({});
    const data = await api.getPipeline(id);
    setPipeline(data.pipeline || data);
  }

  useEffect(() => {
    if (jobId) load(jobId).catch(() => setPipeline({}));
  }, [jobId]);

  return (
    <PortalLayout
      role="employer"
      title="Shortlisting"
      subtitle="Review, shortlist, then schedule interviews — applicants stay anonymous"
      action={<Link to="/employer/interviews" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Interviews</Link>}
    >
      <div className="mb-5">
        <JobSelect value={jobId} onChange={(id) => setParams(id ? { job: id } : {})} />
      </div>
      {!jobId ? (
        <EmptyState icon="✅" title="Select a job" message="Choose a job to manage its hiring pipeline." />
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-4 md:grid-cols-3 xl:grid-cols-6">
          {PIPELINE_COLUMNS.map((col) => {
            const cards = pipeline[col.key] || [];
            return (
              <div key={col.key} className="min-w-[180px] rounded-2xl bg-slate-100 p-3">
                <h3 className="mb-3 flex items-center justify-between text-sm font-bold">
                  {col.label}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs">{cards.length}</span>
                </h3>
                {col.key === 'shortlisted' && (
                  <p className="mb-2 text-[11px] leading-snug text-ink-500">Open a card and schedule an interview — the candidate is notified automatically.</p>
                )}
                {col.key === 'interview_scheduled' && (
                  <p className="mb-2 text-[11px] leading-snug text-ink-500">Manage join links and RSVPs on the Interviews page.</p>
                )}
                <div className="space-y-2">
                  {cards.map((c) => (
                    <button key={c.id} onClick={() => setSelected(c.id)} className="w-full rounded-xl bg-white p-3 text-left shadow-sm">
                      <div className="font-mono text-sm font-semibold">{applicantLabel(c)}</div>
                      <div className="truncate text-xs text-ink-500">Identity sealed</div>
                      {c.aiScore != null && (
                        <>
                          <div className="mt-1 text-xs font-semibold text-ink-600">
                            {Math.round(c.aiScore)}% · {c.analysis?.matchLabel || recommendationLabel(c.aiScore, c.analysis?.recommendation)}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full bg-brand-500" style={{ width: `${c.aiScore}%` }} />
                          </div>
                        </>
                      )}
                      {col.key === 'shortlisted' && (
                        <div className="mt-2 text-[11px] font-semibold text-brand-600">Schedule interview →</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selected && <CandidateModal applicationId={selected} onClose={() => setSelected(null)} onUpdated={() => load(jobId)} />}
    </PortalLayout>
  );
}
