/**
 * V11 Rail · KOMPLETT render
 *
 * Verbatim-trogen port av facit HOGERSPALT-v11-komplett-2026-06-18.html
 * (22 sektioner A–S). Återanvänder BEFINTLIGA V11-adaptrar som datakälla.
 * Varje sektion bär data-v9-section-link så sektionsklick öppnar stora vyn
 * (CONTENT-CANON) på rätt sektion. CSS i cco-v11-rk.css ger 100% identitet.
 * Aktiveras via ?v11rk=on.
 *
 *   window.CcoV11RailKomplett.render(ctx) -> HTML-sträng
 */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function txt(v) {
    return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  }
  function arr(v) {
    return Array.isArray(v) ? v : [];
  }
  function adminToken() {
    try {
      var token = txt(
        (global.localStorage && global.localStorage.getItem('ARCANA_ADMIN_TOKEN')) ||
          (global.sessionStorage && global.sessionStorage.getItem('ARCANA_ADMIN_TOKEN'))
      );
      return token && token !== '__preview_local__' ? token : '';
    } catch (_e) {
      return '';
    }
  }
  function initials(name) {
    var p = txt(name).split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function call(fn, args, fb) {
    try {
      var a = global.CcoV11RailAdapters || {};
      if (typeof a[fn] === 'function') return a[fn].apply(a, args);
    } catch (_e) {
      /* defensivt */
    }
    return fb;
  }
  // sektion → data-v9-section-link slug (mappas av inferV12ModuleFromRailClick → modul)
  function secOpen(slug, cls, inner) {
    return '<div class="' + cls + '" data-v9-section-link="' + slug + '">' + inner + '</div>';
  }
  function label(t, when) {
    return (
      '<div class="sec-label"><span>' +
      esc(t) +
      '</span>' +
      (when ? '<span class="when">' + esc(when) + '</span>' : '') +
      '</div>'
    );
  }

  function bookingNotesHtml(notes) {
    if (typeof notes === 'string') {
      return notes
        ? '<div class="book-meta"><strong>Anteckning:</strong> ' + esc(notes) + '</div>'
        : '';
    }
    return arr(notes)
      .map(function (note) {
        var noteText = txt(note && note.text);
        if (!noteText) return '';
        return (
          '<div class="book-meta"><strong>' +
          esc(txt(note.label) || 'Anteckning') +
          ':</strong> ' +
          esc(noteText) +
          '</div>'
        );
      })
      .join('');
  }

  function bookingStatusLabel(booking, fallback) {
    var raw = txt(booking && (booking.stateLabel || booking.status || booking.state));
    var key = raw.toLowerCase().replace(/[\s-]+/g, '_');
    var labels = {
      confirmed: 'Bokad',
      upcoming: 'Bokad',
      completed: 'Genomförd',
      cancelled: 'Avbokad',
      canceled: 'Avbokad',
      no_show: 'Utebliven',
    };
    return labels[key] || raw || fallback;
  }

  function bookingAuditDetailsHtml(booking, fallbackPatientId) {
    var bookingId = txt(booking && booking.bookingId);
    var patientId = txt((booking && booking.patientId) || fallbackPatientId);
    if (!bookingId || !patientId || booking.auditAvailable !== true) return '';
    return (
      '<details class="book-audit" data-v11-booking-audit data-booking-id="' +
      esc(bookingId) +
      '" data-patient-id="' +
      esc(patientId) +
      '"><summary>Visa audit</summary>' +
      '<div class="book-audit__readout" data-v11-booking-audit-readout>Read-only · öppna för att läsa create-händelser.</div></details>'
    );
  }

  function blockerModule(ruleId, labelText) {
    var value = (txt(ruleId) + ' ' + txt(labelText)).toLowerCase();
    if (/allerg|health|hälso|halso|medicin|kontra/.test(value)) return 'health';
    if (/journal/.test(value)) return 'journal';
    if (/bok|booking|uppfölj|uppfolj/.test(value)) return 'bookings';
    return 'documents';
  }

  function render(ctx) {
    ctx = ctx || {};
    var card = ctx.bcard || ctx.card || {};
    var bundle = ctx.dossierBundle || null;
    // Offert-ärendet kommer på ctx, inte i bundeln. Se offert-blocket nedan.
    var commercialCase = ctx.commercialCase || (bundle && bundle.commercialCase) || null;
    var journey = call('buildJourneyFromState', [card, ctx.journalEntries, bundle], null);
    var av = call('buildActiveVisitFromBundle', [bundle], null);
    var warnings = call('buildCriticalWarnings', [card, ctx.journalEntries, bundle], null);
    var health = call('buildHealthPreview', [card, bundle], null);
    var smart = call('buildSmartNextStep', [card], null);
    var photos = call('buildPhotosFromDriveFiles', [ctx.driveFiles], null);
    var files = call('buildFilesFromDriveFiles', [ctx.driveFiles], null);
    var comm = call('buildCommunicationFromState', [card, ctx.occasionTimeline, bundle], null);
    var econ = call('buildEconomyFromCard', [card], null);
    var insights = call('buildInsightsFromSignals', [card], null);
    var name = txt(card.displayName || card.fullName || card.name) || 'Kund';
    var out = '';

    /* A · PROFILHUVUD */
    var tags = arr(card.tags)
      .slice(0, 4)
      .map(function (t) {
        var l = txt(typeof t === 'string' ? t : t && (t.label || t.name));
        if (!l) return '';
        var tone = /allerg|risk/i.test(l)
          ? 'warning'
          : /vip/i.test(l)
            ? 'vip'
            : /återkom|aterkom|ny/i.test(l)
              ? 'success'
              : 'info';
        return '<span class="tag ' + tone + '">' + esc(l) + '</span>';
      })
      .join('');
    var cur = journey && journey.cur;
    // Kicker = [tier] · Aktiv steg N (facit: "VIP · Aktiv steg 8")
    var tierTag = arr(card.tags)
      .map(function (t) {
        return txt(typeof t === 'string' ? t : t && (t.label || t.name));
      })
      .filter(function (l) {
        return /vip/i.test(l);
      })[0];
    var tier = tierTag ? txt(tierTag).toUpperCase() : '';
    var kickerText = cur ? (tier ? tier + ' · ' : '') + 'Aktiv steg ' + cur : tier || 'Kund';
    out +=
      '<div class="dhead" data-v9-section-link="profil"><div class="avatar">' +
      esc(initials(name)) +
      '</div>' +
      '<div class="head-body">' +
      '<div class="kicker">' +
      esc(kickerText) +
      '</div>' +
      '<div class="name">' +
      esc(name) +
      '</div>' +
      '<div class="contact">' +
      (card.primaryPhone || card.phone
        ? '<span class="icn">☎</span> ' + esc(txt(card.primaryPhone || card.phone)) + '<br>'
        : '') +
      (card.primaryEmail || card.email
        ? '<span class="icn">✉</span> ' + esc(txt(card.primaryEmail || card.email)) + '<br>'
        : '') +
      (card.address || card.city
        ? '<span class="icn">⌂</span> ' + esc(txt(card.address || card.city))
        : '') +
      '</div>' +
      (tags ? '<div class="tags">' + tags + '</div>' : '') +
      '<button type="button" class="btn-edit-profile" data-v12-edit-open data-v12-open-module="current-state">Ändra profil</button>' +
      '</div></div>';

    /* B · SMART INFORMATION */
    if (smart && smart.what) {
      // Facit B: "Nästa: … (steg N av M)". Prefix + resans position läggs
      // till när de saknas; själva texten och why-em behålls oförändrade.
      var smartWhat = txt(smart.what);
      if (!/^nästa|^nasta|^next/i.test(smartWhat)) smartWhat = 'Nästa: ' + smartWhat;
      if (cur && journey && journey.total) {
        smartWhat += ' (steg ' + cur + ' av ' + journey.total + ')';
      }
      out +=
        '<div class="banner-smart"><div class="lbl">Smart information</div>' +
        '<div class="txt">' +
        esc(smartWhat) +
        (smart.why ? ' <em>' + esc(txt(smart.why)) + '</em>' : '') +
        '</div></div>';
    }

    /* C · NYCKELTAL */
    var visits =
      card.visitsThisYear != null
        ? card.visitsThisYear
        : arr(bundle && bundle.historyBookings).length || '—';
    var value = txt((econ && (econ.totalValue || econ.total)) || card.totalValue) || '—';
    var debt = card.debt != null ? card.debt : 0;
    // Facit C: "+3 vs i fjol" under Besök · i år. Visas bara när data finns
    // (card.visitsDelta eller både i år + i fjol) — annars tom som förut.
    var visitsDelta = null;
    if (card.visitsDelta != null) visitsDelta = Number(card.visitsDelta);
    else if (card.visitsThisYear != null && card.visitsLastYear != null) {
      visitsDelta = Number(card.visitsThisYear) - Number(card.visitsLastYear);
    }
    var visitsSub = '';
    if (visitsDelta != null && Number.isFinite(visitsDelta) && visitsDelta !== 0) {
      visitsSub =
        '<div class="sub' +
        (visitsDelta < 0 ? ' warn' : '') +
        '">' +
        (visitsDelta > 0 ? '+' : '') +
        visitsDelta +
        ' vs i fjol</div>';
    } else {
      visitsSub = '<div class="sub">&nbsp;</div>';
    }
    out +=
      '<div class="stats">' +
      '<div class="stat hero"><div class="lbl">Besök · i år</div><div class="val">' +
      esc(visits) +
      '</div>' +
      visitsSub +
      '</div>' +
      '<div class="stat"><div class="lbl">Värde tot.</div><div class="val">' +
      esc(value) +
      '</div><div class="sub">sek</div></div>' +
      '<div class="stat"><div class="lbl">Skuld</div><div class="val">' +
      esc(debt) +
      '</div><div class="sub">kronor</div></div>' +
      '</div>';

    /* V · AKTIVT BESÖK */
    if (av) {
      var ci = (txt(av.checkedInAt).match(/\d{2}:\d{2}/) || [''])[0];
      var room = txt(av.room || av.roomLabel || av.practitionerRoom);
      // av-preflight (3-kortsruta som facit): härled ok-kort ur hälsa + warn-kort ur blockers.
      var pre = [];
      if (health && (health.status === 'signed' || health.signedAt)) {
        pre.push(
          '<div class="av-pre ok"><div class="pre-icn">✓</div><div class="pre-title">Hälsodekl.</div><div class="pre-meta">' +
            (health.signedAt ? 'Signerad ' + esc(txt(health.signedAt)) : 'Signerad') +
            '</div></div>'
        );
      }
      var allergies = arr(health && health.allergies);
      if (allergies.length) {
        pre.push(
          '<div class="av-pre ok"><div class="pre-icn">✓</div><div class="pre-title">Allergier</div><div class="pre-meta">' +
            esc(txt(allergies[0]) + ' · granskat') +
            '</div></div>'
        );
      }
      arr(av.blockers).forEach(function (b) {
        var lbl = txt(b && (b.label || b.title) ? b.label || b.title : b);
        if (!lbl) return;
        pre.push(
          '<button type="button" class="av-pre warn" data-v12-open-module="' +
            esc(blockerModule(b && b.ruleId, lbl)) +
            '"><div class="pre-icn">!</div><div class="pre-title">' +
            esc(lbl) +
            '</div><div class="pre-meta">Krävs idag</div><div class="pre-cta">Öppna →</div></button>'
        );
      });
      var preHtml = pre.length
        ? '<div class="av-preflight">' + pre.slice(0, 3).join('') + '</div>'
        : '';
      out +=
        '<div class="active-visit"><div class="av-kicker"><div class="left"><span class="pulse"></span>' +
        esc(av.kicker || 'Aktivt besök · pågår') +
        '</div>' +
        (av.headMeta ? '<span class="time">' + esc(av.headMeta) + '</span>' : '') +
        '</div>' +
        '<div class="av-visit-row"><div><div class="av-title">' +
        esc(av.title || 'Besök') +
        '</div>' +
        '<div class="av-sub">' +
        esc(av.statusLine || '') +
        '</div>' +
        (av.bookingNote
          ? '<div class="av-sub">Anteckning · ' + esc(av.bookingNote) + '</div>'
          : '') +
        '</div>' +
        (av.practitioner
          ? '<div class="av-staff">' +
            esc(av.practitioner) +
            (room ? '<br><span class="room">' + esc(room) + '</span>' : '') +
            '</div>'
          : '') +
        '</div>' +
        preHtml +
        (av.showTimeline
          ? '<div class="av-timeline"><div class="av-tnode done"><span class="dot"></span><span class="t">' +
            esc(ci || 'in') +
            '</span></div>' +
            '<div class="av-tline"></div><div class="av-tnode active"><span class="dot"></span><span class="t">nu</span></div>' +
            '<div class="av-tline todo"></div><div class="av-tnode todo"><span class="dot"></span><span class="t">klart</span></div></div>'
          : '') +
        '<div class="av-actions"><button class="av-btn primary" data-v11-active-visit-action="' +
        esc((av.primary && av.primary.action) || 'journal') +
        '">' +
        esc((av.primary && av.primary.label) || 'Starta journal') +
        '</button>' +
        '<button class="av-btn sec" data-v11-active-visit-action="photo">📷</button>' +
        '<button class="av-btn sec" data-v11-active-visit-action="notes">✏</button>' +
        (av.secondary
          ? '<button class="av-btn tert" data-v11-active-visit-action="' +
            esc(av.secondary.action) +
            '">✓</button>'
          : '') +
        '</div></div>';
    }

    /* D · KRITISKA VARNINGAR */
    var warns = arr(warnings && warnings.items ? warnings.items : warnings);
    if (warns.length) {
      out +=
        '<div class="warn-block" data-v9-section-link="compliance">' +
        warns
          .map(function (w) {
            return (
              '<div class="warn-row"><span class="icn">!</span><div><b>' +
              esc(txt(w.title || w.what || w.label)) +
              '</b>' +
              (w.text || w.why ? ' ' + esc(txt(w.text || w.why)) : '') +
              '</div></div>'
            );
          })
          .join('') +
        '</div>';
    }

    /* E · HÄLSODEKLARATION — rader ur riktig health-data (allergier/läkemedel/flaggor) */
    if (health) {
      var hAllergies = arr(health.allergies);
      var hMeds = (health.medications && health.medications.items) || [];
      var hContra = arr(health.contraindications);
      var hAnswers = arr(health.answers);
      function hdRow(q, val, pill) {
        return (
          '<div class="hd-row"><span class="hd-q">' +
          esc(q) +
          '</span><span class="pill ' +
          pill +
          '">' +
          esc(val) +
          '</span></div>'
        );
      }
      var rows = '';
      if (hAnswers.length) {
        // Riktiga per-frågesvar (parser answers[]) → en rad per fråga, som facit
        // (9 rader). pill: red→danger, JA→yes, NEJ→no.
        rows = hAnswers
          .map(function (a) {
            var isYes = /^ja\b/i.test(txt(a.value));
            var pill = a.risk === 'red' ? 'danger' : isYes ? 'yes' : 'no';
            return hdRow(txt(a.label), isYes ? 'JA' : 'NEJ', pill);
          })
          .join('');
      } else {
        // Fallback: aggregat ur allergier/mediciner/flaggor när svar saknas.
        rows += hAllergies.length
          ? hdRow('Allergier', 'JA · ' + txt(hAllergies[0]), 'danger')
          : hdRow('Allergier', 'Ej registrerat', 'unknown');
        rows += hMeds.length
          ? hdRow('Pågående mediciner', 'JA · ' + hMeds.length + ' st', 'yes')
          : hdRow(
              'Pågående mediciner',
              health.medications && health.medications.known ? 'JA' : 'Ej registrerat',
              health.medications && health.medications.known ? 'yes' : 'unknown'
            );
        hContra.forEach(function (c) {
          rows += hdRow(txt(c.text), 'JA', c.level === 'red' ? 'danger' : 'yes');
        });
      }
      out += secOpen(
        'halsa',
        'sec',
        label('Hälsodeklaration', health.signedAt ? 'Signerad ' + txt(health.signedAt) : '') +
          '<div class="hd-rows">' +
          (rows || '<div class="hd-row"><span class="hd-q">Inga registrerade svar</span></div>') +
          '</div><div class="hd-foot">' +
          (health.viewUrl
            ? '<button type="button" data-kk-open-doc="' +
              esc(txt(health.viewUrl)) +
              '" data-kk-doc-title="' +
              esc(txt(health.documentTitle) || 'Hälsodeklaration') +
              '">Öppna PDF</button>'
            : '') +
          '<button type="button" data-v12-open-module="health">Visa historik</button>' +
          '<button type="button" data-v12-open-module="health">Redigera svar</button>' +
          '<button type="button" data-patient-action="copy-patient-link">Kopiera länk</button>' +
          '</div>'
      );
    }

    /* F · KUNDRESA */
    var steps = arr(journey && journey.steps);
    if (steps.length) {
      var done = steps.filter(function (s) {
        return s.state === 'done';
      }).length;
      var pct = journey.pct || Math.round((done / steps.length) * 100);
      out += secOpen(
        'journey',
        'sec',
        '<div class="journey-head">' +
          label('Kundresa · ' + steps.length + ' steg') +
          (cur ? '<span class="journey-badge">Steg ' + esc(cur) + '</span>' : '') +
          '</div>' +
          '<div class="journey-bar"><i style="width:' +
          esc(pct) +
          '%"></i></div>' +
          '<div class="j-steps">' +
          steps
            .map(function (s, i) {
              var st = s.state === 'done' ? 'done' : s.state === 'active' ? 'active' : 'todo';
              var badge = s.state === 'done' ? '✓' : esc(s.id != null ? s.id : i + 1);
              // Facit F: rikare stegstatus — "Accepterad" (offert/plan),
              // "Signerat" (behandling/avtal/blanketter), "Saknas" (aktivt
              // steg med ofylld blankett, t.ex. Friskförsäkran). Allt byggs
              // ur befintlig data (label/note/medForm/viewUrl).
              var stepTail;
              if (s.state === 'todo' || s.state === 'neutral') {
                stepTail = '<span class="sub">Kommande</span>';
              } else if (s.state === 'active') {
                var formMissing = s.medForm && !s.viewUrl;
                stepTail = '<span class="sub">' + (formMissing ? 'Saknas' : 'Pågår') + '</span>';
              } else {
                var stepLbl = txt(s.label).toLowerCase();
                var stepNote = txt(s.note).toLowerCase();
                if (/accept|accepterad|godkänd|godkand/i.test(stepNote)) {
                  stepTail = '<span class="ok">Accepterad</span>';
                } else if (
                  /offert|behandlingsplan/i.test(stepLbl) &&
                  !/delbetalning/.test(stepLbl)
                ) {
                  stepTail = '<span class="ok">Accepterad</span>';
                } else if (/signer|signerad/i.test(stepNote)) {
                  stepTail = '<span class="ok">Signerat</span>';
                } else if (
                  /behandling|delbetalning|avtal|friskförsäkran|friskforsakran|hälsodekl|halso|samtycke|journal|foto|identifikation|före|fore/i.test(
                    stepLbl
                  )
                ) {
                  stepTail = '<span class="ok">Signerat</span>';
                } else {
                  stepTail = '<span class="ok">Klart</span>';
                }
              }
              var tag = s.viewUrl ? 'button' : 'div';
              var docAttrs = s.viewUrl
                ? ' type="button" data-kk-open-doc="' +
                  esc(txt(s.viewUrl)) +
                  '" data-kk-doc-title="' +
                  esc(txt(s.documentTitle) || txt(s.label)) +
                  '"'
                : '';
              return (
                '<' +
                tag +
                ' class="j-step ' +
                st +
                '"' +
                docAttrs +
                '><span class="badge">' +
                badge +
                '</span><span class="label">' +
                esc(txt(s.label)) +
                '</span>' +
                stepTail +
                '</' +
                tag +
                '>'
              );
            })
            .join('') +
          '</div>'
      );
    }

    /* G · SMART NÄSTA STEG */
    // Facit G: EN rad per aktiv signal, inte bara den översta. Första CTA:n är
    // primär, resten sekundära. Faller tillbaka på den enskilda signalen om
    // adaptern är en äldre version utan buildSmartNextSteps (cachad fil).
    var smartRows = arr(call('buildSmartNextSteps', [card, 3], null));
    if (!smartRows.length && smart && smart.what) smartRows = [smart];
    if (smartRows.length) {
      out +=
        '<div class="sec">' +
        label('Smart nästa steg') +
        smartRows
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
              esc(row.ctaLabel || 'Åtgärda') +
              '</button></div>'
            );
          })
          .join('') +
        '</div>';
    }

    /* H · KOMMANDE BOKNINGAR */
    var upReadout = call(
      'buildBookingsFromExtras',
      [ctx.card || {}, card, bundle, ctx.occasionTimeline],
      { items: arr(bundle && bundle.upcomingBookings) }
    );
    var up = arr(upReadout && upReadout.items);
    out += secOpen(
      'upcoming',
      'sec',
      label('Kommande bokningar') +
        (up.length
          ? up
              .slice(0, 4)
              .map(function (b) {
                return (
                  '<div class="book-row"><div class="book-date"><span class="d">' +
                  esc(txt(b.whenLong || b.dayLabel || b.day || '—')) +
                  '</span></div>' +
                  '<div><div class="book-title">' +
                  esc(txt(b.title || b.serviceLabel || 'Bokning')) +
                  '</div>' +
                  '<div class="book-meta">' +
                  esc(
                    [
                      txt(b.whenShort || b.timeLabel || b.time || ''),
                      txt(b.sub || b.staffName || b.resourceLabel || ''),
                      txt(b.locationLabel || ''),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  ) +
                  '</div>' +
                  bookingNotesHtml(b.notes || b.bookingNotes) +
                  bookingAuditDetailsHtml(b, upReadout && upReadout.patientId) +
                  '</div>' +
                  '<span class="q-status ' +
                  (b.state === 'completed' ? 'green' : 'warn') +
                  '">' +
                  esc(bookingStatusLabel(b, 'Bokad')) +
                  '</span></div>'
                );
              })
              .join('')
          : '<div class="next-row"><div class="what" style="color:var(--ink-mute)">Inga kommande bokningar</div></div>')
    );

    /* I · BESÖK / TILLFÄLLEN (bokningshistorik enligt V11-facit) */
    var historyReadout = call(
      'buildHistoryFromExtras',
      [ctx.card || {}, card, bundle, ctx.occasionTimeline],
      { items: arr(bundle && bundle.historyBookings) }
    );
    var hist = arr(historyReadout && historyReadout.items);
    if (hist.length) {
      out += secOpen(
        'historik',
        'sec',
        label('Besök · tillfällen') +
          hist
            .slice(0, 4)
            .map(function (b) {
              var meta = [
                txt(b.whenShort || b.timeLabel || b.time),
                txt(b.durationLabel || b.duration),
                txt(b.sub || b.staffName || b.providerName || b.resourceName),
                txt(b.locationLabel),
              ].filter(Boolean);
              return (
                '<div class="hist-row"><div class="book-date"><span class="d">' +
                esc(txt(b.whenLong || b.dayLabel || b.day || '—')) +
                '</span></div>' +
                '<div><div class="book-title">' +
                esc(txt(b.title || b.serviceLabel || 'Besök')) +
                '</div>' +
                (meta.length ? '<div class="book-meta">' + esc(meta.join(' · ')) + '</div>' : '') +
                bookingNotesHtml(b.notes || b.bookingNotes) +
                '</div><span class="q-status ' +
                (b.state === 'completed' ? 'green' : 'warn') +
                '">' +
                esc(bookingStatusLabel(b, 'Genomförd')) +
                '</span></div>'
              );
            })
            .join('')
      );
    }

    /* I2 · SENASTE BESÖKSDOKUMENTATION — kompakt preview, full vy i V12. */
    var visitPatientId = txt(card.patientId || card.id || card.customerId);
    if (visitPatientId) {
      out +=
        '<div class="sec" data-v11-rk-besok-sec hidden>' +
        label('Senaste besök · dokumentation') +
        '<div data-v11-rk-besok="' +
        esc(visitPatientId) +
        '"></div></div>';
    }

    // Journaler visas per besökstillfälle i den unifyade "Besök"-sektionen ovan.

    /* K · OFFERTOR */
    var offers = arr(
      (bundle && (bundle.offers || (bundle.commercialCase && bundle.commercialCase.offers))) || []
    );
    // `bundle.offers`-grenen ovan lämnas orörd: den är korrekt den dag bundeln
    // faktiskt bär en offertLISTA, och en äkta lista ska alltid vinna.
    //
    // Men `commercialCase` är ETT ärende, inte en lista
    // (ccoCommercialStore.js:494 normalizeCommercialCase) — det finns inget
    // `.offers`-fält. Därför har stora kortet alltid visat "Inga offerter
    // ännu", även för en patient med en skickad och accepterad offert.
    //
    // Raden syntetiseras med EXAKT de fältnamn mapparen nedan redan läser, så
    // ingen ny markup och ingen ny CSS behövs: .q-pill/.q-title/.q-meta/
    // .q-amount/.q-status gör jobbet, och `st`-logiken på raden nedan ger
    // quoteStatus-badgen grön vid accepterad via sin befintliga /accept/i-test.
    if (!offers.length && commercialCase) {
      var ccStatus = txt(commercialCase.quoteStatus);
      var ccAmount = txt(commercialCase.quotedAmount);
      if (ccStatus || ccAmount) {
        offers = [
          {
            kind: commercialCase.offerType,
            title: commercialCase.offerType || 'Offert',
            dateLabel: txt(commercialCase.quoteAcceptedAt) || txt(commercialCase.quoteSentAt),
            amount: ccAmount,
            status: ccStatus,
            statusLabel: ccStatus,
          },
        ];
      }
    }
    // Kundportalen har aldrig varit nåbar från någon av de stora vyerna.
    // Länken härleds deterministiskt ur esignToken — samma formel som
    // buildCustomerPortalUrlFromOffer (patient-master-ui.js:9841). Den
    // funktionen är IIFE-privat och går inte att importera hit.
    // Renderas med file-row-mönstret som redan används på :700 och :972.
    var portalToken = txt(commercialCase && commercialCase.esignToken);
    var portalRow = portalToken
      ? '<a class="file-row" href="/api/v1/cco-commercial/customer-offer-portal?token=' +
        esc(encodeURIComponent(portalToken)) +
        '" target="_blank" rel="noopener" title="Kundportal">' +
        '<span class="file-icn">🔗</span><span class="file-name">Kundportal</span></a>'
      : '';
    out += secOpen(
      'avtal',
      'sec',
      label('Offertor') +
        (offers.length
          ? offers
              .slice(0, 4)
              .map(function (o) {
                var st = /accept/i.test(txt(o.status)) ? 'green' : 'warn';
                return (
                  '<div class="q-row"><div class="q-left"><span class="q-pill ' +
                  (st === 'green' ? 'green' : 'gold') +
                  '">' +
                  esc(
                    txt(o.kind || 'TP')
                      .slice(0, 3)
                      .toUpperCase()
                  ) +
                  '</span><div class="q-info"><div class="q-title">' +
                  esc(txt(o.title || 'Offert')) +
                  '</div><div class="q-meta">' +
                  esc(txt(o.dateLabel || o.date || '')) +
                  '</div></div></div>' +
                  '<div><span class="q-amount">' +
                  esc(txt(o.amount || '')) +
                  '</span><br><span class="q-status ' +
                  st +
                  '">' +
                  esc(txt(o.statusLabel || o.status || '')) +
                  '</span></div></div>'
                );
              })
              .join('')
          : '<div class="next-row"><div class="what" style="color:var(--ink-mute)">Inga offerter ännu</div></div>') +
        portalRow
    );

    /* L · AUTO-DOKUMENT */
    var autodocs = arr(files && files.items ? files.items : files).filter(function (f) {
      return /auto|bekräft|bekraft|mall|påminn|paminn/i.test(
        txt(f.name || f.category || f.sourceSystem)
      );
    });
    if (autodocs.length) {
      out += secOpen(
        'filer',
        'sec',
        label('Auto-dokument') +
          autodocs
            .slice(0, 4)
            .map(function (f) {
              return (
                '<div class="j-row"><span class="j-mark done">✓</span><span class="j-name">' +
                esc(txt(f.name || 'Dokument')) +
                '</span><span class="j-status">Levererad</span></div>'
              );
            })
            .join('')
      );
    }

    /* M · FOTON */
    var ph = arr(photos && photos.items ? photos.items : photos).filter(function (photo) {
      return photo && photo.isImage !== false;
    });
    if (ph.length) {
      out += secOpen(
        'foto',
        'sec',
        label('Foton') +
          '<div class="photo-grid">' +
          ph
            .slice(0, 3)
            .map(function (p) {
              var assetId = txt(p.assetId || p.fileId || p.id);
              var openRef = txt(p.openRef || p.viewUrl || p.url);
              var editable = Boolean(assetId && openRef);
              // Facit M: klassning Före/Efter/Grov ur asset-kategorin
              // (p.zone/p.phase: before/after/during) — raw som fallback.
              var photoZone = txt(p.zone || p.phase).toLowerCase();
              var photoZoneClass =
                photoZone === 'before'
                  ? 'before'
                  : photoZone === 'after'
                    ? 'after'
                    : photoZone === 'during'
                      ? 'during'
                      : 'raw';
              var photoZoneLabel =
                photoZone === 'before'
                  ? 'Före'
                  : photoZone === 'after'
                    ? 'Efter'
                    : photoZone === 'during'
                      ? 'Under'
                      : '';
              return (
                '<div class="photo-tile ' +
                photoZoneClass +
                (editable ? ' photo-tile--editable' : '') +
                '"' +
                (editable
                  ? ' role="button" tabindex="0" data-v11-photo-edit data-patient-id="' +
                    esc(txt(card.patientId || card.id || card.customerId)) +
                    '" data-asset-id="' +
                    esc(assetId) +
                    '" data-photo-src="' +
                    esc(openRef) +
                    '" data-photo-name="' +
                    esc(txt(p.fileName || p.name || 'Foto')) +
                    '" data-photo-zone="Foton" data-photo-date="' +
                    esc(txt(p.dateLabel || p.photoDateLabel || p.capturedAt)) +
                    '"'
                  : '') +
                '>' +
                (assetId
                  ? '<img src="" data-patient-file-id="' +
                    esc(assetId) +
                    '" alt="' +
                    esc(txt(p.fileName || p.name || 'Foto')) +
                    '" decoding="async" />'
                  : '') +
                '<span class="lbl">' +
                esc(photoZoneLabel || txt(p.dateLabel || p.photoDateLabel || 'Foto').slice(0, 8)) +
                '</span>' +
                (editable
                  ? '<span class="photo-tile__draw" aria-hidden="true">✎ Rita</span>'
                  : '') +
                '</div>'
              );
            })
            .join('') +
          '</div>'
      );
    }

    /* N · FILER */
    var fl = arr(files && files.items ? files.items : files);
    if (fl.length) {
      out += secOpen(
        'filer',
        'sec',
        label('Filer') +
          fl
            .slice(0, 5)
            .map(function (f) {
              var nm = esc(txt(f.name || f.title || 'Fil'));
              var href = txt(f.href);
              // Klickbar fil → öppnas i dokument-rutan (global fångare i
              // patient-master-ui), aldrig som länk/ny flik.
              return href
                ? '<a class="file-row" href="' +
                    esc(href) +
                    '" title="' +
                    nm +
                    '"><span class="file-icn">📄</span><span class="file-name">' +
                    nm +
                    '</span></a>'
                : '<div class="file-row"><span class="file-icn">📄</span><span class="file-name">' +
                    nm +
                    '</span></div>';
            })
            .join('')
      );
    }

    /* O · ANTECKNINGAR */
    var notes = arr(ctx.journalEntries).filter(function (e) {
      return /antecknin|note/i.test(txt(e.journalType || e.type)) || txt(e.note);
    });
    if (notes.length) {
      out += secOpen(
        'anteckningar',
        'sec',
        label('Anteckningar') +
          notes
            .slice(0, 3)
            .map(function (e) {
              return (
                '<div class="note-row">' +
                esc(txt(e.note || e.body || e.text || e.title)) +
                '<div class="when">' +
                esc(txt(e.dateLabel || e.date || '') + (e.author ? ' · ' + e.author : '')) +
                '</div></div>'
              );
            })
            .join('')
      );
    }

    /* P · KOMMUNIKATION */
    var cm = arr(comm && comm.items ? comm.items : comm);
    if (cm.length) {
      out += secOpen(
        'kommunikation',
        'sec',
        label('Kommunikation') +
          cm
            .slice(0, 4)
            .map(function (c) {
              var dir = /ut|out/i.test(txt(c.dir || c.direction)) ? 'out' : 'in';
              var ic = /sms/i.test(txt(c.type))
                ? '📱'
                : /call|phone|samtal|ring/i.test(txt(c.type))
                  ? '📞'
                  : '✉';
              var sub = txt(c.text);
              var pre = txt(c.preview);
              return (
                '<div class="comm-row"><span class="comm-icn ' +
                dir +
                '">' +
                ic +
                '</span>' +
                '<div class="comm-text">' +
                (sub ? '<b>' + esc(sub) + '</b>' : '') +
                (pre ? (sub ? ' — ' : '') + esc(pre) : '') +
                (!sub && !pre ? 'Meddelande' : '') +
                '<div class="comm-meta">' +
                esc(txt(c.meta || c.dateLabel || c.date || '')) +
                '</div></div></div>'
              );
            })
            .join('')
      );
    }

    /* Q · EKONOMI */
    if (econ) {
      out += secOpen(
        'ekonomi',
        'sec',
        label('Ekonomi') +
          '<div class="eko-grid">' +
          '<div class="eko-cell"><div class="lbl">Totalt värde</div><div class="val">' +
          esc(txt(econ.totalValue || econ.total || '—')) +
          '</div></div>' +
          '<div class="eko-cell"><div class="lbl">Kundlivstid</div><div class="val">' +
          esc(txt(econ.lifetimeValue || '—')) +
          '</div></div>' +
          '<div class="eko-cell"><div class="lbl">Skuld</div><div class="val">' +
          esc(debt) +
          '</div></div></div>' +
          '<div class="eko-graph">📈 Mini-graf · grön trend</div>'
      );
    }

    /* I · UPPFÖLJNING (recall — matchar V12:ans I-sektion) */
    var recallPid = txt(card.patientId || card.id || card.customerId);
    var recallPlan = [
      ['3', 'Efterkontroll'],
      ['6', 'Resultatbild'],
      ['12', 'Utvärdering'],
    ];
    out += secOpen(
      'uppfoljning',
      'sec',
      label('Uppföljning · efter avslutad resa') +
        recallPlan
          .map(function (r) {
            return (
              '<div class="q-row"><div class="q-left"><div class="q-info">' +
              '<div class="q-title">' +
              esc(r[1]) +
              '</div>' +
              '<div class="q-meta">~ +' +
              esc(r[0]) +
              ' mån</div></div></div>' +
              '<button type="button" class="btn-action secondary"' +
              (recallPid
                ? ' data-kk-ord48-open-calendar data-patient-id="' + esc(recallPid) + '"'
                : '') +
              '>Boka</button></div>'
            );
          })
          .join('')
    );

    /* R · INSIKTER */
    var ins = arr(insights && insights.items ? insights.items : insights);
    if (ins.length) {
      out += secOpen(
        'insights',
        'sec',
        label('Insikter') +
          ins
            .slice(0, 3)
            .map(function (i) {
              return (
                '<div class="insight-row"><b>' +
                esc(txt(i.title)) +
                '</b>' +
                (i.text ? ' ' + esc(txt(i.text)) : '') +
                '</div>'
              );
            })
            .join('')
      );
    }

    /* S · STICKY FOOTER */
    var stickyPatientId = txt(card.patientId || card.id || card.customerId);
    // Facit S: "✓ Bekräfta incheckning (N)". N är antalet kommande bokningar
    // och kommer ur buildStickyActions — samma källa som adapterns egen
    // "Bekräfta kommande tider (N)". Saknas siffran visas ingen parentes;
    // en påhittad nolla vore värre än ingen siffra alls.
    var stickyActions = call(
      'buildStickyActions',
      [ctx.card || {}, card, bundle, ctx.occasionTimeline],
      null
    );
    var stickyBookCount = Number(stickyActions && stickyActions.bookCount);
    var checkinSuffix =
      Number.isFinite(stickyBookCount) && stickyBookCount > 0 ? ' (' + stickyBookCount + ')' : '';
    var stickyVisitAction = '';
    if (av && av.state === 'scheduled_today') {
      stickyVisitAction =
        '<button type="button" class="sticky-btn green full" data-v11-active-visit-action="checkin">✓ Bekräfta incheckning' +
        checkinSuffix +
        '</button>';
    } else if (av && (av.state === 'checked_in' || av.state === 'in_progress')) {
      stickyVisitAction =
        '<button type="button" class="sticky-btn green full" data-v11-active-visit-action="complete">✓ Avsluta besök</button>';
    } else if (av && av.state === 'completed_today') {
      stickyVisitAction =
        '<button type="button" class="sticky-btn green full" data-v11-active-visit-action="followup">📅 Boka uppföljning</button>';
    }
    // Facit S: "Boka nästa <tjänst> (<datum>)" när nästa bokning finns.
    var nextUpcoming = up[0] || null;
    var stickyBookingLabel = '📅 Boka nästa';
    if (nextUpcoming) {
      var stickyBt = txt(nextUpcoming.title || nextUpcoming.serviceLabel || '');
      var stickyBd = txt(nextUpcoming.whenLong || nextUpcoming.dayLabel || nextUpcoming.day || '');
      var stickyBm = txt(nextUpcoming.monthLabel || nextUpcoming.whenMonth || '');
      if (stickyBt) stickyBookingLabel += ' ' + stickyBt;
      if (stickyBd) {
        stickyBookingLabel += ' (' + stickyBd + (stickyBm ? ' ' + stickyBm : '') + ')';
      }
    }
    out +=
      '<div class="sticky"><div class="sticky-grid">' +
      '<button type="button" class="sticky-btn primary full" data-v11-active-visit-action="photo-journal">📷 Ta bild + öppna journal</button>' +
      (stickyPatientId
        ? '<button type="button" class="sticky-btn gold full" data-kk-ord48-open-calendar data-patient-id="' +
          esc(stickyPatientId) +
          '">' +
          esc(stickyBookingLabel) +
          '</button>'
        : '') +
      '<button type="button" class="sticky-btn ghost" data-v11-active-visit-action="notes">+ Anteckning</button>' +
      '<button type="button" class="sticky-btn ghost" data-v9-section-link="ekonomi">Snabbsaldo</button>' +
      stickyVisitAction +
      '</div></div>';

    return '<div class="v11-rk" data-v11-rk="1"><div class="v11-rk__shell">' + out + '</div></div>';
  }

  /* ── Besök / tillfällen (visit-segments) ──────────────────────────────
     Read-only. Återanvänder befintlig datalayer CcoKundkortVisitSegments
     (API + REASON_LABELS/VISIT_TYPE_LABELS). Renderar i railens EGET
     formspråk (samma klasser som Historik/Foton/Filer) — ingen ny design,
     ingen kkref/storvy-markup. Osäkra kopplingar visas aldrig som klara:
     confidence high → ingen badge; medium/low → amber "Kontrollera"/"Osäker". */
  function besokLabels(kind) {
    var api = global.CcoKundkortVisitSegments || {};
    return (kind === 'reason' ? api.REASON_LABELS : api.VISIT_TYPE_LABELS) || {};
  }
  function besokVisitType(seg) {
    return besokLabels('visit')[String(seg.visitType || 'unknown')] || '';
  }
  function besokReasons(seg) {
    var map = besokLabels('reason');
    return arr(seg.reasons)
      .map(function (c) {
        return map[c] || c;
      })
      .filter(Boolean);
  }
  function besokShortDate(seg) {
    var p = txt(seg.date).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : txt(seg.label || seg.date || '—');
  }
  function renderBesokOccasion(seg, patientId) {
    if (!seg || !seg.date) return '';
    var vt = besokVisitType(seg);
    var title = [vt || txt(seg.label) || 'Besök', txt(seg.timeRange)].filter(Boolean).join(' · ');
    var allImages = arr(seg.images);
    var imgs = allImages.slice(0, 3);
    var allVideos = arr(seg.videos);
    var videos = allVideos.slice(0, 1);
    var allDocs = arr(seg.documents);
    var docs = allDocs.slice(0, 3);
    var counts = [];
    if (allImages.length)
      counts.push(allImages.length + (allImages.length === 1 ? ' foto' : ' foton'));
    if (allVideos.length)
      counts.push(allVideos.length + (allVideos.length === 1 ? ' film' : ' filmer'));
    if (allDocs.length) counts.push(allDocs.length + ' dokument');
    var conf = txt(seg.confidence);
    var badge =
      conf && conf !== 'high'
        ? '<span class="q-status warn">' + (conf === 'low' ? 'Osäker' : 'Kontrollera') + '</span>'
        : '';
    var reasons = besokReasons(seg);
    var head =
      '<div class="hist-row"><div class="book-date"><span class="d">' +
      esc(besokShortDate(seg)) +
      '</span></div><div><div class="book-title">' +
      esc(title) +
      '</div>' +
      (counts.length ? '<div class="when">' + esc(counts.join(' · ')) + '</div>' : '') +
      '</div>' +
      badge +
      '</div>';
    var reasonLine = reasons.length
      ? '<div class="note-row when">' + esc(reasons.join(' · ')) + '</div>'
      : '';
    var photoGrid = imgs.length
      ? '<div class="photo-grid">' +
        imgs
          .map(function (im) {
            var assetId = txt(im.assetId);
            var journalPhotoId = txt(im.journalPhotoId);
            var editable = Boolean((assetId && im.openRef) || journalPhotoId);
            return (
              '<div class="photo-tile raw' +
              (editable ? ' photo-tile--editable' : '') +
              '"' +
              (editable
                ? ' role="button" tabindex="0" data-v11-photo-edit data-patient-id="' +
                  esc(patientId) +
                  '" data-asset-id="' +
                  esc(assetId) +
                  '" data-journal-photo-id="' +
                  esc(journalPhotoId) +
                  '" data-encounter-id="' +
                  esc(txt(im.encounterId)) +
                  '" data-photo-src="' +
                  esc(txt(im.openRef)) +
                  '" data-photo-name="' +
                  esc(txt(im.fileName || 'Foto')) +
                  '" data-photo-zone="Besök" data-photo-date="' +
                  esc(txt(seg.date || seg.label)) +
                  '" data-photo-capture="' +
                  esc(txt(im.takenAt)) +
                  '"'
                : '') +
              '>' +
              (assetId || journalPhotoId
                ? '<img src="" ' +
                  (journalPhotoId
                    ? 'data-journal-photo-id="' + esc(journalPhotoId) + '"'
                    : 'data-patient-file-id="' + esc(assetId) + '"') +
                  ' alt="' +
                  esc(txt(im.fileName || 'Foto')) +
                  '" decoding="async" />'
                : '') +
              '<span class="lbl">' +
              esc(txt(im.timeLabel || '').slice(0, 8)) +
              '</span>' +
              (editable ? '<span class="photo-tile__draw" aria-hidden="true">✎ Rita</span>' : '') +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '';
    var docRows = docs
      .map(function (d) {
        var nm = esc(txt(d.fileName || 'Dokument'));
        var href = txt(d.openRef);
        var meta = [];
        if (d.documentDate) meta.push(txt(d.documentDate));
        if (d.type) meta.push(txt(d.type));
        var inner =
          '<span class="file-icn">📄</span><span class="file-name">' +
          nm +
          (meta.length ? ' <span class="when">' + esc(meta.join(' · ')) + '</span>' : '') +
          '</span>';
        return href
          ? '<a class="file-row" href="' + esc(href) + '" title="' + nm + '">' + inner + '</a>'
          : '<div class="file-row">' + inner + '</div>';
      })
      .join('');
    var videoGrid = videos.length
      ? '<div class="v11-rk__visit-video-grid">' +
        videos
          .map(function (video) {
            var assetId = txt(video.assetId || video.fileId || video.id);
            if (!assetId) return '';
            return (
              '<div class="v11-rk__visit-video">' +
              '<video controls preload="metadata" playsinline data-patient-file-id="' +
              esc(assetId) +
              '" aria-label="' +
              esc(txt(video.fileName || 'Besoksfilm')) +
              '"></video>' +
              '<span class="lbl">Film</span>' +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '';
    var more =
      '<button type="button" class="sec-link v11-rk__visit-open" data-v9-section-link="foto">Öppna hela besöket</button>';
    return head + reasonLine + photoGrid + videoGrid + docRows + more;
  }

  function hydrateBesok(mount) {
    if (!mount || mount.__v11rkBesokDone) return;
    var api = global.CcoKundkortVisitSegments;
    var pid = mount.getAttribute && mount.getAttribute('data-v11-rk-besok');
    if (!api || typeof api.fetchVisitSegmentsOrEmpty !== 'function' || !pid) return;
    mount.__v11rkBesokDone = true;
    var sec = mount.closest ? mount.closest('[data-v11-rk-besok-sec]') : null;
    function drop() {
      if (sec && sec.parentNode) sec.parentNode.removeChild(sec);
    }
    api
      .fetchVisitSegmentsOrEmpty(pid)
      .then(function (segments) {
        var dated = arr(segments).filter(function (s) {
          return s && s.date;
        });
        if (!dated.length) return drop();
        var previewSegment =
          dated.find(function (segment) {
            return arr(segment && segment.images).length > 0;
          }) || dated[0];
        mount.innerHTML = renderBesokOccasion(previewSegment, pid);
        if (typeof global.__ccoHydratePatientFileImages === 'function') {
          void global.__ccoHydratePatientFileImages(mount);
        }
        if (sec) sec.removeAttribute('hidden');
      })
      .catch(drop);
  }

  function hydrateBookingAudit(details) {
    if (!details || details.__v11AuditLoaded || details.__v11AuditLoading) return;
    var bookingId = txt(details.getAttribute('data-booking-id'));
    var patientId = txt(details.getAttribute('data-patient-id'));
    var readout = details.querySelector('[data-v11-booking-audit-readout]');
    if (!bookingId || !patientId || !readout || typeof global.fetch !== 'function') return;
    details.__v11AuditLoading = true;
    readout.textContent = 'Läser append-only audit…';
    var headers = { Accept: 'application/json' };
    var token = adminToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    global
      .fetch(
        '/api/v1/cco-audit/booking/' +
          encodeURIComponent(bookingId) +
          '?patientId=' +
          encodeURIComponent(patientId),
        { method: 'GET', credentials: 'same-origin', headers: headers }
      )
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            if (!response.ok) throw new Error(payload.error || 'audit_read_failed');
            if (payload.readOnly !== true || payload.zeroWrites !== true) {
              throw new Error('audit_readout_not_read_only');
            }
            return payload;
          });
      })
      .then(function (payload) {
        var items = arr(payload.items);
        readout.innerHTML = items.length
          ? items
              .map(function (item) {
                var when = txt(item.occurredAt);
                var action = txt(item.action);
                return (
                  '<div class="book-audit__event"><strong>' +
                  esc(action) +
                  '</strong><span>' +
                  esc(when ? new Date(when).toLocaleString('sv-SE') : 'Tid saknas') +
                  '</span></div>'
                );
              })
              .join('')
          : '<span>Ingen create-audit hittades för bokningen.</span>';
        details.__v11AuditLoaded = true;
      })
      .catch(function (error) {
        readout.textContent =
          error && /forbidden|403/.test(String(error.message))
            ? 'Audit kräver owner/staff-behörighet.'
            : 'Audit kunde inte läsas.';
      })
      .finally(function () {
        details.__v11AuditLoading = false;
      });
  }

  function bindBookingAudit(details) {
    if (!details || details.__v11AuditClickBound) return;
    details.__v11AuditClickBound = true;
    details.addEventListener('click', function (event) {
      // Auditkontrollen ligger inuti sektionens befintliga V11/V12-handoff.
      // Behåll details-standardbeteendet, men låt aldrig klicket nå sektionen.
      event.stopPropagation();
    });
  }

  function bindBookingAudits(root) {
    if (!root) return;
    if (root.matches && root.matches('[data-v11-booking-audit]')) bindBookingAudit(root);
    if (root.querySelectorAll) {
      Array.prototype.forEach.call(
        root.querySelectorAll('[data-v11-booking-audit]'),
        bindBookingAudit
      );
    }
  }

  function observeBesok() {
    var doc = global.document;
    if (!doc || !global.MutationObserver || global.__v11rkBesokObserving) return;
    global.__v11rkBesokObserving = true;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-v11-rk-besok]'), hydrateBesok);
    var obs = new global.MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches('[data-v11-rk-besok]')) hydrateBesok(n);
          if (n.querySelectorAll) {
            Array.prototype.forEach.call(n.querySelectorAll('[data-v11-rk-besok]'), hydrateBesok);
          }
        }
      }
    });
    obs.observe(doc.documentElement || doc.body || doc, { childList: true, subtree: true });
  }

  function observeBookingAudit() {
    var doc = global.document;
    if (!doc || global.__v11BookingAuditObserving) return;
    global.__v11BookingAuditObserving = true;
    bindBookingAudits(doc);
    if (global.MutationObserver) {
      var auditObserver = new global.MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes || [];
          for (var j = 0; j < added.length; j++) bindBookingAudits(added[j]);
        }
      });
      auditObserver.observe(doc.documentElement || doc.body || doc, {
        childList: true,
        subtree: true,
      });
    }
    doc.addEventListener(
      'toggle',
      function (event) {
        var details = event.target;
        if (
          details &&
          details.open &&
          details.matches &&
          details.matches('[data-v11-booking-audit]')
        ) {
          hydrateBookingAudit(details);
        }
      },
      true
    );
  }

  global.CcoV11RailKomplett = {
    render: render,
  };
  observeBesok();
  observeBookingAudit();
})(typeof window !== 'undefined' ? window : globalThis);
