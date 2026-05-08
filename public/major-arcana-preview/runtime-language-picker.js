/**
 * Major Arcana Preview — Language Picker (I6).
 *
 * En kompakt globe-knapp som öppnar en dropdown med 4 språk (sv/en/de/dk).
 * Hängs in i headern i toppraden. När man väljer ett språk anropas
 * MajorArcanaPreviewI18n.setLocale(...) som triggar re-translate via
 * mutation observer.
 *
 * Persisteras automatiskt via i18n-runtime (cco.locale i localStorage).
 */
(() => {
  'use strict';

  const LANGS = [
    { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'dk', label: 'Dansk', flag: '🇩🇰' },
  ];

  function injectStyles() {
    if (document.getElementById('cco-langpicker-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-langpicker-styles';
    style.textContent = `
.cco-langpicker {
  position: relative;
  display: inline-flex;
}
.cco-langpicker-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--cco-radius-md, 8px);
  background: transparent;
  border: 1px solid var(--cco-border-default, rgba(43,37,31,0.15));
  color: var(--cco-text-primary, #2b251f);
  font: var(--cco-weight-medium, 500) var(--cco-text-sm, 12px) var(--cco-font-sans, sans-serif);
  cursor: pointer;
  transition: all var(--cco-duration-fast, 150ms) var(--cco-ease-out, ease);
}
.cco-langpicker-btn:hover { background: var(--cco-bg-surface-sunken, #f5efe6); }
.cco-langpicker-btn:focus-visible { outline: 3px solid var(--cco-focus-ring, #4a8268); outline-offset: 2px; }
.cco-langpicker-flag { font-size: 14px; line-height: 1; }
.cco-langpicker-code { text-transform: uppercase; letter-spacing: 0.04em; }

.cco-langpicker-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--cco-bg-surface-raised, #ffffff);
  border: 1px solid var(--cco-border-default, rgba(43,37,31,0.15));
  border-radius: var(--cco-radius-md, 8px);
  box-shadow: var(--cco-shadow-lg, 0 10px 24px rgba(43,37,31,0.12));
  padding: 4px;
  z-index: var(--cco-z-overlay, 1000);
  min-width: 160px;
  display: none;
}
.cco-langpicker[data-open="true"] .cco-langpicker-menu { display: block; }
.cco-langpicker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: var(--cco-radius-sm, 4px);
  color: var(--cco-text-primary, #2b251f);
  font: var(--cco-weight-regular, 400) var(--cco-text-base, 14px) var(--cco-font-sans, sans-serif);
  text-align: left;
  cursor: pointer;
}
.cco-langpicker-item:hover { background: var(--cco-bg-surface-sunken, #f5efe6); }
.cco-langpicker-item.is-active {
  background: var(--cco-color-accent-soft, #6fa68a);
  color: var(--cco-text-on-accent, #ffffff);
}
.cco-langpicker-item:focus-visible { outline: 2px solid var(--cco-focus-ring, #4a8268); outline-offset: -1px; }
`.trim();
    document.head.appendChild(style);
  }

  function buildPicker() {
    const wrap = document.createElement('div');
    wrap.className = 'cco-langpicker';
    wrap.setAttribute('data-open', 'false');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cco-langpicker-btn';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Byt språk');
    btn.setAttribute('data-i18n-attr-aria-label', 'header.languagePicker');
    btn.innerHTML = `
      <span class="cco-langpicker-flag" aria-hidden="true"></span>
      <span class="cco-langpicker-code"></span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    wrap.appendChild(btn);

    const menu = document.createElement('div');
    menu.className = 'cco-langpicker-menu';
    menu.setAttribute('role', 'menu');
    for (const lang of LANGS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cco-langpicker-item';
      item.setAttribute('role', 'menuitem');
      item.dataset.lang = lang.code;
      item.innerHTML = `<span aria-hidden="true">${lang.flag}</span><span>${lang.label}</span>`;
      item.addEventListener('click', () => {
        try {
          window.MajorArcanaPreviewI18n?.setLocale(lang.code);
        } catch (_e) {}
        close();
      });
      menu.appendChild(item);
    }
    wrap.appendChild(menu);

    function open() {
      wrap.setAttribute('data-open', 'true');
      btn.setAttribute('aria-expanded', 'true');
      updateActiveState();
    }
    function close() {
      wrap.setAttribute('data-open', 'false');
      btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
      if (wrap.getAttribute('data-open') === 'true') close();
      else open();
    }
    function updateActiveState() {
      const current = window.MajorArcanaPreviewI18n?.getLocale?.() || 'sv';
      menu.querySelectorAll('.cco-langpicker-item').forEach((i) => {
        i.classList.toggle('is-active', i.dataset.lang === current);
      });
      const lang = LANGS.find((l) => l.code === current) || LANGS[0];
      btn.querySelector('.cco-langpicker-flag').textContent = lang.flag;
      btn.querySelector('.cco-langpicker-code').textContent = lang.code.toUpperCase();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.getAttribute('data-open') === 'true') close();
    });

    // Initial state + lyssna på locale-change
    updateActiveState();
    if (window.MajorArcanaPreviewI18n?.onLocaleChange) {
      window.MajorArcanaPreviewI18n.onLocaleChange(updateActiveState);
    }

    return wrap;
  }

  function findHeaderTarget() {
    return (
      document.querySelector('[data-cco-header-actions]') ||
      document.querySelector('.preview-shell-header__actions') ||
      document.querySelector('.preview-header__actions') ||
      document.querySelector('header.preview-shell-header') ||
      document.querySelector('.preview-shell__topbar') ||
      document.querySelector('header[role="banner"]')
    );
  }

  function mount() {
    if (document.getElementById('cco-langpicker-root')) return;
    injectStyles();
    const target = findHeaderTarget();
    if (!target) {
      // Fallback — fixed top-right om header inte hittas
      const fixed = document.createElement('div');
      fixed.id = 'cco-langpicker-root';
      fixed.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999';
      const picker = buildPicker();
      fixed.appendChild(picker);
      document.body.appendChild(fixed);
      return;
    }
    const root = document.createElement('div');
    root.id = 'cco-langpicker-root';
    root.appendChild(buildPicker());
    target.appendChild(root);
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewLanguagePicker = Object.freeze({ mount });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
