import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import JobSelect from '../../components/JobSelect.jsx';
import CandidateModal from '../../components/CandidateModal.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { api } from '../../api/client.js';
import { PIPELINE_COLUMNS } from '../../utils/format.js';

export default function Shortlist() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job') || '';
  const [pipeline, setPipeline] = useState({});
  const [selected, setSelected] = useState(null);

  async function load(id) {
    if (!id) return setPipeline({});
    setPipeline(await api.getPipeline(id));
  }

  useEffect(() => {
    if (jobId) load(jobId).catch(() => setPipeline({}));
  }, [jobId]);

  return (
    <PortalLayout role="employer" title="Shortlisting" subtitle="Kanban pipeline by stage">
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
                <div className="space-y-2">
                  {cards.map((c) => (
                    <button key={c.id} onClick={() => setSelected(c.id)} className="w-full rounded-xl bg-white p-3 text-left shadow-sm">
                      <div className="text-sm font-semibold">{c.applicantName}</div>
                      <div className="truncate text-xs text-ink-500">{c.applicantEmail}</div>
                      {c.aiScore != null && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full bg-brand-500" style={{ width: `${c.aiScore}%` }} />
                        </div>
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
