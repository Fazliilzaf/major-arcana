/**
 * v2-app.js — HairTP Clinic CCO v2 Linear-style Inkorg
 *
 * MVP iteration 1.1:
 * - Sidebar: v1-bubble-pills VYER + MAILBOX-väljare + FILTER + SYSTEM
 * - Main: Inkorg-list med trådar (avatars, tags, tider)
 * - Höger: placeholder (kommer senare)
 *
 * Datakälla: /api/v1/cco/runtime/worklist/consumer
 */
(() => {
  'use strict';

  const DEFAULT_MAILBOXES = [
    { key: 'egzona', label: 'Egzona', color: 'var(--v2-mbx-egzona)' },
    { key: 'fazli', label: 'Fazli', color: 'var(--v2-mbx-fazli)' },
    { key: 'kons', label: 'Kons', color: 'var(--v2-mbx-kons)' },
    { key: 'info', label: 'Info', color: 'var(--v2-mbx-info)' },
    { key: 'contact', label: 'Kontakt', color: 'var(--v2-mbx-kontakt)' },
    { key: 'marknad', label: 'Marknad', color: 'var(--v2-mbx-marknad)' },
  ];

  // VYER — v1's bubble-pill design (14 vyer)
  const VIEWS = [
    { key: 'all',       label: 'Alla',      color: 'orange' },
    { key: 'agera_nu',  label: 'Agera nu',  color: 'pink' },
    { key: 'sprint',    label: 'Sprint',    color: 'green' },
    { key: 'senare',    label: 'Senare',    color: 'purple' },
    { key: 'skickade',  label: 'Skickade',  color: 'cyan' },
    { key: 'historik',  label: 'Historik',  color: 'indigo' },
    { key: 'studio',    label: 'Studio',    color: 'green' },
    { key: 'klar',      label: 'Klar',      color: 'green' },
    { key: 'radera',    label: 'Radera',    color: 'red' },
    { key: 'admin',     label: 'Admin',     color: 'blue' },
    { key: 'granska',   label: 'Granska',   color: 'indigo' },
    { key: 'oklart',    label: 'Oklart',    color: 'purple' },
    { key: 'bokning',   label: 'Bokning',   color: 'cyan' },
    { key: 'medicinsk', label: 'Medicinsk', color: 'red' },
  ];

  // FILTER — v1's bubble-pill design (5 filter)
  const FILTERS = [
    { key: 'follow_up', label: 'Uppfölj.', color: 'blue' },
    { key: 'unowned',   label: 'Oägda',    color: 'orange' },
    { key: 'high_risk', label: 'Hög risk', color: 'red' },
    { key: 'today',     label: 'Idag',     color: 'pink' },
    { key: 'tomorrow',  label: 'Imorgon',  color: 'pink' },
  ];

  const SYSTEM_LINKS = [
    { key: 'kunder',           label: 'Kunder',          icon: '👥', shortcut: '⌘8' },
    { key: 'automatisering',   label: 'Automatisering',  icon: '⚡', shortcut: '⌘9' },
    { key: 'analys',           label: 'Analys',          icon: '📊' },
    { key: 'mallar',           label: 'Mallar',          icon: '📋' },
  ];

  const state = {
    activeView: 'all',
    activeFilter: null, // INGEN aktiv filter som standard — FILTER är toggles
    activeFokusTab: 'konversation',
    selectedThreadId: null,
    selectedMailboxKeys: ['egzona'], // default: Egzona vald
    threads: [],
    mailboxCounts: {},
    isLive: false,
    sortBy: 'newest',
    user: { name: 'Fazli Krasniqi', email: 'info@fazli.se', initials: 'FK' },
  };

  // ============================================================
  // Data fetching
  // ============================================================

  function getToken() {
    try {
      return localStorage.getItem('ARCANA_ADMIN_TOKEN') || '';
    } catch (e) { return ''; }
  }

  async function fetchWorklist() {
    const token = getToken();
    if (!token) {
      console.warn('[v2] Ingen ARCANA_ADMIN_TOKEN i localStorage');
      return [];
    }
    const params = new URLSearchParams();
    params.set('mailboxIds', DEFAULT_MAILBOXES.map(m => `${m.key}@hairtpclinic.com`).join(','));
    params.set('limit', '500');
    try {
      const res = await fetch(`/api/v1/cco/runtime/worklist/consumer?${params.toString()}`, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!res.ok) {
        console.warn('[v2] worklist API failed:', res.status);
        return [];
      }
      const data = await res.json();
      const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.items) ? data.items : []);
      return rows;
    } catch (e) {
      console.warn('[v2] fetch fel:', e);
      return [];
    }
  }

  // ============================================================
  // Data transforms
  // ============================================================

  function getMailboxKey(row) {
    const addr = row?.mailbox?.mailboxAddress || row?.mailbox?.mailboxId || row?.mailbox?.address || '';
    const localpart = String(addr).toLowerCase().split('@')[0];
    return DEFAULT_MAILBOXES.find(m => localpart === m.key || localpart.startsWith(m.key))?.key || null;
  }

  function buildMailboxCounts(rows) {
    const counts = {};
    DEFAULT_MAILBOXES.forEach(m => counts[m.key] = 0);
    const now = Date.now();
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    rows.forEach(row => {
      const key = getMailboxKey(row);
      if (!key) return;
      const ts = row?.timing?.lastInboundAt || row?.timing?.lastActivityAt || row?.updatedAt || 0;
      const tsMs = typeof ts === 'string' ? new Date(ts).getTime() : (ts > 1e12 ? ts : ts * 1000);
      if (!tsMs || tsMs >= cutoff) {
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }

  function buildViewCounts(rows) {
    // v1-mappning: alla 14 vyer
    const counts = {};
    VIEWS.forEach(v => counts[v.key] = 0);
    counts.all = rows.length;

    const laneMap = {
      'act-now': 'agera_nu', 'agera_nu': 'agera_nu', 'now': 'agera_nu',
      'sprint': 'sprint',
      'later': 'senare', 'senare': 'senare', 'snooze': 'senare',
      'sent': 'skickade', 'skickade': 'skickade',
      'history': 'historik', 'historik': 'historik',
      'studio': 'studio',
      'done': 'klar', 'klar': 'klar', 'complete': 'klar',
      'trash': 'radera', 'delete': 'radera', 'radera': 'radera',
      'admin': 'admin',
      'review': 'granska', 'granska': 'granska',
      'unclear': 'oklart', 'oklart': 'oklart',
      'booking': 'bokning', 'bokning': 'bokning',
      'medical': 'medicinsk', 'medicinsk': 'medicinsk',
    };

    rows.forEach(row => {
      const lane = String(row?.lane || row?.laneId || '').toLowerCase();
      const mappedView = laneMap[lane];
      if (mappedView && counts[mappedView] !== undefined) {
        counts[mappedView] += 1;
      }
    });
    return counts;
  }

  function buildFilterCounts(rows) {
    const counts = {
      follow_up: rows.filter(r => r?.followUpDueAt || r?.followUpSuggestedAt).length,
      unowned: rows.filter(r => {
        const owner = String(r?.ownerEmail || r?.assignedTo || '').toLowerCase();
        return !owner;
      }).length,
      high_risk: rows.filter(r => {
        const risk = String(r?.riskLevel || r?.dominantRisk || r?.slaStatus || '').toLowerCase();
        return /high|hog|hög|breach/.test(risk);
      }).length,
      today: rows.filter(r => {
        const ts = r?.timing?.lastInboundAt || r?.timing?.lastActivityAt || r?.updatedAt;
        if (!ts) return false;
        const d = new Date(ts);
        const today = new Date();
        return d.toDateString() === today.toDateString();
      }).length,
      tomorrow: rows.filter(r => {
        const ts = r?.followUpDueAt || r?.followUpSuggestedAt;
        if (!ts) return false;
        const d = new Date(ts);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return d.toDateString() === tomorrow.toDateString();
      }).length,
    };
    return counts;
  }

  function deriveTags(row) {
    const tags = [];
    const risk = String(row?.riskLevel || row?.dominantRisk || row?.slaStatus || '').toLowerCase();
    if (/high|hog|hög|breach/.test(risk)) {
      tags.push({ key: 'high-risk', icon: '🔥', label: 'Hög risk' });
    }
    const dueBucket = String(row?.dueBucket || '').toLowerCase();
    if (dueBucket === 'today' || dueBucket === 'idag') {
      tags.push({ key: 'deadline', icon: '⏰', label: 'Deadline idag' });
    } else if (dueBucket === 'tomorrow' || dueBucket === 'imorgon') {
      tags.push({ key: 'deadline', icon: '⏰', label: 'Deadline imorgon' });
    } else if (dueBucket === 'overdue' || dueBucket === 'forsenad') {
      tags.push({ key: 'high-risk', icon: '⚠️', label: 'Försenad' });
    }
    const bookingState = String(row?.bookingState || '').toLowerCase();
    if (bookingState.includes('ready')) {
      tags.push({ key: 'ready-to-book', icon: '✓', label: 'Klar att bokas' });
    }
    if (row?.aiDraft || row?.hasAiDraft) {
      tags.push({ key: 'ai-draft', icon: '🤖', label: 'AI-utkast' });
    }
    if (row?.followUpDueAt || row?.followUpSuggestedAt) {
      const d = new Date(row.followUpDueAt || row.followUpSuggestedAt);
      const day = ['sön','mån','tis','ons','tor','fre','lör'][d.getDay()] || '';
      const time = d.toTimeString().slice(0,5);
      tags.push({ key: 'snooze', icon: '💤', label: `Snooze ${day} ${time}` });
    }
    return tags.slice(0, 2);
  }

  function deriveAvatarInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function deriveAvatarColor(name) {
    const palette = ['#e9b8c5', '#e8945a', '#7fb3aa', '#9c97a8', '#e9a78a', '#c9b87f', '#a4b0c2'];
    let hash = 0;
    for (const c of String(name || '')) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toTimeString().slice(0, 5);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Igår';
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) {
      return ['Sön','Mån','Tis','Ons','Tor','Fre','Lör'][d.getDay()] || '';
    }
    return d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
  }

  function getCustomerName(row) {
    return (
      row?.customer?.name ||
      row?.customer?.displayName ||
      row?.customerName ||
      row?.from?.name ||
      humanizeEmailLocalpart(row?.customer?.email || row?.customerEmail || row?.from?.address) ||
      'Okänd avsändare'
    );
  }

  function humanizeEmailLocalpart(email) {
    if (!email) return '';
    const local = String(email).split('@')[0];
    return local.replace(/[._-]+/g, ' ').split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  function getMailboxLabel() {
    if (!state.selectedMailboxKeys.length) return 'Alla mailboxar';
    const first = DEFAULT_MAILBOXES.find(m => m.key === state.selectedMailboxKeys[0]);
    const extra = state.selectedMailboxKeys.length - 1;
    return `Hair TP Clinic — ${first?.label || '?'}${extra > 0 ? ` +${extra}` : ''}`;
  }

  // ============================================================
  // Rendering
  // ============================================================

  function renderSidebar() {
    const sidebar = document.getElementById('v2-sidebar');
    if (!sidebar) return;

    const viewCounts = buildViewCounts(state.threads);
    const filterCounts = buildFilterCounts(state.threads);
    const html = [];

    // Brand-rad
    html.push(
      `<div class="v2-sidebar-brand">` +
      `<span class="v2-brand-mark">HT</span>` +
      `<span class="v2-brand-name">HairTP Clinic</span>` +
      `</div>`
    );

    // VYER
    html.push('<div class="v2-sidebar-section">');
    html.push('<div class="v2-sidebar-section-title">Vyer</div>');
    html.push('<div class="v2-pill-list">');
    VIEWS.forEach(v => {
      const isActive = state.activeView === v.key;
      const count = viewCounts[v.key] ?? 0;
      html.push(
        `<button type="button" class="v2-pill ${isActive ? 'is-active' : ''}" data-color="${v.color}" data-view="${v.key}">` +
        `<span class="v2-pill-label">${v.label}</span>` +
        `<span class="v2-pill-count">${count}</span>` +
        `</button>`
      );
    });
    html.push('</div></div>');

    // MAILBOX-VÄLJARE
    html.push('<div class="v2-sidebar-section">');
    html.push('<div class="v2-sidebar-section-title">Mailbox</div>');
    html.push(
      `<button type="button" class="v2-mailbox-selector" data-mailbox-selector>` +
      `<span class="v2-mailbox-selector-icon">📬</span>` +
      `<span class="v2-mailbox-selector-label">${escapeHtml(getMailboxLabel())}</span>` +
      `<span class="v2-mailbox-selector-caret">▾</span>` +
      `</button>`
    );

    // mailbox-lista med volymbarer (7 dagar)
    const maxCount = Math.max(1, ...Object.values(state.mailboxCounts));
    html.push('<div class="v2-mailbox-list">');
    html.push('<div class="v2-mailbox-list-title">Volym · 7 dgn</div>');
    DEFAULT_MAILBOXES.forEach(m => {
      const count = state.mailboxCounts[m.key] || 0;
      const isSelected = state.selectedMailboxKeys.includes(m.key);
      const barWidth = Math.max(6, Math.round((count / maxCount) * 100));
      html.push(
        `<div class="v2-mailbox-row ${isSelected ? 'is-selected' : ''}" data-mailbox="${m.key}" style="--mbx-color:${m.color};--mbx-bar-width:${barWidth}%">` +
        `<div class="v2-mailbox-row-head">` +
        `<span class="v2-mailbox-dot"></span>` +
        `<span class="v2-mailbox-name">${m.label}</span>` +
        `<span class="v2-mailbox-count">${count}</span>` +
        `</div>` +
        `<div class="v2-mailbox-bar"></div>` +
        `</div>`
      );
    });
    html.push('</div>');
    html.push('</div>');

    // FILTER
    html.push('<div class="v2-sidebar-section">');
    html.push('<div class="v2-sidebar-section-title">Filter</div>');
    html.push('<div class="v2-pill-list">');
    FILTERS.forEach(f => {
      const isActive = state.activeFilter === f.key;
      const count = filterCounts[f.key] ?? 0;
      html.push(
        `<button type="button" class="v2-pill ${isActive ? 'is-active' : ''}" data-color="${f.color}" data-filter="${f.key}">` +
        `<span class="v2-pill-label">${f.label}</span>` +
        `<span class="v2-pill-count">${count}</span>` +
        `</button>`
      );
    });
    html.push('</div></div>');

    // SYSTEM
    html.push('<div class="v2-sidebar-section">');
    html.push('<div class="v2-sidebar-section-title">System</div>');
    SYSTEM_LINKS.forEach(s => {
      html.push(
        `<div class="v2-sidebar-item" data-system="${s.key}">` +
        `<span class="v2-sidebar-item-icon">${s.icon}</span>` +
        `<span class="v2-sidebar-item-label">${s.label}</span>` +
        (s.shortcut ? `<span class="v2-sidebar-item-shortcut">${s.shortcut}</span>` : '') +
        `</div>`
      );
    });
    html.push('</div>');

    // User
    html.push(
      `<div class="v2-sidebar-user">` +
      `<div class="v2-user-avatar">${state.user.initials}</div>` +
      `<div class="v2-user-info">` +
      `<div class="v2-user-name">${state.user.name}</div>` +
      `<div class="v2-user-status"><span class="v2-user-status-dot"></span>Online · Aktiv</div>` +
      `</div>` +
      `</div>`
    );

    sidebar.innerHTML = html.join('');

    // Wire up
    sidebar.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => {
        state.activeView = el.dataset.view;
        renderSidebar();
        renderMain();
      });
    });
    sidebar.querySelectorAll('[data-filter]').forEach(el => {
      el.addEventListener('click', () => {
        state.activeFilter = state.activeFilter === el.dataset.filter ? null : el.dataset.filter;
        renderSidebar();
        renderMain();
      });
    });
    sidebar.querySelectorAll('[data-mailbox]').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.mailbox;
        const i = state.selectedMailboxKeys.indexOf(k);
        if (i >= 0) state.selectedMailboxKeys.splice(i, 1);
        else state.selectedMailboxKeys.push(k);
        renderSidebar();
        renderMain();
      });
    });
    sidebar.querySelectorAll('[data-system]').forEach(el => {
      el.addEventListener('click', () => {
        console.log('[v2] system link clicked:', el.dataset.system);
      });
    });
  }

  function renderMain() {
    const main = document.getElementById('v2-main');
    if (!main) return;

    const visibleThreads = applyViewAndFilter(state.threads);

    const headerHtml = (
      `<div class="v2-main-header">` +
      `<div class="v2-main-header-row">` +
      `<h1 class="v2-main-title">` +
      `${VIEWS.find(v => v.key === state.activeView)?.label || 'Alla'}` +
      `<span class="v2-main-subtitle">${visibleThreads.afterFilter.length} trådar idag</span>` +
      `</h1>` +
      `<span class="v2-live-pill"><span class="v2-live-pill-dot"></span>${state.isLive ? 'LIVE' : 'Demo'}</span>` +
      `</div>` +
      `<div class="v2-main-meta">` +
      `<span class="v2-main-meta-item"><span class="v2-main-meta-dot"></span>${escapeHtml(getMailboxLabel())}</span>` +
      (state.activeFilter ? `<span class="v2-main-meta-item v2-main-meta-filter">Filter: ${FILTERS.find(f => f.key === state.activeFilter)?.label}</span>` : '') +
      `<button class="v2-sort-button" type="button" data-sort-toggle>≡ Nyaste ▾</button>` +
      `</div>` +
      `</div>`
    );

    let listHtml = '';
    if (visibleThreads.afterFilter.length === 0) {
      listHtml = `<div class="v2-empty"><span class="v2-empty-icon">📭</span><span class="v2-empty-text">Inga trådar i ${VIEWS.find(v => v.key === state.activeView)?.label?.toLowerCase() || 'denna vy'} just nu.</span></div>`;
    } else {
      listHtml = '<div class="v2-thread-list">';
      visibleThreads.afterFilter.forEach(row => {
        const id = row?.id || row?.conversation?.conversationId || '';
        const name = getCustomerName(row);
        const subject = row?.subject || row?.title || row?.conversation?.subject || '(Inget ämne)';
        const preview = row?.preview || row?.bodyPreview || row?.latestMessage?.preview || '';
        const ts = row?.timing?.lastInboundAt || row?.timing?.lastActivityAt || row?.updatedAt;
        const time = formatTime(ts);
        const tags = deriveTags(row);
        const initials = deriveAvatarInitials(name);
        const avatarColor = deriveAvatarColor(name);
        const isUnread = !!(row?.isUnread || row?.unread || row?.unreadInbound);
        const isSelected = state.selectedThreadId === id;
        const mailboxKey = getMailboxKey(row);
        const mbxBubbles = mailboxKey
          ? `<div class="v2-thread-mailbox"><span class="v2-mailbox-bubble" style="background:${DEFAULT_MAILBOXES.find(m => m.key === mailboxKey)?.color};">${mailboxKey[0].toUpperCase()}</span></div>`
          : '';

        listHtml += (
          `<div class="v2-thread ${isUnread ? 'is-unread' : ''} ${isSelected ? 'is-selected' : ''}" data-thread-id="${id}">` +
          `<div class="v2-thread-avatar" style="background:${avatarColor};">${initials}</div>` +
          `<div class="v2-thread-body">` +
          `<div class="v2-thread-row1">` +
          `<span class="v2-thread-name">${escapeHtml(name)}</span>` +
          `<span class="v2-thread-time">${time}</span>` +
          `</div>` +
          `<div class="v2-thread-subject">${escapeHtml(subject)}</div>` +
          (preview ? `<div class="v2-thread-preview">${escapeHtml(preview).slice(0, 120)}</div>` : '') +
          (tags.length > 0 || mbxBubbles ? (
            `<div class="v2-thread-tags">` +
            tags.map(t =>
              `<span class="v2-thread-tag v2-thread-tag--${t.key}"><span class="v2-thread-tag-icon">${t.icon}</span>${t.label}</span>`
            ).join('') +
            mbxBubbles +
            `</div>`
          ) : '') +
          `</div>` +
          `</div>`
        );
      });
      listHtml += '</div>';
    }

    main.innerHTML = headerHtml + listHtml;

    main.querySelectorAll('[data-thread-id]').forEach(el => {
      el.addEventListener('click', () => {
        state.selectedThreadId = el.dataset.threadId;
        renderMain();
        renderIntel();
      });
    });
  }

  function applyViewAndFilter(allThreads) {
    let filtered = allThreads.slice();

    // Mailbox-filter
    if (state.selectedMailboxKeys.length > 0 && state.selectedMailboxKeys.length < DEFAULT_MAILBOXES.length) {
      filtered = filtered.filter(r => {
        const k = getMailboxKey(r);
        return k && state.selectedMailboxKeys.includes(k);
      });
    }

    // Vy-filter
    if (state.activeView !== 'all') {
      const viewLaneMap = {
        agera_nu:  ['act-now', 'agera_nu', 'now'],
        sprint:    ['sprint'],
        senare:    ['later', 'senare', 'snooze'],
        skickade:  ['sent', 'skickade'],
        historik:  ['history', 'historik'],
        studio:    ['studio'],
        klar:      ['done', 'klar', 'complete'],
        radera:    ['trash', 'delete', 'radera'],
        admin:     ['admin'],
        granska:   ['review', 'granska'],
        oklart:    ['unclear', 'oklart'],
        bokning:   ['booking', 'bokning'],
        medicinsk: ['medical', 'medicinsk'],
      };
      const lanes = viewLaneMap[state.activeView] || [];
      filtered = filtered.filter(r => {
        const lane = String(r?.lane || r?.laneId || '').toLowerCase();
        return lanes.includes(lane);
      });
    }

    const beforeFilter = filtered.slice();

    // Pill-filter (toggle)
    if (state.activeFilter === 'follow_up') {
      filtered = filtered.filter(r => r?.followUpDueAt || r?.followUpSuggestedAt);
    } else if (state.activeFilter === 'unowned') {
      filtered = filtered.filter(r => {
        const owner = String(r?.ownerEmail || r?.assignedTo || '').toLowerCase();
        return !owner;
      });
    } else if (state.activeFilter === 'high_risk') {
      filtered = filtered.filter(r => {
        const risk = String(r?.riskLevel || r?.dominantRisk || r?.slaStatus || '').toLowerCase();
        return /high|hog|hög|breach/.test(risk);
      });
    } else if (state.activeFilter === 'today') {
      filtered = filtered.filter(r => {
        const ts = r?.timing?.lastInboundAt || r?.timing?.lastActivityAt || r?.updatedAt;
        if (!ts) return false;
        const d = new Date(ts);
        return d.toDateString() === new Date().toDateString();
      });
    } else if (state.activeFilter === 'tomorrow') {
      filtered = filtered.filter(r => {
        const ts = r?.followUpDueAt || r?.followUpSuggestedAt;
        if (!ts) return false;
        const d = new Date(ts);
        const tom = new Date(); tom.setDate(tom.getDate() + 1);
        return d.toDateString() === tom.toDateString();
      });
    }

    // Sort
    filtered.sort((a, b) => {
      const ta = new Date(a?.timing?.lastInboundAt || a?.timing?.lastActivityAt || a?.updatedAt || 0).getTime();
      const tb = new Date(b?.timing?.lastInboundAt || b?.timing?.lastActivityAt || b?.updatedAt || 0).getTime();
      return state.sortBy === 'oldest' ? ta - tb : tb - ta;
    });
    return { beforeFilter, afterFilter: filtered };
  }

  // FOKUSYTA-data
  const FOKUS_TABS = [
    { key: 'konversation', label: 'Konversation', color: 'cream' },
    { key: 'kundhistorik', label: 'Kundhistorik', color: 'blue' },
    { key: 'historik',     label: 'Historik',     color: 'yellow' },
    { key: 'anteckningar', label: 'Anteckningar', color: 'green' },
  ];

  const FOKUS_STATUS_DEFAULTS = [
    { key: 'aktiv',    label: 'Aktiv tråd',     color: 'green' },
    { key: 'svar',     label: 'Behöver svar',   color: 'pink' },
    { key: 'fallback', label: 'Legacy fallback', color: 'indigo' },
    { key: 'risk',     label: 'Hög risk',       color: 'red' },
  ];

  const FOKUS_ACTIONS = [
    { key: 'svara_nu',     label: 'Svara nu',          color: 'pink',   icon: '✉' },
    { key: 'nytt_mejl',    label: 'Nytt mejl till kunden', color: 'blue',  icon: '✈' },
    { key: 'svara_senare', label: 'Svara senare',      color: 'cyan',   icon: '⏱' },
    { key: 'markera_klar', label: 'Markera klar',      color: 'green',  icon: '✓' },
    { key: 'schemalagg',   label: 'Schemalägg uppföljning', color: 'purple', icon: '📅' },
    { key: 'oppna_historik', label: 'Öppna historik',  color: 'indigo', icon: '🕓' },
    { key: 'radera',       label: 'Radera',            color: 'red',    icon: '🗑' },
  ];

  function deriveFokusStatus(thread) {
    const out = [];
    out.push({ key: 'aktiv', label: 'Aktiv tråd', color: 'green' });
    if (thread?.isUnread || thread?.unread || thread?.unreadInbound) {
      out.push({ key: 'svar', label: 'Behöver svar', color: 'pink' });
    }
    const risk = String(thread?.riskLevel || thread?.dominantRisk || thread?.slaStatus || '').toLowerCase();
    if (/high|hog|hög|breach/.test(risk)) {
      out.push({ key: 'risk', label: 'Hög risk', color: 'red' });
    }
    if (thread?.legacy || thread?.fallback) {
      out.push({ key: 'fallback', label: 'Legacy fallback', color: 'indigo' });
    }
    return out;
  }

  function renderIntel() {
    const intel = document.getElementById('v2-intel');
    if (!intel) return;

    if (!state.selectedThreadId) {
      intel.innerHTML = (
        `<div class="v2-fokusyta v2-fokusyta--empty">` +
        `<div class="v2-fokusyta-empty-icon">📭</div>` +
        `<div class="v2-fokusyta-empty-title">Välj en tråd</div>` +
        `<div class="v2-fokusyta-empty-text">Klicka på en tråd i mitten för att se konversation, status och åtgärder.</div>` +
        `</div>`
      );
      return;
    }

    const thread = state.threads.find(t => (t?.id || t?.conversation?.conversationId) === state.selectedThreadId);
    if (!thread) {
      intel.innerHTML = `<div class="v2-fokusyta v2-fokusyta--empty"><div class="v2-fokusyta-empty-text">Tråden hittades inte.</div></div>`;
      return;
    }

    const name = getCustomerName(thread);
    const subject = thread?.subject || thread?.title || thread?.conversation?.subject || '(Inget ämne)';
    const preview = thread?.preview || thread?.bodyPreview || thread?.latestMessage?.preview || thread?.aiSummary || 'Ingen sammanfattning än.';
    const initials = deriveAvatarInitials(name);
    const avatarColor = deriveAvatarColor(name);
    const ts = thread?.timing?.lastInboundAt || thread?.timing?.lastActivityAt || thread?.updatedAt;
    const time = formatTime(ts);
    const statusList = deriveFokusStatus(thread);
    const activeTab = state.activeFokusTab || 'konversation';

    intel.innerHTML = (
      `<div class="v2-fokusyta">` +

      // Header
      `<div class="v2-fokusyta-head">` +
      `<div class="v2-fokusyta-head-row">` +
      `<button type="button" class="v2-pill" data-color="orange"><span class="v2-pill-label">Alla</span></button>` +
      `<button type="button" class="v2-pill" data-color="purple" data-action="sammanfatta"><span class="v2-pill-label">✨ Sammanfatta</span></button>` +
      `</div>` +
      `<div class="v2-fokusyta-subject">${escapeHtml(subject)}</div>` +
      `</div>` +

      // Tab pills
      `<div class="v2-fokusyta-tabs">` +
      FOKUS_TABS.map(t =>
        `<button type="button" class="v2-pill ${activeTab === t.key ? 'is-active' : ''}" data-color="${t.color}" data-fokus-tab="${t.key}">` +
        `<span class="v2-pill-label">${t.label}</span>` +
        `</button>`
      ).join('') +
      `</div>` +

      // Status pills row
      `<div class="v2-fokusyta-status">` +
      statusList.map(s =>
        `<span class="v2-fokus-status v2-fokus-status--${s.color}">${escapeHtml(s.label)}</span>`
      ).join(' · ') +
      `</div>` +

      // Action pills (bubble row)
      `<div class="v2-fokusyta-actions">` +
      FOKUS_ACTIONS.map(a =>
        `<button type="button" class="v2-pill" data-color="${a.color}" data-fokus-action="${a.key}">` +
        `<span class="v2-pill-label">${a.icon} ${a.label}</span>` +
        `</button>`
      ).join('') +
      `</div>` +

      // Sender card + content
      `<div class="v2-fokusyta-thread">` +
      `<div class="v2-fokusyta-thread-head">` +
      `<div class="v2-thread-avatar" style="background:${avatarColor};">${initials}</div>` +
      `<div class="v2-fokusyta-thread-meta">` +
      `<div class="v2-fokusyta-thread-name">${escapeHtml(name)}</div>` +
      `<div class="v2-fokusyta-thread-time">${time || ''}</div>` +
      `</div>` +
      `<button type="button" class="v2-pill" data-color="cream" data-action="senaste"><span class="v2-pill-label">Senaste</span></button>` +
      `</div>` +
      `<div class="v2-fokusyta-thread-body">${escapeHtml(preview)}</div>` +
      `</div>` +

      `</div>` // .v2-fokusyta
    );

    // Wire up tab clicks
    intel.querySelectorAll('[data-fokus-tab]').forEach(el => {
      el.addEventListener('click', () => {
        state.activeFokusTab = el.dataset.fokusTab;
        renderIntel();
      });
    });
    intel.querySelectorAll('[data-fokus-action]').forEach(el => {
      el.addEventListener('click', () => {
        console.log('[v2] FOKUSYTA action:', el.dataset.fokusAction, 'för tråd', state.selectedThreadId);
      });
    });
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderBackToV1() {
    if (document.querySelector('.v2-back-to-v1')) return;
    const link = document.createElement('a');
    link.href = '/major-arcana-preview/';
    link.className = 'v2-back-to-v1';
    link.textContent = '← Klassisk vy';
    document.body.appendChild(link);
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  async function init() {
    renderBackToV1();
    document.getElementById('v2-app').dataset.v2State = 'loading';

    renderSidebar();
    document.getElementById('v2-main').innerHTML = `<div class="v2-loading">Laddar trådar…</div>`;
    renderIntel();

    const rows = await fetchWorklist();
    state.threads = rows;
    state.mailboxCounts = buildMailboxCounts(rows);
    state.isLive = rows.length > 0;
    document.getElementById('v2-app').dataset.v2State = 'ready';

    renderSidebar();
    renderMain();

    setInterval(async () => {
      const rows = await fetchWorklist();
      if (rows.length > 0) {
        state.threads = rows;
        state.mailboxCounts = buildMailboxCounts(rows);
        state.isLive = true;
        renderSidebar();
        renderMain();
      }
    }, 60000);

    console.log('[v2] CCO v2 inkorg klar (v1-bubbles). Trådar:', rows.length);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
