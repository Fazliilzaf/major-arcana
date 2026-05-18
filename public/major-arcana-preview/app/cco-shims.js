/**
 * app/cco-shims.js — slutgiltiga shims efter postmortem-städning 2026-05-08.
 *
 * Tre kvarvarande shims som lever utanför app.js bootstrap-flow:
 *  - P0-1: Mailbox-val persistens till localStorage
 *  - P0-3: Logout-knapp + Cmd+Shift+L kortkommando
 *  - P1-A: Theme-switcher delegerad click-handler
 *
 * Alla tidigare shims (P0-2, P1-1, P1-4, P2-1, P2-3, P1-B, P1-C, P1-D) har
 * migrerats till app.js eller cco-polish.css. Denna fil
 * ersatte runtime-fix-shims.js (raderad i samma commit).
 *
 * Inga beroenden utöver document/window/localStorage. Säker att ladda när
 * som helst i index.html.
 */
(() => {
  'use strict';

  const LS_KEY_SELECTED = 'cco.selectedMailboxIds.v1';
  const DEFAULT_MAILBOXES = ['contact', 'egzona', 'fazli', 'info', 'kons', 'marknad'];

  // ============================================================
  // P0-1: Mailbox-val persistens
  // ============================================================

  function readPersistedMailboxes() {
    try {
      const raw = localStorage.getItem(LS_KEY_SELECTED);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) {
      return null;
    }
  }

  function writePersistedMailboxes(ids) {
    try {
      const safe = Array.isArray(ids) ? ids : [];
      localStorage.setItem(LS_KEY_SELECTED, JSON.stringify(safe));
    } catch (e) {}
  }

  function applyPersistedMailboxes() {
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return false;

    let applied = 0;
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach((cb) => {
      const labelEl = cb.closest('label') || cb.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      const matchedKey = persisted.find((k) => labelText.includes(k.toLowerCase()));
      if (matchedKey && !cb.checked) {
        cb.click();
        applied += 1;
      }
    });
    return applied > 0;
  }

  function findMailboxToggleButton() {
    const selectors = [
      '[data-mailbox-toggle]',
      '[data-mailbox-picker-toggle]',
      '[data-truth-mailbox-toggle]',
      '.mailbox-toggle',
      '.mailbox-picker-toggle',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: text-baserad sökning
    const candidates = document.querySelectorAll(
      'button, label, [role="button"], [role="combobox"]'
    );
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (txt.length > 0 && txt.length < 80 && /Hair TP Clinic|mailboxar|mailboxes/i.test(txt)) {
        return el;
      }
    }
    return null;
  }

  async function autoOpenAndApplyAtBootstrap() {
    // 2026-05-18 (Fas 15): aggressiv mode borttagen. Tidigare öppnade
    // funktionen mailbox-dropdown via toggle.click() vid load, satte
    // checkboxar via cb.click(), och stängde sedan med body.click() +
    // syntetisk Escape-key — vilket gav "blink"-effekt och spammade
    // syntetiska event som app.js tolkar som user actions.
    //
    // Nu: applicera persisted state DIREKT om checkboxar redan finns
    // i DOM. Om inte finns — skippa helt (dropdown öppnas inte
    // programmatiskt). Användaren öppnar själv vid behov och state
    // appliceras då via watchMailboxChanges()-listenern.
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return;

    const existingCheckboxes = Array.from(
      document.querySelectorAll('input[type="checkbox"]')
    ).filter((cb) => {
      const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
      return DEFAULT_MAILBOXES.some((m) => lbl.includes(m));
    });
    if (existingCheckboxes.length > 0) {
      applyPersistedMailboxes();
    }
    // Ingen toggle.click()/cb.click()/Escape längre — inga syntetiska
    // event som "ploppar upp" UI vid sidladdning.
  }

  function watchMailboxChanges() {
    document.addEventListener(
      'change',
      (e) => {
        if (e.target?.type !== 'checkbox') return;
        const labelEl = e.target.closest('label') || e.target.parentElement;
        const labelText = (labelEl?.textContent || '').toLowerCase();
        const isMailboxCheckbox = DEFAULT_MAILBOXES.some((m) => labelText.includes(m));
        if (!isMailboxCheckbox) return;

        const checked = [];
        document.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
          const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
          const matched = DEFAULT_MAILBOXES.find((m) => lbl.includes(m));
          if (matched) checked.push(matched);
        });
        writePersistedMailboxes([...new Set(checked)]);
      },
      true
    );
  }

  function bootstrapMailboxPersistence() {
    watchMailboxChanges();
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return;

    if (findMailboxToggleButton()) {
      autoOpenAndApplyAtBootstrap().catch(() => {});
      return;
    }

    let triggered = false;
    const observer = new MutationObserver(() => {
      if (triggered) return;
      if (findMailboxToggleButton()) {
        triggered = true;
        observer.disconnect();
        autoOpenAndApplyAtBootstrap().catch(() => {});
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      if (!triggered) observer.disconnect();
    }, 30000);
  }

  // ============================================================
  // P0-3: Logout-knapp i Mer-meny
  // ============================================================

  function logout() {
    try {
      localStorage.removeItem('ARCANA_ADMIN_TOKEN');
      localStorage.removeItem('cco.selectedMailboxIds.v1');
    } catch (_e) {}
    window.location.href = '/';
  }

  function bootstrapLogout() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target && e.target.closest && e.target.closest('[data-shim-logout]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Logga ut? Token rensas och du måste logga in igen.')) {
          logout();
        }
      },
      true
    );
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (confirm('Logga ut? (Cmd+Shift+L)')) logout();
      }
    });
  }

  // ============================================================
  // P1-A: Theme-switcher
  // ============================================================

  function bootstrapThemeSwitcher() {
    document.addEventListener(
      'click',
      (e) => {
        const btn =
          e.target &&
          e.target.closest &&
          e.target.closest(
            '.preview-utility-button[aria-label*="läge"], ' +
              'button[aria-label="Ljusläge"], ' +
              'button[aria-label="Mörkläge"], ' +
              'button[aria-label="Mörkt läge"]'
          );
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (window.MajorArcanaPreviewTheme?.toggleTheme) {
          const next = window.MajorArcanaPreviewTheme.toggleTheme();
          const labels = { light: 'Mörkläge', dark: 'Systemläge', system: 'Ljusläge' };
          btn.setAttribute('aria-label', labels[next] || 'Tema');
        } else {
          const cur = document.documentElement.getAttribute('data-theme') || 'system';
          const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
          document.documentElement.setAttribute('data-theme', next);
          try {
            localStorage.setItem('cco.theme', next);
          } catch (_e) {}
        }
      },
      true
    );
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  function init() {
    try {
      bootstrapMailboxPersistence();
    } catch (e) {
      console.warn('[cco-shims] mailbox-persistens fel:', e);
    }
    try {
      bootstrapLogout();
    } catch (e) {
      console.warn('[cco-shims] logout fel:', e);
    }
    try {
      bootstrapThemeSwitcher();
    } catch (e) {
      console.warn('[cco-shims] theme-switcher fel:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
