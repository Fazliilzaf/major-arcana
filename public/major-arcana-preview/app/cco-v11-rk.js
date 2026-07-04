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

  function render(ctx) {
    ctx = ctx || {};
    var card = ctx.bcard || ctx.card || {};
    var bundle = ctx.dossierBundle || null;
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
    var entries = arr(ctx.journalEntries);

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
      '<button class="btn-edit-profile" data-v12-edit-open>Ändra profil</button>' +
      '</div></div>';

    /* B · SMART INFORMATION */
    if (smart && smart.what) {
      out +=
        '<div class="banner-smart"><div class="lbl">Smart information</div>' +
        '<div class="txt">' +
        esc(txt(smart.what)) +
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
    out +=
      '<div class="stats">' +
      '<div class="stat hero"><div class="lbl">Besök · i år</div><div class="val">' +
      esc(visits) +
      '</div><div class="sub">&nbsp;</div></div>' +
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
          '<div class="av-pre warn"><div class="pre-icn">!</div><div class="pre-title">' +
            esc(lbl) +
            '</div><div class="pre-meta">Krävs idag</div><div class="pre-cta">Öppna →</div></div>'
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
        '</div></div>' +
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
          : hdRow('Allergier', 'NEJ', 'no');
        rows += hMeds.length
          ? hdRow('Pågående mediciner', 'JA · ' + hMeds.length + ' st', 'yes')
          : hdRow(
              'Pågående mediciner',
              health.medications && health.medications.known ? 'JA' : 'NEJ',
              health.medications && health.medications.known ? 'yes' : 'no'
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
          '</div><div class="hd-foot"><a>Visa historik</a><a>Redigera svar</a><a>Kopiera länk</a></div>'
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
              var tail =
                s.state === 'done'
                  ? '<span class="ok">Klart</span>'
                  : s.state === 'active'
                    ? '<span class="sub">Pågår</span>'
                    : '<span class="sub">Kommande</span>';
              return (
                '<div class="j-step ' +
                st +
                '"><span class="badge">' +
                badge +
                '</span><span class="label">' +
                esc(txt(s.label)) +
                '</span>' +
                tail +
                '</div>'
              );
            })
            .join('') +
          '</div>'
      );
    }

    /* G · SMART NÄSTA STEG */
    if (smart && smart.what) {
      out +=
        '<div class="sec">' +
        label('Smart nästa steg') +
        '<div class="next-row"><div class="what">' +
        esc(txt(smart.what)) +
        '</div>' +
        '<button class="btn-action" data-kk-sig="' +
        esc(smart.ruleId) +
        '">' +
        esc(smart.ctaLabel || 'Åtgärda') +
        '</button></div></div>';
    }

    /* H · KOMMANDE BOKNINGAR */
    var up = arr(bundle && bundle.upcomingBookings);
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
                  esc(txt(b.dayLabel || b.day || '—')) +
                  '</span></div>' +
                  '<div><div class="book-title">' +
                  esc(txt(b.title || b.serviceLabel || 'Bokning')) +
                  '</div>' +
                  '<div class="book-meta">' +
                  esc(txt(b.timeLabel || b.time || '')) +
                  '</div></div>' +
                  '<span class="q-status warn">Bokad</span></div>'
                );
              })
              .join('')
          : '<div class="next-row"><div class="what" style="color:var(--ink-mute)">Inga kommande bokningar</div></div>')
    );

    /* I · HISTORIK */
    var hist = arr(bundle && bundle.historyBookings);
    if (hist.length) {
      out += secOpen(
        'historik',
        'sec',
        label('Historik') +
          hist
            .slice(0, 4)
            .map(function (b) {
              return (
                '<div class="hist-row"><div class="book-date"><span class="d">' +
                esc(txt(b.dayLabel || b.day || '—')) +
                '</span></div>' +
                '<div><div class="book-title">' +
                esc(txt(b.title || 'Besök')) +
                '</div></div><span class="q-status green">Genomförd</span></div>'
              );
            })
            .join('')
      );
    }

    /* J · JOURNALER */
    if (entries.length) {
      out += secOpen(
        'journal',
        'sec',
        label('Journaler · personal') +
          entries
            .slice(0, 5)
            .map(function (e) {
              var signed = /sign|locked/i.test(txt(e.status));
              var mk = signed ? 'done' : 'active';
              return (
                '<div class="j-row"><span class="j-mark ' +
                mk +
                '">' +
                (signed ? '✓' : '·') +
                '</span>' +
                '<span class="j-name">' +
                esc(txt(e.title || e.journalType || 'Journal')) +
                '</span>' +
                '<span class="j-status' +
                (signed ? '' : ' active') +
                '">' +
                (signed ? 'Signerad' : 'Utkast') +
                '</span></div>'
              );
            })
            .join('')
      );
    }

    /* K · OFFERTOR */
    var offers = arr(
      (bundle && (bundle.offers || (bundle.commercialCase && bundle.commercialCase.offers))) || []
    );
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
          : '<div class="next-row"><div class="what" style="color:var(--ink-mute)">Inga offerter ännu</div></div>')
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

    /* L2 · BESÖK / TILLFÄLLEN (visit-segments, read-only; hydreras async)
       Placeras mellan Historik och Foton. Overifierade native-assets
       (NEEDS_REVIEW/REJECTED/DUPLICATE) exkluderas redan vid API:t
       (src/routes/ccoPatientMaster.js:535) → bara godkända tillfällen når hit.
       Sektionen börjar dold; hydreringen visar den bara om det finns daterade
       tillfällen, annars tas hela sektionen bort (ingen tom rubrik). */
    var besokPid = txt(card.patientId || card.id || card.customerId);
    if (besokPid) {
      out +=
        '<div class="sec" data-v9-section-link="besok-tillfallen" data-v11-rk-besok-sec hidden>' +
        label('Besök · tillfällen') +
        '<div class="v11-rk-besok" data-v11-rk-besok="' +
        esc(besokPid) +
        '"></div></div>';
    }

    /* M · FOTON */
    var ph = arr(photos && photos.items ? photos.items : photos);
    if (ph.length) {
      out += secOpen(
        'foto',
        'sec',
        label('Foton') +
          '<div class="photo-grid">' +
          ph
            .slice(0, 6)
            .map(function (p) {
              var bg = p.thumbnailUrl || p.viewUrl || p.url;
              return (
                '<div class="photo-tile raw"' +
                (bg ? ' style="background-image:url(' + esc(bg) + ')"' : '') +
                '>' +
                '<span class="lbl">' +
                esc(txt(p.dateLabel || p.photoDateLabel || 'Foto').slice(0, 8)) +
                '</span></div>'
              );
            })
            .join('') +
          '</div>'
      );
    }

    /* M½ · BESÖK/TILLFÄLLEN (read-only visit-segments API, intill Foton) */
    var pid = txt(card.patientId || card.id);
    var vsApi = global.CcoKundkortVisitSegments;
    if (vsApi && pid) {
      var visitSegments = arr(ctx.visitSegments);
      var vsInner = visitSegments.length
        ? vsApi.renderV11RailBesokInner(visitSegments)
        : vsApi.renderV11RailBesokPlaceholderInner(pid);
      var vsWhen = visitSegments.length ? String(vsApi.countDatedSegments(visitSegments)) : '…';
      out += secOpen(
        'photos',
        'sec',
        label('Besök/tillfällen', vsWhen) +
          '<div class="v11-rk__besok-tillfallen">' +
          vsInner +
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
      out +=
        '<div class="sec">' +
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
          .join('') +
        '</div>';
    }

    /* P · KOMMUNIKATION */
    var cm = arr(comm && comm.items ? comm.items : comm);
    if (cm.length) {
      out +=
        '<div class="sec">' +
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
          .join('') +
        '</div>';
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

    /* R · INSIKTER */
    var ins = arr(insights && insights.items ? insights.items : insights);
    if (ins.length) {
      out +=
        '<div class="sec">' +
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
          .join('') +
        '</div>';
    }

    /* S · STICKY FOOTER */
    out +=
      '<div class="sticky"><div class="sticky-grid">' +
      '<button class="sticky-btn primary full" data-v11-active-visit-action="photo">📷 Ta bild + öppna journal</button>' +
      '<button class="sticky-btn gold full" data-v9-section-link="upcoming">📅 Boka nästa</button>' +
      '<button class="sticky-btn ghost" data-v11-active-visit-action="notes">+ Anteckning</button>' +
      '<button class="sticky-btn ghost" data-v9-section-link="ekonomi">+ Saldo</button>' +
      '<button class="sticky-btn green full" data-v11-active-visit-action="complete">✓ Bekräfta incheckning</button>' +
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
  function renderBesokOccasion(seg) {
    if (!seg || !seg.date) return '';
    var vt = besokVisitType(seg);
    var title = [vt || txt(seg.label) || 'Besök', txt(seg.timeRange)].filter(Boolean).join(' · ');
    var imgs = arr(seg.images);
    var docs = arr(seg.documents);
    var counts = [];
    if (imgs.length) counts.push(imgs.length + (imgs.length === 1 ? ' foto' : ' foton'));
    if (docs.length) counts.push(docs.length + ' dokument');
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
          .slice(0, 6)
          .map(function (im) {
            var bg = txt(im.thumbnailUrl || im.openRef);
            return (
              '<div class="photo-tile raw"' +
              (bg ? ' style="background-image:url(' + esc(bg) + ')"' : '') +
              '><span class="lbl">' +
              esc(txt(im.timeLabel || '').slice(0, 8)) +
              '</span></div>'
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
    return head + reasonLine + photoGrid + docRows;
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
        mount.innerHTML = dated.slice(0, 8).map(renderBesokOccasion).join('');
        if (sec) sec.removeAttribute('hidden');
      })
      .catch(drop);
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

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', observeBesok, { once: true });
    } else {
      observeBesok();
    }
  }

  global.CcoV11RailKomplett = {
    render: render,
    renderBesokOccasion: renderBesokOccasion,
    hydrateBesok: hydrateBesok,
  };
})(typeof window !== 'undefined' ? window : globalThis);
