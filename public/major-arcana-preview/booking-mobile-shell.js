'use strict';

(function initBookingMobileShell() {
  const MQ = '(max-width: 768px)';
  const STEPS = Object.freeze([
    { id: 1, label: 'Tjänst' },
    { id: 2, label: 'Tid' },
    { id: 3, label: 'Bekräfta' },
  ]);

  const bookingShell = document.getElementById('booking-shell');
  let wizardEl = null;
  let observer = null;

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function getBookingSurface() {
    return document.querySelector('[data-booking-surface]:not([hidden])');
  }

  function resolveBookingStep(surface) {
    if (!surface) return 1;
    const hasSelectedSlot = Boolean(
      surface.querySelector(
        '.booking-slot-list .booking-live-slot, .booking-slot-select.is-selected, .booking-slot-list .is-selected'
      )
    );
    if (hasSelectedSlot) return 3;

    const hasAvailableSlots = Boolean(
      surface.querySelector('.booking-available-slot-list .booking-live-slot')
    );
    const slotOverviewTone = surface.querySelector('[data-booking-slot-overview]')?.dataset?.tone;
    if (hasAvailableSlots || slotOverviewTone === 'ready' || slotOverviewTone === 'loading') {
      return 2;
    }

    const serviceValue = surface.querySelector('[data-booking-slot-service-select]')?.value;
    const resourceValue = surface.querySelector('[data-booking-slot-resource-select]')?.value;
    if (serviceValue || resourceValue) return 2;

    return 1;
  }

  function ensureWizard() {
    if (!bookingShell || wizardEl) return wizardEl;
    wizardEl = document.createElement('nav');
    wizardEl.className = 'cco-booking-mobile-wizard';
    wizardEl.setAttribute('aria-label', 'Bokningssteg');
    wizardEl.innerHTML =
      STEPS.map(
        (step) =>
          `<button type="button" class="cco-booking-mobile-wizard-step" data-booking-mobile-step="${step.id}" data-step-index="${step.id}" aria-current="false"><span class="cco-booking-mobile-wizard-label">${step.label}</span></button>`
      ).join('') +
      '<p class="cco-booking-mobile-progress" data-booking-mobile-progress hidden aria-live="polite"></p>';
    const toolbar = bookingShell.querySelector('.booking-shell-toolbar');
    if (toolbar?.parentNode) {
      toolbar.insertAdjacentElement('afterend', wizardEl);
    } else {
      bookingShell.prepend(wizardEl);
    }

    wizardEl.querySelectorAll('[data-booking-mobile-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const activeSurface = getBookingSurface();
        const step = Number(button.dataset.bookingMobileStep || 0);
        if (step === 1) {
          activeSurface?.querySelector('[data-booking-slot-service-select]')?.focus?.();
        } else if (step === 2) {
          activeSurface?.querySelector('[data-booking-slot-from]')?.focus?.();
        }
      });
    });

    return wizardEl;
  }

  function syncWizard() {
    if (!isMobile()) {
      if (wizardEl) wizardEl.hidden = true;
      return;
    }
    const shellOpen = document.querySelector('.preview-canvas')?.classList.contains('is-booking-open');
    if (!shellOpen) {
      if (wizardEl) wizardEl.hidden = true;
      return;
    }
    const surface = getBookingSurface();
    const wizard = ensureWizard();
    wizard.hidden = !surface;
    if (!surface) return;

    const activeStep = resolveBookingStep(surface);
    const progressEl = wizard.querySelector('[data-booking-mobile-progress]');
    if (progressEl) {
      progressEl.hidden = false;
      progressEl.textContent = `Steg ${activeStep} av ${STEPS.length}`;
    }
    wizard.querySelectorAll('[data-booking-mobile-step]').forEach((button) => {
      const step = Number(button.dataset.bookingMobileStep || 0);
      const isActive = step === activeStep;
      const isDone = step < activeStep;
      button.classList.toggle('is-active', isActive);
      button.classList.toggle('is-done', isDone);
      button.setAttribute('aria-current', isActive ? 'step' : 'false');
    });
  }

  function observeBooking() {
    if (observer) return;
    observer = new MutationObserver(() => {
      window.requestAnimationFrame(syncWizard);
    });
    if (bookingShell) {
      observer.observe(bookingShell, {
        attributes: true,
        attributeFilter: ['aria-hidden', 'hidden', 'style'],
        childList: true,
        subtree: true,
      });
    }
    const canvas = document.querySelector('.preview-canvas');
    if (canvas) {
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }

  try {
    window.matchMedia(MQ).addEventListener('change', syncWizard);
  } catch {
    window.addEventListener('resize', syncWizard);
  }

  observeBooking();
  window.addEventListener('DOMContentLoaded', syncWizard);
  syncWizard();

  window.ArcanaBookingMobileShell = Object.freeze({
    syncWizard,
    resolveBookingStep,
  });
})();
