/* CCO Kalender Sprint 1 — vanilla JS, no deps.
 * Dagvy + bokningskort + drawer + status-pills + snabbactions.
 * Inga Drive-länkar. Ingen extern AI.
 */
(function (global) {
  'use strict';

  const HOUR_H = 62;
  const HOUR_START = 7;
  const HOUR_END = 19;

  // Stabil resurs-färg-palette
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
    return new Date().toISOString().slice(0, 10);
  }

  function formatTimeRange(start, end) {
    if (!end) return start || '';
    return start + ' – ' + end;
  }

  function formatDateLong(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch { return iso; }
  }

  // ─── Render Morgon-strip ───
  function renderMorgonStrip(dayView) {
    const total = dayView.totalSlots || 0;
    const confirmed = dayView.confirmedBookings || 0;
    const pending = dayView.pendingReservations || 0;
    const resources = (dayView.resources || []).length;

    const strip = el('div', { class: 'morgon-strip' });
    strip.appendChild(el('div', { class: 'morgon-pill', dataset: { kind: 'idag' } }, [
      el('div', { class: 'morgon-pill-kicker' }, 'Idag'),
      el('h3', { class: 'morgon-pill-headline' }, String(total)),
      el('p', { class: 'morgon-pill-sub' }, `${confirmed} bokade · ${pending} tentativa`),
    ]));
    strip.appendChild(el('div', { class: 'morgon-pill', dataset: { kind: 'info' } }, [
      el('div', { class: 'morgon-pill-kicker' }, 'Behandlare'),
      el('h3', { class: 'morgon-pill-headline' }, String(resources)),
      el('p', { class: 'morgon-pill-sub' }, 'aktiva på schemat'),
    ]));
    strip.appendChild(el('div', { class: 'morgon-pill', dataset: { kind: 'risk' } }, [
      el('div', { class: 'morgon-pill-kicker' }, 'Risk'),
      el('h3', { class: 'morgon-pill-headline' }, '–'),
      el('p', { class: 'morgon-pill-sub' }, 'no-show-prognos saknas (P2)'),
    ]));
    strip.appendChild(el('div', { class: 'morgon-pill', dataset: { kind: 'done' } }, [
      el('div', { class: 'morgon-pill-kicker' }, 'Klar'),
      el('h3', { class: 'morgon-pill-headline' }, '–'),
      el('p', { class: 'morgon-pill-sub' }, 'check-in-räknare (P2)'),
    ]));
    return strip;
  }

  // ─── Render Day-grid ───
  function renderDayGrid(dayView, onBookingClick) {
    const resources = (dayView.resources || []).filter(r => r.resourceId !== '_unassigned');
    const unassigned = (dayView.resources || []).find(r => r.resourceId === '_unassigned');
    const totalResources = resources.length + (unassigned ? 1 : 0);

    if (totalResources === 0) {
      return el('div', { class: 'cal-empty' }, 'Inga bokningar och inga aktiva behandlare för dagen.');
    }

    // Time-col
    const grid = el('div', { class: 'cal-day-grid' });
    const hourCol = el('div', { class: 'cal-hour-col' });
    for (let h = HOUR_START; h < HOUR_END; h++) {
      hourCol.appendChild(el('div', { class: 'cal-hour-row' }, `${String(h).padStart(2,'0')}:00`));
    }
    grid.appendChild(hourCol);

    // Resources area
    const right = el('div');

    // Headers
    const headers = el('div', { class: 'cal-resources-row' });
    for (const r of resources) {
      const color = colorForResource(r.resourceId);
      headers.appendChild(el('div', { class: 'cal-resource-header' }, [
        el('span', { class: 'cal-resource-dot', style: `background: ${color}` }),
        el('span', {}, r.resourceLabel || r.resourceId),
      ]));
    }
    if (unassigned) {
      headers.appendChild(el('div', { class: 'cal-resource-header' }, [
        el('span', { class: 'cal-resource-dot', style: 'background: #84756b' }),
        el('span', {}, 'Ej tilldelad'),
      ]));
    }
    right.appendChild(headers);

    // Resource columns with booking-cards
    const cols = el('div', {
      class: 'cal-resources-grid',
      style: `grid-template-columns: repeat(${totalResources}, 1fr);`,
    });
    const renderResourceCol = (r) => {
      const col = el('div', { class: 'cal-resource-col' });
      const color = colorForResource(r.resourceId);
      for (const slot of (r.slots || [])) {
        const startMin = timeToMinutes(slot.time);
        const endMin = slot.endTime ? timeToMinutes(slot.endTime) : startMin + 30;
        const top = Math.max(0, minutesToY(startMin));
        const height = Math.max(28, ((endMin - startMin) / 60) * HOUR_H - 2);
        const statusTone = slot.status === 'confirmed' ? 'success'
                         : slot.status === 'pending'   ? 'warning'
                         : slot.status === 'cancelled' ? 'danger' : 'info';
        const card = el('button', {
          class: 'cal-booking',
          style: `top: ${top}px; height: ${height}px; border-left-color: ${color};`,
          dataset: { bookingid: slot.id },
          onclick: (e) => { e.stopPropagation(); onBookingClick(slot, r); },
        }, [
          el('div', { class: 'cal-booking-time' }, formatTimeRange(slot.time, slot.endTime)),
          el('div', { class: 'cal-booking-patient' }, slot.patientName || '(okänd patient)'),
          el('div', { class: 'cal-booking-service' }, slot.serviceLabel || slot.serviceId || ''),
          el('div', { class: 'cal-booking-pills' }, [
            el('span', { class: `cal-pill cal-pill--${statusTone}` }, slot.status || 'bokad'),
          ]),
        ]);
        col.appendChild(card);
      }
      cols.appendChild(col);
    };
    resources.forEach(renderResourceCol);
    if (unassigned) renderResourceCol(unassigned);

    right.appendChild(cols);
    grid.appendChild(right);
    return grid;
  }

  // ─── Snabbactions (dynamisk primary) ───
  // Owner-spec:
  //   Om docs saknas: primary = Skicka formulär
  //   Om patient ej ankommen: primary = Ankommen
  //   Om patient ankommen: primary = Starta journal
  function computePrimary(pills, bookingStatus) {
    if (pills && Array.isArray(pills.blockingMissing) && pills.blockingMissing.length > 0) return 'send-form';
    if (bookingStatus === 'checked_in') return 'start-journal';
    return 'checkin';
  }

  function renderActions(slot, pills, callbacks) {
    const primary = computePrimary(pills, slot.bookingStatus);
    const ACTIONS = [
      { id: 'checkin',        label: 'Ankommen',       icon: '✓',   onclick: callbacks.onCheckin },
      { id: 'start-journal',  label: 'Starta journal', icon: '📝',  onclick: callbacks.onStartJournal },
      { id: 'send-form',      label: 'Skicka formulär',icon: '📋',  onclick: callbacks.onSendForm },
      { id: 'follow-up',      label: 'Återbesök',      icon: '↻',   onclick: callbacks.onFollowUp },
      { id: 'no-show',        label: 'No-show',        icon: '✗',   onclick: callbacks.onNoShow },
      { id: 'open-card',      label: 'Öppna kort',     icon: '👤',  onclick: callbacks.onOpenCard },
    ];
    const grid = el('div', { class: 'cal-actions' });
    for (const a of ACTIONS) {
      grid.appendChild(el('button', {
        class: 'cal-action',
        dataset: { primary: String(a.id === primary), action: a.id },
        onclick: a.onclick,
      }, [
        el('span', { class: 'cal-action-icon' }, a.icon),
        el('span', {}, a.label),
      ]));
    }
    return grid;
  }

  // ─── Status-pill-rendering ───
  function pillForStatus(status) {
    if (status === 'signed' || status === 'verified') return { cls: 'cal-pill--success', label: '✓ Klar' };
    if (status === 'draft' || status === 'sent')       return { cls: 'cal-pill--warning', label: 'Påbörjad' };
    if (status === 'missing')                          return { cls: 'cal-pill--danger', label: '✗ Saknas' };
    return { cls: 'cal-pill--info', label: status || '?' };
  }

  function renderStatusSection(pills) {
    const wrap = el('div', { class: 'cal-drawer-section' });
    wrap.appendChild(el('h4', { class: 'cal-drawer-section-title' }, 'Dokument-status'));

    const rows = [
      ['Behandlingsjournal', pills.journal?.status || 'missing'],
      ['Hälsodeklaration',   pills.healthDeclaration?.status || 'missing'],
      ['Friskförsäkran',     pills.fitnessCertificate?.status || 'missing'],
      ['Samtycke',           pills.consent?.status || 'missing'],
      ['Behandlingsavtal',   pills.agreement?.status || 'missing'],
      ['ID-verifierad',      pills.idVerification?.status || 'missing'],
    ];
    for (const [label, status] of rows) {
      const p = pillForStatus(status);
      wrap.appendChild(el('div', { class: 'cal-status-row' }, [
        el('span', { class: 'cal-status-row-label' }, label),
        el('span', { class: `cal-pill ${p.cls}` }, p.label),
      ]));
    }
    return wrap;
  }

  function renderReadyBanner(pills) {
    if (pills.readyForTreatment === true) {
      return el('div', { class: 'cal-ready-banner cal-ready-banner--ok' }, [
        el('span', {}, '🟢'),
        el('span', {}, 'Ready for treatment — alla obligatoriska dokument signerade.'),
      ]);
    }
    const blockers = pills.blockingMissing || [];
    if (blockers.length > 0) {
      const list = el('ul', { class: 'cal-blockers-list' });
      const LABEL = {
        healthDeclaration: 'Hälsodeklaration',
        fitnessCertificate: 'Friskförsäkran',
        treatmentAgreement: 'Behandlingsavtal',
        treatmentConsent: 'Samtycke',
        idVerification: 'ID-verifiering',
      };
      for (const b of blockers) list.appendChild(el('li', {}, LABEL[b] || b));
      return el('div', { class: 'cal-ready-banner cal-ready-banner--blocked' }, [
        el('div', {}, [
          el('div', {}, '🔴 Inte redo för behandling'),
          list,
        ]),
      ]);
    }
    return null;
  }

  // ─── Drawer ───
  function renderDrawer(slot, pills) {
    const root = document.querySelector('#cal-drawer');
    const backdrop = document.querySelector('#cal-drawer-backdrop');
    if (!root) return;

    root.innerHTML = '';
    root.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-open');

    const closeDrawer = () => {
      root.classList.remove('is-open');
      if (backdrop) backdrop.classList.remove('is-open');
      root.innerHTML = '';
      renderEmptyDrawer();
    };
    if (backdrop) backdrop.onclick = closeDrawer;

    // Header
    root.appendChild(el('div', { class: 'cal-drawer-header' }, [
      el('h3', {}, slot.patientName || '(okänd patient)'),
      el('div', { class: 'cal-drawer-header-meta' },
        formatTimeRange(slot.time, slot.endTime) + ' · ' + (slot.serviceLabel || slot.serviceId || 'tjänst')),
    ]));

    // Ready-banner
    const banner = renderReadyBanner(pills);
    if (banner) root.appendChild(banner);

    // Snabbactions
    const actions = renderActions(slot, pills, {
      onCheckin:       () => triggerAction('checkin', slot, pills),
      onStartJournal:  () => triggerAction('start-journal', slot, pills),
      onSendForm:      () => triggerAction('send-form', slot, pills),
      onFollowUp:      () => triggerAction('follow-up', slot, pills),
      onNoShow:        () => triggerAction('no-show', slot, pills),
      onOpenCard:      () => triggerAction('open-card', slot, pills),
    });
    root.appendChild(actions);

    // Status-pills
    root.appendChild(renderStatusSection(pills));

    // Patient-snapshot
    const snap = el('div', { class: 'cal-snapshot' }, [
      el('div', { class: 'cal-snapshot-name' }, slot.patientName || '—'),
      el('div', { class: 'cal-snapshot-meta' },
        'Patient-ID: ' + (pills.patientId || '—') +
        (pills.encounterId ? ' · Encounter: ' + pills.encounterId.slice(0, 8) + '…' : '')),
    ]);
    root.appendChild(snap);

    // Mini journal-feed mount (om CcoJournalFeed laddad)
    if (window.CcoJournalFeed && pills.patientId) {
      const mini = el('div', { class: 'cal-journal-mini', id: 'cal-journal-mini-mount' });
      root.appendChild(mini);
      try {
        window.CcoJournalFeed.mount('#cal-journal-mini-mount', {
          customerId: pills.patientId,
          tenantId: global.__calTenantId || 'hair_tp',
          headers: { 'x-cco-role': global.__calRole || 'owner', 'x-cco-tenant': global.__calTenantId || 'hair_tp' },
        });
      } catch (_) {/* tyst */}
    }
  }

  function renderEmptyDrawer() {
    const root = document.querySelector('#cal-drawer');
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'cal-drawer-empty' },
      'Välj en bokning till vänster för att se patientkortet, status och snabbactions.'));
  }

  // ─── Snabbaction handlers ───
  async function triggerAction(actionId, slot, pills) {
    const bookingId = slot.id;
    if (!bookingId) return;
    const tenantId = global.__calTenantId || 'hair_tp';
    const role = global.__calRole || 'owner';
    const headers = { 'x-cco-role': role, 'x-cco-tenant': tenantId, 'Content-Type': 'application/json' };

    if (actionId === 'open-card') {
      if (pills.patientId) window.open('/kunder.html?id=' + encodeURIComponent(pills.patientId), '_blank');
      return;
    }

    if (actionId === 'start-journal') {
      if (!pills.patientId) { alert('Patient ej kopplad'); return; }
      const url = '/smart-anteckning.html?patientId=' + encodeURIComponent(pills.patientId) +
        (pills.encounterId ? '&encounterId=' + encodeURIComponent(pills.encounterId) : '') +
        '&tenantId=' + encodeURIComponent(tenantId);
      window.open(url, '_blank');
      return;
    }

    if (actionId === 'send-form') {
      alert('Skicka formulär — wirad mot patient-portal-invite i nästa sprint. Bokar audit istället.');
      // TODO Sprint 2: POST /api/v1/cco-forms/invite
      return;
    }

    const endpointMap = {
      'checkin':   '/api/v1/cco-bookings/' + encodeURIComponent(bookingId) + '/checkin',
      'no-show':   '/api/v1/cco-bookings/' + encodeURIComponent(bookingId) + '/no-show',
      'follow-up': '/api/v1/cco-bookings/' + encodeURIComponent(bookingId) + '/follow-up',
    };
    const body = actionId === 'no-show' ? { reason: prompt('Anledning (valfri)?') || '' }
               : actionId === 'follow-up' ? { interval: prompt('Intervall (ex. "3m"/"6m"/"12m")?') || '' }
               : {};

    try {
      const res = await fetch(endpointMap[actionId], { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      showToast('✓ ' + actionId + ' loggad', 'ok');
    } catch (err) {
      showToast('✗ Misslyckades: ' + err.message, 'error');
    }
  }

  function showToast(msg, kind) {
    document.querySelectorAll('.cal-toast').forEach(n => n.remove());
    const toast = el('div', {
      class: 'cal-toast',
      style: `position: fixed; bottom: 24px; right: 24px; z-index: 10000;
              padding: 11px 16px; border-radius: 12px; font-size: 12px; font-weight: 600;
              box-shadow: 0 18px 38px rgba(93,74,60,.18);
              ${kind === 'ok' ? 'background: linear-gradient(180deg, #d8eadd, #b8d8c5); color: #4a8268; border: 1px solid rgba(74,130,104,.32);'
                              : 'background: linear-gradient(180deg, #f5d6d3, #e8b5b0); color: #b94a4a; border: 1px solid rgba(185,74,74,.32);'}`,
    }, msg);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ─── Booking click handler ───
  async function onBookingClick(slot, resource) {
    const tenantId = global.__calTenantId || 'hair_tp';
    const role = global.__calRole || 'owner';
    const treatment = slot.serviceId || '';
    // Hämta status-pills
    let pills = {
      patientId: null, encounterId: null, treatment,
      journal: { status: 'missing' }, healthDeclaration: { status: 'missing' },
      fitnessCertificate: { status: 'missing' }, consent: { status: 'missing' },
      agreement: { status: 'missing' }, idVerification: { status: 'missing' },
      readyForTreatment: false, blockingMissing: [],
    };
    try {
      const url = '/api/v1/calendar/booking/' + encodeURIComponent(slot.id) +
        '/status-pills?tenantId=' + encodeURIComponent(tenantId) +
        (treatment ? '&treatment=' + encodeURIComponent(treatment) : '');
      const res = await fetch(url, { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      if (res.ok) pills = await res.json();
    } catch (_) {/* tyst */}

    renderDrawer(slot, pills);
  }

  // ─── Main load ───
  async function loadDay(opts = {}) {
    const date = opts.date || isoToday();
    const tenantId = opts.tenantId || 'hair_tp';
    const role = opts.role || 'owner';
    global.__calTenantId = tenantId;
    global.__calRole = role;

    const root = document.querySelector('#cal-mount');
    if (!root) return;
    root.innerHTML = '<div class="cal-empty">Laddar dagens kalender…</div>';

    try {
      const res = await fetch('/api/v1/calendar/day?date=' + encodeURIComponent(date) +
        '&tenantId=' + encodeURIComponent(tenantId),
        { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + ' · ' + t);
      }
      const dayView = await res.json();

      root.innerHTML = '';
      // Morgon-strip (compact)
      root.appendChild(renderMorgonStrip(dayView));
      // Day-grid
      root.appendChild(renderDayGrid(dayView, onBookingClick));

      // Title-update
      const title = document.querySelector('#calTitle');
      if (title) title.textContent = formatDateLong(dayView.date) + ' · ' + (dayView.totalSlots || 0) + ' bokningar';
    } catch (err) {
      root.innerHTML = '<div class="cal-empty">Kunde inte ladda: ' + err.message + '</div>';
    }
  }

  global.CcoKalender = { loadDay, renderEmptyDrawer };
})(window);
