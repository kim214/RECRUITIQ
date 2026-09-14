import PublicLayout from '../../layouts/PublicLayout.jsx';

export default function About() {
  return (
    <PublicLayout>
      <section className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">Our story</p>
        <h1 className="mt-2 text-4xl font-extrabold">Reimagining recruitment for everyone</h1>
        <p className="mt-4 text-lg text-ink-500">Too much time screening resumes, and too little clarity for job seekers waiting to hear back.</p>
        <div className="mt-10 space-y-4 text-ink-600">
          <p>RecruitIQ is an AI-based job matching platform that helps employers shortlist the best candidates by analyzing resumes, transcripts, and certificates against job requirements — automatically.</p>
          <p>We believe hiring should be faster, fairer, and more transparent. Employers get data-driven insights. Applicants get a clear view of where they stand.</p>
        </div>
      </section>
    </PublicLayout>
  );
}
