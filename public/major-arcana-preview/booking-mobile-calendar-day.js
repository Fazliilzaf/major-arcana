'use strict';

(function initBookingMobileCalendarDay() {
  const MQ_MOBILE = '(max-width: 768px)';
  const MQ_TABLET = '(min-width: 768px) and (max-width: 1023px)';
  const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

  let sheetEl = null;
  let listEl = null;
  let titleEl = null;
  let monthLabelEl = null;
  let gridEl = null;
  let open = false;
  let viewYear = null;
  let viewMonth = null;
  let selectedIso = '';
  let monthSlotsByDate = new Map();
  let monthBookedByDate = new Map();

  function isMobile() {
    try {
      return window.matchMedia(MQ_MOBILE).matches;
    } catch {
      return false;
    }
  }

  function isTablet() {
    try {
      return window.matchMedia(MQ_TABLET).matches;
    } catch {
      return false;
    }
  }

  function isCalendarViewport() {
    return isMobile() || isTablet();
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseIsoDate(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
    };
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function ensureViewMonth(iso) {
    const parts = parseIsoDate(iso || todayIso());
    if (!parts) return;
    viewYear = parts.year;
    viewMonth = parts.month;
    selectedIso = isoFromParts(parts.year, parts.month, parts.day);
  }

  function monthRange(year, month) {
    const first = isoFromParts(year, month, 1);
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const last = isoFromParts(year, month, lastDay);
    return { first, last, lastDay };
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

  function formatMonthTitle(year, month) {
    const date = new Date(Date.UTC(year, month, 1, 12));
    const label = date.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function slotIsoDate(slot) {
    const raw = slot?.startAt || slot?.startsAt || slot?.start || slot?.date || '';
    const text = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
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
        <div class="cco-mobile-calendar-month" data-calendar-month>
          <div class="cco-mobile-calendar-month-nav">
            <button type="button" class="cco-mobile-calendar-nav-btn" data-calendar-prev-month aria-label="Föregående månad">‹</button>
            <p class="cco-mobile-calendar-month-label" data-calendar-month-label></p>
            <button type="button" class="cco-mobile-calendar-nav-btn" data-calendar-next-month aria-label="Nästa månad">›</button>
          </div>
          <button type="button" class="cco-mobile-calendar-today" data-calendar-today>Idag</button>
          <div class="cco-mobile-calendar-weekdays" aria-hidden="true">
            ${WEEKDAYS.map((label) => `<span>${label}</span>`).join('')}
          </div>
          <div class="cco-mobile-calendar-grid" data-calendar-grid role="grid" aria-label="Månadsvy"></div>
        </div>
        <div class="cco-mobile-calendar-next" data-calendar-next hidden></div>
        <ul class="cco-mobile-calendar-list" data-calendar-list aria-label="Tider för vald dag"></ul>
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
    monthLabelEl = sheetEl.querySelector('[data-calendar-month-label]');
    gridEl = sheetEl.querySelector('[data-calendar-grid]');

    sheetEl.querySelectorAll('[data-calendar-close]').forEach((node) => {
      node.addEventListener('click', () => setOpen(false));
    });
    sheetEl.querySelector('[data-calendar-book]')?.addEventListener('click', () => {
      setOpen(false);
      window.ArcanaMobileShell?.navigateToBooking?.();
    });
    sheetEl.querySelector('[data-calendar-prev-month]')?.addEventListener('click', () => shiftMonth(-1));
    sheetEl.querySelector('[data-calendar-next-month]')?.addEventListener('click', () => shiftMonth(1));
    sheetEl.querySelector('[data-calendar-today]')?.addEventListener('click', () => {
      ensureViewMonth(todayIso());
      void refresh();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) setOpen(false);
    });

    ensureViewMonth(todayIso());
    return sheetEl;
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

  function shiftMonth(delta) {
    if (viewYear == null || viewMonth == null) ensureViewMonth(todayIso());
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    viewYear = next.getUTCFullYear();
    viewMonth = next.getUTCMonth();
    void refresh();
  }

  function buildMonthCells(year, month) {
    const { lastDay } = monthRange(year, month);
    const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ empty: true });
    }
    for (let day = 1; day <= lastDay; day += 1) {
      cells.push({ empty: false, iso: isoFromParts(year, month, day), day });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ empty: true });
    }
    return cells;
  }

  function renderMonthGrid() {
    if (!gridEl || viewYear == null || viewMonth == null) return;
    if (monthLabelEl) monthLabelEl.textContent = formatMonthTitle(viewYear, viewMonth);
    const today = todayIso();
    const cells = buildMonthCells(viewYear, viewMonth);
    gridEl.innerHTML = cells
      .map((cell) => {
        if (cell.empty) {
          return '<span class="cco-mobile-calendar-day is-empty" aria-hidden="true"></span>';
        }
        const iso = cell.iso;
        const available = monthSlotsByDate.get(iso)?.length || 0;
        const booked = monthBookedByDate.get(iso) || 0;
        const isToday = iso === today;
        const isSelected = iso === selectedIso;
        const classes = [
          'cco-mobile-calendar-day',
          isToday ? 'is-today' : '',
          isSelected ? 'is-selected' : '',
          available ? 'has-available' : '',
          booked ? 'has-booked' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const badge =
          booked > 0
            ? `<span class="cco-mobile-calendar-day-badge booked">${booked}</span>`
            : available > 0
              ? `<span class="cco-mobile-calendar-day-badge">${available > 9 ? '9+' : available}</span>`
              : '';
        return `<button type="button" class="${classes}" data-calendar-day="${escapeAttr(iso)}" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="${escapeAttr(formatDayTitle(iso))}">
          <span class="cco-mobile-calendar-day-num">${cell.day}</span>
          ${badge}
        </button>`;
      })
      .join('');

    gridEl.querySelectorAll('[data-calendar-day]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedIso = button.getAttribute('data-calendar-day') || todayIso();
        renderMonthGrid();
        void renderSelectedDay();
      });
    });
  }

  function renderSlotRows(slots, isoDate) {
    if (!listEl) return;
    if (!slots.length) {
      listEl.innerHTML = `<li class="cco-mobile-calendar-empty">Inga tider ${isoDate === todayIso() ? 'idag' : 'denna dag'}. Tryck Ny bokning för att lägga in en tid.</li>`;
      return;
    }

    listEl.innerHTML = slots
      .map((slot) => {
        const time = formatTimeLabel(slot.startAt || slot.startsAt || slot.start || slot.time || slot.label);
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

  function collectDomBookingHints(isoDate) {
    const hints = [];
    document.querySelectorAll('.booking-live-slot, .booking-slot-list .is-selected, [data-booking-slot-label]').forEach((node) => {
      const label = node.textContent?.trim();
      if (!label) return;
      hints.push({ label, title: label, startAt: isoDate });
    });
    return hints;
  }

  async function fetchRangeSlots(fromDate, toDate) {
    const params = new URLSearchParams({ fromDate, toDate });
    try {
      const response = await fetch(`/api/v1/cco-bookings/slots?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('slots_unavailable');
      const payload = await response.json();
      return Array.isArray(payload?.slots) ? payload.slots : [];
    } catch {
      return collectDomBookingHints(fromDate);
    }
  }

  async function fetchBookedCounts(fromDate, toDate) {
    const counts = new Map();
    try {
      const response = await fetch('/api/v1/cco-bookings/cases?limit=200&sort=recent', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return counts;
      const payload = await response.json();
      const cases = Array.isArray(payload?.cases) ? payload.cases : [];
      cases.forEach((bookingCase) => {
        const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
        slots.forEach((slot) => {
          const iso = slotIsoDate(slot);
          if (!iso || iso < fromDate || iso > toDate) return;
          counts.set(iso, (counts.get(iso) || 0) + 1);
        });
      });
    } catch {
      /* best-effort */
    }
    return counts;
  }

  function indexSlotsByDate(slots) {
    const map = new Map();
    slots.forEach((slot) => {
      const iso = slotIsoDate(slot);
      if (!iso) return;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso).push(slot);
    });
    map.forEach((rows, iso) => {
      rows.sort((a, b) => {
        const left = Date.parse(a.startsAt || a.startAt || a.start || '') || 0;
        const right = Date.parse(b.startsAt || b.startAt || b.start || '') || 0;
        return left - right;
      });
      map.set(iso, rows);
    });
    return map;
  }

  function renderNextAvailable(slots) {
    const nextEl = sheetEl?.querySelector('[data-calendar-next]');
    if (!nextEl) return;
    const next = slots.find((slot) => slot.available !== false) || slots[0];
    if (!next) {
      nextEl.hidden = true;
      return;
    }
    const time = formatTimeLabel(next.startAt || next.startsAt || next.start || next.time || next.label);
    nextEl.hidden = false;
    nextEl.innerHTML = `<strong>Nästa tid:</strong> ${escapeHtml(time || 'Se bokningsflödet')}`;
  }

  async function renderSelectedDay() {
    if (!selectedIso) selectedIso = todayIso();
    if (titleEl) titleEl.textContent = formatDayTitle(selectedIso);
    const slots = monthSlotsByDate.get(selectedIso) || [];
    renderSlotRows(slots, selectedIso);
    renderNextAvailable(slots);
  }

  async function refresh() {
    ensureSheet();
    if (viewYear == null || viewMonth == null) ensureViewMonth(selectedIso || todayIso());
    const { first, last } = monthRange(viewYear, viewMonth);
    if (listEl) {
      listEl.innerHTML = '<li class="cco-mobile-calendar-loading">Hämtar kalender…</li>';
    }
    const [slots, booked] = await Promise.all([fetchRangeSlots(first, last), fetchBookedCounts(first, last)]);
    monthSlotsByDate = indexSlotsByDate(slots);
    monthBookedByDate = booked;
    if (!monthSlotsByDate.has(selectedIso) && selectedIso >= first && selectedIso <= last) {
      monthSlotsByDate.set(selectedIso, []);
    }
    renderMonthGrid();
    await renderSelectedDay();
  }

  function setOpen(nextOpen) {
    ensureSheet();
    if (nextOpen === true && !isCalendarViewport()) return;
    open = nextOpen === true;
    sheetEl.hidden = !open;
    sheetEl.dataset.open = open ? 'true' : 'false';
    sheetEl.dataset.tabletMode = isTablet() ? 'true' : 'false';
    document.documentElement.toggleAttribute('data-cco-calendar-open', open);
    window.ArcanaTabletShell?.refresh?.();
    if (open) {
      if (!selectedIso) ensureViewMonth(todayIso());
      void refresh();
      sheetEl.querySelector('.cco-mobile-calendar-close')?.focus?.();
    } else {
      window.ArcanaMobileCore?.forceUnlockBodyScroll?.();
      window.ArcanaMobileShell?.syncFromApp?.();
    }
  }

  try {
    const onViewportChange = () => {
      if (open && !isCalendarViewport()) setOpen(false);
    };
    window.matchMedia(MQ_MOBILE).addEventListener('change', onViewportChange);
    window.matchMedia(MQ_TABLET).addEventListener('change', onViewportChange);
  } catch {
    window.addEventListener('resize', () => {
      if (open && !isCalendarViewport()) setOpen(false);
    });
  }

  window.ArcanaBookingMobileCalendar = Object.freeze({
    open: () => setOpen(true),
    close: () => setOpen(false),
    refresh,
    isOpen: () => open,
    isTablet: () => isTablet(),
    isCalendarViewport,
    getSelectedDate: () => selectedIso,
    getViewMonth: () => ({ year: viewYear, month: viewMonth }),
  });
})();
