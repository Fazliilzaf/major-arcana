/**
 * app/cmd-k.js — Cmd+K Spotlight-snabbsök för CCO.
 *
 * Öppnas med Cmd+K (Mac) eller Ctrl+K. Söker över:
 *  - Trådar (state.runtime.threads + queueHistory.items)
 *  - Kunder (state.customerRuntime.directory)
 *  - Makron (state.macros)
 *  - Vyer (Inkonst, Senare, Skickat, Kunder, Automation, Makron, Inställningar...)
 *
 * Tangentbord: ↑/↓ navigera, Enter välj, Esc stäng.
 *
 * Render-driven via state.ui.cmdKOpen — anslutas till state-views genom att
 * lägga till mappingen i state-paths.js separat. Just nu använder vi en
 * lokal flag eftersom state.ui inte enkelt går att utöka utan att röra
 * state-paths-modulen.
 */
(() => {
  'use strict';

  // ============================================================
  // Konstanter
  // ============================================================

  const VIEWS = [
    { key: 'conversations', label: 'Inkorg', shortcut: 'I' },
    { key: 'later', label: 'Senare' },
    { key: 'sent', label: 'Skickat' },
    { key: 'customers', label: 'Kunder', shortcut: 'K' },
    { key: 'automation', label: 'Automation' },
    { key: 'analytics', label: 'Analys' },
    { key: 'integrations', label: 'Integrationer' },
    { key: 'macros', label: 'Makron' },
    { key: 'settings', label: 'Inställningar' },
    { key: 'showcase', label: 'Showcase' },
  ];

  const ICONS = {
    thread:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5l5.5 4 5.5-4"/><rect x="2" y="3" width="12" height="10" rx="1.5"/></svg>',
    customer:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"/></svg>',
    macro:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4l3 3-3 3"/><path d="M8 11h5"/></svg>',
    view: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 7h12"/></svg>',
  };

  // ============================================================
  // State (lokal — Cmd+K är inte i state.ui-mappingen)
  // ============================================================

  let isOpen = false;
  let activeIndex = 0;
  let currentResults = [];
  let overlayEl = null;
  let inputEl = null;
  let listEl = null;

  // ============================================================
  // Sökmotor
  // ============================================================

  function fuzzyMatch(text, query) {
    if (!text || !query) return 0;
    const t = String(text).toLowerCase();
    const q = query.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (t.includes(q)) return 60;
    // Karakterordnad subsequence-match (alla bokstäver i q i samma ordning i t)
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) qi++;
    }
    if (qi === q.length) return 30;
    return 0;
  }

  function getState() {
    return window.__App?.state || (typeof state !== 'undefined' ? state : null);
  }

  function searchThreads(query) {
    const state = getState();
    if (!state) return [];
    const threads = (state.runtime?.threads || []).slice(0, 100);
    const historyItems = state.runtime?.queueHistory?.items || [];
    const all = [
      ...threads.map((t) => ({
        type: 'thread',
        id: t.id,
        title: t.customerName || 'Okänd avsändare',
        subtitle: t.subject || '',
        searchText: `${t.customerName || ''} ${t.subject || ''} ${t.preview || ''}`,
        actionData: { kind: 'thread', id: t.id },
      })),
      ...historyItems.slice(0, 50).map((h) => ({
        type: 'thread',
        id: h.conversationId || h.id,
        title: h.counterpartyLabel || h.title || 'Historik',
        subtitle: (h.detail || '').slice(0, 80),
        searchText: `${h.counterpartyLabel || ''} ${h.title || ''} ${h.detail || ''}`,
        actionData: { kind: 'thread', id: h.conversationId || h.id },
      })),
    ];
    return all
      .map((item) => ({ ...item, score: fuzzyMatch(item.searchText, query) }))
      .filter((item) => item.score > 0);
  }

  function searchCustomers(query) {
    const state = getState();
    if (!state?.customerRuntime?.directory) return [];
    const directory = state.customerRuntime.directory;
    const entries = Object.entries(directory);
    return entries
      .map(([key, info]) => ({
        type: 'customer',
        id: key,
        title: info?.name || info?.displayName || key,
        subtitle: info?.email || info?.phone || '',
        searchText: `${info?.name || ''} ${info?.email || ''} ${info?.phone || ''}`,
        actionData: { kind: 'customer', id: key },
        score: fuzzyMatch(`${info?.name || ''} ${info?.email || ''} ${info?.phone || ''}`, query),
      }))
      .filter((item) => item.score > 0);
  }

  function searchMacros(query) {
    const state = getState();
    const macros = state?.macros || [];
    return macros
      .map((m) => ({
        type: 'macro',
        id: m.id || m.key || m.name,
        title: m.name || m.title || 'Makro',
        subtitle: m.description || m.summary || '',
        searchText: `${m.name || ''} ${m.title || ''} ${m.description || ''}`,
        actionData: { kind: 'macro', id: m.id || m.key },
        score: fuzzyMatch(`${m.name || ''} ${m.description || ''}`, query),
      }))
      .filter((item) => item.score > 0);
  }

  function searchViews(query) {
    return VIEWS.map((v) => ({
      type: 'view',
      id: v.key,
      title: `Hoppa till ${v.label}`,
      subtitle: v.shortcut ? `Genväg: ${v.shortcut}` : '',
      searchText: v.label,
      actionData: { kind: 'view', viewKey: v.key },
      score: fuzzyMatch(v.label, query),
    })).filter((item) => item.score > 0);
  }

  function getDefaultResults() {
    // Inga sök-query — visa de 5 senaste threads + alla views
    const state = getState();
    const recentThreads = (state?.runtime?.threads || []).slice(0, 5).map((t) => ({
      type: 'thread',
      id: t.id,
      title: t.customerName || 'Okänd avsändare',
      subtitle: t.subject || '',
      actionData: { kind: 'thread', id: t.id },
      score: 50,
    }));
    const allViews = VIEWS.map((v) => ({
      type: 'view',
      id: v.key,
      title: `Hoppa till ${v.label}`,
      subtitle: v.shortcut ? `Genväg: ${v.shortcut}` : '',
      actionData: { kind: 'view', viewKey: v.key },
      score: 40,
    }));
    return [...recentThreads, ...allViews];
  }

  function getResults(query) {
    if (!query || !query.trim()) return getDefaultResults();
    const all = [
      ...searchThreads(query),
      ...searchCustomers(query),
      ...searchMacros(query),
      ...searchViews(query),
    ];
    return all.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  // ============================================================
  // Rendering
  // ============================================================

  function ensureOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'cmd-k-overlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-label', 'Snabbsök');
    overlayEl.innerHTML = `
      <div class="cmd-k-backdrop" data-cmd-k-close></div>
      <div class="cmd-k-panel" role="combobox" aria-expanded="true">
        <div class="cmd-k-input-row">
          <svg class="cmd-k-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5"/>
            <path d="M10.5 10.5l3 3"/>
          </svg>
          <input
            type="text"
            class="cmd-k-input"
            placeholder="Sök trådar, kunder, makron, vyer…"
            autocomplete="off"
            spellcheck="false"
            aria-label="Snabbsök"
          />
          <kbd class="cmd-k-esc">Esc</kbd>
        </div>
        <div class="cmd-k-list" role="listbox"></div>
        <div class="cmd-k-footer">
          <kbd>↑</kbd><kbd>↓</kbd> navigera · <kbd>Enter</kbd> välj · <kbd>Esc</kbd> stäng
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);
    inputEl = overlayEl.querySelector('.cmd-k-input');
    listEl = overlayEl.querySelector('.cmd-k-list');

    // Click-handlers
    overlayEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-cmd-k-close]')) {
        close();
      }
      const item = e.target.closest('[data-cmd-k-result]');
      if (item) {
        const idx = Number(item.dataset.cmdKResult);
        selectResult(idx);
      }
    });
    inputEl.addEventListener('input', () => {
      activeIndex = 0;
      renderResults(inputEl.value);
    });
  }

  function renderResults(query) {
    currentResults = getResults(query);
    if (currentResults.length === 0) {
      listEl.innerHTML = '<div class="cmd-k-empty">Inga träffar.</div>';
      return;
    }
    // Gruppera per typ
    const groups = { thread: [], customer: [], macro: [], view: [] };
    const groupOrder = ['thread', 'customer', 'macro', 'view'];
    const groupLabels = {
      thread: 'Trådar',
      customer: 'Kunder',
      macro: 'Makron',
      view: 'Vyer',
    };
    currentResults.forEach((r, i) => {
      r.__index = i;
      groups[r.type].push(r);
    });

    let html = '';
    for (const groupKey of groupOrder) {
      const items = groups[groupKey];
      if (!items.length) continue;
      html += `<div class="cmd-k-group-label">${groupLabels[groupKey]}</div>`;
      html += items
        .map(
          (r) => `
        <div class="cmd-k-result ${r.__index === activeIndex ? 'is-active' : ''}"
             data-cmd-k-result="${r.__index}"
             role="option"
             aria-selected="${r.__index === activeIndex}">
          <span class="cmd-k-icon" aria-hidden="true">${ICONS[r.type] || ''}</span>
          <span class="cmd-k-label">
            <strong>${escapeHtml(r.title)}</strong>
            ${r.subtitle ? `<span class="cmd-k-sub">${escapeHtml(r.subtitle).slice(0, 80)}</span>` : ''}
          </span>
        </div>
      `
        )
        .join('');
    }
    listEl.innerHTML = html;

    // Scrolla aktiv till syn
    const activeEl = listEl.querySelector('.cmd-k-result.is-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]
    );
  }

  // ============================================================
  // Action-handlers
  // ============================================================

  function selectResult(idx) {
    const result = currentResults[idx];
    if (!result) return;
    const data = result.actionData;
    close();

    if (data.kind === 'thread') {
      // Klicka på thread-card via befintlig click-handler eller workspace-API
      try {
        if (window.__ccoWorkspace?.setSelectedThreadId) {
          window.__ccoWorkspace.setSelectedThreadId(data.id);
          window.dispatchEvent(
            new CustomEvent('cco:state-change', { detail: { selectedThreadId: data.id } })
          );
        }
      } catch (_e) {}
      // Eller: scrolla till tråden i listan
      setTimeout(() => {
        const card = document.querySelector(`[data-runtime-thread="${data.id}"]`);
        if (card) {
          card.scrollIntoView({ block: 'center', behavior: 'smooth' });
          card.click();
        }
      }, 50);
    } else if (data.kind === 'customer') {
      if (typeof window.__ccoCustomerList?.selectCustomerKey === 'function') {
        window.__ccoCustomerList.selectCustomerKey(data.id);
      } else {
        const navBtn = document.querySelector('[data-nav-view="customers"]');
        if (navBtn) navBtn.click();
      }
    } else if (data.kind === 'macro') {
      const navBtn = document.querySelector('[data-nav-view="macros"]');
      if (navBtn) navBtn.click();
    } else if (data.kind === 'view') {
      const navBtn = document.querySelector(`[data-nav-view="${data.viewKey}"]`);
      if (navBtn) navBtn.click();
    }
  }

  // ============================================================
  // Open / Close
  // ============================================================

  function open() {
    if (isOpen) return;
    ensureOverlay();
    isOpen = true;
    activeIndex = 0;
    overlayEl.setAttribute('data-open', '');
    overlayEl.setAttribute('aria-hidden', 'false');
    if (inputEl) {
      inputEl.value = '';
      renderResults('');
      // Fokusera input efter en frame så CSS-transition hinner starta
      requestAnimationFrame(() => inputEl.focus());
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (overlayEl) {
      overlayEl.removeAttribute('data-open');
      overlayEl.setAttribute('aria-hidden', 'true');
    }
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ============================================================
  // Keyboard
  // ============================================================

  document.addEventListener('keydown', (e) => {
    // Cmd+K (Mac) eller Ctrl+K — öppna/toggle
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggle();
      return;
    }
    // Hantering INNE i overlay
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      renderResults(inputEl.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderResults(inputEl.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectResult(activeIndex);
    }
  });

  // Exponera för debug
  window.__CmdK = Object.freeze({ open, close, toggle });
})();
