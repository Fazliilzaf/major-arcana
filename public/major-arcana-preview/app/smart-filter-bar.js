/**
 * app/smart-filter-bar.js — quick-filter-chips längst ner i inbox-listan.
 *
 * Visar smart-chips för vanliga filter:
 *   "Behöver svar" / "Miss-risk" / "Snooze till imorgon" / "Återkommer från snooze" / "Klar"
 *
 * Klick på chip filtrerar listan visuellt (CSS-only) genom att lägga
 * data-active-smart-filter på .queue-history-list. Toggle på samma chip
 * deaktiverar filtret.
 *
 * Detta är COMPLEMENT till befintliga lane-filter — fokuserar på status
 * och snooze istället för lane.
 */
(() => {
  'use strict';

  const BAR_ID = 'cco-smart-filter-bar';

  const FILTERS = [
    { id: 'needs-reply', label: '↺ Behöver svar', match: (card) => /behöver svar|svar krävs/i.test(card.textContent || '') },
    { id: 'miss-risk', label: '⚠ Miss-risk', match: (card) => /miss-risk|hög risk/i.test(card.textContent || '') },
    { id: 'snoozed', label: '🔔 Snooze', match: (card) => card.classList.contains('is-snoozed') || card.querySelector('.snooze-pill') },
    { id: 'returned', label: '↩ Återkommer', match: (card) => card.classList.contains('is-just-returned') || card.querySelector('.snooze-pill-returned') },
    { id: 'done', label: '✓ Klar', match: (card) => /\bklar\b/i.test(card.textContent || '') && !/inte klar|ej klar/i.test(card.textContent || '') },
  ];

  let activeFilter = null;

  function applyFilter() {
    const cards = document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]');
    cards.forEach((c) => {
      if (!activeFilter) {
        c.style.removeProperty('display');
        return;
      }
      const def = FILTERS.find((f) => f.id === activeFilter);
      const matches = def && def.match(c);
      c.style.display = matches ? '' : 'none';
    });
  }

  function buildBar() {
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'cco-smart-filter-bar';
    bar.innerHTML = `
      <span class="smart-filter-label">SMART INFO &amp; FILTER</span>
      ${FILTERS.map((f) => `
        <button type="button" class="smart-filter-chip" data-filter="${f.id}">${f.label}</button>
      `).join('')}
    `;
    bar.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      const id = chip.dataset.filter;
      activeFilter = activeFilter === id ? null : id;
      bar.querySelectorAll('[data-filter]').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.filter === activeFilter);
      });
      applyFilter();
    });
    return bar;
  }

  function injectBar() {
    if (document.getElementById(BAR_ID)) return true;
    const shell = document.querySelector('.preview-shell');
    if (!shell) return false;
    const footer = document.getElementById('cco-keyboard-footer');
    const bar = buildBar();
    if (footer) {
      shell.insertBefore(bar, footer);
    } else {
      shell.appendChild(bar);
    }
    return true;
  }

  function init() {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      if (injectBar() || attempts >= 20) return;
      setTimeout(tick, 400);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.__SmartFilterBar = Object.freeze({
    set: (id) => { activeFilter = id; applyFilter(); },
    clear: () => { activeFilter = null; applyFilter(); },
    active: () => activeFilter,
  });
})();
