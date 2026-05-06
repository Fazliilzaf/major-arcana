/**
 * v3-app.js — HairTP Clinic CCO v3 Linear-style Inkorg
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
    { key: 'egzona', label: 'Egzona', color: 'var(--v3-mbx-egzona)' },
    { key: 'fazli', label: 'Fazli', color: 'var(--v3-mbx-fazli)' },
    { key: 'kons', label: 'Kons', color: 'var(--v3-mbx-kons)' },
    { key: 'info', label: 'Info', color: 'var(--v3-mbx-info)' },
    { key: 'contact', label: 'Kontakt', color: 'var(--v3-mbx-kontakt)' },
    { key: 'marknad', label: 'Marknad', color: 'var(--v3-mbx-marknad)' },
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
  // Mock-data (preview-läge utan backend)
  // ============================================================
  function isPreviewMode() {
    // Använd preview-mode på file:// eller om ?preview=1 är satt
    if (location.protocol === 'file:') return true;
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('preview') === '1') return true;
    } catch (e) {}
    return false;
  }

  const NOW = Date.now();
  const T_MIN = (m) => new Date(NOW - m * 60000).toISOString();
  const T_HR = (h) => new Date(NOW - h * 3600000).toISOString();
  const T_DAYS = (d) => new Date(NOW - d * 86400000).toISOString();

  const MOCK_THREADS = [
    {
      id: 'mock-1', isUnread: true,
      customer: { name: 'Morten Bak Kristoffersen', email: 'morten@example.com' },
      subject: 'Frågar om uppföljning på offerten',
      preview: 'behöver svar före måndag.',
      timing: { lastInboundAt: T_MIN(15) },
      lane: 'agera_nu', riskLevel: 'high',
      mailbox: { mailboxAddress: 'egzona@hairtpclinic.com' },
    },
    {
      id: 'mock-2', isUnread: true,
      customer: { name: 'Sara Holm', email: 'sara@example.com' },
      subject: 'Bokning konsultation 18 maj',
      preview: 'Hej! Vill boka en kostnadsfri konsultation. Helen Veerman, Strömstad.',
      timing: { lastInboundAt: T_HR(2) },
      lane: 'bokning', bookingState: 'ready',
      mailbox: { mailboxAddress: 'egzona@hairtpclinic.com' },
    },
    {
      id: 'mock-3', isUnread: false,
      customer: { name: 'Erik Lindqvist', email: 'erik@example.com' },
      subject: 'Prisfråga implantat',
      preview: 'Vad är priset för 2000 grafts? Har sett 28 000 från konkurrent.',
      timing: { lastInboundAt: T_HR(4) },
      lane: 'granska', riskLevel: 'medium',
      mailbox: { mailboxAddress: 'fazli@hairtpclinic.com' },
      ownerEmail: 'fazli@hairtpclinic.com',
    },
    {
      id: 'mock-4', isUnread: true,
      customer: { name: 'Anna Svensson', email: 'anna.s@example.com' },
      subject: 'Reklamation efter behandling',
      preview: 'Är besviken på resultatet. Vill diskutera återbetalning.',
      timing: { lastInboundAt: T_HR(6) },
      lane: 'agera_nu', riskLevel: 'high', starred: true,
      mailbox: { mailboxAddress: 'kons@hairtpclinic.com' },
    },
    {
      id: 'mock-5', isUnread: false,
      customer: { name: 'Johan Karlsson', email: 'johan@example.com' },
      subject: 'Tack för konsultationen',
      preview: 'Tack för en mycket informativ konsultation igår!',
      timing: { lastInboundAt: T_HR(8) },
      lane: 'klar',
      mailbox: { mailboxAddress: 'fazli@hairtpclinic.com' },
      ownerEmail: 'fazli@hairtpclinic.com',
    },
    {
      id: 'mock-6', isUnread: true,
      customer: { name: 'Maria Nilsson', email: 'maria@example.com' },
      subject: 'Avbokning 12 maj',
      preview: 'Tyvärr behöver jag boka av min tid den 12 maj p.g.a. sjukdom.',
      timing: { lastInboundAt: T_HR(10) },
      lane: 'bokning',
      mailbox: { mailboxAddress: 'egzona@hairtpclinic.com' },
    },
    {
      id: 'mock-7', isUnread: false,
      customer: { name: 'Peter Bergström', email: 'peter@example.com' },
      subject: 'Bekräftelse PRP-behandling',
      preview: 'Bekräftar min tid 22 maj kl 14:00.',
      timing: { lastInboundAt: T_HR(12) },
      lane: 'klar',
      mailbox: { mailboxAddress: 'kons@hairtpclinic.com' },
      ownerEmail: 'egzona@hairtpclinic.com',
    },
    {
      id: 'mock-8', isUnread: true,
      customer: { name: 'Linda Olsson', email: 'linda@example.com' },
      subject: 'Före/efter-bilder',
      preview: 'Kan ni skicka mer före/efter-bilder från liknande fall?',
      timing: { lastInboundAt: T_HR(20) },
      lane: 'oklart',
      mailbox: { mailboxAddress: 'info@hairtpclinic.com' },
    },
    {
      id: 'mock-9', isUnread: false,
      customer: { name: 'Tobias Andersson', email: 'tobias@example.com' },
      subject: 'Uppföljning 6 mån efter behandling',
      preview: 'Skickar bilder på resultatet efter 6 månader. Mycket nöjd!',
      timing: { lastInboundAt: T_DAYS(1) },
      lane: 'klar',
      mailbox: { mailboxAddress: 'fazli@hairtpclinic.com' },
      ownerEmail: 'fazli@hairtpclinic.com',
    },
    {
      id: 'mock-10', isUnread: true,
      customer: { name: 'Sandra Persson', email: 'sandra@example.com' },
      subject: 'Frågor om finansiering',
      preview: 'Erbjuder ni delbetalning? Kan ni skicka offerten igen?',
      timing: { lastInboundAt: T_DAYS(1) },
      lane: 'agera_nu', riskLevel: 'medium',
      mailbox: { mailboxAddress: 'egzona@hairtpclinic.com' },
    },
    {
      id: 'mock-11', isUnread: false,
      customer: { name: 'Claes Holmberg', email: 'claes@example.com' },
      subject: 'Re: Inbjudan till informationsträff',
      preview: 'Tack för inbjudan! Jag kommer att delta den 25 maj.',
      timing: { lastInboundAt: T_DAYS(2) },
      lane: 'sprint',
      mailbox: { mailboxAddress: 'marknad@hairtpclinic.com' },
    },
    {
      id: 'mock-12', isUnread: true,
      customer: { name: 'Eva Söderberg', email: 'eva@example.com' },
      subject: 'Klagomål — väntat 3 dagar på svar',
      preview: 'Har fortfarande inte fått svar på min förfrågan från 3 mars.',
      timing: { lastInboundAt: T_DAYS(3) },
      lane: 'agera_nu', riskLevel: 'high',
      mailbox: { mailboxAddress: 'contact@hairtpclinic.com' },
    },
  ];

  // ============================================================
  // Data fetching
  // ============================================================

  function getToken() {
    try {
      return localStorage.getItem('ARCANA_ADMIN_TOKEN') || '';
    } catch (e) { return ''; }
  }

  async function fetchWorklist() {
    if (isPreviewMode()) {
      console.log('[v3] PREVIEW MODE — använder mock-data (12 trådar)');
      return MOCK_THREADS;
    }
    const token = getToken();
    if (!token) {
      console.warn('[v3] Ingen ARCANA_ADMIN_TOKEN — fallback till mock-data');
      return MOCK_THREADS;
    }
    const params = new URLSearchParams();
    params.set('mailboxIds', DEFAULT_MAILBOXES.map(m => `${m.key}@hairtpclinic.com`).join(','));
    params.set('limit', '500');
    try {
      const res = await fetch(`/api/v1/cco/runtime/worklist/consumer?${params.toString()}`, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!res.ok) {
        console.warn('[v3] worklist API failed:', res.status, '— fallback till mock');
        return MOCK_THREADS;
      }
      const data = await res.json();
      const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.items) ? data.items : []);
      return rows.length > 0 ? rows : MOCK_THREADS;
    } catch (e) {
      console.warn('[v3] fetch fel:', e, '— fallback till mock');
      return MOCK_THREADS;
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

  // ============================================================
  // V3 Layout B helpers — SVG-symboler + lane/sentiment/why/owner
  // ============================================================
  const SVG_ICONS = {
    // Lane-ikoner
    lane_unclear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    lane_booking:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    lane_act_now:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    lane_sprint:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    lane_review:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    lane_done:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    lane_later:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    lane_medical:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>',
    // Sentiment-ikoner
    sent_anxious:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    sent_happy:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    sent_neutral:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>',
    sent_angry:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    // Action-ikoner
    act_history:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    act_later:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/></svg>',
    act_schedule:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    act_done:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    act_delete:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    arrow_right:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    star_outline:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    star_filled:   '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    reply:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    warn_alert:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };

  // Lane-mapping: API-värde → { label, color, icon }
  const LANE_INFO = {
    'unclear':  { label: 'Oklart',    color: 'purple', icon: 'lane_unclear' },
    'oklart':   { label: 'Oklart',    color: 'purple', icon: 'lane_unclear' },
    'booking':  { label: 'Bokning',   color: 'cyan',   icon: 'lane_booking' },
    'bokning':  { label: 'Bokning',   color: 'cyan',   icon: 'lane_booking' },
    'act-now':  { label: 'Agera nu',  color: 'pink',   icon: 'lane_act_now' },
    'agera_nu': { label: 'Agera nu',  color: 'pink',   icon: 'lane_act_now' },
    'now':      { label: 'Agera nu',  color: 'pink',   icon: 'lane_act_now' },
    'sprint':   { label: 'Sprint',    color: 'green',  icon: 'lane_sprint' },
    'review':   { label: 'Granska',   color: 'indigo', icon: 'lane_review' },
    'granska':  { label: 'Granska',   color: 'indigo', icon: 'lane_review' },
    'done':     { label: 'Klar',      color: 'green',  icon: 'lane_done' },
    'klar':     { label: 'Klar',      color: 'green',  icon: 'lane_done' },
    'later':    { label: 'Senare',    color: 'cyan',   icon: 'lane_later' },
    'senare':   { label: 'Senare',    color: 'cyan',   icon: 'lane_later' },
    'snooze':   { label: 'Senare',    color: 'cyan',   icon: 'lane_later' },
    'medical':  { label: 'Medicinsk', color: 'red',    icon: 'lane_medical' },
    'medicinsk':{ label: 'Medicinsk', color: 'red',    icon: 'lane_medical' },
  };

  function deriveLane(row) {
    const lane = String(row?.lane || row?.laneId || '').toLowerCase();
    return LANE_INFO[lane] || { label: 'Inkorg', color: 'orange', icon: 'lane_unclear' };
  }

  function deriveSentimentInfo(row) {
    const sent = String(row?.quickSentiment || row?.sentiment || '').toLowerCase();
    const risk = String(row?.riskLevel || row?.dominantRisk || row?.slaStatus || '').toLowerCase();
    if (sent === 'anxious' || /high|hog|hög|breach/.test(risk)) return { tone: 'amber', icon: 'sent_anxious' };
    if (sent === 'angry') return { tone: 'red', icon: 'sent_angry' };
    if (sent === 'happy' || sent === 'positive') return { tone: 'emerald', icon: 'sent_happy' };
    return { tone: 'gray', icon: 'sent_neutral' };
  }

  function deriveWhyReason(row) {
    const reason = row?.whyReason || row?.signalReason || row?.priorityReason;
    if (reason) return reason;
    const lane = String(row?.lane || row?.laneId || '').toLowerCase();
    const risk = String(row?.riskLevel || row?.dominantRisk || row?.slaStatus || '').toLowerCase();
    if (/breach|miss/.test(risk)) return 'Miss-risk';
    if (/high|hog|hög/.test(risk)) return 'Hög risk';
    if (lane === 'bokning' || lane === 'booking') return 'Tid kan erbjudas';
    if (lane === 'agera_nu' || lane === 'act-now') return 'Svar krävs nu';
    if (lane === 'granska' || lane === 'review') return 'Granska tråden';
    if (row?.isUnread || row?.unread) return 'Behöver svar';
    return '';
  }

  function deriveOwnerLabel(row) {
    const owner = String(row?.ownerEmail || row?.assignedTo || '').toLowerCase();
    if (!owner) return 'Ej tilldelad';
    const local = owner.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  function derivePrimaryAction(row) {
    const lane = String(row?.lane || row?.laneId || '').toLowerCase();
    if (lane === 'bokning' || lane === 'booking') return { label: 'Bekräfta bokning', tone: 'cyan' };
    if (lane === 'granska' || lane === 'review') return { label: 'Granska', tone: 'indigo' };
    if (lane === 'agera_nu' || lane === 'act-now') return { label: 'Svara', tone: 'pink' };
    return { label: 'Öppna', tone: 'cream' };
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
    const sidebar = document.getElementById('v3-sidebar');
    if (!sidebar) return;

    const viewCounts = buildViewCounts(state.threads);
    const filterCounts = buildFilterCounts(state.threads);
    const html = [];

    // Brand-rad
    html.push(
      `<div class="v3-sidebar-brand">` +
      `<span class="v3-brand-mark">HT</span>` +
      `<span class="v3-brand-name">HairTP Clinic</span>` +
      `</div>`
    );

    // VYER
    html.push('<div class="v3-sidebar-section">');
    html.push('<div class="v3-sidebar-section-title">Vyer</div>');
    html.push('<div class="v3-pill-list">');
    VIEWS.forEach(v => {
      const isActive = state.activeView === v.key;
      const count = viewCounts[v.key] ?? 0;
      html.push(
        `<button type="button" class="v3-pill ${isActive ? 'is-active' : ''}" data-color="${v.color}" data-view="${v.key}">` +
        `<span class="v3-pill-label">${v.label}</span>` +
        `<span class="v3-pill-count">${count}</span>` +
        `</button>`
      );
    });
    html.push('</div></div>');

    // MAILBOX-VÄLJARE
    html.push('<div class="v3-sidebar-section">');
    html.push('<div class="v3-sidebar-section-title">Mailbox</div>');
    html.push(
      `<button type="button" class="v3-mailbox-selector" data-mailbox-selector>` +
      `<span class="v3-mailbox-selector-icon">📬</span>` +
      `<span class="v3-mailbox-selector-label">${escapeHtml(getMailboxLabel())}</span>` +
      `<span class="v3-mailbox-selector-caret">▾</span>` +
      `</button>`
    );

    // mailbox-lista med volymbarer (7 dagar)
    const maxCount = Math.max(1, ...Object.values(state.mailboxCounts));
    html.push('<div class="v3-mailbox-list">');
    html.push('<div class="v3-mailbox-list-title">Volym · 7 dgn</div>');
    DEFAULT_MAILBOXES.forEach(m => {
      const count = state.mailboxCounts[m.key] || 0;
      const isSelected = state.selectedMailboxKeys.includes(m.key);
      const barWidth = Math.max(6, Math.round((count / maxCount) * 100));
      html.push(
        `<div class="v3-mailbox-row ${isSelected ? 'is-selected' : ''}" data-mailbox="${m.key}" style="--mbx-color:${m.color};--mbx-bar-width:${barWidth}%">` +
        `<div class="v3-mailbox-row-head">` +
        `<span class="v3-mailbox-dot"></span>` +
        `<span class="v3-mailbox-name">${m.label}</span>` +
        `<span class="v3-mailbox-count">${count}</span>` +
        `</div>` +
        `<div class="v3-mailbox-bar"></div>` +
        `</div>`
      );
    });
    html.push('</div>');
    html.push('</div>');

    // FILTER
    html.push('<div class="v3-sidebar-section">');
    html.push('<div class="v3-sidebar-section-title">Filter</div>');
    html.push('<div class="v3-pill-list">');
    FILTERS.forEach(f => {
      const isActive = state.activeFilter === f.key;
      const count = filterCounts[f.key] ?? 0;
      html.push(
        `<button type="button" class="v3-pill ${isActive ? 'is-active' : ''}" data-color="${f.color}" data-filter="${f.key}">` +
        `<span class="v3-pill-label">${f.label}</span>` +
        `<span class="v3-pill-count">${count}</span>` +
        `</button>`
      );
    });
    html.push('</div></div>');

    // SYSTEM
    html.push('<div class="v3-sidebar-section">');
    html.push('<div class="v3-sidebar-section-title">System</div>');
    SYSTEM_LINKS.forEach(s => {
      html.push(
        `<div class="v3-sidebar-item" data-system="${s.key}">` +
        `<span class="v3-sidebar-item-icon">${s.icon}</span>` +
        `<span class="v3-sidebar-item-label">${s.label}</span>` +
        (s.shortcut ? `<span class="v3-sidebar-item-shortcut">${s.shortcut}</span>` : '') +
        `</div>`
      );
    });
    html.push('</div>');

    // User
    html.push(
      `<div class="v3-sidebar-user">` +
      `<div class="v3-user-avatar">${state.user.initials}</div>` +
      `<div class="v3-user-info">` +
      `<div class="v3-user-name">${state.user.name}</div>` +
      `<div class="v3-user-status"><span class="v3-user-status-dot"></span>Online · Aktiv</div>` +
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
        console.log('[v3] system link clicked:', el.dataset.system);
      });
    });
  }

  function renderMain() {
    const main = document.getElementById('v3-main');
    if (!main) return;

    const visibleThreads = applyViewAndFilter(state.threads);

    const headerHtml = (
      `<div class="v3-main-header">` +
      `<div class="v3-main-header-row">` +
      `<h1 class="v3-main-title">` +
      `${VIEWS.find(v => v.key === state.activeView)?.label || 'Alla'}` +
      `<span class="v3-main-subtitle">${visibleThreads.afterFilter.length} trådar idag</span>` +
      `</h1>` +
      `<span class="v3-live-pill"><span class="v3-live-pill-dot"></span>${state.isLive ? 'LIVE' : 'Demo'}</span>` +
      `</div>` +
      `<div class="v3-main-meta">` +
      `<span class="v3-main-meta-item"><span class="v3-main-meta-dot"></span>${escapeHtml(getMailboxLabel())}</span>` +
      (state.activeFilter ? `<span class="v3-main-meta-item v3-main-meta-filter">Filter: ${FILTERS.find(f => f.key === state.activeFilter)?.label}</span>` : '') +
      `<button class="v3-sort-button" type="button" data-sort-toggle>≡ Nyaste ▾</button>` +
      `</div>` +
      `</div>`
    );

    let listHtml = '';
    if (visibleThreads.afterFilter.length === 0) {
      listHtml = `<div class="v3-empty"><span class="v3-empty-icon">📭</span><span class="v3-empty-text">Inga trådar i ${VIEWS.find(v => v.key === state.activeView)?.label?.toLowerCase() || 'denna vy'} just nu.</span></div>`;
    } else {
      // Gmail/Outlook-stil mail-rad lista
      listHtml = '<div class="v3-mail-list">';
      visibleThreads.afterFilter.forEach(row => {
        const id = row?.id || row?.conversation?.conversationId || '';
        const name = getCustomerName(row);
        const subject = row?.subject || row?.title || row?.conversation?.subject || '';
        const preview = row?.preview || row?.bodyPreview || row?.latestMessage?.preview || '';
        const ts = row?.timing?.lastInboundAt || row?.timing?.lastActivityAt || row?.updatedAt;
        const time = formatTime(ts);
        const initials = deriveAvatarInitials(name);
        const avatarColor = deriveAvatarColor(name);
        const isUnread = !!(row?.isUnread || row?.unread || row?.unreadInbound);
        const isSelected = state.selectedThreadId === id;
        const lane = deriveLane(row);
        const risk = String(row?.riskLevel || row?.dominantRisk || row?.slaStatus || '').toLowerCase();
        const isHighRisk = /high|hog|hög|breach|miss/.test(risk);
        const isStarred = !!(row?.starred || row?.flagged || state.starredThreads?.has?.(id));

        // Subject — preview text inline
        const subjectText = subject || '(Inget ämne)';
        const snippetText = preview ? ` — ${preview}` : '';

        listHtml += (
          `<article class="v3-mail ${isUnread ? 'is-unread' : ''} ${isSelected ? 'is-selected' : ''} ${isHighRisk ? 'is-high-risk' : ''}" data-thread-id="${id}">` +

            // Star
            `<button type="button" class="v3-mail-star ${isStarred ? 'is-starred' : ''}" data-action="star" aria-label="Stjärnmarkera">` +
              (isStarred ? SVG_ICONS.star_filled : SVG_ICONS.star_outline) +
            `</button>` +

            // Avatar
            `<span class="v3-mail-avatar" style="background:${avatarColor};">${initials}</span>` +

            // Content (avsändare + subject snippet) — single line, ellipsis
            `<div class="v3-mail-content">` +
              `<span class="v3-mail-from">${escapeHtml(name)}</span>` +
              `<span class="v3-mail-text">` +
                `<span class="v3-mail-subject">${escapeHtml(subjectText)}</span>` +
                (snippetText ? `<span class="v3-mail-snippet">${escapeHtml(snippetText).slice(0, 200)}</span>` : '') +
              `</span>` +
            `</div>` +

            // Meta (warn + lane-dot + time)
            `<div class="v3-mail-meta">` +
              (isHighRisk ? `<span class="v3-mail-warn" title="Hög risk">${SVG_ICONS.warn_alert}</span>` : '') +
              `<span class="v3-mail-lane-dot" data-color="${escapeHtml(lane.color)}" title="${escapeHtml(lane.label)}"></span>` +
              `<span class="v3-mail-time">${escapeHtml(time)}</span>` +
            `</div>` +

            // Hover-actions (glider in från höger)
            `<div class="v3-mail-hover-actions">` +
              `<button type="button" data-action="reply" title="Svara" aria-label="Svara">${SVG_ICONS.reply}</button>` +
              `<button type="button" data-action="later" title="Senare" aria-label="Svara senare">${SVG_ICONS.act_later}</button>` +
              `<button type="button" data-action="schedule" title="Schemalägg" aria-label="Schemalägg">${SVG_ICONS.act_schedule}</button>` +
              `<button type="button" data-action="done" title="Klar" aria-label="Markera klar">${SVG_ICONS.act_done}</button>` +
              `<button type="button" data-action="delete" title="Radera" aria-label="Radera">${SVG_ICONS.act_delete}</button>` +
            `</div>` +

          `</article>`
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
    { key: 'svara_nu',     label: 'Svara nu',           variant: 'primary',  icon: 'reply' },
    { key: 'nytt_mejl',    label: 'Nytt mejl',          variant: 'compose',  icon: 'compose' },
    { key: 'svara_senare', label: 'Senare',             variant: 'neutral',  icon: 'act_later' },
    { key: 'schemalagg',   label: 'Schemalägg',         variant: 'neutral',  icon: 'act_schedule' },
    { key: 'markera_klar', label: 'Klar',               variant: 'success',  icon: 'act_done' },
    { key: 'oppna_historik', label: 'Historik',         variant: 'neutral',  icon: 'act_history' },
    { key: 'radera',       label: 'Radera',             variant: 'danger',   icon: 'act_delete' },
  ];

  // Lägg till compose-icon
  if (!SVG_ICONS.compose) {
    SVG_ICONS.compose = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  }

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

  function deriveAiSummary(thread) {
    if (thread?.aiSummary) return thread.aiSummary;
    if (thread?.summary) return thread.summary;
    const name = getCustomerName(thread);
    const subject = thread?.subject || '';
    const preview = thread?.preview || thread?.bodyPreview || '';
    return `${name} skriver om "${subject}". ${preview.slice(0, 200)}`.trim();
  }

  function deriveAiNextAction(thread) {
    if (thread?.aiNextAction) return thread.aiNextAction;
    if (thread?.nextAction) return thread.nextAction;
    return derivePrimaryAction(thread).label;
  }

  function deriveAiPriorityReason(thread) {
    if (thread?.priorityReason) return thread.priorityReason;
    const why = deriveWhyReason(thread);
    if (why) return why;
    const lane = String(thread?.lane || '').toLowerCase();
    if (lane === 'agera_nu' || lane === 'act-now') return 'Hög prioritet — kräver omedelbar åtgärd';
    if (lane === 'bokning' || lane === 'booking') return 'Bokningsförfrågan — boka tid';
    if (lane === 'granska' || lane === 'review') return 'Granska tråden innan svar';
    return 'Standardprioritet';
  }

  function renderIntel() {
    const intel = document.getElementById('v3-intel');
    if (!intel) return;

    if (!state.selectedThreadId) {
      intel.innerHTML = (
        `<div class="v3-reader-empty">` +
        `<div class="v3-reader-empty-icon">${SVG_ICONS.inquiry || ''}</div>` +
        `<div class="v3-reader-empty-title">Välj en tråd</div>` +
        `<div class="v3-reader-empty-text">Klicka på en tråd i mitten för att se konversationen, AI-sammanfattning och åtgärder.</div>` +
        `</div>`
      );
      return;
    }

    const thread = state.threads.find(t => (t?.id || t?.conversation?.conversationId) === state.selectedThreadId);
    if (!thread) {
      intel.innerHTML = `<div class="v3-reader-empty"><div class="v3-reader-empty-text">Tråden hittades inte.</div></div>`;
      return;
    }

    const name = getCustomerName(thread);
    const email = thread?.customer?.email || thread?.customerEmail || thread?.from?.address || '';
    const subject = thread?.subject || thread?.title || thread?.conversation?.subject || '(Inget ämne)';
    const preview = thread?.preview || thread?.bodyPreview || thread?.latestMessage?.preview || '';
    const initials = deriveAvatarInitials(name);
    const avatarColor = deriveAvatarColor(name);
    const ts = thread?.timing?.lastInboundAt || thread?.timing?.lastActivityAt || thread?.updatedAt;
    const time = formatTime(ts);
    const lane = deriveLane(thread);
    const sentiment = deriveSentimentInfo(thread);
    const owner = deriveOwnerLabel(thread);
    const isUnread = !!(thread?.isUnread || thread?.unread || thread?.unreadInbound);
    const risk = String(thread?.riskLevel || thread?.dominantRisk || thread?.slaStatus || '').toLowerCase();
    const isHighRisk = /high|hog|hög|breach|miss/.test(risk);
    const aiSummary = deriveAiSummary(thread);
    const aiNextAction = deriveAiNextAction(thread);
    const aiPriorityReason = deriveAiPriorityReason(thread);
    const activeTab = state.activeFokusTab || 'konversation';

    intel.innerHTML = (
      `<div class="v3-reader">` +

        // Header: avatar + namn + email + tid
        `<div class="v3-reader-header">` +
          `<div class="v3-reader-avatar-wrap">` +
            `<span class="v3-reader-avatar" style="background:${avatarColor};">${initials}</span>` +
            `<span class="v3-reader-sentiment" data-tone="${sentiment.tone}">${SVG_ICONS[sentiment.icon] || ''}</span>` +
          `</div>` +
          `<div class="v3-reader-meta">` +
            `<div class="v3-reader-name">${escapeHtml(name)}</div>` +
            (email ? `<div class="v3-reader-email">${escapeHtml(email)}</div>` : '') +
          `</div>` +
          `<div class="v3-reader-time">${escapeHtml(time)}</div>` +
        `</div>` +

        // Subject
        `<div class="v3-reader-subject">${escapeHtml(subject)}</div>` +

        // Status row: lane-pill + risk + behöver-svar + ägare
        `<div class="v3-reader-status">` +
          `<span class="v3-lane-pill" data-color="${lane.color}">` +
            `<span class="v3-lane-pill-icon">${SVG_ICONS[lane.icon] || ''}</span>` +
            `<span>${escapeHtml(lane.label)}</span>` +
          `</span>` +
          (isHighRisk ? `<span class="v3-status-chip" data-tone="amber">${SVG_ICONS.warn_alert} Hög risk</span>` : '') +
          (isUnread ? `<span class="v3-status-chip" data-tone="rose">Behöver svar</span>` : '') +
          `<span class="v3-status-chip" data-tone="${owner === 'Ej tilldelad' ? 'amber' : 'gray'}">${escapeHtml(owner)}</span>` +
        `</div>` +

        // AI-sammanfattning card
        `<div class="v3-ai-card">` +
          `<div class="v3-ai-card-header">` +
            `<span class="v3-ai-card-title">AI-sammanfattning</span>` +
            `<button type="button" class="v3-ai-card-refresh" data-action="ai-refresh" title="Uppdatera">↻</button>` +
          `</div>` +
          `<div class="v3-ai-card-body">${escapeHtml(aiSummary)}</div>` +
          `<div class="v3-ai-card-footer">` +
            `<div class="v3-ai-card-row">` +
              `<span class="v3-ai-card-label">Nästa drag</span>` +
              `<span class="v3-ai-card-value">${escapeHtml(aiNextAction)}</span>` +
            `</div>` +
            `<div class="v3-ai-card-row">` +
              `<span class="v3-ai-card-label">Prioritet</span>` +
              `<span class="v3-ai-card-value">${escapeHtml(aiPriorityReason)}</span>` +
            `</div>` +
          `</div>` +
        `</div>` +

        // Tabs
        `<div class="v3-reader-tabs">` +
          FOKUS_TABS.map(t =>
            `<button type="button" class="v3-reader-tab ${activeTab === t.key ? 'is-active' : ''}" data-fokus-tab="${t.key}">` +
              `<span>${escapeHtml(t.label)}</span>` +
            `</button>`
          ).join('') +
        `</div>` +

        // Body — konversation eller annan tab
        `<div class="v3-reader-body">` +
          (activeTab === 'konversation' ? (
            `<article class="v3-reader-message">` +
              `<header class="v3-reader-message-head">` +
                `<span class="v3-reader-message-from">${escapeHtml(name)}</span>` +
                `<span class="v3-reader-message-sep">·</span>` +
                `<span class="v3-reader-message-time">${escapeHtml(time)}</span>` +
              `</header>` +
              `<div class="v3-reader-message-content">${escapeHtml(preview || aiSummary)}</div>` +
            `</article>` +
            (thread?.previousMessages?.length ? thread.previousMessages.map(m =>
              `<article class="v3-reader-message v3-reader-message-prev">` +
                `<header class="v3-reader-message-head">` +
                  `<span class="v3-reader-message-from">${escapeHtml(m.from || '')}</span>` +
                  `<span class="v3-reader-message-sep">·</span>` +
                  `<span class="v3-reader-message-time">${escapeHtml(formatTime(m.timestamp || m.ts))}</span>` +
                `</header>` +
                `<div class="v3-reader-message-content">${escapeHtml(m.preview || m.body || '')}</div>` +
              `</article>`
            ).join('') : '')
          ) : activeTab === 'kundhistorik' ? (
            `<div class="v3-reader-tab-empty">Kunddata kommer från CRM (Cliento) — visas här.</div>`
          ) : activeTab === 'historik' ? (
            `<div class="v3-reader-tab-empty">Tidigare trådar med ${escapeHtml(name)}.</div>`
          ) : (
            `<div class="v3-reader-tab-empty">Inga anteckningar ännu. Klicka för att lägga till.</div>`
          )) +
        `</div>` +

        // Action bar (bottom)
        `<div class="v3-reader-actions">` +
          FOKUS_ACTIONS.map(a =>
            `<button type="button" class="v3-reader-action" data-variant="${a.variant}" data-fokus-action="${a.key}" title="${escapeHtml(a.label)}">` +
              `<span class="v3-reader-action-icon">${SVG_ICONS[a.icon] || ''}</span>` +
              `<span class="v3-reader-action-label">${escapeHtml(a.label)}</span>` +
            `</button>`
          ).join('') +
        `</div>` +

      `</div>`
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
        console.log('[v3] action:', el.dataset.fokusAction, 'för tråd', state.selectedThreadId);
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
    if (document.querySelector('.v3-back-to-v1')) return;
    const link = document.createElement('a');
    link.href = '/major-arcana-preview/';
    link.className = 'v3-back-to-v1';
    link.textContent = '← Klassisk vy';
    document.body.appendChild(link);
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  async function init() {
    renderBackToV1();
    document.getElementById('v3-app').dataset.v2State = 'loading';

    renderSidebar();
    document.getElementById('v3-main').innerHTML = `<div class="v3-loading">Laddar trådar…</div>`;
    renderIntel();

    const rows = await fetchWorklist();
    state.threads = rows;
    state.mailboxCounts = buildMailboxCounts(rows);
    state.isLive = rows.length > 0;
    document.getElementById('v3-app').dataset.v2State = 'ready';

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

    console.log('[v3] CCO v3 inkorg klar (v1-bubbles). Trådar:', rows.length);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
