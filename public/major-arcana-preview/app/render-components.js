/**
 * app/render-components.js — Steg 4 av app.js modulrefactor.
 *
 * Pure component-renderers — leaf-funktioner utan delad state. Tar ett state-
 * objekt som parameter och muterar DOM idempotent. Inget annat.
 *
 * Inga beroenden utöver native DOM-API. Säker att extrahera utan att röra
 * state-Proxy / scheduleRender / renderApp som stannar i app.js.
 *
 * Exporter (via window.__AppRenderComponents):
 *  - renderFloatingShell(shell, isOpen)  — generisk helper
 *  - renderMailboxAdmin(state)
 *  - renderConfirmDialog(state)
 *  - renderCustomerMergeShell(state)
 *  - renderCustomerSettings(state)
 *  - renderMacroModal(state)
 *  - renderSettingsProfileModal(state)
 *  - renderNoteModeShell(state)
 *  - renderMoreMenu(state)
 */
(() => {
  'use strict';

  // Idempotent DOM-mutation för "floating shell"-modaler.
  // Synlighet + transform driven av CSS via [data-open] (cco-polish.css).
  // JS sätter bara aria-hidden + data-open — inga inline-styles.
  function renderFloatingShell(shell, isOpen) {
    if (!shell) return;
    const ariaHidden = isOpen ? 'false' : 'true';
    if (shell.getAttribute('aria-hidden') !== ariaHidden) {
      shell.setAttribute('aria-hidden', ariaHidden);
    }
    const hasOpen = shell.hasAttribute('data-open');
    if (isOpen && !hasOpen) shell.setAttribute('data-open', '');
    else if (!isOpen && hasOpen) shell.removeAttribute('data-open');
  }

  function renderMailboxAdmin(state) {
    const shell = document.getElementById('mailbox-admin-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.mailboxAdminOpen === true);
  }

  function renderConfirmDialog(state) {
    const shell = document.getElementById('shell-confirm-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.confirmDialogOpen === true);
  }

  // Notera: namn renamed från renderCustomerMergeModal eftersom det fanns en
  // andra funktion med samma namn (renderar modal-innehåll) som overrode
  // denna i hoisting. Denna sköter bara open/close-visibility via shell.
  function renderCustomerMergeShell(state) {
    const shell = document.getElementById('customers-merge-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.customerMergeModalOpen === true);
  }

  function renderCustomerSettings(state) {
    const shell = document.getElementById('customers-settings-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.customerSettingsOpen === true);
  }

  function renderMacroModal(state) {
    const shell = document.getElementById('macro-editor-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.macroModalOpen === true);
  }

  function renderSettingsProfileModal(state) {
    const shell = document.getElementById('settings-profile-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.settingsProfileModalOpen === true);
  }

  function renderNoteModeShell(state) {
    const shell = document.getElementById('note-mode-shell');
    if (!shell) return;
    renderFloatingShell(shell, state.ui.noteModeOpen === true);
  }

  function renderMoreMenu(state) {
    const wrapper = document.querySelector('.preview-more');
    const menu = document.getElementById('preview-more-menu');
    const toggle = document.querySelector('[data-more-toggle]');
    if (!wrapper) return;
    const isOpen = state.ui.moreMenuOpen === true;
    // CSS driver synlighet via [data-open]-attributet på wrappern.
    // JS sätter bara attribut — inga inline-styles, inga 6 redundanta props.
    const hasOpen = wrapper.hasAttribute('data-open');
    if (isOpen && !hasOpen) wrapper.setAttribute('data-open', '');
    else if (!isOpen && hasOpen) wrapper.removeAttribute('data-open');
    if (menu) {
      // Synka [hidden] + aria-hidden för screen readers + tab-flow.
      if (menu.hidden !== !isOpen) menu.hidden = !isOpen;
      const ariaHidden = isOpen ? 'false' : 'true';
      if (menu.getAttribute('aria-hidden') !== ariaHidden) {
        menu.setAttribute('aria-hidden', ariaHidden);
      }
    }
    if (toggle) {
      const ariaExpanded = isOpen ? 'true' : 'false';
      if (toggle.getAttribute('aria-expanded') !== ariaExpanded) {
        toggle.setAttribute('aria-expanded', ariaExpanded);
      }
    }
  }

  // Exponera till app.js
  window.__AppRenderComponents = Object.freeze({
    renderFloatingShell,
    renderMailboxAdmin,
    renderConfirmDialog,
    renderCustomerMergeShell,
    renderCustomerSettings,
    renderMacroModal,
    renderSettingsProfileModal,
    renderNoteModeShell,
    renderMoreMenu,
  });
})();
