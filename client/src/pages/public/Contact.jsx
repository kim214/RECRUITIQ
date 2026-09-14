import { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../../layouts/PublicLayout.jsx';

export default function Contact() {
  const [sent, setSent] = useState(false);

  return (
    <PublicLayout>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">Get in touch</p>
          <h1 className="mt-2 text-4xl font-extrabold">We'd love to hear from you</h1>
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="font-bold">Email us</h3>
              <a className="text-brand-600" href="mailto:support@RecruitIQ.com">support@RecruitIQ.com</a>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="font-bold">Location</h3>
              <p className="text-ink-500">Nairobi, Kenya</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="font-bold">Already a user?</h3>
              <Link to="/login" className="text-brand-600">Sign in to your dashboard</Link>
            </div>
          </div>
        </div>
        <form
          className="rounded-2xl bg-white p-6 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <label className="mb-1 block text-sm font-semibold">Name</label>
          <input required className="mb-4 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500" />
          <label className="mb-1 block text-sm font-semibold">Email</label>
          <input type="email" required className="mb-4 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500" />
          <label className="mb-1 block text-sm font-semibold">Message</label>
          <textarea required rows={5} className="mb-4 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500" />
          {sent && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Thanks — we’ll get back to you shortly.</p>}
          <button className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white">Send message</button>
        </form>
      </section>
    </PublicLayout>
  );
}
