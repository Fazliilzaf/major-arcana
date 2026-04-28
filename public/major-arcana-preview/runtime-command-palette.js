/**
 * Major Arcana Preview — Command Palette (⌘K / Ctrl+K)
 *
 * Fristående modul som tillför en global command palette för snabbnavigering.
 * Öppnas med Cmd+K (Mac) eller Ctrl+K (Windows/Linux).
 *
 * Stänger med Esc eller klick utanför.
 * ↑/↓ för navigation, Enter för att exekvera.
 *
 * Paletten dispatcher till befintliga UI-element (lane-chips, nav-buttons,
 * studio-trigger osv.) via querySelector + .click() — inga nya backend-anrop.
 */
(() => {
  'use strict';

  let backdropEl = null;
  let dialogEl = null;
  let inputEl = null;
  let resultsEl = null;
  let emptyEl = null;
  let isOpen = false;
  let activeIndex = 0;
  let visibleCommands = [];
  let allCommands = [];
  let lastQuery = '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function clickFirstMatching(selector) {
    const el = document.querySelector(selector);
    if (el && typeof el.click === 'function') {
      el.click();
      return true;
    }
    return false;
  }

  function clickByAriaLabel(label) {
    const buttons = document.querySelectorAll('button[aria-label]');
    for (const btn of buttons) {
      if (btn.getAttribute('aria-label') === label) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function buildCommands() {
    const base = [
      // Navigering (top-level)
      {
        id: 'nav-conversations',
        label: 'Gå till Konversationer',
        hint: 'Vy',
        group: 'Navigering',
        keywords: 'conversations konversationer kö queue inbox',
        action: () => clickFirstMatching('[data-nav-view="conversations"]'),
      },
      {
        id: 'nav-customers',
        label: 'Gå till Kunder',
        hint: 'Vy',
        group: 'Navigering',
        keywords: 'customers kunder kund identity',
        action: () => clickFirstMatching('[data-nav-view="customers"]'),
      },
      {
        id: 'nav-automation',
        label: 'Gå till Automatisering',
        hint: 'Vy',
        group: 'Navigering',
        keywords: 'automation automatisering workflow rules',
        action: () => clickFirstMatching('[data-nav-view="automation"]'),
      },
      {
        id: 'nav-analytics',
        label: 'Gå till Analys',
        hint: 'Vy',
        group: 'Navigering',
        keywords: 'analytics analys statistik kpi metrics',
        action: () => clickFirstMatching('[data-nav-view="analytics"]'),
      },
      {
        id: 'nav-more',
        label: 'Gå till Mer',
        hint: 'Vy',
        group: 'Navigering',
        keywords: 'more mer settings inställningar',
        action: () => clickFirstMatching('[data-nav-view="more"]'),
      },

      // Lanes
      {
        id: 'lane-all',
        label: 'Lane: Alla trådar',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'all alla',
        action: () => clickFirstMatching('[data-queue-lane="all"]'),
      },
      {
        id: 'lane-act-now',
        label: 'Lane: Agera nu',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'act now agera nu urgent brådskande',
        action: () => clickFirstMatching('[data-queue-lane="act-now"]'),
      },
      {
        id: 'lane-sprint',
        label: 'Lane: Sprint',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'sprint',
        action: () => clickFirstMatching('[data-queue-lane="sprint"]'),
      },
      {
        id: 'lane-later',
        label: 'Lane: Senare',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'later senare snooze',
        action: () => clickFirstMatching('[data-queue-lane="later"]'),
      },
      {
        id: 'lane-admin',
        label: 'Lane: Admin',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'admin',
        action: () => clickFirstMatching('[data-queue-lane="admin"]'),
      },
      {
        id: 'lane-review',
        label: 'Lane: Granska',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'review granska',
        action: () => clickFirstMatching('[data-queue-lane="review"]'),
      },
      {
        id: 'lane-unclear',
        label: 'Lane: Oklart',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'unclear oklart',
        action: () => clickFirstMatching('[data-queue-lane="unclear"]'),
      },
      {
        id: 'lane-bookable',
        label: 'Lane: Bokning',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'bookable bokning booking',
        action: () => clickFirstMatching('[data-queue-lane="bookable"]'),
      },
      {
        id: 'lane-medical',
        label: 'Lane: Medicinsk',
        hint: 'Lane',
        group: 'Lanes',
        keywords: 'medical medicinsk medicin',
        action: () => clickFirstMatching('[data-queue-lane="medical"]'),
      },

      // Snabbåtgärder
      {
        id: 'action-new-mail',
        label: 'Skriv nytt mejl',
        hint: 'Action',
        group: 'Snabbåtgärder',
        keywords: 'new mail nytt mejl compose skriv',
        action: () => clickFirstMatching('[data-studio-open][data-studio-mode="compose"]'),
      },

      // Inställningar / verktyg
      {
        id: 'tool-light',
        label: 'Växla ljusläge',
        hint: 'Verktyg',
        group: 'Inställningar',
        keywords: 'light theme ljus tema dark mörk',
        action: () => clickByAriaLabel('Ljusläge'),
      },
      {
        id: 'tool-history',
        label: 'Öppna Historik',
        hint: 'Verktyg',
        group: 'Inställningar',
        keywords: 'history historik tidslinje',
        action: () => clickByAriaLabel('Historik'),
      },
      {
        id: 'tool-screen',
        label: 'Skärm-/layoutval',
        hint: 'Verktyg',
        group: 'Inställningar',
        keywords: 'screen skärm layout densitet density',
        action: () => clickByAriaLabel('Skärm'),
      },
      {
        id: 'tool-language',
        label: 'Språkval',
        hint: 'Verktyg',
        group: 'Inställningar',
        keywords: 'language språk locale',
        action: () => clickByAriaLabel('Global'),
      },

      // AI
      {
        id: 'ai-thread-summary',
        label: 'Sammanfatta aktuell tråd (AI)',
        hint: 'AI',
        group: 'AI',
        keywords: 'summary sammanfattning sammanfatta tråd thread ai sedan senast',
        action: () => {
          const ts = (typeof window !== 'undefined') && window.MajorArcanaPreviewThreadSummary;
          if (ts && typeof ts.summarizeCurrent === 'function') ts.summarizeCurrent();
        },
      },

      // Sökning
      {
        id: 'unified-search-open',
        label: 'Sök överallt (trådar, kunder, makron)',
        hint: '⌘/',
        group: 'Sökning',
        keywords: 'search sök find unified everywhere',
        action: () => {
          const us = (typeof window !== 'undefined') && window.MajorArcanaPreviewUnifiedSearch;
          if (us && typeof us.open === 'function') us.open();
        },
      },

      // Sparade vyer (statiska kommandon)
      {
        id: 'saved-views-save',
        label: 'Spara aktuell vy…',
        hint: '⌘⇧S',
        group: 'Sparade vyer',
        keywords: 'save saved view spara vy aktuell',
        action: () => {
          const sv = (typeof window !== 'undefined') && window.MajorArcanaPreviewSavedViews;
          if (sv && typeof sv.saveCurrent === 'function') sv.saveCurrent();
        },
      },
      {
        id: 'saved-views-open',
        label: 'Öppna sparade vyer',
        hint: '⌘⇧V',
        group: 'Sparade vyer',
        keywords: 'saved views sparade vyer lista öppna manage',
        action: () => {
          const sv = (typeof window !== 'undefined') && window.MajorArcanaPreviewSavedViews;
          if (sv && typeof sv.openModal === 'function') sv.openModal();
        },
      },

      // Hjälp
      {
        id: 'help-shortcuts',
        label: 'Visa kortkommandon',
        hint: '?',
        group: 'Hjälp',
        keywords: 'shortcuts kortkommandon hotkeys hjälp help cheatsheet',
        action: () => {
          const ks = (typeof window !== 'undefined') && window.MajorArcanaPreviewKeyboardShortcuts;
          if (ks && typeof ks.openCheatsheet === 'function') {
            ks.openCheatsheet();
          } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('Kortkommandon laddas inte ännu. Försök igen om en stund.');
          }
        },
      },
    ];

    // Lägg till sparade vyer som dynamiska kommandon
    const savedViews = (typeof window !== 'undefined') && window.MajorArcanaPreviewSavedViews;
    if (savedViews && typeof savedViews.getViewCommands === 'function') {
      try {
        const viewCommands = savedViews.getViewCommands() || [];
        for (const cmd of viewCommands) {
          if (cmd && typeof cmd.action === 'function') base.push(cmd);
        }
      } catch (_e) { /* tyst */ }
    }
    return base;
  }

  function fuzzyScore(query, command) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return 1;
    const haystack = (
      command.label + ' ' + (command.keywords || '') + ' ' + (command.group || '')
    ).toLowerCase();
    // Exakt substring först (högst poäng)
    const idx = haystack.indexOf(q);
    if (idx !== -1) {
      // Bonus för match i början av label
      const labelIdx = command.label.toLowerCase().indexOf(q);
      return 100 - idx - (labelIdx === 0 ? -20 : 0);
    }
    // Subsequence-fallback: alla bokstäver i ordning
    let qi = 0;
    for (let i = 0; i < haystack.length && qi < q.length; i++) {
      if (haystack[i] === q[qi]) qi++;
    }
    return qi === q.length ? 5 : 0;
  }

  function filterCommands(query) {
    lastQuery = query;
    const scored = allCommands
      .map((cmd) => ({ cmd, score: fuzzyScore(query, cmd) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    visibleCommands = scored.map((entry) => entry.cmd);
    activeIndex = 0;
    render();
  }

  function render() {
    if (!resultsEl || !emptyEl) return;
    if (visibleCommands.length === 0) {
      resultsEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    // Bevara grupp-ordning från allCommands
    const groupOrder = [];
    const groups = new Map();
    for (const cmd of visibleCommands) {
      const g = cmd.group || 'Övrigt';
      if (!groups.has(g)) {
        groups.set(g, []);
        groupOrder.push(g);
      }
      groups.get(g).push(cmd);
    }

    let html = '';
    let idx = 0;
    for (const groupName of groupOrder) {
      html += `<div class="cco-cmdk-group">${escapeHtml(groupName)}</div>`;
      for (const cmd of groups.get(groupName)) {
        const isActive = idx === activeIndex;
        html += `<button class="cco-cmdk-item${isActive ? ' is-active' : ''}" data-cmdk-idx="${idx}" type="button">
          <span class="cco-cmdk-item-label">${escapeHtml(cmd.label)}</span>
          <span class="cco-cmdk-item-hint">${escapeHtml(cmd.hint || '')}</span>
        </button>`;
        idx++;
      }
    }
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('[data-cmdk-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        activeIndex = Number(el.getAttribute('data-cmdk-idx'));
        executeActive();
      });
      el.addEventListener('mousemove', () => {
        const next = Number(el.getAttribute('data-cmdk-idx'));
        if (next !== activeIndex) {
          activeIndex = next;
          updateActiveStyling();
        }
      });
    });
  }

  function updateActiveStyling() {
    if (!resultsEl) return;
    resultsEl.querySelectorAll('[data-cmdk-idx]').forEach((el) => {
      el.classList.toggle(
        'is-active',
        Number(el.getAttribute('data-cmdk-idx')) === activeIndex
      );
    });
    const activeEl = resultsEl.querySelector('.cco-cmdk-item.is-active');
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveActive(delta) {
    if (visibleCommands.length === 0) return;
    activeIndex =
      (activeIndex + delta + visibleCommands.length) % visibleCommands.length;
    updateActiveStyling();
  }

  function executeActive() {
    const cmd = visibleCommands[activeIndex];
    if (!cmd) return;
    close();
    try {
      cmd.action();
    } catch (error) {
      // Tyst — kommandopaletten ska aldrig krascha appen
      // eslint-disable-next-line no-console
      console.warn('CCO command-palette action error', error);
    }
  }

  function injectStyles() {
    if (document.getElementById('cco-cmdk-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-cmdk-styles';
    style.textContent = `
.cco-cmdk-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(20, 18, 16, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  animation: cco-cmdk-fade 0.12s ease-out;
}
.cco-cmdk-backdrop[hidden] { display: none; }
@keyframes cco-cmdk-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.cco-cmdk {
  width: min(640px, 92vw);
  background: #fbf7f1;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
  animation: cco-cmdk-rise 0.16s ease-out;
}
@keyframes cco-cmdk-rise {
  from { opacity: 0; transform: translateY(-6px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.cco-cmdk-search {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.cco-cmdk-search-icon {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  background: rgba(80, 60, 40, 0.08);
  padding: 4px 8px; border-radius: 6px;
  color: #5d4a3c;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
}
.cco-cmdk-input {
  flex: 1; border: 0; outline: 0; background: transparent;
  font-size: 16px; color: #2b251f;
  font-family: inherit;
  min-width: 0;
}
.cco-cmdk-input::placeholder { color: rgba(80, 60, 40, 0.45); }
.cco-cmdk-hint {
  font-size: 11px; color: rgba(80, 60, 40, 0.5);
  white-space: nowrap;
}
.cco-cmdk-results {
  max-height: 50vh; overflow-y: auto; padding: 8px;
}
.cco-cmdk-group {
  font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(80, 60, 40, 0.55);
  padding: 12px 12px 6px;
}
.cco-cmdk-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  width: 100%; padding: 10px 12px;
  background: transparent; border: 0; border-radius: 8px;
  font-family: inherit; font-size: 14px; text-align: left;
  cursor: pointer; color: #2b251f;
  transition: background 0.08s ease;
}
.cco-cmdk-item:hover { background: rgba(80, 60, 40, 0.06); }
.cco-cmdk-item.is-active {
  background: rgba(80, 60, 40, 0.10);
}
.cco-cmdk-item-label { flex: 1; }
.cco-cmdk-item-hint {
  font-size: 11px; color: rgba(80, 60, 40, 0.55);
  white-space: nowrap;
}
.cco-cmdk-empty {
  padding: 32px; text-align: center; color: rgba(80, 60, 40, 0.55);
  font-size: 14px;
}
[data-cco-theme="dark"] .cco-cmdk,
.is-dark .cco-cmdk,
html[data-theme="dark"] .cco-cmdk {
  background: #1f1b16; color: #f3ece2;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-cmdk-search,
.is-dark .cco-cmdk-search,
html[data-theme="dark"] .cco-cmdk-search {
  border-color: rgba(255, 255, 255, 0.06);
}
[data-cco-theme="dark"] .cco-cmdk-input,
.is-dark .cco-cmdk-input,
html[data-theme="dark"] .cco-cmdk-input {
  color: #f3ece2;
}
[data-cco-theme="dark"] .cco-cmdk-item,
.is-dark .cco-cmdk-item,
html[data-theme="dark"] .cco-cmdk-item {
  color: #f3ece2;
}
[data-cco-theme="dark"] .cco-cmdk-item.is-active,
.is-dark .cco-cmdk-item.is-active,
html[data-theme="dark"] .cco-cmdk-item.is-active {
  background: rgba(255, 255, 255, 0.07);
}
`.trim();
    document.head.appendChild(style);
  }

  function createDom() {
    backdropEl = document.createElement('div');
    backdropEl.className = 'cco-cmdk-backdrop';
    backdropEl.setAttribute('hidden', '');

    dialogEl = document.createElement('div');
    dialogEl.className = 'cco-cmdk';
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-modal', 'true');
    dialogEl.setAttribute('aria-label', 'Kommandopalett');
    dialogEl.innerHTML = `
      <div class="cco-cmdk-search">
        <span class="cco-cmdk-search-icon" aria-hidden="true">⌘K</span>
        <input class="cco-cmdk-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="Hoppa till lane, vy, action eller inställning…" aria-label="Sök kommando">
        <span class="cco-cmdk-hint">esc stänger</span>
      </div>
      <div class="cco-cmdk-results" role="listbox"></div>
      <div class="cco-cmdk-empty" hidden>Inga matchningar</div>
    `;
    backdropEl.appendChild(dialogEl);
    document.body.appendChild(backdropEl);

    inputEl = dialogEl.querySelector('.cco-cmdk-input');
    resultsEl = dialogEl.querySelector('.cco-cmdk-results');
    emptyEl = dialogEl.querySelector('.cco-cmdk-empty');

    backdropEl.addEventListener('click', (event) => {
      if (event.target === backdropEl) close();
    });

    inputEl.addEventListener('input', () => {
      filterCommands(inputEl.value);
    });

    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        executeActive();
      } else if (event.key === 'Home') {
        event.preventDefault();
        activeIndex = 0;
        updateActiveStyling();
      } else if (event.key === 'End') {
        event.preventDefault();
        activeIndex = Math.max(0, visibleCommands.length - 1);
        updateActiveStyling();
      }
    });
  }

  function open() {
    if (isOpen) return;
    if (!backdropEl) {
      injectStyles();
      createDom();
    }
    allCommands = buildCommands();
    visibleCommands = allCommands.slice();
    activeIndex = 0;
    backdropEl.removeAttribute('hidden');
    inputEl.value = '';
    filterCommands('');
    requestAnimationFrame(() => {
      try { inputEl.focus(); } catch (_e) { /* noop */ }
    });
    isOpen = true;
  }

  function close() {
    if (!isOpen || !backdropEl) return;
    backdropEl.setAttribute('hidden', '');
    isOpen = false;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function isMacPlatform() {
    if (typeof navigator === 'undefined') return false;
    const platform = String(navigator.platform || '').toLowerCase();
    const ua = String(navigator.userAgent || '').toLowerCase();
    return /mac|iphone|ipad|ipod/.test(platform + ' ' + ua);
  }

  function bindGlobalShortcut() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener(
      'keydown',
      (event) => {
        const isMac = isMacPlatform();
        const cmdLike = isMac ? event.metaKey : event.ctrlKey;
        if (cmdLike && (event.key === 'k' || event.key === 'K')) {
          // Förhindra browserns standard "fokusera adressfält" i Chrome om vi är aktiva
          event.preventDefault();
          toggle();
          return;
        }
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault();
          close();
        }
      },
      false
    );
  }

  function mount() {
    bindGlobalShortcut();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewCommandPalette = Object.freeze({
      mount,
      open,
      close,
      toggle,
      // För framtida utbyggnad: registrera fler kommandon från app.js
      // (t.ex. recent customers, makro-genvägar, sparade vyer).
      // Tills dess returnerar vi en read-only snapshot.
      getRegisteredCommands: () => allCommands.slice(),
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
