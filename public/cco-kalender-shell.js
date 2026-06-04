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

  // ═══ SPRINT 3: Kundintelligens-rail (4 insikter) ═══════════════════════════
  async function loadIntelligence(slot, pills, mount) {
    const tenantId = global.__ccoCalTenantId || 'hair_tp';
    const role = global.__ccoCalRole || 'owner';
    const treatment = slot.serviceId || pills.treatment || '';
    mount.innerHTML = '<div class="cco-cal-intel-loading">Laddar insikter…</div>';
    try {
      const url = '/api/v1/calendar/booking/' + encodeURIComponent(slot.id) +
        '/intelligence?tenantId=' + encodeURIComponent(tenantId) +
        (treatment ? '&treatment=' + encodeURIComponent(treatment) : '');
      const res = await fetch(url, { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      if (!res.ok) {
        mount.innerHTML = '<div class="cco-cal-intel-empty">Insikter ej tillgängliga (' + res.status + ').</div>';
        return;
      }
      const data = await res.json();
      renderIntelligence(mount, data);
    } catch (err) {
      mount.innerHTML = '<div class="cco-cal-intel-empty">Kunde inte ladda insikter.</div>';
    }
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
    const d = new Date(iso + 'T00:00:00');
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  }
  function weekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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
      const dateObj = new Date(day.date + 'T00:00:00');
      const isToday = day.date === isoToday();
      const col = el('div', { class: 'cco-cal-week-day-col' });
      col.appendChild(el('div', {
        class: 'cco-cal-week-day-header' + (isToday ? ' is-today' : ''),
      }, [
        el('div', { class: 'cco-cal-week-day-name' }, dateObj.toLocaleDateString('sv-SE', { weekday: 'short' })),
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
        const tone = slot.status === 'confirmed' ? 'success'
                   : slot.status === 'pending'   ? 'warning'
                   : slot.status === 'cancelled' ? 'danger' : 'info';
        colBody.appendChild(el('button', {
          class: 'cco-cal-booking cco-cal-booking--compact',
          style: `top: ${top}px; height: ${height}px; border-left-color: ${color};`,
          dataset: { bookingid: slot.id },
          onclick: (e) => { e.stopPropagation(); onBookingClickFn(slot, slot._resource); },
          title: (slot.time || '') + ' ' + (slot.patientName || ''),
        }, [
          el('div', { class: 'cco-cal-booking-time' }, slot.time || ''),
          el('div', { class: 'cco-cal-booking-patient' }, slot.patientName || '—'),
          el('div', { class: 'cco-cal-booking-pills' }, [
            el('span', { class: `cco-cal-pill cco-cal-pill--${tone}` }, slot.status || 'bok'),
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
      const res = await fetch('/api/v1/calendar/week?startDate=' + encodeURIComponent(startDate) +
        '&tenantId=' + encodeURIComponent(tenantId),
        { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      if (!res.ok) {
        if (res.status === 403) {
          mount.innerHTML = '<div class="cco-cal-empty">Saknar permission (bookings.read). Välj annan roll.</div>';
          return;
        }
        throw new Error('HTTP ' + res.status);
      }
      const weekView = await res.json();
      mount.innerHTML = '';
      mount.appendChild(renderWeekGrid(weekView, onBookingClick));

      // Uppdatera existing #calTitle
      const title = document.getElementById('calTitle');
      if (title) {
        const sd = new Date(startDate + 'T00:00:00');
        const ed = new Date(sd); ed.setDate(ed.getDate() + 6);
        const fmt = d => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
        title.textContent = 'Vecka ' + weekNumber(sd) + ' · ' + fmt(sd) + '–' + fmt(ed);
      }
    } catch (err) {
      mount.innerHTML = '<div class="cco-cal-empty">Kunde inte ladda vecka: ' + err.message + '</div>';
    }
  }

  // ═══ CREATE-MODAL (Sprint 2) ═══════════════════════════════════════════════
  let _services = null;
  let _resources = null;

  async function loadServices(tenantId, role) {
    if (_services) return _services;
    try {
      const r = await fetch('/api/v1/calendar/services?tenantId=' + tenantId,
        { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      _services = await r.json();
    } catch { _services = { quickPicks: [], catalog: [] }; }
    return _services;
  }

  async function loadResourcesFromDay(tenantId, role) {
    try {
      const r = await fetch('/api/v1/calendar/day?date=' + isoToday() + '&tenantId=' + tenantId,
        { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
      const d = await r.json();
      return (d.resources || []).filter(x => x.resourceId !== '_unassigned');
    } catch { return []; }
  }

  async function openCreateBookingModal(opts = {}) {
    const tenantId = opts.tenantId || global.__ccoCalTenantId || 'hair_tp';
    const role = opts.role || global.__ccoCalRole || 'owner';
    global.__ccoCalTenantId = tenantId;
    global.__ccoCalRole = role;

    const [svc, resources] = await Promise.all([
      loadServices(tenantId, role),
      loadResourcesFromDay(tenantId, role),
    ]);
    const quickPicks = svc.quickPicks || [];

    const state = {
      serviceId: quickPicks[0]?.id || '',
      serviceLabel: quickPicks[0]?.label || '',
      durationMinutes: quickPicks[0]?.durationMinutes || 30,
      treatment: quickPicks[0]?.treatment || '',
      patientId: '',
      resourceId: resources[0]?.resourceId || '',
      date: opts.date || isoToday(),
      time: opts.time || '09:00',
      notes: '',
      conflicts: [],
    };

    document.querySelectorAll('.cco-cal-create-backdrop').forEach(n => n.remove());
    const backdrop = el('div', { class: 'cco-cal-create-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const modal = el('div', { class: 'cco-cal-create-modal' });
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    // Header
    modal.appendChild(el('div', { class: 'cco-cal-create-head' }, [
      el('h3', {}, 'Ny bokning'),
      el('button', { class: 'cco-cal-create-close', onclick: close, 'aria-label': 'Stäng' }, '×'),
    ]));

    const body = el('div', { class: 'cco-cal-create-body' });

    // Quick-picks (5)
    body.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Behandlingstyp'));
    const picks = el('div', { class: 'cco-cal-create-picks' });
    function renderPicks() {
      picks.innerHTML = '';
      for (const qp of quickPicks) {
        const active = qp.id === state.serviceId;
        picks.appendChild(el('button', {
          class: 'cco-cal-create-pick' + (active ? ' is-active' : ''),
          type: 'button',
          onclick: () => {
            state.serviceId = qp.id;
            state.serviceLabel = qp.label;
            state.durationMinutes = qp.durationMinutes;
            state.treatment = qp.treatment;
            renderPicks();
            checkConflicts();
          },
        }, [
          el('span', { class: 'cco-cal-pick-icon' }, qp.icon || '📅'),
          el('span', {}, qp.label),
          el('span', { class: 'cco-cal-pick-dur' }, qp.durationMinutes + ' min'),
        ]));
      }
    }
    renderPicks();
    body.appendChild(picks);

    // Patient
    body.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Patient (ID)'));
    const patientInput = el('input', {
      class: 'cco-cal-create-input', type: 'text',
      placeholder: 'cliento_xxx eller anon-patient-001',
    });
    patientInput.addEventListener('input', (e) => { state.patientId = e.target.value.trim(); checkConflicts(); });
    body.appendChild(patientInput);

    // Resurs
    body.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Behandlare'));
    const resourceSelect = el('select', { class: 'cco-cal-create-input' });
    if (resources.length === 0) {
      resourceSelect.appendChild(el('option', { value: '' }, 'Inga behandlare hittades'));
    } else {
      for (const r of resources) {
        resourceSelect.appendChild(el('option', { value: r.resourceId }, r.resourceLabel || r.resourceId));
      }
    }
    resourceSelect.value = state.resourceId;
    resourceSelect.addEventListener('change', (e) => { state.resourceId = e.target.value; checkConflicts(); });
    body.appendChild(resourceSelect);

    // Datum + tid
    const dateInput = el('input', { class: 'cco-cal-create-input', type: 'date', value: state.date });
    dateInput.addEventListener('change', (e) => { state.date = e.target.value; checkConflicts(); });
    const timeInput = el('input', { class: 'cco-cal-create-input', type: 'time', value: state.time });
    timeInput.addEventListener('change', (e) => { state.time = e.target.value; checkConflicts(); });
    body.appendChild(el('div', { class: 'cco-cal-create-row2' }, [
      el('div', {}, [el('div', { class: 'cco-cal-create-label' }, 'Datum'), dateInput]),
      el('div', {}, [el('div', { class: 'cco-cal-create-label' }, 'Tid'), timeInput]),
    ]));

    // Notes
    body.appendChild(el('div', { class: 'cco-cal-create-label' }, 'Anteckning (valfri)'));
    const notesInput = el('textarea', { class: 'cco-cal-create-input', rows: '2', placeholder: 'Ex. återbesök efter PRP' });
    notesInput.addEventListener('input', (e) => { state.notes = e.target.value; });
    body.appendChild(notesInput);

    // Conflict-area (live)
    const conflictArea = el('div', { class: 'cco-cal-create-conflict-area' });
    body.appendChild(conflictArea);

    modal.appendChild(body);

    // Footer
    const submitBtn = el('button', { class: 'cco-cal-create-submit', type: 'button' }, 'Skapa bokning');
    submitBtn.addEventListener('click', () => submitCreate(submitBtn, state, close));
    modal.appendChild(el('div', { class: 'cco-cal-create-foot' }, [
      el('button', { class: 'cco-cal-create-cancel', type: 'button', onclick: close }, 'Avbryt'),
      submitBtn,
    ]));

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Debounced conflict-check
    let checkTimer = null;
    function checkConflicts() {
      clearTimeout(checkTimer);
      checkTimer = setTimeout(doCheck, 300);
    }
    async function doCheck() {
      if (!state.resourceId || !state.date || !state.time) return;
      try {
        const r = await fetch('/api/v1/calendar/booking/conflict-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cco-role': role, 'x-cco-tenant': tenantId },
          body: JSON.stringify({
            resourceId: state.resourceId, date: state.date, time: state.time,
            durationMinutes: state.durationMinutes, serviceId: state.serviceId,
            patientId: state.patientId || undefined, treatment: state.treatment || undefined, tenantId,
          }),
        });
        const d = await r.json();
        state.conflicts = d.conflicts || [];
        renderConflictArea(conflictArea, state.conflicts);
      } catch (_) {}
    }
    doCheck();
  }

  function renderConflictArea(node, conflicts) {
    node.innerHTML = '';
    if (!conflicts || conflicts.length === 0) {
      node.appendChild(el('div', { class: 'cco-cal-create-ok' }, '✓ Inga konflikter'));
      return;
    }
    for (const c of conflicts) {
      node.appendChild(el('div', {
        class: 'cco-cal-create-conflict cco-cal-create-conflict--' + (c.severity || 'warn'),
      }, [
        el('strong', {}, c.severity === 'blocker' ? '⛔ Blocker · ' : '⚠ Varning · '),
        el('span', {}, c.message || c.type),
      ]));
    }
  }

  async function submitCreate(btn, state, close) {
    if (!state.patientId) { alert('Ange patient-ID'); return; }
    if (!state.resourceId) { alert('Välj behandlare'); return; }
    const hasBlockers = (state.conflicts || []).some(c => c.severity === 'blocker');
    if (hasBlockers && !confirm('Det finns blocker-konflikter. Skapa ändå (force)?')) return;
    btn.disabled = true;
    btn.textContent = 'Skapar…';
    const tenantId = global.__ccoCalTenantId || 'hair_tp';
    const role = global.__ccoCalRole || 'owner';
    try {
      const r = await fetch('/api/v1/calendar/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cco-role': role, 'x-cco-tenant': tenantId },
        body: JSON.stringify({
          resourceId: state.resourceId, serviceId: state.serviceId,
          date: state.date, time: state.time,
          durationMinutes: state.durationMinutes,
          patientId: state.patientId, treatment: state.treatment,
          notes: state.notes, tenantId, force: hasBlockers,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'HTTP ' + r.status);
      showToast('✓ Bokning skapad · ' + (data.bookingId || ''), 'ok');
      close();
      // Reload dag-vy
      loadDay({ date: state.date });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Skapa bokning';
      showToast('✗ Misslyckades: ' + err.message, 'error');
    }
  }

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

  // ─── Init: kollar URL-view ──────────────────────────────────────────────
  function init() {
    const view = detectViewFromUrl();
    applyView(view);
    if (view === 'calendar') {
      const dagTab = document.querySelector('.segment-tab[data-mode="dag"]');
      if (dagTab) {
        setTimeout(() => {
          dagTab.click();
          loadDay({});
        }, 100);
      } else {
        loadDay({});
      }
    }
    bindSetModeHook();
    bindCreateButton();
  }

  function bindCreateButton() {
    const tryBind = () => {
      const btn = document.getElementById('ccoCalCreateBtn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        openCreateBookingModal({});
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryBind);
    } else {
      tryBind();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.CcoKalenderShell = { loadDay, loadWeek, applyView, renderDrawer, openCreateBookingModal };
})(window);
