import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function CreateJob() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.target;
    setBusy(true);
    setError('');
    try {
      const job = await api.createJob({
        title: f.title.value,
        location: f.location.value,
        employmentType: f.employmentType.value,
        description: f.description.value,
        requiredSkills: f.requiredSkills.value.split(',').map((s) => s.trim()).filter(Boolean),
        minExperience: parseInt(f.minExperience.value, 10) || 0,
        requiredEducation: f.requiredEducation.value,
        requiredCertifications: f.requiredCertifications.value.split(',').map((s) => s.trim()).filter(Boolean),
      });
      navigate(`/employer?job=${job.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalLayout role="employer" title="Post a New Job">
      <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-card">
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">Publishing as: {user?.email}</p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Field name="title" label="Job Title *" required placeholder="e.g. Senior Software Engineer" />
        <Field name="location" label="Location" placeholder="e.g. Nairobi, Kenya or Remote" />
        <label className="block text-sm font-semibold">Employment Type</label>
        <select name="employmentType" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5">
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="internship">Internship</option>
        </select>
        <label className="block text-sm font-semibold">Job Description *</label>
        <textarea name="description" required rows={5} className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5" />
        <Field name="requiredSkills" label="Required Skills (comma-separated) *" required placeholder="JavaScript, React, Node.js" />
        <Field name="minExperience" label="Minimum Experience (years)" type="number" defaultValue="0" />
        <Field name="requiredEducation" label="Required Education" placeholder="e.g. Bachelor's in Computer Science" />
        <Field name="requiredCertifications" label="Required Certifications (comma-separated)" placeholder="AWS Certified, PMP" />
        <button disabled={busy} className="rounded-xl bg-brand-500 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Publishing...' : 'Publish Job'}</button>
      </form>
    </PortalLayout>
  );
}

function Field({ label, ...props }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold">{label}</label>
      <input {...props} className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500" />
    </div>
  );
}
