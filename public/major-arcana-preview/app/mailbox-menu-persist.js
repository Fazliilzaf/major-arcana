/**
 * app/mailbox-menu-persist.js — bevarar mailbox-dropdown-state över renderApp-wipes.
 *
 * BUGG som detta löser:
 *   När användaren öppnar mailbox-dropdown (#mailbox-menu-toggle.checked=true),
 *   stängs den av sig själv efter ~600ms. Orsak: renderApp() körs på polling-
 *   intervall och wipar containern → input-element re-skapas med default
 *   checked=false → menyn stängs.
 *
 * Lösning: persist user intent via localStorage + MutationObserver som
 *   restore:ar checked-state efter varje DOM-mutation.
 *
 * Spar bara till localStorage när användaren EXPLICIT toggle:ar (klick).
 * Auto-stäng vid utklick stoppas så att menyn förblir öppen mellan renders.
 */
(() => {
  'use strict';

  const LS_KEY = 'cco.mailboxMenuOpen.v1';
  let userIntent = readIntent();
  let isApplying = false;

  function readIntent() {
    try {
      return localStorage.getItem(LS_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function writeIntent(open) {
    try {
      localStorage.setItem(LS_KEY, open ? '1' : '0');
    } catch (_e) {}
  }

  function applyIntent() {
    const toggle = document.getElementById('mailbox-menu-toggle');
    if (!toggle) return;
    if (toggle.checked !== userIntent) {
      isApplying = true;
      toggle.checked = userIntent;
      isApplying = false;
    }
  }

  function bindToggleChange() {
    const toggle = document.getElementById('mailbox-menu-toggle');
    if (!toggle || toggle.dataset.persistBound) return;
    toggle.dataset.persistBound = '1';
    toggle.addEventListener('change', () => {
      if (isApplying) return;
      userIntent = toggle.checked;
      writeIntent(userIntent);
    });
  }

  function tick() {
    bindToggleChange();
    applyIntent();
  }

  function init() {
    // Initial apply
    tick();
    // Observera body för DOM-mutations (renderApp wipar olika containers)
    const observer = new MutationObserver(() => {
      // Debounce med rAF
      requestAnimationFrame(tick);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Backup polling om observer missar något
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.__MailboxMenuPersist = Object.freeze({
    open: () => { userIntent = true; writeIntent(true); applyIntent(); },
    close: () => { userIntent = false; writeIntent(false); applyIntent(); },
    isOpen: () => userIntent,
  });
})();
