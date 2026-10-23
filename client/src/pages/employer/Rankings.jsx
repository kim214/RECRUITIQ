import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import JobSelect from '../../components/JobSelect.jsx';
import CandidateModal from '../../components/CandidateModal.jsx';
import AnalysisProgress from '../../components/AnalysisProgress.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { api } from '../../api/client.js';
import { scoreTone, recommendationLabel, isAnalysisLive, applicantLabel } from '../../utils/format.js';

export default function Rankings() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job') || '';
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [currentName, setCurrentName] = useState('');

  async function load(id) {
    if (!id) return setRows([]);
    const { rankings } = await api.getRankings(id);
    setRows(rankings || []);
  }

  useEffect(() => {
    api.getAiStatus()
      .then((data) => setAiStatus({
        ...(data.llm || data),
        embeddings: data.embeddings,
        ocr: data.ocr,
      }))
      .catch((e) => setAiStatus({ available: false, error: e.message }));
  }, []);

  useEffect(() => {
    if (jobId) load(jobId).catch((e) => setError(e.message));
  }, [jobId]);

  async function run() {
    if (!jobId) return;
    setBusy(true);
    setError('');
    setPipelineStatus({ state: 'queued', step: 'QUEUED', label: 'Queued' });
    try {
      await api.runAiAnalysis(jobId);
      await api.waitForJobAnalysis(jobId, {
        onProgress: (status, count, pending, data) => {
          setPipelineStatus(status || { state: 'queued', step: 'QUEUED', label: 'Queued' });
          setRemaining(count || 0);
          setCurrentName(pending?.[0]?.applicantCode || pending?.[0]?.applicantName || '');
          if (data?.rankings) setRows(data.rankings);
        },
      });
      await load(jobId);
    } catch (e) {
      setError(e.message);
      await load(jobId).catch(() => {});
    } finally {
      setBusy(false);
      setRemaining(0);
      setCurrentName('');
    }
  }

  return (
    <PortalLayout
      role="employer"
      title="AI Rankings"
      action={
        <button onClick={run} disabled={!jobId || busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? (pipelineStatus?.label || 'Analyzing...') : 'Run AI Analysis'}
        </button>
      }
    >
      <div className="mb-5">
        <JobSelect value={jobId} onChange={(id) => setParams(id ? { job: id } : {})} />
      </div>
      {aiStatus && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${aiStatus.available ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {aiStatus.available
            ? `GCP VM connected — chat ${aiStatus.model || 'Ollama'} · embeddings ${aiStatus.embeddings?.available ? aiStatus.embeddings.model : 'off'} · OCR ${aiStatus.ocr?.available ? 'on' : 'waiting'}`
            : `AI server not reachable${aiStatus.error ? `: ${aiStatus.error}` : '. Check that the GCP VM is running.'}`}
        </div>
      )}
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {(busy || isAnalysisLive(pipelineStatus)) && (
        <div className="mb-4">
          <AnalysisProgress status={pipelineStatus} remaining={remaining} candidateName={currentName} />
        </div>
      )}
      {!jobId ? (
        <EmptyState icon="🤖" title="Select a job" message="Choose a job, then run AI analysis." />
      ) : busy && !rows.length ? (
        <p className="text-sm text-ink-500">Ranking will appear here as each candidate completes.</p>
      ) : !rows.length ? (
        <EmptyState icon="🤖" title="No AI rankings yet" message='Click "Run AI Analysis" to rank candidates.' />
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <button key={r.id} onClick={() => setSelected(r.id)} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-card hover:bg-slate-50">
              <div className="w-10 text-lg font-extrabold text-brand-600">#{r.rank || i + 1}</div>
              <div className="flex-1">
                <div className="font-mono font-bold">{applicantLabel(r)}</div>
                <div className="text-xs text-ink-500">Identity sealed</div>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreTone(r.aiScore)}`}>{Math.round(r.aiScore)}%</span>
                <div className="mt-1 text-xs font-semibold text-ink-600">{r.matchLabel || r.analysis?.matchLabel || recommendationLabel(r.aiScore, r.analysis?.recommendation)}</div>
              </div>
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
