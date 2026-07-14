document.getElementById('nav-toggle')?.addEventListener('click', () => {
  const links = document.getElementById('nav-links');
  const btn = document.getElementById('nav-toggle');
  const open = links.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
});

document.querySelectorAll('#nav-links a[href^="#"]').forEach((a) => {
  a.addEventListener('click', () => {
    document.getElementById('nav-links')?.classList.remove('open');
  });
});

// Highlight current page in nav
const page = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('#nav-links a:not(.btn)').forEach((a) => {
  const href = a.getAttribute('href') || '';
  const linkPage = href.split('#')[0];
  if (linkPage === page) a.classList.add('nav-active');
});
