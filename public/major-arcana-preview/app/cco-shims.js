/**
 * app/cco-shims.js — slutgiltiga shims efter Fas 27C state-konsolidering.
 *
 * Endast två shims kvar efter konsolidering (2026-05-18):
 *  - P0-3: Logout-knapp + Cmd+Shift+L kortkommando
 *  - P1-A: Theme-switcher delegerad click-handler
 *
 * RIVET 2026-05-18 (Fas 27C): P0-1 Mailbox-val persistens.
 * Tidigare läste denna shim cco.selectedMailboxIds.v1 från localStorage
 * och försökte applicera state via syntetiska cb.click() på dolda
 * checkboxar inuti mailbox-admin-shellen — det triggade render-loopar
 * som fick dropdownen att poppa upp ofrivilligt direkt efter login.
 *
 * Nu äger workspaceSourceOfTruth.setSelectedMailboxIds() persistensen
 * direkt: skriver till samma localStorage-key utan UI-side-effects.
 * loadPersistedMailboxIds() i runtime-workspace-state.js läser vid init.
 */
(() => {
  'use strict';

  // ============================================================
  // P0-3: Logout-knapp i Mer-meny
  // ============================================================

  function logout() {
    try {
      localStorage.removeItem('ARCANA_ADMIN_TOKEN');
      localStorage.removeItem('cco.selectedMailboxIds.v1');
    } catch (_e) {}
    // Fas 46: rensa IndexedDB-thread-cachen vid logout så nästa användare
    // inte ser föregående kontos cachade inbox.
    try {
      if (window.CcoThreadCache && window.CcoThreadCache.clearThreads) {
        window.CcoThreadCache.clearThreads();
      }
    } catch (_e) {}
    window.location.href = '/';
  }

  function bootstrapLogout() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target && e.target.closest && e.target.closest('[data-shim-logout]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Logga ut? Token rensas och du måste logga in igen.')) {
          logout();
        }
      },
      true
    );
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (confirm('Logga ut? (Cmd+Shift+L)')) logout();
      }
    });
  }

  // ============================================================
  // P1-A: Theme-switcher
  // ============================================================

  function bootstrapThemeSwitcher() {
    document.addEventListener(
      'click',
      (e) => {
        const btn =
          e.target &&
          e.target.closest &&
          e.target.closest(
            '.preview-utility-button[aria-label*="läge"], ' +
              'button[aria-label="Ljusläge"], ' +
              'button[aria-label="Mörkläge"], ' +
              'button[aria-label="Mörkt läge"]'
          );
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (window.MajorArcanaPreviewTheme?.toggleTheme) {
          const next = window.MajorArcanaPreviewTheme.toggleTheme();
          const labels = { light: 'Mörkläge', dark: 'Systemläge', system: 'Ljusläge' };
          btn.setAttribute('aria-label', labels[next] || 'Tema');
        } else {
          const cur = document.documentElement.getAttribute('data-theme') || 'system';
          const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
          document.documentElement.setAttribute('data-theme', next);
          try {
            localStorage.setItem('cco.theme', next);
          } catch (_e) {}
        }
      },
      true
    );
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  function init() {
    try {
      bootstrapLogout();
    } catch (e) {
      console.warn('[cco-shims] logout fel:', e);
    }
    try {
      bootstrapThemeSwitcher();
    } catch (e) {
      console.warn('[cco-shims] theme-switcher fel:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
