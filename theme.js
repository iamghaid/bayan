/* One preference shared by the workspace and its same-origin views. */
(() => {
  const key = 'bayan-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem(key); } catch (_) { /* Private storage can be unavailable. */ }
  function apply(value) {
    document.documentElement.dataset.theme = value;
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.textContent = value === 'dark' ? '☀ الوضع الفاتح' : '☾ الوضع الداكن';
      button.setAttribute('aria-pressed', String(value === 'dark'));
    });
  }
  apply(preference === 'dark' || preference === 'light' ? preference : system.matches ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.className = 'theme-toggle';
    button.type = 'button';
    button.onclick = () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch (_) { /* Still apply within this page. */ }
      apply(preference);
    };
    // Embedded views use the workspace's control; standalone pages get their own.
    if (!new URLSearchParams(location.search).has('embedded')) {
      (document.querySelector('.review-header') || document.querySelector('body > header') || document.querySelector('.wrap')).append(button);
    }
    apply(document.documentElement.dataset.theme);
  });
  addEventListener('storage', event => {
    if (event.key === key) { preference = event.newValue; apply(preference || (system.matches ? 'dark' : 'light')); }
  });
  system.addEventListener('change', () => { if (!preference) apply(system.matches ? 'dark' : 'light'); });
})();
