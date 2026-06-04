'use strict';

(function initCcoTabletShell() {
  const MQ = '(min-width: 768px) and (max-width: 1023px)';

  function isTablet() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function setShellFlag(name, on) {
    if (on) {
      document.documentElement.setAttribute(name, 'on');
    } else {
      document.documentElement.removeAttribute(name);
    }
  }

  function syncPatientSplit() {
    if (!isTablet()) return;
    const canvas = document.querySelector('.preview-canvas');
    const onCustomers = canvas?.dataset?.appShellView === 'customers';
    const hasDetail =
      document.documentElement.hasAttribute('data-cco-patient-detail') ||
      Boolean(
        document.querySelector(
          '.customers-rail .patient-master-card:not(.patient-master-card-empty):not(.patient-master-auth-card)'
        )
      );
    setShellFlag('data-cco-tablet-patient-split', onCustomers && hasDetail);
  }

  function syncBookingSplit() {
    if (!isTablet()) return;
    const open = document.querySelector('.preview-canvas')?.classList.contains('is-booking-open');
    setShellFlag('data-cco-tablet-booking-split', Boolean(open));
  }

  function syncCalendarSplit() {
    if (!isTablet()) return;
    const open = document.documentElement.hasAttribute('data-cco-calendar-open');
    setShellFlag('data-cco-tablet-calendar-split', open);
  }

  function applyTabletShellState() {
    const on = isTablet();
    setShellFlag('data-cco-tablet-shell', on);
    if (!on) {
      document.documentElement.removeAttribute('data-cco-tablet-patient-split');
      document.documentElement.removeAttribute('data-cco-tablet-booking-split');
      document.documentElement.removeAttribute('data-cco-tablet-calendar-split');
      return;
    }
    syncPatientSplit();
    syncBookingSplit();
    syncCalendarSplit();
  }

  let syncRaf = 0;
  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = window.requestAnimationFrame(() => {
      syncRaf = 0;
      syncPatientSplit();
      syncBookingSplit();
      syncCalendarSplit();
    });
  }

  function wireCalendarTrigger() {
    document.querySelectorAll('[data-cco-tablet-calendar-open]').forEach((button) => {
      if (button.dataset.ccoTabletCalendarBound === '1') return;
      button.dataset.ccoTabletCalendarBound = '1';
      button.addEventListener('click', () => {
        if (!isTablet()) return;
        if (window.ArcanaBookingMobileCalendar?.isOpen?.()) {
          window.ArcanaBookingMobileCalendar.close();
          return;
        }
        void window.__ARCANA_OPEN_MOBILE_CALENDAR__?.();
      });
    });
  }

  function boot() {
    applyTabletShellState();
    wireCalendarTrigger();
    try {
      window.matchMedia(MQ).addEventListener('change', applyTabletShellState);
    } catch {
      window.addEventListener('resize', applyTabletShellState);
    }

    const canvas = document.querySelector('.preview-canvas');
    if (canvas) {
      const observer = new MutationObserver(scheduleSync);
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ['class', 'data-app-shell-view'],
      });
    }

    const rootObserver = new MutationObserver(scheduleSync);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-cco-patient-detail', 'data-cco-calendar-open'],
    });

    const customersRail = document.querySelector('.customers-rail');
    if (customersRail) {
      const railObserver = new MutationObserver(scheduleSync);
      railObserver.observe(customersRail, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.ArcanaTabletShell = Object.freeze({
    isTablet,
    refresh: applyTabletShellState,
  });
})();
