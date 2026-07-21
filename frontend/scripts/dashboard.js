function initSidebar(activePage) {
  const user = getUser();
  if (user) {
    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    const role = document.getElementById('user-role');
    if (avatar) avatar.textContent = (user.fullName || user.email || '?')[0].toUpperCase();
    if (name) name.textContent = user.fullName || user.email;
    if (role) role.textContent = user.email ? `${user.role} · ${user.email}` : user.role;
    if (user.role) {
      document.body.classList.add(`portal-${user.role}`);
    }
  }

  document.querySelectorAll('.sidebar-nav a[data-page]').forEach((link) => {
    if (link.dataset.page === activePage) link.classList.add('active');
  });

  const logout = document.getElementById('logout-btn');
  if (logout) {
    logout.addEventListener('click', (e) => {
      e.preventDefault();
      clearAuth();
      window.location.href = page('home/login.html');
    });
  }

  // Refresh user from server to fix stale tokens after DB migration
  api.me().then((fresh) => {
    const token = fresh.token || getToken();
    const { token: _t, ...user } = fresh;
    setAuth(token, user);
    const name = document.getElementById('user-name');
    const avatar = document.getElementById('user-avatar');
    if (name) name.textContent = fresh.fullName || fresh.email;
    if (avatar) avatar.textContent = (fresh.fullName || fresh.email || '?')[0].toUpperCase();
    const role = document.getElementById('user-role');
    if (role) role.textContent = fresh.email ? `${fresh.role} · ${fresh.email}` : fresh.role;
  }).catch(() => {});
}
