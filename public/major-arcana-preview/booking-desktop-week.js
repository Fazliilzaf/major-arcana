'use strict';

(function initBookingDesktopWeek() {
  const shared = () => window.ArcanaBookingCalendarShared;
  const MQ_DESKTOP = '(min-width: 1024px)';
  const TIMELINE_START = 8 * 60;
  const TIMELINE_END = 18 * 60;

  let viewMode = 'week';
  let viewAnchor = startOfWeek(new Date());
  let selectedDayIso = shared()?.todayIso?.() || new Date().toISOString().slice(0, 10);
  let selectedResource = 'all';
  let selectedServiceType = 'all'; // R3
  let selectedEvent = null;
  let slotsByDate = new Map();
  let allSlots = [];
  let dragEvent = null;
  let calendarBusy = false;

  function isDesktop() {
    try {
      return window.matchMedia(MQ_DESKTOP).matches;
    } catch {
      return false;
    }
  }

  function startOfWeek(date) {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function isoFromDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatDayLabel(date) {
    try {
      return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  function formatWeekTitle(weekStart) {
    const end = addDays(weekStart, 6);
    try {
      const left = weekStart.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
      const right = end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${left} – ${right}`;
    } catch {
      return 'Vecka';
    }
  }

  function getActiveViewName() {
    const canvas = document.querySelector('.preview-canvas');
    return (
      canvas?.dataset?.appShellView ||
      canvas?.dataset?.appView ||
      new URLSearchParams(window.location.search).get('view') ||
      'customers'
    );
  }

  function shouldShowDesktopCalendar() {
    if (!isDesktop()) return false;
    return getActiveViewName() === 'calendar';
  }

  function rangeForMode() {
    if (viewMode === 'day' || viewMode === 'resource') {
      return { from: selectedDayIso, to: selectedDayIso };
    }
    const from = isoFromDate(viewAnchor);
    const to = isoFromDate(addDays(viewAnchor, 6));
    return { from, to };
  }

  function ensureShell() {
    let shell = document.getElementById('cco-desktop-calendar');
    if (shell) return shell;

    shell = document.createElement('section');
    shell.id = 'cco-desktop-calendar';
    shell.className = 'cco-cal-workstation';
    shell.hidden = true;
    shell.innerHTML = `
      <header class="cco-cal-toolbar">
        <div class="cco-cal-toolbar-brand">
          <p class="cco-cal-kicker">Hair TP · Mottagning</p>
          <h2 data-cal-title>Veckokalender</h2>
        </div>
        <div class="cco-cal-segments" role="tablist" aria-label="Kalendervy">
          <button class="cco-cal-segment is-active" type="button" role="tab" data-cal-view="week" aria-selected="true">Vecka</button>
          <button class="cco-cal-segment" type="button" role="tab" data-cal-view="day" aria-selected="false">Dag</button>
          <button class="cco-cal-segment" type="button" role="tab" data-cal-view="resource" aria-selected="false">Resurs</button>
        </div>
        <div class="cco-cal-filters" data-cal-filters aria-label="Resursfilter"></div>
        <div class="cco-cal-filters cco-cal-filters-type" data-cal-type-filters aria-label="Behandlingstypfilter"></div>
        <div class="cco-cal-nav">
          <button class="cco-cal-nav-btn" type="button" data-cal-prev>Föregående</button>
          <button class="cco-cal-nav-btn" type="button" data-cal-today>Idag</button>
          <button class="cco-cal-nav-btn" type="button" data-cal-next>Nästa</button>
        </div>
      </header>
      <div class="cco-cal-body" data-cal-body>
        <div class="cco-cal-grid-wrap" data-cal-grid-wrap>
          <div class="cco-cal-empty">Hämtar kalender…</div>
        </div>
        <aside class="cco-cal-detail focus-intel" data-cal-detail hidden aria-labelledby="cco-cal-detail-title">
          <div class="focus-intel-primary">
            <div class="focus-intel-topline">
              <div class="focus-intel-title-row">
                <p class="focus-intel-kicker">BOKNING</p>
                <h3 id="cco-cal-detail-title" data-cal-detail-title>Välj en tid</h3>
              </div>
            </div>
            <div class="focus-intel-primary-body">
              <div class="focus-intel-customer">
                <div class="focus-intel-monogram" data-cal-detail-monogram>—</div>
                <div class="focus-intel-customer-copy">
                  <div class="focus-intel-name-row">
                    <h4 data-cal-detail-name>—</h4>
                    <span class="focus-intel-queue-pill" data-pill-icon="calendar" data-cal-detail-status>—</span>
                  </div>
                  <p data-cal-detail-subline>—</p>
                </div>
              </div>
              <div class="focus-intel-grid" data-cal-detail-grid></div>
              <div class="focus-intel-action-row" data-cal-detail-actions aria-label="Bokningsåtgärder">
                <button class="quick-action-pill" type="button" data-cal-action="case">Bokningsärende</button>
                <button class="quick-action-pill" type="button" data-cal-action="customer">Kundkort</button>
                <button class="quick-action-pill" type="button" data-cal-action="journal">Journal</button>
                <button class="quick-action-pill" type="button" data-cal-action="book">Ny bokning</button>
                <button class="quick-action-pill" type="button" data-cal-action="mobile-day">Daglista</button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    `;

    const host =
      document.querySelector('[data-booking-calendar-host]') ||
      document.querySelector('.customers-surface') ||
      document.body;
    host.prepend(shell);
    bindShell(shell);
    return shell;
  }

  function setViewMode(nextMode) {
    viewMode = nextMode;
    const shell = ensureShell();
    shell.dataset.calViewMode = viewMode;
    shell.querySelectorAll('[data-cal-view]').forEach((button) => {
      const active = button.getAttribute('data-cal-view') === viewMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function openDayView(iso, { announce = true } = {}) {
    if (!iso) return;
    selectedDayIso = iso;
    viewAnchor = startOfWeek(new Date(`${iso}T12:00:00`));
    setViewMode('day');
    if (announce) {
      const label = formatDayLabel(new Date(`${iso}T12:00:00`));
      window.ArcanaBookingCalendarActions?.showToast?.(`Dagvy · ${label}`);
    }
    void refresh();
  }

  function renderResourceFilters() {
    const shell = ensureShell();
    const filters = shell.querySelector('[data-cal-filters]');
    if (!filters) return;
    const resources = shared()?.listResources?.(allSlots) || [];
    const chips = [
      `<button class="cco-cal-filter-chip${selectedResource === 'all' ? ' is-active' : ''}" type="button" data-cal-resource="all">Alla</button>`,
      ...resources.slice(0, 6).map(
        ([label]) =>
          `<button class="cco-cal-filter-chip${selectedResource === label ? ' is-active' : ''}" type="button" data-cal-resource="${shared().escapeAttr(label)}">${shared().escapeHtml(label)}</button>`
      ),
    ];
    filters.innerHTML = chips.join('');
  }

  // R3: filter-chips per behandlingstyp.
  function renderServiceTypeFilters() {
    const shell = ensureShell();
    const filters = shell.querySelector('[data-cal-type-filters]');
    if (!filters) return;
    const s = shared();
    const counts = new Map();
    (allSlots || []).forEach((slot) => {
      if (slot?.kind !== 'booked') return;
      const t = s.serviceTypeFor(slot);
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    const labels = {
      hairtx: 'Hårtx',
      prp: 'PRP',
      consultation: 'Konsult',
      aftercare: 'Återbesök',
      video: 'Online',
      other: 'Övrigt',
    };
    const order = ['hairtx', 'prp', 'consultation', 'aftercare', 'video', 'other'];
    const present = order.filter((t) => counts.has(t));
    if (!present.length) {
      filters.innerHTML = '';
      return;
    }
    const chips = [
      `<button class="cco-cal-filter-chip${selectedServiceType === 'all' ? ' is-active' : ''}" type="button" data-cal-type="all">Alla typer</button>`,
      ...present.map(
        (t) =>
          `<button class="cco-cal-filter-chip cco-cal-filter-chip-type${selectedServiceType === t ? ' is-active' : ''}" data-service-type="${t}" type="button" data-cal-type="${t}">${s.escapeHtml(labels[t])} <small>${counts.get(t)}</small></button>`
      ),
    ];
    filters.innerHTML = chips.join('');
  }

  function filterSlots(slots) {
    const s = shared();
    let out = slots;
    if (selectedResource !== 'all') {
      out = out.filter((slot) => {
        const label = String(slot?.resourceLabel || slot?.resource || 'Övrigt').trim();
        return label === selectedResource;
      });
    }
    if (selectedServiceType !== 'all') {
      out = out.filter((slot) => s.serviceTypeFor(slot) === selectedServiceType);
    }
    return out;
  }

  function isSelectedEvent(slot) {
    if (!selectedEvent) return false;
    return shared().eventKey(selectedEvent) === shared().eventKey(slot);
  }

  function renderTimelineEvents(slots, { absolute = true } = {}) {
    const s = shared();
    const conflictKeys = s.findConflictKeys(slots); // R3
    return slots
      .map((slot) => {
        const start = s.slotStartMinutes(slot);
        const duration = s.slotDurationMinutes(slot);
        const top = Math.max(
          0,
          Math.min(96, ((start - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100)
        );
        const height = Math.max(
          8,
          Math.min(100 - top, (duration / (TIMELINE_END - TIMELINE_START)) * 100)
        );
        const style = absolute
          ? `position:absolute;left:0;right:0;top:${top}%;height:${height}%;min-height:44px;padding-right:8px`
          : '';
        return `<div style="${style}">${s.renderEventCard(slot, {
          selected: isSelectedEvent(slot),
          draggable: slot?.kind === 'booked',
          interactive: slot?.kind !== 'block',
          conflict: conflictKeys.has(s.eventKey(slot)),
        })}</div>`;
      })
      .join('');
  }

  function renderWeekGrid(container) {
    const s = shared();
    const days = Array.from({ length: 7 }, (_, index) => addDays(viewAnchor, index));
    const today = s.todayIso();
    const now = new Date();
    const nowBadge = `NU ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    container.innerHTML = `<div class="cco-cal-week-grid">${days
      .map((day) => {
        const iso = isoFromDate(day);
        const slots = filterSlots(slotsByDate.get(iso) || []);
        const bookedCount = slots.filter((slot) => slot.kind === 'booked').length;
        const openCount = slots.filter((slot) => slot.kind === 'available').length;
        const conflictKeys = s.findConflictKeys(slots); // R3
        const classes = [
          'cco-cal-day-col',
          iso === today ? 'is-today' : '',
          iso === selectedDayIso ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const todayBadge = iso === today
          ? `<span class="cco-cal-now-badge" title="Aktuell tid">${s.escapeHtml(nowBadge)}</span>`
          : '';
        return `<section class="${classes}" data-cal-day="${s.escapeAttr(iso)}" data-cal-drop-day="${s.escapeAttr(iso)}" title="Dubbelklick öppnar dagvy">
          <header class="cco-cal-col-head cco-cal-day-open" data-cal-open-day="${s.escapeAttr(iso)}" role="button" tabindex="0" aria-label="Öppna dagvy ${s.escapeAttr(formatDayLabel(day))}">
            <strong>${s.escapeHtml(formatDayLabel(day))}${todayBadge}</strong>
            <span>${bookedCount} bokade · ${openCount} lediga</span>
            <small class="cco-cal-day-hint">Dubbelklick → dagvy</small>
          </header>
          <div class="cco-cal-day-stack cco-cal-drop-zone" data-cal-drop-day="${s.escapeAttr(iso)}">
            ${
              slots.length
                ? slots
                    .map((slot) =>
                      s.renderEventCard(slot, {
                        compact: true,
                        selected: isSelectedEvent(slot),
                        draggable: slot?.kind === 'booked',
                        interactive: slot?.kind !== 'block',
                        conflict: conflictKeys.has(s.eventKey(slot)),
                      })
                    )
                    .join('')
                : `<div class="cco-cal-empty cco-cal-drop-zone" data-cal-drop-day="${s.escapeAttr(iso)}">Släpp bokning här · dubbelklicka kolumnen för dagvy</div>`
            }
          </div>
        </section>`;
      })
      .join('')}</div>`;
  }

  function renderDayGrid(container) {
    const s = shared();
    const slots = filterSlots(slotsByDate.get(selectedDayIso) || []);
    const lines = [];
    for (let minute = TIMELINE_START; minute <= TIMELINE_END; minute += 60) {
      lines.push(
        `<div class="cco-cal-time-label">${String(Math.floor(minute / 60)).padStart(2, '0')}:00</div>`
      );
    }
    const now = new Date();
    const nowIso = isoFromDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowTop =
      nowIso === selectedDayIso && nowMinutes >= TIMELINE_START && nowMinutes <= TIMELINE_END
        ? ((nowMinutes - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100
        : null;

    container.innerHTML = `<div class="cco-cal-day-timeline">
      <div class="cco-cal-time-rail">${lines.join('')}</div>
      <div class="cco-cal-time-grid">
        <div class="cco-cal-time-events cco-cal-drop-zone" data-cal-drop-timeline data-cal-drop-day="${s.escapeAttr(selectedDayIso)}">
          ${nowTop != null ? `<div class="cco-cal-now-marker" style="top:${nowTop}%"></div>` : ''}
          ${renderTimelineEvents(slots.filter((slot) => slot.kind !== 'block'))}
          ${renderTimelineEvents(slots.filter((slot) => slot.kind === 'block'), { absolute: true })}
        </div>
      </div>
    </div>`;
  }

  function renderResourceGrid(container) {
    const s = shared();
    const daySlots = filterSlots(slotsByDate.get(selectedDayIso) || []);
    const resources = s.listResources(daySlots, selectedDayIso);
    if (!resources.length) {
      container.innerHTML = `<div class="cco-cal-empty">Inga resurser för ${s.escapeHtml(formatDayLabel(new Date(`${selectedDayIso}T12:00:00`)))}.</div>`;
      return;
    }

    const lines = [];
    for (let minute = TIMELINE_START; minute <= TIMELINE_END; minute += 60) {
      lines.push(
        `<div class="cco-cal-time-label">${String(Math.floor(minute / 60)).padStart(2, '0')}:00</div>`
      );
    }

    container.innerHTML = `<div class="cco-cal-resource-timeline">
      <div class="cco-cal-resource-time-rail">${lines.join('')}</div>
      <div class="cco-cal-resource-columns">${resources
        .map(([label, slots]) => {
          return `<section class="cco-cal-resource-col-timeline">
            <header class="cco-cal-col-head">
              <strong>${s.escapeHtml(label)}</strong>
              <span>${slots.length} ${slots.length === 1 ? 'post' : 'poster'}</span>
            </header>
            <div class="cco-cal-resource-time-grid">
              <div class="cco-cal-time-events cco-cal-drop-zone" data-cal-drop-timeline data-cal-drop-day="${s.escapeAttr(selectedDayIso)}" data-cal-drop-resource="${s.escapeAttr(label)}">
                ${renderTimelineEvents(slots.filter((slot) => slot.kind !== 'block'))}
                ${renderTimelineEvents(slots.filter((slot) => slot.kind === 'block'))}
              </div>
            </div>
          </section>`;
        })
        .join('')}</div>
    </div>`;
  }

  // R2: monogram-helper för Kundintelligens-stil avatar.
  function monogramFor(name) {
    const text = String(name || '').trim();
    if (!text) return '—';
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // R2: ersätter platt list-meta med Kundintelligens-mönstret:
  // monogram + namn + status-pill + 2-kolumns grid + action-row med quick-action-pills.
  function renderDetailPanel() {
    const shell = ensureShell();
    const body = shell.querySelector('[data-cal-body]');
    const detail = shell.querySelector('[data-cal-detail]');
    const titleEl = shell.querySelector('[data-cal-detail-title]');
    const nameEl = shell.querySelector('[data-cal-detail-name]');
    const monogramEl = shell.querySelector('[data-cal-detail-monogram]');
    const statusEl = shell.querySelector('[data-cal-detail-status]');
    const sublineEl = shell.querySelector('[data-cal-detail-subline]');
    const gridEl = shell.querySelector('[data-cal-detail-grid]');
    const caseBtn = shell.querySelector('[data-cal-action="case"]');
    const customerBtn = shell.querySelector('[data-cal-action="customer"]');
    const journalBtn = shell.querySelector('[data-cal-action="journal"]');
    const bookBtn = shell.querySelector('[data-cal-action="book"]');
    if (!detail || !titleEl) return;

    if (!selectedEvent) {
      detail.hidden = true;
      if (body) body.dataset.detailOpen = 'false';
      titleEl.textContent = 'Välj en tid';
      if (nameEl) nameEl.textContent = '—';
      if (monogramEl) monogramEl.textContent = '—';
      if (statusEl) {
        statusEl.textContent = '—';
        delete statusEl.dataset.tone;
      }
      if (sublineEl) sublineEl.textContent = '—';
      if (gridEl) gridEl.innerHTML = '';
      return;
    }

    const s = shared();
    const isBooked = selectedEvent.kind === 'booked';
    const isAvailable = selectedEvent.kind === 'available';
    const isBlock = selectedEvent.kind === 'block';
    detail.hidden = false;
    if (body) body.dataset.detailOpen = 'true';

    const titleText = s.eventTitle(selectedEvent);
    const customerName = selectedEvent.customerName || selectedEvent.customerEmail || '';
    titleEl.textContent = titleText;
    if (nameEl) nameEl.textContent = customerName || titleText;
    if (monogramEl) monogramEl.textContent = monogramFor(customerName || titleText);

    const statusText = isBooked
      ? s.formatCaseStatus(selectedEvent.caseStatus || selectedEvent.status) || 'Bokad'
      : isAvailable
        ? 'Ledig'
        : isBlock
          ? 'Blockerad'
          : 'Bokning';
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.dataset.tone = isBooked ? 'booked' : isAvailable ? 'available' : isBlock ? 'block' : 'default';
    }

    if (sublineEl) {
      const parts = [
        selectedEvent.serviceLabel || selectedEvent.service,
        selectedEvent.resourceLabel || selectedEvent.resource,
      ].filter(Boolean);
      sublineEl.textContent = parts.join(' · ') || '—';
    }

    if (gridEl) {
      const items = [
        ['lifecycle', 'TID', s.formatTimeRange(selectedEvent)],
        ['status', 'BEHANDLING', selectedEvent.serviceLabel || selectedEvent.service || '—'],
        ['owner', 'BEHANDLARE', selectedEvent.resourceLabel || selectedEvent.resource || '—'],
        ['waiting', 'STATUS', statusText],
        ['followup', 'PLATS', selectedEvent.locationLabel || selectedEvent.location || '—'],
      ];
      const signals = isBooked && s.formatCalendarSignalSummary
        ? s.formatCalendarSignalSummary(selectedEvent)
            .map(([label, value]) => ['risk', String(label).toUpperCase(), value])
        : [];
      gridEl.innerHTML = [...items, ...signals]
        .map(([kind, label, value]) =>
          `<div class="focus-intel-item focus-intel-item-${kind}"><span class="focus-intel-label">${s.escapeHtml(label)}</span><strong>${s.escapeHtml(value || '—')}</strong></div>`
        )
        .join('');
    }

    if (caseBtn) caseBtn.hidden = !isBooked;
    if (customerBtn) customerBtn.hidden = !isBooked;
    if (journalBtn) journalBtn.hidden = !isBooked;
    if (bookBtn) bookBtn.hidden = isBooked;
  }

  function minutesFromTimelineDrop(event, container) {
    const rect = container.getBoundingClientRect();
    if (!rect.height) return TIMELINE_START;
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const minutes = TIMELINE_START + ratio * (TIMELINE_END - TIMELINE_START);
    return Math.round(minutes / 15) * 15;
  }

  function findResourceMeta(label) {
    const match = (allSlots || []).find(
      (slot) => String(slot?.resourceLabel || slot?.resource || '').trim() === String(label || '').trim()
    );
    return {
      resourceId: match?.resourceId || '',
      resourceLabel: label || match?.resourceLabel || '',
    };
  }

  async function performCalendarRebook(sourceEvent, targetSlot) {
    if (calendarBusy || !sourceEvent?.bookingCaseId) return;
    const s = shared();
    calendarBusy = true;
    const shell = ensureShell();
    shell.dataset.calBusy = 'true';
    try {
      await s.rebookCalendarBooking(sourceEvent.bookingCaseId, targetSlot, 'Ombokad via kalenderdrag');
      await refresh();
      window.ArcanaBookingCalendarActions?.showToast?.('Bokningen flyttades.');
    } catch (error) {
      window.ArcanaBookingCalendarActions?.showToast?.(
        error?.message || 'Kunde inte omboka tiden.',
        'error'
      );
    } finally {
      calendarBusy = false;
      shell.dataset.calBusy = 'false';
    }
  }

  function bindCalendarInteractions(wrap) {
    if (!wrap) return;
    const s = shared();

    wrap.querySelectorAll('[data-cal-event]').forEach((node) => {
      node.addEventListener('click', (event) => {
        if (node.classList.contains('is-dragging')) return;
        try {
          selectedEvent = JSON.parse(node.getAttribute('data-cal-event') || '{}');
        } catch {
          selectedEvent = null;
        }
        renderDetailPanel();
        node.classList.toggle('is-selected', true);
      });
      node.addEventListener('dblclick', (event) => {
        event.preventDefault();
        try {
          selectedEvent = JSON.parse(node.getAttribute('data-cal-event') || '{}');
        } catch {
          selectedEvent = null;
        }
        if (selectedEvent?.kind === 'available') {
          window.ArcanaBookingCalendarActions?.openNewBookingFromSlot?.(selectedEvent);
        }
      });
      if (node.getAttribute('draggable') === 'true') {
        node.addEventListener('dragstart', (event) => {
          try {
            dragEvent = JSON.parse(node.getAttribute('data-cal-event') || '{}');
          } catch {
            dragEvent = null;
          }
          node.classList.add('is-dragging');
          event.dataTransfer?.setData('text/plain', dragEvent?.eventKey || 'booking');
          event.dataTransfer.effectAllowed = 'move';
        });
        node.addEventListener('dragend', () => {
          node.classList.remove('is-dragging');
          dragEvent = null;
          wrap.querySelectorAll('.cco-cal-drop-zone.is-drop-target').forEach((zone) => {
            zone.classList.remove('is-drop-target');
          });
        });
      }
    });

    wrap.querySelectorAll('[data-cal-drop-day]').forEach((zone) => {
      zone.addEventListener('dragover', (event) => {
        if (!dragEvent || dragEvent.kind !== 'booked') return;
        event.preventDefault();
        zone.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('is-drop-target');
        if (!dragEvent || dragEvent.kind !== 'booked') return;
        const iso = zone.getAttribute('data-cal-drop-day') || selectedDayIso;
        const targetSlot = s.buildSlotAtTime(dragEvent, {
          iso,
          startMinutes: s.slotStartMinutes(dragEvent),
        });
        void performCalendarRebook(dragEvent, targetSlot);
      });
    });

    wrap.querySelectorAll('[data-cal-drop-timeline]').forEach((zone) => {
      zone.addEventListener('dragover', (event) => {
        if (!dragEvent || dragEvent.kind !== 'booked') return;
        event.preventDefault();
        zone.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('is-drop-target');
        if (!dragEvent || dragEvent.kind !== 'booked') return;
        const iso = zone.getAttribute('data-cal-drop-day') || selectedDayIso;
        const resourceLabel = zone.getAttribute('data-cal-drop-resource') || dragEvent.resourceLabel;
        const resourceMeta = findResourceMeta(resourceLabel);
        const startMinutes = minutesFromTimelineDrop(event, zone);
        const targetSlot = s.buildSlotAtTime(
          { ...dragEvent, ...resourceMeta, resourceLabel: resourceMeta.resourceLabel || resourceLabel },
          { iso, startMinutes }
        );
        void performCalendarRebook(dragEvent, targetSlot);
      });
    });

    wrap.querySelectorAll('[data-cal-open-day]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        selectedDayIso = node.getAttribute('data-cal-open-day') || selectedDayIso;
        renderGrid();
      });
      node.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDayView(node.getAttribute('data-cal-open-day'), { announce: true });
      });
      node.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openDayView(node.getAttribute('data-cal-open-day'), { announce: true });
      });
    });

    wrap.querySelectorAll('[data-cal-day]').forEach((node) => {
      node.addEventListener('dblclick', (event) => {
        if (event.target.closest('[data-cal-event]') || event.target.closest('[data-cal-open-day]')) return;
        openDayView(node.getAttribute('data-cal-day'), { announce: true });
      });
    });
  }

  function renderGrid() {
    const shell = ensureShell();
    const title = shell.querySelector('[data-cal-title]');
    const wrap = shell.querySelector('[data-cal-grid-wrap]');
    if (!wrap) return;

    if (viewMode === 'day') {
      if (title) {
        title.textContent = formatDayLabel(new Date(`${selectedDayIso}T12:00:00`));
        title.setAttribute('title', 'Tidsaxel · välj Vecka i verktygsfältet för att gå tillbaka');
      }
      renderDayGrid(wrap);
    } else if (viewMode === 'resource') {
      if (title) {
        title.textContent = `Resursvy · ${formatDayLabel(new Date(`${selectedDayIso}T12:00:00`))}`;
      }
      renderResourceGrid(wrap);
    } else {
      if (title) title.textContent = formatWeekTitle(viewAnchor);
      renderWeekGrid(wrap);
    }

    bindCalendarInteractions(wrap);
    renderDetailPanel();
  }

  async function refresh() {
    const shell = ensureShell();
    const wrap = shell.querySelector('[data-cal-grid-wrap]');
    if (wrap) wrap.innerHTML = '<div class="cco-cal-empty">Hämtar kalender…</div>';
    const { from, to } = rangeForMode();
    const s = shared();
    const merged = await s.fetchCalendarRange(from, to);
    allSlots = merged.events;
    slotsByDate = merged.slotsByDate;
    renderResourceFilters();
    renderServiceTypeFilters(); // R3
    renderGrid();
  }

  function runCalendarAction(action) {
    const actions = window.ArcanaBookingCalendarActions;
    if (!selectedEvent) return;
    if (action === 'case') {
      actions?.openBookingCase?.(selectedEvent.bookingCaseSnapshot || selectedEvent);
      return;
    }
    if (action === 'customer') {
      actions?.openCustomerCard?.({
        patientId: selectedEvent.patientId,
        customerEmail: selectedEvent.customerEmail,
        customerName: selectedEvent.customerName,
      });
      return;
    }
    if (action === 'journal') {
      actions?.openJournal?.({
        patientId: selectedEvent.patientId,
        customerEmail: selectedEvent.customerEmail,
        customerName: selectedEvent.customerName,
      });
      return;
    }
    if (action === 'book') {
      window.ArcanaBookingCalendarActions?.openNewBookingFromSlot?.(selectedEvent);
      return;
    }
    if (action === 'mobile-day') {
      window.ArcanaBookingMobileCalendar?.open?.({ focusDate: selectedDayIso, desktopHandoff: true });
    }
  }

  function bindShell(shell) {
    shell.querySelectorAll('[data-cal-view]').forEach((button) => {
      button.addEventListener('click', () => {
        setViewMode(button.getAttribute('data-cal-view') || 'week');
        void refresh();
      });
    });

    shell.querySelector('[data-cal-prev]')?.addEventListener('click', () => {
      if (viewMode === 'day' || viewMode === 'resource') {
        selectedDayIso = isoFromDate(addDays(new Date(`${selectedDayIso}T12:00:00`), -1));
      } else {
        viewAnchor = addDays(viewAnchor, -7);
      }
      void refresh();
    });

    shell.querySelector('[data-cal-next]')?.addEventListener('click', () => {
      if (viewMode === 'day' || viewMode === 'resource') {
        selectedDayIso = isoFromDate(addDays(new Date(`${selectedDayIso}T12:00:00`), 1));
      } else {
        viewAnchor = addDays(viewAnchor, 7);
      }
      void refresh();
    });

    shell.querySelector('[data-cal-today]')?.addEventListener('click', () => {
      viewAnchor = startOfWeek(new Date());
      selectedDayIso = shared().todayIso();
      void refresh();
    });

    shell.addEventListener('click', (event) => {
      const resourceButton = event.target.closest('[data-cal-resource]');
      if (resourceButton) {
        selectedResource = resourceButton.getAttribute('data-cal-resource') || 'all';
        renderResourceFilters();
        renderServiceTypeFilters(); // R3
        renderGrid();
        return;
      }

      // R3: filter per behandlingstyp
      const typeButton = event.target.closest('[data-cal-type]');
      if (typeButton) {
        selectedServiceType = typeButton.getAttribute('data-cal-type') || 'all';
        renderServiceTypeFilters();
        renderGrid();
        return;
      }

      const actionButton = event.target.closest('[data-cal-action]');
      if (actionButton) {
        runCalendarAction(actionButton.getAttribute('data-cal-action'));
      }
    });
  }

  function syncVisibility() {
    const shell = ensureShell();
    const show = shouldShowDesktopCalendar();
    shell.hidden = !show;
    shell.dataset.shellView = getActiveViewName();
    if (show) void refresh();
  }

  function boot() {
    ensureShell();
    syncVisibility();
    window.addEventListener('resize', syncVisibility);
    window.addEventListener('popstate', syncVisibility);
    const canvas = document.querySelector('.preview-canvas');
    if (canvas) {
      const observer = new MutationObserver(() => window.requestAnimationFrame(syncVisibility));
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ['data-app-shell-view', 'data-app-view'],
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.ArcanaBookingDesktopWeek = Object.freeze({
    syncVisibility,
    refresh,
    openDayView,
    getViewWeekStart: () => new Date(viewAnchor),
    getViewMode: () => viewMode,
    getSelectedDayIso: () => selectedDayIso,
  });
})();
