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
      '</div>' +
      '</div>'
    );
  }

  /* ---- s-visit · active-visit ---- */
  function activeVisit(av) {
    var head = av && av.headMeta ? txt(av.headMeta) : 'Inget aktivt besök';
    var sub = av && av.inline ? txt(av.inline) : '· väntar check-in';
    var empty = !av || !(av.checkedInAt || av.startedAt || av.active);
    return (
      '<div class="active-visit' +
      (empty ? ' empty' : '') +
      '" id="s-visit"' +
      ' data-v9-section-link="active-visit" data-v12-open-module="s-visit">' +
      '<div class="av-head">' +
      '<div class="av-head-l">' +
      '<div class="av-kicker"><span class="pulse"></span>' +
      esc(head) +
      '</div>' +
      '<span class="av-title-inline">' +
      esc(sub) +
      '</span>' +
      '</div>' +
      '<button class="av-collapse" id="av-collapse-btn" aria-label="Fäll ut besök"></button>' +
      '</div>' +
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
    ctx = ctx || {};
    var card = ctx.bcard || ctx.card || {};
    var bundle = ctx.dossierBundle || null;

    var journey = call('buildJourneyFromState', [card, ctx.journalEntries, bundle], null);
    var av = call('buildActiveVisitFromBundle', [bundle], null);
    var warnData = call('buildCriticalWarnings', [card, ctx.journalEntries, bundle], null);
    var photos = call('buildPhotosFromDriveFiles', [ctx.driveFiles], null);
    var files = call('buildFilesFromDriveFiles', [ctx.driveFiles], null);
    var offers = call('buildOffersFromPayload', [card, bundle, ctx.commercialCase], null);
    var book = call('buildBookingsFromExtras', [card, card, bundle, ctx.occasionTimeline], null);
    var history = call('buildHistoryFromExtras', [card, card, bundle, ctx.occasionTimeline], null);
    var journals = call('buildJournalsFromEntries', [ctx.journalEntries], null);
    var comm = call('buildCommunicationFromState', [card, ctx.occasionTimeline, bundle], null);
    var econ = call('buildEconomyFromCard', [card], null);

    var patientId = card.id || card.patientId || (ctx.patient && ctx.patient.id);

    return (
      '<div class="v13-view" data-v13-canon="1">' +
      '<div class="shell" id="v13-rail">' +
      hero(card, journey) +
      activeVisit(av) +
      warnings(warnData) +
      smartNext(card) +
      bookings(book, patientId) +
      journeyMini(journey) +
      visitsHist(history) +
      docLatest(photos) +
      plan(offers) +
      documents(files, null) +
      photosSection(photos) +
      journal(journals) +
      communication(comm) +
      economy(econ) +
      recalls(patientId) +
      historySection(history) +
      insights(card) +
      '</div>' +
      '</div>'
    );
  }

  global.CcoV13View = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
