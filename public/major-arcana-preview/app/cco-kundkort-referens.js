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
  function sekSlug(label) {
    var l = String(label || '').toLowerCase();
    if (l.indexOf('hälsodek') === 0) return 'halso';
    if (l.indexOf('kundresa') === 0) return 'kundresa';
    if (l.indexOf('smart nästa') === 0) return 'nastasteg';
    if (l.indexOf('kommande') === 0) return 'bokningar';
    if (l.indexOf('historik') === 0) return 'historik';
    if (l.indexOf('journal') === 0) return 'journal';
    if (l.indexOf('offert') === 0) return 'offert';
    if (l.indexOf('auto') === 0) return 'auto';
    if (l.indexOf('foto') === 0) return 'foto';
    if (l.indexOf('ekonomi') === 0) return 'ekonomi';
    return 'sek';
  }
  function sec(label, src, inner) {
    // REN v9-DESKTOP: varje sektion = .dossier-section-kort (drop-in CSS, inga lager)
    return (
      '<details class="dossier-section" data-sek="' +
      sekSlug(label) +
      '" open><summary>' +
      esc(label) +
      (src ? '<span class="count">' + src + '</span>' : '') +
      '</summary><div class="dossier-section-body">' +
      inner +
      '</div></details>'
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

  function filterCanonicalSignals(card, bundle, journalEntries, extras) {
    if (window.CcoKundkortKkx && typeof window.CcoKundkortKkx.resolvePanelSignals === 'function') {
      return window.CcoKundkortKkx.resolvePanelSignals(
        card || {},
        journalEntries,
        bundle,
        extras || {}
      );
    }
    var raw = A((card && card.automationSignals) || bundle.signals);
    return raw.filter(function (s) {
      return s && CANONICAL_SIGNAL_IDS[String(s.ruleId || '')];
    });
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
    var bookingExtras =
      window.CcoKundkortKkx &&
      typeof window.CcoKundkortKkx.resolveReferensBookingExtras === 'function'
        ? window.CcoKundkortKkx.resolveReferensBookingExtras(bcard, bundle, extras || {})
        : {
            occasionTimeline: extras.occasionTimeline || bundle.occasionTimeline || null,
          };
    var ctxExtras = bookingExtras;
    var canonicalJourney =
      window.CcoKundkortKkx && typeof window.CcoKundkortKkx.buildCanonicalJourneyLive === 'function'
        ? window.CcoKundkortKkx.buildCanonicalJourneyLive(bcard, journalEntries, bundle, ctxExtras)
        : null;
    if (canonicalJourney && canonicalJourney.steps && canonicalJourney.steps.length) {
      steps = canonicalJourney.steps.map(function (s) {
        return {
          id: s.step,
          label: s.label,
          note: s.meta || '',
          state:
            s.status === 'done'
              ? 'done'
              : s.status === 'active'
                ? 'active'
                : s.status === 'neutral'
                  ? 'neutral'
                  : 'todo',
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
    var signals = filterCanonicalSignals(bcard, bundle, journalEntries, ctxExtras);

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
    // FACIT: visa alltid 3 statrutor (Besök/Intäkt/No-shows) med subtext-rad
    h +=
      '<div class="s3">' +
      '<div class="k"><div class="l">Besök</div><div class="v">' +
      esc(visits != null ? visits : '—') +
      '</div><div class="s">' +
      (visits != null ? 'totalt' : 'inga än') +
      '</div></div>' +
      '<div class="k"><div class="l">Intäkt</div><div class="v">' +
      esc(revenue != null ? revenue : '—') +
      '</div><div class="s">' +
      (revenue != null ? 'LTV' : '—') +
      '</div></div>' +
      '<div class="k"><div class="l">No-shows</div><div class="v">' +
      esc(noshow != null ? noshow : '0') +
      '</div><div class="s">' +
      (Number(noshow) > 0 ? 'följ upp' : 'klockren') +
      '</div></div></div>';

    // ===== Närvaro: Show / No-show (receptionist markerar, syns för behandlare, loggas) =====
    var att = bcard.attendance && typeof bcard.attendance === 'object' ? bcard.attendance : {};
    var attStatus = att.status || '';
    var attAt = att.at ? new Date(att.at) : null;
    var attTime =
      attAt && !isNaN(attAt)
        ? attAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        : '';
    h +=
      '<div class="kk-attend' +
      (attStatus ? ' is-' + esc(attStatus) : '') +
      '" data-patient-id="' +
      esc(bcard.patientId || bcard.id || '') +
      '">' +
      '<div class="kk-attend-status' +
      (attStatus ? ' is-' + esc(attStatus) : '') +
      '" data-kk-attend-status>' +
      (attStatus === 'show'
        ? '✓ Ankommen' + (attTime ? ' ' + esc(attTime) : '') + (att.by ? ' · ' + esc(att.by) : '')
        : attStatus === 'no_show'
          ? '✕ No-show · kontakta kunden'
          : 'Närvaro ej markerad') +
      '</div>' +
      '<div class="kk-attend-btns">' +
      '<button type="button" class="kk-att-btn kk-att-show" data-kk-attend="show"><span class="kk-att-ico">✓</span> Show</button>' +
      '<button type="button" class="kk-att-btn kk-att-noshow" data-kk-attend="no_show"><span class="kk-att-ico">✕</span> No-show</button>' +
      '</div></div>';

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
      // Gruppera intilliggande KLARA steg (facit: 1–4, 6–7). Aktiva/kommande står kvar.
      function kkMergeDone(run) {
        if (run.length === 1) return run[0];
        var first = run[0];
        var last = run[run.length - 1];
        var range = (first.id || '') + '–' + (last.id || '');
        var lbl =
          range +
          ' · ' +
          first.label +
          (last.label && last.label !== first.label ? ' → ' + last.label : '');
        return { state: 'done', id: range, label: lbl, note: last.note || 'Klar' };
      }
      var groupedSteps = [];
      var doneRun = [];
      steps.forEach(function (s) {
        if (s.state === 'done') {
          doneRun.push(s);
        } else {
          if (doneRun.length) {
            groupedSteps.push(kkMergeDone(doneRun));
            doneRun = [];
          }
          groupedSteps.push(s);
        }
      });
      if (doneRun.length) groupedSteps.push(kkMergeDone(doneRun));

      var stepHtml = groupedSteps
        .map(function (s) {
          var st =
            s.state === 'done'
              ? 'done'
              : s.state === 'active'
                ? 'act'
                : s.state === 'neutral'
                  ? 'neutral'
                  : 'todo';
          var mk =
            st === 'done' ? '✓' : st === 'neutral' ? '–' : st === 'act' ? s.id || '!' : s.id || '';
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
            var sig = esc(s.ruleId || s.id || '');
            return (
              '<div class="row acc ' +
              tone +
              '"><div style="flex:1"><div class="rt">' +
              esc(s.what || s.label || '—') +
              '</div><div class="rm">' +
              sig +
              '</div></div>' +
              pill +
              '<button type="button" class="kk-sig-act" data-kk-sig="' +
              sig +
              '" data-kk-sig-label="' +
              esc(s.what || s.label || '') +
              '" title="Åtgärda">→</button>' +
              '</div>'
            );
          })
          .join('')
      );
    } else {
      h += sec('Smart nästa steg', '0', empty('Inga aktiva gates just nu.'));
    }

    h += '<div class="gthread"></div>';

    var hist = A(ctxExtras.historyBookings);
    var up = A(ctxExtras.upcomingBookings);
    h += sec(
      'Kommande bokningar',
      String(up.length),
      up.length ? up.slice(0, 5).map(bookingRow).join('') : empty('Inga kommande bokningar.')
    );
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
        'Offerter',
        String(offers.length),
        offers
          .map(function (o) {
            var ok = /godk|signed|accepted/i.test(o.status || '');
            var detalj = String(o.detail || o.amountLabel || '')
              .replace(/\bgrafts\b/gi, 'graft')
              .replace(/\bsessions\b/gi, 'sessioner')
              .replace(/\bsession\b/gi, 'session');
            return (
              '<div class="row"><span class="pill" style="margin:0;background:linear-gradient(180deg,#f2e6cf,#e0caa0);color:#7a5a16">' +
              esc(o.type || 'TP') +
              '</span><div style="flex:1"><div class="rt">' +
              esc(o.title || 'Offert') +
              '</div>' +
              '<div class="rm">' +
              esc(detalj) +
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

    // ===== Saknade kategorier (facit-paritet): Filer · Anteckningar · Kommunikation · Insikter =====
    var filer = driveFiles.slice(0, 10);
    var fileCount =
      (bcard.fileSummary && Number(bcard.fileSummary.totalFiles)) || driveFiles.length || 0;
    h += sec(
      'Filer',
      String(fileCount),
      filer.length
        ? filer
            .map(function (f) {
              return (
                '<div class="qrow"><div><div class="q">' +
                esc(f.name || f.fileName || f.title || 'Fil') +
                '</div></div></div>'
              );
            })
            .join('')
        : empty('Inga filer kopplade ännu.')
    );
    var notes = A(journalEntries).filter(function (e) {
      return /note|anteck|privat/i.test(String((e && (e.type || e.journalType)) || ''));
    });
    h += sec(
      'Anteckningar',
      String(notes.length),
      notes.length
        ? notes
            .slice(0, 6)
            .map(function (n) {
              return (
                '<div class="qrow"><div><div class="q">' +
                esc(String(n.text || n.summary || n.note || '').slice(0, 140)) +
                '</div>' +
                (n.author || n.by ? '<div class="qv">' + esc(n.author || n.by) + '</div>' : '') +
                '</div></div>'
              );
            })
            .join('')
        : empty('Inga anteckningar ännu.')
    );
    h += sec('Kommunikation', '0', empty('Ingen kommunikation loggad ännu.'));
    h += sec(
      'Insikter',
      String(signals.length),
      signals.length
        ? signals
            .slice(0, 6)
            .map(function (s) {
              return (
                '<div class="qrow"><div><div class="q">' +
                esc(s.label || s.title || s.text || 'Insikt') +
                '</div>' +
                (s.detail ? '<div class="qv">' + esc(s.detail) + '</div>' : '') +
                '</div></div>'
              );
            })
            .join('')
        : empty('Inga insikter just nu.')
    );

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

  /* ===== Gemensamt kundkort: sticky header + sektions-chips (fas 1) ===== */
  var KK_NAV = [
    ['halso', 'Hälsodekl.'],
    ['kundresa', 'Kundresa'],
    ['nastasteg', 'Nästa steg'],
    ['bokningar', 'Bokningar'],
    ['historik', 'Historik'],
    ['journal', 'Journal'],
    ['offert', 'Offert'],
    ['auto', 'Auto'],
    ['foto', 'Foto'],
    ['ekonomi', 'Ekonomi'],
  ];
  // ===== Smart nästa steg: åtgärds-utkast per signal (granska & skicka, ej autoskick) =====
  (function bindSignalActionsOnce() {
    if (window.__kkSigBound) return;
    window.__kkSigBound = true;
    function fnamn() {
      var dn = document.querySelector('.kkref .doss .dn');
      var n = dn ? String(dn.textContent || '').trim() : '';
      return n.split(' ')[0] || 'där';
    }
    function utkastFor(sig, label, namn) {
      var s = String(sig || '').toLowerCase();
      var l = String(label || '').toLowerCase();
      if (s.indexOf('operation_day') >= 0 || l.indexOf('friskförs') >= 0)
        return {
          rubrik: 'Skicka friskförsäkran',
          kund: true,
          link: '/friskforsakran.html',
          text:
            'Hej ' +
            namn +
            '! Inför din operation behöver vi din friskförsäkran ifylld. Öppna och signera här: [länk]. Den slutförs på operationsdagen. / Hair TP Clinic',
        };
      if (s.indexOf('photo_consent') >= 0 || l.indexOf('foto') >= 0)
        return {
          rubrik: 'Begär foto-samtycke',
          kund: true,
          text:
            'Hej ' +
            namn +
            '! Vi vill gärna ta före/efter-bilder (hårlinje/krona — aldrig ansikte) för att följa ditt resultat. Godkänn här: [länk]. / Hair TP Clinic',
        };
      if (s.indexOf('health_declaration') >= 0 || l.indexOf('hälsodek') >= 0)
        return {
          rubrik: 'Skicka hälsodeklaration',
          kund: true,
          text:
            'Hej ' +
            namn +
            '! Inför ditt besök behöver vi din hälsodeklaration. Fyll i här (2 min): [länk]. / Hair TP Clinic',
        };
      if (
        s.indexOf('treatment_plan') >= 0 ||
        l.indexOf('offert') >= 0 ||
        l.indexOf('behandlingsplan') >= 0
      )
        return {
          rubrik: 'Skicka behandlingsplan/offert',
          kund: true,
          sendEndpoint: '/api/v1/cco-commercial/offer-send-for-sign',
          sendLabel: 'Skicka offert för signering',
          urlKey: 'offerSignUrl',
          text:
            'Hej ' +
            namn +
            '! Här är din behandlingsplan. Du kan läsa och svara här: [länk]. Hör av dig om du har frågor! / Hair TP Clinic',
        };
      if (s.indexOf('cooling_off') >= 0 || l.indexOf('avtal') >= 0 || l.indexOf('samtycke') >= 0)
        return {
          rubrik: 'Påminn om avtal + samtycke',
          kund: true,
          sendEndpoint: '/api/v1/cco-treatment-agreement/send-for-sign',
          sendLabel: 'Skicka avtal för signering',
          urlKey: 'agreementSignUrl',
          text:
            'Hej ' +
            namn +
            '! Betänketiden har passerat — du kan nu signera avtal + samtycke här: [länk]. / Hair TP Clinic',
        };
      if (s.indexOf('journal') >= 0)
        return {
          rubrik: 'Journal saknas (intern åtgärd)',
          kund: false,
          text: 'Skapa och signera journal för besöket i journal-arbetsytan.',
        };
      return {
        rubrik: label || 'Åtgärd',
        kund: false,
        text: 'Granska och åtgärda: ' + (label || sig),
      };
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-kk-sig]');
      if (!btn) return;
      var u = utkastFor(
        btn.getAttribute('data-kk-sig'),
        btn.getAttribute('data-kk-sig-label'),
        fnamn()
      );
      // Byt [länk] mot riktig URL där en publik sida finns (t.ex. friskförsäkran)
      if (u.link && u.text.indexOf('[länk]') >= 0) {
        u.text = u.text.replace('[länk]', window.location.origin + u.link);
      }
      var ov = document.getElementById('kk-sigact');
      if (ov) ov.remove();
      ov = document.createElement('div');
      ov.id = 'kk-sigact';
      ov.innerHTML =
        '<div class="kk-sigact-panel">' +
        '<div class="kk-sigact-h">' +
        esc(u.rubrik) +
        '</div>' +
        '<div class="kk-sigact-sub">' +
        (u.kund ? 'Färdigt utkast — granska och skicka till kunden' : 'Intern åtgärd') +
        '</div>' +
        '<div class="kk-sigact-draft">' +
        esc(u.text) +
        '</div>' +
        '<div class="kk-sigact-row">' +
        (u.kund
          ? '<button type="button" class="kk-btn" data-kk-sig-copy>Kopiera utkast</button>' +
            '<button type="button" class="kk-btn" data-kk-sig-studio>✉ Svarstudio</button>'
          : '') +
        (u.sendEndpoint
          ? '<button type="button" class="kk-btn kk-btn-gold" data-kk-sig-send>' +
            esc(u.sendLabel || 'Skicka för signering') +
            '</button>'
          : '') +
        '<button type="button" class="kk-btn" data-kk-sig-close>Stäng</button>' +
        '</div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (ev) {
        if (ev.target === ov || ev.target.hasAttribute('data-kk-sig-close')) ov.remove();
        if (ev.target.hasAttribute('data-kk-sig-copy')) {
          if (navigator.clipboard) navigator.clipboard.writeText(u.text);
          ev.target.textContent = 'Kopierat ✓';
        }
        if (ev.target.hasAttribute('data-kk-sig-studio')) {
          if (navigator.clipboard) navigator.clipboard.writeText(u.text);
          ov.remove();
          var studio = document.querySelector('[data-studio-open]');
          if (studio) studio.click();
        }
        if (ev.target.hasAttribute('data-kk-sig-send')) {
          var pid = (document.querySelector('.kkref .kk-attend') || {}).getAttribute
            ? document.querySelector('.kkref .kk-attend').getAttribute('data-patient-id')
            : '';
          if (!pid) {
            ev.target.textContent = 'Kund-ID saknas';
            return;
          }
          if (
            !window.confirm(
              (u.sendLabel || 'Skicka för signering') +
                ' till ' +
                fnamn() +
                '? Detta startar signeringsflödet.'
            )
          )
            return;
          var token = '';
          try {
            token = (
              window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
              window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
              ''
            ).trim();
          } catch (er) {
            /* ignore */
          }
          var hdrs = { 'Content-Type': 'application/json' };
          if (token && token !== '__preview_local__') hdrs.Authorization = 'Bearer ' + token;
          ev.target.textContent = 'Skickar…';
          fetch(u.sendEndpoint, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({ patientId: pid }),
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { status: r.status, j: j };
              });
            })
            .then(function (res) {
              var draft = ov.querySelector('.kk-sigact-draft');
              if (res.status === 200) {
                var url = res.j[u.urlKey] || '';
                if (draft)
                  draft.innerHTML =
                    '<b>✓ Skickat för signering.</b><br>Länk: <span style="word-break:break-all">' +
                    esc(url) +
                    '</span>';
                ev.target.textContent = 'Skickat ✓';
                ev.target.disabled = true;
              } else {
                if (draft)
                  draft.innerHTML =
                    '<b>Kunde inte skicka:</b> ' +
                    esc(res.j.error || 'fel') +
                    (res.status === 404
                      ? '<br><span style="color:#94897b">Dokumentet finns inte än — skapa avtal/offert först.</span>'
                      : '');
                ev.target.textContent = u.sendLabel || 'Skicka';
              }
            })
            .catch(function () {
              ev.target.textContent = 'Nätfel — försök igen';
            });
        }
      });
    });
  })();

  // ===== Närvaro-markering: Show / No-show → backend + logg =====
  (function bindAttendanceOnce() {
    if (window.__kkAttendBound) return;
    window.__kkAttendBound = true;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-kk-attend]');
      if (!btn) return;
      var wrap = btn.closest('.kk-attend');
      if (!wrap) return;
      var pid = wrap.getAttribute('data-patient-id');
      var status = btn.getAttribute('data-kk-attend');
      if (!pid || !status) return;
      var statusEl = wrap.querySelector('[data-kk-attend-status]');
      var tid = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      // optimistisk uppdatering — tinta bubblan + statustext
      wrap.className = 'kk-attend is-' + status;
      if (statusEl) {
        statusEl.className = 'kk-attend-status is-' + status;
        statusEl.textContent =
          status === 'show' ? '✓ Ankommen ' + tid + ' · reception' : '✕ No-show · kontakta kunden';
      }
      var token = '';
      try {
        token = (
          window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          ''
        ).trim();
      } catch (err) {
        /* ignore */
      }
      var headers = { 'Content-Type': 'application/json' };
      if (token && token !== '__preview_local__') headers.Authorization = 'Bearer ' + token;
      fetch('/api/v1/cco-patient-master/patient/attendance', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ patientId: pid, status: status }),
      }).catch(function () {
        /* nätfel — optimistiska uppdateringen står kvar tills omladdning */
      });
    });
  })();

  // Delad öppnare: ploppar upp gemensamma kortet (STOR VY via iframe), valfligt
  // landat på en sektion (#slug). Används av header-förstoringen OCH sektions-⤢.
  window.__kkOpenStorvy = function (slug) {
    var ov = document.getElementById('kk-storvy');
    var base = '/kundkort-mockup-gemensamt.html';
    var src = base + (slug ? '#' + slug : '');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'kk-storvy';
      ov.innerHTML =
        '<div class="kk-storvy-panel">' +
        '<button type="button" class="kk-storvy-close" aria-label="Stäng">×</button>' +
        '<iframe class="kk-storvy-frame" title="Gemensamt kundkort"></iframe>' +
        '</div>';
      document.body.appendChild(ov);
      var stang = function () {
        ov.classList.remove('open');
      };
      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.classList.contains('kk-storvy-close')) stang();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') stang();
      });
    }
    var frame = ov.querySelector('.kk-storvy-frame');
    // Ladda om/navigera till rätt sektion varje gång
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
    else if (slug && frame.contentWindow) frame.contentWindow.location.hash = slug;
    ov.classList.add('open');
  };

  // Mappar app-sektionens rubrik → gemensamma kortets sektions-slug
  window.__kkSlugFromTitle = function (title) {
    var t = String(title || '').toLowerCase();
    if (t.indexOf('hälsodek') >= 0) return 'halso';
    if (t.indexOf('kundresa') >= 0) return 'kundresa';
    if (t.indexOf('nästa steg') >= 0) return 'nastasteg';
    if (t.indexOf('bokning') >= 0) return 'bokningar';
    if (t.indexOf('historik') >= 0) return 'historik';
    if (t.indexOf('journal') >= 0) return 'journal';
    if (t.indexOf('personal') >= 0) return 'personal';
    if (t.indexOf('offert') >= 0) return 'offert';
    if (t.indexOf('auto') >= 0) return 'auto';
    if (t.indexOf('dokument') >= 0) return 'dokument';
    if (t.indexOf('foto') >= 0) return 'foto';
    if (t.indexOf('ekonomi') >= 0) return 'ekonomi';
    return '';
  };

  // MINIMAL enhancer (FACIT 2026-06-08): rail = ren v9-dossier. Lägger ENDAST till
  // förstorings-knappen ⤢ i headern → ploppar upp gemensamma kortet (STOR VY via iframe).
  // Bygger ALDRIG om sektionerna (det var det gamla felet).
  function kkAddForstoring(rootEl) {
    try {
      var root = rootEl && rootEl.querySelector ? rootEl : document;
      var head = root.querySelector('.kkref .doss .dhead');
      if (!head || head.querySelector('.kk-forstoring')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kk-forstoring';
      btn.title = 'Förstora kundkortet';
      btn.setAttribute('aria-label', 'Förstora kundkortet');
      btn.textContent = '⤢';
      head.appendChild(btn);
      btn.addEventListener('click', function () {
        window.__kkOpenStorvy('');
      });
    } catch (e) {
      /* förstoring får aldrig fälla dossiern */
    }
  }
  window.__enhanceReferensKundkort = function (rootEl) {
    // Rail ska vara ren v9-dossier. Enda tillägget: förstorings-knappen.
    kkAddForstoring(rootEl);
    if (window.__KK_ENHANCER_PA !== true) return;
    try {
      var root = rootEl && rootEl.querySelector ? rootEl : document;
      var doss = root.querySelector('.kkref .doss');
      if (!doss || doss.querySelector('.kk-nav')) return;
      var head = doss.querySelector('.dhead');
      if (!head) return;
      // Sektioner kan vara .sec (referens-rå) eller details.dossier-section (kkx-lagret)
      var noder = doss.querySelectorAll('.sec[data-sek], details.dossier-section');
      Array.prototype.forEach.call(noder, function (node) {
        if (node.getAttribute('data-sek')) return;
        var summary = node.querySelector('summary');
        var label = summary
          ? (summary.childNodes[0] && summary.childNodes[0].textContent) || summary.textContent
          : '';
        node.setAttribute('data-sek', sekSlug(label));
      });
      var navHtml = KK_NAV.filter(function (n) {
        return doss.querySelector('[data-sek="' + n[0] + '"]');
      })
        .map(function (n) {
          var sekEl = doss.querySelector('[data-sek="' + n[0] + '"]');
          var s = sekEl.querySelector('.lab .src, summary .count');
          var badge = s ? String(s.textContent || '').trim() : '';
          if (badge.length > 10 || badge === '0') badge = '';
          return (
            '<button type="button" class="kk-chip" data-kk-mal="' +
            n[0] +
            '">' +
            n[1] +
            (badge ? ' <span class="kn">' + esc(badge) + '</span>' : '') +
            '</button>'
          );
        })
        .join('');
      if (!navHtml) {
        // sektionerna kan monteras strax efter (kkx) — försök igen, max 8 ggr
        doss.__kkTry = (doss.__kkTry || 0) + 1;
        if (doss.__kkTry <= 8) {
          setTimeout(function () {
            window.__enhanceReferensKundkort(rootEl);
          }, 250);
        }
        return;
      }
      var sticky = document.createElement('div');
      sticky.className = 'kk-sticky';
      doss.insertBefore(sticky, head);
      sticky.appendChild(head);
      var nav = document.createElement('div');
      nav.className = 'kk-nav';
      nav.innerHTML = navHtml;
      sticky.appendChild(nav);
      var scroller = doss.parentElement;
      while (scroller && scroller !== document.body) {
        var cs = getComputedStyle(scroller);
        if (
          /(auto|scroll)/.test(cs.overflowY) &&
          scroller.scrollHeight > scroller.clientHeight + 4
        ) {
          break;
        }
        scroller = scroller.parentElement;
      }
      if (scroller === document.body) scroller = null;
      function aktivera(slug) {
        nav.querySelectorAll('.kk-chip').forEach(function (c) {
          c.classList.toggle('active', c.getAttribute('data-kk-mal') === slug);
        });
        if (typeof window.__kkUpdateContext === 'function') {
          window.__kkUpdateContext(doss, slug);
        }
      }
      nav.addEventListener('click', function (e) {
        var chip = e.target.closest('.kk-chip');
        if (!chip) return;
        var mal = doss.querySelector('[data-sek="' + chip.getAttribute('data-kk-mal') + '"]');
        if (!mal) return;
        if (mal.tagName === 'DETAILS' && !mal.open) mal.open = true;
        var off = sticky.offsetHeight + 8;
        if (scroller) {
          var top =
            mal.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop -
            off;
          scroller.scrollTo(0, Math.max(0, top));
        } else {
          window.scrollTo(0, Math.max(0, window.scrollY + mal.getBoundingClientRect().top - off));
        }
        aktivera(chip.getAttribute('data-kk-mal'));
      });
      if (typeof IntersectionObserver === 'function') {
        var io = new IntersectionObserver(
          function (poster) {
            poster.forEach(function (p) {
              if (p.isIntersecting) aktivera(p.target.getAttribute('data-sek'));
            });
          },
          { root: scroller, rootMargin: '-25% 0px -65% 0px' }
        );
        doss.querySelectorAll('[data-sek]').forEach(function (s) {
          io.observe(s);
        });
      }
      var first = nav.querySelector('.kk-chip');
      if (first) aktivera(first.getAttribute('data-kk-mal'));
      // kkx-lagret kan skriva om sektionerna EFTER oss → tagga om nya noder
      var mo = new MutationObserver(function () {
        clearTimeout(doss.__kkNavT);
        doss.__kkNavT = setTimeout(function () {
          Array.prototype.forEach.call(
            doss.querySelectorAll('details.dossier-section:not([data-sek])'),
            function (node) {
              var summary = node.querySelector('summary');
              var label = summary
                ? (summary.childNodes[0] && summary.childNodes[0].textContent) ||
                  summary.textContent
                : '';
              node.setAttribute('data-sek', sekSlug(label));
              if (typeof io !== 'undefined' && io) io.observe(node);
            }
          );
        }, 120);
      });
      mo.observe(doss, { childList: true, subtree: true });
      if (typeof window.__kkFas2Setup === 'function') {
        window.__kkFas2Setup(doss, sticky, nav);
      }
    } catch (err) {
      /* förbättringen får aldrig fälla dossiern */
    }
  };

  /* ===== Fas 2: kontextsmart rad + Förbered besök + Åtgärder (live-deriverat) ===== */
  function kkSek(doss, slug) {
    return doss.querySelector('[data-sek="' + slug + '"]');
  }
  function kkBadge(doss, slug) {
    var el = kkSek(doss, slug);
    var b = el && el.querySelector('summary .count, .lab .src');
    return b ? String(b.textContent || '').trim() : '';
  }
  function kkFirstText(doss, slug, sel) {
    var el = kkSek(doss, slug);
    if (!el) return '';
    var n = el.querySelector(sel || '.qrow, .hrow, .brow, .jrow, .orow, li, p, div:not(summary)');
    return n
      ? String(n.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 70)
      : '';
  }
  window.__kkUpdateContext = function (doss, slug) {
    try {
      var summ = doss.__kkSumm;
      if (!summ) return;
      var t = '';
      var b = kkBadge(doss, slug);
      if (slug === 'kundresa' || !slug) t = summ.__kkDefault || '';
      else if (slug === 'halso') t = '<b>Hälsodeklaration:</b> ' + esc(b || 'status okänd');
      else if (slug === 'nastasteg')
        t = '<b>Nästa steg:</b> ' + esc(kkFirstText(doss, 'nastasteg') || b || '—');
      else if (slug === 'bokningar') t = '<b>Bokningar:</b> ' + esc(b || '0') + ' kommande';
      else if (slug === 'historik') t = '<b>Historik:</b> ' + esc(b || '0') + ' händelser';
      else if (slug === 'journal') t = '<b>Journal:</b> ' + esc(b || '0') + ' anteckningar';
      else if (slug === 'offert') t = '<b>Offerter:</b> ' + esc(b || '0') + ' aktiva';
      else if (slug === 'auto') t = '<b>Auto:</b> ' + esc(b || '0') + ' systemdokument';
      else if (slug === 'foto') t = '<b>Foton:</b> ' + esc(b || '0') + ' i journalen';
      else if (slug === 'ekonomi') t = '<b>Ekonomi:</b> ' + esc(b || '—');
      if (!t) t = summ.__kkDefault || '';
      var holder = summ.querySelector('[data-kk-ctx]');
      if (holder) holder.innerHTML = t;
    } catch (e) {
      /* tyst */
    }
  };
  function kkOverlay(doss, id, title, sub, bodyHtml) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'kk-ov';
    ov.id = id;
    ov.innerHTML =
      '<div class="kk-opanel"><div class="kk-oh">' +
      esc(title) +
      '</div><div class="kk-osub">' +
      esc(sub) +
      '</div>' +
      bodyHtml +
      '<div class="kk-orow"><button type="button" class="kk-btn" data-kk-stang>Stäng</button></div></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.hasAttribute('data-kk-stang')) ov.remove();
    });
    document.body.appendChild(ov);
    return ov;
  }
  function kkRad(label, value) {
    return (
      '<div class="kk-frad"><span>' + esc(label) + '</span><b>' + esc(value || '—') + '</b></div>'
    );
  }
  function kkForslag(doss) {
    var namn = String((doss.querySelector('.dhead .dn') || {}).textContent || 'kund').trim();
    var fnamn = namn.split(' ')[0];
    var ut = [];
    var hb = kkBadge(doss, 'halso');
    if (/fylla|saknas/i.test(hb)) {
      ut.push({
        rubrik: 'Skicka hälsodeklaration',
        skal: 'Hälsodeklaration saknas — krävs före besök',
        utkast:
          'Hej ' +
          fnamn +
          '! Inför ditt besök hos Hair TP Clinic behöver vi din hälsodeklaration. Fyll i den här: [länk]. Tar 2 minuter. Tack!',
      });
    }
    var ob = kkBadge(doss, 'offert');
    if (ob && ob !== '0') {
      ut.push({
        rubrik: 'Påminn om offert',
        skal: ob + ' aktiv offert utan svar',
        utkast:
          'Hej ' +
          fnamn +
          '! Hoppas allt är bra. Hör gärna av dig om du har frågor kring behandlingsplanen vi skickade — vi bokar gärna ett kort samtal. / Hair TP Clinic',
      });
    }
    var bb = kkBadge(doss, 'bokningar');
    if (bb && bb !== '0') {
      ut.push({
        rubrik: 'Bekräfta kommande tid',
        skal: bb + ' kommande bokning',
        utkast:
          'Hej ' +
          fnamn +
          '! En påminnelse om din kommande tid hos Hair TP Clinic. Svara JA för att bekräfta, eller ring oss om tiden inte passar.',
      });
    }
    return ut.slice(0, 3);
  }
  var KK_ORDNING = [
    'halso',
    'kundresa',
    'nastasteg',
    'bokningar',
    'historik',
    'journal',
    'personal',
    'offert',
    'auto',
    'dokument',
    'foto',
    'ekonomi',
    'tabild',
  ];
  var KK_RUBRIK = {
    halso: 'Hälsodeklaration',
    kundresa: 'Kundresa · 9 steg',
    nastasteg: 'Smart nästa steg',
    bokningar: 'Kommande bokningar',
    historik: 'Historik',
    journal: 'Journal',
    personal: 'Personal',
    offert: 'Offert',
    auto: 'Auto',
    dokument: 'Dokument',
    foto: 'Foto',
    ekonomi: 'Ekonomi',
    tabild: 'Ta bild',
  };
  function kkMockupParity(doss) {
    /* Mockupens struktur: rätt ordning, öppna kort, mockup-rubriker,
       historik-verktyg, Ta bild-sektion. Allt på befintlig live-data. */
    var seks = Array.prototype.slice.call(
      doss.querySelectorAll('details.dossier-section[data-sek]')
    );
    if (!seks.length) return;
    var container = seks[0].parentElement;
    /* 1. Mockup-rubriker + öppna */
    seks.forEach(function (s) {
      s.open = true;
      var slug = s.getAttribute('data-sek');
      var summary = s.querySelector('summary');
      if (summary && KK_RUBRIK[slug] && summary.childNodes[0]) {
        if (summary.childNodes[0].nodeType === 3) {
          summary.childNodes[0].textContent = KK_RUBRIK[slug] + ' ';
        }
      }
    });
    /* 2. Ta bild-sektion (kopplar till befintlig kamera-knapp om den finns) */
    if (!doss.querySelector('[data-sek="tabild"]')) {
      var tb = document.createElement('details');
      tb.className = 'dossier-section';
      tb.setAttribute('data-sek', 'tabild');
      tb.open = true;
      tb.innerHTML =
        '<summary>Ta bild </summary>' +
        '<div class="kk-tbrad">Foto-samtycke krävs · scope: hårlinje + krona — aldrig ansikte.</div>' +
        '<button type="button" class="kk-btn kk-btn-gold" data-kk-tabild>📷 Ta bild · spara i journal</button>';
      container.appendChild(tb);
      tb.querySelector('[data-kk-tabild]').addEventListener('click', function () {
        var knapp = document.querySelector(
          '[data-v9-quick-camera], [data-kkx-camera], .v9-quick-pills button, [data-v9-dossier-camera]'
        );
        if (knapp) knapp.click();
      });
    }
    /* 3. Historik-verktyg: Sammanfatta + fritextsök på riktiga rader */
    var hist = doss.querySelector('[data-sek="historik"]');
    if (hist && !hist.querySelector('.kk-hverktyg')) {
      var rader = Array.prototype.slice.call(hist.querySelectorAll('div')).filter(function (d) {
        return d.children.length === 0 && (d.textContent || '').trim().length > 3;
      });
      var verktyg = document.createElement('div');
      verktyg.className = 'kk-hverktyg';
      verktyg.innerHTML =
        '<button type="button" class="kk-btn" data-kk-summera>Sammanfatta</button>' +
        '<input class="kk-hsok" placeholder="Sök i historiken…" />' +
        '<div class="kk-hsvar" hidden></div>';
      var summary = hist.querySelector('summary');
      if (summary && summary.nextSibling) {
        hist.insertBefore(verktyg, summary.nextSibling);
      } else {
        hist.appendChild(verktyg);
      }
      var svar = verktyg.querySelector('.kk-hsvar');
      verktyg.querySelector('[data-kk-summera]').addEventListener('click', function () {
        var texter = rader.map(function (r) {
          return (r.textContent || '').replace(/\s+/g, ' ').trim();
        });
        svar.innerHTML =
          '<b>' +
          texter.length +
          ' händelser.</b> Senaste: ' +
          esc(texter[0] || '—') +
          (texter.length > 1 ? ' · Äldsta: ' + esc(texter[texter.length - 1]) : '');
        svar.hidden = false;
      });
      verktyg.querySelector('.kk-hsok').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var q = String(this.value || '').toLowerCase();
        var traff = rader.filter(function (r) {
          return (r.textContent || '').toLowerCase().indexOf(q) >= 0;
        });
        svar.innerHTML = traff.length
          ? '<b>' +
            traff.length +
            ' träff' +
            (traff.length === 1 ? '' : 'ar') +
            ':</b> ' +
            esc((traff[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90))
          : '<b>0 träffar</b> i historiken på "' + esc(q) + '"';
        svar.hidden = false;
      });
    }
    /* 4. Mockupens sektionsordning */
    KK_ORDNING.forEach(function (slug) {
      var el = doss.querySelector('[data-sek="' + slug + '"]');
      if (el) container.appendChild(el);
    });
    /* 5. Snabbknappar (app-funktioner, behålls) flyttas SIST — mockupen
       har sektionerna direkt under chipsen */
    Array.prototype.forEach.call(
      doss.querySelectorAll('.v9-zone3-context, .acts'),
      function (block) {
        container.appendChild(block);
      }
    );
    /* gthread-linjerna mellan chips och sektioner bort — mockupen har inga */
    Array.prototype.forEach.call(doss.querySelectorAll('.gthread'), function (g) {
      g.remove();
    });
  }
  window.__kkFas2Setup = function (doss, sticky, nav) {
    try {
      if (doss.__kkFas2) return;
      doss.__kkFas2 = true;
      kkMockupParity(doss);
      /* 1. Smart sammanfattning → sticky + kontextbytare */
      var summ = doss.querySelector('.summ');
      if (!summ) {
        summ = document.createElement('div');
        summ.className = 'summ kkx-summ';
        summ.innerHTML = '<span class="sk">SMART SAMMANFATTNING</span>';
      }
      var defaultHtml = '';
      Array.prototype.forEach.call(summ.childNodes, function (n) {
        if (n.nodeType === 1 && n.className === 'sk') return;
        defaultHtml += n.nodeType === 1 ? n.outerHTML : esc(n.textContent);
      });
      var sk = summ.querySelector('.sk');
      summ.innerHTML = '';
      if (sk) summ.appendChild(sk);
      var ctxHolder = document.createElement('span');
      ctxHolder.setAttribute('data-kk-ctx', '1');
      ctxHolder.innerHTML = defaultHtml || 'Kundkortet samlat — välj sektion ovan.';
      summ.appendChild(ctxHolder);
      summ.__kkDefault = defaultHtml || 'Kundkortet samlat — välj sektion ovan.';
      sticky.insertBefore(summ, nav);
      doss.__kkSumm = summ;
      /* 2. Knappar i headern */
      var head = sticky.querySelector('.dhead');
      if (head && !head.querySelector('.kk-actions')) {
        var act = document.createElement('div');
        act.className = 'kk-actions';
        var antal = kkForslag(doss).length;
        act.innerHTML =
          '<button type="button" class="kk-btn kk-btn-gold" data-kk-forbered>Förbered besök</button>' +
          '<button type="button" class="kk-btn" data-kk-atgarder>Åtgärder' +
          (antal ? ' (' + antal + ')' : '') +
          '</button>';
        head.appendChild(act);
        act.querySelector('[data-kk-forbered]').addEventListener('click', function () {
          var namn = String((head.querySelector('.dn') || {}).textContent || '').trim();
          var body =
            kkRad('Hälsodeklaration', kkBadge(doss, 'halso')) +
            kkRad('Kundresa', kkBadge(doss, 'kundresa')) +
            kkRad('Kommande bokningar', kkBadge(doss, 'bokningar') || '0') +
            kkRad('Journalanteckningar', kkBadge(doss, 'journal') || '0') +
            kkRad('Foton', kkBadge(doss, 'foto') || '0') +
            kkRad('Offerter', kkBadge(doss, 'offert') || '0') +
            kkRad('Ekonomi', kkBadge(doss, 'ekonomi'));
          kkOverlay(
            doss,
            'kk-ov-forbered',
            'Förbered besök · ' + namn,
            'Allt inför besöket — hämtat live ur kortet',
            body
          );
        });
        act.querySelector('[data-kk-atgarder]').addEventListener('click', function () {
          var f = kkForslag(doss);
          var body = f.length
            ? f
                .map(function (x, i) {
                  return (
                    '<div class="kk-frad"><span><b>' +
                    (i + 1) +
                    ' · ' +
                    esc(x.rubrik) +
                    '</b><br>' +
                    esc(x.skal) +
                    '</span></div><div class="kk-utkast">' +
                    esc(x.utkast) +
                    '</div><div class="kk-orow"><button type="button" class="kk-btn" data-kk-kopiera="' +
                    i +
                    '">Kopiera utkast</button></div>'
                  );
                })
                .join('')
            : '<div class="kk-frad"><span>Inga föreslagna åtgärder just nu — allt ser bra ut.</span></div>';
          var ov = kkOverlay(
            doss,
            'kk-ov-atgarder',
            'Föreslagna åtgärder (' + f.length + ')',
            'Färdiga utkast utifrån kundens läge — kopiera och skicka',
            body
          );
          ov.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-kk-kopiera]');
            if (!btn) return;
            var idx = Number(btn.getAttribute('data-kk-kopiera'));
            if (navigator.clipboard && f[idx]) {
              navigator.clipboard.writeText(f[idx].utkast);
              btn.textContent = 'Kopierat ✓';
            }
          });
        });
      }
    } catch (e) {
      /* tyst */
    }
  };
})();
