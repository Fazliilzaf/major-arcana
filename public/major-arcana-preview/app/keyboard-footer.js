/**
 * app/keyboard-footer.js — alltid-synlig keyboard shortcut hjälp under inbox-listan.
 * Inspiration: Linear-stil bottom-bar med shortcuts.
 *
 * UX:
 *   "j/k navigera · Enter öppna · e klar · s snooze · d radera · ? hjälp"
 *
 * Lägger en footer-bar längst ner i .preview-shell. Tar ~24px höjd men
 * lär nya användare alla shortcuts utan att de behöver öppna hjälp-overlay.
 */
(() => {
  'use strict';

  const FOOTER_ID = 'cco-keyboard-footer';

  function buildFooter() {
    const el = document.createElement('div');
    el.id = FOOTER_ID;
    el.className = 'cco-keyboard-footer';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <span class="kbd-hint"><kbd>j</kbd>/<kbd>k</kbd> navigera</span>
      <span class="kbd-sep">·</span>
      <span class="kbd-hint"><kbd>Enter</kbd> öppna</span>
      <span class="kbd-sep">·</span>
      <span class="kbd-hint"><kbd>e</kbd> klar</span>
      <span class="kbd-sep">·</span>
      <span class="kbd-hint"><kbd>s</kbd> snooze</span>
      <span class="kbd-sep">·</span>
      <span class="kbd-hint"><kbd>d</kbd> radera</span>
      <span class="kbd-sep">·</span>
      <span class="kbd-hint"><kbd>?</kbd> hjälp</span>
    `;
    return el;
  }

  function injectFooter() {
    if (document.getElementById(FOOTER_ID)) return true;
    const shell = document.querySelector('.preview-shell');
    if (!shell) return false;
    shell.appendChild(buildFooter());
    return true;
  }

  function init() {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      if (injectFooter() || attempts >= 20) return;
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
  window.__KeyboardFooter = Object.freeze({
    inject: injectFooter,
  });
})();
