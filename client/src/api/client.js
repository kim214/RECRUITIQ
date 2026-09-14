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
  if (!(options.body instanceof FormData)) {
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
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
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
  runAiAnalysis: (jobId) => apiRequest(`/ai/rank/${jobId}`, { method: 'POST' }),
  getRankings: (jobId) => apiRequest(`/ai/rankings/${jobId}`),
  analyzeApplication: (appId) => apiRequest(`/ai/analyze/${appId}`, { method: 'POST' }),
  getAiStatus: () => apiRequest('/ai/status'),
  getUsers: () => apiRequest('/users'),
  uploadDocuments: async (formData) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Upload failed');
    return data;
  },
};
