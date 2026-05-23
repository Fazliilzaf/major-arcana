'use strict';

(function initCcoMobileShell() {
  const MQ = '(max-width: 768px)';

  function applyMobileShellState() {
    const on = window.matchMedia(MQ).matches;
    document.documentElement.toggleAttribute('data-cco-mobile-shell', on);
  }

  applyMobileShellState();

  try {
    window.matchMedia(MQ).addEventListener('change', applyMobileShellState);
  } catch {
    window.addEventListener('resize', applyMobileShellState);
  }
})();
