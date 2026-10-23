const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('reqruit_token');
}

export function getStoredUser() {
  const raw = localStorage.getItem('reqruit_user');
  return raw ? JSON.parse(raw) : null;
}

export function persistAuth(token, user) {
  localStorage.setItem('reqruit_token', token);
  localStorage.setItem('reqruit_user', JSON.stringify(user));
}

export function clearAuthStorage() {
  localStorage.removeItem('reqruit_token');
  localStorage.removeItem('reqruit_user');
}

async function apiRequest(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const isLoginRequest = path.includes('/auth/login');
    clearAuthStorage();
    if (!isLoginRequest) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new Error(data.message || 'Session expired — please log in again');
  }
  if (!res.ok) {
    throw new Error(
      data.message
      || (res.status >= 500
        ? 'The local API restarted or hit an error. Wait a second and click Analyze again.'
        : `Request failed (${res.status})`),
    );
  }
  return data;
}

function isRetryableFailure(err) {
  return /local API restarted|Request failed \(5\d\d\)/i.test(err?.message || '');
}

export const api = {
  login: (email, password) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (body) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiRequest('/auth/me'),
  adminStats: () => apiRequest('/stats/admin'),
  employerStats: () => apiRequest('/stats/employer'),
  getActivity: () => apiRequest('/activity'),
  getJobs: (query = '') => {
    const q = query.startsWith('?') ? query : query ? `?${query}` : '';
    const sep = q.includes('?') ? '&' : '?';
    return apiRequest(`/jobs${q}${sep}_t=${Date.now()}`);
  },
  getMyJobs: () => apiRequest(`/jobs/mine?_t=${Date.now()}`),
  getJob: (id) => apiRequest(`/jobs/${id}`),
  createJob: (data) => apiRequest('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getApplications: () => apiRequest('/applications'),
  jobApplications: (jobId) => apiRequest(`/applications/job/${jobId}`),
  getApplication: (id) => apiRequest(`/applications/${id}`),
  applyToJob: (data) => apiRequest('/applications', { method: 'POST', body: JSON.stringify(data) }),
  updateApplicationStatus: (id, status) =>
    apiRequest(`/applications/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getPipeline: (jobId) => apiRequest(`/applications/pipeline/${jobId}`),
  runAiAnalysis: (jobId) => apiRequest(`/ai/rank/${jobId}`, { method: 'POST', body: '{}' }),
  getRankings: (jobId) => apiRequest(`/ai/rankings/${jobId}`),
  analyzeApplication: (appId) => apiRequest(`/ai/analyze/${appId}`, { method: 'POST', body: '{}' }),
  getAnalysisProgress: (appId) => apiRequest(`/ai/progress/${appId}`),
  waitForAnalysis: async (appId, { interval = 800, timeout = 1200000, onProgress } = {}) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        const data = await apiRequest(`/ai/progress/${appId}`);
        onProgress?.(data.analysisStatus || null, data.application || null);
        const state = data.analysisStatus?.state;
        if (state === 'completed' || data.analysisStatus?.step === 'COMPLETED') return data;
        if (state === 'failed') throw new Error(data.analysisStatus?.error || 'Analysis failed');
      } catch (err) {
        if (!isRetryableFailure(err) || Date.now() - started >= timeout) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error('Analysis is still running. Refresh in a moment.');
  },
  waitForJobAnalysis: async (jobId, { interval = 1000, timeout = 1500000, onProgress } = {}) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        const data = await apiRequest(`/ai/rankings/${jobId}`);
        const pending = data.pending || [];
        onProgress?.(pending[0]?.analysisStatus || null, pending.length, pending, data);
        if (!data.queued && pending.length === 0) return data;
        await Promise.all(pending.slice(0, 2).map((row) => (
          apiRequest(`/ai/progress/${row.id}`).catch(() => null)
        )));
      } catch (err) {
        if (!isRetryableFailure(err) || Date.now() - started >= timeout) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error('Ranking is still running. Refresh in a moment.');
  },
  getEvidence: (appId, query = '') => {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiRequest(`/ai/evidence/${appId}${q}`);
  },
  getAiStatus: () => apiRequest('/ai/status'),
  getUsers: () => apiRequest('/users'),
  createUser: (data) => apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => apiRequest(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  updateJob: (id, data) => apiRequest(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteJob: (id) => apiRequest(`/jobs/${id}`, { method: 'DELETE' }),
  getInterviews: (query = '') => {
    const q = query.startsWith('?') ? query : query ? `?${query}` : '';
    return apiRequest(`/interviews${q}`);
  },
  scheduleInterview: (data) =>
    apiRequest('/interviews', { method: 'POST', body: JSON.stringify(data) }),
  updateInterview: (id, data) =>
    apiRequest(`/interviews/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rsvpInterview: (id, rsvp) =>
    apiRequest(`/interviews/${id}/rsvp`, { method: 'PATCH', body: JSON.stringify({ rsvp }) }),
  getNotifications: (unread = false) =>
    apiRequest(`/notifications${unread ? '?unread=1' : ''}`),
  markNotificationRead: (id) =>
    apiRequest(`/notifications/${id}/read`, { method: 'PATCH', body: '{}' }),
  markAllNotificationsRead: () =>
    apiRequest('/notifications/read-all', { method: 'PATCH', body: '{}' }),
  getMessages: (applicationId) =>
    apiRequest(`/messages?applicationId=${encodeURIComponent(applicationId)}`),
  sendMessage: (applicationId, body) =>
    apiRequest('/messages', { method: 'POST', body: JSON.stringify({ applicationId, body }) }),
  uploadDocuments: async (formData) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearAuthStorage();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error(data.message || 'Session expired — please log in again');
    }
    if (!res.ok) throw new Error(data.message || 'Upload failed');
    return data;
  },
};
