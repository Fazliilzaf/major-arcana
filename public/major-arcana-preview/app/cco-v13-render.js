/**
 * V13 Kundvy — renderare (opt-in, default OFF via cco-v13-flag.js).
 *
 * Bygger på samma 25 exporterade CcoV11RailAdapters-buildfunktioner som V12.
 * Sektionsmarkupen återanvänds från CcoV12Canon.sections (additivt export) —
 * V13 komponerar dem i facit-ordning (docs/facit/v13/):
 *
 *   ◐ s-visit · A s-warn · [Hälsa — egen sektion, beslut ORD-106 avsnitt 7]
 *   B s-resa · C s-journal · D s-foto · E s-plan · F s-dok · G s-komm
 *   H s-eko · I s-uppf · J s-hist
 *
 * Högerspalten: s-next, s-insights, s-book, s-doc-latest, s-visits-hist
 * (alla bygger på befintliga adaptrar; de fem renderarna är nya men datan
 * kommer ur samma build*-funktioner).
 *
 * Hälsa saknar bokstav i facit-systemet — sec-num lämnas tom (beslut:
 * ingen egen bokstav, rutin under undantag).
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

  /* ---- Högerspalt: Smart nästa steg (facit s-next, topp 3) ---- */
  function sNext(card) {
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
              '<button type="button" class="btn-action' +
              (i ? ' secondary' : '') +
              '" data-kk-sig="' +
              esc(row.ruleId) +
              '">' +
              esc(row.ctaLabel || 'Åtgärda') +
              '</button></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga smarta nästa steg just nu</div>';
    return (
      '<section class="sec" id="s-next"><div class="sec-h"><span class="sec-num"></span>' +
      '<span class="sec-title">Smart nästa steg</span></div>' +
      body +
      '</section>'
    );
  }

  /* ---- Högerspalt: Insikter (facit s-insights, topp 2, ej blocker) ---- */
  function sInsights(card) {
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
      '<section class="sec" id="s-insights"><div class="sec-h"><span class="sec-num"></span>' +
      '<span class="sec-title">Insikter · topp 2</span></div>' +
      body +
      '</section>'
    );
  }

  /* ---- Högerspalt: Senaste besökets dokumentation (facit s-doc-latest) ---- */
  function sDocLatest(photos) {
    var items = arr(photos && photos.items)
      .filter(function (item) {
        return item && item.isImage !== false;
      })
      .slice(0, 3);
    var body = items.length
      ? '<div class="photo-grid">' +
        items
          .map(function (item) {
            var src = txt(item.view || item.href || item.url);
            return (
              '<div class="photo-cell" title="' +
              esc(item.name || '') +
              '">' +
              (src
                ? '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(item.name || '') + '" />'
                : '<span class="photo-placeholder"></span>') +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '<div class="empty-line">Ingen fotodokumentation ännu</div>';
    return (
      '<section class="sec" id="s-doc-latest"><div class="sec-h"><span class="sec-num"></span>' +
      '<span class="sec-title">Senaste besök · dokumentation</span></div>' +
      body +
      '</section>'
    );
  }

  /* ---- Högerspalt: Besök · tillfällen (facit s-visits-hist, kompakt) ---- */
  function sVisitsHist(history, patientId) {
    var items = arr(history && history.items).slice(0, 4);
    var body = items.length
      ? items
          .map(function (item) {
            var title = txt(item.title || item.serviceLabel || 'Besök');
            var incomplete =
              txt(item.journalMissing || '') || txt(item.meta || '').indexOf('journal') >= 0;
            return (
              '<div class="hist-row' +
              (incomplete ? ' incomplete' : '') +
              '"><div>' +
              '<div class="book-title">' +
              esc(title) +
              '</div>' +
              '<div class="book-meta">' +
              esc(txt(item.whenLong || item.meta || '')) +
              '</div></div>' +
              (incomplete ? '<span class="chip warn">Ofullst.</span>' : '') +
              '<button type="button" class="j-btn" data-kk-ord48-open-calendar data-patient-id="' +
              esc(patientId || '') +
              '">Öppna</button></div>'
            );
          })
          .join('')
      : '<div class="empty-line">Inga besök att visa</div>';
    return (
      '<section class="sec" id="s-visits-hist"><div class="sec-h"><span class="sec-num"></span>' +
      '<span class="sec-title">Besök · tillfällen</span></div>' +
      body +
      '</section>'
    );
  }

  function render(ctx) {
    ctx = ctx || {};
    var C = global.CcoV12Canon && global.CcoV12Canon.sections;
    if (!C) return '';

    var card = ctx.bcard || ctx.card || {};
    var bundle = ctx.dossierBundle || null;
    var journey = call('buildJourneyFromState', [card, ctx.journalEntries, bundle], null);
    var av = call('buildActiveVisitFromBundle', [bundle], null);
    var warnings = call('buildCriticalWarnings', [card, ctx.journalEntries, bundle], null);
    var health = call('buildHealthPreview', [card, bundle], null);
    var photos = call('buildPhotosFromDriveFiles', [ctx.driveFiles], null);
    var files = call('buildFilesFromDriveFiles', [ctx.driveFiles], null);
    var offers = call('buildOffersFromPayload', [card, bundle, ctx.commercialCase], null);
    var autoDocs = call('buildAutoDocsFromPayload', [card, bundle], null);
    var bookings = call(
      'buildBookingsFromExtras',
      [card, card, bundle, ctx.occasionTimeline],
      null
    );
    var history = call('buildHistoryFromExtras', [card, card, bundle, ctx.occasionTimeline], null);
    var journals = call('buildJournalsFromEntries', [ctx.journalEntries], null);
    var comm = call('buildCommunicationFromState', [card, ctx.occasionTimeline, bundle], null);
    var econ = call('buildEconomyFromCard', [card], null);
    var invoices = call('buildEconomyInvoices', [bundle && bundle.paymentHistory], null);
    var nextStep = call('buildSmartNextStep', [card], null);
    var insights = call('buildInsightsFromSignals', [card], null);
    var recentEvents = call('buildRecentEvents', [card, bundle, ctx.journalEntries], []);
    var stepAssets =
      ctx.stepAssets || call('buildStepAssets', [journey, ctx.driveFiles, ctx.journalEntries], {});

    var patientId = card.id || card.patientId || (ctx.patient && ctx.patient.id);
    var profile = call('buildProfileFromBcard', [card], null);

    var halsa = C.s4(health) || '';
    // Beslut ORD-106 §7: Hälsa stannar som egen sektion men utan bokstav.
    halsa = halsa.replace('<span class="sec-num">04</span>', '<span class="sec-num"></span>');

    var main =
      '<div class="v13-view__main">' +
      C.s1(card, journey) +
      C.stats(card, econ, bundle) +
      C.s2(av) +
      C.s3(warnings) +
      halsa +
      C.s5(journey, av, nextStep, photos, health, stepAssets) +
      C.sJournal(journals, ctx.journalEntries) +
      C.s7(photos, ctx.visitSegments, patientId) +
      C.sPlan(offers, ctx.commercialCase, patientId) +
      C.s9(files, offers, autoDocs, patientId) +
      C.s10(comm, card, ctx.conversationThreads) +
      C.s11(econ, invoices, patientId) +
      C.uppfoljning(insights, patientId) +
      C.histSection(bundle, patientId) +
      '</div>';

    var s8out = C.s8(bookings, history, patientId) || '';
    s8out = s8out.replace('id="s8"', 'id="s-book"');

    var right =
      '<aside class="v13-view__rail" aria-label="Högerspalt">' +
      sNext(card) +
      sInsights(card) +
      s8out +
      sDocLatest(photos) +
      sVisitsHist(history, patientId) +
      C.rail(recentEvents, nextStep, bundle, card) +
      '</aside>';

    return (
      '<div class="v13-view" data-v13-canon="1">' +
      C.header(profile, patientId) +
      '<div class="v13-view__grid">' +
      main +
      right +
      '</div>' +
      C.sticky(nextStep, card, av) +
      '</div>'
    );
  }

  global.CcoV13View = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
