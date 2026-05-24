'use strict';

(function initBookingMobileCalendarDay() {
  const MQ = '(max-width: 768px)';
  let sheetEl = null;
  let listEl = null;
  let titleEl = null;
  let open = false;

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatTimeLabel(isoOrTime) {
    const text = String(isoOrTime || '').trim();
    if (!text) return '';
    if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDayTitle(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return 'Dagens bokningar';
    return date.toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function ensureSheet() {
    if (sheetEl) return sheetEl;
    sheetEl = document.createElement('div');
    sheetEl.id = 'cco-mobile-calendar-sheet';
    sheetEl.className = 'cco-mobile-calendar-sheet';
    sheetEl.hidden = true;
    sheetEl.innerHTML = `
      <button type="button" class="cco-mobile-calendar-backdrop" data-calendar-close aria-label="Stäng"></button>
      <div class="cco-mobile-calendar-panel" role="dialog" aria-modal="true" aria-labelledby="cco-mobile-calendar-title">
        <header class="cco-mobile-calendar-head">
          <div>
            <p class="cco-mobile-calendar-kicker">Kalender</p>
            <h2 id="cco-mobile-calendar-title">Dagens bokningar</h2>
          </div>
          <button type="button" class="cco-mobile-calendar-close" data-calendar-close aria-label="Stäng">✕</button>
        </header>
        <div class="cco-mobile-calendar-next" data-calendar-next hidden></div>
        <ul class="cco-mobile-calendar-list" data-calendar-list></ul>
        <footer class="cco-mobile-calendar-foot">
          <button type="button" class="customers-utility-button cco-mobile-calendar-book" data-calendar-book>
            Ny bokning
          </button>
        </footer>
      </div>
    `;
    document.body.appendChild(sheetEl);
    titleEl = sheetEl.querySelector('#cco-mobile-calendar-title');
    listEl = sheetEl.querySelector('[data-calendar-list]');

    sheetEl.querySelectorAll('[data-calendar-close]').forEach((node) => {
      node.addEventListener('click', () => setOpen(false));
    });
    sheetEl.querySelector('[data-calendar-book]')?.addEventListener('click', () => {
      setOpen(false);
      window.ArcanaMobileShell?.navigateToBooking?.();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) setOpen(false);
    });

    return sheetEl;
  }

  function renderSlotRows(slots) {
    if (!listEl) return;
    if (!slots.length) {
      listEl.innerHTML =
        '<li class="cco-mobile-calendar-empty">Inga bokade tider idag. Tryck Ny bokning för att lägga in en tid.</li>';
      return;
    }

    listEl.innerHTML = slots
      .map((slot) => {
        const time = formatTimeLabel(slot.startAt || slot.start || slot.time || slot.label);
        const title = slot.customerName || slot.title || slot.serviceLabel || slot.service || 'Bokning';
        const meta = slot.resourceLabel || slot.resource || slot.status || '';
        return `<li class="cco-mobile-calendar-item">
          <button type="button" class="cco-mobile-calendar-item-button" data-calendar-slot="${escapeAttr(JSON.stringify(slot))}">
            <span class="cco-mobile-calendar-time">${escapeHtml(time || '—')}</span>
            <span class="cco-mobile-calendar-copy">
              <strong>${escapeHtml(title)}</strong>
              ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
            </span>
          </button>
        </li>`;
      })
      .join('');

    listEl.querySelectorAll('[data-calendar-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        setOpen(false);
        window.ArcanaMobileShell?.navigateToBooking?.();
      });
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function collectDomBookingHints(isoDate) {
    const hints = [];
    document.querySelectorAll('.booking-live-slot, .booking-slot-list .is-selected, [data-booking-slot-label]').forEach((node) => {
      const label = node.textContent?.trim();
      if (!label) return;
      hints.push({ label, title: label, startAt: isoDate });
    });
    return hints;
  }

  async function fetchTodaySlots(isoDate) {
    const params = new URLSearchParams({ fromDate: isoDate, toDate: isoDate });
    try {
      const response = await fetch(`/api/v1/cco-bookings/slots?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('slots_unavailable');
      const payload = await response.json();
      const slots = Array.isArray(payload?.slots) ? payload.slots : [];
      return slots.filter((slot) => {
        const start = String(slot.startAt || slot.start || '').slice(0, 10);
        return !start || start === isoDate;
      });
    } catch {
      return collectDomBookingHints(isoDate);
    }
  }

  function renderNextAvailable(slots) {
    const nextEl = sheetEl?.querySelector('[data-calendar-next]');
    if (!nextEl) return;
    const next = slots.find((slot) => slot.available !== false) || slots[0];
    if (!next) {
      nextEl.hidden = true;
      return;
    }
    const time = formatTimeLabel(next.startAt || next.start || next.time || next.label);
    nextEl.hidden = false;
    nextEl.innerHTML = `<strong>Nästa tid:</strong> ${escapeHtml(time || 'Se bokningsflödet')}`;
  }

  async function refresh() {
    ensureSheet();
    const isoDate = todayIso();
    if (titleEl) titleEl.textContent = formatDayTitle(isoDate);
    if (listEl) {
      listEl.innerHTML = '<li class="cco-mobile-calendar-loading">Hämtar dagens tider…</li>';
    }
    const slots = await fetchTodaySlots(isoDate);
    renderSlotRows(slots);
    renderNextAvailable(slots);
  }

  function setOpen(nextOpen) {
    ensureSheet();
    open = nextOpen === true;
    sheetEl.hidden = !open;
    sheetEl.dataset.open = open ? 'true' : 'false';
    document.documentElement.toggleAttribute('data-cco-calendar-open', open);
    if (open) {
      void refresh();
      sheetEl.querySelector('.cco-mobile-calendar-close')?.focus?.();
    } else {
      window.ArcanaMobileCore?.forceUnlockBodyScroll?.();
      window.ArcanaMobileShell?.syncFromApp?.();
    }
  }

  window.ArcanaBookingMobileCalendar = Object.freeze({
    open: () => setOpen(true),
    close: () => setOpen(false),
    refresh,
    isOpen: () => open,
  });
})();
