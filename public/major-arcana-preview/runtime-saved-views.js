/**
 * Major Arcana Preview — Saved Views
 *
 * Spara filter-kombinationer (lane-val, ev. utbyggnad till owner/mailbox)
 * som genvägar. Lagring i localStorage (client-side, ingen backend).
 *
 * Tangentbordsgenvägar:
 *   ⌘⇧S  — spara aktuell vy (öppnar namn-prompt)
 *   ⌘⇧V  — öppna lista över sparade vyer (modal)
 *
 * Integreras med Command Palette: vyerna dyker upp som kommandon
 * via window.MajorArcanaPreviewSavedViews.getViewCommands().
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cco.savedViews.v1';
  const MAX_VIEWS = 25;

  let modalBackdrop = null;
  let modalDialog = null;
  let modalListEl = null;
  let modalEmptyEl = null;

  function safeJsonParse(value, fallback) {
    if (value == null || value === '') return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (_e) {
      return fallback;
    }
  }

  function readStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = safeJsonParse(raw, null);
      if (!parsed || !Array.isArray(parsed.views)) return [];
      return parsed.views.filter(
        (v) => v && typeof v.id === 'string' && typeof v.name === 'string'
      );
    } catch (_e) {
      return [];
    }
  }

  function writeStorage(views) {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, views: views.slice(0, MAX_VIEWS) })
      );
      return true;
    } catch (_e) {
      return false;
    }
  }

  function generateId() {
    return 'view_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function getCurrentActiveLane() {
    // Lane-knapparna har class is-active när aktiv
    const activeBtn = document.querySelector(
      '[data-queue-lane].is-active, [data-queue-lane][aria-pressed="true"]'
    );
    if (activeBtn) {
      const laneId = activeBtn.getAttribute('data-queue-lane');
      const labelEl =
        activeBtn.querySelector('.queue-filter-chip-label') ||
        activeBtn.querySelector('span') ||
        activeBtn;
      const laneLabel = labelEl ? labelEl.textContent.trim() : laneId;
      return { laneId, laneLabel };
    }
    return { laneId: 'all', laneLabel: 'Alla' };
  }

  function captureCurrentView() {
    const { laneId, laneLabel } = getCurrentActiveLane();
    return {
      laneId,
      laneLabel,
      capturedAt: new Date().toISOString(),
    };
  }

  function applyView(view) {
    if (!view || typeof view !== 'object') return false;
    const laneId = view.laneId || 'all';
    const laneBtn = document.querySelector(`[data-queue-lane="${laneId}"]`);
    if (laneBtn && typeof laneBtn.click === 'function') {
      laneBtn.click();
      return true;
    }
    return false;
  }

  function listViews() {
    return readStorage();
  }

  function saveView(name, viewState) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const views = readStorage();
    const captured = viewState && typeof viewState === 'object'
      ? viewState
      : captureCurrentView();
    const view = {
      id: generateId(),
      name: trimmed,
      ...captured,
      createdAt: new Date().toISOString(),
    };
    views.unshift(view);
    if (writeStorage(views)) {
      notifyListChanged();
      return view;
    }
    return null;
  }

  function deleteView(id) {
    if (!id) return false;
    const views = readStorage().filter((v) => v.id !== id);
    if (writeStorage(views)) {
      notifyListChanged();
      return true;
    }
    return false;
  }

  function renameView(id, newName) {
    const trimmed = String(newName || '').trim();
    if (!id || !trimmed) return false;
    const views = readStorage();
    const idx = views.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    views[idx] = { ...views[idx], name: trimmed };
    if (writeStorage(views)) {
      notifyListChanged();
      return true;
    }
    return false;
  }

  const listChangeListeners = [];
  function notifyListChanged() {
    for (const fn of listChangeListeners.slice()) {
      try { fn(listViews()); } catch (_e) { /* tyst */ }
    }
  }
  function onListChanged(fn) {
    if (typeof fn !== 'function') return () => {};
    listChangeListeners.push(fn);
    return () => {
      const idx = listChangeListeners.indexOf(fn);
      if (idx !== -1) listChangeListeners.splice(idx, 1);
    };
  }

  // Kommandon för Command Palette
  function getViewCommands() {
    const views = listViews();
    return views.map((view) => ({
      id: 'saved-view-' + view.id,
      label: 'Sparad vy: ' + view.name,
      hint: view.laneLabel || view.laneId || '',
      group: 'Sparade vyer',
      keywords: 'saved view sparad vy ' + (view.name || '') + ' ' + (view.laneLabel || ''),
      action: () => applyView(view),
    }));
  }

  // ---------- UI ----------
  function injectStyles() {
    if (document.getElementById('cco-saved-views-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-saved-views-styles';
    style.textContent = `
.cco-svw-backdrop {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(20, 18, 16, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 14vh;
}
.cco-svw-backdrop[hidden] { display: none; }
.cco-svw-dialog {
  width: min(560px, 92vw);
  background: #fbf7f1;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.cco-svw-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.cco-svw-title {
  font-size: 14px; font-weight: 600; color: #2b251f; margin: 0;
}
.cco-svw-subtitle {
  font-size: 12px; color: rgba(80, 60, 40, 0.6); margin-top: 2px;
}
.cco-svw-actions {
  padding: 12px 16px;
  display: flex; gap: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.cco-svw-button {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fff; color: #2b251f;
  font-family: inherit; font-size: 13px;
  cursor: pointer;
}
.cco-svw-button:hover { background: rgba(80, 60, 40, 0.05); }
.cco-svw-button.is-primary {
  background: #2b251f; color: #fbf7f1;
  border-color: transparent;
}
.cco-svw-button.is-primary:hover { background: #1a1612; }
.cco-svw-list {
  max-height: 50vh; overflow-y: auto; padding: 8px;
}
.cco-svw-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  gap: 12px;
}
.cco-svw-item:hover { background: rgba(80, 60, 40, 0.05); }
.cco-svw-item-info { flex: 1; min-width: 0; }
.cco-svw-item-name {
  font-size: 14px; color: #2b251f; font-weight: 500;
}
.cco-svw-item-meta {
  font-size: 11px; color: rgba(80, 60, 40, 0.55);
  margin-top: 2px;
}
.cco-svw-item-buttons { display: flex; gap: 6px; }
.cco-svw-icon-button {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 0; background: transparent; cursor: pointer;
  color: rgba(80, 60, 40, 0.6);
  font-family: inherit; font-size: 14px;
  display: inline-flex; align-items: center; justify-content: center;
}
.cco-svw-icon-button:hover { background: rgba(80, 60, 40, 0.08); color: #2b251f; }
.cco-svw-icon-button.is-danger:hover { background: rgba(180, 50, 50, 0.10); color: #b03232; }
.cco-svw-empty {
  padding: 32px; text-align: center; color: rgba(80, 60, 40, 0.55);
  font-size: 14px;
}
[data-cco-theme="dark"] .cco-svw-dialog,
.is-dark .cco-svw-dialog,
html[data-theme="dark"] .cco-svw-dialog {
  background: #1f1b16; color: #f3ece2;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-svw-button,
.is-dark .cco-svw-button,
html[data-theme="dark"] .cco-svw-button {
  background: #2b251f; color: #f3ece2; border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-svw-button.is-primary,
.is-dark .cco-svw-button.is-primary,
html[data-theme="dark"] .cco-svw-button.is-primary {
  background: #f3ece2; color: #1f1b16;
}
`.trim();
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modalBackdrop) return;
    injectStyles();

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'cco-svw-backdrop';
    modalBackdrop.setAttribute('hidden', '');

    modalDialog = document.createElement('div');
    modalDialog.className = 'cco-svw-dialog';
    modalDialog.setAttribute('role', 'dialog');
    modalDialog.setAttribute('aria-modal', 'true');
    modalDialog.setAttribute('aria-label', 'Sparade vyer');
    modalDialog.innerHTML = `
      <div class="cco-svw-header">
        <div>
          <h3 class="cco-svw-title">Sparade vyer</h3>
          <div class="cco-svw-subtitle">Snabbtillgång till dina filter-kombinationer</div>
        </div>
        <button class="cco-svw-icon-button" type="button" data-svw-close aria-label="Stäng">×</button>
      </div>
      <div class="cco-svw-actions">
        <button class="cco-svw-button is-primary" type="button" data-svw-save>+ Spara aktuell vy</button>
      </div>
      <div class="cco-svw-list" data-svw-list></div>
      <div class="cco-svw-empty" data-svw-empty hidden>Inga sparade vyer ännu. Spara den aktuella vyn för att börja.</div>
    `;
    modalBackdrop.appendChild(modalDialog);
    document.body.appendChild(modalBackdrop);

    modalListEl = modalDialog.querySelector('[data-svw-list]');
    modalEmptyEl = modalDialog.querySelector('[data-svw-empty]');

    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) closeModal();
    });
    modalDialog.querySelector('[data-svw-close]').addEventListener('click', closeModal);
    modalDialog.querySelector('[data-svw-save]').addEventListener('click', () => {
      promptAndSave();
    });

    document.addEventListener('keydown', handleModalKeydown);
  }

  function handleModalKeydown(event) {
    if (!modalBackdrop || modalBackdrop.hasAttribute('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  }

  function renderList() {
    if (!modalListEl || !modalEmptyEl) return;
    const views = listViews();
    if (views.length === 0) {
      modalListEl.innerHTML = '';
      modalEmptyEl.hidden = false;
      return;
    }
    modalEmptyEl.hidden = true;
    let html = '';
    for (const view of views) {
      const meta = [view.laneLabel || view.laneId, formatRelativeTime(view.createdAt)]
        .filter(Boolean)
        .join(' · ');
      html += `
        <div class="cco-svw-item" data-svw-id="${escapeHtml(view.id)}">
          <div class="cco-svw-item-info">
            <div class="cco-svw-item-name">${escapeHtml(view.name)}</div>
            <div class="cco-svw-item-meta">${escapeHtml(meta)}</div>
          </div>
          <div class="cco-svw-item-buttons">
            <button class="cco-svw-icon-button" type="button" data-svw-apply="${escapeHtml(view.id)}" aria-label="Använd vy">↵</button>
            <button class="cco-svw-icon-button" type="button" data-svw-rename="${escapeHtml(view.id)}" aria-label="Byt namn">✎</button>
            <button class="cco-svw-icon-button is-danger" type="button" data-svw-delete="${escapeHtml(view.id)}" aria-label="Radera">🗑</button>
          </div>
        </div>
      `;
    }
    modalListEl.innerHTML = html;
    modalListEl.querySelectorAll('[data-svw-apply]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-svw-apply');
        const view = listViews().find((v) => v.id === id);
        if (view) {
          applyView(view);
          closeModal();
        }
      });
    });
    modalListEl.querySelectorAll('[data-svw-rename]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-svw-rename');
        const view = listViews().find((v) => v.id === id);
        if (!view) return;
        const next = window.prompt('Nytt namn för vyn:', view.name);
        if (next != null) {
          renameView(id, next);
          renderList();
        }
      });
    });
    modalListEl.querySelectorAll('[data-svw-delete]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-svw-delete');
        const view = listViews().find((v) => v.id === id);
        if (!view) return;
        if (window.confirm(`Radera vyn "${view.name}"?`)) {
          deleteView(id);
          renderList();
        }
      });
    });
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    const diffSec = Math.round((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'just nu';
    if (diffSec < 3600) return `${Math.round(diffSec / 60)} min sedan`;
    if (diffSec < 86400) return `${Math.round(diffSec / 3600)} h sedan`;
    if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)} d sedan`;
    return new Date(ts).toLocaleDateString('sv-SE');
  }

  function openModal() {
    ensureModal();
    renderList();
    modalBackdrop.removeAttribute('hidden');
  }

  function closeModal() {
    if (modalBackdrop) modalBackdrop.setAttribute('hidden', '');
  }

  function promptAndSave() {
    const captured = captureCurrentView();
    const suggestedName = captured.laneLabel
      ? `${captured.laneLabel} (${new Date().toLocaleDateString('sv-SE')})`
      : 'Min vy';
    const name = window.prompt('Namn på vyn:', suggestedName);
    if (name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed) return;
    const result = saveView(trimmed, captured);
    if (result && modalBackdrop && !modalBackdrop.hasAttribute('hidden')) {
      renderList();
    }
  }

  function isMacPlatform() {
    if (typeof navigator === 'undefined') return false;
    const platform = String(navigator.platform || '').toLowerCase();
    const ua = String(navigator.userAgent || '').toLowerCase();
    return /mac|iphone|ipad|ipod/.test(platform + ' ' + ua);
  }

  function bindGlobalShortcuts() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('keydown', (event) => {
      const isMac = isMacPlatform();
      const cmdLike = isMac ? event.metaKey : event.ctrlKey;
      if (!cmdLike || !event.shiftKey) return;
      // ⌘⇧S → spara aktuell vy
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        promptAndSave();
        return;
      }
      // ⌘⇧V → öppna lista
      if (event.key === 'v' || event.key === 'V') {
        event.preventDefault();
        openModal();
      }
    });
  }

  function mount() {
    bindGlobalShortcuts();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewSavedViews = Object.freeze({
      mount,
      saveView,
      saveCurrent: promptAndSave,
      applyView,
      listViews,
      deleteView,
      renameView,
      getViewCommands,
      onListChanged,
      openModal,
      closeModal,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
