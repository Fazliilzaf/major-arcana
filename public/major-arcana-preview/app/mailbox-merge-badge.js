/**
 * app/mailbox-merge-badge.js — multi-mailkonto-badge på avatar.
 *
 * När en tråd kommer från flera mailkonton (sammanslagen), visa badge
 * med antal mailkonton på avataren. Tooltip på hover visar adresserna.
 *
 * Heuristik: kort med ≥2 unika mailbox-adresser i tråden (från data
 * eller från thread.mailboxAddresses-array). Faller tillbaka till
 * thread.mailboxes-array.
 */
(() => {
  'use strict';

  function getMailboxCountFromCard(card) {
    // Försök hämta från data-attribut
    const explicit = card.dataset.mailboxCount;
    if (explicit && parseInt(explicit, 10) > 1) return parseInt(explicit, 10);

    // Försök hämta från thread-objekt via window.__App?.state
    const id = card.dataset.runtimeThread;
    try {
      const state = window.__App?.state || (typeof state !== 'undefined' ? state : null);
      const threads = state?.runtime?.threads || [];
      const t = threads.find((x) => x && x.id === id);
      if (t) {
        const addrs = t.mailboxAddresses || t.mailboxes || [];
        const unique = Array.from(new Set(addrs.filter(Boolean)));
        if (unique.length > 1) {
          // Spara på cardet för tooltip
          card.dataset.mailboxAddresses = unique.join(',');
          return unique.length;
        }
      }
    } catch (_e) {}
    return 0;
  }

  function applyBadge(card) {
    if (!card) return;
    const avatar = card.querySelector('.warm-avatar');
    if (!avatar) return;
    const n = getMailboxCountFromCard(card);
    if (n > 1) {
      avatar.dataset.mailboxCount = String(n);
      const addrs = card.dataset.mailboxAddresses;
      if (addrs) avatar.title = 'Sammanslagen från:\n' + addrs.split(',').join('\n');
    } else if (avatar.dataset.mailboxCount) {
      delete avatar.dataset.mailboxCount;
      avatar.removeAttribute('title');
    }
  }

  function scanAll() {
    document
      .querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]')
      .forEach(applyBadge);
  }

  let syncScheduled = false;
  function scheduleScan() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      scanAll();
    });
  }

  function bindObserver() {
    const list = document.querySelector('.queue-history-list');
    if (!list) {
      setTimeout(bindObserver, 500);
      return;
    }
    const observer = new MutationObserver(scheduleScan);
    observer.observe(list, { childList: true });
    scanAll();
  }

  function init() {
    bindObserver();
    // Periodisk re-scan om state laddas senare
    setInterval(scheduleScan, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Exponera för debug + manuell trigger
  window.__MailboxMergeBadge = Object.freeze({
    apply: applyBadge,
    scan: scanAll,
    fakeBadge: (threadId, count) => {
      const card = document.querySelector(`.thread-card[data-runtime-thread="${threadId}"]`);
      if (!card) return false;
      card.dataset.mailboxCount = String(count);
      applyBadge(card);
      return true;
    },
  });
})();
