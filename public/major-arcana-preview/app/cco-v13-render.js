/**
 * V13 Kundvy · LILLA vyn (kompakt spalt) — renderare.
 *
 * Producerar HOGERSPALT-facit-strukturen (docs/facit/v13/
 * V13-HOGERSPALT-2026-08-24.html): en 340 px-shell med 17 sektioner i
 * facits ordning — det brådskande först (varningar, nästa steg,
 * bokningar), historik sist. Syskon till den STORA vyn
 * (WORKSPACE-facit) som inte är byggd än (se utredningen i
 * docs/handover/V13-STORA-VYN-UTREDNING-2026-08-26.md).
 *
 * Datan kommer uteslutande ur CcoV11RailAdapters 25 build*-funktioner.
 * data-v9-section-link / data-v12-open-module / data-v12-scroll-module
 * sätts som facit — patient-master-ui.js har redan hanterarna.
 *
 * Facits dokumentationsblock (context-note, spec-note, crumbs, toc …)
 * portas medvetet inte — det beskriver facit, det är inte design.
 */
(function (global) {
  'use strict';

  var A = global.CcoV11RailAdapters || {};

  function call(name, args, fallback) {
    try {
      if (A[name] && typeof A[name] === 'function') return A[name].apply(null, args);
    } catch (_error) {
      /* adapter får aldrig fälla vyn */
    }
    return fallback;
  }

  function txt(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function initials(name) {
    var parts = txt(name).split(/\s+/).filter(Boolean).slice(0, 2);
    return parts
      .map(function (p) {
        return p.charAt(0).toUpperCase();
      })
      .join('');
  }

  /* ---- dhead · s-hero ---- */
  function hero(card, journey) {
    var profile = call('buildProfileFromBcard', [card], null) || {};
    var name = txt(profile.name || card.name || card.displayName || 'Kund');
    var phone = txt(card.phone || card.mobile || card.phoneNumber);
    var email = txt(card.email);
    var city = txt(card.city || card.postalCity);
    var steps = journey && typeof journey.total === 'number' ? journey.total : 9;
    var cur = journey && typeof journey.cur === 'number' ? journey.cur : null;
    var kicker =
      cur != null && cur > 0
        ? 'Aktiv · steg ' + cur + ' av ' + steps
        : 'Steg ' + steps + ' · kundresa';
    var contact = [];
    if (phone) contact.push('<span class="icn">☎</span> ' + esc(phone));
    if (email) contact.push('<span class="icn">✉</span> ' + esc(email));
    if (city) contact.push('<span class="icn">⌂</span> ' + esc(city));
    var pid = txt(card.id || card.patientId || card.customerId);
    // Kund-ID kortas till 8 tecken + personnummer — samma form som
    // V12-canon (cco-v12-canon.js) och V11-railen redan visar i prod.
    if (pid) {
      contact.push(
        '<span class="id">Kund-ID: ' +
          esc(pid.slice(0, 8)) +
          (txt(card.personalNumber || card.ssn || card.personnummer)
            ? ' · ' + esc(txt(card.personalNumber || card.ssn || card.personnummer))
            : ' · personnr ej registrerat') +
          '</span>'
      );
    }

    // Tags — enbart ur riktig data, inga påhittade chips.
    // Varumärket läses ur card.tenantId/card.brand med samma regel som
    // resolvePatientBrand (cco-v9-customers-parity.js:1033), som redan
    // kör i produktion i V9: curatiio-tenant eller curatiio/ögonlock/
    // ortoped-behandlingar → Curatiio, annars Hair TP.
    var tenant = txt(card.tenantId || card.brand).toLowerCase();
    var treatments = arr(card.treatmentTypes)
      .map(function (t) {
        return txt(t).toLowerCase();
      })
      .join(' ');
    var isCuratiio =
      tenant.indexOf('curatiio') >= 0 ||
      treatments.indexOf('curatiio') >= 0 ||
      treatments.indexOf('ögonlock') >= 0 ||
      treatments.indexOf('ortoped') >= 0;
    var hdSigned = Boolean(
      card.healthDeclaration && (card.healthDeclaration.signedAt || card.healthDeclaration.signed)
    );
    // "Ny kund" följer patient-master-ui:s segmentregel: segmentHints.new
    // eller patientOrigin === 'new' — samma källa som listan använder.
    var isNew = Boolean(card.segmentHints && card.segmentHints.new) || card.patientOrigin === 'new';
    var tags = [];
    tags.push('<span class="tag info">' + (isCuratiio ? 'Curatiio' : 'Hair TP') + '</span>');
    if (!hdSigned) tags.push('<span class="tag warning">HD saknas</span>');
    if (isNew) tags.push('<span class="tag neutral">Ny kund</span>');

    var stepPill =
      cur != null && cur > 0
        ? '<span class="step-pill">⚑ Steg ' + cur + ' / ' + steps + '</span>'
        : '<span class="step-pill">⚑ Steg — / ' + steps + '</span>';

    return (
      '<div class="dhead" id="s-hero" data-v9-section-link="hero" data-v12-scroll-module="s-hero">' +
      '<div class="avatar">' +
      esc(initials(name)) +
      '</div>' +
      '<div class="head-body">' +
      '<div class="kicker">' +
      esc(kicker) +
      '</div>' +
      '<div class="name">' +
      esc(name) +
      '</div>' +
      '<div class="contact">' +
      contact.join('<br />') +
      '</div>' +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="head-badges">' +
      stepPill +
      '<button class="btn-edit-profile" data-v12-scroll-module="s-hero">Ändra profil</button>' +
      '</div>' +
      '<button class="btn-open-full" data-v13-open-full>Öppna fullvy →</button>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---- s-visit · active-visit (kollapsbar, alltid synlig) ---- */
  function activeVisit(av, card, health, book) {
    var head = av && av.headMeta ? txt(av.headMeta) : 'Inget aktivt besök';
    var sub = av && av.inline ? txt(av.inline) : '· väntar check-in';
    var empty = !av || !(av.checkedInAt || av.startedAt || av.active);

    // Tom-tillstånd enligt facit: förklaring + nästa väntande + CTA.
    var nextItems = arr(book && book.items).filter(function (b) {
      return b && (b.upcoming || /upcoming|bekräftad|bokad/i.test(txt(b.status || b.meta || '')));
    });
    var next = nextItems.length ? nextItems[0] : null;
    var nextRow = next
      ? '<div class="next-wait"><span class="lbl">Nästa väntande</span>' +
        '<span class="val">' +
        esc(txt(next.title || next.serviceLabel || 'Bokning')) +
        (next.whenLong ? ' · ' + esc(txt(next.whenLong)) : '') +
        '</span></div>'
      : '';

    // Preflight-tidslinje — status enbart ur riktig data, annars todo.
    var hdSigned = Boolean(health && (health.signedAt || health.signed));
    var booked = arr(book && book.items).length > 0;
    var checkedIn = Boolean(av && (av.checkedInAt || av.active));
    function tnode(cls, label) {
      return (
        '<div class="av-tnode ' +
        cls +
        '"><span class="dot"></span>' +
        '<span class="t">' +
        label +
        '</span></div>'
      );
    }
    var timeline =
      '<div class="av-timeline" style="margin-top: 10px">' +
      tnode(booked ? 'done' : 'todo', 'bokad<br />' + (booked ? 'ja' : '—')) +
      '<div class="av-tline ' +
      (hdSigned ? 'done' : 'todo') +
      '"></div>' +
      tnode(
        hdSigned ? 'done' : booked ? 'active' : 'todo',
        'HD<br />' + (hdSigned ? 'signerad' : 'saknas')
      ) +
      '<div class="av-tline todo"></div>' +
      tnode(checkedIn ? 'done' : 'todo', 'check-in<br />' + (checkedIn ? 'klar' : '—')) +
      '<div class="av-tline todo"></div>' +
      tnode('todo', 'journal<br />—') +
      '<div class="av-tline todo"></div>' +
      tnode('todo', 'klart<br />—') +
      '</div>';

    var body =
      '<div class="av-body">' +
      '<div class="av-empty">' +
      '<div class="empty-title">' +
      (empty ? 'Ingen check-in idag' : esc(head)) +
      '</div>' +
      (empty
        ? 'När kunden checkas in visas här behandlare, rum, mini-timeline och snabbstart-knappar.'
        : '') +
      nextRow +
      '<button class="av-empty-cta" data-v11-active-visit-action="followup"' +
      ' data-v12-scroll-module="s-visit">⚡ Förbered besök</button>' +
      '</div>' +
      timeline +
      '<div class="av-actions">' +
      '<button class="av-btn primary" data-v11-active-visit-action="photo">📷 Foto</button>' +
      '<button class="av-btn sec" data-v11-active-visit-action="notes">✏️ Ant.</button>' +
      '<button class="av-btn tert" data-v11-active-visit-action="complete">✓ Slut.</button>' +
      '</div>' +
      '</div>';

    return (
      '<div class="active-visit' +
      (empty ? ' empty' : '') +
      '" id="s-visit"' +
      ' data-v9-section-link="active-visit" data-v12-open-module="s-visit">' +
      '<div class="av-head" onclick="CcoV13View.toggleVisit(this.closest(\'.active-visit\'))">' +
      '<div class="av-head-l">' +
      '<div class="av-kicker"><span class="pulse"></span>' +
      esc(head) +
      '</div>' +
      '<span class="av-title-inline">' +
      esc(sub) +
      '</span>' +
      '</div>' +
      '<button class="av-collapse" id="av-collapse-btn" aria-label="Fäll ihop/expandera">▾</button>' +
      '</div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-warn · warn-block ---- */
  function warnings(warn) {
    var items = arr(warn && warn.items);
    var rows = items
      .map(function (w) {
        return (
          '<div class="warn-row"><span class="icn">!</span>' +
          '<div class="body"><div class="what">' +
          esc(txt(w.what)) +
          '</div>' +
          (w.why ? '<div class="why">' + esc(txt(w.why)) + '</div>' : '') +
          '</div></div>'
        );
      })
      .join('');
    return (
      '<div class="warn-block" id="s-warn" data-v9-section-link="warnings" data-v12-open-module="s-warn">' +
      '<div class="warn-block-head"><span>Kritiska varningar</span>' +
      '<span class="count-badge">' +
      items.length +
      '</span></div>' +
      (rows || '<div class="empty-line">Inga kritiska varningar</div>') +
      '</div>'
    );
  }

  /* ---- s-next ---- */
  function smartNext(card) {
    var rows = arr(call('buildSmartNextSteps', [card, 3], null));
    if (!rows.length) {
      var single = call('buildSmartNextStep', [card], null);
      if (single && single.what) rows = [single];
    }
    var body = rows.length
      ? rows
          .map(function (row, i) {
            return (
              '<div class="next-row"><div class="what">' +
              esc(txt(row.what)) +
              '</div>' +
              '<button class="btn-action' +
              (i ? ' secondary' : '') +
              '" data-kk-sig="' +
              esc(row.ruleId) +
              '">' +
              esc(txt(row.ctaLabel) || 'Åtgärda') +
              '</button></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga smarta nästa steg just nu</div>';
    return (
      '<div class="sec" id="s-next" data-v9-section-link="smart-next" data-v12-scroll-module="s-warn">' +
      '<div class="sec-label"><span>Smart nästa steg</span><span class="count warn">' +
      rows.length +
      '</span></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-book ---- */
  function bookings(book, patientId) {
    var items = arr(book && book.items).slice(0, 2);
    var body = items.length
      ? items
          .map(function (b) {
            return (
              '<div class="book-row"><div>' +
              '<div class="book-title">' +
              esc(txt(b.title || b.serviceLabel || 'Bokning')) +
              '</div>' +
              '<div class="book-meta">' +
              esc(txt(b.whenLong || b.meta || '')) +
              '</div>' +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga kommande bokningar · risk att kunden tappas efter 11 mån tyst.</div>';
    return (
      '<div class="sec" id="s-book" data-v9-section-link="bookings" data-v12-open-module="s-hist">' +
      '<div class="sec-label"><span>Kommande bokningar</span><span class="count danger">' +
      items.length +
      '</span></div>' +
      body +
      '<div style="margin-top: 6px; display: flex; gap: 5px">' +
      '<button class="btn-action" style="flex: 1" data-kk-ord48-open-calendar data-patient-id="' +
      esc(patientId || '') +
      '">Boka nu</button>' +
      '<button class="btn-action secondary">Skicka SMS</button>' +
      '</div></div>'
    );
  }

  /* ---- s-resa · journey-mini ---- */
  function journeyMini(journey) {
    var total = journey && typeof journey.total === 'number' ? journey.total : 9;
    var cur = journey && typeof journey.cur === 'number' ? journey.cur : 0;
    var done = journey && typeof journey.done === 'number' ? journey.done : Math.max(0, cur - 1);
    var pct = journey && typeof journey.pct === 'number' ? journey.pct : 0;
    return (
      '<div class="sec" id="s-resa" data-v9-section-link="journey" data-v12-scroll-module="s-resa">' +
      '<div class="journey-head">' +
      '<div class="sec-label"><span>Kundresa · mini</span></div>' +
      '<span class="step-badge">Steg ' +
      (cur || 0) +
      ' av ' +
      total +
      '</span>' +
      '</div>' +
      '<div class="journey-progress">' +
      '<span>' +
      done +
      ' klara · ' +
      (cur > 0 ? '1 pågår' : '0 pågår') +
      ' · ' +
      (total - (cur > 0 ? cur : 0)) +
      ' kommande</span>' +
      '<span class="journey-bar"></span>' +
      '<span class="journey-pct">' +
      Math.round(pct) +
      ' %</span>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---- s-visits-hist ---- */
  function visitsHist(history) {
    var items = arr(history && history.items).slice(0, 3);
    var body = items.length
      ? items
          .map(function (h) {
            var title = txt(h.title || h.serviceLabel || 'Besök');
            var meta = txt(h.whenLong || h.meta || '');
            var incomplete = meta.indexOf('journal') >= 0 || h.incomplete;
            return (
              '<div class="hist-row' +
              (incomplete ? ' incomplete' : '') +
              '">' +
              '<div class="book-date"><span class="d">—</span></div>' +
              '<div><div class="book-title">' +
              esc(title) +
              '</div>' +
              '<div class="book-meta">' +
              esc(meta) +
              '</div></div>' +
              (incomplete ? '<span class="chip warn">Ofullst.</span>' : '') +
              '</div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga besök att visa · nästa väntar på HD-signering.</div>';
    return (
      '<div class="sec" id="s-visits-hist" data-v9-section-link="visits" data-v12-scroll-module="s-hist">' +
      '<div class="sec-label"><span>Besök · tillfällen</span><span class="count">' +
      items.length +
      '</span></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-doc-latest ---- */
  function docLatest(photos) {
    var items = arr(photos && photos.items)
      .filter(function (item) {
        return item && item.isImage !== false;
      })
      .slice(0, 3);
    var body = items.length
      ? '<div class="photo-grid">' +
        items
          .map(function (item, i) {
            var src = txt(item.view || item.href || item.url);
            var label = txt(item.dateLabel || item.capturedLabel) || 'Foto';
            var inner = src
              ? '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(item.name || '') + '" />'
              : '<span class="lbl">' + esc(label) + '</span>';
            return '<div class="photo-tile p' + (i + 1) + '">' + inner + '</div>';
          })
          .join('') +
        '</div>'
      : '<div class="empty-line">Ingen fotodokumentation ännu</div>';
    return (
      '<div class="sec" id="s-doc-latest" data-v9-section-link="latest-visit-docs" data-v12-scroll-module="s-foto">' +
      '<div class="sec-label"><span>Senaste besök · dokumentation</span>' +
      '<a class="open" data-v12-scroll-module="s-foto">Öppna →</a></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-plan ---- */
  function plan(offers) {
    var items = arr(offers && offers.items).slice(0, 2);
    var body = items.length
      ? items
          .map(function (o) {
            var title = txt(o.title || o.label || o.name);
            var meta = txt(o.meta || o.subtitle || o.priceLabel || '');
            return (
              '<div class="q-row"><div class="q-left">' +
              '<span class="q-pill mute">PLAN</span>' +
              '<div class="q-info"><div class="q-title">' +
              esc(title) +
              '</div>' +
              (meta ? '<div class="q-meta">' + esc(meta) + '</div>' : '') +
              '</div></div></div>'
            );
          })
          .join('')
      : '<div class="q-row"><div class="q-left"><span class="q-pill mute">PLAN</span>' +
        '<div class="q-info"><div class="q-title">Ingen behandlingsplan ännu</div>' +
        '<div class="q-meta">Skapas i steg 5</div></div></div></div>';
    return (
      '<div class="sec" id="s-plan" data-v9-section-link="quotes" data-v12-open-module="s-plan">' +
      '<div class="sec-label"><span>Offertor / Plan</span><span class="count">' +
      items.length +
      '</span></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-dok ---- */
  function documents(files, autoDocs) {
    var items = arr(files && files.items).slice(0, 3);
    var body = items.length
      ? items
          .map(function (d) {
            var badge = txt(d.badge || d.kind || 'DOC');
            return (
              '<div class="doc-row"><span class="doc-ic ' +
              (String(badge).toLowerCase() === 'pdf' ? 'pdf' : '') +
              '">' +
              esc(badge) +
              '</span>' +
              '<div><div class="doc-name">' +
              esc(txt(d.name)) +
              '</div>' +
              (d.dateLabel ? '<div class="doc-meta">' + esc(txt(d.dateLabel)) + '</div>' : '') +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga dokument</div>';
    return (
      '<div class="sec" id="s-dok" data-v9-section-link="documents" data-v12-open-module="s-dok">' +
      '<div class="sec-label"><span>Dokument</span><span class="count">' +
      items.length +
      '</span></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-foto ---- */
  function photosSection(photos) {
    var items = arr(photos && photos.items)
      .filter(function (item) {
        return item && item.isImage !== false;
      })
      .slice(0, 6);
    var body = items.length
      ? '<div class="photo-grid">' +
        items
          .map(function (item, i) {
            var src = txt(item.view || item.href || item.url);
            var label = txt(item.dateLabel || item.capturedLabel) || 'Foto';
            var inner = src
              ? '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(item.name || '') + '" />'
              : '<span class="lbl">' + esc(label) + '</span>';
            return '<div class="photo-tile p' + ((i % 4) + 1) + '">' + inner + '</div>';
          })
          .join('') +
        '</div>'
      : '<div class="empty-line">Inga foton</div>';
    return (
      '<div class="sec" id="s-foto" data-v9-section-link="photos" data-v12-open-module="s-foto">' +
      '<div class="sec-label"><span>Foton</span><span class="count">' +
      items.length +
      '</span></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-journal ---- */
  function journal(journals) {
    var items = arr(journals && journals.items).slice(0, 3);
    var body = items.length
      ? items
          .map(function (j) {
            var title = txt(j.title || j.summary || j.note || 'Journal');
            var meta = txt(j.meta || j.whenLong || '');
            return (
              '<div class="j-row"><span class="j-mark"></span>' +
              '<span class="j-name">' +
              esc(title) +
              '</span>' +
              (meta ? '<span class="j-meta">' + esc(meta) + '</span>' : '') +
              '</div>'
            );
          })
          .join('')
      : '<div class="j-row"><span class="j-mark miss">!</span>' +
        '<span class="j-name">Inga journalanteckningar ännu</span></div>';
    return (
      '<div class="sec" id="s-journal" data-v9-section-link="journal" data-v12-open-module="s-journal">' +
      '<div class="sec-label"><span>Journal + anteckningar</span>' +
      '<a class="open" data-v12-scroll-module="s-journal">+ Ny →</a></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-komm ---- */
  function communication(comm) {
    var items = arr(comm && comm.items).slice(0, 3);
    var body = items.length
      ? items
          .map(function (c) {
            var preview = txt(c.preview || c.body || c.meta);
            return (
              '<div class="comm-row"><span class="comm-icn out">✉</span>' +
              '<div class="comm-text"><b>' +
              esc(txt(c.title || c.subject || 'Meddelande')) +
              '</b>' +
              (preview ? '<div class="comm-preview">' + esc(preview) + '</div>' : '') +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Ingen kommunikation</div>';
    return (
      '<div class="sec" id="s-komm" data-v9-section-link="communication" data-v12-open-module="s-komm">' +
      '<div class="sec-label"><span>Kommunikation</span><span class="count warn">' +
      items.length +
      '</span></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-eko ---- */
  function economy(econ) {
    var items = arr(econ && econ.items).slice(0, 4);
    var body = items.length
      ? '<div class="eko-grid">' +
        items
          .map(function (c) {
            return (
              '<div class="eko-cell"><div class="lbl">' +
              esc(txt(c.label)) +
              '</div>' +
              '<div class="val">' +
              esc(txt(c.value)) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '<div class="empty-line">Ingen ekonomidata</div>';
    return (
      '<div class="sec" id="s-eko" data-v9-section-link="economy" data-v12-open-module="s-eko">' +
      '<div class="sec-label"><span>Ekonomi</span>' +
      '<a class="open" data-v12-scroll-module="s-eko">Fortnox →</a></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-uppf ---- */
  function recalls(patientId) {
    // Recall-schema = standard klinisk kadens (ej fabricerad patientdata).
    var schema = [
      ['3', 'Efterkontroll', 'Snabb-check · 15 min'],
      ['6', 'Resultatbild', 'Före/efter-par mot baseline'],
      ['12', 'Utvärdering', 'Slututvärdering · retention-signal'],
    ];
    return (
      '<div class="sec" id="s-uppf" data-v9-section-link="recalls" data-v12-open-module="s-uppf">' +
      '<div class="sec-label"><span>Uppföljning · efter avslutad resa</span></div>' +
      schema
        .map(function (r) {
          return (
            '<div class="recall-row"><div class="recall-date">mån<span class="d">' +
            esc(r[0]) +
            '</span></div>' +
            '<div><div class="recall-title">' +
            esc(r[1]) +
            '</div>' +
            '<div class="recall-meta">' +
            esc(r[2]) +
            '</div></div>' +
            '<span class="chip neutral">Ej sch.</span>' +
            '<button class="j-btn primary" data-kk-ord48-open-calendar data-patient-id="' +
            esc(patientId || '') +
            '">Boka</button></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /* ---- s-hist ---- */
  function historySection(history) {
    var items = arr(history && history.items).slice(0, 2);
    var body = items.length
      ? items
          .map(function (h) {
            var meta = txt(h.whenLong || h.meta || '');
            var incomplete = meta.indexOf('journal') >= 0 || h.incomplete;
            return (
              '<div class="hist-row' +
              (incomplete ? ' incomplete' : '') +
              '">' +
              '<div class="book-date"><span class="d">—</span></div>' +
              '<div><div class="book-title">' +
              esc(txt(h.title || h.serviceLabel || 'Besök')) +
              '</div>' +
              '<div class="book-meta">' +
              esc(meta) +
              '</div></div>' +
              (incomplete ? '<span class="chip warn">Ofullständig</span>' : '') +
              '</div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga tidigare besök</div>';
    return (
      '<div class="sec" id="s-hist" data-v9-section-link="history" data-v12-open-module="s-hist">' +
      '<div class="sec-label"><span>Historik · besök</span>' +
      '<a class="open" data-v12-open-module="s-hist">Alla →</a></div>' +
      body +
      '</div>'
    );
  }

  /* ---- s-insights ---- */
  function insights(card) {
    var data = call('buildInsightsFromSignals', [card], { items: [], count: 0 });
    var items = arr(data && data.items)
      .filter(function (item) {
        return item && item.tone !== 'blocker' && item.tone !== 'review';
      })
      .slice(0, 2);
    var body = items.length
      ? items
          .map(function (item) {
            return (
              '<div class="insight-row"><b>' +
              esc(txt(item.title || item.what)) +
              ':</b> ' +
              esc(txt(item.text)) +
              '<span class="when">Signal</span></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga insikter ännu</div>';
    return (
      '<div class="sec" id="s-insights" data-v9-section-link="insights" data-v12-scroll-module="s-warn">' +
      '<div class="sec-label"><span>Insikter · topp 2</span></div>' +
      body +
      '</div>'
    );
  }

  function render(ctx) {
    var data = assemble(ctx);
    return (
      '<div class="v13-view" data-v13-canon="1">' +
      '<div class="shell" id="v13-rail">' +
      hero(data.card, data.journey) +
      activeVisit(data.av, data.card, data.health, data.book) +
      warnings(data.warnData) +
      smartNext(data.card) +
      bookings(data.book, data.patientId) +
      journeyMini(data.journey) +
      visitsHist(data.history) +
      docLatest(data.photos) +
      plan(data.offers) +
      documents(data.files, null) +
      photosSection(data.photos) +
      journal(data.journals) +
      communication(data.comm) +
      economy(data.econ) +
      recalls(data.patientId) +
      historySection(data.history) +
      insights(data.card) +
      '</div>' +
      '</div>'
    );
  }

  /**
   * STORA vyn (ORD-113, läge A). Renderar WORKSPACE-facit-strukturen:
   * .workspace med <main class="main"> (12 sektioner i facitordning +
   * Hälsa efter varningarna enligt ORD-106-beslutet) och <aside
   * class="rail"> (fem extra sektioner). Sektionsmarkupen återanvänds
   * från CcoV12Canon.sections — samma adapterdata, facitlayout via
   * cco-v13-workspace.css (.v13-workspace-shell).
   */
  function renderFull(ctx) {
    var data = assemble(ctx);
    var C = global.CcoV12Canon && global.CcoV12Canon.sections;
    if (!C) return '';

    // Hälsa utan bokstav (ORD-106 §7): rutin under undantag.
    var halsa = (C.s4(data.health) || '').replace(
      '<span class="sec-num">04</span>',
      '<span class="sec-num"></span>'
    );

    var main =
      '<main class="main">' +
      C.s1(data.card, data.journey) +
      C.stats(data.card, data.econ, data.bundle) +
      C.s2(data.av) +
      C.s3(data.warnData) +
      halsa +
      C.s5(data.journey, data.av, data.nextStep, data.photos, data.health, data.stepAssets) +
      C.sJournal(data.journals, data.ctx.journalEntries) +
      C.s7(data.photos, data.ctx.visitSegments, data.patientId) +
      C.sPlan(data.offers, data.ctx.commercialCase, data.patientId) +
      C.s9(data.files, data.offers, data.autoDocs, data.patientId) +
      C.s10(data.comm, data.card, data.ctx.conversationThreads) +
      C.s11(data.econ, data.invoices, data.patientId) +
      C.uppfoljning(data.insights, data.patientId) +
      C.histSection(data.bundle, data.patientId) +
      '</main>';

    var rail =
      '<aside class="rail" aria-label="Högerspalt">' +
      smartNext(data.card) +
      insights(data.card) +
      bookings(data.book, data.patientId) +
      docLatest(data.photos) +
      visitsHist(data.history) +
      '</aside>';

    return (
      '<div class="v13-workspace-view" data-v13-canon="1">' +
      '<div class="v13-fullview-bar">' +
      '<button class="btn-back" data-v13-close-full>← Tillbaka till listan</button>' +
      '</div>' +
      '<div class="workspace">' +
      main +
      rail +
      '</div>' +
      '</div>'
    );
  }

  function assemble(ctx) {
    ctx = ctx || {};
    var card = ctx.bcard || ctx.card || {};
    var bundle = ctx.dossierBundle || null;
    return {
      ctx: ctx,
      card: card,
      bundle: bundle,
      journey: call('buildJourneyFromState', [card, ctx.journalEntries, bundle], null),
      av: call('buildActiveVisitFromBundle', [bundle], null),
      health: call('buildHealthPreview', [card, bundle], null),
      warnData: call('buildCriticalWarnings', [card, ctx.journalEntries, bundle], null),
      photos: call('buildPhotosFromDriveFiles', [ctx.driveFiles], null),
      files: call('buildFilesFromDriveFiles', [ctx.driveFiles], null),
      offers: call('buildOffersFromPayload', [card, bundle, ctx.commercialCase], null),
      autoDocs: call('buildAutoDocsFromPayload', [card, bundle], null),
      book: call('buildBookingsFromExtras', [card, card, bundle, ctx.occasionTimeline], null),
      history: call('buildHistoryFromExtras', [card, card, bundle, ctx.occasionTimeline], null),
      journals: call('buildJournalsFromEntries', [ctx.journalEntries], null),
      comm: call('buildCommunicationFromState', [card, ctx.occasionTimeline, bundle], null),
      econ: call('buildEconomyFromCard', [card], null),
      invoices: call('buildEconomyInvoices', [bundle && bundle.paymentHistory], null),
      nextStep: call('buildSmartNextStep', [card], null),
      insights: call('buildInsightsFromSignals', [card], null),
      recentEvents: call('buildRecentEvents', [card, bundle, ctx.journalEntries], []),
      stepAssets:
        ctx.stepAssets || call('buildStepAssets', [null, ctx.driveFiles, ctx.journalEntries], {}),
      patientId: card.id || card.patientId || (ctx.patient && ctx.patient.id),
    };
  }

  // Kollaps i av-head. Facit-regeln: sektionen är alltid synlig — bara
  // kroppen (av-body) fälls ihop. Knappen byter ▾/▸.
  function toggleVisit(section) {
    if (!section) return;
    var collapsed = section.classList.toggle('collapsed');
    var btn = section.querySelector('.av-collapse');
    if (btn) btn.textContent = collapsed ? '▸' : '▾';
  }

  global.CcoV13View = { render: render, renderFull: renderFull, toggleVisit: toggleVisit };
})(typeof window !== 'undefined' ? window : globalThis);
