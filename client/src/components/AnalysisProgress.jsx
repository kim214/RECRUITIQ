import { useEffect, useState } from 'react';
import { ANALYSIS_STEPS, analysisStepIndex } from '../utils/format.js';

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function AnalysisProgress({ status, remaining = 0, candidateName = '' }) {
  const idx = analysisStepIndex(status);
  const failed = status?.state === 'failed';
  const completed = status?.state === 'completed' || status?.step === 'COMPLETED';
  const waiting = !completed && !failed && Boolean(status);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!waiting) {
      setElapsed(0);
      return undefined;
    }
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [waiting, status?.step]);

  return (
    <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-800">Analysis status</p>
      {candidateName && <p className="mb-2 text-sm font-semibold text-ink-800">{candidateName}</p>}
      <ol className="space-y-1 text-sm">
        {ANALYSIS_STEPS.map((step, i) => {
          const current = !completed && !failed && idx === i;
          const done = completed || (!failed && idx > i);
          const isFailed = failed && (idx === i || (idx < 0 && i === 0));
          let mark = '○';
          let tone = 'text-ink-400';
          if (done) {
            mark = '✓';
            tone = 'text-emerald-700';
          } else if (isFailed) {
            mark = '✕';
            tone = 'text-rose-700';
          } else if (current) {
            mark = '●';
            tone = 'font-semibold text-cyan-800';
          }
          return (
            <li key={step.key} className={tone}>
              {mark} {step.label}
              {current && status?.detail ? ` — ${status.detail}` : ''}
            </li>
          );
        })}
      </ol>
      {failed && status?.error && (
        <p className="mt-2 text-xs text-rose-700">{status.error}</p>
      )}
      {waiting && (
        <p className="mt-2 text-xs text-ink-500">
          {elapsed > 0 ? `${formatElapsed(elapsed)} on this step. ` : ''}
          Extraction talks to the 7B model on the GCP VM and often takes 1–3 minutes. The page is waiting, not frozen.
        </p>
      )}
      {remaining > 0 && (
        <p className="mt-2 text-xs text-ink-500">{remaining} candidate{remaining === 1 ? '' : 's'} remaining</p>
      )}
    </div>
  );
}
