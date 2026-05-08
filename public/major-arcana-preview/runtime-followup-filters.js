/**
 * Major Arcana Preview — Follow-up Filters
 *
 * 5 chips ovanpå köns lane-rad:
 *   • Alla            — visa alla trådar (no-op)
 *   • Försenade       — uppföljning vars deadline passerat (tag: act-now eller followup + sla breach)
 *   • Idag            — uppföljning idag (tag: today)
 *   • Imorgon         — uppföljning imorgon (tag: tomorrow)
 *   • Väntar svar     — vi skickade senast, kund har inte svarat (tag: followup + later)
 *
 * Förlitar sig på data-runtime-tags="..." som sätts av runtime-queue-renderers.js
 * (efter patch). Tags är t.ex. "act-now,today,sprint" — kommaseparerad lista.
 *
 * Filtret applicerar display:none på trådar som inte matchar — och re-applicerar
 * via MutationObserver när nya trådar laddas in via live-refresh.
 *
 * Persisteras i localStorage (key: cco.followupFilter.v1).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cco.followupFilter.v1';
  const FILTER_DEFINITIONS = Object.freeze([
    { id: 'all', label: 'Alla', match: () => true },
    {
      id: 'overdue',
      label: 'Försenade',
      match: (tags) => tags.has('act-now') || (tags.has('followup') && tags.has('high-risk')),
    },
    {
      id: 'today',
      label: 'Idag',
      match: (tags) => tags.has('today'),
    },
    {
      id: 'tomorrow',
      label: 'Imorgon',
      match: (tags) => tags.has('tomorrow'),
    },
    {
      id: 'waiting_reply',
      label: 'Väntar svar',
      match: (tags) => tags.has('followup') && tags.has('later'),
    },
  ]);

  let activeFilterId = 'all';
  let filterRow = null;
  let mutationObserver = null;

  function readStorage() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return 'all';
      const filterId = String(raw).trim();
      return FILTER_DEFINITIONS.some((f) => f.id === filterId) ? filterId : 'all';
    } catch (_e) {
      return 'all';
    }
  }

  function writeStorage(filterId) {
    try {
      if (filterId === 'all') {
        window.localStorage?.removeItem(STORAGE_KEY);
      } else {
        window.localStorage?.setItem(STORAGE_KEY, filterId);
      }
    } catch (_e) { /* tyst */ }
  }

  function parseTags(el) {
    const raw = el?.getAttribute?.('data-runtime-tags') || '';
    const set = new Set();
    raw.split(',').forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) set.add(trimmed);
    });
    return set;
  }

  function applyFilter(filterId) {
    const def = FILTER_DEFINITIONS.find((f) => f.id === filterId) || FILTER_DEFINITIONS[0];
    const threadCards = document.querySelectorAll('[data-runtime-thread]');
    let visible = 0;
    let hidden = 0;
    threadCards.forEach((card) => {
      const tags = parseTags(card);
      const show = def.match(tags);
      if (show) {
        card.removeAttribute('data-followup-filter-hidden');
        if (card.style.display === 'none') card.style.display = '';
        visible += 1;
      } else {
        card.setAttribute('data-followup-filter-hidden', '');
        card.style.display = 'none';
        hidden += 1;
      }
    });
    return { visible, hidden };
  }

  function updateChipsState() {
    if (!filterRow) return;
    filterRow.querySelectorAll('[data-followup-chip]').forEach((chip) => {
      const isActive = chip.getAttribute('data-followup-chip') === activeFilterId;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setActiveFilter(filterId, { skipApply = false, skipPersist = false } = {}) {
    const valid = FILTER_DEFINITIONS.some((f) => f.id === filterId);
    if (!valid) return;
    activeFilterId = filterId;
    updateChipsState();
    if (!skipApply) applyFilter(activeFilterId);
    if (!skipPersist) writeStorage(activeFilterId);
  }

  function reapplyActiveFilter() {
    applyFilter(activeFilterId);
  }

  // ---------- Styles ----------
  function injectStyles() {
    if (document.getElementById('cco-followup-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-followup-styles';
    style.textContent = `
.cco-followup-row {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(80, 60, 40, 0.06);
  background: transparent;
}
.cco-followup-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px;
  background: rgba(80, 60, 40, 0.05);
  color: rgba(80, 60, 40, 0.75);
  border: 0; border-radius: 999px;
  font-family: inherit; font-size: 11px; font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  white-space: nowrap;
}
.cco-followup-chip:hover {
  background: rgba(80, 60, 40, 0.10);
  color: #2b251f;
}
.cco-followup-chip.is-active {
  background: #2b251f;
  color: #fbf7f1;
}
.cco-followup-chip.is-active:hover {
  background: #1a1612;
}
.cco-followup-row-label {
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(80, 60, 40, 0.5);
  align-self: center;
  padding: 0 4px;
}
[data-cco-theme="dark"] .cco-followup-chip,
.is-dark .cco-followup-chip,
html[data-theme="dark"] .cco-followup-chip {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(243, 236, 226, 0.7);
}
[data-cco-theme="dark"] .cco-followup-chip:hover,
.is-dark .cco-followup-chip:hover,
html[data-theme="dark"] .cco-followup-chip:hover {
  background: rgba(255, 255, 255, 0.10);
  color: #f3ece2;
}
[data-cco-theme="dark"] .cco-followup-chip.is-active,
.is-dark .cco-followup-chip.is-active,
html[data-theme="dark"] .cco-followup-chip.is-active {
  background: #f3ece2;
  color: #1f1b16;
}
`.trim();
    document.head.appendChild(style);
  }

  function buildChipsRow() {
    const row = document.createElement('div');
    row.className = 'cco-followup-row';
    row.setAttribute('data-cco-followup-row', '');
    row.setAttribute('aria-label', 'Uppföljnings-filter');

    const label = document.createElement('span');
    label.className = 'cco-followup-row-label';
    label.textContent = 'Uppföljn.';
    row.appendChild(label);

    for (const def of FILTER_DEFINITIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cco-followup-chip';
      chip.setAttribute('data-followup-chip', def.id);
      chip.setAttribute('aria-pressed', def.id === activeFilterId ? 'true' : 'false');
      if (def.id === activeFilterId) chip.classList.add('is-active');
      chip.textContent = def.label;
      chip.addEventListener('click', () => {
        const next = def.id === activeFilterId && def.id !== 'all' ? 'all' : def.id;
        setActiveFilter(next);
      });
      row.appendChild(chip);
    }
    return row;
  }

  function findInsertionAnchor() {
    // Vi vill placera chips-raden ovanpå tråd-listan men under befintliga lane-chips.
    // Möjliga ankare i fallande prio:
    return (
      document.querySelector('[data-runtime-thread-list]') ||
      document.querySelector('.queue-thread-list') ||
      document.querySelector('.queue-shell .thread-list') ||
      document.querySelector('[data-queue-lane="all"]')?.closest('section') ||
      document.querySelector('.queue-shell')
    );
  }

  function injectChipsRow() {
    if (filterRow) return true;
    const anchor = findInsertionAnchor();
    if (!anchor) return false;
    injectStyles();
    filterRow = buildChipsRow();
    // Försök placera FÖRE listan, annars EFTER ankaret
    const list =
      anchor.matches?.('[data-runtime-thread-list], .queue-thread-list, .thread-list')
        ? anchor
        : anchor.querySelector?.('[data-runtime-thread-list], .queue-thread-list, .thread-list');
    if (list && list.parentNode) {
      list.parentNode.insertBefore(filterRow, list);
    } else if (anchor.parentNode) {
      anchor.parentNode.insertBefore(filterRow, anchor.nextSibling);
    } else {
      anchor.appendChild(filterRow);
    }
    return true;
  }

  // Fas 2 cleanup: MutationObserver ersatt med periodisk poll.
  // Filter behöver bara re-applicera när nya cards laddas (worklist-refresh
  // var ~30s). Polling var 1500 ms är mer än tillräckligt.
  function bindLightweightPoller() {
    if (mutationObserver) return; // återanvänd flag-variabel
    mutationObserver = window.setInterval(() => {
      if (activeFilterId !== 'all') reapplyActiveFilter();
    }, 1500);
  }

  function tryInjection() {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(() => {
      attempts += 1;
      if (injectChipsRow() || attempts >= maxAttempts) {
        clearInterval(interval);
        if (filterRow) {
          // Apply persisted filter
          activeFilterId = readStorage();
          updateChipsState();
          reapplyActiveFilter();
          bindLightweightPoller();
        }
      }
    }, 250);
  }

  function mount() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInjection, { once: true });
    } else {
      tryInjection();
    }
  }

  // ---------- Public API ----------

  function setFilter(filterId) {
    setActiveFilter(filterId);
  }

  function getActiveFilter() {
    return activeFilterId;
  }

  function getDefinitions() {
    return FILTER_DEFINITIONS.slice();
  }

  // För Command Palette
  function getFilterCommands() {
    return FILTER_DEFINITIONS.map((def) => ({
      id: 'followup-filter-' + def.id,
      label: 'Filter: ' + def.label + (def.id === 'all' ? ' (rensa)' : ''),
      hint: 'Uppföljn.',
      group: 'Uppföljnings-filter',
      keywords: 'followup uppföljning filter ' + def.id + ' ' + def.label,
      action: () => setActiveFilter(def.id),
    }));
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewFollowupFilters = Object.freeze({
      mount,
      setFilter,
      getActiveFilter,
      getDefinitions,
      getFilterCommands,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
