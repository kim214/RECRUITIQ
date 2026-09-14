import PublicLayout from '../../layouts/PublicLayout.jsx';

export default function Features() {
  return (
    <PublicLayout>
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">Platform capabilities</p>
        <h1 className="mt-2 text-4xl font-extrabold">Powerful tools for modern recruitment</h1>
        <p className="mt-4 max-w-2xl text-ink-500">From AI-powered candidate scoring to visual hiring pipelines — everything your team needs.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            ['AI Rankings', 'Score candidates 0–100 against each job’s requirements.'],
            ['Document Analysis', 'Parse resumes, transcripts, and certificates automatically.'],
            ['AI Insights', 'See strengths, gaps, and why each applicant received their score.'],
            ['Job Posting', 'Define skills, education, certifications, and experience.'],
            ['Pipeline', 'Move candidates from submitted to hired in a Kanban board.'],
            ['Reports', 'Track volume, shortlists, and hiring outcomes.'],
          ].map(([t, d]) => (
            <article key={t} className="rounded-2xl bg-white p-6 shadow-card">
              <h3 className="font-bold">{t}</h3>
              <p className="mt-2 text-sm text-ink-500">{d}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
