import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Loader from '../../components/Loader.jsx';
import { api } from '../../api/client.js';
import { formatDateTime, notificationTone } from '../../utils/format.js';

export default function NotificationsInbox({ role }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const payload = await api.getNotifications();
    setData(payload);
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setData({ items: [], unreadCount: 0 });
    });
  }, []);

  async function openItem(item) {
    try {
      if (!item.read) await api.markNotificationRead(item.id);
    } catch {
      /* still navigate */
    }
    await load().catch(() => {});
  }

  async function markAll() {
    await api.markAllNotificationsRead();
    await load();
  }

  const items = data?.items || [];

  return (
    <PortalLayout
      role={role}
      title="Notifications"
      subtitle={role === 'applicant' ? 'Interviews, messages, and application updates' : 'Candidate replies, RSVPs, and interview changes'}
      action={items.some((n) => !n.read) ? (
        <button onClick={markAll} className="rounded-lg border px-4 py-2 text-sm font-semibold">Mark all read</button>
      ) : null}
    >
      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!data ? <Loader /> : !items.length ? (
        <EmptyState
          icon="🔔"
          title="You’re all caught up"
          message={role === 'applicant'
            ? 'Shortlists, interview invites, and employer messages will land here.'
            : 'When a candidate confirms, declines, or messages you, it will show here.'}
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.link || (role === 'applicant' ? '/applicant/interviews' : '/employer/interviews')}
              onClick={() => openItem(item)}
              className={`block rounded-2xl border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 ${item.read ? 'border-slate-100 bg-white' : 'border-cyan-200 bg-cyan-50/70'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-800">{item.title}</p>
                    <Badge tone={notificationTone(item.type)}>{item.type.replace(/_/g, ' ')}</Badge>
                    {!item.read && <span className="text-xs font-bold text-cyan-700">New</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{item.body}</p>
                </div>
                <p className="shrink-0 text-xs text-ink-400">{formatDateTime(item.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
