'use strict';

/*
 * Brevlåde-väljare för CCO Konversationer (admin#cco).
 *
 * DESIGN FÖRST: renderar UI:t (väljare + status + folder-scope + läsfönster) i
 * befintlig layout/palett. Speglar lane-row/inbox-tab: neutralt mörk text, accent
 * (rosa) bara på kryssruta + räls/avatar — aldrig rosa-tvättad text/bakgrund.
 *
 * Hopfällbara sektioner (sticky). Auto-sync (ingen manuell knapp) — läser
 * spegeln på schema. Datakontraktet ("resten") kopplas på senare; modulen läser
 * GET /api/v1/cco/runtime/mailboxes när den finns, annars "väntar på data".
 *
 * Ändrar ingen live-send. Ingen ny färg — allt via befintliga CCO-tokens.
 */

(function () {
  const LS_KEY = 'cco_mailbox_valjare_v1';
  const REFRESH_MS = 120000; // auto-läs spegeln var 2:a minut (ingen live-fetch per öppning)
  // id → { label, sub, rail }. Rälsfärger ur befintlig CCO-palett (inga nya färger).
  const MAILBOXES = [
    { id: 'kons@hairtpclinic.com', label: 'Kons', sub: 'kons@hairtpclinic.com', rail: '#9c2c62' },
    {
      id: 'contact@hairtpclinic.com',
      label: 'Contact',
      sub: 'contact@hairtpclinic.com',
      rail: 'var(--rail-contact, #2596a8)',
    },
    {
      id: 'egzona@hairtpclinic.com',
      label: 'Egzona',
      sub: 'egzona@hairtpclinic.com',
      rail: 'var(--rail-egzona, #a37433)',
    },
    {
      id: 'fazli@hairtpclinic.com',
      label: 'Fazli',
      sub: 'fazli@hairtpclinic.com',
      rail: 'var(--rail-fazli, #7c3aed)',
    },
    {
      id: 'marknad@hairtpclinic.com',
      label: 'Marknad',
      sub: 'marknad@hairtpclinic.com',
      rail: '#9c6210',
    },
    {
      id: 'kvitto@hairtpclinic.com',
      label: 'Kvitto',
      sub: 'kvitto@hairtpclinic.com',
      rail: '#3d6e58',
    },
    {
      id: 'halso@hairtpclinic.com',
      label: 'Hälso',
      sub: 'halso@hairtpclinic.com',
      rail: 'var(--rail-info, #4a7ba8)',
    },
  ];
  const DEFAULT_STATE = {
    mailboxIds: MAILBOXES.map((m) => m.id),
    folder: 'inbox',
    windowDays: 90,
    collapsed: { mailboxes: false, scope: true }, // FILTER hopfällt som default (tar minimal plats)
  };

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'style') n.style.cssText = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') {
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else n.setAttribute(k, attrs[k]);
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (!s) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const validIds = new Set(MAILBOXES.map((m) => m.id));
      const c = s.collapsed || {};
      return {
        mailboxIds: Array.isArray(s.mailboxIds)
          ? s.mailboxIds.filter((id) => validIds.has(id))
          : DEFAULT_STATE.mailboxIds.slice(),
        folder: ['inbox', 'sent', 'drafts'].includes(s.folder) ? s.folder : 'inbox',
        windowDays: [30, 90, 365].includes(s.windowDays) ? s.windowDays : 90,
        collapsed: { mailboxes: c.mailboxes === true, scope: c.scope === true },
      };
    } catch (_e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }
  function saveState(s) {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (_e) {
      /* best-effort */
    }
  }

  function relTime(iso) {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return 'nyss';
    if (mins < 60) return mins + ' min sedan';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + ' tim sedan';
    return Math.round(hrs / 24) + ' dgr sedan';
  }

  function injectStyle() {
    if (document.getElementById('ccoMbvStyle')) return;
    // Speglar konversationer.html: lane-kicker, lane-row (neutral), inbox-tab.active.
    const css =
      '.mbv{margin:0 0 12px}' +
      '.mbv-kicker{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;appearance:none;border:0;background:transparent;cursor:pointer;' +
      'font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#84756b;padding:0 6px 8px;border-bottom:1px solid rgba(132,117,107,.18);margin-bottom:6px}' +
      '.mbv-kicker-l{display:flex;align-items:baseline;gap:8px;min-width:0}' +
      '.mbv-sum{font-size:9.5px;font-weight:700;letter-spacing:.02em;text-transform:none;color:var(--cco-text-tertiary,#6a717d)}' +
      '.mbv-chev{font-size:8px;color:#84756b;transition:transform .15s ease}' +
      '.mbv-kicker.col .mbv-chev{transform:rotate(-90deg)}' +
      '.mbv-body[hidden]{display:none}' +
      // Ingen räls — avataren bär färgen (som tråd-korten). Grid utan räls-kolumn.
      '.mbv-row{display:grid;grid-template-columns:26px 1fr 16px;gap:10px;align-items:center;padding:6px 10px;border-radius:10px;cursor:pointer;transition:background .14s ease;margin-bottom:1px}' +
      '.mbv-row:hover{background:rgba(255,255,255,.6)}' +
      // Avatar: matcha tråd-kortens .thread-av — mjuk gradient (ljus topp → färg) + len skugga.
      '.mbv-av{width:26px;height:26px;border-radius:999px;display:grid;place-items:center;font-size:10px;font-weight:800;color:#fff;background:linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,0) 62%),var(--r,#84756b);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 2px 6px rgba(56,40,28,.16)}' +
      '.mbv-name{font-size:11.5px;font-weight:700;color:#6b6258;line-height:1.2;letter-spacing:-.01em}' +
      '.mbv-row.on .mbv-name{color:#1d1e24;font-weight:800}' +
      '.mbv-meta{font-size:10px;color:#84756b;margin-top:2px;font-variant-numeric:tabular-nums}' +
      '.mbv-meta .warnc{color:var(--cco-status-warning,#c8821e)}' +
      '.mbv-meta .errc{color:var(--cco-status-danger,#b94a4a);font-weight:700}' +
      // Kryssruta: mjuk rosa bock på svag rosa ton (inte vit bock på klarrosa fylld ruta)
      '.mbv-chk{width:16px;height:16px;border-radius:6px;border:1.5px solid rgba(132,117,107,.3);display:grid;place-items:center;color:transparent;font-size:10.5px;font-weight:800;background:transparent;transition:background .12s ease,border-color .12s ease}' +
      '.mbv-row.on .mbv-chk,.mbv-row.part .mbv-chk{background:rgba(187,71,121,.13);border-color:rgba(187,71,121,.45);color:var(--accent-studio,#bb4779)}' +
      '.mbv-sep{height:1px;background:rgba(132,117,107,.14);margin:6px 2px}' +
      // Kontroller (inkorg-headern) — kompakt inline-toolbar, slimmade pills
      '.mbv-unit{display:flex;align-items:center;gap:7px}' +
      '.mbv-inlabel{font-size:10px;font-weight:700;color:#84756b;letter-spacing:.01em}' +
      // Segment-container: matcha CCO .inbox-tabs (ljus translucent vit yta), tightare
      '.mbv-seg{display:inline-flex;background:rgba(255,255,255,.5);border-radius:9px;padding:2px;gap:2px}' +
      '.mbv-seg button{appearance:none;font:inherit;font-size:10.5px;font-weight:700;letter-spacing:.01em;border:0;background:transparent;cursor:pointer;color:var(--cco-text-secondary,#5d6470);padding:0 9px;min-height:23px;border-radius:7px}' +
      '.mbv-seg button.on{background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(244,238,232,.85));color:var(--cco-color-brand,#1d1e24);box-shadow:0 1px 4px rgba(56,40,28,.06),inset 0 1px 0 rgba(255,255,255,.9)}' +
      '.mbv-scope{margin:2px 0 10px}' +
      '.mbv-scope-body[hidden]{display:none}' +
      '.mbv-scope-row{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:6px}';
    document.head.appendChild(el('style', { id: 'ccoMbvStyle' }, css));
  }

  function dispatchChange(state) {
    try {
      document.dispatchEvent(
        new CustomEvent('cco:mailbox-selection-change', {
          detail: JSON.parse(JSON.stringify(state)),
        })
      );
    } catch (_e) {
      /* CustomEvent kan saknas i mycket gamla klienter — icke-kritiskt */
    }
  }

  // Hopfällbar sektion: klickbar kicker + chevron; hidden-attribut på body.
  // extra = valfri liten sammanfattnings-nod (t.ex. aktivt filter) bredvid etiketten.
  function collapsibleKicker(label, collapsed, onToggle, extra) {
    const chev = el('span', { class: 'mbv-chev' }, '▾');
    const left = el(
      'span',
      { class: 'mbv-kicker-l' },
      extra ? [el('span', {}, label), extra] : [label]
    );
    const btn = el('button', { class: 'mbv-kicker' + (collapsed ? ' col' : ''), type: 'button' }, [
      left,
      chev,
    ]);
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('col');
      btn.classList.toggle('col', next);
      onToggle(next);
    });
    return btn;
  }

  function mount() {
    const rail = document.getElementById('lane-sidebar');
    const inbox = document.querySelector('.inbox-shell');
    if (!rail || document.getElementById('ccoMbv')) return;
    injectStyle();

    const state = loadState();
    let statusById = {};

    // ── Panel A: brevlåde-väljaren (vänsterrälen, överst) ──
    const rowsWrap = el('div', {});
    const allRow = el('div', { class: 'mbv-row mbv-all', style: '--r:var(--rail-info,#84756b)' });
    const body = el('div', { class: 'mbv-body' }, [
      allRow,
      el('div', { class: 'mbv-sep' }),
      rowsWrap,
    ]);
    body.hidden = state.collapsed.mailboxes;
    const kicker = collapsibleKicker('Brevlådor', state.collapsed.mailboxes, (col) => {
      body.hidden = col;
      state.collapsed.mailboxes = col;
      saveState(state);
    });
    const panel = el('div', { class: 'mbv', id: 'ccoMbv' }, [kicker, body]);

    function isOn(id) {
      return state.mailboxIds.indexOf(id) >= 0;
    }
    function statusMeta(id) {
      const st = statusById[id];
      if (!st) return el('span', {}, 'väntar på data');
      if (st.error) {
        return el(
          'span',
          { class: 'errc' },
          '⚠ synk-fel · ' + (relTime(st.error.lastAttemptAt) || 'okänt')
        );
      }
      const c = st.counts || {};
      const sync = relTime(st.lastSyncAt);
      const txt =
        (c.inbox != null ? c.inbox : '–') +
        ' ink · ' +
        (c.sent != null ? c.sent : '–') +
        ' skick' +
        (sync ? ' · synk ' + sync : '');
      return el('span', {}, txt);
    }

    function renderRows() {
      rowsWrap.innerHTML = '';
      for (const m of MAILBOXES) {
        const on = isOn(m.id);
        const row = el(
          'div',
          {
            class: 'mbv-row' + (on ? ' on' : ''),
            style: '--r:' + m.rail,
            onclick: () => toggle(m.id),
          },
          [
            el('span', { class: 'mbv-av' }, m.label.slice(0, 1)),
            el('div', {}, [
              el('div', { class: 'mbv-name' }, m.label),
              el('div', { class: 'mbv-meta' }, [statusMeta(m.id)]),
            ]),
            el('span', { class: 'mbv-chk' }, on ? '✓' : ''),
          ]
        );
        rowsWrap.appendChild(row);
      }
      const total = MAILBOXES.length;
      const sel = state.mailboxIds.length;
      allRow.className = 'mbv-row mbv-all' + (sel === total ? ' on' : sel > 0 ? ' part' : '');
      allRow.innerHTML = '';
      allRow.appendChild(el('span', { class: 'mbv-av' }, '∑'));
      allRow.appendChild(
        el('div', {}, [
          el('div', { class: 'mbv-name' }, 'Alla'),
          el('div', { class: 'mbv-meta' }, sel + ' av ' + total + ' valda'),
        ])
      );
      allRow.appendChild(
        el('span', { class: 'mbv-chk' }, sel === total ? '✓' : sel > 0 ? '–' : '')
      );
      allRow.onclick = toggleAll;
    }

    function commit() {
      saveState(state);
      renderRows();
      dispatchChange(state);
    }
    function toggle(id) {
      const i = state.mailboxIds.indexOf(id);
      if (i >= 0) state.mailboxIds.splice(i, 1);
      else state.mailboxIds.push(id);
      commit();
    }
    function toggleAll() {
      state.mailboxIds =
        state.mailboxIds.length === MAILBOXES.length ? [] : MAILBOXES.map((m) => m.id);
      commit();
    }

    rail.insertBefore(panel, rail.firstChild);

    // ── Panel B: folder-scope + läsfönster (inkorg-headern), hopfällbar ──
    if (inbox && !document.getElementById('ccoMbvScope')) {
      const seg = (label, opts, current, onPick) => {
        const buttons = opts.map((o) =>
          el(
            'button',
            {
              type: 'button',
              class: o.value === current() ? 'on' : '',
              onclick: (e) => {
                onPick(o.value);
                for (const b of e.currentTarget.parentNode.children) b.className = '';
                e.currentTarget.className = 'on';
              },
            },
            o.label
          )
        );
        // Kompakt inline-enhet: liten gemen etikett bredvid slimmad segment-rad.
        return el('div', { class: 'mbv-unit' }, [
          el('span', { class: 'mbv-inlabel' }, label),
          el('div', { class: 'mbv-seg' }, buttons),
        ]);
      };
      const scopeBody = el('div', { class: 'mbv-scope-body' }, [
        el('div', { class: 'mbv-scope-row' }, [
          seg(
            'Mapp',
            [
              { value: 'inbox', label: 'Inkorg' },
              { value: 'sent', label: 'Skickat' },
              { value: 'drafts', label: 'Utkast' },
            ],
            () => state.folder,
            (v) => {
              state.folder = v;
              commit();
              updateScopeSummary();
            }
          ),
          seg(
            'Dagar',
            [
              { value: 30, label: '30' },
              { value: 90, label: '90' },
              { value: 365, label: '365' },
            ],
            () => state.windowDays,
            (v) => {
              state.windowDays = v;
              commit();
              updateScopeSummary();
            }
          ),
        ]),
      ]);
      scopeBody.hidden = state.collapsed.scope;
      // Liten sammanfattning i FILTER-raden så aktivt val syns även hopfällt.
      const FOLDER_LABEL = { inbox: 'Inkorg', sent: 'Skickat', drafts: 'Utkast' };
      const scopeSummary = el('span', { class: 'mbv-sum' }, '');
      function updateScopeSummary() {
        scopeSummary.textContent =
          (FOLDER_LABEL[state.folder] || 'Inkorg') + ' · ' + state.windowDays + ' d';
      }
      updateScopeSummary();
      const scopeKicker = collapsibleKicker(
        'Filter',
        state.collapsed.scope,
        (col) => {
          scopeBody.hidden = col;
          state.collapsed.scope = col;
          saveState(state);
        },
        scopeSummary
      );
      const scope = el('div', { id: 'ccoMbvScope', class: 'mbv-scope' }, [scopeKicker, scopeBody]);
      const inboxKicker = inbox.querySelector('.inbox-kicker');
      const tabs = inbox.querySelector('.inbox-tabs');
      if (tabs) inbox.insertBefore(scope, tabs);
      else if (inboxKicker) inboxKicker.after(scope);
      else inbox.insertBefore(scope, inbox.firstChild);
    }

    async function loadStatus() {
      try {
        const r = await fetch('/api/v1/cco/runtime/mailboxes', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json().catch(() => ({}));
        const list = Array.isArray(j && j.mailboxes) ? j.mailboxes : [];
        const map = {};
        for (const m of list) if (m && m.id) map[m.id] = m;
        statusById = map;
        renderRows();
      } catch (_e) {
        /* datakontraktet ("resten") kommer senare — designen står ändå */
      }
    }

    renderRows();
    loadStatus();
    // Auto-sync: läs spegeln på schema. Ingen manuell knapp, ingen live-fetch per öppning.
    try {
      window.setInterval(loadStatus, REFRESH_MS);
    } catch (_e) {
      /* setInterval saknas aldrig i praktiken — defensivt */
    }
    dispatchChange(state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
