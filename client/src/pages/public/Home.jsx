import { Link } from 'react-router-dom';
import PublicLayout from '../../layouts/PublicLayout.jsx';

export default function Home() {
  return (
    <PublicLayout>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-card">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            AI-powered hiring platform
          </div>
          <h1 className="text-4xl font-extrabold leading-tight text-ink-800 md:text-5xl">
            Hire smarter with <span className="bg-gradient-to-r from-brand-500 to-accent-500 bg-clip-text text-transparent">intelligent matching</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-500">
            RecruitIQ helps employers find the best talent faster — and gives applicants a fair, transparent path to their next role.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="rounded-xl bg-brand-500 px-5 py-3 font-semibold text-white shadow-glow hover:bg-brand-600">Create free account</Link>
            <Link to="/login" className="rounded-xl border-2 border-slate-200 px-5 py-3 font-semibold text-ink-700 hover:border-brand-500">Sign in</Link>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-400">Employer Dashboard — Candidate Rankings</div>
          {[
            ['NK', 'Nathan K. Lotobo', '94%'],
            ['JK', 'James Kipsang', '78%'],
            ['AM', 'Alice Mwangi', '71%'],
          ].map(([av, name, score]) => (
            <div key={name} className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">{av}</div>
                <strong>{name}</strong>
              </div>
              <span className="text-sm font-bold text-brand-600">{score}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-100 bg-white/70">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 md:grid-cols-4">
          {[['AI', 'Smart resume parsing'], ['0–100', 'Candidate match scores'], ['3 portals', 'Employer, applicant & admin'], ['1-click', 'Pipeline status updates']].map(([k, v]) => (
            <div key={k} className="text-center">
              <div className="text-2xl font-extrabold text-brand-600">{k}</div>
              <div className="text-sm text-ink-500">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">How it works</p>
        <h2 className="mt-2 text-3xl font-extrabold">From job post to hire in three steps</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ['1', 'Post or apply', 'Employers create jobs with required skills. Applicants submit resumes and certificates.'],
            ['2', 'AI analyzes & ranks', 'Our AI parses documents and scores each candidate against the role.'],
            ['3', 'Shortlist & hire', 'Move candidates through a visual pipeline from applied to hired.'],
          ].map(([n, t, d]) => (
            <article key={n} className="rounded-2xl bg-white p-6 shadow-card">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 font-bold text-white">{n}</div>
              <h3 className="text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm text-ink-500">{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="bg-white/60 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">Features</p>
          <h2 className="mt-2 text-3xl font-extrabold">Everything you need to recruit with confidence</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ['AI candidate ranking', 'Score applicants 0–100 on skills, education, certifications, and experience.'],
              ['Document analysis', 'Upload resumes, transcripts, and certificates. AI extracts what matters.'],
              ['Kanban pipeline', 'Visual hiring board from application to offer.'],
              ['Employer dashboard', 'Manage jobs, review applicants, and run AI analysis in one place.'],
              ['Applicant portal', 'Browse openings, apply with documents, and track status.'],
              ['Analytics & insights', 'See volume, shortlist rates, and hiring activity at a glance.'],
            ].map(([t, d]) => (
              <article key={t} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                <h3 className="font-bold">{t}</h3>
                <p className="mt-2 text-sm text-ink-500">{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-ink-900 p-8 text-white">
            <h3 className="text-2xl font-extrabold">For employers</h3>
            <p className="mt-3 text-slate-300">Let AI surface your top candidates so you can focus on interviews and offers.</p>
            <Link to="/register" className="mt-6 inline-block rounded-xl bg-brand-500 px-5 py-3 font-semibold">Start hiring</Link>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-cyan-600 to-brand-600 p-8 text-white">
            <h3 className="text-2xl font-extrabold">For job seekers</h3>
            <p className="mt-3 text-cyan-50">Apply to roles that match your skills and track every application.</p>
            <Link to="/register" className="mt-6 inline-block rounded-xl bg-white px-5 py-3 font-semibold text-brand-700">Find jobs</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
