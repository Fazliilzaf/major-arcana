/**
 * app/demo-fixture-card-shim.js — FIX14 (DOM-injektor för demo-kort).
 *
 * VARFÖR FINNS DEN HÄR FILEN?
 * Mock-worklist-API (app/mock-worklist-api.js) returnerar idag tomma
 * worklist-rader för demo-mode. Det betyder att state.runtime.threads = []
 * och queue-history-list renderar tom. Den här shim:en kör en periodisk
 * check (var 2s) och injicerar 6 demo-kort i DOM:en när listan är tom.
 *
 * VAD SKULLE KRÄVAS FÖR ATT ELIMINERA DEN?
 * 1. Utöka mock-worklist-API:t att returnera FIXTURES (window.__DemoFixtures.data)
 *    som worklist-rader i payload-format som
 *    runtime-dom-live-composition.js (rad ~2280-2320) förväntar sig.
 *    Varje row bör ha åtminstone: id, conversationKey, customer.{name,email},
 *    mailboxAddress, lane, subject, preview, worklistSource: "demo",
 *    plus de fält som mappas till thread-objekt i state.runtime.threads.
 * 2. När mock-API:t returnerar FIXTURES → app:ens vanliga renderer kommer
 *    skapa thread-cards med rätt data, och denna shim blir helt överflödig.
 * 3. Bonus: ta bort behovet av "data-worklist-source=demo"-marker i koden;
 *    det användes av FIX14 för att veta vilka kort som var dess.
 *
 * SLÅ AV: window.__DISABLE_DEMO_FIXTURE_SHIMS = true (gör shim till no-op)
 */
(() => {
  'use strict';

  if (window.__DISABLE_DEMO_FIXTURE_SHIMS === true) {
    return;
  }

  const FIXTURES = window.__DemoFixtures?.data || {};
  if (!FIXTURES || Object.keys(FIXTURES).length === 0) {
    if (typeof console !== 'undefined') {
      console.warn('[demo-fixture-card-shim] inga fixtures hittade — är demo-fixtures-data.js laddad?');
    }
    return;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // Card-konfiguration (lane-färg, stamp, sentiment osv) per demo-tråd.
  const CARDS = {
    'demo-mb-001': { laneClass: 'act-now', lane: 'Agera nu', stamp: 'Ej tilldelad', subject: 'Frågar om uppföljning på offerten — behöver svar före måndag', sentiment: '😰', why: 'Hög risk', whyTone: 'alert', mailboxTrail: [['F', '#7a4ff5'], ['K', '#1ab9b0'], ['E', '#a44a1f']], action: 'Svara' },
    'demo-jk-002': { laneClass: 'sprint', lane: 'Sprint', stamp: 'Fazli', subject: 'Konsultation', sentiment: '', why: '', whyTone: '', mailboxTrail: [['F', '#7a4ff5']], action: '' },
    'demo-sh-003': { laneClass: 'bookable', lane: 'Bokning', stamp: 'Egzona', subject: 'Bokning', sentiment: '', why: '', whyTone: '', mailboxTrail: [['K', '#1ab9b0'], ['F', '#7a4ff5']], action: 'Bekräfta bokning' },
    'demo-el-004': { laneClass: 'review', lane: 'Granska', stamp: 'Ej tilldelad', subject: 'Prisfråga', sentiment: '⚠️', why: 'Pris-avvikelse', whyTone: 'alert', mailboxTrail: [['K', '#1ab9b0'], ['F', '#7a4ff5']], action: 'Granska' },
    'demo-as-005': { laneClass: 'unclear', lane: 'Oklart', stamp: 'Ej tilldelad', subject: 'Kort meddelande — otydligt om det är fråga, klagomål eller uppföljning', sentiment: '', why: '', whyTone: '', mailboxTrail: [['I', '#3a7a4d']], action: '' },
    'demo-pn-006': { laneClass: 'later', lane: 'Senare', stamp: 'Fazli', subject: 'Uppföljning', sentiment: '', why: 'Snooze till fre 09:00', whyTone: '', mailboxTrail: [['F', '#7a4ff5']], action: '' },
  };

  const WHY_ICONS = {
    alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12.01" y2="17.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 4 3 10 9 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.36L3 10"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  };

  const ATTACH_ICON = {
    paperclip: '<svg class="warm-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    image:     '<svg class="warm-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  };

  const ACTION_ICONS = {
    history: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    later:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10l4.24 4.24"/><circle cx="12" cy="12" r="10"/></svg>',
    schedule:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    handled: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    delete:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    arrow:   '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  };

  function buildCardHtml(id, c) {
    const fb = FIXTURES[id] || {};
    const sender = escHtml(fb.name || id);
    const subject = escHtml(c.subject || '');
    const preview = escHtml(fb.preview || '');
    const initials = escHtml(fb.initials || '??');
    const stamp = escHtml(c.stamp || '');
    const laneLabel = escHtml(c.lane || '');
    const time = escHtml(fb.time || '6 maj');
    const ownedFlag = !/ej tilldelad|unassigned|otilldelad/i.test(c.stamp || '');

    let whyKind = 'info';
    const whyText = (c.why || '').toLowerCase();
    if (/miss[\s-]?risk|risk|overdue|brand/.test(whyText)) whyKind = 'alert';
    else if (/svar|reply|fr.ga/.test(whyText)) whyKind = 'refresh';
    else if (/.tg.rd|action|br.dsk|akut|urgent/.test(whyText)) whyKind = 'info';
    else if (/klar|done|f.rdig/.test(whyText)) whyKind = 'check';
    else if (c.whyTone === 'alert') whyKind = 'info';
    else if (c.whyTone === 'amber') whyKind = 'alert';

    let attachIcons = '';
    const hay = (subject + ' ' + preview).toLowerCase();
    if (/\.pdf|signerad|bifogad|undertecknats|avtal|kvitto|faktura|offert|dokument/.test(hay)) attachIcons += ATTACH_ICON.paperclip;
    if (/\.jpe?g|\.png|\.gif|\[telefon\]|nyhetsbrev|kundcase|bild |image |screenshot/.test(hay)) attachIcons += ATTACH_ICON.image;

    const primaryLabel = c.laneClass === 'bookable' ? 'Bekräfta bokning' : c.laneClass === 'review' ? 'Granska' : c.laneClass === 'unclear' ? 'Öppna' : 'Svara';

    return '<article class="thread-card queue-history-item unified-queue-card warm-row" data-v8-version="warm-r8" data-runtime-thread="' + id + '" data-lane="' + c.laneClass + '" data-worklist-source="demo" data-runtime-tags="all,' + c.laneClass + '" tabindex="0">' +
      '<span class="warm-rail" aria-hidden="true"></span>' +
      '<div class="warm-top">' +
        '<span class="lane-badge" data-lane="' + c.laneClass + '">' + laneLabel + '</span>' +
        '<div class="warm-top-meta">' +
          '<time class="meta-date">' + time + '</time>' +
          (stamp ? '<span class="meta-sep" aria-hidden="true">·</span><span class="meta-status ' + (ownedFlag ? 'owned' : 'unowned') + '">' + stamp + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="warm-mid">' +
        '<div class="warm-avatar avatar-wrap">' +
          '<span class="avatar queue-history-avatar" aria-hidden="true">' + initials + '</span>' +
          '<span class="status-dot' + (c.laneClass === 'act-now' ? ' alert' : c.laneClass === 'review' ? ' warn' : '') + '" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="warm-content">' +
          '<div class="warm-line-1">' +
            '<span class="warm-sender">' + sender + '</span>' +
            (subject ? '<span class="warm-sep" aria-hidden="true">·</span><span class="warm-subject signal-what" title="' + subject + '">' + subject + '</span>' : '') +
            (attachIcons ? '<span class="warm-file-icons" aria-hidden="true">' + attachIcons + '</span>' : '') +
          '</div>' +
          (preview ? '<div class="warm-preview">' + preview + '</div>' : '') +
          (c.why ? '<div class="warm-why" data-why-kind="' + whyKind + '"><span class="warm-why-icon" aria-hidden="true">' + WHY_ICONS[whyKind] + '</span><span class="why-reason">' + escHtml(c.why) + '</span></div>' : '') +
        '</div>' +
        '<div class="warm-actions action-cluster">' +
          '<button class="action-icon" type="button" data-quick-action="history" title="Historik" aria-label="Öppna historik">' + ACTION_ICONS.history + '</button>' +
          '<button class="action-icon" type="button" data-quick-action="later" title="Svara senare" aria-label="Svara senare">' + ACTION_ICONS.later + '</button>' +
          '<button class="action-icon" type="button" data-quick-action="schedule" title="Schemalägg uppföljning" aria-label="Schemalägg uppföljning">' + ACTION_ICONS.schedule + '</button>' +
          '<button class="action-icon" type="button" data-quick-action="handled" title="Markera klar" aria-label="Markera klar">' + ACTION_ICONS.handled + '</button>' +
          '<button class="action-icon" type="button" data-quick-action="delete" title="Radera" aria-label="Radera">' + ACTION_ICONS.delete + '</button>' +
          '<button class="primary-action" type="button" data-quick-action="studio" data-quick-mode="reply" data-runtime-studio-open data-runtime-studio-thread-id="' + id + '" aria-controls="studio-shell">' + escHtml(primaryLabel) + ACTION_ICONS.arrow + '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function ensureDemoCardsInDom() {
    const list = document.querySelector('.queue-history-list');
    if (!list) return false;
    // Kör BARA injektion när listan är helt tom (eller endast error-placeholder).
    // När äkta worklist-data finns ska vi INTE överlagra — det förstör designen.
    const allCards = list.querySelectorAll('[data-runtime-thread]');
    const errorCards = list.querySelectorAll(
      '[data-runtime-thread="runtime-unified-error"], ' +
      '[data-runtime-thread="runtime-feed-empty-empty"], ' +
      '[data-runtime-thread="runtime-offline-empty"], ' +
      '[data-runtime-thread^="runtime-"][data-runtime-thread*="empty"], ' +
      '[data-runtime-thread^="runtime-"][data-runtime-thread*="error"]'
    );
    const realCards = allCards.length - errorCards.length;
    if (realCards >= 1) {
      return true; // Har äkta kort — rör inget.
    }
    errorCards.forEach((n) => n.remove());
    const html = Object.keys(CARDS).map((id) => buildCardHtml(id, CARDS[id])).join('');
    list.insertAdjacentHTML('afterbegin', html);
    const counter = Array.from(document.querySelectorAll('h1, h2, h3, b, strong, .queue-title, .arbetsko-title, [data-queue-title]')).find((e) => /Arbetslista/.test(e.textContent));
    if (counter && /\(0\)/.test(counter.textContent)) counter.textContent = 'Arbetslista (6)';
    return true;
  }

  function startInjector() {
    ensureDemoCardsInDom();
    [200, 600, 1500, 3000].forEach((ms) => window.setTimeout(ensureDemoCardsInDom, ms));
    window.setInterval(ensureDemoCardsInDom, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInjector, { once: true });
  } else {
    startInjector();
  }

  // Exponera för debug
  window.__DemoFixtureCardShim = Object.freeze({
    inject: ensureDemoCardsInDom,
    cards: CARDS,
  });
})();
