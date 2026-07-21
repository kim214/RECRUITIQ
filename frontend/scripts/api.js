function getApiBase() {
  const { hostname, port, origin } = window.location;
  // Same-origin when served from Express (port 3001) or Vercel
  if (port === '3001' || hostname.includes('vercel.app') || hostname.endsWith('.vercel.app')) {
    return `${origin}/api`;
  }
  // Local: frontend opened separately — point to backend
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  return `${origin}/api`;
}

const API_BASE = getApiBase();

function getToken() {
  return localStorage.getItem('reqruit_token');
}

function getUser() {
  const raw = localStorage.getItem('reqruit_user');
  return raw ? JSON.parse(raw) : null;
}

function setAuth(token, user) {
  localStorage.setItem('reqruit_token', token);
  localStorage.setItem('reqruit_user', JSON.stringify(user));
}

function clearAuth() {
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
    clearAuth();
    if (!window.location.pathname.includes('login.html')) {
      window.location.href = page('home/login.html?expired=1');
    }
    throw new Error('Session expired — please log in again');
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

const api = {
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (body) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiRequest('/auth/me'),
  adminStats: () => apiRequest('/stats/admin'),
  employerStats: () => apiRequest('/stats/employer'),
  getActivity: () => apiRequest('/activity'),
  getJobs: (query = '') => {
    const q = query.startsWith('?') ? query : (query ? `?${query}` : '');
    const sep = q.includes('?') ? '&' : '?';
    return apiRequest(`/jobs${q}${sep}_t=${Date.now()}`);
  },
  getMyJobs: () => apiRequest(`/jobs?mine=1&_t=${Date.now()}`),
  getJob: (id) => apiRequest(`/jobs/${id}`),
  createJob: (data) => apiRequest('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getApplications: () => apiRequest('/applications'),
  jobApplications: (jobId) => apiRequest(`/applications/job/${jobId}`),
  getApplication: (id) => apiRequest(`/applications/${id}`),
  applyToJob: (data) => apiRequest('/applications', { method: 'POST', body: JSON.stringify(data) }),
  updateApplicationStatus: (id, status) => apiRequest(`/applications/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getPipeline: (jobId) => apiRequest(`/applications/pipeline/${jobId}`),
  runAiAnalysis: (jobId) => apiRequest(`/ai/rank/${jobId}`, { method: 'POST' }),
  getRankings: (jobId) => apiRequest(`/ai/rankings/${jobId}`),
  analyzeApplication: (appId) => apiRequest(`/ai/analyze/${appId}`, { method: 'POST' }),
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

function getBasePath() {
  // Local Express serves frontend under /frontend/
  if (window.location.port === '3001' || window.location.pathname.startsWith('/frontend')) {
    return '/frontend';
  }
  return '';
}

function page(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getBasePath()}${p}`;
}

function requireAuth(roles) {
  const user = getUser();
  if (!user || !getToken()) {
    window.location.href = page('home/login.html');
    return;
  }
  if (roles && !roles.includes(user.role)) {
    const dashboards = { admin: 'admin/dashboard.html', employer: 'employer/dashboard.html', applicant: 'applicant/dashboard.html' };
    window.location.href = page(dashboards[user.role] || 'home/index.html');
  }
}

function redirectByRole(role) {
  const map = { admin: 'admin/dashboard.html', employer: 'employer/dashboard.html', applicant: 'applicant/dashboard.html' };
  window.location.href = page(map[role] || 'home/index.html');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
