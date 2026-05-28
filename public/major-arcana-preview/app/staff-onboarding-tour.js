/**
 * app/staff-onboarding-tour.js — Första-gången-rundtur för /staff.
 *
 * Självständig vanilla-modul (ingen extern dependency), samma mönster som
 * inbox-streak.js. Visar en steg-för-steg-genomgång (spotlight + bubbla) vid
 * första inloggningen och sparar "klar" i localStorage. Stegen speglar
 * staffOnboarding.js-flödet (welcome → hitta kund → journal/foto → klar).
 *
 * Re-triggas med window.ArcanaStaffTour.start() (t.ex. från en hjälp-knapp).
 * Persistens: localStorage 'cco.onboardingTour.v1' = 'done'.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cco.onboardingTour.v1';

  // selector = null → centrerat kort utan spotlight (för steg som beror på att
  // en kund är öppnad och vars element inte finns förrän då).
  const STEPS = [
    {
      id: 'welcome',
      selector: null,
      title: 'Välkommen till CCO 👋',
      body: 'En snabb rundtur (ca 30 sekunder) som visar var allt finns. Du kan hoppa över när som helst.',
    },
    {
      id: 'find_patient',
      selector: '[data-nav-view="customers"]',
      title: 'Kunder',
      body: 'Här är kundregistret — alla kunder, sök och profil. Det är din startpunkt varje dag.',
    },
    {
      id: 'search',
      selector: '[data-customer-search]',
      title: 'Sök kund',
      body: 'Sök på namn, e-post eller telefonnummer. Klicka sedan på en kund för att öppna kortet.',
    },
    {
      id: 'profile',
      selector: null,
      title: 'Kundkortet',
      body: 'När du öppnat en kund ser du flikarna Profil, Journal, Tidslinje, Avtal och Filer.',
    },
    {
      id: 'journal_photo',
      selector: null,
      title: 'Journal, bilder & offert',
      body: 'Under Journal skapar du behandlingsplan, tar bilder och markerar zoner, signerar journal och skapar offert.',
    },
    {
      id: 'complete',
      selector: null,
      title: 'Klart — du är redo! ✅',
      body: 'Du kan starta rundturen igen när du vill. Lycka till!',
    },
  ];

  function clampStepIndex(index, total) {
    const max = Math.max(0, total - 1);
    if (!Number.isFinite(index) || index < 0) return 0;
    return index > max ? max : index;
  }

  function isDemoSession() {
    try {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN');
      return !token || token === 'DEMO' || token === 'demo';
    } catch (_e) {
      return true;
    }
  }

  function tourCompleted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'done';
    } catch (_e) {
      return false;
    }
  }

  function markCompleted() {
    try {
      localStorage.setItem(STORAGE_KEY, 'done');
    } catch (_e) {
      /* ignore */
    }
  }

  // Auto-starta bara för en inloggad användare som inte redan kört rundturen.
  function shouldAutoStart() {
    return !isDemoSession() && !tourCompleted();
  }

  // ---- DOM (körs bara i browsern) ----
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { STEPS, clampStepIndex, shouldAutoStart };
    }
    return;
  }

  let activeIndex = 0;
  let overlayEl = null;
  let spotlightEl = null;
  let cardEl = null;

  function injectStylesOnce() {
    if (document.getElementById('arcana-tour-styles')) return;
    const style = document.createElement('style');
    style.id = 'arcana-tour-styles';
    style.textContent = `
      .arcana-tour-overlay{position:fixed;inset:0;z-index:99998;background:rgba(15,18,28,.55);}
      .arcana-tour-spotlight{position:fixed;z-index:99999;border-radius:12px;
        box-shadow:0 0 0 9999px rgba(15,18,28,.55);transition:all .25s ease;pointer-events:none;}
      .arcana-tour-card{position:fixed;z-index:100000;max-width:340px;background:#fff;color:#1d2330;
        border-radius:14px;padding:18px 18px 14px;box-shadow:0 18px 48px rgba(15,18,28,.32);
        font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;}
      .arcana-tour-card h3{margin:0 0 6px;font-size:16px;}
      .arcana-tour-card p{margin:0 0 14px;color:#41495a;}
      .arcana-tour-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}
      .arcana-tour-count{font-size:12px;color:#8a93a6;}
      .arcana-tour-btns{display:flex;gap:8px;}
      .arcana-tour-btn{border:0;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;}
      .arcana-tour-btn--ghost{background:transparent;color:#8a93a6;}
      .arcana-tour-btn--prev{background:#eef0f5;color:#41495a;}
      .arcana-tour-btn--next{background:#7c5cff;color:#fff;}
    `;
    document.head.appendChild(style);
  }

  function teardown() {
    [overlayEl, spotlightEl, cardEl].forEach((el) => el && el.remove());
    overlayEl = spotlightEl = cardEl = null;
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', renderStep);
  }

  function finish() {
    markCompleted();
    teardown();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') finish();
    else if (event.key === 'ArrowRight') go(activeIndex + 1);
    else if (event.key === 'ArrowLeft') go(activeIndex - 1);
  }

  function go(index) {
    activeIndex = clampStepIndex(index, STEPS.length);
    renderStep();
  }

  function positionCard(rect) {
    const margin = 14;
    const cardRect = cardEl.getBoundingClientRect();
    let top;
    let left;
    if (rect) {
      // Försök placera under elementet, annars ovanför, annars bredvid.
      if (rect.bottom + margin + cardRect.height <= window.innerHeight) {
        top = rect.bottom + margin;
      } else if (rect.top - margin - cardRect.height >= 0) {
        top = rect.top - margin - cardRect.height;
      } else {
        top = Math.max(margin, (window.innerHeight - cardRect.height) / 2);
      }
      left = rect.left + rect.width / 2 - cardRect.width / 2;
    } else {
      top = (window.innerHeight - cardRect.height) / 2;
      left = (window.innerWidth - cardRect.width) / 2;
    }
    left = Math.min(Math.max(margin, left), window.innerWidth - cardRect.width - margin);
    top = Math.min(Math.max(margin, top), window.innerHeight - cardRect.height - margin);
    cardEl.style.top = `${Math.round(top)}px`;
    cardEl.style.left = `${Math.round(left)}px`;
  }

  function renderStep() {
    const step = STEPS[activeIndex];
    if (!step) return finish();

    let target = null;
    if (step.selector) {
      target = document.querySelector(step.selector);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }
    const rect = target ? target.getBoundingClientRect() : null;

    // Spotlight runt målet (om det finns + syns).
    if (rect && rect.width > 0 && rect.height > 0) {
      const pad = 6;
      spotlightEl.style.display = 'block';
      spotlightEl.style.top = `${rect.top - pad}px`;
      spotlightEl.style.left = `${rect.left - pad}px`;
      spotlightEl.style.width = `${rect.width + pad * 2}px`;
      spotlightEl.style.height = `${rect.height + pad * 2}px`;
      overlayEl.style.background = 'transparent';
    } else {
      spotlightEl.style.display = 'none';
      overlayEl.style.background = 'rgba(15,18,28,.55)';
    }

    const isLast = activeIndex === STEPS.length - 1;
    const isFirst = activeIndex === 0;
    cardEl.innerHTML = `
      <h3></h3>
      <p></p>
      <div class="arcana-tour-row">
        <span class="arcana-tour-count">${activeIndex + 1} / ${STEPS.length}</span>
        <div class="arcana-tour-btns">
          <button class="arcana-tour-btn arcana-tour-btn--ghost" data-tour-skip>Hoppa över</button>
          ${isFirst ? '' : '<button class="arcana-tour-btn arcana-tour-btn--prev" data-tour-prev>Tillbaka</button>'}
          <button class="arcana-tour-btn arcana-tour-btn--next" data-tour-next>${isLast ? 'Klar' : 'Nästa'}</button>
        </div>
      </div>`;
    cardEl.querySelector('h3').textContent = step.title;
    cardEl.querySelector('p').textContent = step.body;
    cardEl.querySelector('[data-tour-skip]').addEventListener('click', finish);
    cardEl.querySelector('[data-tour-next]').addEventListener('click', () => (isLast ? finish() : go(activeIndex + 1)));
    const prevBtn = cardEl.querySelector('[data-tour-prev]');
    if (prevBtn) prevBtn.addEventListener('click', () => go(activeIndex - 1));

    positionCard(rect);
  }

  function start(options = {}) {
    teardown();
    injectStylesOnce();
    activeIndex = clampStepIndex(Number(options.startIndex) || 0, STEPS.length);

    overlayEl = document.createElement('div');
    overlayEl.className = 'arcana-tour-overlay';
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) finish();
    });
    spotlightEl = document.createElement('div');
    spotlightEl.className = 'arcana-tour-spotlight';
    cardEl = document.createElement('div');
    cardEl.className = 'arcana-tour-card';
    cardEl.setAttribute('role', 'dialog');
    cardEl.setAttribute('aria-live', 'polite');

    document.body.append(overlayEl, spotlightEl, cardEl);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', renderStep);
    renderStep();
  }

  function reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  window.ArcanaStaffTour = { start, reset, shouldAutoStart, STEPS };

  // Auto-starta efter att appen hunnit rendera (en gång per inloggad användare).
  function boot() {
    if (shouldAutoStart()) {
      window.setTimeout(start, 1600);
    }
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
