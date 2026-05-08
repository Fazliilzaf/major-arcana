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
    // A2: Full ARIA + keyboard-nav audit
    const issues = [];

    // 1. Interaktiva element utan tillgängligt namn
    document.querySelectorAll('button, [role="button"]').forEach((btn) => {
      const ariaLabel = btn.getAttribute('aria-label');
      const ariaLabelledBy = btn.getAttribute('aria-labelledby');
      const title = btn.getAttribute('title');
      const txt = (btn.textContent || '').trim();
      if (!ariaLabel && !ariaLabelledBy && !title && !txt) {
        issues.push({ el: btn, severity: 'error', issue: 'button saknar tillgängligt namn (aria-label, aria-labelledby, title eller text)' });
      }
    });

    // 2. Form-inputs utan label
    document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach((inp) => {
      const id = inp.getAttribute('id');
      const ariaLabel = inp.getAttribute('aria-label');
      const ariaLabelledBy = inp.getAttribute('aria-labelledby');
      const placeholder = inp.getAttribute('placeholder');
      const hasLabelFor = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const wrapped = inp.closest('label');
      if (!ariaLabel && !ariaLabelledBy && !hasLabelFor && !wrapped && !placeholder) {
        issues.push({ el: inp, severity: 'error', issue: 'form-input saknar label / aria-label' });
      }
    });

    // 3. Bilder utan alt
    document.querySelectorAll('img:not([alt])').forEach((img) => {
      issues.push({ el: img, severity: 'warning', issue: 'img saknar alt-attribut (använd alt="" för dekorativa)' });
    });

    // 4. Klickbara <div>/<span> utan role/tabindex
    document.querySelectorAll('div[onclick], span[onclick]').forEach((el) => {
      if (!el.getAttribute('role') || !el.hasAttribute('tabindex')) {
        issues.push({ el, severity: 'error', issue: 'klickbart element utan role + tabindex (otillgängligt via tangentbord)' });
      }
    });

    // 5. Modaler utan rätt ARIA-attribut
    document.querySelectorAll('.cco-cmdk, .cco-svw-dialog, .cco-usearch, .cco-tsum-dialog, .cco-sbreak-dialog, .cco-shortcuts, .cco-tadmin, .cco-help, .cco-2fa, .cco-wizard').forEach((dlg) => {
      if (!dlg.getAttribute('role')) {
        issues.push({ el: dlg, severity: 'warning', issue: 'modal saknar role="dialog"' });
      }
      if (!dlg.getAttribute('aria-modal')) {
        issues.push({ el: dlg, severity: 'warning', issue: 'modal saknar aria-modal="true"' });
      }
      if (!dlg.getAttribute('aria-label') && !dlg.getAttribute('aria-labelledby')) {
        issues.push({ el: dlg, severity: 'warning', issue: 'modal saknar aria-label / aria-labelledby' });
      }
    });

    // 6. Headings hierarchy — får inte hoppa nivåer
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let prevLevel = 0;
    for (const h of headings) {
      const level = Number(h.tagName.charAt(1));
      if (prevLevel > 0 && level > prevLevel + 1) {
        issues.push({ el: h, severity: 'warning', issue: `heading hoppar från h${prevLevel} till h${level}` });
      }
      prevLevel = level;
    }

    // 7. Buttons som borde vara länkar (target="_blank" eller href-liknande data)
    document.querySelectorAll('button[data-href], button[data-url]').forEach((btn) => {
      issues.push({ el: btn, severity: 'info', issue: 'button med data-href/data-url — överväg <a> istället' });
    });

    return issues;
  }

  function autoLabelInteractive() {
    // A2: Säkerställ att vanliga ikoner har aria-label
    const labels = {
      '[data-action="close"]': 'Stäng',
      '[data-action="back"]': 'Tillbaka',
      '[data-action="next"]': 'Nästa',
      '[data-action="prev"]': 'Föregående',
      '[data-action="reload"]': 'Ladda om',
      '[data-action="settings"]': 'Inställningar',
      '[data-action="search"]': 'Sök',
      '[data-action="menu"]': 'Meny',
      '[data-action="help"]': 'Hjälp',
      '[data-cco-locale-toggle]': 'Byt språk',
      '[data-cco-density-toggle]': 'Växla täthet',
      '[data-cco-reduced-motion]': 'Växla reducerad rörelse',
      '[data-cco-high-contrast]': 'Växla hög kontrast',
    };
    let added = 0;
    for (const [selector, label] of Object.entries(labels)) {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
          const txt = (el.textContent || '').trim();
          if (!txt) {
            el.setAttribute('aria-label', label);
            added += 1;
          }
        }
      });
    }
    return added;
  }

  function ensureModalAria() {
    // A2: Säkerställ role/aria-modal på alla kända modaler
    const dialogs = [
      '.cco-cmdk',
      '.cco-svw-dialog',
      '.cco-usearch',
      '.cco-tsum-dialog',
      '.cco-sbreak-dialog',
      '.cco-shortcuts',
      '.cco-tadmin',
      '.cco-help',
      '.cco-2fa',
      '.cco-wizard',
    ];
    let fixed = 0;
    document.querySelectorAll(dialogs.join(', ')).forEach((dlg) => {
      if (!dlg.getAttribute('role')) {
        dlg.setAttribute('role', 'dialog');
        fixed += 1;
      }
      if (!dlg.getAttribute('aria-modal')) {
        dlg.setAttribute('aria-modal', 'true');
        fixed += 1;
      }
    });
    return fixed;
  }

  function setupKeyboardEscapeForModals() {
    // A2: Säkerställ att Escape stänger modaler även om enskilda moduler missat det
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const openDialog = document.querySelector(
        '.cco-cmdk[aria-hidden="false"], .cco-usearch[aria-hidden="false"], .cco-svw-dialog[aria-hidden="false"], .cco-tsum-dialog[aria-hidden="false"], .cco-sbreak-dialog[aria-hidden="false"], .cco-shortcuts[aria-hidden="false"], .cco-tadmin[aria-hidden="false"], .cco-help[aria-hidden="false"], .cco-2fa[aria-hidden="false"], .cco-wizard[aria-hidden="false"]'
      );
      if (!openDialog) return;
      const closeBtn = openDialog.querySelector('[data-action="close"], .cco-close, [aria-label="Stäng"], [aria-label="Close"]');
      if (closeBtn) {
        closeBtn.click();
      } else {
        openDialog.setAttribute('aria-hidden', 'true');
      }
    }, true);
  }

  function mount() {
    injectStyles();
    // Apply persisted prefs
    applyPref(STORAGE_MOTION, 'data-cco-reduced-motion', readPref(STORAGE_MOTION));
    applyPref(STORAGE_CONTRAST, 'data-cco-high-contrast', readPref(STORAGE_CONTRAST));
    // Setup global Escape-handler för modaler
    setupKeyboardEscapeForModals();
    const runOnReady = () => {
      injectSkipLink();
      ensureMainLandmark();
      autoLabelInteractive();
      ensureModalAria();
      // Re-run auto-labeling när nya moduler renderar in
      const observer = new MutationObserver(() => {
        autoLabelInteractive();
        ensureModalAria();
      });
      try {
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (_e) {}
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      runOnReady();
    } else {
      document.addEventListener('DOMContentLoaded', runOnReady, { once: true });
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
      autoLabelInteractive,
      ensureModalAria,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
