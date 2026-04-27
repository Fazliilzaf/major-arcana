/**
 * Major Arcana Preview — Keyboard Shortcuts
 *
 * Globala kortkommandon som inte krockar med textfält.
 * Aktiveras endast när fokus inte ligger i input/textarea/contenteditable
 * eller i en öppen overlay (cmdk/saved-views/unified-search).
 *
 *   J / K          — nästa / föregående tråd i kön
 *   R              — svara (öppnar studio i reply-läge)
 *   N              — nytt mejl (compose)
 *   S              — markera "senare" (snooze)
 *   D              — radera
 *   ?              — visa cheatsheet
 *   /              — fokusera quick-search (om finns), annars öppna unified-search
 *   1..9           — byt till lane #N (1=Alla, 2=Agera nu, 3=Sprint, ...)
 *
 * Designmål: minimal kod, ingen DOM-skapelse förutom cheatsheet-modal.
 */
(() => {
  'use strict';

  let cheatsheetBackdrop = null;

  const LANE_BY_INDEX = [
    'all',         // 1
    'act-now',     // 2
    'sprint',      // 3
    'later',       // 4
    'admin',       // 5
    'review',      // 6
    'unclear',     // 7
    'bookable',    // 8
    'medical',     // 9
  ];

  function isTypingTarget(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = String(target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function isOverlayOpen() {
    // Om någon av våra overlays är öppen, hoppa över shortcuts
    const overlays = document.querySelectorAll(
      '.cco-cmdk-backdrop:not([hidden]), .cco-svw-backdrop:not([hidden]), .cco-usearch-backdrop:not([hidden]), .cco-shortcuts-backdrop:not([hidden])'
    );
    return overlays.length > 0;
  }

  function clickFirst(selector) {
    const el = document.querySelector(selector);
    if (el && typeof el.click === 'function') {
      el.click();
      return true;
    }
    return false;
  }

  function getThreadList() {
    return Array.from(document.querySelectorAll('[data-runtime-thread]'));
  }

  function getActiveThreadIndex(threads) {
    for (let i = 0; i < threads.length; i++) {
      if (
        threads[i].classList.contains('thread-card-selected') ||
        threads[i].getAttribute('aria-pressed') === 'true' ||
        threads[i].classList.contains('is-selected')
      ) {
        return i;
      }
    }
    return -1;
  }

  function navigateThread(delta) {
    const threads = getThreadList();
    if (threads.length === 0) return;
    const current = getActiveThreadIndex(threads);
    let nextIdx = current + delta;
    if (current === -1) nextIdx = delta > 0 ? 0 : threads.length - 1;
    nextIdx = Math.max(0, Math.min(threads.length - 1, nextIdx));
    const next = threads[nextIdx];
    if (next) {
      next.click();
      if (typeof next.scrollIntoView === 'function') {
        next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function openReply() {
    // Försök först studio reply-knapp
    if (clickFirst('[data-studio-open][data-studio-mode="reply"]')) return;
    if (clickFirst('[data-runtime-studio-open]')) return;
    if (clickFirst('[data-cco-action="reply"]')) return;
  }

  function openCompose() {
    clickFirst('[data-studio-open][data-studio-mode="compose"]');
  }

  function snoozeCurrent() {
    if (clickFirst('[data-cco-action="reply-later"]')) return;
    if (clickFirst('[data-runtime-snooze]')) return;
    if (clickFirst('[data-action="reply-later"]')) return;
  }

  function deleteCurrent() {
    if (clickFirst('[data-cco-action="delete"]')) return;
    if (clickFirst('[data-runtime-delete]')) return;
    if (clickFirst('[data-action="delete"]')) return;
  }

  function switchLane(laneId) {
    if (!laneId) return;
    clickFirst(`[data-queue-lane="${laneId}"]`);
  }

  // ---------- Cheatsheet ----------

  function injectStyles() {
    if (document.getElementById('cco-shortcuts-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-shortcuts-styles';
    style.textContent = `
.cco-shortcuts-backdrop {
  position: fixed; inset: 0; z-index: 9996;
  background: rgba(20, 18, 16, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
}
.cco-shortcuts-backdrop[hidden] { display: none; }
.cco-shortcuts {
  width: min(620px, 92vw);
  background: #fbf7f1;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.cco-shortcuts-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex; align-items: center; justify-content: space-between;
}
.cco-shortcuts-title { font-size: 14px; font-weight: 600; color: #2b251f; margin: 0; }
.cco-shortcuts-list {
  padding: 16px 20px; display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
  max-height: 60vh; overflow-y: auto;
}
.cco-shortcuts-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0;
  font-size: 13px; color: #2b251f;
}
.cco-shortcuts-row span:first-child { color: rgba(80, 60, 40, 0.75); }
.cco-shortcuts-key {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
  font-size: 11px;
  background: rgba(80, 60, 40, 0.08);
  padding: 3px 8px;
  border-radius: 6px;
  color: #5d4a3c;
  white-space: nowrap;
}
.cco-shortcuts-section {
  grid-column: 1 / -1;
  font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(80, 60, 40, 0.55);
  margin-top: 8px;
}
.cco-shortcuts-icon-button {
  width: 28px; height: 28px; border-radius: 6px;
  border: 0; background: transparent; cursor: pointer;
  color: rgba(80, 60, 40, 0.6); font-size: 16px;
}
.cco-shortcuts-icon-button:hover { background: rgba(80, 60, 40, 0.08); color: #2b251f; }
[data-cco-theme="dark"] .cco-shortcuts,
.is-dark .cco-shortcuts,
html[data-theme="dark"] .cco-shortcuts {
  background: #1f1b16; color: #f3ece2;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-shortcuts-row,
.is-dark .cco-shortcuts-row,
html[data-theme="dark"] .cco-shortcuts-row { color: #f3ece2; }
[data-cco-theme="dark"] .cco-shortcuts-key,
.is-dark .cco-shortcuts-key,
html[data-theme="dark"] .cco-shortcuts-key {
  background: rgba(255, 255, 255, 0.08); color: #f3ece2;
}
`.trim();
    document.head.appendChild(style);
  }

  function buildCheatsheet() {
    injectStyles();
    cheatsheetBackdrop = document.createElement('div');
    cheatsheetBackdrop.className = 'cco-shortcuts-backdrop';
    cheatsheetBackdrop.setAttribute('hidden', '');

    const dialog = document.createElement('div');
    dialog.className = 'cco-shortcuts';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Kortkommandon');

    const rows = [
      { section: 'Navigering' },
      { label: 'Nästa tråd', key: 'J' },
      { label: 'Föregående tråd', key: 'K' },
      { label: 'Byt lane (Alla → Medicinsk)', key: '1 – 9' },
      { section: 'Actions' },
      { label: 'Svara', key: 'R' },
      { label: 'Nytt mejl', key: 'N' },
      { label: 'Senare (snooze)', key: 'S' },
      { label: 'Radera', key: 'D' },
      { section: 'Sökning & paletter' },
      { label: 'Kommandopalett', key: '⌘K' },
      { label: 'Sök överallt', key: '⌘/' },
      { label: 'Spara aktuell vy', key: '⌘⇧S' },
      { label: 'Sparade vyer', key: '⌘⇧V' },
      { label: 'Visa det här', key: '?' },
      { label: 'Stäng modal/palett', key: 'Esc' },
    ];

    let listHtml = '';
    for (const row of rows) {
      if (row.section) {
        listHtml += `<div class="cco-shortcuts-section">${row.section}</div>`;
      } else {
        listHtml += `<div class="cco-shortcuts-row">
          <span>${row.label}</span>
          <span class="cco-shortcuts-key">${row.key}</span>
        </div>`;
      }
    }

    dialog.innerHTML = `
      <div class="cco-shortcuts-header">
        <h3 class="cco-shortcuts-title">Kortkommandon</h3>
        <button class="cco-shortcuts-icon-button" type="button" data-shortcuts-close aria-label="Stäng">×</button>
      </div>
      <div class="cco-shortcuts-list">${listHtml}</div>
    `;

    cheatsheetBackdrop.appendChild(dialog);
    document.body.appendChild(cheatsheetBackdrop);

    cheatsheetBackdrop.addEventListener('click', (event) => {
      if (event.target === cheatsheetBackdrop) closeCheatsheet();
    });
    dialog.querySelector('[data-shortcuts-close]').addEventListener('click', closeCheatsheet);
  }

  function openCheatsheet() {
    if (!cheatsheetBackdrop) buildCheatsheet();
    cheatsheetBackdrop.removeAttribute('hidden');
  }

  function closeCheatsheet() {
    if (cheatsheetBackdrop) cheatsheetBackdrop.setAttribute('hidden', '');
  }

  // ---------- Bind global keys ----------

  function handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return; // låt cmd/ctrl-snabbkommandon gå genom
    if (isTypingTarget(event.target)) return;
    if (isOverlayOpen()) {
      if (event.key === 'Escape') closeCheatsheet();
      return;
    }

    const k = event.key;

    // Cheatsheet
    if (k === '?') {
      event.preventDefault();
      openCheatsheet();
      return;
    }

    // Navigation
    if (k === 'j' || k === 'J') {
      event.preventDefault();
      navigateThread(1);
      return;
    }
    if (k === 'k' || k === 'K') {
      event.preventDefault();
      navigateThread(-1);
      return;
    }

    // Actions
    if (k === 'r' || k === 'R') {
      event.preventDefault();
      openReply();
      return;
    }
    if (k === 'n' || k === 'N') {
      event.preventDefault();
      openCompose();
      return;
    }
    if (k === 's' || k === 'S') {
      event.preventDefault();
      snoozeCurrent();
      return;
    }
    if (k === 'd' || k === 'D') {
      event.preventDefault();
      deleteCurrent();
      return;
    }

    // Quick-search shortcut
    if (k === '/') {
      event.preventDefault();
      const us = window.MajorArcanaPreviewUnifiedSearch;
      if (us && typeof us.open === 'function') us.open();
      return;
    }

    // Lane-byte 1-9
    if (k >= '1' && k <= '9') {
      const idx = Number(k) - 1;
      if (LANE_BY_INDEX[idx]) {
        event.preventDefault();
        switchLane(LANE_BY_INDEX[idx]);
      }
      return;
    }

    // Esc — stäng eventuellt öppen cheatsheet
    if (k === 'Escape') {
      closeCheatsheet();
    }
  }

  function bindGlobalShortcuts() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('keydown', handleKeyDown, false);
  }

  function mount() {
    bindGlobalShortcuts();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewKeyboardShortcuts = Object.freeze({
      mount,
      openCheatsheet,
      closeCheatsheet,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
