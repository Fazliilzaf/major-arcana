/**
 * Major Arcana Preview — Theme runtime (D2).
 *
 * Hanterar light/dark/system-tema som sätter [data-theme] på <html>.
 *
 * Persisteras i localStorage 'cco.theme' = 'light' | 'dark' | 'system'.
 * Default 'system' — följer prefers-color-scheme.
 *
 * Public API på window.MajorArcanaPreviewTheme:
 *   - mount()
 *   - getTheme(): 'light' | 'dark' | 'system'
 *   - getEffectiveTheme(): 'light' | 'dark'  (resolverad)
 *   - setTheme(value)
 *   - toggleTheme()  (cyklar light → dark → system → light)
 *   - onThemeChange(handler)  (returnerar unsubscribe)
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cco.theme';
  const VALID = ['light', 'dark', 'system'];
  const listeners = new Set();

  function readPref() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (VALID.includes(raw)) return raw;
    } catch (_e) {}
    return 'system';
  }

  function writePref(value) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, value);
    } catch (_e) {}
  }

  function getEffectiveTheme() {
    const pref = readPref();
    if (pref === 'system') {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } catch (_e) {
        return 'light';
      }
    }
    return pref;
  }

  function applyTheme(value) {
    if (!VALID.includes(value)) return;
    document.documentElement.setAttribute('data-theme', value);
    writePref(value);
    notify();
  }

  function notify() {
    const effective = getEffectiveTheme();
    listeners.forEach((fn) => {
      try {
        fn({ theme: readPref(), effective });
      } catch (_e) {}
    });
  }

  function setTheme(value) {
    applyTheme(value);
  }

  function toggleTheme() {
    const current = readPref();
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    applyTheme(next);
    return next;
  }

  function onThemeChange(handler) {
    if (typeof handler !== 'function') return () => {};
    listeners.add(handler);
    return () => listeners.delete(handler);
  }

  function watchSystemPreference() {
    if (!window.matchMedia) return;
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (readPref() === 'system') notify();
      };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(handler);
      }
    } catch (_e) {}
  }

  function injectThemeToggleStyles() {
    if (document.getElementById('cco-theme-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-theme-styles';
    style.textContent = `
.cco-theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--cco-radius-md, 8px);
  background: var(--cco-bg-surface-sunken, #f5efe6);
  border: 1px solid var(--cco-border-default, rgba(43,37,31,0.15));
  color: var(--cco-text-primary, #2b251f);
  font: var(--cco-weight-medium, 500) var(--cco-text-sm, 12px) var(--cco-font-sans, sans-serif);
  cursor: pointer;
  transition: all var(--cco-duration-fast, 150ms) var(--cco-ease-out, ease);
}
.cco-theme-toggle:hover {
  background: var(--cco-bg-surface-raised, #ffffff);
  border-color: var(--cco-border-strong, rgba(43,37,31,0.3));
}
.cco-theme-toggle:focus-visible {
  outline: 3px solid var(--cco-focus-ring, #4a8268);
  outline-offset: 2px;
}
`.trim();
    document.head.appendChild(style);
  }

  function mount() {
    injectThemeToggleStyles();
    applyTheme(readPref());
    watchSystemPreference();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewTheme = Object.freeze({
      mount,
      getTheme: () => readPref(),
      getEffectiveTheme,
      setTheme,
      toggleTheme,
      onThemeChange,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
