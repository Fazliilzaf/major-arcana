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

    // Konversationer behåller sin build-stämplade URL separat från den aktiva
    // standardrouten. embed=admin behåller status/sök men tar bort dublettnav.
    var konversationerSrc =
      String(frame.getAttribute('data-conversations-src') || '').trim() ||
      '/konversationer.html?embed=admin';

    // Kunder använder den kanoniska staff-routen. demo=off rensar tidigare
    // sticky UAT-state; admin-embed-kontraktet hårdlåser SPA:n till customer content.
    // Kalender och övriga segment behåller sina redan byggda målunderlag.
    var CUSTOMER_FLAGS = 'v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on';
    var PREVIEW = '/major-arcana-preview/';
    var SECTIONS = {
      konversationer: konversationerSrc,
      kunder: '/staff?view=customers&' + CUSTOMER_FLAGS,
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
      // Owner queue 117 — reuse existing review surfaces (no new UI shells).
      photo_review: '/photo-review.html',
      photo_review_b5: '/photo-review.html?queue=b5_manual_unclear',
      drive_import_review: '/drive-import-review.html?queue=owner_quarantine',
      import_review_getaccept: '/cco-import-review.html?source=getaccept',
      import_review_journal_sign: '/cco-import-review.html?source=journal_sign',
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
      photo_review: 'Photo review',
      photo_review_b5: 'Photo review · b5',
      drive_import_review: 'Drive import review',
      import_review_getaccept: 'GetAccept import review',
      import_review_journal_sign: 'Journal/sign review',
    };

    function urlFor(key) {
      if (SECTIONS[key]) return SECTIONS[key];
      if (key && key.indexOf('mer:') === 0) {
        var tool = key.slice(4);
        if (MORE_TOOLS[tool]) return MORE_TOOLS[tool];
      }
      return '';
    }

    function normalizePatientId(value) {
      return String(value || '').trim();
    }

    function isCanonicalPatientId(value) {
      return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalizePatientId(value));
    }

    function customerDossierUrl(patientId) {
      var id = normalizePatientId(patientId);
      if (!isCanonicalPatientId(id)) return '';
      return SECTIONS.kunder + '&patientId=' + encodeURIComponent(id);
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
        (path === '/staff' ||
          path === '/major-arcana-preview' ||
          path === '/major-arcana-preview/index.html') &&
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

    function syncRouteState(key, urlOverride) {
      var url = urlOverride || urlFor(key);
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

    function navigateFrame(key, urlOverride) {
      var url = urlOverride || urlFor(key);
      if (!url) return;
      var currentSrc = String(frame.getAttribute('src') || '').trim();
      var currentLiveUrl = currentFrameUrl();
      if (sameUrl(currentSrc, url) && (!currentLiveUrl || sameUrl(currentLiveUrl, url))) {
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

    function openCustomerDossier(patientId) {
      var url = customerDossierUrl(patientId);
      if (!url) return;
      syncRouteState('kunder', url);
      navigateFrame('kunder', url);
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

    // Konversationer och Kalender ligger i samma iframe som Kundprodukten. Låt
    // därför admin-skalet äga den explicita patientdjuplänken, så patientId inte
    // ersätts av Kunder-flikens generella start-URL under iframe-navigering.
    window.addEventListener('message', function (event) {
      if (!event || event.origin !== window.location.origin || event.source !== frame.contentWindow)
        return;
      var payload = event.data;
      if (!payload || payload.type !== 'arcana:cco-open-customer-dossier') return;
      openCustomerDossier(payload.patientId);
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
          syncRouteState(completedKey, currentFrameUrl());
          return;
        }
        // Ett avslutat gammalt request får aldrig skriva över ett nyare klick.
        if (keyForUrl(frame.getAttribute('src')) === pendingKey) return;
        navigateFrame(pendingKey);
        return;
      }

      // Om iframen navigeras på annat sätt ska flikmarkeringen följa den sida
      // användaren faktiskt ser, inte ett gammalt sessionStorage-värde.
      syncRouteState(loadedKey, currentFrameUrl());
    });

    // Initialt val: senast använda giltiga sektion. En ny session landar på
    // live-Konversationer; segment med mock/stubbad data är fortfarande valbara.
    var initial = String(nav.getAttribute('data-default-section') || 'konversationer').trim();
    if (!urlFor(initial)) initial = 'konversationer';
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
