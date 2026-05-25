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

  function applyTabletShellState() {
    const on = isTablet();
    setShellFlag('data-cco-tablet-shell', on);
    if (!on) {
      document.documentElement.removeAttribute('data-cco-tablet-patient-split');
      document.documentElement.removeAttribute('data-cco-tablet-booking-split');
      return;
    }
    syncPatientSplit();
    syncBookingSplit();
  }

  let syncRaf = 0;
  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = window.requestAnimationFrame(() => {
      syncRaf = 0;
      syncPatientSplit();
      syncBookingSplit();
    });
  }

  function boot() {
    applyTabletShellState();
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
      attributeFilter: ['data-cco-patient-detail'],
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
