/* v3-row-rebuild.js — aktivt sätter v3-rad-layout på thread-cards
 *
 * App.js sätter inline grid-template med !important på varje thread-card.
 * Vi kan inte slå det med CSS eftersom inline+!important alltid vinner.
 * Lösning: vi sätter VÅR EGEN inline grid-template (med v3-rad-layout) som
 * ersätter appens. MutationObserver triggar omsättning om appen skriver tillbaka.
 *
 * För att undvika "blink" mellan layouter: dölj listan tills första rebuild är klar.
 */
(function () {
  'use strict';

  if (!document.documentElement.classList.contains('v3-skin-active')) return;

  let rebuilding = false;

  function rebuildCard(card) {
    // Dela upp grid-template i tre separata properties — säkrare via JS setProperty
    // än shorthand med string-syntax
    card.style.removeProperty('grid-template');
    card.style.setProperty('grid-template-areas', '"rail body strip"', 'important');
    card.style.setProperty('grid-template-columns', '4px 1fr auto', 'important');
    card.style.setProperty('grid-template-rows', 'auto', 'important');
    card.style.setProperty('display', 'grid', 'important');
    card.style.setProperty('column-gap', '10px', 'important');
    card.style.setProperty('row-gap', '0', 'important');
    card.style.setProperty('align-items', 'center', 'important');
    card.style.setProperty('padding', '8px 14px 8px 6px', 'important');
    card.style.setProperty('height', 'auto', 'important');
    card.style.setProperty('min-height', '0', 'important');
    card.style.setProperty('position', 'relative', 'important');

    // Children: säkerställ rätt grid-area
    const pri = card.querySelector('.priority-bar');
    if (pri) {
      pri.style.setProperty('grid-area', 'rail', 'important');
      pri.style.setProperty('grid-row', 'auto', 'important');
      pri.style.setProperty('grid-column', 'auto', 'important');
    }
    const body = card.querySelector('.card-body');
    if (body) {
      body.style.setProperty('grid-area', 'body', 'important');
      body.style.setProperty('grid-row', 'auto', 'important');
      body.style.setProperty('grid-column', 'auto', 'important');
      body.style.setProperty('display', 'flex', 'important');
      body.style.setProperty('flex-direction', 'row', 'important');
      body.style.setProperty('align-items', 'center', 'important');
      body.style.setProperty('gap', '10px', 'important');
      body.style.setProperty('padding', '0', 'important');
      body.style.setProperty('min-width', '0', 'important');
    }
    const avatar = card.querySelector('.card-body .avatar-wrap');
    if (avatar) {
      avatar.style.setProperty('width', '28px', 'important');
      avatar.style.setProperty('height', '28px', 'important');
      avatar.style.setProperty('flex', '0 0 auto', 'important');
      avatar.style.setProperty('transform', 'none', 'important');
      avatar.style.setProperty('margin', '0', 'important');
    }
    const strip = card.querySelector('.card-strip');
    if (strip) {
      strip.style.setProperty('grid-area', 'strip', 'important');
      strip.style.setProperty('grid-row', 'auto', 'important');
      strip.style.setProperty('grid-column', 'auto', 'important');
      strip.style.setProperty('display', 'flex', 'important');
      strip.style.setProperty('flex-direction', 'row', 'important');
      strip.style.setProperty('align-items', 'center', 'important');
      strip.style.setProperty('justify-self', 'end', 'important');
      strip.style.setProperty('padding', '0', 'important');
      strip.style.setProperty('gap', '6px', 'important');
    }
    const footer = card.querySelector('.card-footer');
    if (footer) {
      // Footer hidden — visas på hover som absolut-positionerad overlay via CSS
      footer.style.setProperty('display', 'none', 'important');
    }
    // Card-content (inom body) ska vara flex-row med name + signal-what inline
    const content = card.querySelector('.card-body .card-content');
    if (content) {
      content.style.setProperty('display', 'flex', 'important');
      content.style.setProperty('flex-direction', 'row', 'important');
      content.style.setProperty('align-items', 'baseline', 'important');
      content.style.setProperty('gap', '8px', 'important');
      content.style.setProperty('min-width', '0', 'important');
      content.style.setProperty('overflow', 'hidden', 'important');
    }
  }

  function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    try {
      document.querySelectorAll('.queue-history-list .thread-card').forEach(rebuildCard);
      // Markera "ready" så CSS kan fade-in
      if (!document.documentElement.classList.contains('v3-row-ready')) {
        document.documentElement.classList.add('v3-row-ready');
      }
    } finally {
      // Debounce med RAF — släpp flag efter en frame så observer kan trigga igen om appen skriver tillbaka
      requestAnimationFrame(function () {
        rebuilding = false;
      });
    }
  }

  function watchList(list) {
    if (window.__v3RowObs) window.__v3RowObs.disconnect();
    rebuild();
    const obs = new MutationObserver(function (muts) {
      if (rebuilding) return;
      let needs = false;
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          const t = m.target;
          if (t.classList && t.classList.contains('thread-card')) {
            // Kolla om vår grid-areas fortfarande är där
            const ga = t.style.gridTemplateAreas || t.style.gridTemplate || '';
            if (!ga.includes('rail body strip')) {
              needs = true;
              break;
            }
          }
          // Eller om barn har förlorat sin grid-area
          if (t.classList && (t.classList.contains('priority-bar') || t.classList.contains('card-body') || t.classList.contains('card-strip'))) {
            needs = true;
            break;
          }
        } else if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (n.classList && n.classList.contains('thread-card') || (n.querySelector && n.querySelector('.thread-card')))) {
              needs = true;
              break;
            }
          }
        }
        if (needs) break;
      }
      if (needs) rebuild();
    });
    obs.observe(list, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
    window.__v3RowObs = obs;
  }

  function tryAttach() {
    const list = document.querySelector('.queue-history-list');
    if (list) {
      watchList(list);
      return true;
    }
    return false;
  }

  // Försök direkt; annars polla tills listan dyker upp
  if (!tryAttach()) {
    let attempts = 0;
    const interval = setInterval(function () {
      attempts++;
      if (tryAttach() || attempts >= 30) clearInterval(interval);
    }, 300);
  }

  // Re-applicera periodiskt som säkerhetsnät (SSE/polling renderar nya cards)
  setInterval(rebuild, 3000);
})();
