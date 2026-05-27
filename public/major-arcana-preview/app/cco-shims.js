/**
 * app/cco-shims.js — slutgiltiga shims efter Fas 27C state-konsolidering.
 *
 *  - P0-3: Logout-knapp + Cmd+Shift+L kortkommando
 *  - P1-A: Theme-switcher delegerad click-handler
 *  - P2-1: Status-labels + undefined-sanering (port från audit-r11)
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
  // P2-1: Status-labels + undefined-sanering (audit-r11)
  // ============================================================

  const STATUS_LABEL_MAP = {
    needs_reply: 'Behöver svar',
    needs_action: 'Behöver åtgärd',
    needs_review: 'Behöver granskning',
    in_progress: 'Pågår',
    in_review: 'Under granskning',
    ready_to_book: 'Redo att boka',
    ready_now: 'Redo att boka',
    low_confidence: 'Låg konfidens',
    high_confidence: 'Hög konfidens',
    waiting: 'Väntar',
    waiting_reply: 'Väntar på svar',
    waiting_customer: 'Väntar på kund',
    awaiting_customer: 'Väntar på kund',
    awaiting_owner: 'Behöver åtgärd',
    awaiting_confirmation: 'Väntar på bekräftelse',
    closed: 'Stängd',
    resolved: 'Löst',
    done: 'Klar',
    paused: 'Pausad',
    snoozed: 'Senare',
    escalated: 'Eskalerad',
    open: 'Öppen',
    reopened: 'Återöppnad',
    pending: 'Väntar',
    scheduled: 'Schemalagd',
    booked: 'Bokad',
    cancelled: 'Avbokad',
    no_show: 'Uteblev',
    response_needed: 'Svar krävs',
    follow_up_pending: 'Återbesök väntar',
    booking_ready: 'Redo att boka',
    blocked_medical: 'Medicinsk kontroll',
    not_relevant: 'Ej relevant',
    active_dialogue: 'Aktiv dialog',
  };

  const STATUS_LABEL_TITLECASE = {};
  for (const [key, label] of Object.entries(STATUS_LABEL_MAP)) {
    const titleCased = key
      .split(/[_-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    STATUS_LABEL_TITLECASE[titleCased] = label;
  }

  function translateStatusText(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    if (STATUS_LABEL_MAP[lower]) return STATUS_LABEL_MAP[lower];
    if (STATUS_LABEL_TITLECASE[trimmed]) return STATUS_LABEL_TITLECASE[trimmed];
    return null;
  }

  function sanitizeUndefinedText(value) {
    let updated = value;
    updated = updated.replace(/\bundefined\s*·\s*undefined\b/gi, '—');
    updated = updated.replace(/\bundefined\s*·/gi, '— ·');
    updated = updated.replace(/·\s*undefined\b/gi, '· —');
    updated = updated.replace(/^undefined$/gi, '—');
    return updated;
  }

  function fixStatusLabelsInRoot(root) {
    const target = root || document.body;
    if (!target) return;
    const candidates = target.querySelectorAll(
      '[class*="status"], [data-status], [class*="tag"], [class*="badge"], [class*="chip"], [class*="pill"]'
    );
    candidates.forEach((el) => {
      if (el.children.length > 0) {
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          const translated = translateStatusText(node.nodeValue);
          if (translated && translated !== node.nodeValue.trim()) {
            node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), translated);
          }
        }
        return;
      }
      const translated = translateStatusText(el.textContent);
      if (translated && translated !== el.textContent.trim()) {
        el.textContent = translated;
      }
    });
  }

  function aggressiveStatusAndUndefinedFix() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const txt = (node.nodeValue || '').trim();
        if (!txt) return NodeFilter.FILTER_REJECT;
        if (STATUS_LABEL_MAP[txt.toLowerCase()]) return NodeFilter.FILTER_ACCEPT;
        if (STATUS_LABEL_TITLECASE[txt]) return NodeFilter.FILTER_ACCEPT;
        if (/\bundefined\b/i.test(txt)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    nodes.forEach((textNode) => {
      const original = textNode.nodeValue;
      let updated = original;
      const trimmed = updated.trim();
      const lower = trimmed.toLowerCase();
      if (STATUS_LABEL_MAP[lower]) {
        updated = updated.replace(trimmed, STATUS_LABEL_MAP[lower]);
      } else if (STATUS_LABEL_TITLECASE[trimmed]) {
        updated = updated.replace(trimmed, STATUS_LABEL_TITLECASE[trimmed]);
      }
      updated = sanitizeUndefinedText(updated);
      if (updated !== original) {
        textNode.nodeValue = updated;
      }
    });
  }

  function bootstrapStatusPresentationFix() {
    fixStatusLabelsInRoot();
    aggressiveStatusAndUndefinedFix();
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        fixStatusLabelsInRoot();
        aggressiveStatusAndUndefinedFix();
        debounceTimer = null;
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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
    try {
      bootstrapStatusPresentationFix();
    } catch (e) {
      console.warn('[cco-shims] status-presentation fel:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
