import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import JobSelect from '../../components/JobSelect.jsx';
import CandidateModal from '../../components/CandidateModal.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { api } from '../../api/client.js';
import { scoreTone } from '../../utils/format.js';

export default function Rankings() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job') || '';
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);

  async function load(id) {
    if (!id) return setRows([]);
    const { rankings } = await api.getRankings(id);
    setRows(rankings || []);
  }

  useEffect(() => {
    api.getAiStatus()
      .then((data) => setAiStatus(data.llm || data))
      .catch((e) => setAiStatus({ available: false, error: e.message }));
  }, []);

  useEffect(() => {
    if (jobId) load(jobId).catch((e) => setError(e.message));
  }, [jobId]);

  async function run() {
    if (!jobId) return;
    setBusy(true);
    setError('');
    try {
      await api.runAiAnalysis(jobId);
      await load(jobId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalLayout
      role="employer"
      title="AI Rankings"
      action={
        <button onClick={run} disabled={!jobId || busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Analyzing...' : 'Run AI Analysis'}
        </button>
      }
    >
      <div className="mb-5">
        <JobSelect value={jobId} onChange={(id) => setParams(id ? { job: id } : {})} />
      </div>
      {aiStatus && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${aiStatus.available ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {aiStatus.available
            ? `AI server connected — ${aiStatus.model || 'Ollama'} on Google Cloud`
            : `AI server not reachable${aiStatus.error ? `: ${aiStatus.error}` : '. Check that the GCP VM is running.'}`}
        </div>
      )}
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!jobId ? (
        <EmptyState icon="🤖" title="Select a job" message="Choose a job, then run AI analysis." />
      ) : !rows.length ? (
        <EmptyState icon="🤖" title="No AI rankings yet" message='Click "Run AI Analysis" to rank candidates.' />
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <button key={r.id} onClick={() => setSelected(r.id)} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-card hover:bg-slate-50">
              <div className="w-10 text-lg font-extrabold text-brand-600">#{i + 1}</div>
              <div className="flex-1">
                <div className="font-bold">{r.applicantName}</div>
                <div className="text-xs text-ink-500">{r.applicantEmail}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreTone(r.aiScore)}`}>{Math.round(r.aiScore)}%</span>
              <Badge>{r.stageLabel}</Badge>
              <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-200 sm:block">
                <div className="h-full bg-brand-500" style={{ width: `${r.aiScore}%` }} />
              </div>
            </button>
          ))}
        </div>
      )}
      {selected && <CandidateModal applicationId={selected} onClose={() => setSelected(null)} onUpdated={() => load(jobId)} />}
    </PortalLayout>
  );
}
