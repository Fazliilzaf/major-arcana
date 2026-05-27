'use strict';

(function initBookingCalendarShared(global) {
  const SVG = {
    video:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.8h7.2v6.4H2.8V4.8Zm8.8 1.6 3.2-1.9v6.6l-3.2-1.9V6.4Z" fill="currentColor"/></svg>',
    sms: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 2.8h10.4a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2H6.4L3.2 13.2V9.8H2.8a1.2 1.2 0 0 1-1.2-1.2V4a1.2 1.2 0 0 1 1.2-1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    form:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.8h8a1.2 1.2 0 0 1 1.2 1.2v8a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2V4a1.2 1.2 0 0 1 1.2-1.2Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.2 6.4h5.6M5.2 8.8h5.6M5.2 11.2h3.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2"/></svg>',
    location:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8a4.2 4.2 0 0 1 4.2 4.2c0 3.1-4.2 8.2-4.2 8.2S3.8 9.1 3.8 6A4.2 4.2 0 0 1 8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="6" r="1.3" fill="currentColor"/></svg>',
    clock:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.2l2.2 1.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2"/></svg>',
    check:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.8 8.2 2.8 2.8 5.6-5.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></svg>',
    invite:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 3.6h10.4a1.2 1.2 0 0 1 1.2 1.2v6.4a1.2 1.2 0 0 1-1.2 1.2H2.8a1.2 1.2 0 0 1-1.2-1.2V4.8a1.2 1.2 0 0 1 1.2-1.2Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 4.8 8 8.4l5.2-3.6M5.2 10.4h5.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2"/></svg>',
  };

  const STATUS_LABELS = {
    needs_triage: 'Kräver triage',
    slots_ready: 'Tider redo',
    offered: 'Erbjuden',
    waiting_customer: 'Väntar kund',
    confirmed_external: 'Bekräftad',
    cancelled: 'Avbruten',
    closed: 'Stängd',
    follow_up_completed: 'Uppföljning klar',
  };

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

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseIsoDate(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function formatTimeLabel(isoOrTime) {
    const text = String(isoOrTime || '').trim();
    if (!text) return '';
    if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatTimeRange(slot) {
    const start = formatTimeLabel(slot?.startAt || slot?.startsAt || slot?.start || slot?.time);
    const end = formatTimeLabel(slot?.endAt || slot?.endsAt || slot?.end);
    if (start && end) return `${start}–${end}`;
    return start || '—';
  }

  function formatCaseStatus(status) {
    const key = normalizeKey(status);
    return STATUS_LABELS[key] || String(status || '—').replace(/_/g, ' ');
  }

  function slotIsoDate(slot) {
    const raw = slot?.startAt || slot?.startsAt || slot?.start || slot?.date || '';
    const text = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function slotStartMinutes(slot) {
    const raw = slot?.startAt || slot?.startsAt || slot?.start || '';
    const text = String(raw).trim();
    if (/^\d{2}:\d{2}/.test(text)) {
      const [h, m] = text.split(':').map(Number);
      return h * 60 + m;
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return 9 * 60;
    return date.getHours() * 60 + date.getMinutes();
  }

  function slotEndMinutes(slot) {
    const endRaw = slot?.endAt || slot?.endsAt || slot?.end || '';
    if (endRaw) {
      const endText = String(endRaw).trim();
      if (/^\d{2}:\d{2}/.test(endText)) {
        const [h, m] = endText.split(':').map(Number);
        return h * 60 + m;
      }
      const endDate = new Date(endText);
      if (!Number.isNaN(endDate.getTime())) {
        return endDate.getHours() * 60 + endDate.getMinutes();
      }
    }
    const duration = Number(slot?.durationMinutes);
    if (Number.isFinite(duration) && duration > 0) {
      return slotStartMinutes(slot) + duration;
    }
    return slotStartMinutes(slot) + 60;
  }

  function slotDurationMinutes(slot) {
    return Math.max(15, slotEndMinutes(slot) - slotStartMinutes(slot));
  }

  function eventKey(event) {
    if (event?.eventKey) return event.eventKey;
    return [
      event?.kind || 'event',
      event?.bookingCaseId || '',
      event?.slotId || '',
      slotIsoDate(event),
      slotStartMinutes(event),
      event?.resourceId || event?.resourceLabel || '',
    ]
      .filter(Boolean)
      .join('::');
  }

  function slotReservationKey(slot) {
    return (
      String(slot?.slotId || '').trim() ||
      [slotIsoDate(slot), slot?.resourceId || slot?.resourceLabel || '', slotStartMinutes(slot)].join('::')
    );
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
      rows.sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
      map.set(iso, rows);
    });
    return map;
  }

  let calendarBundleReuse = null;

  async function fetchCalendarBundle(fromDate, toDate) {
    const cacheKey = `calendar-bundle:${fromDate}:${toDate}`;
    const policy = window.ArcanaCcoData?.policy?.CALENDAR || { staleTime: 60_000, gcTime: 300_000 };
    const load = async () => {
      const params = new URLSearchParams({ fromDate, toDate });
      const response = await fetch(`/api/v1/cco-bookings/calendar-bundle?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('calendar_bundle_unavailable');
      const payload = await response.json();
      calendarBundleReuse = payload;
      return payload;
    };
    if (window.ArcanaCcoData?.fetch) {
      return window.ArcanaCcoData.fetch(cacheKey, load, {
        staleTime: policy.staleTime,
        gcTime: policy.gcTime,
      });
    }
    return load();
  }

  async function fetchRangeSlots(fromDate, toDate) {
    try {
      const bundle = await fetchCalendarBundle(fromDate, toDate);
      return {
        slots: Array.isArray(bundle?.slots) ? bundle.slots : [],
        blocks: Array.isArray(bundle?.blocks) ? bundle.blocks : [],
      };
    } catch {
      const params = new URLSearchParams({ fromDate, toDate });
      try {
        const response = await fetch(`/api/v1/cco-bookings/slots?${params.toString()}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('slots_unavailable');
        const payload = await response.json();
        return {
          slots: Array.isArray(payload?.slots) ? payload.slots : [],
          blocks: Array.isArray(payload?.blocks) ? payload.blocks : [],
        };
      } catch {
        return { slots: [], blocks: [] };
      }
    }
  }

  async function fetchBookingCases(fromDate, toDate) {
    try {
      const bundle = await fetchCalendarBundle(fromDate, toDate);
      const cases = Array.isArray(bundle?.cases) ? bundle.cases : [];
      return cases.filter((bookingCase) => {
        const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
        return slots.some((slot) => {
          const iso = slotIsoDate(slot);
          return iso && iso >= fromDate && iso <= toDate;
        });
      });
    } catch {
      try {
        const response = await fetch('/api/v1/cco-bookings/cases?limit=200&sort=recent', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return [];
        const payload = await response.json();
        const cases = Array.isArray(payload?.cases) ? payload.cases : [];
        return cases.filter((bookingCase) => {
          const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
          return slots.some((slot) => {
            const iso = slotIsoDate(slot);
            return iso && iso >= fromDate && iso <= toDate;
          });
        });
      } catch {
        return [];
      }
    }
  }

  async function fetchBookedCounts(fromDate, toDate) {
    const counts = new Map();
    const cases = calendarBundleReuse?.cases
      ? calendarBundleReuse.cases.filter((bookingCase) => {
          const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
          return slots.some((slot) => {
            const iso = slotIsoDate(slot);
            return iso && iso >= fromDate && iso <= toDate;
          });
        })
      : await fetchBookingCases(fromDate, toDate);
    cases.forEach((bookingCase) => {
      const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
      slots.forEach((slot) => {
        const iso = slotIsoDate(slot);
        if (!iso || iso < fromDate || iso > toDate) return;
        counts.set(iso, (counts.get(iso) || 0) + 1);
      });
    });
    return counts;
  }

  async function fetchRefData() {
    try {
      const cachedRaw = sessionStorage.getItem('arcana_cal_ref_data_v1');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.expiresAt > Date.now() && cached?.payload) {
          return cached.payload;
        }
      }
    } catch {
      /* ignore cache read */
    }
    try {
      const response = await fetch('/api/v1/cco-bookings/ref-data', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return { services: {}, resources: [] };
      const payload = await response.json();
      const services = {};
      (Array.isArray(payload?.services) ? payload.services : []).forEach((service) => {
        if (!service?.id) return;
        services[service.id] = service;
      });
      const result = {
        services,
        resources: Array.isArray(payload?.resources) ? payload.resources : [],
      };
      try {
        sessionStorage.setItem(
          'arcana_cal_ref_data_v1',
          JSON.stringify({ expiresAt: Date.now() + 10 * 60 * 1000, payload: result })
        );
      } catch {
        /* ignore cache write */
      }
      return result;
    } catch {
      return { services: {}, resources: [] };
    }
  }

  async function fetchCalendarSignals(fromDate, toDate) {
    try {
      const bundle = await fetchCalendarBundle(fromDate, toDate);
      if (bundle?.byCaseId) {
        return {
          byCaseId: bundle.byCaseId && typeof bundle.byCaseId === 'object' ? bundle.byCaseId : {},
          leadTime: bundle.leadTime || null,
        };
      }
    } catch {
      /* fallback */
    }
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const response = await fetch(`/api/v1/cco-bookings/calendar-signals?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return { byCaseId: {}, leadTime: null };
      const payload = await response.json();
      return {
        byCaseId: payload?.byCaseId && typeof payload.byCaseId === 'object' ? payload.byCaseId : {},
        leadTime: payload?.leadTime || null,
      };
    } catch {
      return { byCaseId: {}, leadTime: null };
    }
  }

  async function fetchMissingFormsByEmail() {
    const map = new Map();
    try {
      const response = await fetch('/api/v1/ops/cco-care/missing-forms-report', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return map;
      const payload = await response.json();
      const rows = Array.isArray(payload?.report?.rows) ? payload.report.rows : [];
      rows.forEach((row) => {
        const email = normalizeKey(row?.primaryEmail);
        if (!email) return;
        map.set(email, {
          patientId: row.patientId || '',
          missing: Array.isArray(row.missing) ? row.missing : [],
        });
      });
    } catch {
      /* best-effort */
    }
    return map;
  }

  function resolveMeetingMode(slot, services = {}) {
    const direct = normalizeKey(slot?.meetingMode);
    if (direct === 'online' || direct === 'physical') return direct;
    const serviceId = String(slot?.serviceId || '').trim();
    const serviceMode = normalizeKey(services?.[serviceId]?.meetingMode);
    if (serviceMode === 'online' || serviceMode === 'physical') return serviceMode;
    if (serviceId.includes('online')) return 'online';
    return 'physical';
  }

  function hasReminderSentFromEvents(events) {
    return (events || []).some((event) => {
      const hay = `${event?.type || ''} ${event?.label || ''} ${event?.detail || ''}`.toLowerCase();
      return /reminder|påminn|sms|outreach|visit_upcoming|customer_reminder/.test(hay);
    });
  }

  function deriveCalendarSignals(
    slot,
    bookingCase,
    { services = {}, missingByEmail = new Map(), signalsByCaseId = {} } = {}
  ) {
    const meetingMode = resolveMeetingMode(slot, services);
    const isOnline = meetingMode === 'online' || slot?.calendarSignals?.isOnline === true;
    const events = Array.isArray(bookingCase?.events) ? bookingCase.events : [];
    const emailKey = normalizeKey(bookingCase?.customerEmail);
    const missingRow = emailKey ? missingByEmail.get(emailKey) : null;
    const missingForms = Array.isArray(missingRow?.missing) ? missingRow.missing : [];
    const fallbackNeedsHealthDeclaration =
      slot?.needsHealthDeclaration === true ||
      slot?.calendarSignals?.needsHealthDeclaration === true ||
      missingForms.some((item) => String(item).includes('health_declaration'));
    const fallbackReminderSent =
      slot?.smsSent === true ||
      slot?.reminderSent === true ||
      slot?.calendarSignals?.reminderSent === true ||
      hasReminderSentFromEvents(events);

    const caseId = String(bookingCase?.bookingCaseId || '').trim();
    const apiSignals = caseId ? signalsByCaseId[caseId] : null;
    if (apiSignals && typeof apiSignals === 'object') {
      const leadTimeHours = Number(apiSignals.smsLeadTimeHours) || 24;
      return {
        meetingMode,
        isOnline,
        smsLeadTimeHours: leadTimeHours,
        smsReminderSent: apiSignals.smsReminderSent === true,
        smsReminderDue: apiSignals.smsReminderDue === true,
        emailIcsSent: apiSignals.emailIcsSent === true,
        reminderSent: apiSignals.smsReminderSent === true || fallbackReminderSent,
        needsHealthDeclaration:
          apiSignals.needsHealthDeclaration === true || fallbackNeedsHealthDeclaration,
        missingForms: apiSignals.missingForms === true || missingForms.length > 0,
        missingFormLabels: Array.isArray(apiSignals.missingFormLabels)
          ? apiSignals.missingFormLabels
          : [],
        patientId: apiSignals.patientId || missingRow?.patientId || slot?.patientId || '',
      };
    }

    return {
      meetingMode,
      isOnline,
      smsLeadTimeHours: 24,
      smsReminderSent: fallbackReminderSent,
      smsReminderDue: false,
      emailIcsSent: false,
      reminderSent: fallbackReminderSent,
      needsHealthDeclaration: fallbackNeedsHealthDeclaration,
      missingForms: missingForms.length > 0,
      missingFormLabels: [],
      patientId: missingRow?.patientId || slot?.patientId || '',
    };
  }

  function buildBookedCalendarEvent(bookingCase, slot, context = {}) {
    const status = normalizeKey(bookingCase?.status);
    const signals = deriveCalendarSignals(slot, bookingCase, context);
    const event = {
      ...slot,
      kind: 'booked',
      eventKey: '',
      bookingCaseId: bookingCase?.bookingCaseId || '',
      customerName: bookingCase?.customerName || '',
      customerEmail: bookingCase?.customerEmail || '',
      conversationId: bookingCase?.conversationId || '',
      caseStatus: status,
      status: formatCaseStatus(status),
      serviceLabel: slot?.serviceLabel || slot?.service || bookingCase?.requestedTreatment || '',
      resourceLabel: slot?.resourceLabel || slot?.resource || '',
      meetingMode: signals.meetingMode,
      isOnline: signals.isOnline,
      smsLeadTimeHours: signals.smsLeadTimeHours,
      smsReminderSent: signals.smsReminderSent,
      smsReminderDue: signals.smsReminderDue,
      emailIcsSent: signals.emailIcsSent,
      smsSent: signals.smsReminderSent || signals.reminderSent,
      reminderSent: signals.reminderSent,
      needsHealthDeclaration: signals.needsHealthDeclaration,
      missingForms: signals.missingForms,
      missingFormLabels: signals.missingFormLabels,
      patientId: signals.patientId,
      // R4: surface source + expiry från bookingCase till slot
      source: bookingCase?.source || 'cco_engine',
      expiresAt: bookingCase?.nextExpiryAt || null,
      expiresInMinutes: bookingCase?.expiresInMinutes ?? null,
      expiresSoon: bookingCase?.expiresSoon === true,
      durationMinutes: slotDurationMinutes(slot),
      bookingCaseSnapshot: {
        bookingCaseId: bookingCase?.bookingCaseId || '',
        status: bookingCase?.status || '',
        customerName: bookingCase?.customerName || '',
        customerEmail: bookingCase?.customerEmail || '',
        conversationId: bookingCase?.conversationId || '',
        requestedTreatment: bookingCase?.requestedTreatment || '',
        selectedSlots: Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [],
        events: Array.isArray(bookingCase?.events) ? bookingCase.events.slice(-12) : [],
      },
    };
    event.eventKey = eventKey(event);
    return event;
  }

  function buildBlockCalendarEvent(block) {
    const event = {
      ...block,
      kind: 'block',
      eventKey: '',
      title: block?.label || 'Blockerad tid',
      status:
        block?.blockType === 'lunch'
          ? 'Lunch'
          : block?.blockType === 'vacation'
            ? 'Semester'
            : 'Stängd tid',
      durationMinutes: slotDurationMinutes(block),
    };
    event.eventKey = eventKey(event);
    return event;
  }

  function buildSlotAtTime(baseSlot, { iso, startMinutes, durationMinutes } = {}) {
    const safeIso = String(iso || slotIsoDate(baseSlot) || todayIso()).slice(0, 10);
    const minutes = Number.isFinite(startMinutes) ? startMinutes : slotStartMinutes(baseSlot);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : slotDurationMinutes(baseSlot);
    const startsAt = `${safeIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
    const endTotal = minutes + duration;
    const endHour = Math.floor(endTotal / 60);
    const endMinute = endTotal % 60;
    const endsAt = `${safeIso}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00.000Z`;
    return {
      ...baseSlot,
      startsAt,
      endsAt,
      startAt: startsAt,
      endAt: endsAt,
      durationMinutes: duration,
      slotId:
        baseSlot?.slotId ||
        [baseSlot?.resourceId, baseSlot?.serviceId, startsAt].filter(Boolean).join('::'),
    };
  }

  async function rebookCalendarBooking(bookingCaseId, slot, reason = 'Ombokad från kalendern') {
    const response = await fetch('/api/v1/cco-bookings/calendar/rebook', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingCaseId, slot, reason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || 'calendar_rebook_failed');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function buildAvailableCalendarEvent(slot, context = {}) {
    const signals = deriveCalendarSignals(slot, null, context);
    const event = {
      ...slot,
      kind: 'available',
      eventKey: '',
      title: slot?.serviceLabel || slot?.service || 'Ledig tid',
      status: 'Ledig',
      meetingMode: signals.meetingMode,
      isOnline: signals.isOnline,
      durationMinutes: slotDurationMinutes(slot),
    };
    event.eventKey = eventKey(event);
    return event;
  }

  function mergeCalendarEvents(availableSlots, bookingCases, blocks, fromDate, toDate, context = {}) {
    const bookedEvents = [];
    const bookedKeys = new Set();

    bookingCases.forEach((bookingCase) => {
      const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
      slots.forEach((slot) => {
        const iso = slotIsoDate(slot);
        if (!iso || iso < fromDate || iso > toDate) return;
        const event = buildBookedCalendarEvent(bookingCase, slot, context);
        bookedEvents.push(event);
        bookedKeys.add(slotReservationKey(slot));
      });
    });

    const openSlots = (availableSlots || [])
      .filter((slot) => !bookedKeys.has(slotReservationKey(slot)))
      .map((slot) => buildAvailableCalendarEvent(slot, context));

    const blockEvents = (blocks || []).map((block) => buildBlockCalendarEvent(block));

    const allEvents = [...bookedEvents, ...openSlots, ...blockEvents].sort((left, right) => {
      const kindOrder = { block: 0, booked: 1, available: 2 };
      const leftKind = kindOrder[left?.kind] ?? 3;
      const rightKind = kindOrder[right?.kind] ?? 3;
      if (leftKind !== rightKind) return leftKind - rightKind;
      const dateDelta = slotIsoDate(left).localeCompare(slotIsoDate(right));
      if (dateDelta) return dateDelta;
      return slotStartMinutes(left) - slotStartMinutes(right);
    });

    return {
      events: allEvents,
      bookedEvents,
      openSlots,
      blockEvents,
      slotsByDate: indexSlotsByDate(allEvents),
      bookedCountByDate: (() => {
        const counts = new Map();
        bookedEvents.forEach((event) => {
          const iso = slotIsoDate(event);
          if (!iso) return;
          counts.set(iso, (counts.get(iso) || 0) + 1);
        });
        return counts;
      })(),
    };
  }

  async function fetchCalendarRange(fromDate, toDate, options = {}) {
    const onPartial = typeof options.onPartial === 'function' ? options.onPartial : null;
    const [rangePayload, bookingCases] = await Promise.all([
      fetchRangeSlots(fromDate, toDate),
      fetchBookingCases(fromDate, toDate),
    ]);
    let refData = { services: {}, resources: [] };
    try {
      const cachedRaw = sessionStorage.getItem('arcana_cal_ref_data_v1');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.expiresAt > Date.now() && cached?.payload) {
          refData = cached.payload;
        }
      }
    } catch {
      /* ignore */
    }
    if (onPartial) {
      onPartial(
        mergeCalendarEvents(
          rangePayload.slots,
          bookingCases,
          rangePayload.blocks,
          fromDate,
          toDate,
          { services: refData.services }
        )
      );
    }
    const [resolvedRefData, missingByEmail, calendarSignals] = await Promise.all([
      refData.services && Object.keys(refData.services).length ? Promise.resolve(refData) : fetchRefData(),
      fetchMissingFormsByEmail(),
      fetchCalendarSignals(fromDate, toDate),
    ]);
    return mergeCalendarEvents(
      rangePayload.slots,
      bookingCases,
      rangePayload.blocks,
      fromDate,
      toDate,
      {
        services: resolvedRefData.services,
        missingByEmail,
        signalsByCaseId: calendarSignals.byCaseId,
      }
    );
  }

  function buildOperationalIconSpecs(slot) {
    const icons = [];
    const leadHours = Number(slot?.smsLeadTimeHours) || 24;

    if (slot?.emailIcsSent) {
      icons.push({
        name: 'invite',
        state: 'sent',
        title: 'Kalenderinbjudan skickad (e-post + ICS)',
        ariaLabel: 'Kalenderinbjudan skickad',
      });
    }

    if (slot?.smsReminderSent || slot?.reminderSent || slot?.smsSent) {
      icons.push({
        name: 'sms',
        state: 'sent',
        title: 'SMS-påminnelse skickad',
        ariaLabel: 'SMS-påminnelse skickad',
      });
    } else if (slot?.smsReminderDue) {
      icons.push({
        name: 'sms',
        state: 'due',
        title: `SMS-påminnelse inom ${leadHours} h`,
        ariaLabel: `SMS-påminnelse förfaller inom ${leadHours} timmar`,
      });
    }

    if (slot?.needsHealthDeclaration) {
      icons.push({
        name: 'form',
        state: 'warning',
        title: 'Saknar hälsodeklaration',
        ariaLabel: 'Saknar hälsodeklaration',
      });
    } else if (slot?.missingForms) {
      icons.push({
        name: 'form',
        state: 'missing',
        title: 'Saknar formulär före besök',
        ariaLabel: 'Saknar formulär före besök',
      });
    }

    // R4: SLA-prick — röd prick om SLA-risk (followUpDueAt nära/passerad)
    if (slot?.slaRisk === true || slot?.slaBreach === true) {
      icons.push({
        name: 'sla',
        state: slot.slaBreach ? 'breach' : 'warning',
        title: slot.slaBreach ? 'SLA-brott — åtgärda omedelbart' : 'SLA-risk — uppföljning krävs snart',
        ariaLabel: slot.slaBreach ? 'SLA-brott' : 'SLA-risk',
      });
    }

    // R4: Återbesöks-hint — info-prick om aftercare/followup journey aktiv
    if (slot?.journeyAftercare === true || slot?.isFollowUp === true) {
      icons.push({
        name: 'aftercare',
        state: 'active',
        title: 'Eftervårds-resa aktiv — uppföljning planerad',
        ariaLabel: 'Eftervårdsresa aktiv',
      });
    }

    return icons;
  }

  function formatCalendarSignalSummary(slot) {
    const rows = [];
    const leadHours = Number(slot?.smsLeadTimeHours) || 24;

    if (slot?.emailIcsSent) {
      rows.push(['Kalenderinbjudan', 'Skickad (e-post + ICS)']);
    }
    if (slot?.smsReminderSent || slot?.reminderSent || slot?.smsSent) {
      rows.push(['SMS-påminnelse', 'Skickad']);
    } else if (slot?.smsReminderDue) {
      rows.push(['SMS-påminnelse', `Förfaller inom ${leadHours} h`]);
    }
    if (slot?.needsHealthDeclaration) {
      rows.push(['Patientportal', 'Saknar hälsodeklaration']);
    } else if (slot?.missingForms) {
      rows.push(['Patientportal', 'Saknar formulär före besök']);
    }
    return rows;
  }

  function classifyCalendarEvent(slot) {
    const service = String(slot?.serviceLabel || slot?.service || slot?.title || '').toLowerCase();
    const location = String(slot?.locationLabel || slot?.location || '').toLowerCase();
    const status = String(slot?.status || slot?.caseStatus || '').toLowerCase();
    const icons = [];
    let accent = 'var(--cco-cal-accent)';
    let tone = slot?.kind === 'available' ? 'available' : 'default';

    const isOnline =
      slot?.isOnline === true ||
      slot?.meetingMode === 'online' ||
      String(slot?.serviceId || '').includes('online');

    if (isOnline) {
      accent = 'var(--cco-cal-video)';
      tone = 'video';
      icons.push('video');
    } else if (
      service.includes('fysisk') ||
      location.includes('klinik') ||
      location.includes('vasaplatsen') ||
      slot?.meetingMode === 'physical'
    ) {
      accent = 'var(--cco-cal-accent)';
      tone = 'physical';
      icons.push('location');
    }

    if (slot?.kind === 'available') {
      accent = 'var(--cco-cal-accent-soft, var(--cco-cal-accent))';
      tone = 'available';
    } else if (slot?.kind === 'block') {
      accent = 'var(--cco-cal-block, #c8c0b8)';
      tone = 'block';
    } else if (status.includes('waiting') || status.includes('väntar') || status.includes('customer')) {
      accent = 'var(--cco-cal-warn)';
      tone = 'waiting';
      icons.push('clock');
    } else if (status.includes('confirm') || status.includes('bekräft')) {
      accent = 'var(--cco-cal-success)';
      tone = 'confirmed';
      icons.push('check');
    }

    const operationalIcons = slot?.kind === 'booked' ? buildOperationalIconSpecs(slot) : [];
    const mergedIcons = [...icons.map((name) => ({ name })), ...operationalIcons];

    return { accent, tone, icons: dedupeIconSpecs(mergedIcons) };
  }

  function dedupeIconSpecs(entries) {
    const seen = new Set();
    const out = [];
    (entries || []).forEach((entry) => {
      const spec = typeof entry === 'string' ? { name: entry } : entry;
      const key = `${spec.name || ''}::${spec.state || ''}`;
      if (!spec.name || seen.has(key)) return;
      seen.add(key);
      out.push(spec);
    });
    return out;
  }

  function renderEventIcons(icons) {
    return (icons || [])
      .map((entry) => {
        const spec = typeof entry === 'string' ? { name: entry } : entry;
        const name = spec.name || '';
        const state = spec.state ? ` is-${spec.state}` : '';
        const title = spec.title ? ` title="${escapeAttr(spec.title)}"` : '';
        const aria = spec.ariaLabel
          ? ` role="img" aria-label="${escapeAttr(spec.ariaLabel)}"`
          : ' aria-hidden="true"';
        return `<span class="cco-cal-event-icon${state}" data-icon="${escapeAttr(name)}"${title}${aria}>${SVG[name] || ''}</span>`;
      })
      .join('');
  }

  function eventTitle(slot) {
    if (slot?.kind === 'block') {
      return slot?.title || slot?.label || 'Blockerad tid';
    }
    if (slot?.kind === 'available') {
      return slot?.serviceLabel || slot?.service || slot?.title || 'Ledig tid';
    }
    return (
      slot?.customerName ||
      slot?.customerEmail ||
      slot?.title ||
      slot?.serviceLabel ||
      slot?.service ||
      'Bokning'
    );
  }

  function eventMeta(slot) {
    if (slot?.kind === 'available') {
      return slot?.resourceLabel || slot?.resource || slot?.locationLabel || 'Ledig';
    }
    const parts = [
      slot?.serviceLabel || slot?.service || '',
      slot?.resourceLabel || slot?.resource || '',
      slot?.status ? formatCaseStatus(slot?.caseStatus || slot?.status) : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }

  // R3: bestäm behandlingstyp av slot för filter + bottom-band-färg.
  function serviceTypeFor(slot) {
    const txt = String(slot?.serviceLabel || slot?.service || slot?.serviceId || '').toLowerCase();
    if (!txt) return 'other';
    if (txt.includes('hårtx') || txt.includes('hairtx') || txt.includes('transplant') || txt.includes('hår tp') || txt.includes('hartp')) return 'hairtx';
    if (txt.includes('prp')) return 'prp';
    if (txt.includes('konsult')) return 'consultation';
    if (txt.includes('återbesök') || txt.includes('aterbesok') || txt.includes('uppföljning') || txt.includes('uppfoljning') || txt.includes('follow')) return 'aftercare';
    if (txt.includes('online') || txt.includes('video') || txt.includes('digital')) return 'video';
    return 'other';
  }

  // R3: hitta överlappande bokningar (samma resurs + överlappande tid).
  // Returnerar Set av eventKey för bokningar som är i konflikt med någon annan.
  function findConflictKeys(slots) {
    const conflicts = new Set();
    const booked = (slots || []).filter((s) => s?.kind === 'booked');
    for (let i = 0; i < booked.length; i++) {
      const a = booked[i];
      const aStart = slotStartMinutes(a);
      const aEnd = aStart + slotDurationMinutes(a);
      const aResource = String(a?.resourceLabel || a?.resource || '').trim();
      for (let j = i + 1; j < booked.length; j++) {
        const b = booked[j];
        const bResource = String(b?.resourceLabel || b?.resource || '').trim();
        if (aResource !== bResource) continue;
        const bStart = slotStartMinutes(b);
        const bEnd = bStart + slotDurationMinutes(b);
        if (aStart < bEnd && bStart < aEnd) {
          conflicts.add(eventKey(a));
          conflicts.add(eventKey(b));
        }
      }
    }
    return conflicts;
  }

  function renderEventCard(slot, { compact = false, selected = false, interactive = true, draggable = false, conflict = false } = {}) {
    const meta = classifyCalendarEvent(slot);
    const isBlock = slot?.kind === 'block';
    const tag = interactive && !isBlock ? 'button' : 'article';
    const typeAttr = interactive && !isBlock ? ' type="button"' : '';
    const dragAttr = draggable && slot?.kind === 'booked' ? ' draggable="true"' : '';
    const selectedClass = selected ? ' is-selected' : '';
    const compactClass = compact ? ' is-compact' : '';
    const kindClass =
      slot?.kind === 'available'
        ? ' is-available'
        : slot?.kind === 'booked'
          ? ' is-booked'
          : slot?.kind === 'block'
            ? ' is-block'
            : '';
    const payload = { ...slot, eventKey: eventKey(slot) };
    const conflictClass = conflict ? ' is-conflict' : '';
    const expiringClass = slot?.expiresSoon === true ? ' is-expiring' : '';
    const serviceType = serviceTypeFor(slot);
    const source = String(slot?.source || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'cco_engine';
    const status = slot?.status || 'pending';
    const mailbox = slot?.mailbox || slot?.resourceId || source;
    const railColor = meta.accent || 'var(--cco-color-accent, #4a8268)';
    return `<${tag} class="cco-cal-event warm-row${selectedClass}${compactClass}${kindClass}${conflictClass}${expiringClass}"${typeAttr}${dragAttr} data-cal-event="${escapeAttr(JSON.stringify(payload))}" data-service-type="${serviceType}" data-source="${source}" data-status="${status}" data-mailbox="${mailbox}" style="--rail-color:${railColor};--cco-cal-event-accent:${meta.accent}">
      <span class="warm-rail" style="--rail-color:${railColor}"></span>
      <div class="warm-content">
        <span class="cco-cal-event-time">${escapeHtml(formatTimeRange(slot))}</span>
        <strong class="cco-cal-event-title">${escapeHtml(eventTitle(slot))}</strong>
        ${eventMeta(slot) ? `<span class="cco-cal-event-meta">${escapeHtml(eventMeta(slot))}</span>` : ''}
      </div>
      <div class="warm-actions">
        <span class="cco-cal-event-icons">${renderEventIcons(meta.icons)}</span>
      </div>
    </${tag}>`;
  }

  function listResources(slots, isoDate = '') {
    const map = new Map();
    slots.forEach((slot) => {
      if (isoDate && slotIsoDate(slot) !== isoDate) return;
      const label = String(slot?.resourceLabel || slot?.resource || 'Övrigt').trim() || 'Övrigt';
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(slot);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'));
  }

  function countBookedForDay(slotsByDate, iso) {
    return (slotsByDate.get(iso) || []).filter((slot) => slot?.kind === 'booked').length;
  }

  global.ArcanaBookingCalendarShared = Object.freeze({
    SVG,
    escapeHtml,
    escapeAttr,
    normalizeKey,
    todayIso,
    parseIsoDate,
    isoFromParts,
    formatTimeLabel,
    formatTimeRange,
    formatCaseStatus,
    slotIsoDate,
    slotStartMinutes,
    slotEndMinutes,
    slotDurationMinutes,
    eventKey,
    indexSlotsByDate,
    fetchRangeSlots,
    fetchBookingCases,
    fetchBookedCounts,
    fetchRefData,
    fetchMissingFormsByEmail,
    fetchCalendarSignals,
    fetchCalendarRange,
    mergeCalendarEvents,
    deriveCalendarSignals,
    buildOperationalIconSpecs,
    formatCalendarSignalSummary,
    dedupeIconSpecs,
    buildSlotAtTime,
    rebookCalendarBooking,
    buildBlockCalendarEvent,
    classifyCalendarEvent,
    serviceTypeFor,
    findConflictKeys,
    renderEventIcons,
    renderEventCard,
    eventTitle,
    eventMeta,
    listResources,
    countBookedForDay,
  });
})(window);
