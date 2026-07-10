'use strict';

/**
 * cco-subnav.js — det kanoniska CCO-skalets router i /admin#cco.
 *
 * Byter CCO-workspace-iframens (#ccoPreviewEmbedFrame) `src` mellan de sex CCO-
 * sektionerna, så allt CCO-arbete klickas fram under /admin#cco:
 *   Konversationer · Kunder · Kalender · Automatisering · Analys · Mer ▾
 *
 * Skalet äger bara navigationen. Varje mål fortsätter använda sin befintliga
 * sida, data och actions i samma iframe. Mål som har egen global navigation
 * laddas med embed-flagga så att bara detta skal syns.
 *
 * "Mer" är en dropdown över v3-verktygen (Integrationer/Makron/Inställningar/
 * Notiser/Signaturer/Revisor/Showcase).
 *
 * Rör INTE admin-hashen (#cco). Valet minns via sessionStorage och hålls
 * atomiskt med både aktiv flik, frame.src och frame.dataset.src. Det gör att
 * admin.js:s lazy-load samt ett senare teardown→ensure alltid återöppnar samma
 * faktiska sektion som navigationen visar.
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
    var workspace =
      (nav.closest && nav.closest('#ccoWorkspaceSection')) ||
      document.getElementById('ccoWorkspaceSection');
    var pendingKey = '';

    // Konversationer behåller sidans build-stämplade data-src och använder
    // embed=admin för att inte rita en andra global navrad inne i iframen.
    var konversationerSrc =
      String(frame.getAttribute('data-src') || '').trim() || '/konversationer.html';

    // Kunder: SPA-customers med arbets-flaggorna (v9/demo/demoOpDay/v11rail/
    // v12workspace) + embed=admin (döljer SPA:ts egen topbar så undernaven inte
    // dubbleras). Kalender: kalender.html?embed=1. Automatisering/Analys: v3-
    // mockup-familjen (samma design som Kunder-v9, gjord samtidigt).
    var SPA_FLAGS = 'v9=on&demo=on&demoOpDay=1&embed=admin';
    var PREVIEW = '/major-arcana-preview/';
    var SECTIONS = {
      konversationer: konversationerSrc,
      kunder: PREVIEW + '?view=customers&' + SPA_FLAGS + '&v11rail=on&v12workspace=on',
      kalender: '/kalender.html?embed=1',
      automatisering: PREVIEW + 'cco-automatisering-v3.html',
      analys: PREVIEW + 'cco-analytics-v3.html',
    };

    // "Mer"-dropdownens verktyg (v3-familjen).
    var MORE_TOOLS = {
      integrationer: PREVIEW + 'cco-integrationer-v3.html',
      makron: PREVIEW + 'cco-makron-v3.html',
      installningar: PREVIEW + 'cco-installningar-v3-2.html',
      notiser: PREVIEW + 'cco-notiser-v3.html',
      signaturer: PREVIEW + 'cco-signaturer-v3.html',
      revisor: PREVIEW + 'cco-revisor-v3.html',
      showcase: PREVIEW + 'cco-showcase-v3.html',
    };

    var moreToggle = nav.querySelector('[data-cco-more-toggle]');
    var moreMenu = nav.querySelector('[data-cco-more-menu]');
    var SECTION_LABELS = {
      konversationer: 'Konversationer',
      kunder: 'Kunder',
      kalender: 'Kalender',
      automatisering: 'Automatisering',
      analys: 'Analys',
      integrationer: 'Integrationer',
      makron: 'Makron',
      installningar: 'Inställningar',
      notiser: 'Notiser',
      signaturer: 'Signaturer',
      revisor: 'Revisor',
      showcase: 'Showcase',
    };

    function urlFor(key) {
      if (SECTIONS[key]) return SECTIONS[key];
      if (key && key.indexOf('mer:') === 0) {
        var tool = key.slice(4);
        if (MORE_TOOLS[tool]) return MORE_TOOLS[tool];
      }
      return '';
    }

    function absoluteUrl(value) {
      var raw = String(value || '').trim();
      if (!raw || raw === 'about:blank') return raw;
      try {
        return new URL(raw, window.location.href).href;
      } catch (e) {
        return raw;
      }
    }

    function sameUrl(left, right) {
      return absoluteUrl(left) === absoluteUrl(right);
    }

    function keyForUrl(value) {
      var raw = String(value || '').trim();
      if (!raw || raw === 'about:blank') return '';
      var parsed;
      try {
        parsed = new URL(raw, window.location.href);
      } catch (e) {
        return '';
      }

      var path = parsed.pathname.replace(/\/+$/, '') || '/';
      if (path.endsWith('/konversationer.html')) return 'konversationer';
      if (path.endsWith('/kalender.html')) return 'kalender';
      if (
        (path === '/major-arcana-preview' || path === '/major-arcana-preview/index.html') &&
        parsed.searchParams.get('view') === 'customers'
      ) {
        return 'kunder';
      }
      if (path.endsWith('/cco-automatisering-v3.html')) return 'automatisering';
      if (path.endsWith('/cco-analytics-v3.html')) return 'analys';

      var toolKeys = Object.keys(MORE_TOOLS);
      for (var i = 0; i < toolKeys.length; i += 1) {
        if (sameUrl(parsed.href, MORE_TOOLS[toolKeys[i]])) return 'mer:' + toolKeys[i];
      }
      return '';
    }

    function currentFrameUrl() {
      try {
        var liveUrl = String(frame.contentWindow && frame.contentWindow.location.href).trim();
        if (liveUrl && liveUrl !== 'about:blank') return liveUrl;
      } catch (e) {
        /* same-origin targets are expected; fall back during navigation */
      }
      return String(frame.getAttribute('src') || '').trim();
    }

    function setActiveButton(key) {
      var isMore = key && key.indexOf('mer:') === 0;
      var buttons = nav.querySelectorAll('[data-cco-section]');
      for (var i = 0; i < buttons.length; i += 1) {
        var isActive = !isMore && buttons[i].getAttribute('data-cco-section') === key;
        buttons[i].classList.toggle('is-active', isActive);
        buttons[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
      if (moreToggle) {
        moreToggle.classList.toggle('is-active', Boolean(isMore));
        moreToggle.setAttribute('aria-selected', isMore ? 'true' : 'false');
      }
    }

    function syncRouteState(key) {
      var url = urlFor(key);
      if (!url) return;
      var labelKey = key && key.indexOf('mer:') === 0 ? key.slice(4) : key;
      frame.setAttribute('data-src', url);
      frame.setAttribute(
        'aria-label',
        'HairTP Clinic CCO — ' + (SECTION_LABELS[labelKey] || 'CCO')
      );
      nav.setAttribute('data-active-section', key);
      if (workspace) workspace.setAttribute('data-cco-active-section', key);
      setActiveButton(key);
      try {
        sessionStorage.setItem(STORE_KEY, key);
      } catch (e) {
        /* private mode */
      }
    }

    function navigateFrame(key) {
      var url = urlFor(key);
      if (!url) return;
      var attrKey = keyForUrl(frame.getAttribute('src'));
      var liveKey = keyForUrl(currentFrameUrl());
      if (attrKey === key && (!liveKey || liveKey === key)) {
        pendingKey = '';
        return;
      }
      pendingKey = key;
      frame.setAttribute('src', url);
    }

    function activate(key, opts) {
      var url = urlFor(key);
      if (!url) return;
      var loadNow = !opts || opts.loadNow !== false;
      var currentSrc = String(frame.getAttribute('src') || '').trim();
      var frameAlreadyStarted = Boolean(currentSrc && currentSrc !== 'about:blank');

      syncRouteState(key);
      // Om admin.js redan hann starta default-vyn måste även initial restore
      // korrigera den faktiska iframen. Är den fortfarande blank lämnas själva
      // laddningen till admin.js, som då läser det nyss synkade data-src-värdet.
      if (loadNow || frameAlreadyStarted) navigateFrame(key);
    }

    function closeMore() {
      if (moreMenu) moreMenu.hidden = true;
      if (moreToggle) moreToggle.setAttribute('aria-expanded', 'false');
    }
    function toggleMore() {
      if (!moreMenu) return;
      var open = moreMenu.hidden;
      moreMenu.hidden = !open;
      if (moreToggle) moreToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    nav.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var moreItem = target.closest('[data-cco-more]');
      if (moreItem && nav.contains(moreItem)) {
        event.preventDefault();
        activate('mer:' + moreItem.getAttribute('data-cco-more'), { loadNow: true });
        closeMore();
        return;
      }
      if (moreToggle && target.closest('[data-cco-more-toggle]')) {
        event.preventDefault();
        toggleMore();
        return;
      }
      var btn = target.closest('[data-cco-section]');
      if (btn && nav.contains(btn)) {
        event.preventDefault();
        activate(btn.getAttribute('data-cco-section'), { loadNow: true });
        closeMore();
      }
    });

    // Stäng dropdown vid klick utanför.
    document.addEventListener('click', function (event) {
      if (!moreMenu || moreMenu.hidden) return;
      var wrap =
        event.target && event.target.closest ? event.target.closest('[data-cco-more-wrap]') : null;
      if (!wrap) closeMore();
    });

    frame.addEventListener('load', function () {
      var loadedKey = keyForUrl(currentFrameUrl());
      if (!loadedKey) return;

      if (pendingKey) {
        if (loadedKey === pendingKey) {
          var completedKey = pendingKey;
          pendingKey = '';
          syncRouteState(completedKey);
          return;
        }
        // Ett avslutat gammalt request får aldrig skriva över ett nyare klick.
        if (keyForUrl(frame.getAttribute('src')) === pendingKey) return;
        navigateFrame(pendingKey);
        return;
      }

      // Om iframen navigeras på annat sätt ska flikmarkeringen följa den sida
      // användaren faktiskt ser, inte ett gammalt sessionStorage-värde.
      syncRouteState(loadedKey);
    });

    // Initialt val: senast använda sektion (annars Konversationer = default).
    var initial = 'konversationer';
    try {
      var saved = sessionStorage.getItem(STORE_KEY);
      if (saved && urlFor(saved)) initial = saved;
    } catch (e) {
      /* ignore */
    }
    // Är iframen blank sätts bara data-src. Har admin.js redan laddat default-
    // vyn korrigerar activate även src, så flik och innehåll aldrig divergerar.
    activate(initial, { loadNow: false });
  });
})();
