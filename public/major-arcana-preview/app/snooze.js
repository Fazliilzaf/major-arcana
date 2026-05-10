/**
 * app/snooze.js — snooza thread-cards till specifik tid med auto-återkomst.
 *
 * UX:
 *  - Klick på data-quick-action="later" eller "schedule" på ett kort → overlay
 *    med tidsval (1h / 4h / imorgon 09:00 / nästa måndag 09:00 / anpassad).
 *  - Snoozat kort:
 *      * Få pill "🔔 Snooze till X" på kortet
 *      * Visuellt nedtonat (opacity)
 *      * Inga keyboard-actions triggas på det
 *  - När snoozetiden är ute (kollas var minut):
 *      * Pillen byts till "Återkommer från snooze" (highlight pulse)
 *      * Pillen försvinner efter 30s
 *
 * Persistens: localStorage 'cco.snoozedThreads.v1' = { [threadId]: { until: ISO, snoozedAt: ISO } }
 *
 * Exposed: window.__Snooze = {
 *   snooze(threadId, until),     // ISO eller Date
 *   unsnooze(threadId),
 *   getSnoozed(),                // { id: { until, snoozedAt }, ... }
 *   isSnoozed(threadId),
 *   formatRelative(date),        // "1h", "imorgon 09:00", "5 dagar"
 * }
 */
(() => {
  'use strict';

  const LS_KEY = 'cco.snoozedThreads.v1';
  const RETURN_HIGHLIGHT_MS = 30000;

  // ============================================================
  // Storage
  // ============================================================
  function readStore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function writeStore(data) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data || {}));
    } catch (_e) {}
  }

  function snoozeThread(threadId, untilDateOrIso) {
    if (!threadId) return false;
    const until = (untilDateOrIso instanceof Date)
      ? untilDateOrIso.toISOString()
      : String(untilDateOrIso);
    const store = readStore();
    store[threadId] = { until, snoozedAt: new Date().toISOString() };
    writeStore(store);
    applySnoozeStateToCard(threadId);
    return true;
  }

  function unsnoozeThread(threadId) {
    const store = readStore();
    if (!store[threadId]) return false;
    delete store[threadId];
    writeStore(store);
    applySnoozeStateToCard(threadId);
    return true;
  }

  function isSnoozed(threadId) {
    const entry = readStore()[threadId];
    if (!entry) return false;
    return new Date(entry.until).getTime() > Date.now();
  }

  function getSnoozed() {
    return readStore();
  }

  // ============================================================
  // Tids-presets + formatering
  // ============================================================
  function tomorrow9() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  function nextMonday9() {
    const d = new Date();
    const day = d.getDay(); // 0 = sön, 1 = mån
    const diff = (day === 1) ? 7 : ((8 - day) % 7) || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  function inHours(h) {
    return new Date(Date.now() + h * 60 * 60 * 1000);
  }

  function formatRelative(dateOrIso) {
    const d = (dateOrIso instanceof Date) ? dateOrIso : new Date(dateOrIso);
    const ms = d.getTime() - Date.now();
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 7) {
      const today = new Date();
      const isTomorrow = d.getDate() === today.getDate() + 1 && d.getMonth() === today.getMonth();
      if (isTomorrow) return `imorgon ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `${days} dagar`;
    }
    return d.toLocaleDateString('sv-SE');
  }

  const PRESETS = [
    { label: 'Om 1 timme', getDate: () => inHours(1) },
    { label: 'Om 4 timmar', getDate: () => inHours(4) },
    { label: 'Imorgon 09:00', getDate: tomorrow9 },
    { label: 'Nästa måndag 09:00', getDate: nextMonday9 },
  ];

  // ============================================================
  // Overlay
  // ============================================================
  let overlayEl = null;

  function buildOverlay(threadId, anchorEl) {
    closeOverlay();
    overlayEl = document.createElement('div');
    overlayEl.className = 'snooze-overlay';
    overlayEl.dataset.snoozeThread = threadId;
    overlayEl.innerHTML = `
      <div class="snooze-overlay-card" role="dialog" aria-label="Snooze tråd">
        <div class="snooze-overlay-header">
          <span class="snooze-overlay-title">Snooza tråden</span>
          <button type="button" class="snooze-overlay-close" data-snooze-action="cancel" aria-label="Stäng">×</button>
        </div>
        <div class="snooze-overlay-presets">
          ${PRESETS.map((p, i) => `
            <button type="button" class="snooze-preset" data-snooze-action="preset" data-snooze-preset-idx="${i}">
              <span class="snooze-preset-label">${p.label}</span>
              <span class="snooze-preset-when">${formatRelative(p.getDate())}</span>
            </button>
          `).join('')}
        </div>
        <div class="snooze-overlay-custom">
          <label for="snooze-custom-datetime" class="snooze-custom-label">Anpassad tid:</label>
          <input type="datetime-local" id="snooze-custom-datetime" class="snooze-custom-input" />
          <button type="button" class="snooze-custom-apply" data-snooze-action="custom">Snooza</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlayEl);

    // Position nära anchor
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const card = overlayEl.querySelector('.snooze-overlay-card');
      const cardWidth = 280;
      let left = rect.left;
      if (left + cardWidth > window.innerWidth - 12) left = window.innerWidth - cardWidth - 12;
      card.style.position = 'fixed';
      card.style.top = `${rect.bottom + 4}px`;
      card.style.left = `${left}px`;
    }

    // Default custom = imorgon 09:00
    const tmrw = tomorrow9();
    const customInput = overlayEl.querySelector('#snooze-custom-datetime');
    if (customInput) {
      const pad = (n) => String(n).padStart(2, '0');
      customInput.value = `${tmrw.getFullYear()}-${pad(tmrw.getMonth()+1)}-${pad(tmrw.getDate())}T${pad(tmrw.getHours())}:${pad(tmrw.getMinutes())}`;
    }

    overlayEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-snooze-action]');
      if (!btn) {
        if (e.target === overlayEl) closeOverlay();
        return;
      }
      e.stopPropagation();
      const action = btn.dataset.snoozeAction;
      if (action === 'cancel') {
        closeOverlay();
      } else if (action === 'preset') {
        const idx = parseInt(btn.dataset.snoozePresetIdx, 10);
        const preset = PRESETS[idx];
        if (preset) {
          snoozeThread(threadId, preset.getDate());
          closeOverlay();
        }
      } else if (action === 'custom') {
        const v = customInput?.value;
        if (v) {
          snoozeThread(threadId, new Date(v));
          closeOverlay();
        }
      }
    });

    // Stäng på Esc
    document.addEventListener('keydown', escCloseHandler, { once: true });
  }

  function escCloseHandler(e) {
    if (e.key === 'Escape') closeOverlay();
  }

  function closeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    document.removeEventListener('keydown', escCloseHandler);
  }

  // ============================================================
  // DOM-state-syncing (var snooze visas på korten)
  // ============================================================
  function applySnoozeStateToCard(threadId) {
    const card = document.querySelector(`.thread-card[data-runtime-thread="${threadId}"]`);
    if (!card) return;
    const entry = readStore()[threadId];

    // Rensa befintlig snooze-pill
    card.querySelectorAll('.snooze-pill').forEach(n => n.remove());
    card.classList.remove('is-snoozed', 'is-just-returned');

    if (!entry) return;

    const untilDate = new Date(entry.until);
    const isReturning = untilDate.getTime() <= Date.now();

    if (isReturning) {
      // Snooze är slut — visa "återkommer"-pill kort
      card.classList.add('is-just-returned');
      const pill = document.createElement('span');
      pill.className = 'snooze-pill snooze-pill-returned';
      pill.textContent = '↩ Återkommer från snooze';
      const target = card.querySelector('.warm-content') || card;
      target.appendChild(pill);
      // Auto-clean efter 30s
      window.setTimeout(() => {
        unsnoozeThread(threadId);
      }, RETURN_HIGHLIGHT_MS);
    } else {
      card.classList.add('is-snoozed');
      const pill = document.createElement('span');
      pill.className = 'snooze-pill';
      pill.innerHTML = `<span class="snooze-pill-icon" aria-hidden="true">🔔</span><span class="snooze-pill-label">Snooze till ${formatRelative(untilDate)}</span>`;
      const target = card.querySelector('.warm-content') || card;
      target.appendChild(pill);
    }
  }

  function syncAllCards() {
    const store = readStore();
    Object.keys(store).forEach(applySnoozeStateToCard);
  }

  // ============================================================
  // Click-handler — hook in i quick-action "later" och "schedule"
  // ============================================================
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-action="later"], [data-quick-action="schedule"]');
    if (!btn) return;
    const card = btn.closest('.thread-card[data-runtime-thread]');
    if (!card) return;
    const threadId = card.dataset.runtimeThread;
    if (!threadId) return;
    e.preventDefault();
    e.stopPropagation();
    buildOverlay(threadId, btn);
  }, true);

  // MutationObserver: när nya kort renderas, applya snooze-state.
  // Debounce + disconnect runt mutationen så vi undviker infinite loop
  // (syncAllCards muterar DOM → MO triggar → loop).
  let syncScheduled = false;
  let isSyncing = false;
  const observer = new MutationObserver(() => {
    if (isSyncing || syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      isSyncing = true;
      try { syncAllCards(); } finally { isSyncing = false; }
    });
  });
  // Lyssna BARA på queue-history-list (där thread-cards renderas), inte hela body
  function bindObserver() {
    const list = document.querySelector('.queue-history-list');
    if (list) observer.observe(list, { childList: true });
    else setTimeout(bindObserver, 500);
  }
  bindObserver();

  // Var minut: kolla om någon snooze är slut → trigga return-pill
  window.setInterval(syncAllCards, 60000);

  // Init: applya state direkt vid load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAllCards, { once: true });
  } else {
    syncAllCards();
  }

  // ============================================================
  // Exposed API
  // ============================================================
  window.__Snooze = Object.freeze({
    snooze: snoozeThread,
    unsnooze: unsnoozeThread,
    isSnoozed,
    getSnoozed,
    formatRelative,
    presets: PRESETS,
  });
})();
