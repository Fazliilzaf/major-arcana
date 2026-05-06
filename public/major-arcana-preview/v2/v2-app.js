/**
 * v2-app.js — HairTP Clinic CCO v2 Linear-style Inkorg
 *
 * MVP iteration 1:
 * - Sidebar: VYER + MAILBOXAR (7 dgn) + SYSTEM
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

  const VIEWS = [
    { key: 'inkorg', label: 'Inkorg', icon: '📥' },
    { key: 'agera_nu', label: 'Agera nu', icon: '⚡' },
    { key: 'sprint', label: 'Sprint', icon: '📈' },
    { key: 'bokningar', label: 'Bokningar', icon: '📅' },
    { key: 'granska', label: 'Granska', icon: '👁' },
    { key: 'senare', label: 'Senare', icon: '⏸' },
    { key: 'klara', label: 'Klara', icon: '✓' },
  ];

  const SYSTEM_LINKS = [
    { key: 'kunder', label: 'Kunder', icon: '👥', shortcut: '⌘8' },
    { key: 'automatisering', label: 'Automatisering', icon: '⚡', shortcut: '⌘9' },
    { key: 'analys', label: 'Analys', icon: '📊' },
    { key: 'mallar', label: 'Mallar', icon: '📋' },
  ];

  const FILTERS = [
    { key: 'all', label: 'Alla' },
    { key: 'unread', label: 'Olästa' },
    { key: 'mine', label: 'Mina' },
    { key: 'high_risk', label: 'Hög risk' },
    { key: 'today', label: 'Idag' },
  ];

  const state = {
    activeView: 'inkorg',
    activeFilter: 'all',
    selectedThreadId: null,
    threads: [],
    mailboxCounts: {},
    isLive: false,
    sortBy: 'newest', // newest | oldest | priority
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
    // Senaste 7 dagar
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
    const counts = { inkorg: rows.length };
    const laneMap = {
      'act-now': 'agera_nu', 'agera_nu': 'agera_nu', 'now': 'agera_nu',
      'sprint': 'sprint',
      'booking': 'bokningar', 'bokning': 'bokningar',
      'review': 'granska', 'granska': 'granska',
      'later': 'senare', 'senare': 'senare', 'snooze': 'senare',
      'done': 'klara', 'klar': 'klara', 'complete': 'klara',
    };
    VIEWS.forEach(v => { if (v.key !== 'inkorg') counts[v.key] = 0; });
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
      all: rows.length,
      unread: rows.filter(r => r?.isUnread || r?.unread || r?.unreadInbound).length,
      mine: rows.filter(r => {
        const owner = String(r?.ownerEmail || r?.assignedTo || '').toLowerCase();
        return owner.includes(state.user.email.toLowerCase());
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
    return tags.slice(0, 2); // max 2 tags
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
    if (sameDay) {
      return d.toTimeString().slice(0, 5);
    }
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

  // ============================================================
  // Rendering
  // ============================================================

  function renderSidebar() {
    const sidebar = document.getElementById('v2-sidebar');
    if (!sidebar) return;

    const viewCounts = buildViewCounts(state.threads);
    const sidebarHtml = [];

    // VYER
    sidebarHtml.push('<div class="v2-sidebar-section">');
    sidebarHtml.push('<div class="v2-sidebar-section-title">Vyer</div>');
    VIEWS.forEach(v => {
      const isActive = state.activeView === v.key;
      const count = viewCounts[v.key] ?? 0;
      sidebarHtml.push(
        `<div class="v2-sidebar-item ${isActive ? 'is-active' : ''}" data-view="${v.key}">` +
        `<span class="v2-sidebar-item-icon">${v.icon}</span>` +
        `<span class="v2-sidebar-item-label">${v.label}</span>` +
        `<span class="v2-sidebar-item-count">${count}</span>` +
        `</div>`
      );
    });
    sidebarHtml.push('</div>');

    // MAILBOXAR · 7 DGN
    sidebarHtml.push('<div class="v2-sidebar-section">');
    sidebarHtml.push('<div class="v2-sidebar-section-title">Mailboxar · 7 dgn<span class="v2-sidebar-section-title-add" title="Lägg till mailbox">+</span></div>');
    const maxCount = Math.max(1, ...Object.values(state.mailboxCounts));
    DEFAULT_MAILBOXES.forEach(m => {
      const count = state.mailboxCounts[m.key] || 0;
      const barWidth = Math.max(8, Math.round((count / maxCount) * 100));
      sidebarHtml.push(
        `<div class="v2-mailbox-row" data-mailbox="${m.key}" style="--mbx-color:${m.color};--mbx-bar-width:${barWidth}%">` +
        `<div class="v2-mailbox-row-head">` +
        `<span class="v2-mailbox-dot"></span>` +
        `<span class="v2-mailbox-name">${m.label}</span>` +
        `<span class="v2-mailbox-count">${count}</span>` +
        `</div>` +
        `<div class="v2-mailbox-bar"></div>` +
        `</div>`
      );
    });
    sidebarHtml.push('</div>');

    // SYSTEM
    sidebarHtml.push('<div class="v2-sidebar-section">');
    sidebarHtml.push('<div class="v2-sidebar-section-title">System</div>');
    SYSTEM_LINKS.forEach(s => {
      sidebarHtml.push(
        `<div class="v2-sidebar-item" data-system="${s.key}">` +
        `<span class="v2-sidebar-item-icon">${s.icon}</span>` +
        `<span class="v2-sidebar-item-label">${s.label}</span>` +
        (s.shortcut ? `<span class="v2-sidebar-item-shortcut">${s.shortcut}</span>` : '') +
        `</div>`
      );
    });
    sidebarHtml.push('</div>');

    // User-info längst ner
    sidebarHtml.push(
      `<div class="v2-sidebar-user">` +
      `<div class="v2-user-avatar">${state.user.initials}</div>` +
      `<div class="v2-user-info">` +
      `<div class="v2-user-name">${state.user.name}</div>` +
      `<div class="v2-user-status"><span class="v2-user-status-dot"></span>Online · Aktiv</div>` +
      `</div>` +
      `</div>`
    );

    sidebar.innerHTML = sidebarHtml.join('');

    // Wire up click handlers
    sidebar.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => {
        state.activeView = el.dataset.view;
        renderSidebar();
        renderMain();
      });
    });
    sidebar.querySelectorAll('[data-system]').forEach(el => {
      el.addEventListener('click', () => {
        // TODO: navigera till respektive vy
        console.log('[v2] system link clicked:', el.dataset.system);
      });
    });
  }

  function renderMain() {
    const main = document.getElementById('v2-main');
    if (!main) return;

    const visibleThreads = applyViewAndFilter(state.threads);
    const filterCounts = buildFilterCounts(visibleThreads.beforeFilter);

    const headerHtml = (
      `<div class="v2-main-header">` +
      `<div class="v2-main-header-row">` +
      `<h1 class="v2-main-title">` +
      `${VIEWS.find(v => v.key === state.activeView)?.label || 'Inkorg'}` +
      `<span class="v2-main-subtitle">${visibleThreads.afterFilter.length} trådar idag</span>` +
      `</h1>` +
      `<span class="v2-live-pill"><span class="v2-live-pill-dot"></span>${state.isLive ? 'LIVE' : 'Demo'}</span>` +
      `</div>` +
      `<div class="v2-filters-row">` +
      FILTERS.map(f =>
        `<div class="v2-filter-chip ${state.activeFilter === f.key ? 'is-active' : ''}" data-filter="${f.key}">` +
        `${f.label}<span class="v2-filter-chip-count">${filterCounts[f.key] ?? 0}</span>` +
        `</div>`
      ).join('') +
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

    // Wire up
    main.querySelectorAll('[data-filter]').forEach(el => {
      el.addEventListener('click', () => {
        state.activeFilter = el.dataset.filter;
        renderMain();
      });
    });
    main.querySelectorAll('[data-thread-id]').forEach(el => {
      el.addEventListener('click', () => {
        state.selectedThreadId = el.dataset.threadId;
        renderMain();
        renderIntel();
      });
    });
  }

  function applyViewAndFilter(allThreads) {
    // Steg 1: filter by view
    let filtered = allThreads.slice();
    if (state.activeView !== 'inkorg') {
      const viewLaneMap = {
        agera_nu: ['act-now', 'agera_nu', 'now'],
        sprint: ['sprint'],
        bokningar: ['booking', 'bokning'],
        granska: ['review', 'granska'],
        senare: ['later', 'senare', 'snooze'],
        klara: ['done', 'klar', 'complete'],
      };
      const lanes = viewLaneMap[state.activeView] || [];
      filtered = filtered.filter(r => {
        const lane = String(r?.lane || r?.laneId || '').toLowerCase();
        return lanes.includes(lane);
      });
    }
    const beforeFilter = filtered.slice();
    // Steg 2: filter by chip
    if (state.activeFilter === 'unread') {
      filtered = filtered.filter(r => r?.isUnread || r?.unread || r?.unreadInbound);
    } else if (state.activeFilter === 'mine') {
      filtered = filtered.filter(r => {
        const owner = String(r?.ownerEmail || r?.assignedTo || '').toLowerCase();
        return owner.includes(state.user.email.toLowerCase());
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
    }
    // Steg 3: sort
    filtered.sort((a, b) => {
      const ta = new Date(a?.timing?.lastInboundAt || a?.timing?.lastActivityAt || a?.updatedAt || 0).getTime();
      const tb = new Date(b?.timing?.lastInboundAt || b?.timing?.lastActivityAt || b?.updatedAt || 0).getTime();
      return state.sortBy === 'oldest' ? ta - tb : tb - ta;
    });
    return { beforeFilter, afterFilter: filtered };
  }

  function renderIntel() {
    const intel = document.getElementById('v2-intel');
    if (!intel) return;

    if (!state.selectedThreadId) {
      intel.innerHTML = `<div class="v2-intel-empty">Välj en tråd för att se kundintelligens.</div>`;
      return;
    }
    const thread = state.threads.find(t => (t?.id || t?.conversation?.conversationId) === state.selectedThreadId);
    if (!thread) {
      intel.innerHTML = `<div class="v2-intel-empty">Tråden hittades inte.</div>`;
      return;
    }
    // MVP: enkel info — höger panel kommer integreras med v1's full intel-panel senare
    intel.innerHTML = `<div class="v2-intel-empty">Kundintelligens kommer i nästa iteration. Tråd: ${escapeHtml(getCustomerName(thread))}</div>`;
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

    // Initial render med tom state
    renderSidebar();
    document.getElementById('v2-main').innerHTML = `<div class="v2-loading">Laddar trådar…</div>`;
    renderIntel();

    // Hämta data
    const rows = await fetchWorklist();
    state.threads = rows;
    state.mailboxCounts = buildMailboxCounts(rows);
    state.isLive = rows.length > 0;
    document.getElementById('v2-app').dataset.v2State = 'ready';

    renderSidebar();
    renderMain();

    // Refresha var 60 sek
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

    console.log('[v2] CCO v2 inkorg klar. Trådar:', rows.length);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
