/**
 * Facit-demo (a1) — fristående demo-kund för att SE kundvyn fullmatad live.
 *
 * Aktiveras ENBART via ?facitdemo=1. Renderar lilla dossier-railen
 * (CcoV11RailKomplett) och, vid sektionsklick, stora kundvyn (CcoV12Canon)
 * med en HÅRDKODAD fullmatad fixture (Anna Karlsson, som facit). Rör ingen
 * riktig kunddata, inga backend-anrop — bara de riktiga renderarna + CSS.
 *
 * Syfte: visa att rail/canon är byggda och fyller i korrekt när datan finns.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  function demoOn() {
    try {
      return new URLSearchParams(global.location.search || '').get('facitdemo') === '1';
    } catch (_e) {
      return false;
    }
  }
  if (!demoOn()) return;

  // ---- Fullmatad fixture (samma data som facit Anna Karlsson) ----
  var card = {
    patientId: 'facit-demo-anna',
    displayName: 'Anna Karlsson',
    age: 32,
    primaryPhone: '070-123 45 67',
    primaryEmail: 'anna.k@exempel.se',
    address: 'Vasagatan 12, 111 20 Stockholm',
    city: 'Vasagatan 12, Stockholm',
    tags: ['VIP', 'PRP-hår', 'Botox', 'Återkommande', 'Allergi · Penicillin'],
    totalValue: '38 400',
    visitsThisYear: 12,
    // Ekonomi-fält som buildEconomyFromCard/buildEconomyFields faktiskt läser:
    // ltv (lifetimeValue) → Total intäkt + Snitt/besök (ltv/visitCount),
    // lifetimeValueLabel → Livstidsvärde, outstandingBalance → Utestående.
    lifetimeValue: 38400,
    lifetimeValueLabel: '~58 000',
    visitCount: 3,
    outstandingBalance: '0 kr',
    // Automation-signaler driver B (smart info), D (kritiska varningar),
    // G (smart nästa steg) och R (insikter) — alla ur samma signal-källa.
    automationSignals: [
      {
        ruleId: 'customer.missing_operation_day_insurance',
        status: 'active',
        risk: 'blocker',
        what: 'Friskförsäkran saknas inför PRP 2/3 idag',
        why: 'Krävs före ingrepp — skicka för signering nu.',
      },
      {
        ruleId: 'customer.missing_photo_consent',
        status: 'active',
        risk: 'review',
        what: 'Foto-samtycke ej markerat',
        why: 'Bekräfta före före/efter-dokumentation.',
      },
      {
        ruleId: 'customer.ready_for_treatment',
        status: 'active',
        risk: 'opportunity',
        what: 'Boka uppföljning · 6 mån resultatbild',
        why: 'Stark respons på behandling 1 — föreslå uppföljning och resultatfoto.',
      },
    ],
    healthDeclaration: {
      signedAt: '2026-06-12',
      allergies: ['Penicillin'],
      medications: 'Levaxin 50µg, Vitamin D',
      flags: [
        { text: 'Blödarsjukdom', level: 'amber' },
        { text: 'Pågående hårbehandling', level: 'amber' },
      ],
      answers: [
        {
          key: 'allergi',
          label: 'Allergi mot läkemedel',
          value: 'Ja',
          detail: 'Penicillin',
          risk: 'red',
        },
        { key: 'medicin', label: 'Pågående mediciner', value: 'Ja', detail: '2 st', risk: 'amber' },
        { key: 'blodfortunnande', label: 'Blodförtunnande', value: 'Nej', detail: '', risk: '' },
        { key: 'blodarsjukdom', label: 'Blödarsjukdom', value: 'Ja', detail: '', risk: 'amber' },
        { key: 'gravid', label: 'Gravid eller ammar', value: 'Nej', detail: '', risk: '' },
        { key: 'hjartkarl', label: 'Hjärt-/kärlsjukdom', value: 'Nej', detail: '', risk: '' },
        { key: 'diabetes', label: 'Diabetes', value: 'Nej', detail: '', risk: '' },
        { key: 'tobak', label: 'Tobak/nikotin', value: 'Nej', detail: '', risk: '' },
        {
          key: 'harbehandling',
          label: 'Pågående hårbehandling',
          value: 'Ja',
          detail: '',
          risk: 'amber',
        },
      ],
    },
    allergies: ['Penicillin'],
  };
  var ctx = {
    card: card,
    bcard: card,
    journalEntries: [
      {
        title: 'PRP-protokoll 2/3 · utkast',
        status: 'draft',
        dateLabel: '21 jun',
        author: 'Erik Holm',
      },
      {
        title: 'PRP-protokoll 1/3',
        status: 'signed',
        dateLabel: '5 maj',
        signedAt: '2026-05-05T11:20:00Z',
        author: 'Erik Holm',
      },
      {
        title: 'Konsultationsjournal',
        status: 'signed',
        dateLabel: '11 apr',
        signedAt: '2026-04-11T09:30:00Z',
        author: 'Erik Holm',
      },
      {
        journalType: 'note',
        type: 'note',
        note: 'Bra svar på behandling 1, ingen smärta. Påbörjar fas 2 enligt plan.',
        dateLabel: '5 maj 2026',
        author: 'Erik Holm',
      },
    ],
    dossierBundle: {
      card: card,
      activeVisit: {
        visible: true,
        state: 'in_progress',
        checkedInAt: '2026-06-25T14:30:00Z',
        serviceLabel: 'PRP-behandling 2/3',
        practitionerLabel: 'Erik Holm',
        room: 'Rum 2',
        blockers: [
          { label: 'Friskförsäkran signering' },
          { label: 'Före-bild zonkarta', tone: 'warn', chipLabel: 'Tas under besöket' },
        ],
      },
      upcomingBookings: [
        { title: 'PRP 3/3', dayLabel: '18', timeLabel: '14:30', practitioner: 'Erik Holm' },
      ],
      historyBookings: [
        { title: 'PRP 1/3', dayLabel: '05' },
        { title: 'Konsultation', dayLabel: '11' },
      ],
      paymentHistory: [
        {
          id: 'p1',
          dateIso: '2026-05-05T15:00:00Z',
          method: 'invoice',
          ref: 'F-1042',
          amountLabel: '6 400 kr',
          status: 'paid',
        },
      ],
      communicationMessages: [
        {
          id: 'm1',
          type: 'mail',
          direction: 'in',
          subject: 'Re: PRP-bekräftelse',
          from: 'anna.k@exempel.se',
          preview: 'Hej! Tack, jag bekräftar tiden den 18:e. Ska jag undvika något innan?',
          occurredAt: '2026-05-18T14:20:00Z',
        },
        {
          id: 'm2',
          type: 'mail',
          direction: 'out',
          subject: 'Bokningsbekräftelse PRP 3/3',
          from: 'klinik@hairtpclinic.com',
          preview: 'Din tid är bokad 18 jun 14:30. Välkommen! Kom 10 min innan.',
          occurredAt: '2026-05-17T09:00:00Z',
        },
        {
          id: 'm3',
          type: 'sms',
          direction: 'out',
          subject: '',
          preview: 'Påminnelse: PRP 11:15 imorgon, friskförsäkran krävs.',
          occurredAt: '2026-05-19T09:00:00Z',
        },
      ],
      offers: [
        {
          kind: 'TP',
          title: 'Offert · TP',
          dateLabel: '28 maj 2026',
          amount: '38 400 kr',
          status: 'accepted',
          statusLabel: 'Accepterad',
        },
        {
          kind: 'PRP',
          title: 'Offert · PRP hår',
          dateLabel: '11 apr 2026',
          amount: '12 000 kr',
          status: 'expired',
          statusLabel: 'Utgången',
        },
      ],
    },
    driveFiles: [
      {
        id: 'f1',
        name: 'PRP-före-scalp.jpg',
        fileType: 'image',
        category: 'photo_before',
        capturedAt: '2026-03-09',
      },
      {
        id: 'f2',
        name: 'PRP-efter-scalp.jpg',
        fileType: 'image',
        category: 'photo_after',
        capturedAt: '2026-05-05',
      },
      {
        id: 'f3',
        name: 'Hälsodekl. signerad.pdf',
        fileType: 'document',
        mimeType: 'application/pdf',
        documentDate: '12 maj',
        status: 'Klar',
      },
      {
        id: 'f4',
        name: 'Friskförsäkran.pdf',
        fileType: 'document',
        mimeType: 'application/pdf',
        documentDate: 'Utkast · ej skickat',
        status: 'Vänta sign',
      },
      {
        id: 'f5',
        name: 'Eftervårdsmall PRP.docx',
        fileType: 'document',
        mimeType: 'application/vnd.openxmlformats',
        sourceSystem: 'auto',
        documentDate: 'Auto-genererad',
        status: 'Auto',
      },
      {
        id: 'f6',
        name: 'Bilagor riskbedömning.xlsx',
        fileType: 'document',
        mimeType: 'application/vnd.ms-excel',
        documentDate: '12 maj',
        status: 'Intern',
      },
    ],
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var SEC_MODULE = {
    profil: 'current-state',
    compliance: 'warnings',
    halsa: 'health',
    journey: 'journey',
    journal: 'journal',
    foto: 'photos',
    upcoming: 'bookings',
    historik: 'bookings',
    filer: 'documents',
    avtal: 'documents',
    ekonomi: 'economy',
  };

  function host(title) {
    var h = doc.createElement('div');
    h.style.cssText =
      'position:fixed;inset:0;z-index:120000;overflow:auto;background:#f1ebe1;-webkit-overflow-scrolling:touch';
    var bar = doc.createElement('div');
    bar.style.cssText =
      'position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;' +
      'padding:10px 16px;background:rgba(41,36,31,.92);color:#fff;font:700 13px Inter,sans-serif';
    bar.innerHTML =
      '<span>' +
      esc(title) +
      '</span>' +
      '<button type="button" style="border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.92);' +
      'color:#2c2218;border-radius:999px;padding:6px 14px;font:700 12px Inter,sans-serif;cursor:pointer">Stäng</button>';
    bar.querySelector('button').addEventListener('click', function () {
      h.remove();
    });
    h.appendChild(bar);
    var body = doc.createElement('div');
    body.style.cssText = 'padding:18px';
    h.appendChild(body);
    doc.body.appendChild(h);
    return body;
  }

  function openCanon(sectionModule) {
    if (!global.CcoV12Canon) {
      global.setTimeout(function () {
        openCanon(sectionModule);
      }, 400);
      return;
    }
    var body = host('Facit-demo · STOR kundvy (CONTENT-CANON) · Anna Karlsson');
    body.innerHTML = global.CcoV12Canon.render(ctx);
    if (sectionModule) {
      var sel = '[data-v12-module="' + sectionModule + '"]';
      global.setTimeout(function () {
        var el = body.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  }

  function openRail() {
    if (!global.CcoV11RailKomplett) {
      global.setTimeout(openRail, 400);
      return;
    }
    var body = host('Facit-demo · LITEN dossier-rail (HÖGERSPALT) · klicka en sektion → stor vy');
    body.innerHTML = global.CcoV11RailKomplett.render(ctx);
    body.addEventListener('click', function (ev) {
      var sec = ev.target.closest('[data-v9-section-link]');
      if (!sec) return;
      ev.preventDefault();
      var slug = sec.getAttribute('data-v9-section-link');
      openCanon(SEC_MODULE[slug] || 'current-state');
    });
  }

  // Direkt-läge: ?facitdemo=1&vy=stor (eller big/canon) öppnar STORA vyn direkt,
  // annars lilla railen först (klick på sektion → stora vyn).
  function bigViewWanted() {
    try {
      var v = String(
        new URLSearchParams(global.location.search || '').get('vy') || ''
      ).toLowerCase();
      return v === 'stor' || v === 'big' || v === 'canon';
    } catch (_e) {
      return false;
    }
  }
  function start() {
    if (bigViewWanted()) {
      openCanon(null);
    } else {
      openRail();
    }
  }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () {
      global.setTimeout(start, 600);
    });
  } else {
    global.setTimeout(start, 600);
  }
})(typeof window !== 'undefined' ? window : globalThis);
