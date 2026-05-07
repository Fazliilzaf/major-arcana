/* cco-polish.js
 *
 * Tidigare: SVG-emoji-replacement på .cco-card-badge-sentiment/.cco-card-badge-intent.
 * Borttaget i Fas 2 cleanup (2026-05-08) — warm-row-markup använder inline SVG i
 * .warm-why istället, så badges renderas inte längre som DOM-element.
 *
 * Kvar: auto-stäng-meny-skydd vid sidladdning (2-sekunders fönster).
 */

/* ============================================================
   Stäng automatiskt öppna dropdowns under sidladdning.
   Strategi: under första 2 sekunderna efter load — om någon dropdown
   öppnas utan användarinteraktion, stäng den. Efter 2s räknas alla
   öppningar som avsiktliga (klick) och inget stängs.
   ============================================================ */
(function preventAutoOpenMenus() {
  'use strict';

  let userHasInteracted = false;
  let suppressUntil = 0;

  function markInteraction() {
    userHasInteracted = true;
  }
  // Spåra äkta användarinteraktion
  document.addEventListener('click', markInteraction, true);
  document.addEventListener('keydown', markInteraction, true);
  document.addEventListener('touchstart', markInteraction, true);

  function forceClose() {
    // Mailbox-toggle
    document.querySelectorAll('input[type="checkbox"][id*="menu-toggle"]:checked').forEach((c) => {
      c.checked = false;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Preview-more-menu — stäng via app.js inline-styles
    document.querySelectorAll('.preview-more-menu').forEach((m) => {
      m.setAttribute('hidden', '');
      m.setAttribute('aria-hidden', 'true');
      m.style.display = 'none';
      m.style.visibility = 'hidden';
      m.style.opacity = '0';
      m.style.pointerEvents = 'none';
    });
    document.querySelectorAll('.preview-more [aria-expanded="true"]').forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
    });
  }

  function init() {
    // Stäng allt direkt
    forceClose();
    suppressUntil = Date.now() + 2000;

    // MutationObserver: om någon dropdown blir öppen UTAN att användaren
    // klickat, stäng den igen. Skydd-fönstret är 2s från load.
    const obs = new MutationObserver((muts) => {
      if (userHasInteracted) {
        obs.disconnect();
        return;
      }
      if (Date.now() > suppressUntil) {
        obs.disconnect();
        return;
      }
      let needsClose = false;
      for (const m of muts) {
        const t = m.target;
        if (!t || !t.matches) continue;
        if (t.matches('.preview-more-menu, #mailbox-menu-toggle, .preview-more')) {
          needsClose = true;
          break;
        }
        if (t.matches('input[type="checkbox"][id*="menu-toggle"]') && t.checked) {
          needsClose = true;
          break;
        }
      }
      if (needsClose) forceClose();
    });
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'aria-expanded', 'style', 'checked'],
      subtree: true,
    });

    // Säkerhetsintervaller — kör forceClose flera gånger under skydd-fönstret
    setTimeout(() => { if (!userHasInteracted) forceClose(); }, 100);
    setTimeout(() => { if (!userHasInteracted) forceClose(); }, 400);
    setTimeout(() => { if (!userHasInteracted) forceClose(); }, 900);
    setTimeout(() => { if (!userHasInteracted) forceClose(); }, 1600);

    // Efter 2s: släpp greppet och rensa inline-styles så användaren kan öppna
    setTimeout(() => {
      obs.disconnect();
      document.querySelectorAll('.preview-more-menu').forEach((m) => {
        // Bara rensa om aria-hidden fortfarande är true (annars rör vi inget)
        if (m.getAttribute('aria-hidden') === 'true') {
          // Behåll stängd state, men ta bort de inline styles vi satte så app.js
          // kan kontrollera display senare när användaren klickar.
          m.style.removeProperty('display');
          m.style.removeProperty('visibility');
          m.style.removeProperty('opacity');
          m.style.removeProperty('pointer-events');
        }
      });
    }, 2100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
