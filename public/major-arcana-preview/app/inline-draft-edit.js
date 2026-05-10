/**
 * app/inline-draft-edit.js — AI-utkast inline-edit i thread-card.
 *
 * Tråd-kort som har en AI-draft visar normalt bara preview. Med denna feature:
 *   - Hover/klick på preview-text → expanderar till editable textarea
 *   - "Skicka"-knapp + "Spara utkast"-knapp + "Avbryt"
 *   - Esc avbryter, Cmd+Enter skickar
 *
 * Hooks in via befintlig data-quick-action="studio" → istället för att öppna
 * studio-overlay, expandera inline-editor om utkast finns.
 *
 * Stöds bara för demo-cards just nu (vi har FIXTURES med subject + preview).
 * För riktig data: behöver state.runtime-thread → studio.draftBody-koppling.
 */
(() => {
  'use strict';

  let activeCard = null; // vilket card som har inline-editor öppen
  let activeTextarea = null;
  let activeOriginalPreview = null;

  function getCardThreadId(card) {
    return card?.dataset?.runtimeThread || null;
  }

  function findPreviewIn(card) {
    return card?.querySelector('.warm-preview') || null;
  }

  function getInitialDraftText(card) {
    // Försök hämta från state.studio om matchande threadId
    try {
      const id = getCardThreadId(card);
      const state = window.__App?.state || (typeof state !== 'undefined' ? state : null);
      if (state?.forms?.studioThreadId === id && state?.forms?.studioDraftBody) {
        return String(state.forms.studioDraftBody);
      }
      if (state?.studio?.threadId === id && state?.studio?.draftBody) {
        return String(state.studio.draftBody);
      }
    } catch (_e) {}
    // Fallback: använd preview som start-utkast
    return (findPreviewIn(card)?.textContent || '').trim();
  }

  function openInlineEditor(card) {
    if (activeCard) closeInlineEditor(false);
    if (!card) return;
    activeCard = card;
    const preview = findPreviewIn(card);
    if (!preview) return;

    activeOriginalPreview = preview.outerHTML;

    // Bygg editor-block som ersätter preview
    const editor = document.createElement('div');
    editor.className = 'inline-draft-editor';
    editor.dataset.inlineDraftEditor = '1';
    editor.innerHTML = `
      <div class="inline-draft-header">
        <span class="inline-draft-label">AI-utkast</span>
        <span class="inline-draft-hint">Cmd+Enter skickar · Esc avbryter</span>
      </div>
      <textarea class="inline-draft-textarea" rows="6" spellcheck="true"></textarea>
      <div class="inline-draft-actions">
        <button type="button" class="inline-draft-btn inline-draft-btn-ghost" data-inline-draft-action="cancel">Avbryt</button>
        <button type="button" class="inline-draft-btn" data-inline-draft-action="save">Spara utkast</button>
        <button type="button" class="inline-draft-btn inline-draft-btn-primary" data-inline-draft-action="send">Skicka</button>
      </div>
    `;
    preview.replaceWith(editor);
    activeTextarea = editor.querySelector('textarea');
    activeTextarea.value = getInitialDraftText(card);
    requestAnimationFrame(() => {
      activeTextarea.focus();
      activeTextarea.setSelectionRange(activeTextarea.value.length, activeTextarea.value.length);
    });

    editor.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-inline-draft-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.inlineDraftAction;
      if (action === 'cancel') closeInlineEditor(false);
      else if (action === 'save') saveDraft();
      else if (action === 'send') sendDraft();
    });

    activeTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeInlineEditor(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        sendDraft();
      }
    });
  }

  function closeInlineEditor(applyChanges) {
    if (!activeCard) return;
    const editor = activeCard.querySelector('[data-inline-draft-editor]');
    if (editor && activeOriginalPreview) {
      // Återställ preview-elementet
      const tmp = document.createElement('div');
      tmp.innerHTML = activeOriginalPreview;
      const newPreview = tmp.firstChild;
      if (applyChanges && activeTextarea && newPreview) {
        // Uppdatera preview-text till första raden av utkastet
        const draft = activeTextarea.value.trim();
        const firstLine = draft.split(/\r?\n/)[0].slice(0, 200);
        newPreview.textContent = firstLine || newPreview.textContent;
      }
      if (newPreview) editor.replaceWith(newPreview);
    }
    activeCard = null;
    activeTextarea = null;
    activeOriginalPreview = null;
  }

  function saveDraft() {
    if (!activeCard || !activeTextarea) return;
    const id = getCardThreadId(activeCard);
    const draft = activeTextarea.value;
    // Försök skriva till state.forms.studioDraftBody (om threadId matchar)
    try {
      const state = window.__App?.state || (typeof state !== 'undefined' ? state : null);
      if (state?.forms) {
        state.forms.studioDraftBody = draft;
        state.forms.studioThreadId = id;
      }
    } catch (_e) {}
    if (typeof console !== 'undefined')
      console.log(`[inline-draft] sparade utkast för ${id} (${draft.length} tecken)`);
    closeInlineEditor(true);
  }

  function sendDraft() {
    if (!activeCard || !activeTextarea) return;
    const id = getCardThreadId(activeCard);
    const draft = activeTextarea.value.trim();
    if (!draft) {
      // Tomt utkast — bara stäng
      closeInlineEditor(false);
      return;
    }
    // I demo-mode finns ingen riktig send-pipeline.
    // Vi öppnar studio-overlay med draft för att låta användaren slutföra.
    // Triggrar primary-action på cardet.
    try {
      const state = window.__App?.state || (typeof state !== 'undefined' ? state : null);
      if (state?.forms) {
        state.forms.studioDraftBody = draft;
        state.forms.studioThreadId = id;
      }
    } catch (_e) {}
    const primaryBtn = activeCard.querySelector('.primary-action, [data-quick-action="studio"]');
    closeInlineEditor(true);
    if (primaryBtn) {
      // Defer en frame så DOM-restoreren färdigställs
      requestAnimationFrame(() => primaryBtn.click());
    }
  }

  // ============================================================
  // Click-handler — toggla editor när preview klickas
  // ============================================================

  document.addEventListener(
    'click',
    (e) => {
      // Skippa om klick på actions/buttons
      if (e.target.closest('button, [role="button"], [data-quick-action], a, input, label')) {
        return;
      }
      // Skippa om klick inuti den aktiva editorn (vi har egna handlers där)
      if (e.target.closest('[data-inline-draft-editor]')) return;

      const preview = e.target.closest('.warm-preview');
      if (!preview) return;
      const card = preview.closest('.thread-card[data-runtime-thread]');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      openInlineEditor(card);
    },
    true
  );

  // Stäng editor om man klickar utanför kortet
  document.addEventListener('click', (e) => {
    if (!activeCard) return;
    if (e.target.closest('[data-inline-draft-editor]')) return;
    if (e.target.closest('.thread-card') === activeCard) return;
    closeInlineEditor(false);
  });

  // Exponera för debug
  window.__InlineDraftEdit = Object.freeze({
    open: openInlineEditor,
    close: () => closeInlineEditor(false),
    isActive: () => !!activeCard,
  });
})();
