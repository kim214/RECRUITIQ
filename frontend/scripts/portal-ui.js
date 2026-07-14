/* Portal stat card builder */
const STAT_ICONS = {
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
  apps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/></svg>',
  pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 17l-6.5 3.5 2-7L2 9h7z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>',
};

function buildStatCard({ label, value, icon = 'chart', accent = '', href }) {
  const iconSvg = STAT_ICONS[icon] || STAT_ICONS.chart;
  const tag = href ? 'a' : 'div';
  const extra = href ? ` href="${href}" style="text-decoration:none;color:inherit"` : '';
  const clickable = href ? ' clickable' : '';
  return `<${tag} class="stat-card${clickable} stat-${accent}"${extra}>
    <div class="stat-icon-wrap">${iconSvg}</div>
    <div class="stat-meta"><span class="label">${label}</span><span class="value">${value}</span></div>
  </${tag}>`;
}

function buildWelcomeBanner(title, subtitle, emoji = '👋') {
  return `<div class="dash-welcome-content">
    <h2>${title}</h2>
    <p>${subtitle}</p>
  </div>
  <div class="dash-welcome-emoji" aria-hidden="true">${emoji}</div>`;
}

function buildEmptyState(icon, title, message) {
  return `<div class="empty-state">
    <div class="empty-icon-wrap">${icon}</div>
    <h3>${title}</h3>
    <p>${message}</p>
  </div>`;
}
