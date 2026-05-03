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
  function renderFocusPanelForFixture(fb) {
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

  function bootstrap() {
    patchAllDemoCards(document);
    bindDemoCardClickToFocus();
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
