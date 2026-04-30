/**
 * Major Arcana Preview — A11y (A1+A2 från i18n & A11y).
 *
 * Tre delar:
 *   1. Reduced-motion: respektera prefers-reduced-motion + manuell toggle
 *   2. High-contrast tema: aktiveras vid prefers-contrast: more eller manuellt
 *   3. Focus-states styling: tydliga keyboard-focus-rings på alla cco-* element
 *
 * Persisteras i localStorage:
 *   • cco.a11y.reducedMotion = 'on' | 'off' | 'system'
 *   • cco.a11y.highContrast = 'on' | 'off' | 'system'
 *
 * Auto-respekt för media-queries om "system".
 */
(() => {
  'use strict';

  const STORAGE_MOTION = 'cco.a11y.reducedMotion';
  const STORAGE_CONTRAST = 'cco.a11y.highContrast';

  function readPref(key, fallback = 'system') {
    try {
      const raw = window.localStorage?.getItem(key);
      if (raw === 'on' || raw === 'off' || raw === 'system') return raw;
    } catch (_e) {}
    return fallback;
  }

  function writePref(key, value) {
    try { window.localStorage?.setItem(key, value); } catch (_e) {}
  }

  function injectStyles() {
    if (document.getElementById('cco-a11y-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-a11y-styles';
    style.textContent = `
/* === A1: Reduced motion === */
html[data-cco-reduced-motion="on"] *,
html[data-cco-reduced-motion="on"] *::before,
html[data-cco-reduced-motion="on"] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
@media (prefers-reduced-motion: reduce) {
  html[data-cco-reduced-motion="system"] *,
  html[data-cco-reduced-motion="system"] *::before,
  html[data-cco-reduced-motion="system"] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* === A2: High contrast tema === */
html[data-cco-high-contrast="on"] {
  --cco-color-bg: #ffffff;
  --cco-color-text: #000000;
  --cco-color-primary: #000000;
  --cco-color-accent: #c00000;
  --cco-color-border: #000000;
}
html[data-cco-high-contrast="on"] body {
  background: #ffffff !important;
  color: #000000 !important;
}
html[data-cco-high-contrast="on"] .cco-cmdk,
html[data-cco-high-contrast="on"] .cco-svw-dialog,
html[data-cco-high-contrast="on"] .cco-usearch,
html[data-cco-high-contrast="on"] .cco-tsum-dialog,
html[data-cco-high-contrast="on"] .cco-sbreak-dialog,
html[data-cco-high-contrast="on"] .cco-shortcuts,
html[data-cco-high-contrast="on"] .cco-tadmin,
html[data-cco-high-contrast="on"] .cco-help,
html[data-cco-high-contrast="on"] .cco-2fa,
html[data-cco-high-contrast="on"] .cco-wizard {
  background: #ffffff !important;
  color: #000000 !important;
  border: 2px solid #000000 !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}
html[data-cco-high-contrast="on"] button,
html[data-cco-high-contrast="on"] input,
html[data-cco-high-contrast="on"] select,
html[data-cco-high-contrast="on"] textarea {
  border: 2px solid #000000 !important;
  background: #ffffff !important;
  color: #000000 !important;
}
html[data-cco-high-contrast="on"] .cco-cmdk-item.is-active,
html[data-cco-high-contrast="on"] .cco-usearch-item.is-active {
  background: #000000 !important;
  color: #ffff00 !important;
}
@media (prefers-contrast: more) {
  html[data-cco-high-contrast="system"] {
    --cco-color-text: #000000;
  }
  html[data-cco-high-contrast="system"] body {
    background: #ffffff;
  }
}

/* === A3: Tydliga focus-rings === */
html *:focus-visible {
  outline: 3px solid #4a8268;
  outline-offset: 2px;
  border-radius: 4px;
}
html[data-cco-high-contrast="on"] *:focus-visible {
  outline: 4px solid #c00000;
  outline-offset: 2px;
}
html .cco-cmdk-item:focus-visible,
html .cco-usearch-item:focus-visible,
html .cco-svw-item:focus-visible {
  outline-offset: -2px;
}

/* Skip-to-content-länk för screen readers */
.cco-skip-link {
  position: absolute; top: -100px; left: 8px;
  background: #2b251f; color: #fbf7f1;
  padding: 10px 16px; border-radius: 6px;
  font-family: inherit; font-size: 13px; font-weight: 600;
  text-decoration: none; z-index: 100001;
}
.cco-skip-link:focus {
  top: 8px;
  outline: 3px solid #4a8268;
  outline-offset: 2px;
}
`.trim();
    document.head.appendChild(style);
  }

  function applyPref(prefKey, attribute, value) {
    document.documentElement.setAttribute(attribute, value);
    writePref(prefKey, value);
  }

  function toggleReducedMotion() {
    const current = readPref(STORAGE_MOTION);
    const next = current === 'on' ? 'system' : current === 'system' ? 'off' : 'on';
    applyPref(STORAGE_MOTION, 'data-cco-reduced-motion', next);
    return next;
  }

  function toggleHighContrast() {
    const current = readPref(STORAGE_CONTRAST);
    const next = current === 'on' ? 'system' : current === 'system' ? 'off' : 'on';
    applyPref(STORAGE_CONTRAST, 'data-cco-high-contrast', next);
    return next;
  }

  function setReducedMotion(value) {
    if (!['on', 'off', 'system'].includes(value)) return;
    applyPref(STORAGE_MOTION, 'data-cco-reduced-motion', value);
  }

  function setHighContrast(value) {
    if (!['on', 'off', 'system'].includes(value)) return;
    applyPref(STORAGE_CONTRAST, 'data-cco-high-contrast', value);
  }

  function injectSkipLink() {
    if (document.querySelector('.cco-skip-link')) return;
    const link = document.createElement('a');
    link.className = 'cco-skip-link';
    link.href = '#main-content';
    link.textContent = 'Hoppa till huvudinnehåll';
    if (document.body) {
      document.body.insertBefore(link, document.body.firstChild);
    }
  }

  function ensureMainLandmark() {
    // Säkerställ att en <main id="main-content"> existerar för skip-länken
    if (document.getElementById('main-content')) return;
    const candidates = [
      document.querySelector('main'),
      document.querySelector('.preview-app'),
      document.querySelector('.workspace-shell'),
      document.querySelector('section.focus-shell'),
    ].filter(Boolean);
    if (candidates[0]) {
      candidates[0].setAttribute('id', 'main-content');
      candidates[0].setAttribute('role', 'main');
    }
  }

  function auditAria() {
    // Basic ARIA-audit på interaktiva element som saknar labels
    const issues = [];
    document.querySelectorAll('button:not([aria-label])').forEach((btn) => {
      const txt = (btn.textContent || '').trim();
      if (!txt) {
        issues.push({ el: btn, issue: 'button utan aria-label eller text' });
      }
    });
    return issues;
  }

  function mount() {
    injectStyles();
    // Apply persisted prefs
    applyPref(STORAGE_MOTION, 'data-cco-reduced-motion', readPref(STORAGE_MOTION));
    applyPref(STORAGE_CONTRAST, 'data-cco-high-contrast', readPref(STORAGE_CONTRAST));
    // Inject skip-link + main-landmark
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      injectSkipLink();
      ensureMainLandmark();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        injectSkipLink();
        ensureMainLandmark();
      }, { once: true });
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewA11y = Object.freeze({
      mount,
      toggleReducedMotion,
      toggleHighContrast,
      setReducedMotion,
      setHighContrast,
      getReducedMotion: () => readPref(STORAGE_MOTION),
      getHighContrast: () => readPref(STORAGE_CONTRAST),
      auditAria,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
