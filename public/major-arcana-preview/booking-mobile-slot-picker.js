'use strict';

(function initBookingMobileSlotPicker() {
  const MQ = '(max-width: 768px)';
  const DATE_PRESETS = Object.freeze([
    { days: 7, label: '7 dagar' },
    { days: 14, label: '14 dagar' },
    { days: 30, label: '30 dagar' },
  ]);

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(baseDate, days) {
    const next = new Date(baseDate.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function findSlotControls(surface) {
    return surface?.querySelector('[data-booking-slot-controls]') || null;
  }

  function ensureDateChips(controls) {
    if (!controls || controls.dataset.ccoDateChipsBound === '1') return;
    const existing = controls.previousElementSibling;
    if (existing?.matches('[data-cco-booking-date-chips]')) return;

    const wrap = document.createElement('div');
    wrap.className = 'cco-booking-date-chips';
    wrap.dataset.ccoBookingDateChips = '1';
    wrap.innerHTML = DATE_PRESETS.map(
      (preset, index) =>
        `<button type="button" class="cco-booking-date-chip${index === 1 ? ' is-active' : ''}" data-cco-date-days="${preset.days}">${preset.label}</button>`
    ).join('');

    controls.insertAdjacentElement('beforebegin', wrap);

    wrap.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-cco-date-days]');
      if (!chip) return;
      const days = Number(chip.dataset.ccoDateDays || 0);
      if (!days) return;

      wrap.querySelectorAll('.cco-booking-date-chip').forEach((node) => {
        node.classList.toggle('is-active', node === chip);
      });

      const fromInput = controls.querySelector('[data-booking-slot-from]');
      const toInput = controls.querySelector('[data-booking-slot-to]');
      const today = new Date();
      const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      if (fromInput) fromInput.value = formatIsoDate(utcToday);
      if (toInput) toInput.value = formatIsoDate(addDays(utcToday, days));

      fromInput?.dispatchEvent(new Event('change', { bubbles: true }));
      toInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    controls.dataset.ccoDateChipsBound = '1';
  }

  function enhanceSurface(surface) {
    if (!isMobile() || !surface || surface.hidden) return;
    const controls = findSlotControls(surface);
    if (controls) ensureDateChips(controls);
  }

  function scanBookingSurfaces() {
    if (!isMobile()) return;
    document.querySelectorAll('[data-booking-surface]').forEach((surface) => {
      enhanceSurface(surface);
    });
  }

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(scanBookingSurfaces);
  });

  const mount = document.querySelector('[data-booking-shell-mount]') || document.body;
  observer.observe(mount, { childList: true, subtree: true });

  try {
    window.matchMedia(MQ).addEventListener('change', scanBookingSurfaces);
  } catch {
    window.addEventListener('resize', scanBookingSurfaces);
  }

  window.addEventListener('DOMContentLoaded', scanBookingSurfaces);
  scanBookingSurfaces();

  window.ArcanaBookingMobileSlotPicker = Object.freeze({
    scanBookingSurfaces,
  });
})();
