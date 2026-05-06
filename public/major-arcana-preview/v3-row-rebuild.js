/* v3-row-rebuild.js
 * Tar bort app.js's inline grid-template på thread-cards när html.v3-skin-active.
 * Det låter v3-bubble-skin.css definiera 1-rad-layout fritt.
 * MutationObserver håller layout stabil mot app.js re-renders.
 */
(function () {
  'use strict';

  if (!document.documentElement.classList.contains('v3-skin-active')) return;

  let rebuilding = false;

  function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    try {
      document.querySelectorAll('.queue-history-list .thread-card').forEach(card => {
        ['grid-template', 'grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'height', 'min-height', 'display'].forEach(p => card.style.removeProperty(p));
        card.querySelectorAll('.priority-bar, .card-strip, .card-body, .card-content, .card-footer').forEach(el => {
          ['grid-area', 'grid-row', 'grid-column', 'order', 'display'].forEach(p => el.style.removeProperty(p));
        });
      });
    } finally {
      requestAnimationFrame(() => { rebuilding = false; });
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
          if (t.classList && t.classList.contains('thread-card') && t.style.gridTemplate) { needs = true; break; }
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
    obs.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
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
    }, 500);
  }

  // Re-applicera när nya cards laddas (SSE/polling)
  setInterval(rebuild, 5000);
})();
