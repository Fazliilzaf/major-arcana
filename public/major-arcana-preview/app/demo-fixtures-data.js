/**
 * app/demo-fixtures-data.js — ren demo-data + customer-name-seed.
 *
 * STATUS 2026-05-09: FIX12 + FIX14 shims ELIMINERADE. Den primära demo-
 * datakällan ligger inbäddad i app.js state-init (huvud-demo + mailbox-demo)
 * som state.runtime.threads med worklistSource: "demo". Mock-worklist-API
 * (app/mock-worklist-api.js) serverar /auth/me + /integrations/status med
 * 200 OK i demo-mode → state.runtime.authRequired = false → focus-pane
 * renderar normalt utan att behöva FIX12-overriden.
 *
 * Den här filen behålls för:
 *   - Customer-name-seed: P0-2-resolvern (app.js) kan
 *     vid edge-cases behöva extra namn-mappning för demo-trådar
 *   - window.__DemoFixtures.data: konsumerad av tools/coverage/verify-demo-fixtures.js
 *     och kan användas av framtida features som vill ha demo-conversations
 *
 * FIXTURES-data är delvis duplicerad mot app.js state-init — det är medvetet
 * för att hålla data isolerad från bootstrap-pathen och konsumerbar via
 * window.__DemoFixtures.
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
      preview:
        'Hej, jag har inte hört något sedan vårt möte. Behöver kunna lämna besked till frun och vill helst boka inom 2 veckor.',
      conversation: [
        {
          from: 'Morten Bak Kristoffersen',
          tone: 'inbound',
          time: 'Idag 16:07',
          text: 'Hej! Jag har inte hört något sedan vårt konsultationsmöte i förra veckan. Min fru och jag försöker planera detta tillsammans och behöver kunna ge henne ett besked.\n\nKan ni återkomma med nästa steg? Helst vill jag boka tid inom 2 veckor.\n\nMvh\nMorten',
        },
        {
          from: 'Egzona Krasniqi (Hair TP Clinic)',
          tone: 'outbound',
          time: 'Idag 12:14',
          text: 'Hej Morten!\n\nTack för ditt mejl och för förra veckans samtal. Jag förstår att tidsfönstret är viktigt för er. Jag stämmer av med klinikteamet idag och återkommer senast imorgon med två tidsförslag inom de närmaste 2 veckorna.\n\nVänligen,\nEgzona',
        },
      ],
      timeline: [
        'Konsultation 8 maj',
        'Offert skickad 9 maj',
        'Tystnad 5 dagar',
        'Påminnelse idag',
      ],
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
        {
          from: 'Johan Karlsson',
          tone: 'inbound',
          time: 'Idag 14:22',
          text: 'Hej Fazli!\n\nKan vi ses kl 14:00 på måndag och gå igenom Cliento-integrationen? Jag har förberett några frågor om webhook-flödet.\n\nMvh,\nJohan',
        },
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
      preview:
        'Hej, jag har bestämt mig för FUE-konsultation och kan komma vilken dag som helst kommande vecka mellan 10–15.',
      conversation: [
        {
          from: 'Sara Holm',
          tone: 'inbound',
          time: 'Igår 09:48',
          text: 'Hej!\n\nJag har bestämt mig för FUE-konsultation. Jag kan komma vilken dag som helst kommande vecka mellan 10:00 och 15:00. Tar gärna första lediga tid.\n\nTack på förhand,\nSara',
        },
        {
          from: 'Egzona Krasniqi (Hair TP Clinic)',
          tone: 'outbound',
          time: 'Igår 11:02',
          text: 'Hej Sara!\n\nVad roligt! Jag återkommer med exakt tid inom dagen — vi har lediga tider tisdag 13:00 och torsdag 11:00.\n\nMvh,\nEgzona',
        },
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
      preview:
        'AI-svaret har angett ett pris (32 000 kr) som inte matchar dagens prislista (38 500 kr för FUE).',
      conversation: [
        {
          from: 'Erik Lindqvist',
          tone: 'inbound',
          time: 'Idag 11:34',
          text: 'Hej!\n\nJag undrar vad en FUE-behandling kostar hos er? Har sett olika priser på olika sidor.\n\nMvh,\nErik',
        },
        {
          from: 'AI-utkast (väntar granskning)',
          tone: 'draft',
          time: 'Idag 11:36',
          text: 'Hej Erik!\n\nEn FUE-behandling kostar från 32 000 kr beroende på antal grafts. Vi kan gärna boka in en gratis konsultation där vi tar fram ett exakt pris för just dig.\n\nMvh,\nHair TP Clinic',
        },
      ],
      timeline: [
        'Förfrågan inkom idag 11:34',
        'AI-utkast genererat 11:36',
        'Flaggat för pris-avvikelse 11:36',
      ],
      risk: 'Hög risk — fel pris kan skapa förväntan och tvist.',
      nextStep:
        'Korrigera till 38 500 kr eller skicka uppdaterad prislista innan utkastet skickas.',
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
        {
          from: 'Anna Svensson',
          tone: 'inbound',
          time: 'Tis 16:18',
          text: 'Hej, jag undrar bara hur det går?',
        },
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
      preview:
        'Tack för uppdateringen. Jag väntar på röntgenbilderna och hör av mig så fort jag har dem (förmodligen fredag).',
      conversation: [
        {
          from: 'Peter Nilsson',
          tone: 'inbound',
          time: 'Mån 09:14',
          text: 'Tack för uppdateringen! Jag väntar på röntgenbilderna och hör av mig så fort jag har dem, förmodligen på fredag.\n\nHa en bra vecka.\n\nMvh,\nPeter',
        },
        {
          from: 'Fazli Krasniqi (Hair TP Clinic)',
          tone: 'outbound',
          time: 'Mån 09:32',
          text: 'Hej Peter!\n\nPerfekt, då pausar jag ditt ärende fram till fredag. Du får automatisk påminnelse 09:00 fredag morgon om jag inte hört från dig.\n\nMvh,\nFazli',
        },
      ],
      timeline: ['Konsultation 18 april', 'Begäran om röntgen 25 april', 'Snooze till fredag'],
      risk: 'Låg risk — väntar på extern faktor.',
      nextStep: 'Påminnelse fredag 09:00. Svara så fort röntgen kommer.',
    },
    // ── Synkade mot app.js: spridd fixture-data per mailbox (demo-*-10x)
    'demo-eg-101': {
      name: 'Lisa Andersson',
      initials: 'LA',
      email: 'lisa.andersson@example.com',
      mailbox: 'egzona@hairtpclinic.com',
      mailboxLabel: 'Egzona',
      lane: 'Agera nu',
      laneTone: 'urgent',
      subject: 'Klagomål om uteblivet svar — kunden vill prata med chefen.',
      preview: 'Klagomål om uteblivet svar — kunden vill prata med chefen.',
      conversation: [
        {
          from: 'Lisa Andersson',
          tone: 'inbound',
          time: '08:42',
          text: 'Klagomål om uteblivet svar — kunden vill prata med chefen.',
        },
      ],
      timeline: ['Inkom idag'],
      risk: 'Hög risk — klagomål och eskalationshot.',
      nextStep: 'Svara nu med tydlig åtgärdsplan.',
    },
    'demo-eg-102': {
      name: 'Tomas Berg',
      initials: 'TB',
      email: 'tomas.berg@example.com',
      mailbox: 'egzona@hairtpclinic.com',
      mailboxLabel: 'Egzona',
      lane: 'Bokning',
      laneTone: 'bookable',
      subject: 'Vill boka konsultation — har redan fyllt i hälsoformulär.',
      preview: 'Vill boka konsultation — har redan fyllt i hälsoformulär.',
      conversation: [
        {
          from: 'Tomas Berg',
          tone: 'inbound',
          time: 'Igår',
          text: 'Vill boka konsultation — har redan fyllt i hälsoformulär.',
        },
      ],
      timeline: ['Hälsoformulär inskickat'],
      risk: 'Låg risk — tydlig bokningsintention.',
      nextStep: 'Bekräfta bokning.',
    },
    'demo-ko-101': {
      name: 'Maria Lund',
      initials: 'ML',
      email: 'maria.lund@example.com',
      mailbox: 'contact@hairtpclinic.com',
      mailboxLabel: 'Kontakt',
      lane: 'Sprint',
      laneTone: 'sprint',
      subject: 'Frågar om öppettider och adress för första besöket.',
      preview: 'Frågar om öppettider och adress för första besöket.',
      conversation: [
        {
          from: 'Maria Lund',
          tone: 'inbound',
          time: '10:15',
          text: 'Frågar om öppettider och adress för första besöket.',
        },
      ],
      timeline: ['Första kontakt'],
      risk: 'Låg risk — informationsförfrågan.',
      nextStep: 'Svara med öppettider och vägbeskrivning.',
    },
    'demo-ko-102': {
      name: 'Anders Pettersson',
      initials: 'AP',
      email: 'anders.pettersson@example.com',
      mailbox: 'contact@hairtpclinic.com',
      mailboxLabel: 'Kontakt',
      lane: 'Senare',
      laneTone: 'later',
      subject: 'Vill ha mer information om olika behandlingar innan beslut.',
      preview: 'Vill ha mer information om olika behandlingar innan beslut.',
      conversation: [
        {
          from: 'Anders Pettersson',
          tone: 'inbound',
          time: 'Mån',
          text: 'Vill ha mer information om olika behandlingar innan beslut.',
        },
      ],
      timeline: ['Avvaktar beslut'],
      risk: 'Låg risk — research-fas.',
      nextStep: 'Svara med broschyr eller länk.',
    },
    'demo-fa-101': {
      name: 'Carolina Holm',
      initials: 'CH',
      email: 'carolina.holm@example.com',
      mailbox: 'fazli@hairtpclinic.com',
      mailboxLabel: 'Fazli',
      lane: 'Granska',
      laneTone: 'review',
      subject: 'Önskar förtydligande av offert — del av rabatten oklar.',
      preview: 'Önskar förtydligande av offert — del av rabatten oklar.',
      conversation: [
        {
          from: 'Carolina Holm',
          tone: 'inbound',
          time: '12:50',
          text: 'Önskar förtydligande av offert — del av rabatten oklar.',
        },
      ],
      timeline: ['Offert skickad'],
      risk: 'Medel risk — prisdiskussion.',
      nextStep: 'Granska tråden och förtydliga offert.',
    },
    'demo-fa-102': {
      name: 'Mikael Engström',
      initials: 'ME',
      email: 'mikael.engstrom@example.com',
      mailbox: 'fazli@hairtpclinic.com',
      mailboxLabel: 'Fazli',
      lane: 'Agera nu',
      laneTone: 'urgent',
      subject: 'Akut: behöver flytta operation från fredag — familjehändelse.',
      preview: 'Akut: behöver flytta operation från fredag — familjehändelse.',
      conversation: [
        {
          from: 'Mikael Engström',
          tone: 'inbound',
          time: '07:30',
          text: 'Akut: behöver flytta operation från fredag — familjehändelse.',
        },
      ],
      timeline: ['Operation bokad', 'Ändringsönskemål idag'],
      risk: 'Hög risk — tidskänsligt.',
      nextStep: 'Svara nu med nya tider.',
    },
    'demo-re-101': {
      name: 'Sofia Berg',
      initials: 'SB',
      email: 'sofia.berg@example.com',
      mailbox: 'kvitto@hairtpclinic.com',
      mailboxLabel: 'Kvitto',
      lane: 'Admin',
      laneTone: 'admin',
      subject: 'Kvitto saknas — behöver för försäkringsbolaget innan måndag.',
      preview: 'Kvitto saknas — behöver för försäkringsbolaget innan måndag.',
      conversation: [
        {
          from: 'Sofia Berg',
          tone: 'inbound',
          time: '09:18',
          text: 'Kvitto saknas — behöver för försäkringsbolaget innan måndag.',
        },
      ],
      timeline: ['Betalning genomförd', 'Kvitto begärt'],
      risk: 'Medel risk — deadline måndag.',
      nextStep: 'Skicka kvitto.',
    },
    'demo-re-102': {
      name: 'Daniel Ek',
      initials: 'DE',
      email: 'daniel.ek@example.com',
      mailbox: 'kvitto@hairtpclinic.com',
      mailboxLabel: 'Kvitto',
      lane: 'Admin',
      laneTone: 'admin',
      subject: 'Frågor om delbetalning — kan vi dela upp på 6 månader?',
      preview: 'Frågor om delbetalning — kan vi dela upp på 6 månader?',
      conversation: [
        {
          from: 'Daniel Ek',
          tone: 'inbound',
          time: 'Igår',
          text: 'Frågor om delbetalning — kan vi dela upp på 6 månader?',
        },
      ],
      timeline: ['Delbetalningsförfrågan'],
      risk: 'Låg risk — ekonomifråga.',
      nextStep: 'Svara med villkor.',
    },
    'demo-in-101': {
      name: 'Helena Nyström',
      initials: 'HN',
      email: 'helena.nystrom@example.com',
      mailbox: 'info@hairtpclinic.com',
      mailboxLabel: 'Info',
      lane: 'Oklart',
      laneTone: 'unclear',
      subject: 'Otydlig fråga om processen — kanske vill avboka eller flytta?',
      preview: 'Otydlig fråga om processen — kanske vill avboka eller flytta?',
      conversation: [
        {
          from: 'Helena Nyström',
          tone: 'inbound',
          time: 'Tor',
          text: 'Otydlig fråga om processen — kanske vill avboka eller flytta?',
        },
      ],
      timeline: ['Låg konfidens'],
      risk: 'Oklart — behöver kontext.',
      nextStep: 'Granska tråden.',
    },
    'demo-in-102': {
      name: 'Erik Lindberg',
      initials: 'EL',
      email: 'erik.lindberg@example.com',
      mailbox: 'info@hairtpclinic.com',
      mailboxLabel: 'Info',
      lane: 'Sprint',
      laneTone: 'sprint',
      subject: 'Allmän fråga om kliniken — har sett er på Instagram.',
      preview: 'Allmän fråga om kliniken — har sett er på Instagram.',
      conversation: [
        {
          from: 'Erik Lindberg',
          tone: 'inbound',
          time: '13:05',
          text: 'Allmän fråga om kliniken — har sett er på Instagram.',
        },
      ],
      timeline: ['Social kanal'],
      risk: 'Låg risk — generell förfrågan.',
      nextStep: 'Svara med välkomstinfo.',
    },
    'demo-kn-101': {
      name: 'Johanna Wikström',
      initials: 'JW',
      email: 'johanna.wikstrom@example.com',
      mailbox: 'kons@hairtpclinic.com',
      mailboxLabel: 'Kons',
      lane: 'Bokning',
      laneTone: 'bookable',
      subject: 'Bokningskonsultation begärd — kan komma tisdag eller torsdag.',
      preview: 'Bokningskonsultation begärd — kan komma tisdag eller torsdag.',
      conversation: [
        {
          from: 'Johanna Wikström',
          tone: 'inbound',
          time: '11:20',
          text: 'Bokningskonsultation begärd — kan komma tisdag eller torsdag.',
        },
      ],
      timeline: ['Bokningsönskemål'],
      risk: 'Låg risk — tydliga tidsfönster.',
      nextStep: 'Bekräfta bokning.',
    },
    'demo-kn-102': {
      name: 'Patrik Sandberg',
      initials: 'PS',
      email: 'patrik.sandberg@example.com',
      mailbox: 'kons@hairtpclinic.com',
      mailboxLabel: 'Kons',
      lane: 'Medicinsk',
      laneTone: 'medical',
      subject: 'Medicinsk fråga — tar blodförtunnande, går operation att göra?',
      preview: 'Medicinsk fråga — tar blodförtunnande, går operation att göra?',
      conversation: [
        {
          from: 'Patrik Sandberg',
          tone: 'inbound',
          time: 'Ons',
          text: 'Medicinsk fråga — tar blodförtunnande, går operation att göra?',
        },
      ],
      timeline: ['Medicinsk triage'],
      risk: 'Hög risk — medicinsk bedömning krävs.',
      nextStep: 'Granska tråden.',
    },
    'demo-ma-101': {
      name: 'Kampanjbyrån AB',
      initials: 'KA',
      email: 'kontakt@kampanjbyran.example.com',
      mailbox: 'marknad@hairtpclinic.com',
      mailboxLabel: 'Marknad',
      lane: 'Senare',
      laneTone: 'later',
      subject: 'Erbjudande: höstkampanj på Instagram — vill diskutera möte.',
      preview: 'Erbjudande: höstkampanj på Instagram — vill diskutera möte.',
      conversation: [
        {
          from: 'Kampanjbyrån AB',
          tone: 'inbound',
          time: 'Mån',
          text: 'Erbjudande: höstkampanj på Instagram — vill diskutera möte.',
        },
      ],
      timeline: ['B2B-erbjudande'],
      risk: 'Låg risk — affärsutveckling.',
      nextStep: 'Svara eller boka möte.',
    },
    'demo-ma-102': {
      name: 'Therese Falk',
      initials: 'TF',
      email: 'therese.falk@example.com',
      mailbox: 'marknad@hairtpclinic.com',
      mailboxLabel: 'Marknad',
      lane: 'Granska',
      laneTone: 'review',
      subject: 'Influencer vill samarbeta — har 80k följare i målgruppen.',
      preview: 'Influencer vill samarbeta — har 80k följare i målgruppen.',
      conversation: [
        {
          from: 'Therese Falk',
          tone: 'inbound',
          time: '15:42',
          text: 'Influencer vill samarbeta — har 80k följare i målgruppen.',
        },
      ],
      timeline: ['Samarbetsförfrågan'],
      risk: 'Medel risk — varumärkesgranskning.',
      nextStep: 'Granska tråden.',
    },
  };

  // Seedar P0-2-resolvern (app.js) så att demo-trådar
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
