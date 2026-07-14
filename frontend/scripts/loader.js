let _loaderSeq = 0;

function loaderMarkup(options = {}) {
  const { size = 0.75, message = '', inline = false } = options;
  const id = `clipping-${++_loaderSeq}`;
  return `
    <div class="loader-wrap${inline ? ' loader-wrap--inline' : ''}">
      <div class="loader" style="--size:${size}">
        <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <mask id="${id}">
              <g class="mask-group">
                <polygon class="mask-poly-1" points="0,0 100,0 100,100 0,100" fill="black"></polygon>
                <polygon class="mask-poly-2" points="25,25 75,25 50,75" fill="white"></polygon>
                <polygon class="mask-poly-3" points="50,25 75,75 25,75" fill="white"></polygon>
                <polygon class="mask-poly-4" points="35,35 65,35 50,65" fill="white"></polygon>
                <polygon class="mask-poly-5" points="35,35 65,35 50,65" fill="white"></polygon>
                <polygon class="mask-poly-6" points="35,35 65,35 50,65" fill="white"></polygon>
                <polygon class="mask-poly-7" points="35,35 65,35 50,65" fill="white"></polygon>
              </g>
            </mask>
          </defs>
        </svg>
        <div class="box" style="mask:url(#${id});-webkit-mask:url(#${id})"></div>
      </div>
      ${message ? `<p class="loader-message">${message}</p>` : ''}
    </div>`;
}

function showLoader(el, message = 'Loading...', size = 0.75) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.innerHTML = loaderMarkup({ size, message });
}

function setButtonLoading(btn, loading, fallbackText = '', loadingText = 'Please wait...') {
  if (typeof btn === 'string') btn = document.querySelector(btn);
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = loaderMarkup({ size: 0.32, message: loadingText, inline: true });
    btn.classList.add('btn-loading');
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || fallbackText;
    btn.classList.remove('btn-loading');
    delete btn.dataset.originalHtml;
  }
}

function showPageLoader(message = 'Loading...') {
  let overlay = document.getElementById('page-loader-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'page-loader-overlay';
    overlay.className = 'page-loader-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = loaderMarkup({ size: 1, message });
  overlay.classList.add('visible');
}

function hidePageLoader() {
  document.getElementById('page-loader-overlay')?.classList.remove('visible');
}

function initLoaders() {
  document.querySelectorAll('[data-loader]').forEach((el) => {
    showLoader(el, el.dataset.loader || 'Loading...', parseFloat(el.dataset.loaderSize) || 0.75);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoaders);
} else {
  initLoaders();
}
