/**
 * Major Arcana Preview — Unified Search
 *
 * Snabb fuzzy-sökning över hela appen: trådar, kunder, makron, vyer.
 * Triggas med ⌘/  (eller Ctrl+/), eller via Command Palette.
 *
 * v1: skrapa DOM-element som redan är renderade — ingen backend-anrop.
 * Det ger sub-50ms latens och fungerar för det vanliga arbetsflödet
 * (du söker efter trådar/kunder du redan har laddat).
 *
 * Stöd för data-källor:
 *   - Trådar:  [data-runtime-thread]
 *   - Kunder:  [data-customer-row]
 *   - Macros:  [data-runtime-macro]  (om frontend exponerar — annars hoppas över)
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
  let visibleResults = [];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function trim(value, max = 80) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  function getElementText(el, max = 200) {
    if (!el) return '';
    return trim(el.textContent || '', max);
  }

  function gatherThreads() {
    const elements = document.querySelectorAll('[data-runtime-thread]');
    const seen = new Set();
    const out = [];
    elements.forEach((el) => {
      const id = el.getAttribute('data-runtime-thread');
      if (!id || seen.has(id)) return;
      seen.add(id);
      // Försök hitta kund-namn och ämne
      const customerEl =
        el.querySelector('[data-runtime-customer-name]') ||
        el.querySelector('.thread-customer-name') ||
        el.querySelector('h3, h4');
      const subjectEl =
        el.querySelector('[data-runtime-thread-subject]') ||
        el.querySelector('.thread-subject') ||
        el.querySelector('p');
      const customer = customerEl ? trim(customerEl.textContent, 60) : '';
      const subject = subjectEl ? trim(subjectEl.textContent, 100) : '';
      const fullText = getElementText(el, 240);
      out.push({
        type: 'thread',
        id,
        primary: customer || subject || 'Tråd ' + id,
        secondary: customer ? subject : '',
        searchText: customer + ' ' + subject + ' ' + fullText,
        targetEl: el,
      });
    });
    return out;
  }

  function gatherCustomers() {
    const elements = document.querySelectorAll('[data-customer-row]');
    const seen = new Set();
    const out = [];
    elements.forEach((el) => {
      const id = el.getAttribute('data-customer-row');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const nameEl =
        el.querySelector('[data-customer-name]') ||
        el.querySelector('.customer-name') ||
        el.querySelector('strong, h3, h4');
      const name = nameEl ? trim(nameEl.textContent, 60) : '';
      const fullText = getElementText(el, 200);
      out.push({
        type: 'customer',
        id,
        primary: name || id,
        secondary: '',
        searchText: name + ' ' + fullText,
        targetEl: el,
      });
    });
    return out;
  }

  function gatherMacros() {
    // Eventuellt framtida: data-runtime-macro / .macro-card
    const elements = document.querySelectorAll('[data-runtime-macro]');
    const seen = new Set();
    const out = [];
    elements.forEach((el) => {
      const id = el.getAttribute('data-runtime-macro');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const titleEl = el.querySelector('h3, h4, strong, .macro-title');
      const name = titleEl ? trim(titleEl.textContent, 60) : id;
      out.push({
        type: 'macro',
        id,
        primary: name,
        secondary: '',
        searchText: name + ' ' + getElementText(el, 200),
        targetEl: el,
      });
    });
    return out;
  }

  function gatherSavedViews() {
    if (typeof window === 'undefined') return [];
    const sv = window.MajorArcanaPreviewSavedViews;
    if (!sv || typeof sv.listViews !== 'function') return [];
    try {
      return sv.listViews().map((view) => ({
        type: 'view',
        id: view.id,
        primary: view.name,
        secondary: view.laneLabel || view.laneId || '',
        searchText: (view.name || '') + ' ' + (view.laneLabel || ''),
        applyView: view,
      }));
    } catch (_e) {
      return [];
    }
  }

  function gatherAll() {
    return [
      ...gatherThreads(),
      ...gatherCustomers(),
      ...gatherMacros(),
      ...gatherSavedViews(),
    ];
  }

  function fuzzyScore(query, item) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return 1;
    const haystack = String(item.searchText || '').toLowerCase();
    if (!haystack) return 0;
    const idx = haystack.indexOf(q);
    if (idx !== -1) {
      const primaryHit = String(item.primary || '').toLowerCase().indexOf(q);
      return 100 - idx + (primaryHit === 0 ? 30 : 0);
    }
    // Subsequence-fallback
    let qi = 0;
    for (let i = 0; i < haystack.length && qi < q.length; i++) {
      if (haystack[i] === q[qi]) qi++;
    }
    return qi === q.length ? 5 : 0;
  }

  function search(query) {
    const items = gatherAll();
    const scored = items
      .map((item) => ({ item, score: fuzzyScore(query, item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
    visibleResults = scored.map((entry) => entry.item);
    activeIndex = 0;
    render();
  }

  function typeLabel(type) {
    return ({
      thread: 'Tråd',
      customer: 'Kund',
      macro: 'Macro',
      view: 'Sparad vy',
    })[type] || type;
  }

  function typeGroup(type) {
    return ({
      thread: 'Trådar',
      customer: 'Kunder',
      macro: 'Macros',
      view: 'Sparade vyer',
    })[type] || 'Övrigt';
  }

  function render() {
    if (!resultsEl || !emptyEl) return;
    if (visibleResults.length === 0) {
      resultsEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    const groupOrder = [];
    const groups = new Map();
    for (const item of visibleResults) {
      const g = typeGroup(item.type);
      if (!groups.has(g)) {
        groups.set(g, []);
        groupOrder.push(g);
      }
      groups.get(g).push(item);
    }

    let html = '';
    let idx = 0;
    for (const groupName of groupOrder) {
      html += `<div class="cco-usearch-group">${escapeHtml(groupName)}</div>`;
      for (const item of groups.get(groupName)) {
        const isActive = idx === activeIndex;
        const secondary = item.secondary ? `<span class="cco-usearch-item-sub">${escapeHtml(item.secondary)}</span>` : '';
        html += `<button class="cco-usearch-item${isActive ? ' is-active' : ''}" data-usearch-idx="${idx}" type="button">
          <span class="cco-usearch-item-type">${escapeHtml(typeLabel(item.type))}</span>
          <span class="cco-usearch-item-primary">${escapeHtml(item.primary)}</span>
          ${secondary}
        </button>`;
        idx++;
      }
    }
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('[data-usearch-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        activeIndex = Number(el.getAttribute('data-usearch-idx'));
        executeActive();
      });
      el.addEventListener('mousemove', () => {
        const next = Number(el.getAttribute('data-usearch-idx'));
        if (next !== activeIndex) {
          activeIndex = next;
          updateActiveStyling();
        }
      });
    });
  }

  function updateActiveStyling() {
    if (!resultsEl) return;
    resultsEl.querySelectorAll('[data-usearch-idx]').forEach((el) => {
      el.classList.toggle('is-active', Number(el.getAttribute('data-usearch-idx')) === activeIndex);
    });
    const activeEl = resultsEl.querySelector('.cco-usearch-item.is-active');
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveActive(delta) {
    if (visibleResults.length === 0) return;
    activeIndex = (activeIndex + delta + visibleResults.length) % visibleResults.length;
    updateActiveStyling();
  }

  function executeActive() {
    const item = visibleResults[activeIndex];
    if (!item) return;
    close();
    try {
      if (item.type === 'view' && item.applyView) {
        const sv = window.MajorArcanaPreviewSavedViews;
        if (sv && typeof sv.applyView === 'function') sv.applyView(item.applyView);
        return;
      }
      if (item.targetEl && typeof item.targetEl.click === 'function') {
        item.targetEl.click();
        // Försök scrolla in i vy
        if (typeof item.targetEl.scrollIntoView === 'function') {
          item.targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('CCO unified-search action error', error);
    }
  }

  function injectStyles() {
    if (document.getElementById('cco-usearch-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-usearch-styles';
    style.textContent = `
.cco-usearch-backdrop {
  position: fixed; inset: 0; z-index: 9997;
  background: rgba(20, 18, 16, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
}
.cco-usearch-backdrop[hidden] { display: none; }
.cco-usearch {
  width: min(720px, 92vw);
  background: #fbf7f1;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.cco-usearch-search {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.cco-usearch-search-icon {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  background: rgba(80, 60, 40, 0.08);
  padding: 4px 8px; border-radius: 6px;
  color: #5d4a3c;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
}
.cco-usearch-input {
  flex: 1; border: 0; outline: 0; background: transparent;
  font-size: 16px; color: #2b251f;
  font-family: inherit;
  min-width: 0;
}
.cco-usearch-input::placeholder { color: rgba(80, 60, 40, 0.45); }
.cco-usearch-hint { font-size: 11px; color: rgba(80, 60, 40, 0.5); white-space: nowrap; }
.cco-usearch-results { max-height: 60vh; overflow-y: auto; padding: 8px; }
.cco-usearch-group {
  font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(80, 60, 40, 0.55);
  padding: 12px 12px 6px;
}
.cco-usearch-item {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%; padding: 10px 12px;
  background: transparent; border: 0; border-radius: 8px;
  font-family: inherit; font-size: 14px; text-align: left;
  cursor: pointer; color: #2b251f;
  transition: background 0.08s ease;
}
.cco-usearch-item:hover { background: rgba(80, 60, 40, 0.06); }
.cco-usearch-item.is-active { background: rgba(80, 60, 40, 0.10); }
.cco-usearch-item-type {
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(80, 60, 40, 0.55);
  background: rgba(80, 60, 40, 0.06);
  padding: 3px 8px; border-radius: 6px;
  text-align: center;
}
.cco-usearch-item-primary {
  font-size: 14px; color: #2b251f;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cco-usearch-item-sub {
  font-size: 11px; color: rgba(80, 60, 40, 0.55);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 280px;
}
.cco-usearch-empty {
  padding: 32px; text-align: center; color: rgba(80, 60, 40, 0.55);
  font-size: 14px;
}
[data-cco-theme="dark"] .cco-usearch,
.is-dark .cco-usearch,
html[data-theme="dark"] .cco-usearch {
  background: #1f1b16; color: #f3ece2;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-usearch-search,
.is-dark .cco-usearch-search,
html[data-theme="dark"] .cco-usearch-search {
  border-color: rgba(255, 255, 255, 0.06);
}
[data-cco-theme="dark"] .cco-usearch-input,
.is-dark .cco-usearch-input,
html[data-theme="dark"] .cco-usearch-input { color: #f3ece2; }
[data-cco-theme="dark"] .cco-usearch-item,
.is-dark .cco-usearch-item,
html[data-theme="dark"] .cco-usearch-item { color: #f3ece2; }
[data-cco-theme="dark"] .cco-usearch-item.is-active,
.is-dark .cco-usearch-item.is-active,
html[data-theme="dark"] .cco-usearch-item.is-active { background: rgba(255, 255, 255, 0.07); }
[data-cco-theme="dark"] .cco-usearch-item-type,
.is-dark .cco-usearch-item-type,
html[data-theme="dark"] .cco-usearch-item-type {
  background: rgba(255, 255, 255, 0.06); color: rgba(243, 236, 226, 0.7);
}
`.trim();
    document.head.appendChild(style);
  }

  function createDom() {
    backdropEl = document.createElement('div');
    backdropEl.className = 'cco-usearch-backdrop';
    backdropEl.setAttribute('hidden', '');

    dialogEl = document.createElement('div');
    dialogEl.className = 'cco-usearch';
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-modal', 'true');
    dialogEl.setAttribute('aria-label', 'Sökning');
    dialogEl.innerHTML = `
      <div class="cco-usearch-search">
        <span class="cco-usearch-search-icon" aria-hidden="true">⌘/</span>
        <input class="cco-usearch-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="Sök trådar, kunder, makron, sparade vyer…" aria-label="Sökfält">
        <span class="cco-usearch-hint">esc stänger</span>
      </div>
      <div class="cco-usearch-results" role="listbox"></div>
      <div class="cco-usearch-empty" hidden>Inga matchningar</div>
    `;
    backdropEl.appendChild(dialogEl);
    document.body.appendChild(backdropEl);

    inputEl = dialogEl.querySelector('.cco-usearch-input');
    resultsEl = dialogEl.querySelector('.cco-usearch-results');
    emptyEl = dialogEl.querySelector('.cco-usearch-empty');

    backdropEl.addEventListener('click', (event) => {
      if (event.target === backdropEl) close();
    });

    inputEl.addEventListener('input', () => {
      search(inputEl.value);
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
        activeIndex = Math.max(0, visibleResults.length - 1);
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
    backdropEl.removeAttribute('hidden');
    inputEl.value = '';
    search('');
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
    document.addEventListener('keydown', (event) => {
      const isMac = isMacPlatform();
      const cmdLike = isMac ? event.metaKey : event.ctrlKey;
      // ⌘/ för unified-search (Mac konvention)
      if (cmdLike && event.key === '/') {
        event.preventDefault();
        toggle();
      }
    });
  }

  function mount() {
    bindGlobalShortcut();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewUnifiedSearch = Object.freeze({
      mount,
      open,
      close,
      toggle,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
