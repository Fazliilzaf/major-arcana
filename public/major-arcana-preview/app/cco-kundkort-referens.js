/* Kundkort REFERENS-renderare — emitterar exakt REFERENS-markup (.kkref .doss).
   Defensiv databindning: riktig data ELLER tomt läge. ALDRIG demo-data på riktig patient.
   Exponeras som window.__renderReferensKundkort(card, bundle, journalEntries). */
(function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var A = function (x) {
    return Array.isArray(x) ? x : x ? [x] : [];
  };
  function initials(name) {
    var p = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ((p[0] || '')[0] || '?') + ((p[1] || '')[0] || '');
  }
  function ageFromPnr(pnr) {
    var d = String(pnr || '').replace(/\D/g, '');
    if (d.length < 8) return null;
    var y = parseInt(d.slice(0, 4), 10),
      now = new Date().getFullYear();
    return y > 1900 && y <= now ? now - y : null;
  }
  function ansClass(risk) {
    return risk === 'flag' ? 'a-fl' : risk === 'amber' ? 'a-am' : 'a-no';
  }
  function ansLabel(v, risk) {
    var ja = /ja|yes|true/i.test(String(v));
    var mark = risk === 'flag' || risk === 'amber' ? '⚠ ' : '';
    return ja ? mark + 'Ja' : 'Nej';
  }
  function sec(label, src, inner) {
    return (
      '<div class="sec"><div class="lab"><span class="car">▾</span> ' +
      esc(label) +
      (src ? '<span class="src">' + src + '</span>' : '') +
      '</div>' +
      inner +
      '</div>'
    );
  }
  function empty(t) {
    return '<div class="empty">' + esc(t) + '</div>';
  }

  window.__renderReferensKundkort = function (card, bundle, journalEntries) {
    card = card || {};
    bundle = bundle || {};
    var bcard =
      bundle.card && typeof bundle.card === 'object' ? Object.assign({}, card, bundle.card) : card;
    var name = bcard.displayName || bcard.name || bcard.fullName || 'Kund';
    var phone = bcard.primaryPhone || (bcard.contact && bcard.contact.phone) || '';
    var email = bcard.primaryEmail || (bcard.contact && bcard.contact.email) || '';
    var addr = bcard.contact && bcard.contact.address;
    var addrLine = addr
      ? [addr.street, [addr.zip, addr.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : '';
    var treatment = A(bcard.treatmentTypes).join(', ');
    var age = ageFromPnr(bcard.personnummer);

    /* ---- header tags ---- */
    var tags = '';
    if (bcard.vip || (bcard.tags && bcard.tags.vip)) tags += '<span class="dtag vip">VIP</span>';
    if (treatment) tags += '<span class="dtag cure">' + esc(treatment) + '</span>';
    if (bcard.engagement || (bcard.tags && bcard.tags.engagement))
      tags +=
        '<span class="dtag eng">' +
        esc(bcard.engagement || bcard.tags.engagement) +
        '% engagemang</span>';

    /* ---- journey ---- */
    var journey = bundle.journey || bcard.journey || null;
    var steps = journey && A(journey.steps).length ? A(journey.steps) : null;
    var cur = (journey && (journey.currentStep || journey.step)) || null;
    var total = (journey && journey.totalSteps) || 9;
    var parityJourney =
      window.CcoV9CustomersParity &&
      typeof window.CcoV9CustomersParity.buildV11CustomerJourney === 'function'
        ? window.CcoV9CustomersParity.buildV11CustomerJourney(bcard, journalEntries, bundle)
        : null;
    if (parityJourney && parityJourney.steps && parityJourney.steps.length) {
      steps = parityJourney.steps.map(function (s) {
        return {
          id: s.step,
          label: s.label,
          note: s.meta || s.dueLabel || '',
          state: s.status === 'done' ? 'done' : s.status === 'active' ? 'active' : 'todo',
        };
      });
      cur = parityJourney.doneCount != null ? parityJourney.doneCount : cur;
      total = 9;
    }

    /* ---- health declaration (REAL only) ---- */
    var hd = bcard.healthDeclaration || bundle.healthDeclaration || null;
    var hdAnswers = hd && A(hd.answers).length ? A(hd.answers) : null;
    var hdSigned = hd && (hd.signed || hd.signedAt);
    var allergies = A(bcard.allergies).length ? A(bcard.allergies) : (hd && A(hd.allergies)) || [];

    /* ===== BUILD ===== */
    var h = '<div class="doss">';

    /* header */
    h +=
      '<div class="dhead"><div class="ring"><div class="av">' +
      esc(initials(name)) +
      '</div></div>' +
      '<div style="flex:1"><div class="dk">KUNDDOSSIÉR</div><div class="dn">' +
      esc(name) +
      '</div>' +
      '<div class="dc">' +
      (phone ? '📞 ' + esc(phone) : '') +
      (email ? ' · ✉ ' + esc(email) : '') +
      '</div>' +
      (addrLine ? '<div class="dc">📍 ' + esc(addrLine) + '</div>' : '') +
      (tags ? '<div class="dtags">' + tags + '</div>' : '') +
      '</div></div>';

    h += '<div class="ds">';

    /* smart sammanfattning */
    var nextLabel = (journey && (journey.nextLabel || journey.next)) || bcard.nextStep || '';
    if (nextLabel || cur) {
      h +=
        '<div class="summ"><span class="sk">SMART SAMMANFATTNING</span>' +
        (cur ? '<b>Steg ' + esc(cur) + ' av ' + esc(total) + '.</b> ' : '') +
        (nextLabel ? 'Nästa: ' + esc(nextLabel) + '.' : 'Kundresan pågår.') +
        '</div>';
    }

    /* stats */
    var visits = bcard.visits || (bcard.stats && bcard.stats.visits);
    var revenue =
      bcard.lifetimeValueLabel || bcard.lifetimeValue || (bcard.stats && bcard.stats.revenue);
    var noshow = bcard.noShows != null ? bcard.noShows : bcard.stats && bcard.stats.noShows;
    if (visits != null || revenue != null || noshow != null) {
      h +=
        '<div class="s3">' +
        '<div class="k"><div class="l">Besök</div><div class="v">' +
        esc(visits != null ? visits : '—') +
        '</div></div>' +
        '<div class="k"><div class="l">Intäkt</div><div class="v">' +
        esc(revenue != null ? revenue : '—') +
        '</div></div>' +
        '<div class="k"><div class="l">No-show</div><div class="v">' +
        esc(noshow != null ? noshow : '—') +
        '</div></div></div>';
    }

    h += '<div class="gthread"></div>';

    /* medicinskt-banner */
    if (allergies.length) {
      h +=
        '<div class="med"><div class="mi">!</div><div style="font-size:10.5px"><b>Medicinskt:</b> Allergi — ' +
        esc(allergies.join(' · ')) +
        '.</div></div>';
    }

    /* hälsodeklaration */
    var hdInner;
    if (hdAnswers) {
      var flags = hdAnswers.filter(function (a) {
        return a.risk === 'flag' || a.risk === 'amber';
      });
      hdInner = '';
      if (flags.length)
        hdInner +=
          '<div class="flag"><div class="fi">!</div><div><b>' +
          flags.length +
          ' riskflagg' +
          (flags.length === 1 ? 'a' : 'or') +
          ':</b> ' +
          esc(
            flags
              .map(function (f) {
                return f.label;
              })
              .join(' · ')
          ) +
          ' — verifiera före ingrepp.</div></div>';
      hdInner += hdAnswers
        .map(function (a) {
          return (
            '<div class="qrow"><div><div class="q">' +
            esc(a.label) +
            '</div>' +
            (a.detail ? '<div class="qv">' + esc(a.detail) + '</div>' : '') +
            '</div>' +
            '<span class="ans ' +
            ansClass(a.risk) +
            '">' +
            esc(ansLabel(a.value, a.risk)) +
            '</span></div>'
          );
        })
        .join('');
      hdInner += '<div class="hdfoot">🔒 Endast visning · medicinsk data · ingen extern AI</div>';
      h += sec('Hälsodeklaration', hdSigned ? esc(hd.source || 'Signerad') : '', hdInner);
    } else {
      h += sec(
        'Hälsodeklaration',
        '<span class="sb-chip">Att fylla i</span>',
        empty('Hälsodeklaration saknas — efterfrågas före behandling.')
      );
    }

    /* kundresa */
    if (steps) {
      var pct = cur ? Math.round((cur / total) * 100) : 0;
      var stepHtml = steps
        .map(function (s) {
          var st = s.state === 'done' ? 'done' : s.state === 'active' ? 'act' : 'todo';
          var mk = st === 'done' ? '✓' : s.id || '';
          return (
            '<div class="step ' +
            st +
            '"><div class="mk">' +
            esc(mk) +
            '</div><div><div class="t">' +
            esc(s.label) +
            '</div>' +
            (s.note ? '<div class="s">' + esc(s.note) + '</div>' : '') +
            '</div></div>'
          );
        })
        .join('');
      h += sec(
        'Kundresa · ' + total + ' steg',
        cur ? '<span class="sb-chip">Steg ' + esc(cur) + '</span>' : '',
        '<div class="jcard"><div class="stepwrap"><div class="sbar" style="width:' +
          pct +
          '%"></div></div>' +
          '<div class="sl">' +
          (cur ? cur + ' / ' + total + ' steg' : '') +
          (nextLabel ? ' · nästa: ' + esc(nextLabel) : '') +
          '</div>' +
          stepHtml +
          '</div>'
      );
    }

    /* smart nästa steg */
    var signals = A(bcard.automationSignals || bundle.signals).filter(function (s) {
      return s && (s.status === 'active' || s.level);
    });
    if (signals.length) {
      h += sec(
        'Smart nästa steg',
        String(signals.length),
        signals
          .slice(0, 4)
          .map(function (s) {
            var tone = /block|legal/.test(s.risk || s.level || '') ? 'block' : 'info';
            var pill =
              tone === 'block'
                ? '<span class="pill p-block">Blockerare</span>'
                : '<span class="pill" style="background:var(--info-bg);color:var(--info)">Info</span>';
            return (
              '<div class="row acc ' +
              tone +
              '"><div><div class="rt">' +
              esc(s.what || s.label || '—') +
              '</div><div class="rm">' +
              esc(s.ruleId || s.id || '') +
              '</div></div>' +
              pill +
              '</div>'
            );
          })
          .join('')
      );
    }

    h += '<div class="gthread"></div>';

    /* bokningar */
    var up = A(bundle.bookings && bundle.bookings.upcoming).length
      ? A(bundle.bookings.upcoming)
      : A(bcard.upcomingBookings);
    h += sec(
      'Kommande bokningar',
      String(up.length),
      up.length ? up.slice(0, 5).map(bookingRow).join('') : empty('Inga kommande bokningar.')
    );
    var hist = A(bundle.bookings && bundle.bookings.history).length
      ? A(bundle.bookings.history)
      : A(bcard.bookingHistory);
    h += sec(
      'Historik',
      String(hist.length),
      hist.length
        ? hist
            .slice(0, 6)
            .map(function (b) {
              return bookingRow(b, true);
            })
            .join('')
        : empty('Ingen historik ännu.')
    );

    /* journaler */
    var jrs = A(journalEntries).length ? A(journalEntries) : A(bundle.journals);
    function referensJournalVisualState(j) {
      if (j.locked) return 'done';
      if (j.canSign || /draft|open|active|utkast/i.test(String(j.status || ''))) return 'act';
      if (j.state === 'todo') return 'todo';
      return j.locked ? 'done' : 'act';
    }
    h += sec(
      'Journaler · personal',
      String(jrs.length),
      jrs.length
        ? jrs
            .slice(0, 8)
            .map(function (j) {
              var st = referensJournalVisualState(j);
              var ic = st === 'done' ? '✓' : st === 'act' ? '!' : '';
              var entryId = esc(j.entryId || j.id || '');
              var jType = esc(j.journalType || '');
              return (
                '<div class="jr ' +
                (st === 'done' ? '' : st) +
                '"><div class="jc ' +
                st +
                '">' +
                ic +
                '</div>' +
                '<div style="flex:1"><div class="rt">' +
                esc(j.title || j.journalType || 'Journalanteckning') +
                '</div>' +
                '<div class="rm">' +
                esc(
                  [
                    j.step ? 'Steg ' + j.step : '',
                    j.date || j.signedAt || j.createdAt || '',
                    j.by || j.authorName || '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                ) +
                '</div></div>' +
                (st === 'act' && entryId
                  ? '<span class="openb kkx-openb" data-kkx-journal-entry="' +
                    entryId +
                    '" data-kkx-journal-type="' +
                    jType +
                    '">Öppna</span>'
                  : '') +
                '</div>'
              );
            })
            .join('')
        : empty('Inga journaler ännu.')
    );

    /* offerter */
    var offers = A(bundle.offers && bundle.offers.items).length
      ? A(bundle.offers.items)
      : A(bcard.offers);
    if (offers.length) {
      h += sec(
        'Offerter · commit',
        '<span style="color:var(--success);font-weight:800">' +
          esc((bundle.offers && bundle.offers.total) || '') +
          '</span>',
        offers
          .map(function (o) {
            var ok = /godk/i.test(o.status || '');
            return (
              '<div class="row"><span class="pill" style="margin:0;background:linear-gradient(180deg,#f2e6cf,#e0caa0);color:#7a5a16">' +
              esc(o.type || 'TP') +
              '</span><div style="flex:1"><div class="rt">' +
              esc(o.title || 'Offert') +
              '</div>' +
              '<div class="rm">' +
              esc(o.detail || '') +
              '</div></div><span class="pill ' +
              (ok ? 'p-ok' : 'p-warn') +
              '">' +
              esc(ok ? '✓ Godkänd' : 'Väntar') +
              '</span></div>'
            );
          })
          .join('')
      );
    }

    /* auto-dokument */
    var autoDocs = A(bundle.autoDocs);
    if (autoDocs.length) {
      h += sec(
        'Auto-dokument · system',
        '',
        autoDocs
          .map(function (d) {
            return (
              '<div class="row"><div style="flex:1"><div class="rt">' +
              esc(d.title) +
              '</div><div class="rm">' +
              esc([d.step ? 'Steg ' + d.step : '', d.date || ''].filter(Boolean).join(' · ')) +
              '</div></div><span style="font-size:10px;font-weight:800;color:var(--success)">✓ ' +
              esc(d.status || 'levererat') +
              '</span></div>'
            );
          })
          .join('')
      );
    }

    h += '<div class="gthread"></div>';

    /* foton */
    var photos = A(bundle.photos);
    if (photos.length) {
      h += sec(
        'Foton',
        String(
          photos.reduce(function (n, p) {
            return n + (p.count || 1);
          }, 0)
        ),
        '<div class="files">' +
          photos
            .slice(0, 3)
            .map(function (p) {
              return (
                '<div class="fimg"><div class="t" style="background:radial-gradient(circle at 40% 30%,#caa98a,#7c5a3e)"></div>' +
                (p.count ? '<span class="b">' + esc(p.count) + '</span>' : '') +
                '<span class="fl">' +
                esc(p.type || 'Foto') +
                '</span></div>'
              );
            })
            .join('') +
          '</div>'
      );
    } else {
      h += sec('Foton', '0', empty('Inga foton ännu.'));
    }

    /* ekonomi */
    var eco =
      bundle.economy ||
      (bcard.lifetimeValue ? { total: bcard.lifetimeValueLabel || bcard.lifetimeValue } : null);
    if (eco) {
      h += sec(
        'Ekonomi',
        'Fortnox',
        '<div class="eg"><div class="k"><div class="l">Total intäkt</div><div class="v">' +
          esc(eco.total || '—') +
          '</div></div><div class="k"><div class="l">Livstidsvärde</div><div class="v">' +
          esc(eco.ltv || '—') +
          '</div></div></div>'
      );
    }

    /* insikter */
    var insights = A(bundle.insights);
    if (insights.length) {
      h +=
        '<div class="sec nb"><div class="lab"><span class="car">▾</span> Insikter <span class="src">' +
        insights.length +
        '</span></div>' +
        insights
          .map(function (i) {
            return '<div class="aic">' + esc(i.text || i) + '</div>';
          })
          .join('') +
        '</div>';
    }

    /* action-stack */
    h +=
      '<div class="acts"><div class="btn dark">📷 Ta bild · spara i journal</div>' +
      '<div class="btn gold">Boka nästa</div>' +
      '<div class="r2"><div class="btn">✎ Anteckna</div><div class="btn">✉ Svarstudio</div></div>' +
      '<div class="btn green">✓ Bekräfta kommande tider' +
      (up.length ? ' (' + up.length + ')' : '') +
      '</div></div>';

    h += '</div></div>';
    return h;
  };

  function bookingRow(b, isHist) {
    var esc2 = esc;
    var d = String(b.date || b.occurredAt || '').match(/(\d{1,2})\D+(\d{1,2})/);
    var months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAJ',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OKT',
      'NOV',
      'DEC',
    ];
    var day = d ? d[1] : '',
      mon = d ? months[(parseInt(d[2], 10) || 1) - 1] : '';
    var ready = /redo|klar|done|ready/i.test(b.status || '');
    return (
      '<div class="row acc ' +
      (isHist ? 'grey' : 'teal') +
      '">' +
      '<div class="bd"><div class="d">' +
      esc2(day) +
      '</div><div class="m">' +
      esc2(mon) +
      '</div></div>' +
      '<div style="flex:1"><div class="rt">' +
      esc2(b.title || 'Bokning') +
      '</div><div class="rm">' +
      esc2([b.time, b.duration, b.staff].filter(Boolean).join(' · ')) +
      '</div></div>' +
      '<span class="pill ' +
      (ready ? 'p-ok' : 'p-warn') +
      '">' +
      esc2(b.status || 'Bokad') +
      '</span></div>'
    );
  }
})();
