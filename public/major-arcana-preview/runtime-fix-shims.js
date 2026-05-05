/**
 * runtime-fix-shims.js — körs efter app.js för att patcha P0-buggar i preview
 *
 * P0-1: Persistera selectedMailboxIds mellan sessions (localStorage)
 * P0-2: Fallback för "Okänd avsändare" — extrahera namn från email-localpart
 *
 * Dessa är non-invasive shims som hookar DOM + storage utan att ändra app.js.
 * När fixen byggs in i app.js permanent kan denna fil tas bort.
 */
(() => {
  'use strict';

  const LS_KEY_SELECTED = 'cco.selectedMailboxIds.v1';
  const DEFAULT_MAILBOXES = ['contact','egzona','fazli','info','kons','marknad'];

  // ============================================================
  // P0-1: Mailbox-val persistens
  // ============================================================

  function readPersistedMailboxes() {
    try {
      const raw = localStorage.getItem(LS_KEY_SELECTED);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }

  function writePersistedMailboxes(ids) {
    try {
      const safe = Array.isArray(ids) ? ids : [];
      localStorage.setItem(LS_KEY_SELECTED, JSON.stringify(safe));
    } catch (e) {}
  }

  function getCurrentlyCheckedMailboxes() {
    const checks = document.querySelectorAll('input[type="checkbox"][data-mailbox-id], input[type="checkbox"][data-mailbox-key]');
    const ids = [];
    checks.forEach(cb => {
      if (cb.checked) {
        const id = cb.dataset.mailboxId || cb.dataset.mailboxKey;
        if (id) ids.push(id);
      }
    });
    return ids;
  }

  function findMailboxRowsInDom() {
    // Mailbox-options container kan ha olika klassnamn — försök flera
    const containers = [
      '.mailbox-options',
      '[data-mailbox-options]',
      '[data-mailbox-list]',
      '[data-mailbox-picker]',
    ];
    for (const sel of containers) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function applyPersistedMailboxes() {
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return false;

    let applied = 0;
    // Strategi: hitta alla mailbox-checkboxes och markera de som matchar persisted-listan
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
      const labelEl = cb.closest('label') || cb.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      const matchedKey = persisted.find(k => labelText.includes(k.toLowerCase()));
      if (matchedKey && !cb.checked) {
        // Trigga click istället för bara setChecked så app.js sin event-handler körs
        cb.click();
        applied += 1;
      }
    });
    if (applied > 0) {
      console.log('[fix-shim] Återställde', applied, 'mailbox-val från localStorage');
    }
    return applied > 0;
  }

  function watchMailboxChanges() {
    // Lyssna på alla checkbox-changes globalt och spara tillstånd
    document.addEventListener('change', (e) => {
      if (e.target?.type !== 'checkbox') return;
      const labelEl = e.target.closest('label') || e.target.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      // Bara om det ser ut som en mailbox-checkbox
      const isMailboxCheckbox = DEFAULT_MAILBOXES.some(m => labelText.includes(m));
      if (!isMailboxCheckbox) return;

      // Samla alla nu-checkade mailbox-namn
      const checked = [];
      document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
        const matched = DEFAULT_MAILBOXES.find(m => lbl.includes(m));
        if (matched) checked.push(matched);
      });
      writePersistedMailboxes([...new Set(checked)]);
    }, true);
  }

  function bootstrapMailboxPersistence() {
    watchMailboxChanges();
    // Vänta på att DOM är ready och försök applicera flera gånger
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts += 1;
      const container = findMailboxRowsInDom();
      if (container || attempts >= maxAttempts) {
        clearInterval(interval);
        if (container) {
          applyPersistedMailboxes();
        }
      }
    }, 500);
  }

  // ============================================================
  // P0-2: "Okänd avsändare" fallback från email
  // ============================================================

  function humanizeLocalpart(localpart) {
    if (!localpart) return '';
    // foo.bar → Foo Bar, john_doe → John Doe
    return localpart
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function fixUnknownSenderInCard(cardEl) {
    if (!cardEl) return;
    // Sök efter "Okänd avsändare" text i kortet
    const walker = document.createTreeWalker(cardEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => /Okänd avsändare/i.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    if (targets.length === 0) return;

    // Försök hitta email någonstans i kortet eller dess data-attribut
    let email = '';
    // Kolla data-attribut på kortet och alla descendants
    const allElements = [cardEl, ...cardEl.querySelectorAll('*')];
    for (const el of allElements) {
      for (const attr of el.attributes || []) {
        const v = attr.value || '';
        const m = v.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (m) { email = m[0]; break; }
      }
      if (email) break;
    }
    // Fallback: leta i hela kortets textinnehåll
    if (!email) {
      const m = cardEl.textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (m) email = m[0];
    }

    if (!email) return; // Kan inte fixa utan email

    const localpart = email.split('@')[0];
    const humanName = humanizeLocalpart(localpart);
    if (!humanName) return;

    targets.forEach(textNode => {
      textNode.nodeValue = textNode.nodeValue.replace(/Okänd avsändare/gi, humanName);
    });
    cardEl.dataset.shimNameFixed = 'true';
  }

  function scanAndFixUnknownSenders(root) {
    const cards = (root || document).querySelectorAll('.thread-card:not([data-shim-name-fixed])');
    cards.forEach(fixUnknownSenderInCard);
  }

  function observeUnknownSenders() {
    // MutationObserver — fixa nya thread-cards när de renderas
    const obs = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) needsScan = true;
        if (m.type === 'characterData' && /Okänd avsändare/.test(m.target.nodeValue || '')) needsScan = true;
      }
      if (needsScan) scanAndFixUnknownSenders();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Initial scan
    scanAndFixUnknownSenders();
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    try { bootstrapMailboxPersistence(); } catch (e) { console.warn('[fix-shim] mailbox-persistens fel:', e); }
    try { observeUnknownSenders(); } catch (e) { console.warn('[fix-shim] okänd-avsändare-fix fel:', e); }
    console.log('[fix-shim] runtime-fix-shims aktiv (mailbox-persistens + okänd-avsändare)');
  }
})();
