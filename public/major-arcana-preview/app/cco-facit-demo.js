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
        blockers: [{ label: 'Friskförsäkran signering' }, { label: 'Före-bild zonkarta' }],
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
    },
    driveFiles: [],
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
    if (!global.CcoV12Canon) return;
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

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () {
      global.setTimeout(openRail, 600);
    });
  } else {
    global.setTimeout(openRail, 600);
  }
})(typeof window !== 'undefined' ? window : globalThis);
