/**
 * Major Arcana Preview — FIX10: Demo-fixture name patch.
 *
 * Demo-fixtures (worklistSource: "demo") definieras i app.js med customerName
 * ("Morten Bak Kristoffersen" m.fl.) men något i pipelinen mellan fixture-init
 * och rendering wipar fältet, så alla kort visar "Okänd avsändare".
 *
 * Tills root-cause är spårad: hård DOM-patch via MutationObserver som ersätter
 * .name + avatar med rätt värde när data-runtime-thread börjar med "demo-".
 */
(() => {
  'use strict';

  const FIXTURES = {
    'demo-mb-001': {
      name: 'Morten Bak Kristoffersen',
      initials: 'MB',
      email: 'morten.bak@example.com',
      mailbox: 'egzona@hairtpclinic.com',
      mailboxLabel: 'Egzona',
      lane: 'Agera nu',
      laneTone: 'urgent',
      subject: 'Frågar om uppföljning på offerten — behöver svar före måndag',
      preview: 'Hej, jag har inte hört något sedan vårt möte. Behöver kunna lämna besked till frun och vill helst boka inom 2 veckor.',
      conversation: [
        { from: 'Morten Bak Kristoffersen', tone: 'inbound', time: 'Idag 16:07', text: 'Hej! Jag har inte hört något sedan vårt konsultationsmöte i förra veckan. Min fru och jag försöker planera detta tillsammans och behöver kunna ge henne ett besked.\n\nKan ni återkomma med nästa steg? Helst vill jag boka tid inom 2 veckor.\n\nMvh\nMorten' },
        { from: 'Egzona Krasniqi (Hair TP Clinic)', tone: 'outbound', time: 'Idag 12:14', text: 'Hej Morten!\n\nTack för ditt mejl och för förra veckans samtal. Jag förstår att tidsfönstret är viktigt för er. Jag stämmer av med klinikteamet idag och återkommer senast imorgon med två tidsförslag inom de närmaste 2 veckorna.\n\nVänligen,\nEgzona' },
      ],
      timeline: ['Konsultation 8 maj', 'Offert skickad 9 maj', 'Tystnad 5 dagar', 'Påminnelse idag'],
      risk: 'Hög risk — kunden har angett deadline (måndag) och nämner alternativ.',
      nextStep: 'Svara inom 2h med två konkreta tidsförslag.',
    },
    'demo-jk-002': {
      name: 'Johan Karlsson',
      initials: 'JK',
      email: 'johan.karlsson@example.com',
      mailbox: 'fazli@hairtpclinic.com',
      mailboxLabel: 'Fazli',
      lane: 'Sprint',
      laneTone: 'sprint',
      subject: 'Vill boka möte nästa måndag om den nya integrationen',
      preview: 'Hej Fazli, kan vi ses kl 14 på måndag och gå igenom integrationen mot Cliento?',
      conversation: [
        { from: 'Johan Karlsson', tone: 'inbound', time: 'Idag 14:22', text: 'Hej Fazli!\n\nKan vi ses kl 14:00 på måndag och gå igenom Cliento-integrationen? Jag har förberett några frågor om webhook-flödet.\n\nMvh,\nJohan' },
      ],
      timeline: ['Mötesförslag idag', 'Tidigare diskussion 28 april'],
      risk: 'Låg risk — strukturerad förfrågan, tydlig önskan.',
      nextStep: 'Bekräfta tiden eller föreslå alternativ.',
    },
    'demo-sh-003': {
      name: 'Sara Holm',
      initials: 'SH',
      email: 'sara.holm@example.com',
      mailbox: 'kons@hairtpclinic.com',
      mailboxLabel: 'Kons',
      lane: 'Bokning',
      laneTone: 'bookable',
      subject: 'Klar att boka — har bekräftat tid och typ av konsultation',
      preview: 'Hej, jag har bestämt mig för FUE-konsultation och kan komma vilken dag som helst kommande vecka mellan 10–15.',
      conversation: [
        { from: 'Sara Holm', tone: 'inbound', time: 'Igår 09:48', text: 'Hej!\n\nJag har bestämt mig för FUE-konsultation. Jag kan komma vilken dag som helst kommande vecka mellan 10:00 och 15:00. Tar gärna första lediga tid.\n\nTack på förhand,\nSara' },
        { from: 'Egzona Krasniqi (Hair TP Clinic)', tone: 'outbound', time: 'Igår 11:02', text: 'Hej Sara!\n\nVad roligt! Jag återkommer med exakt tid inom dagen — vi har lediga slots tisdag 13:00 och torsdag 11:00.\n\nMvh,\nEgzona' },
      ],
      timeline: ['Första kontakt 22 april', 'Konsultation 28 april', 'Bekräftelse igår'],
      risk: 'Låg risk — klart bokningsintresse.',
      nextStep: 'Skicka kalender-inbjudan med tisdag eller torsdag.',
    },
    'demo-el-004': {
      name: 'Erik Lindqvist',
      initials: 'EL',
      email: 'erik.lindqvist@example.com',
      mailbox: 'contact@hairtpclinic.com',
      mailboxLabel: 'Kontakt',
      lane: 'Granska',
      laneTone: 'review',
      subject: 'AI-utkast flaggat för granskning — innehåller prisuppgift som avviker',
      preview: 'AI-svaret har angett ett pris (32 000 kr) som inte matchar dagens prislista (38 500 kr för FUE).',
      conversation: [
        { from: 'Erik Lindqvist', tone: 'inbound', time: 'Idag 11:34', text: 'Hej!\n\nJag undrar vad en FUE-behandling kostar hos er? Har sett olika priser på olika sidor.\n\nMvh,\nErik' },
        { from: 'AI-utkast (väntar granskning)', tone: 'draft', time: 'Idag 11:36', text: 'Hej Erik!\n\nEn FUE-behandling kostar från 32 000 kr beroende på antal grafts. Vi kan gärna boka in en gratis konsultation där vi tar fram ett exakt pris för just dig.\n\nMvh,\nHair TP Clinic' },
      ],
      timeline: ['Förfrågan inkom idag 11:34', 'AI-utkast genererat 11:36', 'Flaggat för pris-avvikelse 11:36'],
      risk: 'Hög risk — fel pris kan skapa förväntan och tvist.',
      nextStep: 'Korrigera till 38 500 kr eller skicka uppdaterad prislista innan utkastet skickas.',
    },
    'demo-as-005': {
      name: 'Anna Svensson',
      initials: 'AS',
      email: 'anna.svensson@example.com',
      mailbox: 'info@hairtpclinic.com',
      mailboxLabel: 'Info',
      lane: 'Oklart',
      laneTone: 'unclear',
      subject: 'Kort meddelande — otydligt om det är fråga, klagomål eller uppföljning',
      preview: 'Hej, jag undrar bara hur det går?',
      conversation: [
        { from: 'Anna Svensson', tone: 'inbound', time: 'Tis 16:18', text: 'Hej, jag undrar bara hur det går?' },
      ],
      timeline: ['Tidigare konsultation 12 mars', 'Meddelande idag'],
      risk: 'Oklart — meddelandet saknar kontext, kan vara uppföljning.',
      nextStep: 'Slå upp tidigare konversation och svara med kontextuell följdfråga.',
    },
    'demo-pn-006': {
      name: 'Peter Nilsson',
      initials: 'PN',
      email: 'peter.nilsson@example.com',
      mailbox: 'fazli@hairtpclinic.com',
      mailboxLabel: 'Fazli',
      lane: 'Senare',
      laneTone: 'later',
      subject: 'Väntar på kund — behöver återkomma när dokument är klart',
      preview: 'Tack för uppdateringen. Jag väntar på röntgenbilderna och hör av mig så fort jag har dem (förmodligen fredag).',
      conversation: [
        { from: 'Peter Nilsson', tone: 'inbound', time: 'Mån 09:14', text: 'Tack för uppdateringen! Jag väntar på röntgenbilderna och hör av mig så fort jag har dem, förmodligen på fredag.\n\nHa en bra vecka.\n\nMvh,\nPeter' },
        { from: 'Fazli Krasniqi (Hair TP Clinic)', tone: 'outbound', time: 'Mån 09:32', text: 'Hej Peter!\n\nPerfekt, då pausar jag ditt ärende fram till fredag. Du får automatisk påminnelse 09:00 fredag morgon om jag inte hört från dig.\n\nMvh,\nFazli' },
      ],
      timeline: ['Konsultation 18 april', 'Begäran om röntgen 25 april', 'Snooze till fredag'],
      risk: 'Låg risk — väntar på extern faktor.',
      nextStep: 'Påminnelse fredag 09:00. Svara så fort röntgen kommer.',
    },
  };

  const FALLBACK_NAMES = new Set([
    'okänd avsändare',
    'okänd kund',
    'okand avsandare',
    'okand kund',
    'unknown',
    'unknown sender',
    'unknown customer',
  ]);

  function isFallbackName(text) {
    if (!text) return true;
    const norm = String(text).trim().toLowerCase();
    return !norm || FALLBACK_NAMES.has(norm);
  }

  function patchCard(card) {
    if (!card || card.nodeType !== 1) return;
    const id = card.dataset && card.dataset.runtimeThread;
    if (!id) return;
    const fb = FIXTURES[id];
    if (!fb) return;

    // .name (kund-namn i kortets huvudrad)
    const nameEls = card.querySelectorAll('.name, .thread-card-identity-name, .counterparty-name');
    nameEls.forEach((el) => {
      if (isFallbackName(el.textContent)) {
        el.textContent = fb.name;
      }
    });

    // .avatar (initials — visar "OK" pga "Okänd Kund"-derivat)
    const avatarEls = card.querySelectorAll('.avatar, .queue-history-avatar, .thread-card-avatar');
    avatarEls.forEach((el) => {
      const txt = String(el.textContent || '').trim().toUpperCase();
      if (txt === 'OK' || txt === '?' || !txt) {
        el.textContent = fb.initials;
      }
    });
  }

  function patchAllDemoCards(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const cards = scope.querySelectorAll('[data-runtime-thread^="demo-"]');
    cards.forEach(patchCard);
  }

  // FIX12: Renderar fokusytan med demo-konversation när ett demo-kort klickas.
  // Den ordinarie fokus-renderaren detekterar state.runtime.authRequired=true och
  // visar "Session krävs" — för demo-fixtures vill vi bypassa det helt.
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
  function renderConversationEntries(entries) {
    return (entries || [])
      .map((m) => {
        const dir = m.tone === 'outbound' ? 'outbound' : m.tone === 'draft' ? 'draft' : 'inbound';
        const dirLabel = dir === 'outbound' ? 'Skickat' : dir === 'draft' ? 'AI-utkast' : 'Inkommit';
        const bodyHtml = escHtml(m.text || '').replace(/\n+/g, '</p><p>');
        return (
          '<article class="conversation-entry conversation-entry-demo conversation-entry-' + dir + '" ' +
          'style="border:1px solid rgba(215,130,90,0.18);border-radius:14px;padding:14px 16px;margin-bottom:12px;background:' +
          (dir === 'outbound' ? 'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(244,235,224,0.95) 100%)' :
           dir === 'draft' ? 'linear-gradient(180deg,rgba(255,247,235,0.96) 0%,rgba(255,234,201,0.96) 100%)' :
                             'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(252,247,243,0.95) 100%)') +
          ';">' +
          '<div class="conversation-entry-meta" style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:11.5px;color:#8a7460;">' +
          '<strong style="font-weight:600;color:#3b2f25;">' + escHtml(m.from) + '</strong>' +
          '<span>' + escHtml(dirLabel) + ' · ' + escHtml(m.time) + '</span>' +
          '</div>' +
          '<div class="conversation-entry-body" style="font-size:13.5px;line-height:1.55;color:#2b251f;"><p>' +
          bodyHtml +
          '</p></div>' +
          '</article>'
        );
      })
      .join('');
  }
  function renderTimeline(items) {
    return (items || [])
      .map((t, i) => '<li style="padding:6px 0;border-bottom:1px dashed rgba(180,150,120,0.2);font-size:12.5px;color:#5d4d3f;">' +
        '<strong style="color:#7a5e44;font-weight:600;">' + (i + 1) + '.</strong> ' + escHtml(t) + '</li>')
      .join('');
  }
  // FIX12b: tvinga focus-shell till höger grid-kolumn när auth_required gör att
  // den hamnar under queue-shell istället för bredvid den.
  function ensureFocusShellInRightColumn() {
    const ws = document.querySelector('.preview-workspace');
    const focusShell = document.querySelector('.focus-shell');
    const followup = document.querySelector('.cco-followup-row');
    if (!ws || !focusShell) return;
    focusShell.style.gridColumn = '2';
    focusShell.style.gridRow = '1 / span 2';
    focusShell.style.alignSelf = 'stretch';
    focusShell.style.justifySelf = 'stretch';
    focusShell.style.width = '100%';
    focusShell.style.height = 'auto';
    focusShell.style.minHeight = '600px';
    if (followup) {
      followup.style.gridColumn = '2';
      followup.style.gridRow = '1';
      followup.style.alignSelf = 'start';
    }
    ws.style.gridTemplateRows = 'auto';
    // FIX15: focus-layout är default 348px 348px (lika delar) — mail-content
    // klämmer för smalt. Bredda mail-area till 2/3, intel till 1/3.
    const focusLayout = document.querySelector('.focus-layout');
    if (focusLayout) {
      focusLayout.style.gridTemplateColumns = 'minmax(420px, 2fr) minmax(260px, 1fr)';
      focusLayout.style.gap = '14px';
    }
  }

  function renderFocusPanelForFixture(fb) {
    ensureFocusShellInRightColumn();
    const conversationSection = document.querySelector('.focus-section-conversation');
    const layout = document.querySelector('[data-focus-conversation-layout]');
    const titleEl = document.querySelector('[data-focus-title]');
    const statusEl = document.querySelector('[data-focus-status-line]');
    if (!conversationSection || !fb) return false;

    if (titleEl) titleEl.textContent = fb.subject || fb.name;
    if (statusEl) statusEl.textContent = 'Aktiv tråd · ' + fb.mailboxLabel + ' · ' + fb.lane;
    if (layout) layout.classList.remove('is-runtime-empty');

    // Skriv konversations-content i conversation-section
    const conversationHTML =
      '<header style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:8px 4px 14px;border-bottom:1px solid rgba(215,130,90,0.18);margin-bottom:14px;">' +
      '<div>' +
      '<h2 style="font-size:18px;font-weight:600;color:#2b1f15;margin:0 0 4px;">' + escHtml(fb.subject) + '</h2>' +
      '<div style="font-size:12.5px;color:#7a5e44;">' + escHtml(fb.name) + ' · ' + escHtml(fb.email) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">' +
      '<span class="cco-card-badge cco-card-badge-' + escHtml(fb.laneTone) + '" style="padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:600;background:rgba(215,130,90,0.12);color:#a44a1f;">' + escHtml(fb.lane) + '</span>' +
      '<span style="font-size:11px;color:#8a7460;">Inkorg: ' + escHtml(fb.mailboxLabel) + '</span>' +
      '</div>' +
      '</header>' +
      '<section style="margin-bottom:18px;">' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#8a7460;font-weight:600;margin-bottom:8px;">Konversation</div>' +
      renderConversationEntries(fb.conversation) +
      '</section>' +
      '<section style="margin-bottom:18px;padding:14px 16px;border-radius:14px;background:rgba(255,250,243,0.85);border:1px solid rgba(215,130,90,0.16);">' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#a44a1f;font-weight:600;margin-bottom:8px;">Risk</div>' +
      '<p style="font-size:13px;line-height:1.55;color:#3b2f25;margin:0;">' + escHtml(fb.risk) + '</p>' +
      '</section>' +
      '<section style="margin-bottom:18px;padding:14px 16px;border-radius:14px;background:rgba(244,250,243,0.85);border:1px solid rgba(120,170,140,0.22);">' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#3a7a4d;font-weight:600;margin-bottom:8px;">Nästa steg</div>' +
      '<p style="font-size:13px;line-height:1.55;color:#1f3f2a;margin:0;">' + escHtml(fb.nextStep) + '</p>' +
      '</section>' +
      '<section>' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#8a7460;font-weight:600;margin-bottom:8px;">Tidslinje</div>' +
      '<ul style="list-style:none;padding:0;margin:0;">' + renderTimeline(fb.timeline) + '</ul>' +
      '</section>';

    // Bevara existerande wrapper-noder; skriv bara conversation-content.
    // Sök efter conversation-list-noden om den finns, annars skriv hela section.
    const conversationList = conversationSection.querySelector('[data-focus-conversation], .conversation-list, .focus-conversation-content');
    if (conversationList) {
      conversationList.innerHTML = conversationHTML;
    } else {
      // Behåll status-line, signal-row etc; ersätt bara conversation-entry-block.
      const oldEntries = conversationSection.querySelectorAll('.conversation-entry');
      oldEntries.forEach((n) => n.remove());
      const wrapper = document.createElement('div');
      wrapper.className = 'demo-fixture-focus-content';
      wrapper.innerHTML = conversationHTML;
      conversationSection.appendChild(wrapper);
    }
    // Markera notes-rubrik om den finns
    const notesHead = document.querySelector('.focus-notes-head h3');
    if (notesHead) notesHead.textContent = 'Anteckningar för ' + fb.name;
    return true;
  }
  function clearDemoFocusContent() {
    const conversationSection = document.querySelector('.focus-section-conversation');
    if (!conversationSection) return;
    conversationSection.querySelectorAll('.demo-fixture-focus-content').forEach((n) => n.remove());
  }
  function bindDemoCardClickToFocus() {
    document.addEventListener('click', (ev) => {
      const card = ev.target.closest && ev.target.closest('[data-runtime-thread^="demo-"]');
      if (!card) return;
      const id = card.dataset.runtimeThread;
      const fb = FIXTURES[id];
      if (!fb) return;
      // Vänta tills standard-renderaren har skrivit "Session krävs"-tomt-state,
      // sedan skriv över den med demo-innehåll.
      window.requestAnimationFrame(() => {
        clearDemoFocusContent();
        renderFocusPanelForFixture(fb);
      });
      window.setTimeout(() => {
        clearDemoFocusContent();
        renderFocusPanelForFixture(fb);
      }, 250);
    }, true);
  }

  // FIX13: Höger panel försvinner när 4+ mailboxar valts. Layout-koden flyttar
  // focus-shell till en ny rad istället för höger kolumn. Tvinga kontinuerligt.
  function startFocusShellLayoutGuardian() {
    let lastApplyAt = 0;
    function apply() {
      const now = Date.now();
      if (now - lastApplyAt < 100) return; // throttle
      lastApplyAt = now;
      ensureFocusShellInRightColumn();
    }
    // Initial + flera försök efter laddning (DOM är klar i etapper)
    apply();
    [50, 200, 600, 1500, 3000].forEach((ms) => window.setTimeout(apply, ms));

    if (typeof MutationObserver !== 'function') return;
    const ws = document.querySelector('.preview-workspace');
    if (!ws) {
      // Vänta tills workspace finns
      const waiter = new MutationObserver(() => {
        if (document.querySelector('.preview-workspace')) {
          waiter.disconnect();
          startFocusShellLayoutGuardian();
        }
      });
      waiter.observe(document.body, { childList: true, subtree: true });
      return;
    }
    const obs = new MutationObserver(apply);
    obs.observe(ws, { childList: true, attributes: true, attributeFilter: ['style', 'class'], subtree: false });

    // Lyssna också på mailbox-pickerns förändringar (när användaren väljer fler)
    const picker = document.querySelector('.queue-mailbox-toggle, [data-mailbox-picker]') || document.body;
    const pickerObs = new MutationObserver(() => window.setTimeout(apply, 50));
    pickerObs.observe(picker, { childList: true, subtree: true, characterData: true });
  }

  // FIX14: Worklist API kraschar (HTML istället för JSON) → state.runtime.threads
  // hamnar i error-state utan demo-fixtures. Injicera 6 demo-kort direkt i DOM
  // som UI-säkerhetsnät så listan aldrig är tom.
  const FIX14_RAIL_COLORS = {
    'act-now': '#d44a4a', 'sprint': '#3a7a4d', 'bookable': '#1ab9b0',
    'review': '#d97a44', 'unclear': '#9b8b6a', 'later': '#a44a1f',
  };
  const FIX14_CARDS = {
    'demo-mb-001': { laneClass: 'act-now', lane: 'Agera nu', stamp: 'Ej tilldelad', subject: 'Frågar om uppföljning på offerten — behöver svar före måndag', sentiment: '😰', why: 'Hög risk', whyTone: 'alert', mailboxTrail: [['F', '#7a4ff5'], ['K', '#1ab9b0'], ['E', '#a44a1f']], action: 'Svara' },
    'demo-jk-002': { laneClass: 'sprint', lane: 'Sprint', stamp: 'Fazli', subject: 'Konsultation', sentiment: '', why: '', whyTone: '', mailboxTrail: [['F', '#7a4ff5']], action: '' },
    'demo-sh-003': { laneClass: 'bookable', lane: 'Bokning', stamp: 'Egzona', subject: 'Bokning', sentiment: '', why: '', whyTone: '', mailboxTrail: [['K', '#1ab9b0'], ['F', '#7a4ff5']], action: 'Bekräfta bokning' },
    'demo-el-004': { laneClass: 'review', lane: 'Granska', stamp: 'Ej tilldelad', subject: 'Prisfråga', sentiment: '⚠️', why: 'Pris-avvikelse', whyTone: 'alert', mailboxTrail: [['K', '#1ab9b0'], ['F', '#7a4ff5']], action: 'Granska' },
    'demo-as-005': { laneClass: 'unclear', lane: 'Oklart', stamp: 'Ej tilldelad', subject: 'Kort meddelande — otydligt om det är fråga, klagomål eller uppföljning', sentiment: '', why: '', whyTone: '', mailboxTrail: [['I', '#3a7a4d']], action: '' },
    'demo-pn-006': { laneClass: 'later', lane: 'Senare', stamp: 'Fazli', subject: 'Uppföljning', sentiment: '', why: 'Snooze till fre 09:00', whyTone: '', mailboxTrail: [['F', '#7a4ff5']], action: '' },
  };
  function buildFix14CardHtml(id, c) {
    const fb = FIXTURES[id] || {};
    const trail = (c.mailboxTrail || []).map(([letter, color]) => '<span class="mb-dot" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:' + color + ';color:#fff;font-size:11px;font-weight:600;margin-left:-4px;border:2px solid #fff;">' + letter + '</span>').join('');
    const railColor = FIX14_RAIL_COLORS[c.laneClass] || '#a44a1f';
    return '<article class="thread-card queue-history-item unified-queue-card" data-runtime-thread="' + id + '" data-lane="' + c.laneClass + '" data-worklist-source="demo" data-runtime-tags="all,' + c.laneClass + '" tabindex="0" style="position:relative;display:grid;grid-template-columns:12px 1fr;grid-template-rows:auto auto auto;border-radius:14px;background:linear-gradient(180deg,rgba(215,130,90,0.03) 0%,rgba(215,130,90,0.11) 100%),#ffffff;border:1px solid rgba(255,248,232,0.7);box-shadow:inset 0 1px 0 rgba(255,255,255,0.7),0 1px 2px rgba(195,115,80,0.05),0 8px 18px -2px rgba(195,115,80,0.09);margin-bottom:12px;overflow:hidden;contain:layout paint;isolation:isolate;">' +
      '<span class="priority-bar" style="grid-row:1/4;grid-column:1;width:5px;height:100%;background:' + railColor + ';border-radius:14px 0 0 14px;align-self:stretch;"></span>' +
      '<div class="card-strip" style="grid-row:1;grid-column:2;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px 4px;">' +
      '<span class="cco-card-badge cco-card-badge-' + c.laneClass + '" style="padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(215,130,90,0.12);color:' + railColor + ';">' + c.lane + '</span>' +
      '<span class="thread-card-stamp" style="font-size:12px;color:#7a5e44;">' + c.stamp + '</span>' +
      '</div>' +
      '<div class="card-body" style="grid-row:2;grid-column:2;display:grid;grid-template-columns:42px 1fr;align-items:flex-start;gap:14px;padding:6px 16px 12px;">' +
      '<div class="avatar-wrap" style="grid-column:1;grid-row:1;position:relative;">' +
      '<span class="avatar queue-history-avatar" style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#f3d9b8 0%,#d6a87a 100%);color:#3b2f25;font-size:14px;font-weight:600;">' + (fb.initials || '??') + '</span>' +
      '</div>' +
      '<div class="card-content" style="grid-column:2;grid-row:1;min-width:0;display:flex;flex-direction:column;gap:4px;">' +
      '<div class="name-row" style="display:flex;align-items:baseline;gap:10px;margin:0;"><span class="name" style="font-size:16px;font-weight:600;color:#2b1f15;">' + (fb.name || id) + '</span></div>' +
      '<div class="signal-what" style="font-size:14px;line-height:1.4;color:#16161a;font-weight:500;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + c.subject + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="card-footer" style="grid-row:3;grid-column:2;display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:10px 16px 12px;border-top:1px solid rgba(215,130,90,0.16);background:linear-gradient(180deg,rgba(215,130,90,0.05) 0%,rgba(215,130,90,0.03) 100%);">' +
      (c.sentiment ? '<span style="font-size:14px;">' + c.sentiment + '</span>' : '') +
      (c.why ? '<span class="why-reason ' + c.whyTone + '" style="font-size:12px;color:' + (c.whyTone === 'alert' ? '#a44a1f' : '#7a5e44') + ';font-weight:600;">' + c.why + '</span>' : '') +
      '<span class="mailbox-label" style="font-size:11px;color:#8a7460;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">VIA</span>' +
      '<div class="mailbox-trail" style="display:inline-flex;align-items:center;">' + trail + '</div>' +
      (c.action ? '<button style="margin-left:auto;padding:8px 16px;border-radius:999px;background:#2b1f15;color:#fff;font-size:13px;font-weight:600;border:none;cursor:pointer;">' + c.action + ' ›</button>' : '') +
      '</div>' +
      '</article>';
  }
  function ensureDemoCardsInDom() {
    const list = document.querySelector('.queue-history-list');
    if (!list) return false;
    // FIX16: kör BARA injektion när listan är helt tom (eller endast error-placeholder).
    // När äkta worklist-data finns (Revolut, Linus Blad osv) ska vi INTE överlagras —
    // det stripper subjekt och förstör designen.
    const allCards = list.querySelectorAll('[data-runtime-thread]');
    const errorCards = list.querySelectorAll('[data-runtime-thread="runtime-unified-error"], [data-runtime-thread="runtime-feed-empty-empty"]');
    const realCards = allCards.length - errorCards.length;
    if (realCards >= 1) {
      // Det finns äkta kort (eller redan-renderade demo-kort) — rör inget.
      return true;
    }
    // Listan är helt tom eller har bara fel-placeholder → injicera demo-fixtures.
    errorCards.forEach((n) => n.remove());
    const html = Object.keys(FIX14_CARDS).map((id) => buildFix14CardHtml(id, FIX14_CARDS[id])).join('');
    list.insertAdjacentHTML('afterbegin', html);
    const counter = Array.from(document.querySelectorAll('h1, h2, h3, b, strong, .queue-title, .arbetsko-title, [data-queue-title]')).find((e) => /Arbetslista/.test(e.textContent));
    if (counter && /\(0\)/.test(counter.textContent)) counter.textContent = 'Arbetslista (6)';
    return true;
  }
  function startDemoCardInjector() {
    ensureDemoCardsInDom();
    [200, 600, 1500, 3000].forEach((ms) => window.setTimeout(ensureDemoCardsInDom, ms));
    if (typeof MutationObserver !== 'function') return;
    const obs = new MutationObserver(() => ensureDemoCardsInDom());
    const wait = () => {
      const list = document.querySelector('.queue-history-list');
      if (list) obs.observe(list, { childList: true, subtree: false });
      else window.setTimeout(wait, 500);
    };
    wait();
    window.setInterval(ensureDemoCardsInDom, 2000);
  }

  function bootstrap() {
    patchAllDemoCards(document);
    bindDemoCardClickToFocus();
    startFocusShellLayoutGuardian();
    startDemoCardInjector();
    if (typeof MutationObserver !== 'function') return;

    const observer = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node && node.nodeType === 1) {
              if (
                (node.matches && node.matches('[data-runtime-thread^="demo-"]')) ||
                (node.querySelector && node.querySelector('[data-runtime-thread^="demo-"]'))
              ) {
                needsScan = true;
                break;
              }
            }
          }
        } else if (m.type === 'characterData' || m.type === 'attributes') {
          const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          if (target && target.closest && target.closest('[data-runtime-thread^="demo-"]')) {
            needsScan = true;
          }
        }
        if (needsScan) break;
      }
      if (needsScan) {
        // Defer så all DOM-uppdatering hinner färdigställas innan vi patchar.
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => patchAllDemoCards(document));
        } else {
          patchAllDemoCards(document);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Backup: kör skanning var 1.5s i 30s i fall MutationObserver missar något.
    let count = 0;
    const interval = window.setInterval(() => {
      patchAllDemoCards(document);
      count += 1;
      if (count >= 20) window.clearInterval(interval);
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
