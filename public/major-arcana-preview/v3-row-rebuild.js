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

  // Vår grid-template: 1 rad med rail | body | strip
  const V3_GRID_TEMPLATE = '"rail body strip" / 4px 1fr auto';

  let rebuilding = false;

  function rebuildCard(card) {
    // SÄTT vår grid-template istället för att bara ta bort appens
    card.style.setProperty('grid-template', V3_GRID_TEMPLATE, 'important');
    card.style.setProperty('grid-template-rows', 'auto', 'important');
    card.style.setProperty('display', 'grid', 'important');
    card.style.setProperty('height', 'auto', 'important');
    card.style.setProperty('min-height', '0', 'important');

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
    }
    const strip = card.querySelector('.card-strip');
    if (strip) {
      strip.style.setProperty('grid-area', 'strip', 'important');
      strip.style.setProperty('grid-row', 'auto', 'important');
      strip.style.setProperty('grid-column', 'auto', 'important');
    }
    const footer = card.querySelector('.card-footer');
    if (footer) {
      // Footer hidden by default i CSS, men sätt grid-area så den blir hidden via overlay vid hover
      footer.style.setProperty('grid-area', 'unset', 'important');
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
            // Kolla om vår grid-template fortfarande är där
            const gt = t.style.gridTemplate || '';
            if (!gt.includes('"rail body strip"')) {
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
