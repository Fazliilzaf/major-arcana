/**
 * app/bulk-actions.js — Bulk-actions på thread-cards.
 *
 * UX (Gmail/Linear-stil):
 *   x          toggla selection på fokuserad tråd (eller hovrad)
 *   * a        markera alla synliga
 *   * n        avmarkera alla
 *   Shift+E    bulk: markera alla valda klar
 *   Shift+S    bulk: snooze alla valda
 *   Shift+D    bulk: radera alla valda (med confirm)
 *
 * Visuellt: valda kort får checkmark + accent border.
 * Toolbar visas längst ner i viewport när ≥1 valt.
 */
(() => {
  'use strict';

  const SELECTED_CLASS = 'is-bulk-selected';
  const selectedSet = new Set();
  let lastStarKeyAt = 0;
  let toolbarEl = null;

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
    return Array.from(
      document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]')
    );
  }

  function getCardById(id) {
    return document.querySelector(`.thread-card[data-runtime-thread="${CSS.escape(id)}"]`);
  }

  function getFocusedCardId() {
    // Använd keyboard-nav:s focus om det finns
    const focused = document.querySelector('.thread-card.is-keyboard-focused');
    if (focused) return focused.dataset.runtimeThread || null;
    return null;
  }

  // ============================================================
  // Selection state
  // ============================================================

  function toggleSelection(id) {
    if (!id) return;
    if (selectedSet.has(id)) selectedSet.delete(id);
    else selectedSet.add(id);
    syncDom();
  }

  function selectAll() {
    getThreadCards().forEach((c) => {
      const id = c.dataset.runtimeThread;
      if (id) selectedSet.add(id);
    });
    syncDom();
  }

  function clearSelection() {
    selectedSet.clear();
    syncDom();
  }

  function syncDom() {
    // Lägg/ta bort SELECTED_CLASS på alla cards
    getThreadCards().forEach((c) => {
      const id = c.dataset.runtimeThread;
      const shouldBe = id && selectedSet.has(id);
      const has = c.classList.contains(SELECTED_CLASS);
      if (shouldBe && !has) c.classList.add(SELECTED_CLASS);
      else if (!shouldBe && has) c.classList.remove(SELECTED_CLASS);
    });
    renderToolbar();
  }

  // ============================================================
  // Toolbar
  // ============================================================

  function ensureToolbar() {
    if (toolbarEl) return;
    toolbarEl = document.createElement('div');
    toolbarEl.id = 'bulk-actions-toolbar';
    toolbarEl.setAttribute('aria-hidden', 'true');
    toolbarEl.innerHTML = `
      <span class="bulk-count">0 valda</span>
      <div class="bulk-divider"></div>
      <button type="button" class="bulk-btn" data-bulk-action="handled" title="Markera alla klar (Shift+E)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 7 12 13 4"/></svg>
        Markera klar
      </button>
      <button type="button" class="bulk-btn" data-bulk-action="later" title="Snooze alla (Shift+S)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 2.5"/></svg>
        Snooze
      </button>
      <button type="button" class="bulk-btn bulk-btn-danger" data-bulk-action="delete" title="Radera alla (Shift+D)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9"/></svg>
        Radera
      </button>
      <div class="bulk-divider"></div>
      <button type="button" class="bulk-btn bulk-btn-ghost" data-bulk-action="clear" title="Avmarkera alla (* n)">
        Avmarkera
      </button>
    `;
    document.body.appendChild(toolbarEl);
    toolbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bulk-action]');
      if (!btn) return;
      const action = btn.dataset.bulkAction;
      if (action === 'clear') clearSelection();
      else applyBulkAction(action);
    });
  }

  function renderToolbar() {
    ensureToolbar();
    const count = selectedSet.size;
    if (count === 0) {
      toolbarEl.removeAttribute('data-open');
      toolbarEl.setAttribute('aria-hidden', 'true');
      return;
    }
    toolbarEl.setAttribute('data-open', '');
    toolbarEl.setAttribute('aria-hidden', 'false');
    const countEl = toolbarEl.querySelector('.bulk-count');
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'vald' : 'valda'}`;
  }

  // ============================================================
  // Bulk-action execution
  // ============================================================

  function applyBulkAction(actionKey) {
    if (selectedSet.size === 0) return;
    const ids = Array.from(selectedSet);

    if (actionKey === 'delete') {
      const ok = confirm(
        `Radera ${ids.length} ${ids.length === 1 ? 'tråd' : 'trådar'}? Denna åtgärd kan inte ångras.`
      );
      if (!ok) return;
    }

    let applied = 0;
    let skipped = 0;
    for (const id of ids) {
      const card = getCardById(id);
      if (!card) {
        skipped++;
        continue;
      }
      const btn = card.querySelector(`[data-quick-action="${actionKey}"]`);
      if (btn) {
        btn.click();
        applied++;
      } else {
        skipped++;
      }
    }
    if (typeof console !== 'undefined') {
      console.log(`[bulk-actions] ${actionKey}: applied=${applied} skipped=${skipped}`);
    }
    clearSelection();
  }

  // ============================================================
  // Keyboard
  // ============================================================

  document.addEventListener('keydown', (e) => {
    if (isTypingContext(e.target)) return;

    // Skippa om Cmd+K-overlay öppen
    const cmdKOpen = document.getElementById('cmd-k-overlay')?.hasAttribute('data-open');
    if (cmdKOpen) return;
    const helpOpen = document.getElementById('keyboard-help-overlay')?.hasAttribute('data-open');
    if (helpOpen) return;

    // Shift+E/S/D = bulk-actions (om något är valt)
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'e' && selectedSet.size > 0) {
        e.preventDefault();
        applyBulkAction('handled');
        return;
      }
      if (k === 's' && selectedSet.size > 0) {
        e.preventDefault();
        applyBulkAction('later');
        return;
      }
      if (k === 'd' && selectedSet.size > 0) {
        e.preventDefault();
        applyBulkAction('delete');
        return;
      }
    }

    // Skippa modifierade keys för rest
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // *-sekvens (* a = select all, * n = none)
    const now = Date.now();
    if (now - lastStarKeyAt < 1000) {
      lastStarKeyAt = 0;
      const k = e.key.toLowerCase();
      if (k === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (k === 'n') {
        e.preventDefault();
        clearSelection();
        return;
      }
    }

    if (e.key === '*') {
      e.preventDefault();
      lastStarKeyAt = now;
      return;
    }

    // x = toggla selection på fokuserad tråd
    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      const id = getFocusedCardId();
      if (id) toggleSelection(id);
      return;
    }
  });

  // ============================================================
  // MutationObserver — re-applicera selection-klassen efter render
  // ============================================================

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(syncDom);
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

  // Exponera för debug + integration
  window.__BulkActions = Object.freeze({
    toggle: toggleSelection,
    selectAll,
    clearSelection,
    apply: applyBulkAction,
    getSelected: () => Array.from(selectedSet),
  });
})();
