/**
 * app/inbox-filter-toggle.js — collapse/expand inbox-filters (Stadium 1).
 *
 * Default: filters dolda → ~200px mer listyta för thread-cards.
 * Klick på Filter-pill: toggle:ar .has-inbox-filters-collapsed på <body>.
 *
 * Pillen injekteras i .preview-shell .queue-topzone (eller toppen av
 * .preview-shell om topzone saknas).
 *
 * Persistens: localStorage 'cco.inboxFiltersCollapsed.v1' = '1' | '0'.
 */
(() => {
  'use strict';

  const LS_KEY = 'cco.inboxFiltersCollapsed.v1';
  const BODY_CLASS = 'has-inbox-filters-collapsed';
  const PILL_ID = 'inbox-filter-toggle-pill';

  function readState() {
    try {
      // Default = collapsed (true) om inget sparat
      const v = localStorage.getItem(LS_KEY);
      return v === null ? true : v === '1';
    } catch (_e) {
      return true;
    }
  }

  function writeState(collapsed) {
    try {
      localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
    } catch (_e) {}
  }

  function applyState(collapsed) {
    document.body.classList.toggle(BODY_CLASS, collapsed);
    const pill = document.getElementById(PILL_ID);
    if (pill) {
      pill.dataset.collapsed = collapsed ? '1' : '0';
      const label = pill.querySelector('.filter-pill-label');
      if (label) label.textContent = collapsed ? 'Visa filter' : 'Dölj filter';
    }
  }

  function toggleState() {
    const next = !document.body.classList.contains(BODY_CLASS);
    applyState(next);
    writeState(next);
  }

  function buildPill() {
    const btn = document.createElement('button');
    btn.id = PILL_ID;
    btn.type = 'button';
    btn.className = 'inbox-filter-toggle-pill';
    btn.setAttribute('aria-label', 'Toggla inbox-filter');
    btn.innerHTML = `
      <svg class="filter-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6"/>
        <line x1="7" y1="12" x2="17" y2="12"/>
        <line x1="10" y1="18" x2="14" y2="18"/>
      </svg>
      <span class="filter-pill-label">Visa filter</span>
    `;
    btn.addEventListener('click', toggleState);
    return btn;
  }

  function injectPill() {
    if (document.getElementById(PILL_ID)) return true;
    const topzone = document.querySelector('.preview-shell .queue-topzone');
    const shell = document.querySelector('.preview-shell');
    const target = topzone || shell;
    if (!target) return false;
    const pill = buildPill();
    if (topzone) {
      topzone.insertBefore(pill, topzone.firstChild);
    } else {
      shell.insertBefore(pill, shell.firstChild);
    }
    applyState(readState());
    return true;
  }

  function init() {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      if (injectPill() || attempts >= 20) return;
      setTimeout(tick, 400);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Exponera för debug
  window.__InboxFilterToggle = Object.freeze({
    toggle: toggleState,
    collapse: () => { applyState(true); writeState(true); },
    expand: () => { applyState(false); writeState(false); },
    isCollapsed: () => document.body.classList.contains(BODY_CLASS),
  });
})();
