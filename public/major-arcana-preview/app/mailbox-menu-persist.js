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

  // Global utklick-handler: när användaren klickar UTANFÖR mailbox-menu
  // OCH utanför togglens label, stäng + spara stängt-intent.
  let outsideClickBound = false;
  function bindOutsideClick() {
    if (outsideClickBound) return;
    outsideClickBound = true;
    document.addEventListener('click', (e) => {
      const toggle = document.getElementById('mailbox-menu-toggle');
      if (!toggle || !toggle.checked) return;
      // Klick inom mailbox-menu eller label = OK, behåll öppen
      if (
        e.target.closest('.mailbox-menu') ||
        e.target.closest('label[for="mailbox-menu-toggle"]') ||
        e.target.id === 'mailbox-menu-toggle'
      ) {
        // Användaren klickade på items i menyn → behåll öppen, men
        // synca intent ifall klicket var direkt på togglen
        setTimeout(() => {
          userIntent = toggle.checked;
          writeIntent(userIntent);
        }, 50);
        return;
      }
      // Klick utanför → stäng
      isApplying = true;
      toggle.checked = false;
      isApplying = false;
      userIntent = false;
      writeIntent(false);
    }, true);
  }

  function tick() {
    bindToggleChange();
    applyIntent();
  }

  function waitForSettled(callback) {
    // Vänta tills inga DOM-mutations skett på 500 ms → appen är "klar"
    // med initial rendering. Detta förhindrar att dropdown visas medan
    // items fortfarande laddas in (vilket användaren såg som "hopp").
    let lastMutation = Date.now();
    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const check = () => {
      if (Date.now() - lastMutation > 500) {
        observer.disconnect();
        callback();
      } else {
        setTimeout(check, 200);
      }
    };
    // Max-wait safety: settla efter senast 3s även om mutations fortgår
    setTimeout(() => {
      observer.disconnect();
      callback();
    }, 3000);
    setTimeout(check, 700);
  }

  function init() {
    // FÖRST: bind toggle-change + utklick-handler så användarens KLICK fungerar
    bindToggleChange();
    bindOutsideClick();

    // SEN: vänta tills appen är settled, DÅ applicera persisted intent
    waitForSettled(() => {
      // Re-bind ifall toggle re-skapats under load
      bindToggleChange();
      applyIntent();

      // Efter settle: börja persistera över renderApp-wipes med MutationObserver
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
          bindToggleChange();
          applyIntent();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setInterval(() => {
        bindToggleChange();
        applyIntent();
      }, 1000);
    });
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
