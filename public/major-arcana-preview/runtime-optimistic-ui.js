/**
 * Major Arcana Preview — Optimistic UI för actions (P3 Prestanda & UX).
 *
 * Visar resultatet av "Markera klar / Radera / Snooze / Skicka" omedelbart i
 * UI utan att vänta på servern. Om servern returnerar fel rollback:as ändringen
 * och en toast visar felet.
 *
 * Strategi:
 *   • Intercepta klick på action-knappar BEFORE existing handlers kör
 *   • Spara DOM-snapshot för rollback (klassnamn, attribut, position)
 *   • Applicera optimistisk visuell ändring (fade out / strike-through / move)
 *   • Lyssna på fetch-response från existing send-pipeline
 *   • Om OK: behåll ändringen
 *   • Om fail: rollback + toast
 *
 * Eftersom existing handlers redan POST:ar via apiRequest, kan vi inte enkelt
 * intercepta deras response. Istället wrappar vi window.fetch tillfälligt
 * och korrelerar via URL-pattern.
 */
(() => {
  'use strict';

  const ACTION_PATTERNS = Object.freeze({
    handled: { urls: ['/api/v1/cco/handled', '/api/v1/capabilities/CcoConversationAction/run'], optimistic: 'fade-and-mark' },
    delete: { urls: ['/api/v1/cco/delete'], optimistic: 'fade-and-remove' },
    snooze: { urls: ['/api/v1/cco/reply-later'], optimistic: 'fade-and-move-to-later' },
    send: { urls: ['/api/v1/cco/send'], optimistic: 'pulse-success' },
  });

  let activeOperations = new Map(); // operationId → { card, snapshot, action, timeout }
  let nextOperationId = 1;
  let toastEl = null;
  let toastTimer = 0;
  let fetchWrapped = false;

  function injectStyles() {
    if (document.getElementById('cco-optimistic-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-optimistic-styles';
    style.textContent = `
[data-cco-optimistic="pending"] {
  opacity: 0.55;
  transition: opacity 0.18s ease, transform 0.20s ease, height 0.30s ease, margin 0.30s ease, padding 0.30s ease;
  pointer-events: none;
}
[data-cco-optimistic="pending-handled"] {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: rgba(40, 130, 90, 0.5);
}
[data-cco-optimistic="rollback"] {
  animation: cco-optimistic-shake 0.32s ease-in-out;
  outline: 2px solid rgba(180, 50, 50, 0.5);
  outline-offset: -1px;
}
[data-cco-optimistic="success-pulse"] {
  animation: cco-optimistic-pulse 0.45s ease-out;
}
@keyframes cco-optimistic-pulse {
  0% { box-shadow: 0 0 0 0 rgba(40, 130, 90, 0.4); }
  100% { box-shadow: 0 0 0 14px rgba(40, 130, 90, 0); }
}
@keyframes cco-optimistic-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  50% { transform: translateX(4px); }
  75% { transform: translateX(-3px); }
}
.cco-optimistic-toast {
  position: fixed; bottom: 32px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  padding: 10px 18px; border-radius: 10px;
  font-family: inherit; font-size: 12px;
  background: #2b251f; color: #fbf7f1;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32);
  opacity: 0; transition: opacity 0.18s ease, transform 0.18s ease;
  z-index: 10003; pointer-events: none;
  max-width: 480px; line-height: 1.4;
}
.cco-optimistic-toast.is-visible {
  opacity: 1; transform: translateX(-50%) translateY(0);
}
.cco-optimistic-toast.is-error {
  background: #8a2828; color: #fbf7f1;
}
.cco-optimistic-toast.is-error::before {
  content: '⚠ ';
  margin-right: 4px;
}
.cco-optimistic-toast.is-success::before {
  content: '✓ ';
  margin-right: 4px;
  color: #b8e6c8;
}
`.trim();
    document.head.appendChild(style);
  }

  function showToast(message, { kind = 'success' } = {}) {
    injectStyles();
    if (toastEl) {
      try { toastEl.remove(); } catch (_e) {}
      toastEl = null;
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    toastEl = document.createElement('div');
    toastEl.className = `cco-optimistic-toast is-${kind}`;
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    requestAnimationFrame(() => toastEl?.classList.add('is-visible'));
    toastTimer = window.setTimeout(() => {
      try { toastEl?.classList.remove('is-visible'); } catch (_e) {}
      window.setTimeout(() => {
        try { toastEl?.remove(); } catch (_e) {}
        toastEl = null;
      }, 200);
    }, 2800);
  }

  function findCardForButton(button) {
    if (!button || typeof button.closest !== 'function') return null;
    return button.closest('[data-runtime-thread]');
  }

  function applyOptimisticVisual(card, kind) {
    if (!card) return null;
    const snapshot = {
      opacity: card.style.opacity,
      attr: card.getAttribute('data-cco-optimistic'),
      classes: card.className,
    };
    if (kind === 'fade-and-mark') {
      card.setAttribute('data-cco-optimistic', 'pending-handled');
    } else if (kind === 'fade-and-remove') {
      card.setAttribute('data-cco-optimistic', 'pending');
    } else if (kind === 'fade-and-move-to-later') {
      card.setAttribute('data-cco-optimistic', 'pending');
    } else if (kind === 'pulse-success') {
      card.setAttribute('data-cco-optimistic', 'success-pulse');
    }
    return snapshot;
  }

  function rollbackVisual(card, snapshot) {
    if (!card || !snapshot) return;
    card.setAttribute('data-cco-optimistic', 'rollback');
    setTimeout(() => {
      try {
        if (snapshot.attr === null || snapshot.attr === undefined) {
          card.removeAttribute('data-cco-optimistic');
        } else {
          card.setAttribute('data-cco-optimistic', snapshot.attr);
        }
        card.style.opacity = snapshot.opacity || '';
      } catch (_e) {}
    }, 360);
  }

  function detectActionFromButton(button) {
    if (!button || !button.getAttribute) return null;
    const cco = button.getAttribute('data-cco-action');
    if (cco) {
      if (cco === 'handled' || cco === 'mark-handled') return 'handled';
      if (cco === 'delete') return 'delete';
      if (cco === 'reply-later' || cco === 'snooze' || cco === 'later') return 'snooze';
      if (cco === 'send') return 'send';
    }
    const action = button.getAttribute('data-action');
    if (action === 'handled' || action === 'mark-handled') return 'handled';
    if (action === 'delete') return 'delete';
    if (action === 'reply-later' || action === 'snooze') return 'snooze';
    if (action === 'send') return 'send';
    const txt = (button.textContent || '').trim().toLowerCase();
    if (txt === 'markera klar' || txt.startsWith('markera klar')) return 'handled';
    if (txt === 'radera' || txt === 'radera vald tråd') return 'delete';
    if (txt === 'svara senare' || txt === 'senare') return 'snooze';
    if (txt === 'skicka') return 'send';
    return null;
  }

  function bindClickInterception() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const button = target.tagName === 'BUTTON' ? target : target.closest('button');
        if (!button) return;
        const action = detectActionFromButton(button);
        if (!action) return;
        const card = findCardForButton(button);
        // För 'send' har vi inget card — visa bara success-pulse på send-knappen
        if (action === 'send') {
          const op = registerOperation({
            action,
            card: button,
            snapshot: applyOptimisticVisual(button, 'pulse-success'),
          });
          // Auto-rensa pulse efter 600ms
          setTimeout(() => {
            try { button.removeAttribute('data-cco-optimistic'); } catch (_e) {}
          }, 600);
          return;
        }
        if (!card) return;
        const kind = ACTION_PATTERNS[action]?.optimistic || 'pending';
        const snapshot = applyOptimisticVisual(card, kind);
        registerOperation({ action, card, snapshot });
      },
      true
    );
  }

  function registerOperation({ action, card, snapshot }) {
    const id = nextOperationId++;
    const op = {
      id,
      action,
      card,
      snapshot,
      startedAt: Date.now(),
      timeout: null,
    };
    activeOperations.set(id, op);
    // Auto-cleanup om vi inte hör tillbaka inom 12 sek (anta success för
    // existing pipeline som inte exponerar response)
    op.timeout = setTimeout(() => {
      finalizeOperation(id, { success: true, silent: true });
    }, 12000);
    return op;
  }

  function finalizeOperation(id, { success = true, errorMessage = '', silent = false } = {}) {
    const op = activeOperations.get(id);
    if (!op) return;
    activeOperations.delete(id);
    if (op.timeout) clearTimeout(op.timeout);
    if (success) {
      // Behåll visuell ändring — DOM-mutationen från riktiga API-svaret
      // kommer ersätta kortet ändå
      if (!silent) {
        if (op.action === 'handled') showToast('Markerad som klar.');
        else if (op.action === 'delete') showToast('Tråd raderad.');
        else if (op.action === 'snooze') showToast('Återkommer senare.');
        else if (op.action === 'send') showToast('Mejl skickat.');
      }
    } else {
      rollbackVisual(op.card, op.snapshot);
      showToast(errorMessage || 'Något gick fel — försök igen.', { kind: 'error' });
    }
  }

  // --- Fetch-wrapping för att korrelera responses till operations ---
  function wrapFetch() {
    if (fetchWrapped) return;
    if (typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch.bind(window);
    fetchWrapped = true;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const matchedAction = matchUrlToAction(url);
      let response;
      try {
        response = await originalFetch(input, init);
      } catch (error) {
        if (matchedAction) {
          // Hitta den nyaste operationen med matchande action och rollback
          rollbackOldestPendingByAction(matchedAction, error?.message || 'Nätverksfel');
        }
        throw error;
      }
      if (matchedAction) {
        try {
          const cloned = response.clone();
          const text = await cloned.text();
          let payload = null;
          try { payload = text ? JSON.parse(text) : null; } catch (_e) { payload = null; }
          const ok =
            response.ok &&
            (!payload ||
              payload.error == null ||
              payload.decision !== 'block');
          if (ok) {
            confirmOldestPendingByAction(matchedAction);
          } else {
            const errorMsg =
              payload?.error ||
              payload?.metadata?.reason ||
              `HTTP ${response.status}`;
            rollbackOldestPendingByAction(matchedAction, errorMsg);
          }
        } catch (_e) { /* tyst — vi har redan ett response att returnera */ }
      }
      return response;
    };
  }

  function matchUrlToAction(url) {
    const safe = String(url || '');
    for (const [action, pattern] of Object.entries(ACTION_PATTERNS)) {
      for (const u of pattern.urls) {
        if (safe.includes(u)) return action;
      }
    }
    return null;
  }

  function confirmOldestPendingByAction(action) {
    let oldest = null;
    for (const op of activeOperations.values()) {
      if (op.action !== action) continue;
      if (!oldest || op.startedAt < oldest.startedAt) oldest = op;
    }
    if (oldest) finalizeOperation(oldest.id, { success: true });
  }

  function rollbackOldestPendingByAction(action, errorMessage) {
    let oldest = null;
    for (const op of activeOperations.values()) {
      if (op.action !== action) continue;
      if (!oldest || op.startedAt < oldest.startedAt) oldest = op;
    }
    if (oldest) finalizeOperation(oldest.id, { success: false, errorMessage });
  }

  function mount() {
    injectStyles();
    bindClickInterception();
    wrapFetch();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewOptimisticUI = Object.freeze({
      mount,
      showToast,
      _state: () => ({ activeOperations: activeOperations.size, fetchWrapped }),
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
