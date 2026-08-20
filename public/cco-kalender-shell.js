/* ─── CCO Kalender-shell wire för /major-arcana-preview customers-view ─────────────────────────────
 * Aktiverar existing .calendar-shell (/major-arcana-preview customers-view L3328) och wirar
 * Sprint 1-2 backend-endpoints in i existing morgon/vecka/dag/resurs-tabs.
 *
 * Owner-direktiv: ingen ny fristående kalender. /major-arcana-preview customers-view calendar-shell
 * är huvudkalendern. Behåll existing design-DNA. Sprint 1-2-funktioner får
 * gärna prefixas .cco-cal-* för att undvika kollision.
 *
 * View-switch: ?view=calendar visar calendar-shell, döljer kunder-shell.
 *              Default = kunder-vyn (per existing layout).
 * Default-mode (vid view=calendar): dag (per owner-beslut Sprint 1).
 * ─────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  const HOUR_H = 62;
  const HOUR_START = 7;
  const HOUR_END = 19;

  function isReadOnlyMode() {
    return global.CCO_CALENDAR_READ_ONLY === true;
  }

  function isOriginalV6Mode() {
    return global.CCO_CALENDAR_ORIGINAL_V6 === true;
  }

  function isCreateBookingEnabled() {
    return global.CCO_CALENDAR_CREATE_BOOKING_ENABLED === true;
  }

  function adminAuthToken() {
    try {
      return (
        global.localStorage?.getItem('ARCANA_ADMIN_TOKEN') ||
        global.sessionStorage?.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch {
      return '';
    }
  }

  function calendarHeaders({ tenantId = '', role = '', json = false } = {}) {
    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (!isReadOnlyMode()) {
      if (role) headers['x-cco-role'] = role;
      if (tenantId) headers['x-cco-tenant'] = tenantId;
    }
    const auth = global.ArcanaReviewAuth;
    if (auth && typeof auth.authHeaders === 'function') {
      return auth.authHeaders(headers);
    }
    const token = adminAuthToken();
    if (token && token !== '__preview_local__') headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  // Stabil resurs-färg-palette (samma som cco-kalender.js)
  const RESOURCE_COLORS = ['#7c3aed', '#a37433', '#2596a8', '#bb4779', '#4a8268', '#c8821e', '#84756b', '#5e8db8'];
  function colorForResource(resourceId) {
    if (!resourceId) return '#84756b';
    let hash = 0;
    for (let i = 0; i < resourceId.length; i++) hash = (hash * 31 + resourceId.charCodeAt(i)) >>> 0;
    return RESOURCE_COLORS[hash % RESOURCE_COLORS.length];
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function timeToMinutes(t) {
    if (!t || typeof t !== 'string') return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function minutesToY(mins) {
    return ((mins - HOUR_START * 60) / 60) * HOUR_H;
  }

  function isoToday() {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }

  function formatTimeRange(start, end) {
    if (!end) return start || '';
    return start + '–' + end;
  }

  function statusLabel(status) {
    const labels = {
      confirmed: 'Bekräftad',
      upcoming: 'Bokad',
      pending: 'Reserverad',
      completed: 'Genomförd',
      cancelled: 'Avbokad',
      canceled: 'Avbokad',
      no_show: 'Uteblev',
      unknown: 'Okänd',
    };
    return labels[String(status || '').toLowerCase()] || status || 'Bokad';
  }

  function sourceLabel(source) {
    return String(source || '').startsWith('cco_booking') ? 'CCO' :
      String(source || '').toLowerCase() === 'cliento' ? 'Cliento' : source || '—';
  }

  function bookingNoteCount(slot) {
    return [
      slot && (slot.bookingNotes || slot.notes),
      slot && slot.customerMessage,
      slot && slot.internalNotes,
      slot && slot.treatmentNotes,
    ].filter(Boolean).length;
  }

  function bookingNoteIndicator(slot) {
    const count = bookingNoteCount(slot);
    if (!count) return null;
    const label = count === 1 ? '1 anteckning' : count + ' anteckningar';
    return el('span', {
      class: 'cco-cal-note-indicator', title: label, 'aria-label': label,
    }, '✎' + count);
  }

  function stockholmParts(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return { date: '', time: '' };
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: values.year + '-' + values.month + '-' + values.day,
      time: values.hour + ':' + values.minute,
    };
  }

  function canonicalVisitToSlot(visit) {
    const start = stockholmParts(visit.startsAt || visit.startAt);
    const end = stockholmParts(visit.endsAt);
    return {
      id: visit.id,
      bookingId: visit.id,
      patientId: visit.patientId || null,
      encounterId: visit.encounterId || null,
      patientName: visit.patientName || '',
      date: start.date,
      time: start.time,
      endTime: end.time || '',
      status: visit.status || 'confirmed',
      serviceId: visit.serviceId || '',
      serviceLabel: visit.serviceName || visit.title || 'Bokning',
      treatmentPresent: Boolean(visit.serviceName || visit.title || visit.serviceId),
      resourceId: visit.resourceLabel || '_unassigned',
      resourceLabel: visit.resourceLabel || 'Ej tilldelad',
      staffName: visit.staffName || visit.staff || '',
      practitioner: visit.practitioner || visit.providerName || visit.staffName || visit.staff || '',
      source: visit.source || '',
      identityMatchStatus: visit.identityMatchStatus || visit.matchStatus || '',
      identityAmbiguous: visit.identityAmbiguous === true,
      linkAllowed: visit.linkAllowed !== false,
      notes: visit.notes || '',
      bookingNotes: visit.bookingNotes || '',
      customerMessage: visit.customerMessage || '',
      internalNotes: visit.internalNotes || '',
      treatmentNotes: visit.treatmentNotes || '',
      startsAt: visit.startsAt || visit.startAt || '',
      endsAt: visit.endsAt || '',
      durationMinutes: visit.durationMinutes || visit.duration || null,
    };
  }

  async function loadCanonicalVisits(fromDate, toDate, tenantId, role) {
    const query = new URLSearchParams({ fromDate, toDate });
    const patientId = global.CCO_KALENDER_PATIENT_ID || null;
    if (patientId) query.set('patientId', patientId);
    const response = await fetch('/api/v1/cco-bookings/calendar-bundle?' + query.toString(), {
      headers: calendarHeaders({ tenantId, role }),
    });
    if (!response.ok) {
      const error = new Error('HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    return (Array.isArray(payload.visits) ? payload.visits : []).map(canonicalVisitToSlot);
  }

  function applyConversationContext(context) {
    if (!context || typeof context !== 'object') return;
    global.CCO_KALENDER_PATIENT_ID = context.patientId || null;
    global.CCO_KALENDER_CONTEXT = context;
    if (context.patientId) reloadCalendarWithPatientFilter();
    renderConversationContextPanel(context);
  }

  function reloadCalendarWithPatientFilter() {
    const view = new URLSearchParams(window.location.search).get('view') || 'day';
    const tenantId = global.__ccoCalTenantId || 'hair_tp';
    const role = global.__ccoCalRole || 'owner';
    if (view === 'week' || view === 'v6') {
      if (typeof v6Load === 'function') v6Load();
      else if (typeof loadWeek === 'function') loadWeek({ tenantId, role });
    } else if (view === 'day') {
      if (typeof loadDay === 'function') loadDay({ tenantId, role });
    }
  }

  function renderConversationContextPanel(context) {
    const existing = document.getElementById('cco-kalender-conversation-context');
    if (existing) existing.remove();
    if (!context || !context.patientId) return;

    const panel = document.createElement('div');
    panel.id = 'cco-kalender-conversation-context';
    panel.style.cssText = 'padding: 8px 12px; margin: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #334155; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;';

    const title = document.createElement('span');
    title.style.cssText = 'font-weight: 600; margin-right: 4px;';
    title.textContent = 'Konversation:';
    panel.appendChild(title);

    const loading = document.createElement('span');
    loading.className = 'cco-cal-context-loading';
    loading.style.cssText = 'color: #64748b;';
    loading.textContent = 'Laddar…';
    panel.appendChild(loading);

    const calendarShell = document.querySelector('.calendar-shell');
    if (calendarShell && calendarShell.parentNode) {
      calendarShell.parentNode.insertBefore(panel, calendarShell);
    } else {
      document.body.insertBefore(panel, document.body.firstChild);
    }

    fetch('/api/v1/cco-customers/' + encodeURIComponent(context.patientId) + '/conversation-context', {
      headers: calendarHeaders({ tenantId: global.__ccoCalTenantId || 'hair_tp', role: global.__ccoCalRole || 'owner' }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const ctx = data && data.context ? data.context : null;
        if (!ctx) {
          panel.remove();
          return;
        }
        loading.remove();
        const chips = [
          { label: 'Obesvarade', value: ctx.unanswered && ctx.unanswered.count },
          { label: 'SLA', value: ctx.slaStatus && ctx.slaStatus.slaStatus },
          { label: 'Senaste', value: ctx.latestInboundAt },
          { label: 'Risk', value: ctx.dominantRisk },
          { label: 'Temperatur', value: ctx.temperature && ctx.temperature.temperature },
        ];
        chips.forEach((chip) => {
          if (chip.value === undefined || chip.value === null || chip.value === '') return;
          const span = document.createElement('span');
          span.style.cssText = 'background: #fff; padding: 2px 8px; border-radius: 999px; border: 1px solid #cbd5e1;';
          span.innerHTML = '<b>' + chip.label + ':</b> ' + String(chip.value).replace(/</g, '&lt;');
          panel.appendChild(span);
        });
      })
      .catch(() => {
        panel.remove();
      });
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('cco:kalender:apply-context', (event) => {
      applyConversationContext(event.detail || {});
    });
  }

  function canonicalDayView(date, visits) {
    const byResource = new Map();
    visits.filter((slot) => slot.date === date).forEach((slot) => {
      const key = slot.resourceId || '_unassigned';
      if (!byResource.has(key)) {
        byResource.set(key, { resourceId: key, resourceLabel: slot.resourceLabel, slots: [] });
      }
      byResource.get(key).slots.push(slot);
    });
    const rows = [...byResource.values()];
    const all = rows.flatMap((resource) => resource.slots);
    return {
      date,
      resources: rows,
      totalSlots: all.length,
      confirmedBookings: all.filter((slot) => ['confirmed', 'upcoming'].includes(slot.status)).length,
      pendingReservations: all.filter((slot) => slot.status === 'pending').length,
      sourceCounts: {
        bookingEngine: all.filter((slot) => String(slot.source).startsWith('cco_booking')).length,
        cliento: all.filter((slot) => slot.source === 'cliento').length,
      },
    };
  }

  function canonicalWeekView(startDate, visits) {
    const start = new Date(startDate + 'T12:00:00.000Z');
    const days = [];
    for (let index = 0; index < 7; index += 1) {
      const current = new Date(start);
      current.setUTCDate(start.getUTCDate() + index);
      const date = current.toISOString().slice(0, 10);
      days.push(canonicalDayView(date, visits));
    }
    return { startDate, days, totalSlots: days.reduce((sum, day) => sum + day.totalSlots, 0) };
  }

  function isReturnVisit(slot) {
    const value = [slot?.serviceId, slot?.serviceLabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return /follow_up|uppf[oö]lj|[aå]terbes[oö]k|kontroll/.test(value);
  }

  function canonicalConflictCount(visits) {
    const active = (visits || []).filter((slot) =>
      !['cancelled', 'canceled', 'no_show'].includes(String(slot.status || '').toLowerCase()));
    if (active.length < 2) return 0;
    const intervals = active.map((slot) => {
      const start = Date.parse(slot.startsAt || '');
      let end = Date.parse(slot.endsAt || '');
      if (!Number.isFinite(end) && Number.isFinite(Number(slot.durationMinutes))) {
        end = start + Number(slot.durationMinutes) * 60000;
      }
      const resourceId = String(slot.resourceId || '').trim();
      if (!resourceId || resourceId === '_unassigned' || !Number.isFinite(start) ||
          !Number.isFinite(end) || end <= start) return null;
      return { id: slot.id, resourceId, start, end };
    });
    if (intervals.some((interval) => interval == null)) return null;
    const conflicting = new Set();
    for (let left = 0; left < intervals.length; left += 1) {
      for (let right = left + 1; right < intervals.length; right += 1) {
        const a = intervals[left];
        const b = intervals[right];
        if (a.resourceId === b.resourceId && a.start < b.end && b.start < a.end) {
          conflicting.add(a.id || left);
          conflicting.add(b.id || right);
        }
      }
    }
    return conflicting.size;
  }

  function buildCanonicalSidebarSummary(date, visits) {
    const selectedDate = date || isoToday();
    const weekStart = startOfWeek(selectedDate);
    const weekEnd = new Date(weekStart + 'T12:00:00.000Z');
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    const tomorrow = new Date(selectedDate + 'T12:00:00.000Z');
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const rows = Array.isArray(visits) ? visits : [];
    const selected = rows.filter((slot) => slot.date === selectedDate);
    return {
      tomorrow: rows.filter((slot) => slot.date === tomorrowKey).length,
      week: rows.filter((slot) => slot.date >= weekStart && slot.date <= weekEndKey).length,
      conflicts: canonicalConflictCount(selected),
      returnVisits: selected.filter(isReturnVisit).length,
    };
  }

  function openCanonicalPatient(patientId) {
    const id = String(patientId || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return false;
    let sent = false;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'arcana:cco-open-customer-dossier', patientId: id },
          window.location.origin
        );
        sent = true;
      }
    } catch {
      sent = false;
    }
    try {
      const opener = window.parent && window.parent !== window
        ? window.parent.ArcanaCcoOpenCustomerDossier
        : null;
      if (typeof opener === 'function') return opener({ patientId: id }) === true || sent;
    } catch {
      /* cross-origin parent: strict postMessage above is the only allowed path */
    }
    return sent;
  }

  // ─── View-switch: kunder vs kalender ─────────────────────────────────────
  function detectViewFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (/\/kalender\.html$/i.test(window.location.pathname)) return 'calendar';
      return params.get('view') || 'customers';
    } catch { return 'customers'; }
  }

  function applyView(view) {
    const body = document.body;
    const calendarShell = document.querySelector('.calendar-shell');
    body.setAttribute('data-cco-view', view === 'calendar' ? 'calendar' : 'customers');
    if (view === 'calendar' && isReadOnlyMode()) {
      body.setAttribute('data-cco-calendar-mode', 'live-read');
    }
    if (calendarShell) calendarShell.hidden = (view !== 'calendar');
    // Uppdatera top-nav active state (mjuk — bryter inte existing)
    if (view === 'calendar') {
      document.querySelectorAll('.top-nav a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const isCalendar = href.includes('/kalender.html') || href.includes('view=calendar');
        const isKunder = href.includes('/major-arcana-preview/?view=customers&v9=on') && !href.includes('view=');
        if (isCalendar) a.classList.add('active');
        else if (isKunder) a.classList.remove('active');
      });
    }
  }

  // ─── Drawer mount-point i intel-shell (befintlig höger-kolumn) ────────
  function getDrawerMount() {
    let drawer = document.querySelector('#cco-cal-drawer');
    if (drawer) return drawer;

    // Skapa en mount-container in i .intel-shell (befintlig höger-kolumn)
    const intelShell = document.querySelector('.intel-shell');
    if (intelShell) {
      drawer = el('div', { id: 'cco-cal-drawer', class: 'cco-cal-drawer' });
      intelShell.prepend(drawer);
      return drawer;
    }

    // Fallback: skapa floating drawer
    drawer = el('div', { id: 'cco-cal-drawer', class: 'cco-cal-drawer cco-cal-drawer--floating' });
    document.body.appendChild(drawer);
    return drawer;
  }

  function getBackdropMount() {
    let bd = document.querySelector('#cco-cal-backdrop');
    if (bd) return bd;
    bd = el('div', { id: 'cco-cal-backdrop', class: 'cco-cal-backdrop' });
    document.body.appendChild(bd);
    return bd;
  }

  // ─── Render Day-grid i .calendar-content[data-mode="dag"] ────────────────
  function ensureDayMount() {
    const content = document.querySelector('.calendar-content');
    if (!content) return null;
    let mount = content.querySelector('#cco-cal-day-mount');
    if (mount) return mount;
    mount = el('div', { id: 'cco-cal-day-mount', class: 'cco-cal-day-mount' });
    content.appendChild(mount);
    return mount;
  }

  function renderDayGrid(dayView, onBookingClick) {
    const resources = (dayView.resources || []).filter(r => r.resourceId !== '_unassigned');
    const unassigned = (dayView.resources || []).find(r => r.resourceId === '_unassigned');
    const totalResources = resources.length + (unassigned ? 1 : 0);

    if ((dayView.totalSlots || 0) === 0) {
      return el('div', { class: 'cco-cal-empty' }, 'Inga bokningar registrerade för dagen.');
    }
    if (totalResources === 0) {
      return el('div', { class: 'cco-cal-empty' }, 'Bokningar finns men saknar behandlarkoppling.');
    }

    const grid = el('div', { class: 'cco-cal-day-grid' });

    // Time-col
    const hourCol = el('div', { class: 'cco-cal-hour-col' });
    hourCol.appendChild(el('div', { class: 'cco-cal-resource-spacer' })); // spacer för header-höjd
    for (let h = HOUR_START; h < HOUR_END; h++) {
      hourCol.appendChild(el('div', { class: 'cco-cal-hour-row' }, String(h).padStart(2,'0') + ':00'));
    }
    grid.appendChild(hourCol);

    const right = el('div', { class: 'cco-cal-day-right' });

    // Resource headers
    const headers = el('div', {
      class: 'cco-cal-resources-row',
      style: `grid-template-columns: repeat(${totalResources}, 1fr);`,
    });
    for (const r of resources) {
      headers.appendChild(el('div', { class: 'cco-cal-resource-header' }, [
        el('span', { class: 'cco-cal-resource-dot', style: `background: ${colorForResource(r.resourceId)}` }),
        el('span', {}, r.resourceLabel || r.resourceId),
      ]));
    }
    if (unassigned) {
      headers.appendChild(el('div', { class: 'cco-cal-resource-header' }, [
        el('span', { class: 'cco-cal-resource-dot', style: 'background: #84756b' }),
        el('span', {}, 'Ej tilldelad'),
      ]));
    }
    right.appendChild(headers);

    // Resource columns
    const cols = el('div', {
      class: 'cco-cal-resources-grid',
      style: `grid-template-columns: repeat(${totalResources}, 1fr);`,
    });
    const renderResourceCol = (r) => {
      const col = el('div', { class: 'cco-cal-resource-col' });
      const color = colorForResource(r.resourceId);
      for (const slot of (r.slots || [])) {
        const startMin = timeToMinutes(slot.time);
        const endMin = slot.endTime ? timeToMinutes(slot.endTime) : startMin + 30;
        const top = Math.max(0, minutesToY(startMin));
        const height = Math.max(28, ((endMin - startMin) / 60) * HOUR_H - 2);
        const tone = ['confirmed', 'upcoming', 'completed'].includes(slot.status) ? 'success'
                   : slot.status === 'pending'   ? 'warning'
                   : ['cancelled', 'canceled', 'no_show'].includes(slot.status) ? 'danger' : 'info';
        col.appendChild(el('button', {
          class: 'cco-cal-booking' + (height < 38 ? ' cco-cal-booking--short' : ''),
          style: `top: ${top}px; height: ${height}px; border-left-color: ${color};`,
          dataset: { bookingid: slot.id },
          onclick: (e) => { e.stopPropagation(); onBookingClick(slot, r); },
        }, [
          el('div', { class: 'cco-cal-booking-time' }, formatTimeRange(slot.time, slot.endTime)),
          el('div', { class: 'cco-cal-booking-patient' }, slot.patientName || '(okänd patient)'),
          el('div', { class: 'cco-cal-booking-service' }, slot.serviceLabel || slot.serviceId || ''),
          bookingNoteIndicator(slot),
          el('div', { class: 'cco-cal-booking-pills' }, [
            el('span', { class: `cco-cal-pill cco-cal-pill--${tone}` }, statusLabel(slot.status)),
          ]),
        ]));
      }
      cols.appendChild(col);
    };
    resources.forEach(renderResourceCol);
    if (unassigned) renderResourceCol(unassigned);

    right.appendChild(cols);
    grid.appendChild(right);
    return grid;
  }

  // ─── Booking click → render drawer ────────────────────────────────────────
  // Status-pills tidigare hämtade från /api/v1/calendar/booking/:id/status-pills,
  // en route som aldrig funnits i backend (bekräftat 2026-08-07, ORD-100 Fas 1).
  // Anropet gick alltid fel och föll tillbaka på samma default nedan — borttaget,
  // beteendet är identiskt.
  async function onBookingClick(slot) {
    if (isReadOnlyMode()) {
      renderReadonlyDrawer(slot);
      return;
    }
    const treatment = slot.serviceId || '';
    const pills = {
      patientId: null, encounterId: null, treatment,
      journal: { status: 'missing' }, healthDeclaration: { status: 'missing' },
      fitnessCertificate: { status: 'missing' }, consent: { status: 'missing' },
      agreement: { status: 'missing' }, idVerification: { status: 'missing' },
      readyForTreatment: false, blockingMissing: [],
    };
    renderDrawer(slot, pills);
  }

  function renderReadonlyDrawer(slot) {
    const drawer = getDrawerMount();
    const placeholder = document.querySelector('.cco-cal-live-placeholder');
    if (placeholder) placeholder.hidden = true;
    drawer.innerHTML = '';
    drawer.classList.add('is-open');
    const close = () => {
      drawer.classList.remove('is-open');
      drawer.innerHTML = '';
      if (placeholder) placeholder.hidden = false;
    };
    drawer.appendChild(el('div', { class: 'cco-cal-drawer-head' }, [
      el('h3', {}, slot.patientName || '(okänd patient)'),
      el('div', { class: 'cco-cal-drawer-meta' },
        formatTimeRange(slot.time, slot.endTime) + ' · ' +
        (slot.serviceLabel || slot.serviceId || 'Bokning')),
      el('button', { class: 'cco-cal-drawer-close', onclick: close, 'aria-label': 'Stäng' }, '×'),
    ]));
    const details = [
      ['Status', statusLabel(slot.status)],
      ['Behandling', slot.serviceLabel || slot.serviceId || '—'],
      ['Källa', sourceLabel(slot.source)],
      ['Canonical patientId', slot.patientId || 'Okopplad'],
      ['Besökstillfälle', slot.encounterId || 'Saknas'],
    ];
    const detailList = el('dl', { class: 'cco-cal-read-details' });
    for (const [label, value] of details) {
      detailList.appendChild(el('dt', {}, label));
      detailList.appendChild(el('dd', {}, value));
    }
    drawer.appendChild(detailList);
    if (slot.patientId) {
      drawer.appendChild(el('button', {
        class: 'cco-cal-open-patient', type: 'button', onclick: () => openCanonicalPatient(slot.patientId),
      }, 'Öppna samma patient i Kunder V11/V12'));
    }
    drawer.appendChild(renderReadonlyBookingPreflight(slot));
    const noteFields = [
      ['Bokningsanteckning', slot.bookingNotes || slot.notes],
      ['Kundmeddelande', slot.customerMessage],
      ['Intern anteckning', slot.internalNotes],
      ['Behandlingsanteckning', slot.treatmentNotes],
    ].filter((entry) => entry[1]);
    const notes = el('section', { class: 'cco-cal-visit-notes' }, [
      el('h4', {}, 'Anteckningar'),
    ]);
    if (!noteFields.length) notes.appendChild(el('p', {}, 'Inga anteckningar registrerade.'));
    noteFields.forEach(([label, value]) => notes.appendChild(el('article', {}, [
      el('strong', {}, label), el('p', {}, value),
    ])));
    drawer.appendChild(notes);
  }

  function readonlyGate(key, label, passed, detail) {
    return {
      key,
      label,
      status: passed === true ? 'pass' : 'blocked',
      detail,
    };
  }

  function buildReadonlyBookingPreflight(slot = {}) {
    const matchStatus = String(slot.identityMatchStatus || '').trim().toLowerCase();
    const identityAmbiguous = slot.identityAmbiguous === true || slot.linkAllowed === false ||
      ['ambiguous', 'collision', 'review_required', 'multiple_matches'].includes(matchStatus);
    const patientId = identityAmbiguous ? '' : String(slot.patientId || '').trim();
    const patientName = String(slot.patientName || '').trim();
    const treatment = String(slot.serviceLabel || slot.serviceId || '').trim();
    const hasTreatment = slot.treatmentPresent !== false && Boolean(treatment);
    const resource = String(slot.resourceLabel || slot.resourceId || '').trim();
    const practitioner = String(
      slot.practitioner || slot.staffName || slot.providerName || ''
    ).trim();
    const bookingId = String(slot.bookingId || '').trim();
    const encounterId = String(slot.encounterId || '').trim();
    const timestamp = stockholmParts(slot.startsAt || slot.startAt || '');
    const hasCanonicalTime = Boolean(timestamp.date && timestamp.time);
    const timeLabel = hasCanonicalTime
      ? timestamp.date + ' kl ' + timestamp.time + ' · Europe/Stockholm'
      : 'Saknas eller är ogiltig';
    const providerKey = String(slot.source || '').trim().toLowerCase();
    const providerLabel = sourceLabel(slot.source) || 'Okänd provider';
    const providerDetail = providerKey.includes('cliento')
      ? 'Cliento write-adapter saknas.'
      : providerKey.includes('cco')
        ? 'CCO booking engine är spärrad i denna fas.'
        : 'Provider saknar verifierat write-kontrakt.';

    const gates = [
      readonlyGate('canonical_patient', 'Canonical patientId', Boolean(patientId),
        patientId ? 'Canonical patient är verifierad.' : 'Saknas; ingen patientkoppling får gissas.'),
      readonlyGate('identity_unambiguous', 'Entydig identitet', !identityAmbiguous,
        identityAmbiguous ? 'Identitetsmatchningen är tvetydig eller blockerad.' : 'Ingen tvetydighet markerad.'),
      readonlyGate('booking_reference', 'Canonical bokningsreferens', Boolean(bookingId),
        bookingId ? 'Bokningsreferens finns.' : 'Bokningsreferens saknas.'),
      readonlyGate('treatment', 'Behandling', hasTreatment,
        hasTreatment ? 'Behandling finns i canonical besöksdata.' : 'Behandling saknas.'),
      readonlyGate('resource', 'Resurs', Boolean(resource && resource !== '_unassigned' && resource !== 'Ej tilldelad'),
        resource && resource !== '_unassigned' && resource !== 'Ej tilldelad' ? 'Resurs finns.' : 'Resurs saknas eller är ej tilldelad.'),
      readonlyGate('practitioner', 'Vårdgivare', Boolean(practitioner && practitioner !== 'Ej tilldelad'),
        practitioner && practitioner !== 'Ej tilldelad' ? 'Vårdgivare finns.' : 'Vårdgivare saknas.'),
      readonlyGate('stockholm_time', 'Europe/Stockholm-tid', hasCanonicalTime,
        hasCanonicalTime ? 'Tiden är beräknad från canonical timestamp.' : 'Canonical timestamp saknas eller är ogiltig.'),
      readonlyGate('encounter_policy', 'Besökstillfälle', Boolean(encounterId),
        encounterId ? 'Canonical encounterId finns.' : 'Encounter saknas; explicit pre-visit-policy krävs före write.'),
      readonlyGate('provider_write_contract', 'Provider-write', false, providerDetail),
      readonlyGate('write_permission', 'Behörighet bookings.write', false,
        'Explicit fail-closed write-behörighet är inte aktiverad.'),
      readonlyGate('idempotency', 'Idempotency', false,
        'Obligatorisk idempotency-key och request fingerprint saknas.'),
      readonlyGate('append_only_audit', 'Append-only audit', false,
        'Requested, committed, failed och compensated audit saknas.'),
      readonlyGate('recovery', 'Återställning', false,
        'Testad rollback eller kompensation saknas.'),
    ];

    return {
      readOnly: true,
      zeroWrites: true,
      actionAllowed: false,
      identityState: identityAmbiguous ? 'ambiguous' : patientId ? 'canonical' : 'missing',
      provider: providerLabel,
      fields: [
        ['Canonical patient', patientName || 'Namn saknas'],
        ['Canonical patientId', patientId || (identityAmbiguous ? 'Tvetydig · okopplad' : 'Saknas')],
        ['Behandling', hasTreatment ? treatment : 'Saknas'],
        ['Resurs', resource && resource !== '_unassigned' ? resource : 'Saknas'],
        ['Vårdgivare', practitioner || 'Saknas'],
        ['Tid', timeLabel],
        ['Provider', providerLabel],
      ],
      gates,
      blockers: gates.filter((gate) => gate.status === 'blocked'),
    };
  }

  function renderReadonlyBookingPreflight(slot) {
    const preflight = buildReadonlyBookingPreflight(slot);
    const fields = el('dl', { class: 'cco-cal-preflight-fields' });
    preflight.fields.forEach(([label, value]) => {
      fields.appendChild(el('dt', {}, label));
      fields.appendChild(el('dd', {}, value));
    });
    const gates = el('ul', { class: 'cco-cal-preflight-gates' });
    preflight.gates.forEach((gate) => {
      const passed = gate.status === 'pass';
      gates.appendChild(el('li', { class: passed ? 'is-pass' : 'is-blocked' }, [
        el('span', { 'aria-hidden': 'true' }, passed ? '✓' : '!'),
        el('div', {}, [el('strong', {}, gate.label), el('p', {}, gate.detail)]),
      ]));
    });
    return el('section', {
      class: 'cco-cal-preflight',
      'aria-label': 'Read-only boknings-preflight',
      dataset: { readOnly: 'true', zeroWrites: 'true', actionAllowed: 'false' },
    }, [
      el('header', {}, [
        el('div', {}, [
          el('span', { class: 'cco-cal-preflight-kicker' }, 'READ-ONLY · 0 WRITES'),
          el('h4', {}, 'Boknings-preflight'),
        ]),
        el('span', { class: 'cco-cal-preflight-stop' }, 'BLOCKERAD'),
      ]),
      preflight.identityState === 'ambiguous'
        ? el('p', { class: 'cco-cal-preflight-warning' },
          'Tvetydig identitet. Posten förblir okopplad och får aldrig kopplas genom gissning.')
        : null,
      fields,
      el('h5', {}, 'Säkerhetsgrindar'),
      gates,
      el('p', { class: 'cco-cal-preflight-footnote' },
        'Ingen bekräftelse, flytt eller avbokning är tillgänglig i denna fas.'),
    ]);
  }

  function createBookingIdempotencyKey() {
    const random = global.crypto && typeof global.crypto.randomUUID === 'function'
      ? global.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    return 'calendar-create-' + random;
  }

  function createBookingPayload({ patientId, serviceId, resourceId, practitionerId, startsAt }) {
    return {
      patientId: String(patientId || '').trim(),
      serviceId: String(serviceId || '').trim(),
      resourceId: String(resourceId || '').trim(),
      practitionerId: String(practitionerId || '').trim(),
      startsAt: String(startsAt || '').trim(),
      timeZone: 'Europe/Stockholm',
      identityAmbiguous: false,
      linkAllowed: true,
    };
  }

  function renderCreateServerPreflight(preflight) {
    const section = el('section', {
      class: 'cco-cal-preflight cco-cal-create-server-preflight',
      'aria-label': 'Verifierad boknings-preflight',
      dataset: { readOnly: 'true', actionAllowed: String(preflight.actionAllowed === true) },
    });
    section.appendChild(el('header', {}, [
      el('div', {}, [
        el('span', { class: 'cco-cal-preflight-kicker' }, 'READ-ONLY PREFLIGHT · 0 WRITES'),
        el('h4', {}, 'Verifierad bokning'),
      ]),
      el('span', { class: 'cco-cal-preflight-stop' },
        preflight.actionAllowed === true ? 'REDO' : 'BLOCKERAD'),
    ]));
    const fields = el('dl', { class: 'cco-cal-preflight-fields' });
    [
      ['Canonical patient', preflight.patient?.name || 'Saknas'],
      ['Canonical patientId', preflight.patient?.patientId || 'Saknas'],
      ['Behandling', preflight.service?.label || 'Saknas'],
      ['Variant-id', preflight.service?.variantId || 'Parent-tjänst'],
      ['Klinisk parent', preflight.service?.clinicalParentServiceId || preflight.service?.serviceId || 'Saknas'],
      ['Pris', preflight.service?.priceLabel || preflight.service?.price?.display || 'Ej prissatt'],
      ['Resurs', preflight.resource?.label || 'Saknas'],
      ['Vårdgivare', preflight.practitioner?.label || 'Saknas'],
      ['Tid', preflight.time ? preflight.time.local + ' · ' + preflight.time.timeZone : 'Saknas'],
    ].forEach(([label, value]) => {
      fields.appendChild(el('dt', {}, label));
      fields.appendChild(el('dd', {}, value));
    });
    section.appendChild(fields);
    const gates = el('ul', { class: 'cco-cal-preflight-gates' });
    (preflight.gates || []).forEach((gate) => {
      const passed = gate.status === 'pass';
      gates.appendChild(el('li', { class: passed ? 'is-pass' : 'is-blocked' }, [
        el('span', { 'aria-hidden': 'true' }, passed ? '✓' : '!'),
        el('div', {}, [el('strong', {}, gate.label), el('p', {}, gate.detail)]),
      ]));
    });
    section.appendChild(el('h5', {}, 'Säkerhetsgrindar'));
    section.appendChild(gates);
    return section;
  }

  async function openCreateBookingDrawer(slot) {
    if (!isCreateBookingEnabled()) return;
    const identityAmbiguous = slot?.identityAmbiguous === true || slot?.linkAllowed === false;
    if (!slot?.patientId || identityAmbiguous) return;

    const drawer = getDrawerMount();
    drawer.innerHTML = '';
    drawer.classList.add('is-open');
    const close = () => {
      drawer.classList.remove('is-open');
      drawer.innerHTML = '';
    };
    drawer.appendChild(el('div', { class: 'cco-cal-drawer-head' }, [
      el('h3', {}, 'Skapa bokning'),
      el('div', { class: 'cco-cal-drawer-meta' }, 'Canonical patient · kontrollerat flöde'),
      el('button', { class: 'cco-cal-drawer-close', type: 'button', onclick: close, 'aria-label': 'Stäng' }, '×'),
    ]));

    const patient = el('dl', { class: 'cco-cal-preflight-fields' }, [
      el('dt', {}, 'Canonical patient'), el('dd', {}, slot.patientName || 'Namn saknas'),
      el('dt', {}, 'Canonical patientId'), el('dd', {}, slot.patientId),
    ]);
    drawer.appendChild(patient);

    const form = el('section', { class: 'cco-cal-create-controlled' });
    const serviceSelect = el('select', { class: 'cco-cal-create-input', 'aria-label': 'Behandling' });
    const resourceSelect = el('select', { class: 'cco-cal-create-input', 'aria-label': 'Resurs' });
    const practitionerSelect = el('select', { class: 'cco-cal-create-input', 'aria-label': 'Vårdgivare' });
    const dateInput = el('input', { class: 'cco-cal-create-input', type: 'date', value: isoToday(), 'aria-label': 'Datum' });
    const availabilitySelect = el('select', { class: 'cco-cal-create-input', 'aria-label': 'Ledig Stockholm-tid' });
    const message = el('p', { class: 'cco-cal-preflight-footnote', role: 'status' }, 'Laddar canonical katalog…');
    const results = el('div', { class: 'cco-cal-create-results' });
    const idempotencyKey = createBookingIdempotencyKey();
    let catalog = { services: [], resources: [] };

    function option(value, label, dataset = null) {
      const attrs = { value };
      if (dataset) attrs.dataset = dataset;
      return el('option', attrs, label);
    }
    function selectedServiceParentId() {
      const selected = serviceSelect.selectedOptions && serviceSelect.selectedOptions[0];
      return selected?.dataset?.parentServiceId || serviceSelect.value;
    }
    function serviceVariantLabel(item) {
      const price = item?.price?.display || '';
      const priceType = item?.price?.priceType || '';
      const suffix = [price, priceType].filter(Boolean).join(' · ');
      return suffix ? (item.label || item.id) + ' · ' + suffix : (item.label || item.id);
    }
    function fillCatalog() {
      serviceSelect.innerHTML = '';
      resourceSelect.innerHTML = '';
      practitionerSelect.innerHTML = '';
      const variants = (catalog.serviceVariants || []).filter((item) => item.internalBookable === true);
      const choices = variants.length ? variants : (catalog.services || []);
      choices.forEach((item) => {
        const isVariant = Boolean(item.variantId);
        serviceSelect.appendChild(option(
          isVariant ? item.variantId : item.id,
          isVariant ? serviceVariantLabel(item) : (item.label || item.id),
          isVariant
            ? {
                parentServiceId: item.parentServiceId || item.clinicalParentServiceId || '',
                variantId: item.variantId || '',
                price: item.price?.display || '',
                priceType: item.price?.priceType || '',
              }
            : null
        ));
      });
      (catalog.resources || []).forEach((item) => {
        resourceSelect.appendChild(option(item.id, item.label || item.id));
        practitionerSelect.appendChild(option(item.id, item.label || item.id));
      });
    }
    async function loadAvailability() {
      availabilitySelect.innerHTML = '';
      results.innerHTML = '';
      message.textContent = 'Kontrollerar lediga tider…';
      const params = new URLSearchParams({
        fromDate: dateInput.value,
        toDate: dateInput.value,
        resIds: resourceSelect.value,
        srvIds: selectedServiceParentId(),
      });
      try {
        const response = await fetch('/api/v1/cco-booking-engine/availability?' + params,
          { headers: calendarHeaders() });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = await response.json();
        (payload.slots || []).forEach((available) => {
          const local = stockholmParts(available.startsAt);
          availabilitySelect.appendChild(option(available.startsAt,
            local.date + ' kl ' + local.time + ' · Europe/Stockholm'));
        });
        message.textContent = availabilitySelect.options.length
          ? 'Välj en tid och kör read-only preflight.'
          : 'Inga lediga canonical tider för valt datum.';
      } catch (_) {
        message.textContent = 'Kunde inte läsa availability. Ingen bokning kan skapas.';
      }
    }

    const preflightButton = el('button', {
      class: 'quick-pill quick-pill--ai', type: 'button', disabled: 'disabled',
    }, 'Kör read-only preflight');
    preflightButton.addEventListener('click', async () => {
      results.innerHTML = '';
      if (!availabilitySelect.value) {
        message.textContent = 'Välj en canonical ledig tid.';
        return;
      }
      preflightButton.disabled = true;
      const requestBody = createBookingPayload({
        patientId: slot.patientId,
        serviceId: serviceSelect.value,
        resourceId: resourceSelect.value,
        practitionerId: practitionerSelect.value,
        startsAt: availabilitySelect.value,
      });
      try {
        const response = await fetch('/api/v1/cco-booking-engine/create/preflight', {
          method: 'POST',
          headers: { ...calendarHeaders({ json: true }), 'x-idempotency-key': idempotencyKey },
          body: JSON.stringify(requestBody),
        });
        const payload = await response.json();
        if (!payload.preflight) throw new Error(payload.error || 'preflight_failed');
        results.appendChild(renderCreateServerPreflight(payload.preflight));
        if (payload.preflight.actionAllowed !== true) {
          message.textContent = 'Preflight är blockerad. Ingen write har gjorts.';
          return;
        }
        message.textContent = 'Preflight godkänd. Kontrollera allt och bekräfta uttryckligen.';
        const confirmInput = el('input', {
          class: 'cco-cal-create-input', type: 'text', autocomplete: 'off',
          placeholder: 'Skriv SKAPA BOKNING', 'aria-label': 'Skriv SKAPA BOKNING för att bekräfta',
        });
        const confirmButton = el('button', {
          class: 'quick-pill quick-pill--success', type: 'button', disabled: 'disabled',
        }, 'Bekräfta och skapa bokning');
        confirmInput.addEventListener('input', () => {
          confirmButton.disabled = confirmInput.value !== 'SKAPA BOKNING';
        });
        confirmButton.addEventListener('click', async () => {
          confirmButton.disabled = true;
          try {
            const confirmed = await fetch('/api/v1/cco-booking-engine/create/confirm', {
              method: 'POST',
              headers: { ...calendarHeaders({ json: true }), 'x-idempotency-key': idempotencyKey },
              body: JSON.stringify({ ...requestBody, confirmText: confirmInput.value }),
            });
            const confirmedPayload = await confirmed.json();
            if (!confirmed.ok) throw new Error(confirmedPayload.error || 'booking_create_failed');
            results.innerHTML = '';
            results.appendChild(el('div', { class: 'cco-cal-ready cco-cal-ready--ok', role: 'status' },
              'Bokningen skapades. Booking ID: ' + confirmedPayload.booking.id));
            message.textContent = confirmedPayload.idempotency?.replayed
              ? 'Samma idempotenta resultat återlästes; ingen extra bokning skapades.'
              : 'Reserve → confirm och append-only audit slutfördes.';
          } catch (_) {
            message.textContent = 'Bokningen skapades inte. Kontrollera konflikt och audit innan nytt försök.';
            confirmButton.disabled = false;
          }
        });
        results.appendChild(el('div', { class: 'cco-cal-create-confirm' }, [
          el('p', { class: 'cco-cal-preflight-warning' },
            'Detta är den enda write-punkten. Skriv exakt SKAPA BOKNING för att fortsätta.'),
          confirmInput,
          confirmButton,
        ]));
      } catch (_) {
        message.textContent = 'Preflight misslyckades. Ingen write har gjorts.';
      } finally {
        preflightButton.disabled = false;
      }
    });

    form.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Behandling'));
    form.appendChild(serviceSelect);
    form.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Resurs'));
    form.appendChild(resourceSelect);
    form.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Vårdgivare'));
    form.appendChild(practitionerSelect);
    form.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Datum'));
    form.appendChild(dateInput);
    form.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Ledig tid'));
    form.appendChild(availabilitySelect);
    form.appendChild(message);
    form.appendChild(preflightButton);
    form.appendChild(results);
    drawer.appendChild(form);

    [serviceSelect, resourceSelect, practitionerSelect, dateInput].forEach((input) => {
      input.addEventListener('change', loadAvailability);
    });
    try {
      const response = await fetch('/api/v1/cco-booking-engine/catalog', { headers: calendarHeaders() });
      if (!response.ok) throw new Error('catalog_failed');
      catalog = await response.json();
      fillCatalog();
      preflightButton.disabled = false;
      await loadAvailability();
    } catch (_) {
      message.textContent = 'Canonical booking engine-katalog kunde inte läsas. Flödet är blockerat.';
    }
  }

  // ─── Drawer rendering (delas mellan desktop right-col + mobile bottom-sheet) ──
  function renderDrawer(slot, pills) {
    const drawer = getDrawerMount();
    const backdrop = getBackdropMount();
    drawer.innerHTML = '';
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');

    const close = () => {
      drawer.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      drawer.innerHTML = '';
    };
    backdrop.onclick = close;

    drawer.appendChild(el('div', { class: 'cco-cal-drawer-head' }, [
      el('h3', {}, slot.patientName || '(okänd patient)'),
      el('div', { class: 'cco-cal-drawer-meta' },
        formatTimeRange(slot.time, slot.endTime) + ' · ' + (slot.serviceLabel || slot.serviceId || 'tjänst')),
      el('button', { class: 'cco-cal-drawer-close', onclick: close, 'aria-label': 'Stäng' }, '×'),
    ]));

    // Ready banner
    if (pills.readyForTreatment === true) {
      drawer.appendChild(el('div', { class: 'cco-cal-ready cco-cal-ready--ok' },
        '🟢 Ready for treatment — alla obligatoriska dokument signerade.'));
    } else if ((pills.blockingMissing || []).length > 0) {
      const LABEL = {
        healthDeclaration: 'Hälsodeklaration',
        fitnessCertificate: 'Friskförsäkran',
        treatmentAgreement: 'Behandlingsavtal',
        treatmentConsent: 'Samtycke',
        idVerification: 'ID-verifiering',
      };
      const list = el('ul', { class: 'cco-cal-blockers' });
      for (const b of pills.blockingMissing) list.appendChild(el('li', {}, LABEL[b] || b));
      drawer.appendChild(el('div', { class: 'cco-cal-ready cco-cal-ready--blocked' }, [
        el('strong', {}, '🔴 Inte redo för behandling'),
        list,
      ]));
    }

    // Snabbactions med dynamisk primary
    const primary = computePrimary(pills, slot.bookingStatus);
    const ACTIONS = [
      { id: 'start-journal', label: 'Starta journal', icon: '📝' },
      { id: 'send-form',     label: 'Skicka formulär',icon: '📋' },
      { id: 'open-card',     label: 'Öppna kort',     icon: '👤' },
    ];
    const actions = el('div', { class: 'cco-cal-actions' });
    for (const a of ACTIONS) {
      actions.appendChild(el('button', {
        class: 'cco-cal-action',
        dataset: { primary: String(a.id === primary), action: a.id },
        onclick: () => triggerAction(a.id, slot, pills),
      }, [
        el('span', { class: 'cco-cal-action-icon' }, a.icon),
        el('span', {}, a.label),
      ]));
    }
    drawer.appendChild(actions);

    // Status-pills (6 dokumenttyper)
    const statusWrap = el('div', { class: 'cco-cal-statuses' });
    statusWrap.appendChild(el('div', { class: 'cco-cal-status-title' }, 'Dokument-status'));
    const rows = [
      ['Behandlingsjournal', pills.journal?.status],
      ['Hälsodeklaration',   pills.healthDeclaration?.status],
      ['Friskförsäkran',     pills.fitnessCertificate?.status],
      ['Samtycke',           pills.consent?.status],
      ['Behandlingsavtal',   pills.agreement?.status],
      ['ID-verifierad',      pills.idVerification?.status],
    ];
    for (const [label, status] of rows) {
      const p = pillForStatus(status || 'missing');
      statusWrap.appendChild(el('div', { class: 'cco-cal-status-row' }, [
        el('span', {}, label),
        el('span', { class: `cco-cal-pill ${p.cls}` }, p.label),
      ]));
    }
    drawer.appendChild(statusWrap);

    // Sprint 3: Kundintelligens-rail (4 insikter)
    const intelMount = el('div', { class: 'cco-cal-intel', id: 'cco-cal-intel-mount' });
    drawer.appendChild(intelMount);
    loadIntelligence(slot, pills, intelMount);

    // Patient-snapshot
    drawer.appendChild(el('div', { class: 'cco-cal-snapshot' }, [
      el('div', { class: 'cco-cal-snapshot-name' }, slot.patientName || '—'),
      el('div', { class: 'cco-cal-snapshot-meta' },
        'Patient: ' + (pills.patientId || '—') +
        (pills.encounterId ? ' · Encounter: ' + pills.encounterId.slice(0,8) + '…' : '')),
    ]));

    // Mini journal-feed (återanvänd cco-journal-feed-modulen)
    if (window.CcoJournalFeed && pills.patientId) {
      const mini = el('div', { class: 'cco-cal-mini-feed', id: 'cco-cal-mini-feed-mount' });
      drawer.appendChild(mini);
      try {
        window.CcoJournalFeed.mount('#cco-cal-mini-feed-mount', {
          customerId: pills.patientId,
          tenantId: global.__ccoCalTenantId || 'hair_tp',
          headers: {
            'x-cco-role': global.__ccoCalRole || 'owner',
            'x-cco-tenant': global.__ccoCalTenantId || 'hair_tp',
          },
        });
      } catch (_) {}
    }
  }

  function computePrimary(pills, bookingStatus) {
    if (pills && Array.isArray(pills.blockingMissing) && pills.blockingMissing.length > 0) return 'send-form';
    if (bookingStatus === 'checked_in') return 'start-journal';
    return 'start-journal';
  }

  function pillForStatus(status) {
    if (status === 'signed' || status === 'verified') return { cls: 'cco-cal-pill--success', label: '✓ Klar' };
    if (status === 'draft' || status === 'sent')       return { cls: 'cco-cal-pill--warning', label: 'Påbörjad' };
    if (status === 'missing')                          return { cls: 'cco-cal-pill--danger', label: '✗ Saknas' };
    return { cls: 'cco-cal-pill--info', label: status || '?' };
  }

  // ─── Snabbactions ────────────────────────────────────────────────────────
  async function triggerAction(actionId, slot, pills) {
    const bookingId = slot.id;
    const tenantId = global.__ccoCalTenantId || 'hair_tp';
    const role = global.__ccoCalRole || 'owner';
    const headers = { 'x-cco-role': role, 'x-cco-tenant': tenantId, 'Content-Type': 'application/json' };

    if (actionId === 'open-card') {
      if (pills.patientId) window.location.href = '/major-arcana-preview/?view=customers&v9=on&id=' + encodeURIComponent(pills.patientId);
      return;
    }
    if (actionId === 'start-journal') {
      if (!pills.patientId) { alert('Patient ej kopplad'); return; }
      window.open('/smart-anteckning.html?patientId=' + encodeURIComponent(pills.patientId) +
        (pills.encounterId ? '&encounterId=' + encodeURIComponent(pills.encounterId) : '') +
        '&tenantId=' + encodeURIComponent(tenantId), '_blank');
      return;
    }
    if (actionId === 'send-form') {
      alert('Skicka formulär — wirad i Sprint 3 (audit-only nu).');
      return;
    }
    // Okanda actionId ignoreras. Checkin/no-show/follow-up fanns tidigare men
    // pekade pa endpoints som aldrig byggts; kalendern ar read-only tills vidare
    // sa de tas inte med har. Blir kalendern skrivbar aterinfors knapp + endpoint
    // tillsammans som ett medvetet beslut.
  }

  function showToast(msg, kind) {
    document.querySelectorAll('.cco-cal-toast').forEach(n => n.remove());
    const toast = el('div', { class: 'cco-cal-toast cco-cal-toast--' + (kind || 'ok') }, msg);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function updateSideCount(label, value) {
    document.querySelectorAll('.side-link').forEach((row) => {
      if (!(row.textContent || '').includes(label)) return;
      const count = row.querySelector('.count');
      if (count) count.textContent = value == null ? '—' : String(value);
    });
  }

  function resetLiveReadUi() {
    if (!isReadOnlyMode()) return;
    document.querySelectorAll(
      '.mockup-label, .caption, .mini-inbox, .morgon-story, .story-cta-row, ' +
      '.calendar-busy, .vibe-strip, .calendar-week, .watch-widget, .watch-restore, ' +
      '.voice-overlay, .voice-sheet, .search-overlay, .calm-banner'
    ).forEach((fixture) => {
      fixture.remove();
    });
    document.querySelectorAll('.side-link .count').forEach((count) => {
      count.textContent = '…';
    });
    const status = document.querySelector('.calendar-status-bar');
    if (status) {
      status.replaceChildren(
        el('span', { class: 'status-pill status-pill--neutral' }, 'Laddar lokal kalenderdata…')
      );
    }
    const intelShell = document.querySelector('.intel-shell');
    if (intelShell && !intelShell.querySelector('.cco-cal-live-placeholder')) {
      Array.from(intelShell.children).forEach((fixture) => fixture.remove());
      intelShell.appendChild(
        el('div', { class: 'cco-cal-live-placeholder' }, [
          el('strong', {}, 'Bokningsdetaljer'),
          el('span', {}, 'Välj en bokning i kalendern.'),
        ])
      );
    }
  }

  function metricCard(label, value, tone) {
    return el('div', { class: 'cco-cal-quality-metric cco-cal-quality-metric--' + (tone || 'neutral') }, [
      el('span', {}, label), el('strong', {}, String(value ?? '—')),
    ]);
  }

  function renderQualityPanel(panel, integrity, review) {
    const content = panel.querySelector('[data-quality-content]');
    content.innerHTML = '';
    const safe = integrity?.zeroWrites === true && integrity?.readOnly === true &&
      integrity?.ok === true && review?.zeroWrites === true;
    content.appendChild(el('div', { class: 'cco-cal-quality-state ' + (safe ? 'is-ok' : 'is-stop') }, [
      el('strong', {}, safe ? 'Canonical kontroll godkänd' : 'STOPP · avvikelse i canonical kontroll'),
      el('span', {}, 'Read-only · 0 writes'),
    ]));
    const metrics = el('div', { class: 'cco-cal-quality-metrics' }, [
      metricCard('Besök', integrity?.totalVisits),
      metricCard('Integritetsfel', integrity?.totalIssues, integrity?.totalIssues === 0 ? 'ok' : 'stop'),
      metricCard('Med encounter', integrity?.encounterCoverage?.withEncounter),
      metricCard('Utan encounter', integrity?.encounterCoverage?.withoutEncounter),
      metricCard('Okopplad review', review?.total, Number(review?.total) === 55 ? 'ok' : 'stop'),
    ]);
    content.appendChild(metrics);

    const status = el('section', { class: 'cco-cal-quality-section' }, [el('h4', {}, 'Status och anteckningstäckning')]);
    const statusGrid = el('div', { class: 'cco-cal-quality-chips' });
    Object.entries(integrity?.byStatus || {}).forEach(([key, value]) =>
      statusGrid.appendChild(el('span', {}, statusLabel(key) + ' ' + value)));
    Object.entries(integrity?.noteCoverage || {}).forEach(([key, value]) =>
      statusGrid.appendChild(el('span', {}, key + ' ' + value)));
    status.appendChild(statusGrid);
    content.appendChild(status);

    const reviewSection = el('section', { class: 'cco-cal-quality-section' }, [
      el('h4', {}, 'Okopplade Cliento-poster · ingen gissningskoppling'),
    ]);
    const reasons = el('div', { class: 'cco-cal-quality-chips' });
    Object.entries(review?.byReason || {}).forEach(([key, value]) =>
      reasons.appendChild(el('span', {}, key + ' ' + value)));
    reviewSection.appendChild(reasons);
    const rows = el('div', { class: 'cco-cal-quality-rows' });
    (Array.isArray(review?.rows) ? review.rows : []).forEach((row) => rows.appendChild(el('article', {}, [
      el('div', {}, [el('strong', {}, row.bookingId || 'saknar id'), el('span', {}, row.date || 'saknar datum')]),
      el('p', {}, (row.identityBasis || []).map((item) => item.type + ': ' + item.masked).join(' · ')),
      el('p', {}, row.reason || row.reasonCode || 'Okänd orsak'),
    ])));
    if (!rows.childElementCount) rows.appendChild(el('p', {}, 'Inga review-poster.'));
    reviewSection.appendChild(rows);
    content.appendChild(reviewSection);
  }

  async function openQualityPanel(panel) {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    const content = panel.querySelector('[data-quality-content]');
    content.innerHTML = '<div class="cco-cal-empty">Läser canonical integritet…</div>';
    try {
      const headers = calendarHeaders({ tenantId: global.__ccoCalTenantId, role: global.__ccoCalRole });
      const [integrityResponse, reviewResponse] = await Promise.all([
        fetch('/api/v1/cco-bookings/canonical-integrity', { headers }),
        fetch('/api/v1/cco-bookings/cliento-unlinked-review', { headers }),
      ]);
      if (!integrityResponse.ok || !reviewResponse.ok) throw new Error('HTTP-kontroll misslyckades');
      renderQualityPanel(panel, await integrityResponse.json(), await reviewResponse.json());
    } catch (error) {
      content.innerHTML = '';
      content.appendChild(el('div', { class: 'cco-cal-quality-state is-stop' },
        'STOPP · kunde inte verifiera canonical data: ' + error.message));
    }
  }

  function bindQualityPanel() {
    if (!isReadOnlyMode() || document.getElementById('ccoCalQualityPanel')) return;
    const actions = document.querySelector('.calendar-toolbar-actions');
    if (!actions) return;
    const panel = el('section', { id: 'ccoCalQualityPanel', class: 'cco-cal-quality-panel',
      'aria-hidden': 'true', 'aria-label': 'Datakvalitet för bokningar' }, [
      el('div', { class: 'cco-cal-quality-backdrop', onclick: () => close() }),
      el('div', { class: 'cco-cal-quality-surface', role: 'dialog', 'aria-modal': 'true' }, [
        el('header', {}, [
          el('div', {}, [el('span', {}, 'READ-ONLY · CANONICAL BESÖKSDATA'), el('h3', {}, 'Datakvalitet')]),
          el('button', { type: 'button', 'aria-label': 'Stäng', onclick: () => close() }, '×'),
        ]),
        el('div', { class: 'cco-cal-quality-content', 'data-quality-content': '' }),
      ]),
    ]);
    const close = () => { panel.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); };
    actions.prepend(el('button', { class: 'cco-cal-quality-button', type: 'button',
      onclick: () => openQualityPanel(panel) }, 'Datakvalitet'));
    document.body.appendChild(panel);
  }

  function renderLiveStatus({ label, total, confirmed, pending, sourceCounts = {} }) {
    if (!isReadOnlyMode()) return;
    const status = document.querySelector('.calendar-status-bar');
    if (!status) return;
    status.replaceChildren(
      el('span', { class: 'week-pill' }, label),
      el('span', { class: 'status-pill status-pill--success' }, [
        el('span', { class: 'dot' }),
        String(confirmed || 0) + ' bokade',
      ]),
      el('span', { class: 'status-pill status-pill--warning' }, [
        el('span', { class: 'dot' }),
        String(pending || 0) + ' reservationer',
      ]),
      el('span', { class: 'status-pill status-pill--info' }, [
        el('span', { class: 'dot' }),
        String(sourceCounts.bookingEngine || 0) + ' CCO',
      ]),
      el('span', { class: 'status-pill status-pill--neutral' },
        String(sourceCounts.cliento || 0) + ' Cliento'),
      el('span', { class: 'spacer' }),
      el('span', { class: 'status-pill status-pill--neutral' }, String(total || 0) + ' totalt')
    );
  }

  function updateDaySummary(dayView) {
    if (!isReadOnlyMode()) return;
    updateSideCount('Dagens mottagning', dayView.totalSlots || 0);
    updateSideCount('Resurser', (dayView.resources || []).filter((resource) =>
      resource.resourceId !== '_unassigned').length);
    updateSideCount('Bekräftade', dayView.confirmedBookings || 0);
    updateSideCount('Tentativa', dayView.pendingReservations || 0);
    renderLiveStatus({
      label: dayView.date || 'Dag',
      total: dayView.totalSlots,
      confirmed: dayView.confirmedBookings,
      pending: dayView.pendingReservations,
      sourceCounts: dayView.sourceCounts,
    });
  }

  function renderCanonicalSidebarSummary(summary) {
    updateSideCount('Imorgon', summary.tomorrow);
    updateSideCount('Veckan', summary.week);
    updateSideCount('Konflikt', summary.conflicts == null ? 'inga data' : summary.conflicts);
    updateSideCount('Återbesök', summary.returnVisits);
  }

  async function refreshCanonicalSidebarSummary(date, tenantId, role) {
    if (!isReadOnlyMode()) return;
    try {
      const selectedDate = date || isoToday();
      const startDate = startOfWeek(selectedDate);
      const end = new Date(startDate + 'T12:00:00.000Z');
      end.setUTCDate(end.getUTCDate() + 6);
      const tomorrow = new Date(selectedDate + 'T12:00:00.000Z');
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      if (tomorrow > end) end.setTime(tomorrow.getTime());
      const visits = await loadCanonicalVisits(
        startDate, end.toISOString().slice(0, 10), tenantId, role);
      renderCanonicalSidebarSummary(buildCanonicalSidebarSummary(selectedDate, visits));
    } catch (_) {
      ['Imorgon', 'Veckan', 'Konflikt', 'Återbesök'].forEach((label) =>
        updateSideCount(label, 'inga data'));
    }
  }

  // ─── Main load ───────────────────────────────────────────────────────────
  async function loadDay(opts = {}) {
    const date = opts.date || isoToday();
    const tenantId = opts.tenantId || global.__ccoCalTenantId || 'hair_tp';
    const role = opts.role || global.__ccoCalRole || 'owner';
    global.__ccoCalTenantId = tenantId;
    global.__ccoCalRole = role;

    const mount = ensureDayMount();
    if (!mount) return;
    mount.innerHTML = '<div class="cco-cal-empty">Laddar dagens kalender…</div>';

    try {
      if (isReadOnlyMode()) {
        const visits = await loadCanonicalVisits(date, date, tenantId, role);
        const dayView = canonicalDayView(date, visits);
        mount.innerHTML = '';
        mount.appendChild(renderDayGrid(dayView, onBookingClick));
        updateDaySummary(dayView);
        await refreshCanonicalSidebarSummary(date, tenantId, role);
        const title = document.getElementById('calTitle');
        if (title) {
          const d = new Date(date + 'T00:00:00');
          title.textContent = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }) +
            ' · ' + dayView.totalSlots + ' bokningar';
        }
        return;
      }
      const query = new URLSearchParams({ date });
      if (!isReadOnlyMode()) query.set('tenantId', tenantId);
      const res = await fetch('/api/v1/calendar/day?' + query.toString(), {
        headers: calendarHeaders({ tenantId, role }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          mount.innerHTML = '<div class="cco-cal-empty">Inloggningen saknas eller har gått ut.</div>';
          return;
        }
        if (res.status === 403) {
          mount.innerHTML = '<div class="cco-cal-empty">Du saknar läsbehörighet till kalendern.</div>';
          return;
        }
        throw new Error('HTTP ' + res.status);
      }
      const dayView = await res.json();
      mount.innerHTML = '';
      mount.appendChild(renderDayGrid(dayView, onBookingClick));
      updateDaySummary(dayView);
      refreshCanonicalSidebarSummary(date, tenantId, role);

      // Uppdatera title (existing #calTitle)
      const title = document.getElementById('calTitle');
      if (title && dayView.date) {
        const d = new Date(dayView.date + 'T00:00:00');
        title.textContent = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }) +
          ' · ' + (dayView.totalSlots || 0) + ' bokningar';
      }
    } catch (err) {
      mount.innerHTML = '<div class="cco-cal-empty">Kunde inte ladda: ' + err.message + '</div>';
    }
  }

  // ═══ SPRINT 3: Kundintelligens-rail (4 insikter) ═══════════════════════════
  // Hämtade tidigare från /api/v1/calendar/booking/:id/intelligence, en route
  // som aldrig funnits i backend (bekräftat 2026-08-07, ORD-100 Fas 1). Anropet
  // gick alltid fel och visade samma "ej tillgängliga"-läge som nu — borttaget.
  async function loadIntelligence(slot, pills, mount) {
    mount.innerHTML = '<div class="cco-cal-intel-empty">Insikter ej tillgängliga.</div>';
  }

  function renderIntelligence(mount, data) {
    const ins = data.insights || {};
    mount.innerHTML = '';
    mount.appendChild(el('div', { class: 'cco-cal-intel-title' }, 'Kundintelligens'));

    // 1. Readiness
    const r = ins.readiness || {};
    const rTone = r.status === 'ready' ? 'ok' : r.status === 'blocked' ? 'danger' : 'info';
    mount.appendChild(el('div', { class: 'cco-cal-intel-card cco-cal-intel-card--' + rTone }, [
      el('div', { class: 'cco-cal-intel-kicker' }, '✓ Ready-for-treatment'),
      el('div', { class: 'cco-cal-intel-headline' },
        r.status === 'ready' ? 'Klar för behandling' :
        r.status === 'blocked' ? (r.blockingCount + ' dokument saknas') :
        '— ingen behandling-mappning'),
      r.hint ? el('div', { class: 'cco-cal-intel-sub' }, r.hint) : null,
    ]));

    // 2. Risk
    const rk = ins.risk || {};
    const rkTone = rk.level === 'high' ? 'danger' : rk.level === 'medium' ? 'warning' : 'ok';
    mount.appendChild(el('div', { class: 'cco-cal-intel-card cco-cal-intel-card--' + rkTone }, [
      el('div', { class: 'cco-cal-intel-kicker' }, '⚠ Risk · no-show'),
      el('div', { class: 'cco-cal-intel-headline' },
        rk.level === 'high' ? 'Hög risk' :
        rk.level === 'medium' ? 'Medel risk' :
        rk.level === 'low' ? 'Låg risk' : '—'),
      el('div', { class: 'cco-cal-intel-sub' },
        'No-shows: ' + (rk.noShowCount || 0) +
        ' · sena avbok: ' + (rk.lateCancelCount || 0)),
      rk.hint ? el('div', { class: 'cco-cal-intel-sub cco-cal-intel-sub--italic' }, rk.hint) : null,
    ]));

    // 3. Engagement + NBA
    const eng = ins.engagement || {};
    const nba = eng.nextBestAction;
    mount.appendChild(el('div', { class: 'cco-cal-intel-card cco-cal-intel-card--info' }, [
      el('div', { class: 'cco-cal-intel-kicker' }, '⌘ Senaste kontakt'),
      el('div', { class: 'cco-cal-intel-headline' },
        eng.daysSinceContact === null ? 'Ingen kontakt registrerad' :
        eng.daysSinceContact === 0 ? 'Idag' :
        eng.daysSinceContact === 1 ? 'Igår' :
        eng.daysSinceContact + ' dagar sedan'),
      eng.lastContactKind ? el('div', { class: 'cco-cal-intel-sub' }, 'Senaste: ' + eng.lastContactKind) : null,
      nba ? el('div', { class: 'cco-cal-intel-nba' }, [
        el('span', { class: 'cco-cal-intel-nba-icon' }, '→'),
        el('div', {}, [
          el('strong', {}, 'Föreslagen åtgärd: ' + nba.action),
          el('div', { class: 'cco-cal-intel-sub' }, nba.reason || ''),
        ]),
      ]) : null,
    ]));

    // 4. Kommersiell
    const c = ins.commercial || {};
    const tier = c.ltvTier || 'standard';
    const tierTone = tier === 'platinum' ? 'gold' : tier === 'gold' ? 'gold' : tier === 'silver' ? 'info' : tier === 'new' ? 'warning' : 'ok';
    mount.appendChild(el('div', { class: 'cco-cal-intel-card cco-cal-intel-card--' + tierTone }, [
      el('div', { class: 'cco-cal-intel-kicker' }, '◆ Kommersiell · ' + tier.toUpperCase()),
      el('div', { class: 'cco-cal-intel-headline' },
        c.agreementState === 'signed' ? 'Avtal signerat' :
        c.agreementState === 'sent' ? 'Avtal skickat' :
        c.offerState === 'accepted' ? 'Offert accepterad' :
        c.offerState === 'sent' ? 'Offert skickad' :
        'Ingen aktiv affär'),
      c.totalSignedValue ? el('div', { class: 'cco-cal-intel-sub' },
        'LTV: ' + (c.totalSignedValue.toLocaleString('sv-SE') || c.totalSignedValue) + ' SEK') : null,
    ]));
  }

  // ═══ FAS 4: VECKOVY ════════════════════════════════════════════════════════
  function startOfWeek(iso) {
    const d = new Date(iso + 'T12:00:00.000Z');
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  }
  function weekNumber(d) {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function ensureWeekMount() {
    const content = document.querySelector('.calendar-content');
    if (!content) return null;
    let mount = content.querySelector('#cco-cal-week-mount');
    if (mount) return mount;
    mount = el('div', { id: 'cco-cal-week-mount', class: 'cco-cal-week-mount' });
    content.appendChild(mount);
    return mount;
  }

  function renderWeekGrid(weekView, onBookingClickFn) {
    const days = weekView.days || [];
    if (days.length === 0) return el('div', { class: 'cco-cal-empty' }, 'Ingen vecko-data.');
    if ((weekView.totalSlots || 0) === 0) {
      return el('div', { class: 'cco-cal-empty' }, 'Inga bokningar registrerade för veckan.');
    }

    const grid = el('div', { class: 'cco-cal-week-grid' });

    // Hour-col (60px)
    const hourCol = el('div', { class: 'cco-cal-hour-col' });
    hourCol.appendChild(el('div', { class: 'cco-cal-week-header-spacer' }));
    for (let h = HOUR_START; h < HOUR_END; h++) {
      hourCol.appendChild(el('div', { class: 'cco-cal-hour-row' }, String(h).padStart(2,'0') + ':00'));
    }
    grid.appendChild(hourCol);

    // 7 dag-kolumner
    for (const day of days) {
      const dateObj = new Date(day.date + 'T12:00:00.000Z');
      const isToday = day.date === isoToday();
      const col = el('div', { class: 'cco-cal-week-day-col' });
      col.appendChild(el('div', {
        class: 'cco-cal-week-day-header' + (isToday ? ' is-today' : ''),
      }, [
        el('div', { class: 'cco-cal-week-day-name' }, dateObj.toLocaleDateString('sv-SE', {
          weekday: 'short',
          timeZone: 'UTC',
        })),
        el('div', { class: 'cco-cal-week-day-num' }, String(dateObj.getDate())),
        el('div', { class: 'cco-cal-week-day-count' }, (day.totalSlots || 0) + ' bok.'),
      ]));

      // Bokningar (alla resurser flat)
      const colBody = el('div', { class: 'cco-cal-week-day-body' });
      const bookings = (day.resources || []).flatMap(r =>
        (r.slots || []).map(s => ({ ...s, _resource: r }))
      );
      for (const slot of bookings) {
        const startMin = timeToMinutes(slot.time);
        const endMin = slot.endTime ? timeToMinutes(slot.endTime) : startMin + 30;
        const top = Math.max(0, minutesToY(startMin));
        const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_H - 2);
        const color = colorForResource(slot._resource?.resourceId || '');
        const tone = ['confirmed', 'upcoming', 'completed'].includes(slot.status) ? 'success'
                   : slot.status === 'pending'   ? 'warning'
                   : ['cancelled', 'canceled', 'no_show'].includes(slot.status) ? 'danger' : 'info';
        colBody.appendChild(el('button', {
          class: 'cco-cal-booking cco-cal-booking--compact',
          style: `top: ${top}px; height: ${height}px; border-left-color: ${color};`,
          dataset: { bookingid: slot.id },
          onclick: (e) => { e.stopPropagation(); onBookingClickFn(slot, slot._resource); },
          title: (slot.time || '') + ' ' + (slot.patientName || ''),
        }, [
          el('div', { class: 'cco-cal-booking-time' }, slot.time || ''),
          el('div', { class: 'cco-cal-booking-patient' }, slot.patientName || '—'),
          el('div', { class: 'cco-cal-booking-service' }, slot.serviceLabel || slot.serviceId || ''),
          bookingNoteIndicator(slot),
          el('div', { class: 'cco-cal-booking-pills' }, [
            el('span', { class: `cco-cal-pill cco-cal-pill--${tone}` }, statusLabel(slot.status)),
          ]),
        ]));
      }
      col.appendChild(colBody);
      grid.appendChild(col);
    }
    return grid;
  }

  async function loadWeek(opts = {}) {
    const startDate = startOfWeek(opts.date || isoToday());
    const tenantId = opts.tenantId || global.__ccoCalTenantId || 'hair_tp';
    const role = opts.role || global.__ccoCalRole || 'owner';
    global.__ccoCalTenantId = tenantId;
    global.__ccoCalRole = role;

    const mount = ensureWeekMount();
    if (!mount) return;
    mount.innerHTML = '<div class="cco-cal-empty">Laddar vecka…</div>';

    try {
      if (isReadOnlyMode()) {
        const end = new Date(startDate + 'T12:00:00.000Z');
        end.setUTCDate(end.getUTCDate() + 6);
        const visits = await loadCanonicalVisits(startDate, end.toISOString().slice(0, 10), tenantId, role);
        const weekView = canonicalWeekView(startDate, visits);
        mount.innerHTML = '';
        mount.appendChild(renderWeekGrid(weekView, onBookingClick));
        await refreshCanonicalSidebarSummary(opts.date || isoToday(), tenantId, role);
        const totals = weekView.days.reduce((summary, day) => {
          summary.confirmed += day.confirmedBookings;
          summary.pending += day.pendingReservations;
          summary.sourceCounts.bookingEngine += day.sourceCounts.bookingEngine;
          summary.sourceCounts.cliento += day.sourceCounts.cliento;
          return summary;
        }, { confirmed: 0, pending: 0, sourceCounts: { bookingEngine: 0, cliento: 0 } });
        renderLiveStatus({ label: 'Vecka ' + weekNumber(new Date(startDate + 'T12:00:00.000Z')),
          total: weekView.totalSlots, ...totals });
        const title = document.getElementById('calTitle');
        if (title) title.textContent = 'Vecka ' + weekNumber(new Date(startDate + 'T12:00:00.000Z')) +
          ' · ' + weekView.totalSlots + ' bokningar';
        return;
      }
      const query = new URLSearchParams({ startDate });
      if (!isReadOnlyMode()) query.set('tenantId', tenantId);
      const res = await fetch('/api/v1/calendar/week?' + query.toString(), {
        headers: calendarHeaders({ tenantId, role }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          mount.innerHTML = '<div class="cco-cal-empty">Inloggningen saknas eller har gått ut.</div>';
          return;
        }
        if (res.status === 403) {
          mount.innerHTML = '<div class="cco-cal-empty">Du saknar läsbehörighet till kalendern.</div>';
          return;
        }
        throw new Error('HTTP ' + res.status);
      }
      const weekView = await res.json();
      mount.innerHTML = '';
      mount.appendChild(renderWeekGrid(weekView, onBookingClick));
      const totals = (weekView.days || []).reduce(
        (summary, day) => {
          summary.confirmed += day.confirmedBookings || 0;
          summary.pending += day.pendingReservations || 0;
          summary.sourceCounts.bookingEngine += day.sourceCounts?.bookingEngine || 0;
          summary.sourceCounts.cliento += day.sourceCounts?.cliento || 0;
          return summary;
        },
        { confirmed: 0, pending: 0, sourceCounts: { bookingEngine: 0, cliento: 0 } }
      );
      if (isReadOnlyMode()) {
        updateSideCount('Veckan', weekView.totalSlots || 0);
        renderLiveStatus({
          label: 'Vecka ' + weekNumber(new Date(startDate + 'T12:00:00.000Z')),
          total: weekView.totalSlots,
          confirmed: totals.confirmed,
          pending: totals.pending,
          sourceCounts: totals.sourceCounts,
        });
      }

      // Uppdatera existing #calTitle
      const title = document.getElementById('calTitle');
      if (title) {
        const sd = new Date(startDate + 'T12:00:00.000Z');
        const ed = new Date(sd); ed.setUTCDate(ed.getUTCDate() + 6);
        const fmt = d => d.toLocaleDateString('sv-SE', {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        });
        title.textContent = 'Vecka ' + weekNumber(sd) + ' · ' + fmt(sd) + '–' + fmt(ed);
      }
    } catch (err) {
      mount.innerHTML = '<div class="cco-cal-empty">Kunde inte ladda vecka: ' + err.message + '</div>';
    }
  }

  // ═══ CREATE-MODAL (Sprint 2) ═══════════════════════════════════════════════
  // Tjänster/resurser läses från /api/v1/cco-booking-engine/catalog (se
  // renderCreateBookingDrawer). Död kod som anropade /api/v1/calendar/services
  // och /api/v1/calendar/day har tagits bort.

  // ─── Hook in i existing setMode-flow ────────────────────────────────────
  function bindSetModeHook() {
    const tryBind = () => {
      const tabs = document.querySelectorAll('.segment-tab');
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          const mode = t.dataset.mode;
          if (mode === 'dag') {
            setTimeout(() => loadDay({}), 50);
          } else if (mode === 'vecka') {
            setTimeout(() => loadWeek({}), 50);
          }
        });
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryBind);
    } else {
      tryBind();
    }
  }

  // ─── Original V6 · canonical read-only renderer ────────────────────────
  // The V6 HTML remains the visual source of truth. This adapter only replaces
  // its static preview values with the same canonical visit records used by the
  // other CCO calendar views. It deliberately exposes no booking mutations.
  const V6_HOUR_START = 6;
  const V6_HOUR_HEIGHT = 62;
  const V6_DAY_NAMES = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
  const V6_MONTH_NAMES = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december',
  ];
  const v6State = {
    weekStart: '',
    dayDate: '',
    visits: [],
    displayVisits: [],
    selected: null,
    mode: 'vecka',
    filters: { resourceId: '', serviceId: '' },
  };

  function v6FilteredVisits() {
    const { resourceId, serviceId } = v6State.filters;
    if (!resourceId && !serviceId) return v6State.visits;
    return v6State.visits.filter((slot) => {
      if (resourceId && slot.resourceId !== resourceId) return false;
      if (serviceId && slot.serviceId !== serviceId) return false;
      return true;
    });
  }

  function v6ApplyFilters() {
    v6State.displayVisits = v6FilteredVisits();
    v6RenderWeek(v6State.displayVisits);
    v6UpdateSidebars(v6State.displayVisits);
    v6UpdateStory(v6State.displayVisits);
    v6UpdateOriginalHome(v6State.displayVisits);
    const selected = v6State.selected && v6State.displayVisits.find((slot) =>
      slot.id === v6State.selected.id || slot.bookingId === v6State.selected.bookingId);
    v6State.selected = selected || v6State.displayVisits.find((slot) => slot.date === isoToday()) ||
      v6State.displayVisits.find((slot) => slot.date >= isoToday()) ||
      v6State.displayVisits[0] || null;
    v6RenderIntel(v6State.selected);
  }

  function v6BuildFilters() {
    const bar = document.getElementById('ccoCalFilters');
    if (!bar) return;
    const resourceSelect = bar.querySelector('[data-filter="resource"]');
    const serviceSelect = bar.querySelector('[data-filter="service"]');
    if (!resourceSelect || !serviceSelect) return;

    const resources = new Map();
    const services = new Map();
    v6State.visits.forEach((slot) => {
      if (slot.resourceId) resources.set(slot.resourceId, slot.resourceLabel || slot.resourceId);
      if (slot.serviceId) services.set(slot.serviceId, slot.serviceLabel || slot.serviceId);
    });

    const currentResource = resourceSelect.value;
    const currentService = serviceSelect.value;

    function fill(select, items, emptyLabel) {
      select.innerHTML = '';
      select.appendChild(el('option', { value: '' }, emptyLabel));
      [...items.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'sv-SE'))
        .forEach(([id, label]) => select.appendChild(el('option', { value: id }, label)));
    }

    fill(resourceSelect, resources, 'Alla resurser');
    fill(serviceSelect, services, 'Alla behandlingar');

    resourceSelect.value = resources.has(currentResource) ? currentResource : v6State.filters.resourceId;
    serviceSelect.value = services.has(currentService) ? currentService : v6State.filters.serviceId;
  }

  function v6IsoOffset(dateKey, days) {
    const date = new Date(dateKey + 'T12:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function v6WeekStart(dateKey) {
    const date = new Date(dateKey + 'T12:00:00.000Z');
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
  }

  function v6WeekNumber(dateKey) {
    const date = new Date(dateKey + 'T12:00:00.000Z');
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function v6Initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase()).join('') || '?';
  }

  function v6StatusKey(status) {
    const value = String(status || '').toLowerCase();
    if (['cancelled', 'canceled', 'no_show'].includes(value)) return 'cancelled';
    if (value === 'completed') return 'followup';
    if (value === 'pending') return 'tentative';
    return 'confirmed';
  }

  function v6StatusCounts(visits) {
    const counts = { booked: 0, completed: 0, cancelled: 0, noShow: 0 };
    visits.forEach((slot) => {
      const status = String(slot.status || '').toLowerCase();
      if (status === 'completed') counts.completed += 1;
      else if (['cancelled', 'canceled'].includes(status)) counts.cancelled += 1;
      else if (status === 'no_show') counts.noShow += 1;
      else counts.booked += 1;
    });
    return counts;
  }

  function v6SetText(node, value) {
    if (node) node.textContent = value;
  }

  function v6SetStoryKicker(card, label) {
    const kicker = card && card.querySelector('.story-card-kicker');
    if (!kicker) return;
    const icon = kicker.querySelector('.icon');
    kicker.innerHTML = '';
    if (icon) kicker.appendChild(icon);
    kicker.appendChild(document.createTextNode(label));
  }

  function v6SetStoryHeadline(card, value, numberValue) {
    const headline = card && card.querySelector('.story-card-headline');
    if (!headline) return;
    headline.innerHTML = '';
    if (numberValue !== undefined && numberValue !== null) {
      headline.appendChild(el('span', { class: 'num' }, String(numberValue)));
      headline.appendChild(document.createTextNode(' ' + value));
      return;
    }
    headline.textContent = value;
  }

  function v6StoryItem({ severity = 'ok', badge = '—', who, what, when = '' }) {
    return el('div', { class: 'story-item', dataset: { severity } }, [
      el('span', { class: 'badge' }, badge),
      el('span', {}, [
        el('span', { class: 'who' }, who),
        el('span', { class: 'what' }, what),
      ]),
      el('span', { class: 'when' }, when),
    ]);
  }

  const dossierCache = new Map();
  async function fetchPatientDossier(patientId) {
    if (!patientId) return null;
    if (dossierCache.has(patientId)) return dossierCache.get(patientId);
    try {
      const response = await fetch('/api/v1/cco-patient-master/patient/dossier-bundle?patientId=' +
        encodeURIComponent(patientId), { headers: calendarHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      dossierCache.set(patientId, payload);
      return payload;
    } catch (error) {
      console.warn('Kunde inte hämta dossier:', error);
      return null;
    }
  }

  function v6RenderDossierTab(shell, slot, tab) {
    const content = shell.querySelector('.ai-reason');
    if (!content) return;
    content.innerHTML = '';
    if (!slot?.patientId) {
      content.textContent = 'Välj ett besök med en kopplad patient för att visa dossié.';
      return;
    }
    content.appendChild(el('div', { class: 'cco-cal-empty' }, 'Läser patientdossié…'));
    fetchPatientDossier(slot.patientId).then((dossier) => {
      if (v6State.selected !== slot) return;
      content.innerHTML = '';
      if (!dossier) {
        content.textContent = 'Dossié kunde inte hämtas.';
        return;
      }
      const renderList = (items, render) => {
        if (!items || !items.length) return el('p', { class: 'cco-cal-dossier-empty' }, 'Inga poster.');
        const list = el('div', { class: 'cco-cal-dossier-list' });
        items.forEach((item) => list.appendChild(render(item)));
        return list;
      };
      const fmtDate = (value) => {
        if (!value) return '—';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('sv-SE', {
          timeZone: 'Europe/Stockholm', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        });
      };
      if (tab === 'Besök') {
        const visits = [
          ...(dossier.upcomingBookings || []),
          ...(dossier.historyBookings || []),
        ];
        content.appendChild(renderList(visits, (v) => el('div', { class: 'cco-cal-dossier-row' }, [
          el('strong', {}, v.serviceDisplayName || v.serviceName || v.serviceId || 'Besök'),
          el('span', {}, fmtDate(v.startsAt) + ' · ' + (v.status || '')),
        ])));
      } else if (tab === 'Historik') {
        const timeline = dossier.occasionTimeline || dossier.visitSegments || [];
        content.appendChild(renderList(timeline, (t) => el('div', { class: 'cco-cal-dossier-row' }, [
          el('strong', {}, t.label || t.type || 'Händelse'),
          el('span', {}, fmtDate(t.date || t.startsAt || t.createdAt)),
        ])));
      } else if (tab === 'Filer') {
        content.appendChild(renderList(dossier.driveFiles || [], (f) => el('div', { class: 'cco-cal-dossier-row' }, [
          el('strong', {}, f.name || f.fileName || 'Fil'),
          el('span', {}, (f.mimeType || '').split('/')[1] || f.mimeType || ''),
        ])));
      } else if (tab === 'Anteckningar') {
        const notes = [
          ...(dossier.journalEntries || []),
          ...(dossier.communicationMessages || []),
        ];
        content.appendChild(renderList(notes, (n) => el('div', { class: 'cco-cal-dossier-row' }, [
          el('strong', {}, n.type || n.kind || 'Anteckning'),
          el('span', {}, n.text || n.summary || n.content || fmtDate(n.createdAt)),
        ])));
      }
    });
  }

  function v6RenderIntel(slot) {
    const shell = document.querySelector('.intel-shell');
    if (!shell) return;
    v6State.selected = slot || null;
    shell.dataset.readOnly = 'true';
    shell.dataset.zeroWrites = 'true';
    v6SetText(shell.querySelector('.intel-avatar'), v6Initials(slot && slot.patientName));
    v6SetText(shell.querySelector('.intel-name'), slot ? (slot.patientName || 'Okopplad patient') : 'Välj ett besök');
    v6SetText(shell.querySelector('.intel-meta'), slot
      ? statusLabel(slot.status) + ' · ' + sourceLabel(slot.source)
      : 'Canonical bokningsdata · read-only');

    const grid = shell.querySelector('.intel-grid');
    if (grid) {
      grid.innerHTML = '';
      const rows = slot ? [
        ['Canonical patientId', slot.patientId || 'Okopplad'],
        ['Besökstillfälle', slot.encounterId || 'Saknas'],
        ['Behandling', slot.serviceLabel || slot.serviceId || 'Saknas'],
        ['Tid', slot.date + ' · ' + formatTimeRange(slot.time, slot.endTime) + ' · Europe/Stockholm'],
        ['Resurs', slot.resourceLabel || 'Ej tilldelad'],
        ['Vårdgivare', slot.practitioner || slot.staffName || 'Ej tilldelad'],
        ['Källa', sourceLabel(slot.source)],
        ['Status', statusLabel(slot.status)],
      ] : [['Läge', 'Välj ett canonical besök i kalendern.']];
      rows.forEach(([label, value]) => {
        grid.appendChild(el('dt', {}, label));
        grid.appendChild(el('dd', {}, value));
      });
    }

    const ready = shell.querySelector('.ready-row');
    if (ready) {
      ready.innerHTML = '';
      if (slot) {
        const preflight = buildReadonlyBookingPreflight(slot);
        preflight.gates.slice(0, 7).forEach((gate) => {
          ready.appendChild(el('span', {
            class: 'ready-pill',
            dataset: { state: gate.status === 'pass' ? 'success' : 'warning' },
            title: gate.detail,
          }, (gate.status === 'pass' ? '✓ ' : '! ') + gate.label));
        });
      }
      ready.appendChild(el('span', {
        class: 'ready-pill', dataset: { state: 'warning' },
      }, 'READ-ONLY · 0 WRITES'));
    }

    const notes = shell.querySelector('.ai-reason');
    if (notes) {
      notes.innerHTML = '';
      const noteFields = slot ? [
        ['Bokningsanteckning', slot.bookingNotes || slot.notes],
        ['Kundmeddelande', slot.customerMessage],
        ['Intern anteckning', slot.internalNotes],
        ['Behandlingsanteckning', slot.treatmentNotes],
      ].filter((entry) => entry[1]) : [];
      if (!noteFields.length) {
        notes.textContent = slot
          ? 'Inga anteckningar registrerade för detta besök.'
          : 'Välj ett besök för att visa canonical anteckningar.';
      } else {
        noteFields.forEach(([label, value]) => {
          notes.appendChild(el('strong', {}, label));
          notes.appendChild(el('p', {}, value));
        });
      }
    }

    const tabs = shell.querySelector('.intel-tabs');
    if (tabs) {
      tabs.innerHTML = '';
      const labels = ['Besök', 'Historik', 'Filer', 'Anteckningar'];
      labels.forEach((label, index) => {
        const button = el('button', {
          class: 'intel-tab' + (index === 0 ? ' active' : ''), type: 'button',
        }, label);
        button.addEventListener('click', () => {
          tabs.querySelectorAll('.intel-tab').forEach((t) => t.classList.remove('active'));
          button.classList.add('active');
          v6RenderDossierTab(shell, slot, label);
        });
        tabs.appendChild(button);
      });
    }

    const actions = shell.querySelector('.intel-actions');
    if (actions) {
      actions.innerHTML = '';
      if (slot && slot.patientId && slot.linkAllowed !== false && !slot.identityAmbiguous) {
        actions.appendChild(el('button', {
          class: 'quick-pill quick-pill--success', type: 'button',
          onclick: () => openCanonicalPatient(slot.patientId),
        }, 'Öppna samma patient i Kunder V11/V12'));
        if (isCreateBookingEnabled()) {
          actions.appendChild(el('button', {
            class: 'quick-pill quick-pill--ai', type: 'button',
            onclick: () => openCreateBookingDrawer(slot),
          }, 'Skapa bokning'));
        }
      } else {
        actions.appendChild(el('button', {
          class: 'quick-pill quick-pill--success', type: 'button', disabled: 'disabled',
        }, 'Välj besök för canonical patient'));
      }
      [
        ['quick-pill quick-pill--ai', 'Boknings-preflight · read-only'],
        ['quick-pill quick-pill--ai', 'Säkerhetsgrindar · read-only'],
        ['quick-pill', 'Anteckningar · read-only'],
        ['quick-pill', 'Resurs och vårdgivare · read-only'],
        ['quick-pill', 'Ombokning avstängd'],
      ].forEach(([className, label]) => actions.appendChild(el('button', {
        class: className, type: 'button', disabled: 'disabled',
      }, label)));
    }
  }

  function v6BookingCard(slot) {
    const start = timeToMinutes(slot.time);
    const fallbackEnd = slot.durationMinutes ? start + Number(slot.durationMinutes) : start + 30;
    const end = slot.endTime ? timeToMinutes(slot.endTime) : fallbackEnd;
    const top = Math.max(0, ((start - V6_HOUR_START * 60) / 60) * V6_HOUR_HEIGHT);
    const height = Math.max(31, ((Math.max(end, start + 15) - start) / 60) * V6_HOUR_HEIGHT);
    const card = el('button', {
      class: 'booking', type: 'button',
      style: 'top:' + top + 'px;height:' + height + 'px;--rail-color:' + colorForResource(slot.resourceId),
      dataset: {
        bookingId: slot.bookingId || slot.id || '', patientId: slot.patientId || '',
        encounterId: slot.encounterId || '', status: v6StatusKey(slot.status), source: 'canonical',
      },
      onclick: (event) => { event.stopPropagation(); v6RenderIntel(slot); },
    }, [
      el('div', { class: 'booking-time' }, formatTimeRange(slot.time, slot.endTime)),
      el('div', { class: 'booking-title' }, slot.serviceLabel || slot.serviceId || 'Bokning'),
      el('div', { class: 'booking-sub' }, slot.patientName || 'Okopplad patient'),
    ]);
    const noteCount = bookingNoteCount(slot);
    card.setAttribute('aria-label', [slot.patientName || 'Okopplad patient',
      slot.serviceLabel || 'Bokning', formatTimeRange(slot.time, slot.endTime),
      statusLabel(slot.status), noteCount ? noteCount + ' anteckning(ar)' : null]
      .filter(Boolean).join(' · '));
    return card;
  }

  function v6UpdateSidebars(visits) {
    const today = isoToday();
    const tomorrow = v6IsoOffset(today, 1);
    const selected = visits.filter((slot) => slot.date === today);
    const counts = v6StatusCounts(visits);
    const sideRows = document.querySelectorAll('.side-shell > .side-list .side-link');
    const resources = new Set(visits.map((slot) => slot.resourceId).filter((id) => id && id !== '_unassigned'));
    const sideValues = [selected.length, visits.filter((slot) => slot.date === tomorrow).length,
      visits.length, resources.size];
    sideRows.forEach((row, index) => v6SetText(row.querySelector('.count'), String(sideValues[index] || 0)));

    const statusRows = document.querySelectorAll('.side-section .side-link');
    const statusValues = [
      ['Bokade', counts.booked], ['Genomförda', counts.completed],
      ['Avbokade', counts.cancelled], ['Uteblivna', counts.noShow],
    ];
    statusRows.forEach((row, index) => {
      const label = row.querySelector('span[style]');
      const dot = label && label.querySelector('.dot');
      if (label && statusValues[index]) {
        label.textContent = '';
        if (dot) label.appendChild(dot);
        label.appendChild(document.createTextNode(statusValues[index][0]));
      }
      v6SetText(row.querySelector('.count'), String(statusValues[index] ? statusValues[index][1] : 0));
    });

    const pills = document.querySelectorAll('.calendar-status-bar .status-pill');
    const pillValues = [
      counts.booked + ' bokade', counts.completed + ' genomförda',
      counts.cancelled + ' avbokade', counts.noShow + ' uteblivna',
    ];
    pills.forEach((pill, index) => {
      if (pillValues[index]) {
        const dot = pill.querySelector('.dot');
        pill.textContent = '';
        if (dot) pill.appendChild(dot);
        pill.appendChild(document.createTextNode(pillValues[index]));
      } else if (index >= pillValues.length) {
        pill.hidden = true;
      }
    });
  }

  function v6UpdateStory(visits) {
    const today = isoToday();
    const todayVisits = visits.filter((slot) => slot.date === today);
    const greeting = document.querySelector('.greet-text');
    if (greeting) {
      const date = new Date(today + 'T12:00:00.000Z');
      const heading = greeting.querySelector('h1');
      if (heading) {
        heading.innerHTML = '';
        heading.appendChild(document.createTextNode('God morgon, '));
        heading.appendChild(el('span', {}, 'Fazli'));
      }
      v6SetText(greeting.querySelector('p'), date.toLocaleDateString('sv-SE', {
        timeZone: 'Europe/Stockholm', weekday: 'long', day: 'numeric', month: 'long',
      }) + ' · vecka ' + v6WeekNumber(today) + ' · Europe/Stockholm');
    }

    const todayCard = document.querySelector('.story-card[data-kind="idag"]');
    v6SetStoryKicker(todayCard, 'Idag');
    v6SetStoryHeadline(todayCard, 'bokningar', todayVisits.length);
    const orderedTimes = todayVisits.map((slot) => slot.time).filter(Boolean).sort();
    const orderedEnds = todayVisits.map((slot) => slot.endTime || slot.time).filter(Boolean).sort();
    v6SetText(todayCard && todayCard.querySelector('.story-card-sub'), todayVisits.length
      ? 'Första kl ' + orderedTimes[0] + ' · sista kl ' + orderedEnds.slice(-1)[0] + ' · canonical'
      : 'Inga canonical bokningar registrerade idag');
    const sparkBars = todayCard ? todayCard.querySelectorAll('.day-spark-bar') : [];
    const hourly = Array.from({ length: sparkBars.length }, (_, index) => todayVisits.filter((slot) => {
      const hour = Number(String(slot.time || '').slice(0, 2));
      return hour === 7 + index;
    }).length);
    const hourlyMax = Math.max(1, ...hourly);
    sparkBars.forEach((bar, index) => {
      const count = hourly[index] || 0;
      bar.style.height = count ? Math.max(20, Math.round((count / hourlyMax) * 90)) + '%' : '0%';
      bar.title = count + ' canonical bokning' + (count === 1 ? '' : 'ar');
    });

    const riskCard = document.querySelector('.story-card[data-kind="risker"]');
    const safetyKeys = new Set([
      'canonical_patient', 'identity_unambiguous', 'booking_reference', 'treatment',
      'resource', 'practitioner', 'stockholm_time',
    ]);
    const risks = todayVisits.map((slot) => {
      const gate = buildReadonlyBookingPreflight(slot).blockers.find((item) => safetyKeys.has(item.key));
      return gate ? { slot, gate } : null;
    }).filter(Boolean);
    v6SetStoryKicker(riskCard, risks.length + ' risk' + (risks.length === 1 ? '' : 'er'));
    v6SetStoryHeadline(riskCard, risks.length ? 'Hantera först' : 'Inga blockerare');
    const riskList = riskCard && riskCard.querySelector('.story-list');
    if (riskList) {
      riskList.innerHTML = '';
      if (!risks.length) {
        riskList.appendChild(v6StoryItem({
          severity: 'ok', badge: '✓', who: 'Canonical preflight',
          what: '— inga lässäkerhetsblockerare idag', when: 'read-only',
        }));
      } else {
        risks.slice(0, 3).forEach(({ slot, gate }) => riskList.appendChild(v6StoryItem({
          severity: 'high', badge: '!', who: slot.patientName || 'Okopplad patient',
          what: '— ' + gate.label + ' saknas', when: slot.time || '—',
        })));
      }
    }

    const opportunityCard = document.querySelector('.story-card[data-kind="mojligheter"]');
    v6SetStoryKicker(opportunityCard, '0 möjligheter');
    v6SetStoryHeadline(opportunityCard, 'Inga canonical förslag');
    const opportunityList = opportunityCard && opportunityCard.querySelector('.story-list');
    if (opportunityList) {
      opportunityList.innerHTML = '';
      opportunityList.appendChild(v6StoryItem({
        badge: '★', who: 'Väntelista och luckförslag',
        what: '— saknar verifierat backendkontrakt', when: '0 writes',
      }));
    }

    const forecastCard = document.querySelector('.story-card[data-kind="klart"]');
    v6SetStoryKicker(forecastCard, 'Prognos');
    v6SetStoryHeadline(forecastCard, 'Saknar underlag');
    v6SetText(forecastCard && forecastCard.querySelector('.story-card-sub'),
      'Canonical bokningsdata innehåller ingen verifierad kapacitetsprognos.');
    const forecastFill = forecastCard && forecastCard.querySelector('.ready-meter-fill');
    if (forecastFill) forecastFill.style.width = '0%';
    const forecastLabels = forecastCard ? forecastCard.querySelectorAll('.ready-meter-labels span') : [];
    v6SetText(forecastLabels[0], 'Prognosdata');
    v6SetText(forecastLabels[1], 'Saknas');
  }

  function v6RenderMiniInboxState() {
    const inbox = document.getElementById('miniInbox');
    if (!inbox) return;
    inbox.innerHTML = '';
    inbox.appendChild(el('div', { class: 'mini-inbox-kicker' }, [
      document.createTextNode('Inkorg '),
      el('span', { class: 'badge' }, 'READ-ONLY'),
    ]));
    [
      ['Ingen canonical inkorgsdata', 'Inga obokade mejltrådar i kalenderkontraktet', 'Ärligt tomt läge'],
      ['Dragning avstängd', 'Saknar verifierat boknings-write-kontrakt', 'Read-only'],
      ['Bokningsmutationer blockerade', 'Ingen skapa, flytta eller avboka', '0 writes'],
    ].forEach(([from, subject, meta]) => inbox.appendChild(el('div', {
      class: 'mail-thread', draggable: 'false',
      dataset: { canonicalState: 'unavailable', readOnly: 'true' },
    }, [
      el('div', { class: 'mail-from' }, from),
      el('div', { class: 'mail-subj' }, subject),
      el('div', { class: 'mail-meta' }, meta),
      el('span', { class: 'mail-ai-hint' }, 'READ-ONLY'),
    ])));
  }

  function v6RenderStoryActions() {
    const row = document.querySelector('.story-cta-row');
    if (!row) return;
    row.innerHTML = '';
    row.appendChild(el('button', {
      class: 'story-cta story-cta--primary', type: 'button',
      onclick: () => {
        v6State.mode = 'vecka';
        document.querySelectorAll('.segment-tab').forEach((tab) => {
          tab.classList.toggle('active', tab.dataset.mode === 'vecka');
        });
        v6RenderWeek(v6State.displayVisits);
      },
    }, '→ Öppna veckovyn'));
    [
      'Påminnelser · saknar write-kontrakt',
      'Bokningsändringar · saknar write-kontrakt',
      'Standupgenerering · saknar kontrakt',
    ].forEach((label) => row.appendChild(el('button', {
      class: 'story-cta', type: 'button', disabled: 'disabled',
    }, label)));
  }

  function v6UpdateBusy(visits) {
    const mount = document.querySelector('.calendar-busy');
    if (!mount) return;
    const groups = new Map();
    visits.forEach((slot) => {
      const label = slot.practitioner || slot.staffName || slot.resourceLabel || 'Ej tilldelad';
      groups.set(label, (groups.get(label) || 0) + 1);
    });
    const rows = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const max = Math.max(1, ...rows.map((entry) => entry[1]));
    mount.innerHTML = '';
    if (!rows.length) {
      mount.appendChild(el('div', { class: 'busy-row', dataset: { canonicalEmpty: 'true' } }, [
        el('span', { class: 'busy-name' }, 'Inga resursdata'),
        el('div', { class: 'busy-track' }, el('div', { class: 'busy-fill', style: 'width:0%' })),
        el('span', { class: 'busy-pct' }, '0 bokn.'),
      ]));
      return;
    }
    rows.forEach(([label, count]) => mount.appendChild(el('div', {
      class: 'busy-row', title: 'Canonical bokningsfördelning, inte kapacitetsprocent',
    }, [
      el('span', { class: 'busy-name' }, label),
      el('div', { class: 'busy-track' }, el('div', {
        class: 'busy-fill', style: 'width:' + Math.round((count / max) * 100) + '%',
      })),
      el('span', { class: 'busy-pct' }, count + ' bokn.'),
    ])));
  }

  function v6UpdateVibe(visits) {
    const days = document.querySelectorAll('#vibeStrip .vibe-day');
    days.forEach((node, index) => {
      const dateKey = v6IsoOffset(v6State.weekStart, index);
      const count = visits.filter((slot) => slot.date === dateKey).length;
      const spans = node.querySelectorAll('span');
      v6SetText(spans[0], count >= 5 ? '🔆' : count >= 3 ? '⛅' : count ? '🌤️' : '☀️');
      v6SetText(node.querySelector('.vibe-label'), V6_DAY_NAMES[index]);
      v6SetText(node.querySelector('.vibe-tip'), count
        ? count + ' canonical bokning' + (count === 1 ? '' : 'ar')
        : 'Inga bokningar registrerade');
      node.dataset.date = dateKey;
      node.dataset.canonicalCount = String(count);
    });
  }

  function v6UpdateWatch(visits) {
    const watch = document.getElementById('watchWidget');
    if (!watch) return;
    watch.hidden = false;
    watch.classList.remove('is-hidden', 'is-dragging');
    watch.dataset.readOnly = 'true';
    watch.querySelectorAll('.watch-dismiss').forEach((node) => node.remove());
    const next = visits.filter((slot) => {
      const status = String(slot.status || '').toLowerCase();
      return slot.date >= isoToday() && !['cancelled', 'canceled', 'no_show'].includes(status);
    }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    v6SetText(watch.querySelector('.clock'), next ? next.time : '—');
    v6SetText(watch.querySelector('.watch-kicker'), next ? statusLabel(next.status) + ' · READ-ONLY' : 'INGA DATA · READ-ONLY');
    v6SetText(watch.querySelector('.watch-title'), next ? (next.serviceLabel || 'Bokning') : 'Inget kommande besök');
    v6SetText(watch.querySelector('.watch-sub'), next
      ? (next.patientName || 'Okopplad patient') + ' · ' + (next.practitioner || next.resourceLabel || 'Ej tilldelad')
      : 'Canonical kalenderunderlag');
    v6SetText(watch.querySelector('.watch-ai-pill'), 'Canonical · 0 writes');
    const swipe = watch.querySelector('.watch-swipe');
    if (swipe) {
      swipe.dataset.swipeState = '';
      swipe.setAttribute('aria-disabled', 'true');
      v6SetText(swipe.querySelector('.watch-swipe-label'), 'Ankomstskrivning avstängd');
      v6SetText(swipe.querySelector('.watch-swipe-arrow'), '×');
    }
  }

  function v6PrepareOriginalHome() {
    v6RenderMiniInboxState();
    v6RenderStoryActions();
    const mic = document.getElementById('micBtn');
    if (mic) {
      mic.disabled = true;
      mic.title = 'Röstbokning saknar verifierat write-kontrakt · read-only';
      mic.setAttribute('aria-label', 'Röstbokning avstängd · read-only');
    }
    const timeMachine = document.getElementById('timemachine');
    if (timeMachine) {
      timeMachine.dataset.readOnly = 'true';
      timeMachine.title = 'Tid-maskin är visuellt passiv i canonical read-only-läge';
      const slider = timeMachine.querySelector('input');
      if (slider) slider.disabled = true;
      v6SetText(timeMachine.querySelector('.timemachine-label'), 'Nutid');
    }
    const resourceTab = document.querySelector('.segment-tab[data-mode="resurs"]');
    if (resourceTab) {
      resourceTab.hidden = false;
      resourceTab.disabled = false;
      resourceTab.title = 'Resursvy · canonical read-only';
    }
    document.querySelectorAll('.voice-overlay, .voice-sheet, .watch-restore').forEach((node) => {
      node.hidden = true;
    });
    v6UpdateBusy([]);
    v6UpdateVibe([]);
    v6UpdateWatch([]);
  }

  function v6UpdateOriginalHome(visits) {
    v6UpdateBusy(visits);
    v6UpdateVibe(visits);
    v6UpdateWatch(visits);
  }

  function v6RenderWeek(visits) {
    if (v6State.mode === 'resurs') {
      v6RenderResourceView(visits);
      return;
    }
    const week = document.getElementById('calWeek');
    if (!week) return;
    const days = week.querySelectorAll('.day-col');
    const today = isoToday();
    days.forEach((column, index) => {
      const dateKey = v6IsoOffset(v6State.weekStart, index);
      column.dataset.date = dateKey;
      column.hidden = v6State.mode === 'dag' && dateKey !== v6State.dayDate;
      column.classList.toggle('today', dateKey === today);
      v6SetText(column.querySelector('.day-label'), V6_DAY_NAMES[index]);
      v6SetText(column.querySelector('.day-date'), String(Number(dateKey.slice(8, 10))));
      const slots = column.querySelector('.day-slots');
      slots.innerHTML = '';
      const dayVisits = visits.filter((slot) => slot.date === dateKey);
      dayVisits.forEach((slot) => slots.appendChild(v6BookingCard(slot)));
      if (!dayVisits.length) slots.appendChild(el('div', { class: 'v6-empty' }, 'Inga bokningar'));
    });
    week.style.gridTemplateColumns = v6State.mode === 'dag'
      ? '28px minmax(0, 1fr)'
      : '28px repeat(7, 1fr)';
    const start = new Date(v6State.weekStart + 'T12:00:00.000Z');
    const endKey = v6IsoOffset(v6State.weekStart, 6);
    const end = new Date(endKey + 'T12:00:00.000Z');
    if (v6State.mode === 'morgon') {
      v6SetText(document.getElementById('calTitle'), 'God morgon, Fazli');
    } else if (v6State.mode === 'dag') {
      const selectedDay = new Date(v6State.dayDate + 'T12:00:00.000Z');
      v6SetText(document.getElementById('calTitle'), V6_DAY_NAMES[(selectedDay.getUTCDay() + 6) % 7] +
        ' ' + selectedDay.getUTCDate() + ' ' + V6_MONTH_NAMES[selectedDay.getUTCMonth()] +
        ' ' + selectedDay.getUTCFullYear());
    } else {
      v6SetText(document.getElementById('calTitle'),
        start.getUTCDate() + ' ' + V6_MONTH_NAMES[start.getUTCMonth()] + ' – ' +
        end.getUTCDate() + ' ' + V6_MONTH_NAMES[end.getUTCMonth()] + ' ' + end.getUTCFullYear());
    }
    v6SetText(document.querySelector('.week-pill .num'), String(v6WeekNumber(v6State.weekStart)));
    const content = document.querySelector('.calendar-content');
    if (content) content.dataset.mode = v6State.mode === 'morgon' ? 'morgon' : 'vecka';
  }

  function v6RenderResourceView(visits) {
    const week = document.getElementById('calWeek');
    if (!week) return;
    const resources = Array.from(
      visits.reduce((map, slot) => {
        const id = slot.resourceId || '_unassigned';
        if (!map.has(id)) {
          map.set(id, { resourceId: id, resourceLabel: slot.resourceLabel || slot.staffName || 'Ej tilldelad' });
        }
        return map;
      }, new Map()).values()
    ).sort((a, b) => (a.resourceId === '_unassigned' ? 1 : b.resourceId === '_unassigned' ? -1
      : (a.resourceLabel || '').localeCompare(b.resourceLabel || '', 'sv-SE')));

    week.innerHTML = '';
    week.style.gridTemplateColumns = '28px repeat(' + resources.length + ', 1fr)';

    const timeCol = el('div', { class: 'time-col' });
    for (let h = V6_HOUR_START; h < 23; h++) {
      timeCol.appendChild(el('div', { class: 'time-tick' }, String(h).padStart(2, '0') + ':00'));
    }
    week.appendChild(timeCol);

    resources.forEach((resource) => {
      const col = el('div', { class: 'day-col', dataset: { resourceId: resource.resourceId } });
      col.appendChild(el('div', { class: 'day-head' }, [
        el('span', { class: 'day-label' }, resource.resourceLabel || resource.resourceId),
      ]));
      const slots = el('div', { class: 'day-slots' });
      const resourceVisits = visits.filter((slot) => (slot.resourceId || '_unassigned') === resource.resourceId);
      if (!resourceVisits.length) {
        slots.appendChild(el('div', { class: 'v6-empty' }, 'Inga bokningar'));
      } else {
        resourceVisits.forEach((slot) => slots.appendChild(v6BookingCard(slot)));
      }
      col.appendChild(slots);
      week.appendChild(col);
    });

    const content = document.querySelector('.calendar-content');
    if (content) content.dataset.mode = 'resurs';
    const calTitle = document.getElementById('calTitle');
    if (calTitle) {
      v6SetText(calTitle, 'Resurser · vecka ' + v6WeekNumber(v6State.weekStart) +
        ' · ' + resources.length + ' resurser');
    }
  }

  function historySearchRowToV6Slot(row) {
    const start = stockholmParts(row.startsAt || '');
    const end = stockholmParts(row.endsAt || '');
    return {
      id: row.bookingId || row.id || '',
      bookingId: row.bookingId || row.id || '',
      patientId: row.patientId || '',
      encounterId: row.encounterId || row.canonicalEncounterId || '',
      patientName: row.patientName || '',
      date: row.stockholmDate || start.date,
      time: row.stockholmTime || start.time,
      endTime: row.stockholmEndTime || end.time || '',
      status: row.status || 'unknown',
      serviceId: row.serviceId || '',
      serviceLabel: row.serviceDisplayName || row.title || 'Historisk bokning',
      resourceId: row.resourceId || row.staffName || '_unassigned',
      resourceLabel: row.resourceLabel || row.staffName || 'Ej tilldelad',
      staffName: row.staffName || '',
      practitioner: row.practitioner || row.staffName || '',
      source: row.source || row.kind || 'history_search',
      linkAllowed: row.linkAllowed !== false && Boolean(row.patientId),
      identityAmbiguous: row.kind === 'separate_unlinked_historical' || row.linkAllowed === false,
      notes: row.notes || '',
      bookingNotes: row.bookingNotes || '',
      customerMessage: row.customerMessage || '',
      internalNotes: row.internalNotes || '',
      treatmentNotes: row.treatmentNotes || '',
      startsAt: row.startsAt || '',
      endsAt: row.endsAt || '',
      durationMinutes: row.durationMinutes || null,
      shadowReadmodel: row.shadowReadmodel === true,
      historicalReason: row.historicalReason || row.reasonCode || '',
      sourceRecords: Array.isArray(row.sourceRecords) ? row.sourceRecords : [],
      provenance: row.provenance || null,
    };
  }

  async function fetchV6HistorySearchRows(query) {
    const params = new URLSearchParams({
      q: String(query || '').trim(),
      limit: '30',
      includeSeparate: 'true',
    });
    const response = await fetch('/api/v1/cco-bookings/history-search?' + params.toString(), {
      credentials: 'same-origin',
      headers: calendarHeaders({
        tenantId: global.__ccoCalTenantId || 'hair_tp',
        role: global.__ccoCalRole || 'owner',
      }),
    });
    if (!response.ok) {
      const error = new Error('HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    return {
      rows: Array.isArray(payload && payload.rows) ? payload.rows : [],
      total: Number(payload && payload.pagination && payload.pagination.total) || 0,
    };
  }

  async function v6RenderSearch(query) {
    const list = document.getElementById('searchPanelList');
    const kicker = document.getElementById('searchPanelKicker');
    if (!list) return;
    const term = String(query || '').trim().toLocaleLowerCase('sv-SE');
    if (term.length < 2) {
      list.innerHTML = '';
      list.appendChild(el('div', { class: 'search-empty' }, 'Skriv minst 2 tecken för att söka i canonical bokningshistorik.'));
      v6SetText(kicker, 'Canonical historiksökning · read-only');
      return;
    }
    v6SetText(kicker, 'Söker hela canonical bokningshistoriken…');
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'search-empty' }, 'Laddar paginerad historik · read-only'));
    let matches = [];
    let total = 0;
    try {
      const result = await fetchV6HistorySearchRows(term);
      total = result.total;
      matches = result.rows.map(historySearchRowToV6Slot);
    } catch (error) {
      list.innerHTML = '';
      list.appendChild(el('div', { class: 'search-empty' },
        error && error.status === 401
          ? 'Behörighet krävs för canonical historiksökning.'
          : 'Canonical historiksökning kunde inte laddas just nu.'));
      v6SetText(kicker, 'Historiksökning misslyckades · read-only');
      return;
    }
    list.innerHTML = '';
    matches.forEach((slot) => {
      const canonicalPatientId = String(slot.patientId || '').trim();
      const bookingId = slot.bookingId || slot.id || '';
      list.appendChild(el('button', {
        class: 'search-result' + (canonicalPatientId ? '' : ' is-read-only'),
        type: 'button',
        dataset: {
          patientId: canonicalPatientId,
          bookingId,
          readOnly: canonicalPatientId ? '0' : '1',
        },
        onclick: (event) => {
          event.stopPropagation();
          closeV6SearchOverlay();
          v6RenderIntel(slot);
          document.querySelector('.booking[data-booking-id="' + CSS.escape(bookingId) + '"]')?.focus();
          if (canonicalPatientId) openCanonicalPatient(canonicalPatientId);
        },
      }, [
        el('span', { class: 'search-result-avatar' }, v6Initials(slot.patientName)),
        el('span', { class: 'search-result-main' }, [
          el('strong', {}, slot.patientName || 'Okopplad patient'),
          el('small', {}, [slot.serviceLabel || 'Bokning', slot.date, slot.time, statusLabel(slot.status)].join(' · ')),
        ]),
      ]));
    });
    if (!matches.length) list.appendChild(el('div', { class: 'search-empty' }, 'Inga canonical träffar.'));
    v6SetText(kicker, total + ' historikträffar · visar ' + matches.length + ' · read-only');
  }

  function openV6SearchOverlay(query) {
    const overlay = document.getElementById('searchOverlay');
    const overlayInput = document.getElementById('searchOverlayInput');
    const globalSearch = document.getElementById('globalSearch');
    if (!overlay || !overlayInput) return;
    overlay.dataset.openedAt = String(Date.now());
    overlay.classList.add('is-visible');
    globalSearch?.classList.add('is-focused');
    if (typeof query === 'string') overlayInput.value = query;
    setTimeout(() => overlayInput.focus(), 0);
    v6RenderSearch(overlayInput.value);
  }

  function closeV6SearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    const overlayInput = document.getElementById('searchOverlayInput');
    const globalInput = document.getElementById('globalSearchInput');
    const globalSearch = document.getElementById('globalSearch');
    overlay?.classList.remove('is-visible');
    if (overlayInput) overlayInput.value = '';
    if (globalInput) globalInput.value = '';
    globalSearch?.classList.remove('is-focused');
    v6RenderSearch('');
  }

  function replaceV6SearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    if (!overlay || !overlay.parentNode) return overlay;
    const clone = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(clone, overlay);
    return clone;
  }

  function replaceV6SearchInput(id) {
    const input = document.getElementById(id);
    if (!input || !input.parentNode) return input;
    const clone = input.cloneNode(true);
    input.parentNode.replaceChild(clone, input);
    return clone;
  }

  function v6BindControls() {
    document.querySelectorAll('.segment-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        v6State.mode = ['morgon', 'dag', 'resurs'].includes(mode) ? mode : 'vecka';
        if (v6State.mode === 'dag' && !v6State.dayDate) v6State.dayDate = isoToday();
        v6RenderWeek(v6State.displayVisits);
      });
    });
    const nav = document.querySelectorAll('.calendar-toolbar-actions > .nav-btn');
    const reload = (offset) => {
      if (v6State.mode === 'dag') {
        v6State.dayDate = offset === 0 ? isoToday() : v6IsoOffset(v6State.dayDate, offset > 0 ? 1 : -1);
        v6State.weekStart = v6WeekStart(v6State.dayDate);
      } else {
        v6State.weekStart = offset === 0 ? v6WeekStart(isoToday()) : v6IsoOffset(v6State.weekStart, offset);
        if (offset === 0) v6State.dayDate = isoToday();
      }
      v6Load();
    };
    nav[0]?.addEventListener('click', () => reload(-7));
    nav[1]?.addEventListener('click', () => reload(0));
    nav[2]?.addEventListener('click', () => reload(7));
    const overlay = replaceV6SearchOverlay();
    const overlayInput = replaceV6SearchInput('searchOverlayInput');
    const globalInput = replaceV6SearchInput('globalSearchInput');
    overlayInput?.addEventListener('input', () => v6RenderSearch(overlayInput.value));
    globalInput?.addEventListener('input', () => setTimeout(() => openV6SearchOverlay(globalInput.value), 0));
    globalInput?.addEventListener('focus', () => setTimeout(() => openV6SearchOverlay(globalInput.value), 0));
    overlay?.addEventListener('click', (event) => {
      const openedAt = Number(event.currentTarget?.dataset?.openedAt || 0);
      if (openedAt && Date.now() - openedAt < 150) return;
      if (event.target === event.currentTarget) closeV6SearchOverlay();
    });
    const filterBar = document.getElementById('ccoCalFilters');
    filterBar?.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', () => {
        v6State.filters.resourceId = filterBar.querySelector('[data-filter="resource"]').value;
        v6State.filters.serviceId = filterBar.querySelector('[data-filter="service"]').value;
        v6ApplyFilters();
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.getElementById('searchOverlay')?.classList.contains('is-visible')) {
        closeV6SearchOverlay();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setTimeout(() => openV6SearchOverlay(document.getElementById('searchOverlayInput')?.value || ''), 0);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      const go = (mode) => {
        v6State.mode = mode;
        if (mode === 'dag' && !v6State.dayDate) v6State.dayDate = isoToday();
        v6RenderWeek(v6State.displayVisits);
      };
      const shiftDay = (offset) => {
        if (v6State.mode === 'dag' || v6State.mode === 'resurs') {
          v6State.dayDate = v6IsoOffset(v6State.dayDate, offset);
          v6State.weekStart = v6WeekStart(v6State.dayDate);
        } else {
          v6State.weekStart = v6IsoOffset(v6State.weekStart, offset * 7);
          if (offset === 0) v6State.dayDate = isoToday();
        }
        v6Load();
      };

      switch (event.key) {
        case '1': event.preventDefault(); go('morgon'); break;
        case '2': event.preventDefault(); go('vecka'); break;
        case '3': event.preventDefault(); go('dag'); break;
        case '4': event.preventDefault(); go('resurs'); break;
        case 'j': event.preventDefault(); shiftDay(1); break;
        case 'k': event.preventDefault(); shiftDay(-1); break;
        case 'h': event.preventDefault(); if (v6State.mode === 'dag' || v6State.mode === 'resurs') shiftDay(-1); else shiftDay(-1); break;
        case 'l': event.preventDefault(); if (v6State.mode === 'dag' || v6State.mode === 'resurs') shiftDay(1); else shiftDay(1); break;
        case '?': event.preventDefault(); toggleKeyboardHelp(); break;
        default: break;
      }
    });
  }

  function toggleKeyboardHelp() {
    let overlay = document.getElementById('ccoCalKeyboardHelp');
    if (overlay) {
      overlay.remove();
      return;
    }
    overlay = el('div', { id: 'ccoCalKeyboardHelp', class: 'cco-cal-keyboard-help' }, [
      el('div', { class: 'cco-cal-keyboard-help-backdrop', onclick: () => overlay.remove() }),
      el('div', { class: 'cco-cal-keyboard-help-surface', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tangentbordsgenvägar' }, [
        el('header', {}, [
          el('h3', {}, 'Tangentbordsgenvägar'),
          el('button', { type: 'button', 'aria-label': 'Stäng', onclick: () => overlay.remove() }, '×'),
        ]),
        el('dl', { class: 'cco-cal-keyboard-help-grid' }, [
          el('dt', {}, '1'), el('dd', {}, 'Morgonöversikt'),
          el('dt', {}, '2'), el('dd', {}, 'Veckovy'),
          el('dt', {}, '3'), el('dd', {}, 'Dagvy'),
          el('dt', {}, '4'), el('dd', {}, 'Resursvy'),
          el('dt', {}, 'j / l'), el('dd', {}, 'Nästa / föregående dag eller vecka'),
          el('dt', {}, 'k / h'), el('dd', {}, 'Föregående / nästa dag eller vecka'),
          el('dt', {}, '⌘K'), el('dd', {}, 'Sök canonical bokningshistorik'),
          el('dt', {}, '?'), el('dd', {}, 'Visa denna hjälp'),
          el('dt', {}, 'Esc'), el('dd', {}, 'Stäng sökning / hjälp'),
        ]),
      ]),
    ]);
    document.body.appendChild(overlay);
  }

  async function v6Load() {
    const end = v6IsoOffset(v6State.weekStart, 6);
    try {
      v6State.visits = await loadCanonicalVisits(v6State.weekStart, end,
        global.__ccoCalTenantId || 'hair_tp', global.__ccoCalRole || 'owner');
      v6State.displayVisits = v6FilteredVisits();
      v6BuildFilters();
      v6RenderWeek(v6State.displayVisits);
      v6UpdateSidebars(v6State.displayVisits);
      v6UpdateStory(v6State.displayVisits);
      v6UpdateOriginalHome(v6State.displayVisits);
      const selected = v6State.selected && v6State.displayVisits.find((slot) =>
        slot.id === v6State.selected.id || slot.bookingId === v6State.selected.bookingId);
      v6State.selected = selected || v6State.displayVisits.find((slot) => slot.date === isoToday()) ||
        v6State.displayVisits.find((slot) => slot.date >= isoToday()) ||
        v6State.displayVisits[0] || null;
      v6RenderIntel(v6State.selected);
      v6RenderSearch('');
    } catch (error) {
      v6State.visits = [];
      v6State.displayVisits = [];
      v6RenderWeek([]);
      v6UpdateSidebars([]);
      v6UpdateStory([]);
      v6UpdateOriginalHome([]);
      v6RenderIntel(null);
      const title = document.getElementById('calTitle');
      v6SetText(title, error && error.status === 401
        ? 'Behörighet krävs för canonical kalenderdata'
        : 'Canonical kalenderdata kunde inte hämtas');
    } finally {
      document.documentElement.classList.remove('cco-v6-booting');
    }
  }

  function initOriginalV6Calendar() {
    document.body.dataset.ccoCalendarSource = 'canonical-v6';
    document.body.dataset.ccoCalendarMode = 'live-read';
    v6State.weekStart = v6WeekStart(isoToday());
    v6State.dayDate = isoToday();
    v6State.mode = 'morgon';
    v6PrepareOriginalHome();
    document.querySelectorAll('.segment-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === 'morgon');
    });
    v6RenderIntel(null);
    v6BindControls();
    v6Load();
  }

  // ─── Init: kollar URL-view ──────────────────────────────────────────────
  function init() {
    const view = detectViewFromUrl();
    applyView(view);
    if (view === 'calendar') {
      bindQualityPanel();
      if (isOriginalV6Mode()) {
        initOriginalV6Calendar();
        return;
      }
      resetLiveReadUi();
      const dagTab = document.querySelector('.segment-tab[data-mode="dag"]');
      if (dagTab) {
        setTimeout(() => {
          dagTab.click();
        }, 100);
      } else {
        loadDay({});
      }
    }
    bindSetModeHook();
  }

  global.CcoKalenderShell = isReadOnlyMode()
    ? { loadDay, loadWeek, applyView, renderDrawer: renderReadonlyDrawer,
        buildCanonicalSidebarSummary, canonicalConflictCount, buildReadonlyBookingPreflight,
        createBookingPayload, openCreateBookingDrawer }
    : { loadDay, loadWeek, applyView, renderDrawer };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
