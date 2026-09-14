import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearAuthStorage, getStoredUser, getToken, persistAuth } from '../api/client.js';

const AuthContext = createContext(null);

export function dashboardPath(role) {
  if (role === 'admin') return '/admin';
  if (role === 'employer') return '/employer';
  if (role === 'applicant') return '/applicant';
  return '/';
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      navigate('/login?expired=1', { replace: true });
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      const stored = getStoredUser();
      if (!token || !stored) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const fresh = await api.me();
        const nextToken = fresh.token || token;
        const { token: _t, ...profile } = fresh;
        persistAuth(nextToken, profile);
        if (!cancelled) setUser(profile);
      } catch {
        clearAuthStorage();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      setUser,
      login: async (email, password) => {
        const { token, user: next } = await api.login(email, password);
        persistAuth(token, next);
        setUser(next);
        return next;
      },
      register: async (body) => {
        const { token, user: next } = await api.register(body);
        persistAuth(token, next);
        setUser(next);
        return next;
      },
      logout: () => {
        clearAuthStorage();
        setUser(null);
        navigate('/');
      },
    }),
    [user, ready, navigate]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
