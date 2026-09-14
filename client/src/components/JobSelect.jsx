import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function JobSelect({ value, onChange }) {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    api.getMyJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-md rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-brand-500"
    >
      <option value="">Select a job</option>
      {jobs.map((j) => (
        <option key={j.id} value={j.id}>
          {j.title}
        </option>
      ))}
    </select>
  );
}
