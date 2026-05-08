/**
 * Major Arcana Preview — Density Toggle
 *
 * Global UI-densitet: regular (default) eller compact (kompakt visning,
 * mindre padding, mindre font-storlekar). Persisteras i localStorage.
 *
 * Triggers:
 *   - Cmd+K → "Växla densitet (regular/compact)"
 *   - Knapp i topbar (auto-injekterad)
 *
 * Läge styrs via attribut data-cco-density="regular|compact" på <html>.
 * CSS-regler kan rikta sig mot html[data-cco-density="compact"] för att
 * ändra padding/font/spacing.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cco.density.v1';
  const DENSITIES = Object.freeze(['regular', 'compact']);
  let toggleButton = null;

  function readStorage() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      const value = String(raw || '').trim();
      return DENSITIES.includes(value) ? value : 'regular';
    } catch (_e) {
      return 'regular';
    }
  }

  function writeStorage(density) {
    try {
      if (density === 'regular') {
        window.localStorage?.removeItem(STORAGE_KEY);
      } else {
        window.localStorage?.setItem(STORAGE_KEY, density);
      }
    } catch (_e) { /* tyst */ }
  }

  function applyDensity(density) {
    const root = document.documentElement;
    if (!root) return;
    if (density === 'compact') {
      root.setAttribute('data-cco-density', 'compact');
    } else {
      root.setAttribute('data-cco-density', 'regular');
    }
    updateButton();
  }

  function getActiveDensity() {
    return document.documentElement?.getAttribute('data-cco-density') === 'compact'
      ? 'compact'
      : 'regular';
  }

  function setDensity(density) {
    if (!DENSITIES.includes(density)) return;
    applyDensity(density);
    writeStorage(density);
  }

  function toggleDensity() {
    const next = getActiveDensity() === 'compact' ? 'regular' : 'compact';
    setDensity(next);
  }

  // ---------- Styles ----------
  function injectStyles() {
    if (document.getElementById('cco-density-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-density-styles';
    style.textContent = `
.cco-density-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; margin-left: 6px;
  background: rgba(80, 60, 40, 0.06);
  color: #5d4a3c;
  border: 0; border-radius: 999px;
  font-family: inherit; font-size: 11px; font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.12s ease;
}
.cco-density-toggle:hover { background: rgba(80, 60, 40, 0.12); }
.cco-density-toggle svg { width: 12px; height: 12px; }

/* Compact-densitet: minska whitespace globalt */
html[data-cco-density="compact"] {
  --cco-density-padding-mult: 0.7;
  --cco-density-font-mult: 0.96;
  --cco-density-gap-mult: 0.7;
}
html[data-cco-density="compact"] body {
  font-size: calc(14px * var(--cco-density-font-mult, 0.96));
}
html[data-cco-density="compact"] .thread-card,
html[data-cco-density="compact"] .unified-queue-card {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}
html[data-cco-density="compact"] .queue-filter-chip {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  font-size: 11px;
}
html[data-cco-density="compact"] .focus-message,
html[data-cco-density="compact"] [data-message-id] {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}
html[data-cco-density="compact"] .cco-followup-row {
  padding: 5px 10px;
}
html[data-cco-density="compact"] .preview-nav-item {
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}
html[data-cco-density="compact"] .focus-head {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}
`.trim();
    document.head.appendChild(style);
  }

  // ---------- Topbar-knapp ----------
  function buildToggleButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cco-density-toggle';
    btn.setAttribute('data-cco-density-toggle', '');
    btn.setAttribute('aria-label', 'Växla densitet');
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 4h12M2 8h12M2 12h12"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <span data-cco-density-label>Regular</span>
    `;
    btn.addEventListener('click', toggleDensity);
    return btn;
  }

  function updateButton() {
    if (!toggleButton) return;
    const label = toggleButton.querySelector('[data-cco-density-label]');
    if (label) label.textContent = getActiveDensity() === 'compact' ? 'Kompakt' : 'Regular';
  }

  function findTopbarAnchor() {
    return (
      document.querySelector('.preview-utility-cluster') ||
      document.querySelector('.preview-topbar-right') ||
      document.querySelector('.preview-topbar')
    );
  }

  function injectToggleButton() {
    if (toggleButton) return true;
    const anchor = findTopbarAnchor();
    if (!anchor) return false;
    injectStyles();
    toggleButton = buildToggleButton();
    if (anchor.classList.contains('preview-utility-cluster')) {
      anchor.insertBefore(toggleButton, anchor.firstChild);
    } else {
      anchor.appendChild(toggleButton);
    }
    updateButton();
    return true;
  }

  function tryInjection() {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(() => {
      attempts += 1;
      if (injectToggleButton() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 250);
  }

  function mount() {
    injectStyles();
    applyDensity(readStorage());
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInjection, { once: true });
    } else {
      tryInjection();
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewDensityToggle = Object.freeze({
      mount,
      setDensity,
      toggleDensity,
      getActiveDensity,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
