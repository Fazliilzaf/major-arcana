'use strict';

/**
 * cco-subnav.js — CCO-agentens interna undernav i /admin#cco.
 *
 * Byter CCO-workspace-iframens (#ccoPreviewEmbedFrame) `src` mellan de sex CCO-
 * sektionerna, så allt CCO-arbete klickas fram under /admin#cco:
 *   Konversationer · Kunder · Kalender · Automatisering · Analys · Mer
 *
 * Återbruk: pekar bara på sidor som redan finns (konversationer.html, SPA-vyer,
 * kalender.html). Bygger inget nytt per sektion.
 *
 * Rör INTE admin-hashen (#cco) — sektionsvalet minns via sessionStorage, så
 * admin.js:s sektions-routing och ensureCcoPreviewEmbed() lämnas orörda. När
 * en knapp klickas sätts både frame.src OCH frame.dataset.src, så att ett senare
 * teardown→ensure (vid återinträde i CCO) laddar samma sektion igen.
 */

(function initCcoSubnav() {
  var STORE_KEY = 'arcana.cco.subsection';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    var frame = document.getElementById('ccoPreviewEmbedFrame');
    var nav = document.querySelector('[data-cco-subnav]');
    if (!frame || !nav) return;

    // Konversationer behåller sidans ursprungliga (build-stämplade) data-src.
    var konversationerSrc =
      String(frame.getAttribute('data-src') || '').trim() || '/konversationer.html';

    // Fas 1 — endast de tre bekräftade sektionerna är wired. Kunder laddas med
    // samma flaggor som arbets-URL:en (v9/demo/demoOpDay/v11rail/v12workspace) så
    // den data-fyllda vyn visas, plus embed=admin som döljer SPA:ts egen topbar
    // (.is-admin-embed .preview-topbar{display:none}) så CCO-undernaven inte
    // dubbleras. Kalender använder kalender.html:s egen ?embed=1. Konversationer
    // behåller sin ursprungliga (build-stämplade) data-src.
    //
    // Automatisering/Analys/Mer är inaktiverade platshållare i markup:en tills
    // deras riktiga arbets-URL:er bekräftats — de finns inte här, så activate()
    // ignorerar dem även om de skulle klickas.
    var SPA_FLAGS = 'v9=on&demo=on&demoOpDay=1&embed=admin';
    var SECTIONS = {
      konversationer: konversationerSrc,
      kunder: '/major-arcana-preview/?view=customers&' + SPA_FLAGS + '&v11rail=on&v12workspace=on',
      kalender: '/kalender.html?embed=1',
    };

    function setActiveButton(key) {
      var buttons = nav.querySelectorAll('[data-cco-section]');
      for (var i = 0; i < buttons.length; i += 1) {
        var isActive = buttons[i].getAttribute('data-cco-section') === key;
        buttons[i].classList.toggle('is-active', isActive);
        buttons[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    }

    function activate(key, opts) {
      var url = SECTIONS[key];
      if (!url) return;
      var loadNow = !opts || opts.loadNow !== false;
      // data-src styr admin.js:s (åter)inladdning; håll den i synk med valet.
      frame.setAttribute('data-src', url);
      // Vid explicit klick (loadNow): ladda direkt. Initialt (loadNow:false):
      // rör inte src — låt admin.js:s ensureCcoPreviewEmbed() lazy-ladda data-src
      // när CCO-sektionen öppnas.
      if (loadNow) {
        frame.setAttribute('src', url);
      }
      setActiveButton(key);
      try {
        sessionStorage.setItem(STORE_KEY, key);
      } catch (e) {
        /* private mode */
      }
    }

    nav.addEventListener('click', function (event) {
      var btn =
        event.target && event.target.closest ? event.target.closest('[data-cco-section]') : null;
      if (!btn || !nav.contains(btn)) return;
      event.preventDefault();
      activate(btn.getAttribute('data-cco-section'), { loadNow: true });
    });

    // Initialt val: senast använda sektion (annars Konversationer = default).
    var initial = 'konversationer';
    try {
      var saved = sessionStorage.getItem(STORE_KEY);
      if (saved && SECTIONS[saved]) initial = saved;
    } catch (e) {
      /* ignore */
    }
    // Sätt data-src + aktiv-knapp UTAN att tvinga en laddning (about:blank tills
    // CCO öppnas), så admin.js:s lazy-load-flöde behålls.
    activate(initial, { loadNow: false });
  });
})();
