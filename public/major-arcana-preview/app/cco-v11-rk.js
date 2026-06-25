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
    out +=
      '<div class="dhead" data-v9-section-link="profil"><div class="avatar">' +
      esc(initials(name)) +
      '</div>' +
      '<div class="head-body">' +
      '<div class="kicker">' +
      esc(cur ? 'Aktiv steg ' + cur : 'Kund') +
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
        (av.practitioner ? '<div class="av-staff">' + esc(av.practitioner) + '</div>' : '') +
        '</div>' +
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
        '<button class="av-btn sec" data-v11-active-visit-action="notes">✏</button></div></div>';
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

    /* E · HÄLSODEKLARATION */
    if (health) {
      var answers = arr(health.answers);
      out += secOpen(
        'halsa',
        'sec',
        label('Hälsodeklaration', health.signedAt ? 'Signerad ' + txt(health.signedAt) : '') +
          '<div class="hd-rows">' +
          (answers.length
            ? answers
                .map(function (a) {
                  var v = txt(a.value);
                  var p = /ja|allerg/i.test(v)
                    ? /allerg|penicillin/i.test(v)
                      ? 'danger'
                      : 'yes'
                    : 'no';
                  return (
                    '<div class="hd-row"><span class="hd-q">' +
                    esc(txt(a.label || a.q)) +
                    '</span><span class="pill ' +
                    p +
                    '">' +
                    esc(v || '—') +
                    '</span></div>'
                  );
                })
                .join('')
            : '<div class="hd-row"><span class="hd-q">Inga registrerade svar</span></div>') +
          '</div><div class="hd-foot"><a>Visa historik</a><a>Redigera svar</a></div>'
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
              return (
                '<div class="file-row"><span class="file-icn">📄</span><span class="file-name">' +
                esc(txt(f.name || f.title || 'Fil')) +
                '</span></div>'
              );
            })
            .join('')
      );
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
            var dir = /ut|out/i.test(txt(c.direction)) ? 'out' : 'in';
            var ic = /sms/i.test(txt(c.channel)) ? '📱' : '✉';
            return (
              '<div class="comm-row"><span class="comm-icn ' +
              dir +
              '">' +
              ic +
              '</span>' +
              '<div class="comm-text">' +
              esc(txt(c.subject || c.preview || c.text || 'Meddelande')) +
              '<div class="comm-meta">' +
              esc(txt(c.dateLabel || c.date || '')) +
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
          '</div></div></div>'
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
      '</div></div>';

    return '<div class="v11-rk" data-v11-rk="1"><div class="v11-rk__shell">' + out + '</div></div>';
  }

  global.CcoV11RailKomplett = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
