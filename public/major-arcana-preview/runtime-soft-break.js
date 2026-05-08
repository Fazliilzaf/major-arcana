/**
 * Major Arcana Preview — Soft-break Actions
 *
 * 3 åtgärder för att hantera avbrott i fokus-arbete:
 *   • Pausa fokus       — fryser aktuell tråd-status, sparar position
 *   • Byt ut fokus-tråd — ersätter aktuell tråd utan att förlora utkast
 *   • Avsluta fokus     — stänger fokuspanelen och rensar utkast
 *
 * Triggers:
 *   - Tangenten P (när inte i textfält)
 *   - Cmd+K → "Pausa/Byt/Avsluta fokus"
 *   - Modal med 3 knappar
 *
 * State sparas i sessionStorage så det överlever page-refresh men inte
 * stängd flik.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cco.softBreak.v1';

  let modalBackdrop = null;
  let modalDialog = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function getActiveThreadId() {
    const el =
      document.querySelector('[data-runtime-thread].thread-card-selected') ||
      document.querySelector('[data-runtime-thread][aria-pressed="true"]') ||
      document.querySelector('[data-runtime-thread].is-selected');
    return el ? el.getAttribute('data-runtime-thread') : '';
  }

  function getDraftSnapshot() {
    const draft = document.querySelector('[data-studio-draft], textarea[name="draft"], .studio-draft-textarea');
    return draft ? (draft.value || draft.textContent || '').trim() : '';
  }

  function pauseFocus() {
    const threadId = getActiveThreadId();
    const draft = getDraftSnapshot();
    const snapshot = {
      mode: 'paused',
      threadId,
      draft,
      pausedAt: new Date().toISOString(),
    };
    try {
      window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (_e) { /* tyst */ }
    showToast('Fokus pausat. Utkast och tråd är sparat. Du kan komma tillbaka senare.');
    closeModal();
  }

  function replaceFocus() {
    const draft = getDraftSnapshot();
    if (draft) {
      try {
        window.sessionStorage?.setItem(
          STORAGE_KEY,
          JSON.stringify({
            mode: 'replaced',
            threadId: getActiveThreadId(),
            draft,
            replacedAt: new Date().toISOString(),
          })
        );
      } catch (_e) { /* tyst */ }
    }
    // Avmarkera aktuell tråd så användaren kan välja annan
    const selected = document.querySelector('[data-runtime-thread].thread-card-selected');
    if (selected) {
      selected.classList.remove('thread-card-selected');
      selected.setAttribute('aria-pressed', 'false');
    }
    showToast('Fokus-tråd flyttad ur fokus. Välj en ny tråd i kön.');
    closeModal();
  }

  function endFocus() {
    try { window.sessionStorage?.removeItem(STORAGE_KEY); } catch (_e) { /* tyst */ }
    // Försök stänga studio + avmarkera tråd
    const closeStudioBtn = document.querySelector('[aria-label="Stäng Svarstudio"], [data-studio-close]');
    if (closeStudioBtn) closeStudioBtn.click();
    const selected = document.querySelector('[data-runtime-thread].thread-card-selected');
    if (selected) {
      selected.classList.remove('thread-card-selected');
      selected.setAttribute('aria-pressed', 'false');
    }
    showToast('Fokus avslutat.');
    closeModal();
  }

  function getPausedSnapshot() {
    try {
      const raw = window.sessionStorage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_e) {
      return null;
    }
  }

  function clearPausedSnapshot() {
    try { window.sessionStorage?.removeItem(STORAGE_KEY); } catch (_e) { /* tyst */ }
  }

  // ---------- Toast ----------
  let activeToast = null;
  let toastTimer = 0;
  function showToast(message) {
    if (activeToast) {
      try { activeToast.remove(); } catch (_e) {}
      activeToast = null;
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    activeToast = document.createElement('div');
    activeToast.className = 'cco-sbreak-toast';
    activeToast.textContent = message;
    document.body.appendChild(activeToast);
    requestAnimationFrame(() => activeToast?.classList.add('is-visible'));
    toastTimer = window.setTimeout(() => {
      try { activeToast?.classList.remove('is-visible'); } catch (_e) {}
      window.setTimeout(() => {
        try { activeToast?.remove(); } catch (_e) {}
        activeToast = null;
      }, 200);
    }, 2800);
  }

  // ---------- Styles ----------
  function injectStyles() {
    if (document.getElementById('cco-sbreak-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-sbreak-styles';
    style.textContent = `
.cco-sbreak-backdrop {
  position: fixed; inset: 0; z-index: 9994;
  background: rgba(20, 18, 16, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 14vh;
}
.cco-sbreak-backdrop[hidden] { display: none; }
.cco-sbreak-dialog {
  width: min(480px, 92vw);
  background: #fbf7f1;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.cco-sbreak-header {
  padding: 16px 20px; border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.cco-sbreak-title { font-size: 14px; font-weight: 600; color: #2b251f; margin: 0; }
.cco-sbreak-subtitle { font-size: 12px; color: rgba(80, 60, 40, 0.6); margin-top: 2px; }
.cco-sbreak-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.cco-sbreak-action {
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 12px 14px; border: 0; border-radius: 10px;
  background: #fff; color: #2b251f; cursor: pointer;
  font-family: inherit; text-align: left;
  border: 1px solid rgba(0, 0, 0, 0.07);
  transition: background 0.10s ease, border-color 0.10s ease;
}
.cco-sbreak-action:hover {
  background: rgba(80, 60, 40, 0.05);
  border-color: rgba(0, 0, 0, 0.12);
}
.cco-sbreak-action-title { font-size: 13px; font-weight: 600; }
.cco-sbreak-action-desc { font-size: 11px; color: rgba(80, 60, 40, 0.65); margin-top: 2px; }
.cco-sbreak-action.is-danger:hover {
  background: rgba(180, 50, 50, 0.07);
  border-color: rgba(180, 50, 50, 0.20);
}
.cco-sbreak-toast {
  position: fixed; bottom: 32px; left: 50%;
  transform: translateX(-50%) translateY(20px);
  padding: 12px 18px; background: #2b251f; color: #fbf7f1;
  border-radius: 10px; font-family: inherit; font-size: 13px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.30);
  opacity: 0; transition: opacity 0.18s ease, transform 0.18s ease;
  z-index: 10001; pointer-events: none;
  max-width: 480px;
}
.cco-sbreak-toast.is-visible {
  opacity: 1; transform: translateX(-50%) translateY(0);
}
[data-cco-theme="dark"] .cco-sbreak-dialog,
.is-dark .cco-sbreak-dialog,
html[data-theme="dark"] .cco-sbreak-dialog {
  background: #1f1b16; color: #f3ece2;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-sbreak-action,
.is-dark .cco-sbreak-action,
html[data-theme="dark"] .cco-sbreak-action {
  background: #2b251f; color: #f3ece2; border-color: rgba(255, 255, 255, 0.08);
}
`.trim();
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modalBackdrop) return;
    injectStyles();
    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'cco-sbreak-backdrop';
    modalBackdrop.setAttribute('hidden', '');

    modalDialog = document.createElement('div');
    modalDialog.className = 'cco-sbreak-dialog';
    modalDialog.setAttribute('role', 'dialog');
    modalDialog.setAttribute('aria-modal', 'true');
    modalDialog.setAttribute('aria-label', 'Hantera avbrott');
    modalDialog.innerHTML = `
      <div class="cco-sbreak-header">
        <h3 class="cco-sbreak-title">Hantera avbrott</h3>
        <div class="cco-sbreak-subtitle">Pausa, byt eller avsluta utan att förlora utkastet.</div>
      </div>
      <div class="cco-sbreak-body">
        <button class="cco-sbreak-action" type="button" data-sbreak-action="pause">
          <span class="cco-sbreak-action-title">⏸️  Pausa fokus</span>
          <span class="cco-sbreak-action-desc">Spara aktuell tråd och utkast — kom tillbaka senare.</span>
        </button>
        <button class="cco-sbreak-action" type="button" data-sbreak-action="replace">
          <span class="cco-sbreak-action-title">🔄  Byt ut fokus-tråd</span>
          <span class="cco-sbreak-action-desc">Lämna aktuell tråd, behåll utkastet i sessions-cache.</span>
        </button>
        <button class="cco-sbreak-action is-danger" type="button" data-sbreak-action="end">
          <span class="cco-sbreak-action-title">⏹  Avsluta fokus</span>
          <span class="cco-sbreak-action-desc">Stäng allt och rensa session-cache.</span>
        </button>
      </div>
    `;
    modalBackdrop.appendChild(modalDialog);
    document.body.appendChild(modalBackdrop);

    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) closeModal();
    });
    modalDialog.querySelector('[data-sbreak-action="pause"]').addEventListener('click', pauseFocus);
    modalDialog.querySelector('[data-sbreak-action="replace"]').addEventListener('click', replaceFocus);
    modalDialog.querySelector('[data-sbreak-action="end"]').addEventListener('click', endFocus);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modalBackdrop.hasAttribute('hidden')) {
        event.preventDefault();
        closeModal();
      }
    });
  }

  function openModal() {
    ensureModal();
    modalBackdrop.removeAttribute('hidden');
  }

  function closeModal() {
    if (modalBackdrop) modalBackdrop.setAttribute('hidden', '');
  }

  // ---------- Tangentbordsgenväg P ----------
  function bindShortcut() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tag = (target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      // Hoppa om någon annan overlay redan är öppen
      const otherOverlay = document.querySelector('.cco-cmdk-backdrop:not([hidden]), .cco-svw-backdrop:not([hidden]), .cco-usearch-backdrop:not([hidden]), .cco-tsum-backdrop:not([hidden]), .cco-shortcuts-backdrop:not([hidden])');
      if (otherOverlay) return;
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        openModal();
      }
    });
  }

  function mount() {
    bindShortcut();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewSoftBreak = Object.freeze({
      mount,
      openModal,
      closeModal,
      pauseFocus,
      replaceFocus,
      endFocus,
      getPausedSnapshot,
      clearPausedSnapshot,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
