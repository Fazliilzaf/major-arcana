/* Kundkort REFERENS-renderare — emitterar exakt REFERENS-markup (.kkref .doss).
   Defensiv databindning: riktig data ELLER tomt läge. ALDRIG demo-data på riktig patient.
   Exponeras som window.__renderReferensKundkort(card, bundle, journalEntries, extras). */
(function () {
  'use strict';
  var CANONICAL_SIGNAL_IDS = {
    'customer.missing_health_declaration': 1,
    'customer.missing_journal': 1,
    'customer.missing_treatment_plan': 1,
    'customer.cooling_off_active': 1,
    'customer.cooling_off_passed': 1,
    'customer.missing_agreement_consent_bundle': 1,
    'customer.missing_operation_day_insurance': 1,
    'customer.missing_photo_consent': 1,
    'customer.has_photo_review': 1,
    'customer.ready_for_treatment': 1,
  };

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

  function referensHasSignedHd(card) {
    return Boolean(
      card &&
      (card.hasHealthDeclaration ||
        !card.missingHealthDeclaration ||
        (card.healthDeclaration &&
          (card.healthDeclaration.signedAt || card.healthDeclaration.signed)))
    );
  }

  function resolveReferensDocs(card, bundle) {
    if (window.CcoV9CustomersParity?.resolveV11DocumentPayload) {
      return window.CcoV9CustomersParity.resolveV11DocumentPayload(card, bundle);
    }
    var docs = bundle && bundle.documents;
    if (docs && typeof docs === 'object' && bundle.ready !== false) {
      return {
        ready: true,
        offers: A(docs.offers || docs.offerter),
        autoDocs: A(docs.autoDokument || docs.auto || docs.autoDocuments || docs.autoDocs),
        healthForms: A(docs.healthForms || docs.haelsoSamtycke || docs.consents),
      };
    }
    return { ready: false, offers: [], autoDocs: [], healthForms: [] };
  }

  function resolveReferensOffers(docsPayload, commercialCase) {
    var offers = A(docsPayload.offers);
    var ccOffer = commercialCase && (commercialCase.offer || commercialCase.activeOffer);
    if (ccOffer && typeof ccOffer === 'object') {
      var exists = offers.some(function (o) {
        return String(o.id || o.offerId || '') === String(ccOffer.id || ccOffer.offerId || '');
      });
      if (!exists) {
        offers.unshift({
          type: ccOffer.templateKey || ccOffer.type || 'TP',
          title: ccOffer.title || ccOffer.name || 'Offert',
          detail: ccOffer.amountLabel || ccOffer.totalLabel || '',
          status: ccOffer.status || ccOffer.esignStatus || 'pending',
        });
      }
    }
    return offers;
  }

  function resolveReferensPhotos(card, driveFiles) {
    var tiles = [];
    A(driveFiles).forEach(function (f) {
      if (tiles.length >= 3) return;
      var mime = String(f.mimeType || f.contentType || '').toLowerCase();
      var name = String(f.originalFileName || f.fileName || f.name || '').toLowerCase();
      if (!mime.startsWith('image/') && !/\.(jpe?g|png|heic|webp|gif)$/i.test(name)) return;
      tiles.push({
        type: f.category || f.photoType || 'Foto',
        count: 1,
      });
    });
    return tiles;
  }

  function mapHdAnswers(hd) {
    if (!hd || typeof hd !== 'object') return null;
    if (A(hd.answers).length) return A(hd.answers);
    if (A(hd.flags).length) {
      return hd.flags.map(function (f) {
        return {
          label: f.label || f.key || f.question || 'Flagga',
          value: f.value != null ? f.value : 'Ja',
          risk: f.risk || f.level || 'flag',
          detail: f.detail || f.note || '',
        };
      });
    }
    return null;
  }

  function hdSourceLabel(hd, card) {
    if (!hd) return '';
    if (hd.signedAt || hd.signed) {
      var src = hd.sourceSystem || hd.source || card.healthDeclarationSource || '';
      if (/halso|m365/i.test(String(src))) return 'Signerad · halso@';
      return 'Signerad';
    }
    return '';
  }

  function polishReferensJourney(canonicalJourney, steps, cur, total) {
    if (!steps || !canonicalJourney) return { steps: steps, cur: cur, total: total, nextLabel: '' };
    var active = steps.find(function (s) {
      return s.state === 'active';
    });
    var doneCount = steps.filter(function (s) {
      return s.state === 'done';
    }).length;
    var nextLabel = canonicalJourney.nextLabel || (active ? active.label : '');
    return {
      steps: steps,
      cur:
        canonicalJourney.activeStep != null
          ? canonicalJourney.activeStep
          : active
            ? active.id
            : doneCount,
      total: total,
      nextLabel: nextLabel,
      doneCount: doneCount,
    };
  }

  function filterCanonicalSignals(card, bundle) {
    var raw = A((card && card.automationSignals) || bundle.signals);
    var filtered = raw.filter(function (s) {
      return s && CANONICAL_SIGNAL_IDS[String(s.ruleId || '')];
    });
    if (window.CcoKunderSmartNextStep?.sortSignals) {
      return window.CcoKunderSmartNextStep.sortSignals(filtered);
    }
    return filtered;
  }

  window.__renderReferensKundkort = function (card, bundle, journalEntries, extras) {
    card = card || {};
    bundle = bundle || {};
    extras = extras || {};
    var driveFiles = A(extras.driveFiles);
    var commercialCase = extras.commercialCase || null;
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

    var docsPayload = resolveReferensDocs(bcard, bundle);
    var offers = resolveReferensOffers(docsPayload, commercialCase);
    var autoDocs = A(docsPayload.autoDocs);
    var photos = resolveReferensPhotos(bcard, driveFiles.length ? driveFiles : A(bundle.photos));

    /* ---- header tags ---- */
    var tags = '';
    if (bcard.vip || (bcard.tags && bcard.tags.vip)) tags += '<span class="dtag vip">VIP</span>';
    if (treatment) tags += '<span class="dtag cure">' + esc(treatment) + '</span>';
    if (bcard.engagement || (bcard.tags && bcard.tags.engagement))
      tags +=
        '<span class="dtag eng">' +
        esc(bcard.engagement || bcard.tags.engagement) +
        '% engagemang</span>';

    /* ---- journey (mockup canonical 9 steg — samma facit som ⤢ overlay) ---- */
    var steps = null;
    var cur = null;
    var total = 9;
    var nextLabel = '';
    var canonicalJourney =
      window.CcoKundkortKkx && typeof window.CcoKundkortKkx.buildCanonicalJourneyLive === 'function'
        ? window.CcoKundkortKkx.buildCanonicalJourneyLive(bcard, journalEntries, bundle)
        : null;
    if (canonicalJourney && canonicalJourney.steps && canonicalJourney.steps.length) {
      steps = canonicalJourney.steps.map(function (s) {
        return {
          id: s.step,
          label: s.label,
          note: s.meta || '',
          state: s.status === 'done' ? 'done' : s.status === 'active' ? 'active' : 'todo',
        };
      });
      var polished = polishReferensJourney(canonicalJourney, steps, cur, 9);
      steps = polished.steps;
      cur = polished.cur;
      total = 9;
      nextLabel = polished.nextLabel || nextLabel;
    }

    /* ---- health declaration (patient-master + halso@) ---- */
    var hd = bcard.healthDeclaration || bundle.healthDeclaration || null;
    var hdAnswers = mapHdAnswers(hd);
    var hdSigned = referensHasSignedHd(bcard) || Boolean(hd && (hd.signed || hd.signedAt));
    var hdSource = hdSourceLabel(hd, bcard);
    var allergies = A(bcard.allergies).length ? A(bcard.allergies) : (hd && A(hd.allergies)) || [];

    /* ---- canonical signals (10) ---- */
    var signals = filterCanonicalSignals(bcard, bundle);

    /* ---- economy ---- */
    var ltvRaw = bcard.lifetimeValue ?? bcard.dealValue ?? bcard.pipedriveDealValue;
    var ltvLabel =
      bcard.lifetimeValueLabel ||
      (Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0 ? String(ltvRaw) : null);

    /* ===== BUILD ===== */
    var h = '<div class="doss">';

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

    if (nextLabel || cur) {
      h +=
        '<div class="summ kkx-summ"><span class="sk">SMART SAMMANFATTNING</span>' +
        (cur ? '<b>Steg ' + esc(cur) + ' av ' + esc(total) + '.</b> ' : '') +
        (nextLabel ? 'Nästa: ' + esc(nextLabel) + '.' : 'Kundresan pågår.') +
        '</div>';
    }

    var visits = bcard.visits ?? bcard.visitCount ?? (bcard.stats && bcard.stats.visits);
    var revenue =
      bcard.lifetimeValueLabel ||
      (Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0 ? ltvRaw : null) ||
      (bcard.stats && bcard.stats.revenue);
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

    if (allergies.length) {
      h +=
        '<div class="med kkx-med"><div class="mi">!</div><div style="font-size:10.5px"><b>Medicinskt:</b> Allergi — ' +
        esc(allergies.join(' · ')) +
        '.</div></div>';
    }

    var hdInner;
    if (hdAnswers && hdAnswers.length) {
      var flags = hdAnswers.filter(function (a) {
        return a.risk === 'flag' || a.risk === 'amber';
      });
      hdInner = '';
      if (flags.length)
        hdInner +=
          '<div class="flag kkx-flag"><div class="fi">!</div><div><b>' +
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
            '<div class="qrow kkx-qrow"><div><div class="q">' +
            esc(a.label) +
            '</div>' +
            (a.detail ? '<div class="qv">' + esc(a.detail) + '</div>' : '') +
            '</div>' +
            '<span class="ans kkx-ans ' +
            ansClass(a.risk) +
            '">' +
            esc(ansLabel(a.value, a.risk)) +
            '</span></div>'
          );
        })
        .join('');
      if (hd && hd.consent && typeof hd.consent === 'object') {
        var consentVal = hd.consent.signed != null ? hd.consent.signed : hd.consent.value;
        hdInner +=
          '<div class="qrow kkx-qrow"><div><div class="q">Samtycke</div></div><span class="ans kkx-ans ' +
          ansClass(/ja|true/i.test(String(consentVal)) ? 'amber' : '') +
          '">' +
          esc(ansLabel(consentVal, '')) +
          '</span></div>';
      }
      hdInner +=
        '<div class="hdfoot kkx-foot">🔒 Endast visning · medicinsk data · ingen extern AI' +
        (hdSource ? ' · ' + esc(hdSource) : '') +
        '</div>';
      h += sec('Hälsodeklaration', hdSigned ? esc(hdSource || 'Signerad') : '', hdInner);
    } else if (hdSigned) {
      h += sec(
        'Hälsodeklaration',
        esc(hdSource || 'Signerad'),
        '<div class="hdfoot kkx-foot">Hälsodeklaration finns i patient-master' +
          (hdSource ? ' · ' + esc(hdSource) : '') +
          ' — detaljerade svar saknas i readout.</div>'
      );
    } else {
      h += sec(
        'Hälsodeklaration',
        '<span class="sb-chip">Att fylla i</span>',
        empty('Hälsodeklaration saknas — efterfrågas före behandling.')
      );
    }

    if (steps) {
      var pct = cur ? Math.round((cur / total) * 100) : 0;
      var stepHtml = steps
        .map(function (s) {
          var st = s.state === 'done' ? 'done' : s.state === 'active' ? 'act' : 'todo';
          var mk = st === 'done' ? '✓' : s.id || '';
          return (
            '<div class="step kkx-step ' +
            st +
            '"><div class="mk kkx-mk">' +
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
        '<div class="jcard"><div class="stepwrap kkx-barwrap"><div class="sbar kkx-bar" style="width:' +
          pct +
          '%"></div></div>' +
          '<div class="sl kkx-bl">' +
          (cur ? cur + ' / ' + total + ' steg' : '') +
          (nextLabel ? ' · nästa: ' + esc(nextLabel) : '') +
          '</div>' +
          stepHtml +
          '</div>'
      );
    }

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
    } else {
      h += sec('Smart nästa steg', '0', empty('Inga aktiva gates just nu.'));
    }

    h += '<div class="gthread"></div>';

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

    if (offers.length) {
      h += sec(
        'Offerter · commit',
        String(offers.length),
        offers
          .map(function (o) {
            var ok = /godk|signed|accepted/i.test(o.status || '');
            return (
              '<div class="row"><span class="pill" style="margin:0;background:linear-gradient(180deg,#f2e6cf,#e0caa0);color:#7a5a16">' +
              esc(o.type || 'TP') +
              '</span><div style="flex:1"><div class="rt">' +
              esc(o.title || 'Offert') +
              '</div>' +
              '<div class="rm">' +
              esc(o.detail || o.amountLabel || '') +
              '</div></div><span class="pill ' +
              (ok ? 'p-ok' : 'p-warn') +
              '">' +
              esc(ok ? '✓ Godkänd' : 'Väntar') +
              '</span></div>'
            );
          })
          .join('')
      );
    } else {
      h += sec('Offerter · commit', '0', empty('Inga offerter i patient-case/dossier ännu.'));
    }

    if (autoDocs.length) {
      h += sec(
        'Auto-dokument · system',
        String(autoDocs.length),
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
      h += sec('Foton', '0', empty('Inga foton kopplade till patienten ännu.'));
    }

    if (ltvLabel || Number.isFinite(Number(ltvRaw))) {
      h += sec(
        'Ekonomi',
        'Fortnox',
        '<div class="eg"><div class="k"><div class="l">Total intäkt</div><div class="v">' +
          esc(revenue != null ? revenue : '—') +
          '</div></div><div class="k"><div class="l">Livstidsvärde</div><div class="v">' +
          esc(ltvLabel || '—') +
          '</div></div></div>'
      );
    }

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
    var d = String(b.date || b.occurredAt || b.startAt || '').match(/(\d{1,2})\D+(\d{1,2})/);
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
      esc2(b.title || b.serviceName || 'Bokning') +
      '</div><div class="rm">' +
      esc2(
        [b.time || b.startTime, b.duration, b.staff || b.resourceLabel].filter(Boolean).join(' · ')
      ) +
      '</div></div>' +
      '<span class="pill ' +
      (ready ? 'p-ok' : 'p-warn') +
      '">' +
      esc2(b.status || 'Bokad') +
      '</span></div>'
    );
  }
})();
