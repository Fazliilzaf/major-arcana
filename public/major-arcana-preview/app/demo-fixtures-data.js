/**
 * app/demo-fixtures-data.js — ren demo-data + customer-name-seed.
 *
 * Ersätter den FIXTURES-konstant som tidigare bodde i
 * runtime-demo-fixture-name-patch.js. Här finns BARA data + seedning till
 * P0-2-resolvern. Inga DOM-shims, inga MutationObservers, inga setIntervals.
 *
 * FIX12 (focus-pane override) och FIX14 (card-injektor) bor i separata
 * shim-filer som BÅDA importerar denna fils FIXTURES via
 * window.__DemoFixtures.data:
 *   - app/demo-fixture-focus-shim.js  (FIX12)
 *   - app/demo-fixture-card-shim.js   (FIX14)
 *
 * Slutmålet är att eliminera båda shims genom att utöka
 * app/mock-worklist-api.js att returnera dessa fixtures som worklist-rows
 * + conversation-detail. När det är gjort kan både shim-filerna och denna
 * fils seed-funktion plockas bort — kvar blir bara ren demo-data
 * konsumerad av mock-API:t.
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

  // Seedar P0-2-resolvern (runtime-queue-renderers.js) så att demo-trådar
  // kan slå upp customer-name via samma path som live-data.
  function seedDemoCustomers() {
    const resolver = window.MajorArcanaCustomerNameResolver;
    if (!resolver || typeof resolver.seed !== 'function') return false;
    return resolver.seed(FIXTURES) > 0;
  }

  function bootstrapSeed() {
    if (!seedDemoCustomers()) {
      let attempts = 0;
      const seedRetry = window.setInterval(() => {
        attempts += 1;
        if (seedDemoCustomers() || attempts >= 20) {
          window.clearInterval(seedRetry);
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapSeed, { once: true });
  } else {
    bootstrapSeed();
  }

  // Exponera till globalt namespace så shim-filerna kan läsa data.
  window.__DemoFixtures = Object.freeze({
    data: FIXTURES,
    seedCustomers: seedDemoCustomers,
  });
})();
