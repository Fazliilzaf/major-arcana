/**
 * app/keyboard-nav.js — Power-user tangentbordsgenvägar för CCO inbox.
 *
 * Stöder Gmail/Linear/Superhuman-stil j/k-navigation:
 *   j        nästa tråd
 *   k        föregående tråd
 *   Enter    öppna fokuserad tråd
 *   e        markera klar / arkivera (handled-action)
 *   r        svara (öppna studio i reply-mode)
 *   s        snooze (markera senare)
 *   d        radera
 *   /        fokusera sökfält i topbaren
 *   g i      gå till Inkorg
 *   g k      gå till Kunder
 *   g a      gå till Automation
 *   ?        visa shortcuts-hjälp
 *
 * Genvägar är inaktiva när användaren skriver i input/textarea/contenteditable.
 *
 * State: lokal currentFocusIndex (vilken thread-card i listan som är "highlighted").
 * Visuell feedback via CSS-klass .is-keyboard-focused på det aktiva kortet.
 */
(() => {
  'use strict';

  // ============================================================
  // Konstanter
  // ============================================================

  const SHORTCUTS = [
    { keys: 'j', label: 'Nästa tråd' },
    { keys: 'k', label: 'Föregående tråd' },
    { keys: 'Enter', label: 'Öppna fokuserad tråd' },
    { keys: 'e', label: 'Markera klar / arkivera' },
    { keys: 'r', label: 'Svara (öppna studio)' },
    { keys: 's', label: 'Snooze till senare' },
    { keys: 'd', label: 'Radera' },
    { keys: '/', label: 'Fokusera sökfält' },
    { keys: 'g i', label: 'Gå till Inkorg' },
    { keys: 'g k', label: 'Gå till Kunder' },
    { keys: 'g a', label: 'Gå till Automation' },
    { keys: '?', label: 'Visa denna hjälp' },
    { keys: 'Cmd+K', label: 'Snabbsök (Spotlight)' },
    { keys: 'Esc', label: 'Stäng overlay' },
  ];

  const FOCUSED_CLASS = 'is-keyboard-focused';

  // ============================================================
  // State
  // ============================================================

  let currentFocusIndex = -1;
  let currentFocusId = null;  // thread-id — överlever re-render
  let lastGKeyAt = 0; // för "g i", "g k"-sekvens
  let helpOverlayEl = null;
  let helpVisible = false;

  // ============================================================
  // Helpers
  // ============================================================

  function isTypingContext(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function getThreadCards() {
    return Array.from(document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]'));
  }

  function clearFocus() {
    document.querySelectorAll('.' + FOCUSED_CLASS).forEach((el) => el.classList.remove(FOCUSED_CLASS));
  }

  function setFocus(index) {
    const cards = getThreadCards();
    if (cards.length === 0) {
      currentFocusIndex = -1;
      currentFocusId = null;
      clearFocus();
      return;
    }
    const clamped = Math.max(0, Math.min(index, cards.length - 1));
    currentFocusIndex = clamped;
    const card = cards[clamped];
    currentFocusId = card.dataset.runtimeThread || null;
    clearFocus();
    card.classList.add(FOCUSED_CLASS);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Re-applicera focus-klassen efter att renderApp re-renderat listan.
  // MutationObserver lyssnar på .queue-history-list, så vi inte tappar
  // visuell focus-state vid varje state-mutation.
  function reapplyFocusAfterRender() {
    if (!currentFocusId) return;
    const cards = getThreadCards();
    if (cards.length === 0) return;
    // Synka index om listan ändrats
    const idx = cards.findIndex((c) => c.dataset.runtimeThread === currentFocusId);
    if (idx >= 0) {
      currentFocusIndex = idx;
      clearFocus();
      cards[idx].classList.add(FOCUSED_CLASS);
    }
  }
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      // Defer en frame så DOM hinner stabilisera
      requestAnimationFrame(reapplyFocusAfterRender);
    });
    function startObserving() {
      const list = document.querySelector('.queue-history-list');
      if (list) {
        observer.observe(list, { childList: true });
      } else {
        setTimeout(startObserving, 500);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving);
    } else {
      startObserving();
    }
  }

  function getFocusedCard() {
    const cards = getThreadCards();
    if (currentFocusIndex < 0 || currentFocusIndex >= cards.length) return null;
    return cards[currentFocusIndex];
  }

  function clickQuickAction(actionKey) {
    const card = getFocusedCard();
    if (!card) return;
    const btn = card.querySelector(`[data-quick-action="${actionKey}"]`);
    if (btn) btn.click();
  }

  // ============================================================
  // Hjälp-overlay
  // ============================================================

  function ensureHelpOverlay() {
    if (helpOverlayEl) return;
    helpOverlayEl = document.createElement('div');
    helpOverlayEl.id = 'keyboard-help-overlay';
    helpOverlayEl.setAttribute('aria-hidden', 'true');
    helpOverlayEl.setAttribute('role', 'dialog');
    helpOverlayEl.setAttribute('aria-label', 'Tangentbordsgenvägar');

    const items = SHORTCUTS.map((s) => `
      <div class="kbd-help-row">
        <span class="kbd-help-label">${s.label}</span>
        <span class="kbd-help-keys">${s.keys.split(' ').map(k => `<kbd>${k}</kbd>`).join(' ')}</span>
      </div>
    `).join('');

    helpOverlayEl.innerHTML = `
      <div class="kbd-help-backdrop" data-kbd-help-close></div>
      <div class="kbd-help-panel">
        <header class="kbd-help-header">
          <h2>Tangentbordsgenvägar</h2>
          <button type="button" class="kbd-help-close" aria-label="Stäng" data-kbd-help-close>×</button>
        </header>
        <div class="kbd-help-list">
          ${items}
        </div>
        <footer class="kbd-help-footer">
          Tryck <kbd>?</kbd> igen eller <kbd>Esc</kbd> för att stänga
        </footer>
      </div>
    `;
    document.body.appendChild(helpOverlayEl);
    helpOverlayEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-kbd-help-close]')) hideHelp();
    });
  }

  function showHelp() {
    ensureHelpOverlay();
    helpVisible = true;
    helpOverlayEl.setAttribute('data-open', '');
    helpOverlayEl.setAttribute('aria-hidden', 'false');
  }

  function hideHelp() {
    if (!helpOverlayEl) return;
    helpVisible = false;
    helpOverlayEl.removeAttribute('data-open');
    helpOverlayEl.setAttribute('aria-hidden', 'true');
  }

  function toggleHelp() {
    if (helpVisible) hideHelp(); else showHelp();
  }

  // ============================================================
  // Keyboard handler
  // ============================================================

  document.addEventListener('keydown', (e) => {
    // Skippa om man skriver i ett input
    if (isTypingContext(e.target)) return;

    // Skippa om en modal/overlay är öppen som hanterar egna keys
    // (Cmd+K-overlay har sin egen handler — vi vill inte interferera)
    const cmdKOpen = document.getElementById('cmd-k-overlay')?.hasAttribute('data-open');
    if (cmdKOpen) return;

    // Modifierade keys (Cmd/Ctrl/Meta) — låt deras egna handlers fånga
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // Hjälp-overlay öppen → bara Esc/? hanteras
    if (helpVisible) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        hideHelp();
      }
      return;
    }

    // "g <letter>" sekvens (inom 1 sek)
    const now = Date.now();
    if (now - lastGKeyAt < 1000) {
      lastGKeyAt = 0;
      const navKey = e.key.toLowerCase();
      const viewMap = { i: 'conversations', k: 'customers', a: 'automation', m: 'macros', s: 'settings' };
      const viewKey = viewMap[navKey];
      if (viewKey) {
        e.preventDefault();
        const navBtn = document.querySelector(`[data-nav-view="${viewKey}"]`);
        if (navBtn) navBtn.click();
        return;
      }
    }

    switch (e.key) {
      case 'j':
        e.preventDefault();
        setFocus(currentFocusIndex < 0 ? 0 : currentFocusIndex + 1);
        break;
      case 'k':
        e.preventDefault();
        setFocus(currentFocusIndex < 0 ? 0 : currentFocusIndex - 1);
        break;
      case 'Enter': {
        const card = getFocusedCard();
        if (card) {
          e.preventDefault();
          card.click();
        }
        break;
      }
      case 'e':
        e.preventDefault();
        clickQuickAction('handled');
        break;
      case 'r':
        e.preventDefault();
        clickQuickAction('studio');
        break;
      case 's':
        e.preventDefault();
        clickQuickAction('later');
        break;
      case 'd':
        e.preventDefault();
        clickQuickAction('delete');
        break;
      case '/': {
        e.preventDefault();
        const search = document.querySelector('input[placeholder*="ök" i]');
        if (search) {
          search.focus();
          search.select();
        }
        break;
      }
      case 'g':
        // Starta "g <letter>"-sekvens
        e.preventDefault();
        lastGKeyAt = now;
        break;
      case '?':
        e.preventDefault();
        toggleHelp();
        break;
      case 'Escape':
        clearFocus();
        currentFocusIndex = -1;
        break;
    }
  });

  // Exponera för debug + Cmd+K-integration
  window.__KeyboardNav = Object.freeze({
    showHelp,
    hideHelp,
    setFocus,
    getFocusedCard,
    SHORTCUTS,
  });
})();
