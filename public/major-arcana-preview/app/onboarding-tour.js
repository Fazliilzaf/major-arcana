/**
 * app/onboarding-tour.js — first-visit walkthrough för nya operatörer.
 *
 * Audit-action: "Onboarding-pipeline saknas helt" (Effekt 9 / Hög svår.).
 * MVP-version: 5-stegs tooltip-tour vid första besöket. localStorage-
 * flag skippar för returning users.
 *
 * Steg:
 *   1. Mailbox-dropdown — välj vilka mailkonton du jobbar med
 *   2. Smart-filter-bar — snabba shortcuts till "Behöver svar" osv.
 *   3. Signal-pills — färg/symbol per filter, alla pa en rad
 *   4. Customer-cluster — flera trådar från samma kund samlas
 *   5. Cmd+K — universal snabbsök
 *
 * Användaren kan stänga tour'en när som helst (Esc eller × i tooltip).
 * Visa igen via window.__OnboardingTour.start() från konsolen.
 */
(() => {
  'use strict';

  const LS_KEY = 'cco.onboardingTour.completed.v1';

  const STEPS = [
    {
      id: 'mailbox-dropdown',
      target: '.mailbox-dropdown .mailbox-trigger',
      title: 'Välj mailkonton',
      body: 'Klicka för att välja vilka mailkonton du jobbar med. Kunder som skrivit till flera konton samlas automatiskt under Kontakt.',
      placement: 'bottom',
    },
    {
      id: 'smart-filter',
      target: '#cco-smart-filter-bar',
      title: 'Smarta filter',
      body: 'Snabba shortcuts: ↺ Behöver svar, ⚠ Miss-risk, 🔔 Snooze, ↩ Återkommer, ✓ Klar.',
      placement: 'bottom',
    },
    {
      id: 'signal-pills',
      target: '.queue-history-list .thread-card .warm-why-extras',
      title: 'Signal-pills',
      body: 'Varje tråd visar lane (Agera nu/Sprint/etc.), risk, mailbox och status som färgkodade pills. Allt på en rad.',
      placement: 'top',
    },
    {
      id: 'customer-cluster',
      target: '.customer-cluster-badge',
      title: 'Customer-cluster',
      body: 'Om samma kund har flera trådar samlas de till EN rad med "N trådar"-badge. Klicka badgen för att expandera.',
      placement: 'top',
      optional: true, // skip om inget cluster finns
    },
    {
      id: 'cmd-k',
      target: '.preview-topbar, [class*="topbar"], header',
      title: 'Cmd+K snabbsök',
      body: 'Tryck ⌘+K (eller Ctrl+K) för att hitta vad som helst — trådar, kunder, åtgärder. Snabbaste vägen.',
      placement: 'bottom',
    },
  ];

  function hasCompleted() {
    try { return localStorage.getItem(LS_KEY) === '1'; }
    catch (_e) { return false; }
  }

  function markCompleted() {
    try { localStorage.setItem(LS_KEY, '1'); }
    catch (_e) {}
  }

  function findTarget(selectors) {
    const list = selectors.split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of list) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el; // synligt element
      } catch (_e) {}
    }
    return null;
  }

  let overlayEl = null;
  let tooltipEl = null;
  let currentStepIdx = -1;
  let escHandler = null;

  function buildOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'onboarding-tour-overlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlayEl);

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'onboarding-tour-tooltip';
    tooltipEl.setAttribute('role', 'dialog');
    tooltipEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(tooltipEl);
  }

  function teardown() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    currentStepIdx = -1;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderStep(idx) {
    const step = STEPS[idx];
    if (!step) return finish();
    const target = findTarget(step.target);
    if (!target) {
      if (step.optional) return renderStep(idx + 1);
      // Vänta lite och försök igen — kanske renderApp inte hunnit
      setTimeout(() => {
        const retry = findTarget(step.target);
        if (retry) {
          currentStepIdx = idx;
          renderStep(idx);
        } else {
          renderStep(idx + 1); // skip
        }
      }, 500);
      return;
    }
    currentStepIdx = idx;
    const r = target.getBoundingClientRect();
    const tooltipPad = 12;
    let top, left;
    if (step.placement === 'bottom') {
      top = r.bottom + tooltipPad;
      left = Math.max(16, r.left);
    } else {
      // top
      top = r.top - tooltipPad - 140; // ungefärlig tooltip-höjd
      left = Math.max(16, r.left);
    }
    tooltipEl.style.top = `${top + window.scrollY}px`;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.innerHTML = `
      <button class="onboarding-tour-close" aria-label="Stäng walkthrough" type="button">×</button>
      <div class="onboarding-tour-step-count">Steg ${idx + 1} av ${STEPS.length}</div>
      <h4>${escapeHtml(step.title)}</h4>
      <p>${escapeHtml(step.body)}</p>
      <div class="onboarding-tour-actions">
        ${idx > 0 ? '<button class="onboarding-tour-prev" type="button">Föregående</button>' : ''}
        ${idx < STEPS.length - 1
          ? '<button class="onboarding-tour-next" type="button">Nästa</button>'
          : '<button class="onboarding-tour-finish" type="button">Klar — låt mig prova</button>'}
      </div>
    `;
    // Spotlight på target
    const tr = target.getBoundingClientRect();
    overlayEl.style.setProperty('--spotlight-x', `${tr.left + tr.width / 2}px`);
    overlayEl.style.setProperty('--spotlight-y', `${tr.top + tr.height / 2 + window.scrollY}px`);
    overlayEl.style.setProperty('--spotlight-size', `${Math.max(tr.width, tr.height) + 32}px`);

    // Events
    const closeBtn = tooltipEl.querySelector('.onboarding-tour-close');
    closeBtn?.addEventListener('click', () => finish(true));
    tooltipEl.querySelector('.onboarding-tour-next')?.addEventListener('click', () => renderStep(idx + 1));
    tooltipEl.querySelector('.onboarding-tour-prev')?.addEventListener('click', () => renderStep(idx - 1));
    tooltipEl.querySelector('.onboarding-tour-finish')?.addEventListener('click', () => finish(true));
  }

  function finish(markDone = true) {
    if (markDone) markCompleted();
    teardown();
  }

  function start() {
    buildOverlay();
    escHandler = (e) => { if (e.key === 'Escape') finish(true); };
    document.addEventListener('keydown', escHandler);
    renderStep(0);
  }

  function init() {
    if (hasCompleted()) return;
    // Vänta tills appen har laddat (queue-history-list finns)
    const waitForApp = () => {
      const list = document.querySelector('.queue-history-list');
      const hasCards = list && list.querySelectorAll('.thread-card').length > 0;
      if (hasCards) {
        setTimeout(start, 1500); // ge appen lite tid att settle
      } else {
        setTimeout(waitForApp, 800);
      }
    };
    waitForApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.__OnboardingTour = Object.freeze({
    start,
    reset: () => { try { localStorage.removeItem(LS_KEY); } catch (_e) {} },
  });
})();
