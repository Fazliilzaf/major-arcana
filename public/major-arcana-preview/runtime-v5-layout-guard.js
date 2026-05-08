/**
 * runtime-v5-layout-guard.js
 *
 * Sista försvarslinjen för v5-kortlayouten.
 *
 * Detta script:
 *   1) Säkerställer att varje .thread-card.unified-queue-card har
 *      barnen i kanonisk v5-ordning:
 *         priority-bar  →  card-strip  →  card-body  →  card-footer
 *   2) Tvingar inline grid-layout via element.style (vinner över *all* CSS).
 *   3) Plockar bort eventuella legacy v3-element (`.mailbox-trail`,
 *      lösa `.chip` direkt på .thread-card o.s.v.) som annars skulle
 *      störa både ordning och vertikal höjd.
 *   4) Sätter `data-v5-guard="r1"` på fixade kort så vi kan verifiera
 *      från DevTools att guarden faktiskt körts.
 *
 * Designmål: körs sent (efter alla render-paths), idempotent, och
 * lyssnar på MutationObserver så även sent injicerade kort hamnar rätt.
 */

(function v5LayoutGuard() {
  "use strict";

  if (typeof document === "undefined") return;

  var GUARD_VERSION = "r1";
  var STYLE_ARTICLE =
    "display:grid !important;" +
    "grid-template-columns:12px 1fr !important;" +
    "grid-template-rows:auto auto auto !important;" +
    "grid-template-areas:'rail strip' 'rail body' 'rail footer' !important;" +
    "position:relative !important;" +
    "height:auto !important;" +
    "min-height:0 !important;" +
    "max-height:none !important;" +
    "padding:0 !important;" +
    "overflow:visible !important;";
  var STYLE_RAIL =
    "grid-area:rail !important;" +
    "grid-row:1 / 4 !important;" +
    "grid-column:1 !important;" +
    "order:0 !important;" +
    "width:5px !important;" +
    "height:100% !important;" +
    "align-self:stretch !important;" +
    "border-radius:14px 0 0 14px !important;";
  var STYLE_STRIP =
    "grid-area:strip !important;" +
    "grid-row:1 !important;" +
    "grid-column:2 !important;" +
    "order:1 !important;" +
    "display:flex !important;" +
    "flex-direction:row !important;" +
    "align-items:center !important;" +
    "justify-content:space-between !important;" +
    "gap:10px !important;" +
    "padding:12px 16px 4px !important;";
  var STYLE_BODY =
    "grid-area:body !important;" +
    "grid-row:2 !important;" +
    "grid-column:2 !important;" +
    "order:2 !important;" +
    "display:grid !important;" +
    "grid-template-columns:42px 1fr !important;" +
    "align-items:flex-start !important;" +
    "gap:14px !important;" +
    "padding:6px 16px 12px !important;";
  var STYLE_FOOTER =
    "grid-area:footer !important;" +
    "grid-row:3 !important;" +
    "grid-column:2 !important;" +
    "order:3 !important;" +
    "display:flex !important;" +
    "flex-wrap:wrap !important;" +
    "align-items:center !important;" +
    "gap:14px !important;" +
    "padding:10px 16px 12px !important;";

  /**
   * Sätt en hel `style="..."` mall via cssText – men *behåll* andra
   * inline-stilar genom att merge:a (vi tar våra värden över).
   */
  function applyStyle(el, cssText) {
    if (!el || !el.style) return;
    var existing = el.getAttribute("style") || "";
    // Filtrera bort egenskaper vi själva sätter, så vi inte dubblerar
    var props = ["display","grid-area","grid-row","grid-column","grid-template-columns","grid-template-rows","grid-template-areas","order","position","height","min-height","max-height","padding","overflow","width","align-self","border-radius","flex-direction","flex-wrap","align-items","justify-content","gap"];
    var preserved = existing.split(";").map(function(part){
      return part.trim();
    }).filter(function(part){
      if (!part) return false;
      var key = part.split(":")[0].trim().toLowerCase();
      return props.indexOf(key) === -1;
    }).join(";");
    el.setAttribute("style", (preserved ? preserved + ";" : "") + cssText);
  }

  function ensureChildInOrder(parent, child) {
    if (!parent || !child) return;
    if (parent.lastElementChild !== child) {
      parent.appendChild(child);
    }
  }

  function fixCard(card) {
    if (!card || card.__v5GuardApplied === GUARD_VERSION) return;

    // Plocka ut sektionerna (om de finns)
    var rail = card.querySelector(":scope > .priority-bar");
    var strip = card.querySelector(":scope > .card-strip");
    var body = card.querySelector(":scope > .card-body");
    var footer = card.querySelector(":scope > .card-footer");

    // Om strip/body/footer saknas, hoppa — det kanske inte är ett v5-kort
    if (!strip && !body && !footer) {
      // Markera så vi inte loopar i onödan
      card.__v5GuardApplied = GUARD_VERSION;
      return;
    }

    // Säkerställ rail
    if (!rail) {
      rail = document.createElement("div");
      rail.className = "priority-bar";
      rail.setAttribute("aria-hidden", "true");
      card.insertBefore(rail, card.firstChild);
    }

    // Plocka bort kända legacy-element som saboterar layouten
    var legacyTrail = card.querySelector(":scope > .mailbox-trail");
    if (legacyTrail && legacyTrail.parentNode === card) {
      legacyTrail.parentNode.removeChild(legacyTrail);
    }

    // Sätt inline-stil med högsta prio
    applyStyle(card, STYLE_ARTICLE);
    if (rail) applyStyle(rail, STYLE_RAIL);
    if (strip) applyStyle(strip, STYLE_STRIP);
    if (body) applyStyle(body, STYLE_BODY);
    if (footer) applyStyle(footer, STYLE_FOOTER);

    // Tvinga DOM-ordning: rail, strip, body, footer
    // (Använd appendChild i ordning för att flytta noder utan klon-bug.)
    if (rail) ensureChildInOrder(card, rail);
    if (strip) ensureChildInOrder(card, strip);
    if (body) ensureChildInOrder(card, body);
    if (footer) ensureChildInOrder(card, footer);

    // Markörer
    card.setAttribute("data-v5-guard", GUARD_VERSION);
    card.__v5GuardApplied = GUARD_VERSION;
  }

  function scanRoot(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    var cards = root.querySelectorAll(".thread-card.unified-queue-card");
    for (var i = 0; i < cards.length; i++) {
      // Återställ markör om data-lane bytts → kortet är ny-renderat
      if (cards[i].__v5GuardApplied === GUARD_VERSION && cards[i].lastElementChild) {
        // Snabb sanity check: är ordningen redan rätt?
        var last = cards[i].lastElementChild;
        if (last && last.classList && last.classList.contains("card-footer")) {
          continue; // ordning ok
        }
        // annars — kör om
        cards[i].__v5GuardApplied = null;
      }
      fixCard(cards[i]);
    }
  }

  function runFullScan() {
    scanRoot(document);
  }

  // Initial scan: så snart DOM är klar
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runFullScan, { once: true });
  } else {
    runFullScan();
  }

  // Re-scan vid varje render-cykel (debounced via rAF)
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || function (cb) { setTimeout(cb, 16); })(function () {
      pending = false;
      runFullScan();
    });
  }

  // MutationObserver: bevaka tråd-listan
  if (typeof MutationObserver === "function") {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) {
          schedule();
          return;
        }
        if (m.type === "attributes") {
          schedule();
          return;
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-queue-list-mode", "data-lane", "class"],
    });
  }

  // Periodisk fallback (extra trygghet ifall MO missar)
  setInterval(runFullScan, 2000);

  // Exponera diagnostik
  try {
    window.__ccoV5LayoutGuard = {
      version: GUARD_VERSION,
      runFullScan: runFullScan,
      fixCard: fixCard,
      info: function () {
        var cards = document.querySelectorAll(".thread-card.unified-queue-card");
        var fixed = document.querySelectorAll(".thread-card.unified-queue-card[data-v5-guard]");
        return {
          version: GUARD_VERSION,
          totalCards: cards.length,
          guardedCards: fixed.length,
          orderingOk: Array.prototype.every.call(cards, function (c) {
            var last = c.lastElementChild;
            return last && last.classList && last.classList.contains("card-footer");
          }),
        };
      },
    };
  } catch (_e) {
    /* no-op */
  }
})();
