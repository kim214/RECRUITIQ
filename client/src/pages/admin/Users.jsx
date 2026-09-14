import { useEffect, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout.jsx';
import Loader from '../../components/Loader.jsx';
import Badge from '../../components/Badge.jsx';
import { api } from '../../api/client.js';

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  return (
    <PortalLayout role="admin" title="Users">
      {!users ? <Loader /> : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-ink-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{u.fullName}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3"><Badge tone="brand">{u.role}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  );
}
