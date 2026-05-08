/**
 * Major Arcana Preview — Smart Drafting Feedback-loop (Fas 4)
 *
 * Fångar diff mellan AI-genererat originalutkast och slutgiltigt skickad text
 * när användaren klickar "Skicka" i Svarsstudio. Skickar fire-and-forget POST
 * till /api/v1/capabilities/RecordDraftFeedback/run för analys + audit.
 *
 * Designprinciper:
 *   • Helt non-blocking — påverkar inte send-flödet
 *   • Subtle UI-bekräftelse ("Feedback registrerad") som visas ~2 sek
 *   • Fångar både via klick på Skicka-knappen och via tangentbordsgenväg
 *   • Lagrar senaste original-utkast lokalt så vi kan jämföra mot final
 */
(() => {
  'use strict';

  let lastOriginalDraft = '';
  let lastDraftCapturedAt = 0;
  let toastEl = null;
  let toastTimer = 0;

  function getStudioDraftElement() {
    return (
      document.querySelector('textarea[data-studio-draft]') ||
      document.querySelector('[data-studio-draft]') ||
      document.querySelector('textarea[name="draft"]') ||
      document.querySelector('.studio-draft-textarea')
    );
  }

  function getStudioDraftText() {
    const el = getStudioDraftElement();
    if (!el) return '';
    return (el.value || el.textContent || '').trim();
  }

  function getActiveThreadId() {
    const card =
      document.querySelector('[data-runtime-thread].thread-card-selected') ||
      document.querySelector('[data-runtime-thread][aria-pressed="true"]') ||
      document.querySelector('[data-runtime-thread].is-selected');
    return card ? card.getAttribute('data-runtime-thread') : '';
  }

  function getActiveTone() {
    const el =
      document.querySelector('[data-tone-key].is-active') ||
      document.querySelector('[data-tone-key][aria-pressed="true"]');
    return el ? el.getAttribute('data-tone-key') : '';
  }

  function getActiveTrack() {
    const el =
      document.querySelector('[data-track-key].is-active') ||
      document.querySelector('[data-track-key][aria-pressed="true"]');
    return el ? el.getAttribute('data-track-key') : '';
  }

  function getActiveSignature() {
    const el =
      document.querySelector('[data-signature-id].is-active') ||
      document.querySelector('[data-signature-id][aria-pressed="true"]');
    return el ? el.getAttribute('data-signature-id') : '';
  }

  /**
   * Fånga "originalutkast" — kallas när AI/Studio genererar/refresher draft.
   * Vi sparar texten i sessions-state så vi kan jämföra vid skicka.
   */
  function captureOriginalDraft(text) {
    const safe = String(text == null ? '' : text).trim();
    if (!safe) return;
    lastOriginalDraft = safe;
    lastDraftCapturedAt = Date.now();
  }

  /**
   * Auto-fånga: lyssna på input-event på draft-textarea.
   * Första gången användaren börjar skriva (eller AI fyller i), capture som original.
   * Re-capture om vi varit "tomma" en stund (>5 sek tidigare).
   */
  function bindDraftCapture() {
    const draftEl = getStudioDraftElement();
    if (!draftEl) return false;
    if (draftEl.__ccoDraftFeedbackBound) return true;
    draftEl.__ccoDraftFeedbackBound = true;
    draftEl.addEventListener('input', () => {
      const now = Date.now();
      const stale = now - lastDraftCapturedAt > 60000; // 60 sek
      const empty = !lastOriginalDraft;
      if (empty || stale) {
        captureOriginalDraft(draftEl.value || draftEl.textContent || '');
      }
    });
    return true;
  }

  function tryBindDraftCaptureRetry() {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(() => {
      attempts += 1;
      if (bindDraftCapture() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 250);
  }

  async function postFeedback({ originalDraft, editedDraft, conversationId, tone, track, writingIdentityId }) {
    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.sessionStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0] || '__preview_local__';
    const body = JSON.stringify({
      input: {
        conversationId,
        originalDraft,
        editedDraft,
        tone,
        track,
        writingIdentityId,
        sentAt: new Date().toISOString(),
      },
    });
    try {
      const response = await fetch('/api/v1/capabilities/RecordDraftFeedback/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(token && token !== '__preview_local__' ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch (_e) { payload = {}; }
      return { ok: response.ok, payload };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('CCO draft-feedback fel', error);
      return { ok: false, payload: null, error };
    }
  }

  function onSendIntercepted() {
    const editedDraft = getStudioDraftText();
    if (!editedDraft) return;
    const originalDraft = lastOriginalDraft || editedDraft;
    const conversationId = getActiveThreadId();
    const tone = getActiveTone();
    const track = getActiveTrack();
    const writingIdentityId = getActiveSignature();
    if (!conversationId) return;

    // Fire-and-forget — vi vill inte blockera send
    postFeedback({
      originalDraft,
      editedDraft,
      conversationId,
      tone,
      track,
      writingIdentityId,
    }).then((result) => {
      if (!result.ok) return;
      const data = result.payload?.output?.data || result.payload?.data || {};
      if (data.identicalDraft) {
        showToast('Utkast accepterat oförändrat — registrerat.');
      } else if (Array.isArray(data.learnings) && data.learnings.length > 0) {
        showToast('Feedback: ' + data.learnings[0]);
      } else {
        showToast('Feedback registrerad — bidrar till bättre utkast.');
      }
    });

    // Reset captured original så nästa draft är fresh
    lastOriginalDraft = '';
    lastDraftCapturedAt = 0;
  }

  function bindSendInterception() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        // Match alla send-knappar, var de än sitter
        const sendBtn = target.closest('[data-cco-action="send"], [data-runtime-send], [data-action="send"]');
        if (sendBtn) {
          // Fångar EFTER att existing handlers körts (deferred microtask)
          setTimeout(onSendIntercepted, 0);
          return;
        }
        // Annars: leta efter knappar med text "Skicka" som primary action
        if (target.tagName === 'BUTTON' || target.closest?.('button')) {
          const btn = target.tagName === 'BUTTON' ? target : target.closest('button');
          const txt = (btn?.textContent || '').trim().toLowerCase();
          if (txt === 'skicka' || txt.startsWith('skicka ')) {
            setTimeout(onSendIntercepted, 0);
          }
        }
      },
      true
    );
  }

  // ---------- Toast ----------
  function injectToastStyles() {
    if (document.getElementById('cco-feedback-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-feedback-styles';
    style.textContent = `
.cco-feedback-toast {
  position: fixed; bottom: 32px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  padding: 10px 16px; background: #2b251f; color: #fbf7f1;
  border-radius: 10px; font-family: inherit; font-size: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.30);
  opacity: 0; transition: opacity 0.18s ease, transform 0.18s ease;
  z-index: 10002; pointer-events: none;
  max-width: 480px; line-height: 1.4;
}
.cco-feedback-toast.is-visible {
  opacity: 1; transform: translateX(-50%) translateY(0);
}
.cco-feedback-toast::before {
  content: '✓ ';
  margin-right: 4px;
  color: #b8e6c8;
}
`.trim();
    document.head.appendChild(style);
  }

  function showToast(message) {
    injectToastStyles();
    if (toastEl) {
      try { toastEl.remove(); } catch (_e) {}
      toastEl = null;
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    toastEl = document.createElement('div');
    toastEl.className = 'cco-feedback-toast';
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    requestAnimationFrame(() => toastEl?.classList.add('is-visible'));
    toastTimer = window.setTimeout(() => {
      try { toastEl?.classList.remove('is-visible'); } catch (_e) {}
      window.setTimeout(() => {
        try { toastEl?.remove(); } catch (_e) {}
        toastEl = null;
      }, 200);
    }, 2400);
  }

  function mount() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        tryBindDraftCaptureRetry();
        bindSendInterception();
      }, { once: true });
    } else {
      tryBindDraftCaptureRetry();
      bindSendInterception();
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewDraftFeedback = Object.freeze({
      mount,
      captureOriginalDraft,
      onSendIntercepted,
      getLastOriginalDraft: () => lastOriginalDraft,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
