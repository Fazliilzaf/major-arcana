/* ─── CCO Kalender-shell wire för kunder.html ─────────────────────────────
 * Aktiverar existing .calendar-shell (kunder.html L3328) och wirar
 * Sprint 1-2 backend-endpoints in i existing morgon/vecka/dag/resurs-tabs.
 *
 * Owner-direktiv: ingen ny fristående kalender. kunder.html calendar-shell
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

  function isoToday() { return new Date().toISOString().slice(0, 10); }

  function formatTimeRange(start, end) {
    if (!end) return start || '';
    return start + '–' + end;
  }

  // ─── View-switch: kunder vs kalender ─────────────────────────────────────
  function detectViewFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') || 'customers';
    } catch { return 'customers'; }
  }

  function applyView(view) {
    const body = document.body;
    const calendarShell = document.querySelector('.calendar-shell');
    body.setAttribute('data-cco-view', view === 'calendar' ? 'calendar' : 'customers');
    if (calendarShell) calendarShell.hidden = (view !== 'calendar');
    // Uppdatera top-nav active state (mjuk — bryter inte existing)
    if (view === 'calendar') {
      document.querySelectorAll('.top-nav a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const isCalendar = href.includes('/kalender.html') || href.includes('view=calendar');
        const isKunder = href.includes('/kunder.html') && !href.includes('view=');
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

    if (totalResources === 0) {
      return el('div', { class: 'cco-cal-empty' }, 'Inga bokningar och inga aktiva behandlare för dagen.');
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
        const tone = slot.status === 'confirmed' ? 'success'
                   : slot.status === 'pending'   ? 'warning'
                   : slot.status === 'cancelled' ? 'danger' : 'info';
        col.appendChild(el('button', {
          class: 'cco-cal-booking',
          style: `top: ${top}px; height: ${height}px; border-left-color: ${color};`,
          dataset: { bookingid: slot.id },
          onclick: (e) => { e.stopPropagation(); onBookingClick(slot, r); },
        }, [
          el('div', { class: 'cco-cal-booking-time' }, formatTimeRange(slot.time, slot.endTime)),
          el('div', { class: 'cco-cal-booking-patient' }, slot.patientName || '(okänd patient)'),
          el('div', { class: 'cco-cal-booking-service' }, slot.serviceLabel || slot.serviceId || ''),
          el('div', { class: 'cco-cal-booking-pills' }, [
            el('span', { class: `cco-cal-pill cco-cal-pill--${tone}` }, slot.status || 'bokad'),
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

  // ─── Booking click → fetch status-pills + render drawer ──────────────────
  async function onBookingClick(slot) {
    const tenantId = global.__ccoCalTenantId || 'hair_tp';
    const role = global.__ccoCalRole || 'owner';
    const treatment = slot.serviceId || '';

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
    } catch (_) {}

    renderDrawer(slot, pills);
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
      { id: 'checkin',       label: 'Ankommen',       icon: '✓' },
      { id: 'start-journal', label: 'Starta journal', icon: '📝' },
      { id: 'send-form',     label: 'Skicka formulär',icon: '📋' },
      { id: 'follow-up',     label: 'Återbesök',      icon: '↻' },
      { id: 'no-show',       label: 'No-show',        icon: '✗' },
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
    return 'checkin';
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
      if (pills.patientId) window.location.href = '/kunder.html?id=' + encodeURIComponent(pills.patientId);
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
    const endpointMap = {
      'checkin':   '/api/v1/cco-bookings/' + encodeURIComponent(bookingId) + '/checkin',
      'no-show':   '/api/v1/cco-bookings/' + encodeURIComponent(bookingId) + '/no-show',
      'follow-up': '/api/v1/cco-bookings/' + encodeURIComponent(bookingId) + '/follow-up',
    };
    const body = actionId === 'no-show'    ? { reason: prompt('Anledning (valfri)?') || '' }
               : actionId === 'follow-up'  ? { interval: prompt('Intervall (3m/6m/12m)?') || '' }
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
    document.querySelectorAll('.cco-cal-toast').forEach(n => n.remove());
    const toast = el('div', { class: 'cco-cal-toast cco-cal-toast--' + (kind || 'ok') }, msg);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
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
      const res = await fetch('/api/v1/calendar/day?date=' + encodeURIComponent(date) +
        '&tenantId=' + encodeURIComponent(tenantId),
        { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      if (!res.ok) {
        if (res.status === 403) {
          mount.innerHTML = '<div class="cco-cal-empty">Saknar permission (bookings.read). Välj annan roll.</div>';
          return;
        }
        throw new Error('HTTP ' + res.status);
      }
      const dayView = await res.json();
      mount.innerHTML = '';
      mount.appendChild(renderDayGrid(dayView, onBookingClick));

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

  // ─── Hook in i existing setMode-flow ────────────────────────────────────
  function bindSetModeHook() {
    // Vänta lite så existing JS har definierat setMode
    const tryBind = () => {
      const tabs = document.querySelectorAll('.segment-tab');
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          const mode = t.dataset.mode;
          if (mode === 'dag') {
            // Trigger vår dag-rendering
            setTimeout(() => loadDay({}), 50);
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

  // ─── Init: kollar URL-view ──────────────────────────────────────────────
  function init() {
    const view = detectViewFromUrl();
    applyView(view);
    if (view === 'calendar') {
      // Trigger dag-mode via existing setMode om finns, annars rendera direkt
      const dagTab = document.querySelector('.segment-tab[data-mode="dag"]');
      if (dagTab) {
        // Override boot setMode('vecka') genom att klicka dag-tab
        setTimeout(() => {
          dagTab.click();
          loadDay({});
        }, 100);
      } else {
        loadDay({});
      }
    }
    bindSetModeHook();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.CcoKalenderShell = { loadDay, applyView, renderDrawer };
})(window);
