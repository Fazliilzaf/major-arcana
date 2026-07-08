'use strict';

/*
 * Brevlåde-väljare för CCO Konversationer (admin#cco).
 *
 * DESIGN FÖRST: renderar UI:t (väljare + status + folder-scope + läsfönster) i
 * befintlig layout/palett. Datakontraktet ("resten") kopplas på senare — modulen
 * läser GET /api/v1/cco/runtime/mailboxes när den finns och visar annars en ren
 * väntar-på-data-status. Sticky val i localStorage. Driver INTE inkorgs-hämtningen
 * ännu; dispatchar bara 'cco:mailbox-selection-change' så datalagret kan lyssna.
 *
 * Ändrar ingen live-send. Ingen ny färg — allt via befintliga CCO-tokens.
 */

(function () {
  const LS_KEY = 'cco_mailbox_valjare_v1';
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
    mailboxIds: MAILBOXES.map((m) => m.id), // allt på från start
    folder: 'inbox',
    windowDays: 90,
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
      if (!s) return { ...DEFAULT_STATE };
      const validIds = new Set(MAILBOXES.map((m) => m.id));
      return {
        mailboxIds: Array.isArray(s.mailboxIds)
          ? s.mailboxIds.filter((id) => validIds.has(id))
          : DEFAULT_STATE.mailboxIds.slice(),
        folder: ['inbox', 'sent', 'drafts'].includes(s.folder) ? s.folder : 'inbox',
        windowDays: [30, 90, 365].includes(s.windowDays) ? s.windowDays : 90,
      };
    } catch (_e) {
      return { ...DEFAULT_STATE };
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
    const css =
      '.mbv{margin:0 0 14px}' +
      '.mbv-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px}' +
      '.mbv-title{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--cco-text-tertiary,#6a717d)}' +
      '.mbv-sync{font:inherit;font-size:10.5px;font-weight:700;color:var(--accent-studio,#bb4779);background:var(--cco-bg-surface,#fff);border:1px solid var(--line,#e7ded5);border-radius:999px;padding:3px 9px;cursor:pointer}' +
      '.mbv-row{display:grid;grid-template-columns:3px 20px 1fr 16px;gap:8px;align-items:center;padding:7px 6px;border-radius:9px;cursor:pointer}' +
      '.mbv-row:hover{background:var(--cco-bg-surface-sunken,#f5efe6)}' +
      '.mbv-row.on{background:rgba(187,71,121,.06)}' +
      '.mbv-rail{width:3px;height:26px;border-radius:3px;background:var(--r,#84756b)}' +
      '.mbv-av{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:10px;font-weight:800;color:#fff;background:var(--r,#84756b)}' +
      '.mbv-name{font-size:12.5px;font-weight:700;color:var(--cco-text-primary,#2b251f);line-height:1.2}' +
      '.mbv-row.on .mbv-name{color:var(--accent-studio,#bb4779)}' +
      '.mbv-meta{font-size:10px;color:var(--cco-text-tertiary,#6a717d);margin-top:2px;font-variant-numeric:tabular-nums}' +
      '.mbv-meta .warnc{color:var(--cco-status-warning,#c8821e)}' +
      '.mbv-meta .errc{color:var(--cco-status-danger,#b94a4a);font-weight:700}' +
      '.mbv-chk{width:15px;height:15px;border-radius:5px;border:1.5px solid var(--line,#e7ded5);display:grid;place-items:center;color:#fff;font-size:10px;background:#fff}' +
      '.mbv-row.on .mbv-chk{background:var(--accent-studio,#bb4779);border-color:var(--accent-studio,#bb4779)}' +
      '.mbv-row.part .mbv-chk{background:var(--accent-studio,#bb4779);border-color:var(--accent-studio,#bb4779)}' +
      '.mbv-all{background:var(--cco-bg-surface-sunken,#f5efe6)}' +
      '.mbv-all .mbv-name{font-weight:800}' +
      '.mbv-sep{height:1px;background:var(--line-2,#efe6dc);margin:6px 2px}' +
      // Kontroller i inkorg-headern
      '.mbv-ctl{margin:6px 0 12px}' +
      '.mbv-ctl-lbl{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--cco-text-tertiary,#6a717d);margin:0 0 5px}' +
      '.mbv-seg{display:inline-flex;background:var(--cco-bg-surface-sunken,#f5efe6);border:1px solid var(--line,#e7ded5);border-radius:9px;padding:3px;gap:2px}' +
      '.mbv-seg button{font:inherit;font-size:11.5px;font-weight:700;border:0;background:transparent;cursor:pointer;color:var(--cco-text-secondary,#5d6470);padding:5px 11px;border-radius:6px}' +
      '.mbv-seg button.on{background:var(--cco-bg-surface,#fff);color:var(--accent-studio,#bb4779);box-shadow:0 1px 3px rgba(56,40,28,.12)}' +
      '.mbv-scope-row{display:flex;gap:16px;flex-wrap:wrap}';
    document.head.appendChild(el('style', { id: 'ccoMbvStyle' }, css));
  }

  function dispatchChange(state) {
    try {
      document.dispatchEvent(
        new CustomEvent('cco:mailbox-selection-change', { detail: { ...state } })
      );
    } catch (_e) {
      /* CustomEvent kan saknas i mycket gamla klienter — icke-kritiskt */
    }
  }

  function mount() {
    const rail = document.getElementById('lane-sidebar');
    const inbox = document.querySelector('.inbox-shell');
    if (!rail || document.getElementById('ccoMbv')) return;
    injectStyle();

    const state = loadState();
    let statusById = {}; // fylls av datalagret senare

    // ── Panel A: brevlåde-väljaren (överst i vänsterrälen) ──
    const rowsWrap = el('div', {});
    const allRow = el('div', { class: 'mbv-row mbv-all', style: '--r:var(--rail-info,#84756b)' });
    const panel = el('div', { class: 'mbv', id: 'ccoMbv' }, [
      el('div', { class: 'mbv-head' }, [
        el('span', { class: 'mbv-title' }, 'Brevlådor'),
        el('button', { class: 'mbv-sync', type: 'button', onclick: () => syncNow() }, '↻ Synka nu'),
      ]),
      allRow,
      el('div', { class: 'mbv-sep' }),
      rowsWrap,
    ]);

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
      const parts = [
        el(
          'span',
          {},
          (c.inbox != null ? c.inbox : '–') + ' ink · ' + (c.sent != null ? c.sent : '–') + ' skick'
        ),
      ];
      if (sync) parts.push(document.createTextNode(' · '), el('span', {}, 'synk ' + sync));
      return el('span', {}, parts);
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
            el('span', { class: 'mbv-rail' }),
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
      // "Alla"-raden speglar hel/delvis/av.
      const total = MAILBOXES.length;
      const sel = state.mailboxIds.length;
      allRow.className = 'mbv-row mbv-all' + (sel === total ? ' on' : sel > 0 ? ' part' : '');
      allRow.innerHTML = '';
      allRow.appendChild(el('span', { class: 'mbv-rail' }));
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

    // ── Panel B: folder-scope + läsfönster (inkorg-headern) ──
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
        return el('div', { class: 'mbv-ctl' }, [
          el('div', { class: 'mbv-ctl-lbl' }, label),
          el('div', { class: 'mbv-seg' }, buttons),
        ]);
      };
      const scope = el('div', { id: 'ccoMbvScope', class: 'mbv-scope-row' }, [
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
          }
        ),
        seg(
          'Läsfönster',
          [
            { value: 30, label: '30 dgr' },
            { value: 90, label: '90 dgr' },
            { value: 365, label: '365 dgr' },
          ],
          () => state.windowDays,
          (v) => {
            state.windowDays = v;
            commit();
          }
        ),
      ]);
      const kicker = inbox.querySelector('.inbox-kicker');
      const tabs = inbox.querySelector('.inbox-tabs');
      if (tabs) inbox.insertBefore(scope, tabs);
      else if (kicker) kicker.after(scope);
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
    function syncNow() {
      loadStatus();
    }

    renderRows();
    loadStatus();
    dispatchChange(state); // ge datalagret initialvalet
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
