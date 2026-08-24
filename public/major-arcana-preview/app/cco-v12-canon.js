/**
 * V12 Customer Workspace · CONTENT-CANON render
 *
 * Verbatim-trogen port av facit V12-WORKSPACE-CONTENT-CANON-2026-06-21.html:
 * 13 sektioner i fast ordning (id #s1–#s12) + minimal jump-rail + sticky-bar.
 * Återanvänder BEFINTLIGA V11-adaptrar (CcoV11RailAdapters) som datakälla.
 * CSS i cco-v12-canon.css ger 100% visuell identitet. Aktiveras via ?v12canon=on.
 *
 *   window.CcoV12Canon.render(ctx) -> HTML-sträng
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
  function secHead(num, title, small, actions) {
    return (
      '<div class="sec-h"><span class="sec-num">' +
      esc(num) +
      '</span><span class="sec-title">' +
      esc(title) +
      (small ? ' <small>· ' + esc(small) + '</small>' : '') +
      '</span>' +
      (actions ? '<div class="sec-actions">' + actions + '</div>' : '') +
      '</div>'
    );
  }
  function empty(text) {
    return (
      '<div class="card" style="text-align:center;color:var(--ink-mute)">' + esc(text) + '</div>'
    );
  }
  var CHIP = { ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', neutral: 'neutral' };
  function chip(tone, label) {
    return '<span class="chip ' + (CHIP[tone] || 'neutral') + '">' + esc(label) + '</span>';
  }

  /* ---------- journal helpers (shared by s6 and visitSegmentsBlock) ---------- */
  function journalStateForSegment(segment) {
    var journals = arr(segment && segment.journals);
    if (!journals.length) return 'Journal saknas';
    if (
      journals.every(function (journal) {
        return Boolean(journal && journal.locked);
      })
    ) {
      return 'Journal signerad och låst';
    }
    if (
      journals.every(function (journal) {
        return txt(journal && journal.status) === 'signed';
      })
    ) {
      return 'Journal signerad';
    }
    return 'Journalutkast';
  }
  function journalBlock(segment, opts) {
    opts = opts || {};
    var journals = arr(segment && segment.journals);
    var encounterId = txt(segment && segment.encounterId);
    var rows = journals.length
      ? journals
          .map(function (journal) {
            var status = txt(journal && journal.status) || 'draft';
            var locked = Boolean(journal && journal.locked);
            return (
              '<div class="visit-segment-journal__row"><span><b>' +
              esc(txt(journal && journal.title) || 'Journalanteckning') +
              '</b><small>' +
              esc(txt(journal && journal.date)) +
              '</small></span>' +
              chip(
                locked || status === 'signed' ? 'ok' : 'warn',
                locked ? 'Signerad · låst' : status === 'signed' ? 'Signerad' : 'Utkast'
              ) +
              '</div>'
            );
          })
          .join('')
      : '<div class="visit-segment-empty">Ingen journalanteckning för detta tillfälle.</div>';
    return (
      '<div class="visit-segment-journal"><div class="visit-segment-journal__head"><span>' +
      esc(opts.title || 'Journal') +
      '</span>' +
      '<button type="button" class="warn-action" data-v12-visit-journal data-encounter-id="' +
      esc(encounterId) +
      '">' +
      (journals.length ? 'Fortsätt journal' : 'Starta journal') +
      '</button></div>' +
      rows +
      '</div>'
    );
  }

  function telHref(phone) {
    return String(phone == null ? '' : phone).replace(/[^\d+]/g, '');
  }

  function s1QuickActions(card) {
    var phone = txt(card.primaryPhone || card.phone);
    var email = txt(card.primaryEmail || card.email);
    var pid = txt(card.patientId || card.id);
    var parts = [];
    if (phone) {
      parts.push('<a class="quick-btn" href="tel:' + esc(telHref(phone)) + '">📞 Ring</a>');
      parts.push('<a class="quick-btn" href="sms:' + esc(telHref(phone)) + '">💬 SMS</a>');
    }
    if (email) {
      parts.push('<a class="quick-btn" href="mailto:' + esc(email) + '">✉️ Mejl</a>');
    }
    if (pid) {
      parts.push(
        '<button type="button" class="quick-btn" data-kk-ord48-open-calendar data-patient-id="' +
          esc(pid) +
          '">📅 Ny bokning</button>'
      );
    }
    parts.push('<button type="button" class="quick-btn" data-v12-edit-open>✏️ Redigera</button>');
    return parts.join('');
  }

  /* ---------- 1 · NULÄGE ---------- */
  function s1(card, journey) {
    var name = txt(card.displayName || card.fullName || card.name) || 'Kund';
    var meta = [
      card.age ? card.age + ' år' : '',
      card.primaryPhone || card.phone,
      card.primaryEmail || card.email,
      card.city,
    ]
      .map(txt)
      .filter(Boolean);
    var cur = journey && journey.cur,
      tot = journey && journey.total;
    var status = cur && tot ? 'Steg ' + cur + ' av ' + tot : 'Kundöversikt';
    var tags = arr(card.tags)
      .slice(0, 6)
      .map(function (t) {
        var l = txt(typeof t === 'string' ? t : t && (t.label || t.name));
        if (!l) return '';
        var tone = /allerg|risk/i.test(l)
          ? 'danger'
          : /saknas|vänta/i.test(l)
            ? 'warning'
            : /vip/i.test(l)
              ? 'vip'
              : /återkom|aterkom/i.test(l)
                ? 'success'
                : 'info';
        return '<span class="tag ' + tone + '">' + esc(l) + '</span>';
      })
      .join('');
    var pid = txt(card.patientId || card.id);
    return (
      '<section class="sec" id="s1"><div class="s1-hero">' +
      '<div class="avatar-xl">' +
      esc(initials(name)) +
      '</div>' +
      '<div class="s1-body">' +
      '<div class="s1-status">' +
      esc(status) +
      '</div>' +
      '<h1 class="s1-name">' +
      esc(name) +
      '</h1>' +
      (meta.length
        ? '<div class="s1-meta">' + meta.map(esc).join(' <span class="sep">·</span> ') + '</div>'
        : '') +
      (pid
        ? '<div class="s1-id">Kund-ID: ' +
          esc(pid.slice(0, 8)) +
          (txt(card.personalNumber || card.ssn || card.personnummer)
            ? ' · ' + esc(txt(card.personalNumber || card.ssn || card.personnummer))
            : ' · personnr ej registrerat') +
          '</div>'
        : '') +
      (tags ? '<div class="s1-tags">' + tags + '</div>' : '') +
      '<div class="s1-quick">' +
      s1QuickActions(card) +
      '</div></div>' +
      '<div class="s1-actions"><button class="btn-primary" data-v12-visit-prep>⚡ Förbered besök</button><button class="btn-edit" type="button">Åtgärder ▾</button></div>' +
      '</div></section>'
    );
  }

  /* ---------- 2 · AKTIVT BESÖK ---------- */
  function avTime(v) {
    var m = txt(v).match(/\d{2}:\d{2}/);
    return m ? m[0] : '';
  }
  // Dela en datumetikett i {mon, day} så journal-/boknings-datumceller matchar
  // facit ("Maj" + "05"). Stödjer "21 jun", "5 maj" och ISO "2026-06-21".
  var SWE_MON = [
    'jan',
    'feb',
    'mar',
    'apr',
    'maj',
    'jun',
    'jul',
    'aug',
    'sep',
    'okt',
    'nov',
    'dec',
  ];
  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function monDay(label, fallbackDay) {
    var s = txt(label);
    var m = s.match(/^(\d{1,2})\s+([a-zåäö]{3,})/i);
    if (m) return { mon: cap(m[2].slice(0, 3).toLowerCase()), day: m[1] };
    var iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { mon: cap(SWE_MON[parseInt(iso[2], 10) - 1] || ''), day: String(+iso[3]) };
    return { mon: '', day: txt(fallbackDay) || s };
  }
  function s2(av) {
    var head = secHead('02', 'Aktivt besök', av && av.headMeta ? txt(av.headMeta) : null);
    if (!av) {
      return (
        '<section class="sec" id="s2">' +
        head +
        '<div class="card" style="text-align:center;color:var(--ink-mute)">Inget aktivt besök idag — visas vid incheckning.</div></section>'
      );
    }
    var ci = avTime(av.checkedInAt),
      co = avTime(av.completedAt);
    // Föredra adapterns 6-stegs timelineNodes (bokad→in→nu→journal→eftervård→
    // klart); fallback till 3-nods (in/nu/klart) om de saknas.
    var nodes = arr(av.timelineNodes).length
      ? av.timelineNodes.map(function (n) {
          return { c: txt(n.state || n.c), t: txt(n.t) };
        })
      : [
          { c: 'done', t: ci || 'Incheckad' },
          { c: 'active', t: 'Nu' },
          { c: 'todo', t: co || 'Klart' },
        ];
    var blockers = arr(av.blockers);
    return (
      '<section class="sec" id="s2">' +
      head +
      '<div class="s2">' +
      '<div class="s2-head"><span class="left"><span class="pulse"></span>' +
      esc(av.kicker || 'PÅGÅR') +
      '</span>' +
      (av.headMeta ? '<span class="time">' + esc(av.headMeta) + '</span>' : '') +
      '</div>' +
      '<div class="s2-row"><div><div class="s2-treatment">' +
      esc(av.title || 'Besök') +
      '</div>' +
      '<div class="s2-treatment-sub">' +
      esc(av.statusLine || '') +
      '</div>' +
      (av.bookingNote
        ? '<div class="s2-treatment-sub">Anteckning · ' + esc(av.bookingNote) + '</div>'
        : '') +
      '</div>' +
      (av.practitioner
        ? '<div class="s2-staff">' +
          esc(av.practitioner) +
          (txt(av.room) ? '<span class="room">' + esc(txt(av.room)) + '</span>' : '') +
          '</div>'
        : '') +
      '</div>' +
      (av.showTimeline
        ? '<div class="s2-timeline">' +
          nodes
            .map(function (n, i) {
              return (
                '<div class="tnode ' +
                n.c +
                '"><span class="dot"></span><span class="t">' +
                esc(n.t) +
                '</span></div>' +
                (i < nodes.length - 1
                  ? '<div class="tline' +
                    (nodes[i + 1] && nodes[i + 1].c === 'todo' ? ' todo' : '') +
                    '"></div>'
                  : '')
              );
            })
            .join('') +
          '</div>'
        : '') +
      (blockers.length
        ? '<div class="s2-blockers"><div class="s2-blockers-l">Måste lösas innan ingrepp</div>' +
          blockers
            .map(function (b) {
              // Per-blockerare chip ur status (facit: "Saknas" röd vs "Tas under
              // besöket" gul). Default röd "Saknas" när ingen status finns.
              var bt = txt(b.tone || b.level || b.status).toLowerCase();
              var warn = /warn|amber|tas|under|pågår|pagar/.test(bt);
              var clabel =
                txt(b.chipLabel || b.statusLabel) || (warn ? 'Tas under besöket' : 'Saknas');
              return (
                '<div class="s2-blockers-row"><span>' +
                esc(txt(b.label || b)) +
                '</span>' +
                chip(warn ? 'warn' : 'danger', clabel) +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      '<div class="s2-actions">' +
      '<button class="av-btn hero" data-v11-active-visit-action="' +
      esc((av.primary && av.primary.action) || 'journal') +
      '">' +
      esc((av.primary && av.primary.label) || 'Starta journal') +
      '</button>' +
      '<button class="av-btn sec" data-v11-active-visit-action="photo">📷 Foto</button>' +
      '<button class="av-btn sec" data-v11-active-visit-action="notes">✏️ Anteckning</button>' +
      (av.secondary
        ? '<button class="av-btn tert" data-v11-active-visit-action="' +
          esc(av.secondary.action) +
          '">' +
          esc(av.secondary.label) +
          '</button>'
        : '') +
      '</div></div></section>'
    );
  }

  /* ---------- 3 · VARNINGAR ---------- */
  function s3(warnings) {
    var items = arr(warnings && warnings.items ? warnings.items : warnings);
    var head = secHead('A', 'Kritiska varningar', 'måste lösas innan behandling');
    if (!items.length) {
      return (
        '<section class="sec" id="s3">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga kritiska varningar.</div></section>'
      );
    }
    return (
      '<section class="sec" id="s3">' +
      head +
      items
        .map(function (w) {
          var amber =
            txt(w.tone || w.severity).toLowerCase() === 'amber' ||
            /medel|måttlig/i.test(txt(w.severity));
          return (
            '<div class="warn-row' +
            (amber ? ' warn-amber' : '') +
            '"><span class="warn-icn">!</span>' +
            '<div class="warn-body"><div class="what">' +
            esc(txt(w.title || w.what || w.label)) +
            '</div>' +
            (w.text || w.why ? '<div class="why">' + esc(txt(w.text || w.why)) + '</div>' : '') +
            '</div>' +
            '<button class="warn-action" data-v12-scroll-module="health">Visa</button></div>'
          );
        })
        .join('') +
      '</section>'
    );
  }

  /* ---------- 4 · HÄLSA ---------- */
  function s4(health) {
    var updated = health && txt(health.updatedAt || health.signedAt);
    var head = secHead('04', 'Hälsa', updated ? 'senast uppdaterad ' + updated : null, '');
    if (!health) {
      return (
        '<section class="sec" id="s4">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Hälsodeklaration saknas.</div></section>'
      );
    }
    // HD-rader ur riktig health-data (allergier + läkemedel + kontraindikations-flaggor).
    var hAllergies = arr(health.allergies);
    var hMeds = (health.medications && health.medications.items) || [];
    var hContra = arr(health.contraindications);
    var hAnswers = arr(health.answers);
    var hdRows = '';
    if (hAnswers.length) {
      // Riktiga per-frågesvar (parser answers[]) → en rad per fråga, som facit.
      hdRows = hAnswers
        .map(function (a) {
          var isYes = /^ja\b/i.test(txt(a.value));
          var tone =
            a.risk === 'red' ? 'danger' : a.risk === 'amber' ? 'warn' : isYes ? 'warn' : 'ok';
          var lbl = txt(a.value) || (isYes ? 'JA' : 'NEJ');
          if (a.detail) lbl += ' · ' + txt(a.detail);
          return (
            '<div class="card-row"><span class="what">' +
            esc(txt(a.label)) +
            '</span>' +
            chip(tone, lbl) +
            '</div>'
          );
        })
        .join('');
    } else {
      // Fallback: aggregat ur allergier/mediciner/flaggor när strukturerade svar saknas.
      hdRows += hAllergies.length
        ? '<div class="card-row"><span class="what">Allergier</span>' +
          chip('danger', 'JA · ' + txt(hAllergies[0])) +
          '</div>'
        : '<div class="card-row"><span class="what">Allergier</span>' +
          chip('neutral', 'Ej registrerat') +
          '</div>';
      hdRows += hMeds.length
        ? '<div class="card-row"><span class="what">Pågående mediciner</span>' +
          chip('warn', 'JA · ' + hMeds.length + ' st') +
          '</div>'
        : '<div class="card-row"><span class="what">Pågående mediciner</span>' +
          chip(
            health.medications && health.medications.known ? 'warn' : 'neutral',
            health.medications && health.medications.known ? 'JA' : 'Ej registrerat'
          ) +
          '</div>';
      hContra.forEach(function (c) {
        hdRows +=
          '<div class="card-row"><span class="what">' +
          esc(txt(c.text)) +
          '</span>' +
          chip(c.level === 'red' ? 'danger' : 'warn', 'JA') +
          '</div>';
      });
    }
    var hdCard =
      '<div class="card"><div class="card-l">Hälsodeklaration' +
      (hAnswers.length ? ' <small>· ' + hAnswers.length + ' frågor</small>' : '') +
      (health.signedAt
        ? '<span class="when">Signerad ' + esc(txt(health.signedAt)) + '</span>'
        : '') +
      '</div>' +
      (hdRows || '<div class="card-row"><span class="what">Inga registrerade svar</span></div>') +
      '</div>';
    var medCard =
      '<div class="card"><div class="card-l">Läkemedel + kontraindikationer</div>' +
      (hMeds.length
        ? hMeds
            .map(function (m) {
              return txt(m)
                ? '<div class="card-row"><span class="what">' +
                    esc(txt(m)) +
                    '</span>' +
                    chip('neutral', 'Daglig') +
                    '</div>'
                : '';
            })
            .join('')
        : '<div class="card-row"><span class="what">Pågående läkemedel ej registrerade</span></div>') +
      (hAllergies.length
        ? '<div class="card-row"><span class="what">' +
          esc(txt(hAllergies[0])) +
          ' · kontra</span>' +
          chip('danger', 'Aktiv flagga') +
          '</div>'
        : '') +
      '</div>';
    return (
      '<section class="sec" id="s4">' +
      head +
      '<div class="s4-grid">' +
      hdCard +
      medCard +
      '</div></section>'
    );
  }

  /* ---------- 5 · KUNDRESA (JOURNEY-SPINE sammanförd i canon) ---------- */
  var JUMP_LABEL = {
    'kk-card-halsa': 'Hälsa',
    'kk-card-behandling': 'Behandling',
    'kk-card-juridik': 'Avtal',
    'kk-card-operation': 'Operation',
    'kk-card-foto': 'Foto',
    'kk-card-bokning': 'Bokning',
    'kk-card-uppfoljning': 'Uppföljning',
  };
  var JUMP_SECTION = {
    'kk-card-halsa': 'health',
    'kk-card-foto': 'photos',
    'kk-card-bokning': 'bookings',
    'kk-card-juridik': 'documents',
    'kk-card-uppfoljning': 'bookings',
    'kk-card-behandling': 'documents',
  };
  function miniActiveVisit(av) {
    if (!av) return '';
    var ci = avTime(av.checkedInAt);
    return (
      '<div class="s2" style="margin:0 0 4px">' +
      '<div class="s2-head"><span class="left"><span class="pulse"></span>' +
      esc(av.kicker || 'PÅGÅR') +
      '</span>' +
      (av.headMeta ? '<span class="time">' + esc(av.headMeta) + '</span>' : '') +
      '</div>' +
      '<div class="s2-row"><div><div class="s2-treatment">' +
      esc(av.title || 'Besök') +
      '</div>' +
      '<div class="s2-treatment-sub">' +
      esc(av.statusLine || '') +
      '</div></div>' +
      (av.practitioner
        ? '<div class="s2-staff">' +
          esc(av.practitioner) +
          (txt(av.room) ? '<span class="room">' + esc(txt(av.room)) + '</span>' : '') +
          '</div>'
        : '') +
      '</div>' +
      (av.showTimeline
        ? '<div class="s2-timeline"><div class="tnode done"><span class="dot"></span><span class="t">' +
          esc(ci || 'in') +
          '</span></div>' +
          '<div class="tline"></div><div class="tnode active"><span class="dot"></span><span class="t">nu</span></div>' +
          '<div class="tline todo"></div><div class="tnode todo"><span class="dot"></span><span class="t">klart</span></div></div>'
        : '') +
      (arr(av.blockers).length
        ? '<div class="s2-blockers"><div class="s2-blockers-l">Måste lösas innan ingrepp</div>' +
          arr(av.blockers)
            .map(function (b) {
              return (
                '<div class="s2-blockers-row"><span>' +
                esc(txt(b.label || b)) +
                '</span>' +
                chip('danger', 'Saknas') +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      '</div>'
    );
  }
  function s5(journey, av, smart, photos, health, stepAssets) {
    var head = secHead(
      'B',
      'Kundresa',
      journey && journey.cur ? 'steg ' + journey.cur + ' av ' + journey.total : null
    );
    var steps = arr(journey && journey.steps);
    if (!steps.length)
      return (
        '<section class="sec" id="s5">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Kundresan har inte startat.</div></section>'
      );
    var done = steps.filter(function (s) {
      return s.state === 'done';
    }).length;
    var active = steps.filter(function (s) {
      return s.state === 'active';
    }).length;
    var pct = journey.pct || Math.round((done / steps.length) * 100);
    return (
      '<section class="sec" id="s5">' +
      head +
      '<div class="s5-progress"><span>' +
      done +
      ' klara · ' +
      active +
      ' pågår · ' +
      (steps.length - done - active) +
      ' kommande</span><span class="bar"><i style="width:' +
      esc(pct) +
      '%"></i></span><span>' +
      esc(pct) +
      '%</span></div>' +
      steps
        .map(function (s, i) {
          var cls =
            s.state === 'done'
              ? 'step--done'
              : s.state === 'active'
                ? 'step--active'
                : s.state === 'blocked'
                  ? 'step--blocked'
                  : 'step--future';
          var badge =
            s.state === 'done'
              ? '✓'
              : s.state === 'blocked'
                ? '!'
                : esc(s.id != null ? s.id : i + 1);
          var meta =
            s.state === 'done'
              ? 'Klart'
              : s.state === 'active'
                ? 'Pågår'
                : s.state === 'blocked'
                  ? 'Blockerare'
                  : 'Kommande';
          // jump-länk (per-steg → relevant canon-sektion) + asset-räknar-badge
          // där vi har en ÄKTA koppling (konsultations-steget → foton). Ingen
          // fejk: badge visas bara när data faktiskt hör till steget.
          var jlBtns = '';
          if (s.jump && JUMP_LABEL[s.jump]) {
            jlBtns +=
              '<button type="button" class="step-link" data-v12-jump="' +
              esc(JUMP_SECTION[s.jump] || 'current-state') +
              '">Öppna ' +
              esc(JUMP_LABEL[s.jump]) +
              ' →</button>';
          }
          // Per-steg asset-räknare ur stepAssets[stegets id] (📄 dok / 📷 foton /
          // 📓 journal). Endast när datan explicit hör till steget — ingen fejk.
          var a = (stepAssets && (stepAssets[s.id] || stepAssets[i + 1])) || null;
          if (a) {
            if (a.docs) jlBtns += '<span class="step-link">📄 ' + a.docs + ' dok</span>';
            if (a.photos) jlBtns += '<span class="step-link">📷 ' + a.photos + ' foton</span>';
            if (a.journals)
              jlBtns += '<span class="step-link">📓 ' + a.journals + ' journal</span>';
          } else {
            // Fallback: konsultations-steget får foto-räknare ur photos (äkta koppling).
            var stepConsult =
              /konsult/i.test(txt(s.label)) && !/bokning|bekräft|bekraft/i.test(txt(s.label));
            var stepPhotos = arr(photos && photos.items ? photos.items : photos).length;
            if (stepConsult && stepPhotos) {
              jlBtns += '<span class="step-link">📷 ' + stepPhotos + ' foton</span>';
            }
          }
          var jl = '<div class="step-links">' + jlBtns + '</div>';
          // Visit-card med besöksfoton — fästs på KONSULTATIONS-steget oavsett
          // state, så ett kommande steg med media blir expanderbart (ABDIRAHMAN
          // steg 4 "Konsultation · Förberett" med 6 bilder).
          var pItems = arr(photos && photos.items ? photos.items : photos);
          var isConsult =
            /konsult/i.test(txt(s.label)) && !/bokning|bekräft|bekraft/i.test(txt(s.label));
          var visitCard =
            pItems.length && isConsult
              ? '<div class="visit-card"><div class="visit-head"><div class="visit-date"><span class="d">' +
                esc(txt(pItems[0].dateLabel || pItems[0].capturedAt).slice(0, 12) || 'Besök') +
                '</span> · konsultations-besök</div><div class="visit-meta">' +
                pItems.length +
                ' bilder · 0 anteckningar · 0 dokument</div></div><div class="photo-grid">' +
                pItems
                  .slice(0, 6)
                  .map(function (p, i) {
                    var bg = p.thumbnailUrl || p.viewUrl || p.url;
                    var lbl = txt(p.dateLabel || p.capturedAt).slice(0, 10) || 'Översikt';
                    return (
                      '<div class="photo-tile p' +
                      ((i % 6) + 1) +
                      '"' +
                      (bg ? ' style="background-image:url(' + esc(bg) + ')"' : '') +
                      '><span class="lbl">' +
                      esc(lbl) +
                      '</span></div>'
                    );
                  })
                  .join('') +
                '</div><div class="photo-actions"><button class="smart-btn" data-v12-scroll-module="photos">Välj i Foto</button><button class="smart-btn" data-v11-active-visit-action="photo">Ta/rita bild</button><button class="smart-btn primary" data-v11-active-visit-action="complete">Slutför konsultation</button></div></div>'
              : '';
          // body (aktivt steg → aktivt besök + smart; blockerat → gate)
          var body = '';
          if (s.state === 'active') {
            var smartHtml =
              smart && smart.what
                ? '<div class="spine-smart"><div><b>' +
                  esc(txt(smart.what)) +
                  '</b>' +
                  (smart.why
                    ? '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">' +
                      esc(txt(smart.why)) +
                      '</div>'
                    : '') +
                  '</div><button type="button" class="warn-action" data-kk-sig="' +
                  esc(smart.ruleId) +
                  '">' +
                  esc(smart.ctaLabel || 'Åtgärda') +
                  '</button></div>'
                : '';
            // Subkort (ABDIRAHMAN): "Vad krävs" ur blockerare + "När detta är klart"
            // ur kommande steg. Visit-card med foton inbäddat i steget.
            var reqs = arr(av && av.blockers);
            var futures = arr(journey && journey.steps)
              .filter(function (st) {
                return st && st.state !== 'done' && st.state !== 'active';
              })
              .slice(0, 3);
            var reqCard = reqs.length
              ? '<div class="subcard"><div class="subcard-l">Vad krävs</div>' +
                reqs
                  .map(function (b) {
                    var w = /warn|amber|tas|under/.test(txt(b.tone || b.status || b.level));
                    return (
                      '<div class="subcard-row"><span class="what">' +
                      esc(txt(b.label || b)) +
                      '</span>' +
                      chip(w ? 'warn' : 'danger', txt(b.chipLabel || b.statusLabel) || 'Saknas') +
                      '</div>'
                    );
                  })
                  .join('') +
                '</div>'
              : '';
            var unlockCard = futures.length
              ? '<div class="subcard"><div class="subcard-l">När detta är klart</div>' +
                futures
                  .map(function (st) {
                    return (
                      '<div class="subcard-row"><span class="what">' +
                      esc(txt(st.label)) +
                      '</span>' +
                      chip('info', 'Låses upp') +
                      '</div>'
                    );
                  })
                  .join('') +
                '</div>'
              : '';
            // "Risker att uppmärksamma" (JOURNEY-SPINE) ur health — allergier (Hög)
            // + kontraindikationer (red→Hög / amber→Måttlig).
            var hAllerg = arr(health && health.allergies);
            var hContra = arr(health && health.contraindications);
            var riskRows =
              hAllerg
                .map(function (a) {
                  return (
                    '<div class="subcard-row"><span class="what">' +
                    esc(txt(a)) +
                    '-allergi</span>' +
                    chip('danger', 'Hög') +
                    '</div>'
                  );
                })
                .join('') +
              hContra
                .map(function (c) {
                  var red = c.level === 'red';
                  return (
                    '<div class="subcard-row"><span class="what">' +
                    esc(txt(c.text)) +
                    '</span>' +
                    chip(red ? 'danger' : 'warn', red ? 'Hög' : 'Måttlig') +
                    '</div>'
                  );
                })
                .join('');
            var riskCard = riskRows
              ? '<div class="subcard"><div class="subcard-l">Risker att uppmärksamma</div>' +
                riskRows +
                '</div>'
              : '';
            var gridCards =
              reqCard || unlockCard || riskCard
                ? '<div class="step-body-grid">' + reqCard + unlockCard + riskCard + '</div>'
                : '';
            body = miniActiveVisit(av) + smartHtml + gridCards;
          } else if (s.state === 'blocked') {
            body =
              '<div class="gate-list"><div class="gate-list-l">Krävs för att låsa upp</div>' +
              '<div class="gate-row"><span class="what">Föregående steg slutfört</span>' +
              chip('danger', 'Saknas') +
              '</div></div>';
          } else {
            // Klar/kommande steg är OCKSÅ expanderbara (facit visar toggle på
            // alla steg). Minimal body ur stegets egen data — ingen fejk.
            var doneState = s.state === 'done';
            var hAns2 = arr(health && health.answers);
            if (doneState && /h[äa]lsodek/i.test(txt(s.label)) && hAns2.length) {
              // Klart HD-steg → rikt innehåll: dokumenterade svar (JOURNEY-SPINE).
              body =
                '<div class="step-body-grid"><div class="subcard"><div class="subcard-l">Dokumenterade svar</div>' +
                hAns2
                  .slice(0, 6)
                  .map(function (a) {
                    var isYes = /^ja\b/i.test(txt(a.value));
                    var tone =
                      a.risk === 'red'
                        ? 'danger'
                        : a.risk === 'amber'
                          ? 'warn'
                          : isYes
                            ? 'warn'
                            : 'ok';
                    var lbl = txt(a.value) || (isYes ? 'JA' : 'NEJ');
                    if (a.detail) lbl += ' · ' + txt(a.detail);
                    return (
                      '<div class="subcard-row"><span class="what">' +
                      esc(txt(a.label)) +
                      '</span>' +
                      chip(tone, lbl) +
                      '</div>'
                    );
                  })
                  .join('') +
                '</div></div>';
            } else {
              body =
                '<div class="subcard"><div class="subcard-l">' +
                (doneState ? 'Slutfört' : 'Kommande steg') +
                '</div><div class="subcard-row"><span class="what">' +
                esc(txt(s.note || s.label)) +
                '</span>' +
                chip(doneState ? 'ok' : 'info', doneState ? 'Klart' : txt(meta) || 'Kommande') +
                '</div></div>';
            }
          }
          // Konsultations-steg med besöksfoton → visit-card (gör steget
          // expanderbart oavsett state, som facit steg 4).
          if (visitCard) body += visitCard;
          var hasBody = !!body;
          var open = s.state === 'active' || (!!visitCard && s.state !== 'done');
          return (
            '<article class="step ' +
            cls +
            '"' +
            (hasBody ? ' data-spine-step="' + i + '" data-open="' + open + '"' : '') +
            '>' +
            // OBS: step-head är en <div role=button>, INTE <button> — den innehåller
            // jump-länkens <button> och nästlade buttons är ogiltig HTML (parsern
            // auto-stänger och kollapsar stegen till 1). Klick hanteras av delegaten.
            '<div class="step-head"' +
            (hasBody ? ' role="button" tabindex="0" aria-expanded="' + open + '"' : '') +
            '>' +
            '<span class="step-badge">' +
            badge +
            '</span>' +
            '<div><div class="step-title">' +
            esc(txt(s.label)) +
            '</div>' +
            (s.note ? '<div class="step-sub">' + esc(txt(s.note)) + '</div>' : '') +
            '</div>' +
            jl +
            '<span class="step-meta">' +
            esc(meta) +
            (hasBody ? ' <span class="step-toggle" aria-hidden="true">▾</span>' : '') +
            '</span>' +
            '</div>' +
            (hasBody
              ? '<div class="step-body"><div class="step-body-inner">' + body + '</div></div>'
              : '') +
            '</article>'
          );
        })
        .join('') +
      '</section>'
    );
  }

  /* ---------- 7 · BESÖK · TILLFÄLLEN ---------- */
  function s7(photos, visitSegments, patientId) {
    var items = arr(photos && photos.items ? photos.items : photos);
    var visitBlock = visitSegmentsBlock(visitSegments, patientId);
    var head = secHead(
      'D',
      'Foto-dokumentation',
      items.length ? items.length + ' bilder' : null,
      '<button class="sec-link" data-v11-active-visit-action="photo">📷 Ta bild</button>' +
        (items.length >= 2
          ? '<button class="sec-link" data-v12-compare-photos>Jämför →</button>'
          : '')
    );
    if (!items.length && !visitBlock)
      return (
        '<section class="sec" id="s7">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga besök registrerade ännu.</div></section>'
      );
    if (!items.length) return '<section class="sec" id="s7">' + head + visitBlock + '</section>';
    var tiles = items
      .slice(0, 12)
      .map(function (p) {
        var assetId = txt(p.assetId || p.fileId || p.id);
        var openRef = txt(p.openRef || p.viewUrl || p.url);
        // Fas-märkt ruta (facit: FÖRE/EFTER/ÖVER/FILM) ur adapterns phase/isImage.
        var ph = txt(p.phase);
        var isVideo = p.isImage === false;
        var cls = isVideo ? 'film' : ph === 'before' ? 'fore' : ph === 'after' ? 'efter' : 'over';
        var prefix = isVideo
          ? 'FILM'
          : ph === 'before'
            ? 'FÖRE'
            : ph === 'after'
              ? 'EFTER'
              : 'ÖVER';
        var date = txt(p.dateLabel || p.photoDateLabel || p.capturedAt || '').slice(0, 12);
        var lbl = (prefix + (date ? ' ' + date : '')).trim();
        var editable = Boolean(assetId && openRef && !isVideo);
        return (
          '<div class="photo-tile ' +
          cls +
          (editable ? ' photo-tile--editable' : '') +
          '"' +
          (editable
            ? ' role="button" tabindex="0" data-v12-photo-edit data-patient-id="' +
              esc(patientId) +
              '" data-asset-id="' +
              esc(assetId) +
              '" data-encounter-id="' +
              esc(txt(p.encounterId)) +
              '" data-photo-src="' +
              esc(openRef) +
              '" data-photo-name="' +
              esc(txt(p.fileName || p.name || 'Bild')) +
              '" data-photo-zone="' +
              esc(txt(p.zone || p.phase)) +
              '" data-photo-date="' +
              esc(date) +
              '" data-photo-capture="' +
              esc(txt(p.capturedAt || p.captureDate)) +
              '"'
            : '') +
          '>' +
          (assetId && !isVideo
            ? '<img src="" data-patient-file-id="' +
              esc(assetId) +
              '" alt="' +
              esc(txt(p.fileName || p.name || 'Bild')) +
              '" decoding="async" />'
            : '') +
          '<span class="lbl">' +
          esc(lbl) +
          '</span>' +
          (editable ? '<span class="photo-tile__draw" aria-hidden="true">✎ Rita</span>' : '') +
          '</div>'
        );
      })
      .join('');
    var gap = items.some(function (p) {
      return p.gap || p.viewGap;
    });
    // Före/efter-par-förslag (facit .photo-bar) när minst två bilder finns.
    var firstLbl = txt(items[0].dateLabel || items[0].photoDateLabel || items[0].capturedAt).slice(
      0,
      12
    );
    var lastLbl = txt(
      items[items.length - 1].dateLabel ||
        items[items.length - 1].photoDateLabel ||
        items[items.length - 1].capturedAt
    ).slice(0, 12);
    var bar =
      items.length >= 2
        ? '<div class="photo-bar"><div class="lbl">Före/efter-par föreslaget: <b>' +
          esc(firstLbl || 'Före') +
          '</b> <span class="sep">↔</span> <b>' +
          esc(lastLbl || 'Efter') +
          '</b></div><button class="warn-action" data-v12-compare-photos>Jämför</button></div>'
        : '';
    return (
      '<section class="sec" id="s7">' +
      head +
      '<div class="photo-grid">' +
      tiles +
      '</div>' +
      (items.length > 12
        ? '<div class="empty-state">+ ' + (items.length - 12) + ' fler bilder</div>'
        : '') +
      bar +
      (gap
        ? '<div class="photo-gap"><span>⚠ Krona-vy saknas för fullständig dokumentation</span><button class="warn-action" data-v12-scroll-module="communication">Begär foto</button></div>'
        : '') +
      visitBlock +
      '</section>'
    );
  }

  function visitSegmentsBlock(visitSegments, patientId) {
    var segments = arr(visitSegments);
    if (!segments.length) return '';
    var reasonLabels = {
      capture_document_date_mismatch: 'Foto- och dokumentdatum skiljer',
      date_without_time_metadata: 'Datum utan tid',
      document_shared_across_same_day_clusters: 'Dokument delat mellan samma dagsbesök',
      inferred_from_path_or_filename: 'Datum härlett från filnamn/sökväg',
      occasion_context_only: 'Datum från tillfälle, saknar tid',
      same_day_time_cluster: 'Flera besök samma dag',
      uncertain_document_date_binding: 'Osäker dokumentkoppling',
    };
    function photoTile(image, segment) {
      var assetId = txt(image && image.assetId);
      var journalPhotoId = txt(image && image.journalPhotoId);
      var href = txt(image && image.openRef);
      var name = txt(image && image.fileName) || 'Foto';
      var label = txt(image && (image.timeLabel || image.takenAt)).slice(0, 16) || 'Foto';
      var editable = Boolean((assetId && href) || journalPhotoId);
      var drawLabel = image && image.offerReady ? '✓ Vald till plan' : '✎ Rita';
      return (
        '<a class="photo-tile over patient-master-image-tile v12-canon-visit-photo"' +
        (href ? ' href="' + esc(href) + '"' : '') +
        (editable
          ? ' role="button" tabindex="0" data-v12-photo-edit data-patient-id="' +
            esc(patientId) +
            '" data-asset-id="' +
            esc(assetId) +
            '" data-journal-photo-id="' +
            esc(journalPhotoId) +
            '" data-encounter-id="' +
            esc(txt(image && image.encounterId)) +
            '" data-photo-src="' +
            esc(href) +
            '" data-photo-name="' +
            esc(name) +
            '" data-photo-zone="' +
            esc(txt(image && (image.imageStage || image.imageType)) || 'Besök') +
            '" data-photo-date="' +
            esc(txt(segment && (segment.date || segment.label))) +
            '" data-photo-capture="' +
            esc(txt(image && image.takenAt)) +
            '"'
          : ' target="_blank" rel="noopener"') +
        ' title="' +
        esc(name) +
        '"><img src="" ' +
        (journalPhotoId
          ? 'data-journal-photo-id="' + esc(journalPhotoId) + '"'
          : 'data-patient-file-id="' + esc(assetId) + '"') +
        ' alt="' +
        esc(name) +
        '" decoding="async" /><span class="lbl">' +
        esc(label) +
        '</span>' +
        (editable
          ? '<span class="photo-tile__draw v12-canon-visit-photo__draw" aria-hidden="true">' +
            drawLabel +
            '</span>'
          : '') +
        '</a>'
      );
    }
    function videoTile(video) {
      var assetId = txt(video && video.assetId);
      var href = txt(video && video.openRef);
      var name = txt(video && video.fileName) || 'Film';
      var durationSeconds = Number(video && video.durationSeconds);
      var durationLabel =
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? Math.floor(durationSeconds / 60) +
            ':' +
            String(Math.round(durationSeconds % 60)).padStart(2, '0')
          : '';
      var sizeBytes = Number(video && video.fileSize);
      var sizeLabel =
        Number.isFinite(sizeBytes) && sizeBytes > 0
          ? (sizeBytes / 1024 / 1024).toFixed(1) + ' MB'
          : '';
      return (
        '<div class="v12-canon-visit-video">' +
        '<video controls preload="auto" playsinline data-patient-file-id="' +
        esc(assetId) +
        '" aria-label="' +
        esc(name) +
        '"></video>' +
        '<div class="v12-canon-visit-video__meta"><span>Film</span><span>' +
        esc(name) +
        '</span>' +
        (durationLabel || sizeLabel
          ? '<small>' + esc([durationLabel, sizeLabel].filter(Boolean).join(' · ')) + '</small>'
          : '') +
        (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">Öppna</a>' : '') +
        (assetId
          ? '<button type="button" class="warn-action" data-v12-archive-asset="' +
            esc(assetId) +
            '">Arkivera</button>'
          : '') +
        '</div></div>'
      );
    }
    function visitRoomStatus(segment) {
      var booking = segment && segment.booking;
      var encounter = segment && segment.encounter;
      if (!booking && !encounter) return '';
      var title =
        txt((booking && booking.title) || (encounter && encounter.serviceLabel)) || 'Besök';
      var startsAt = txt((booking && booking.startsAt) || (encounter && encounter.startsAt));
      var status =
        txt((booking && booking.status) || (encounter && encounter.status)) || 'registrerat';
      return (
        '<div class="visit-segment-room-status"><span><b>' +
        esc(title) +
        '</b><small>' +
        esc(startsAt ? startsAt.slice(0, 16).replace('T', ' · ') : 'Tid saknas') +
        (txt(booking && booking.locationLabel) ? ' · ' + esc(txt(booking.locationLabel)) : '') +
        (txt(booking && booking.notes) ? '<br>Anteckning · ' + esc(txt(booking.notes)) : '') +
        '</small></span>' +
        chip(status === 'completed' ? 'ok' : 'warn', status) +
        '</div>'
      );
    }
    function segmentMarkup(segment) {
      var images = arr(segment && segment.images);
      var videos = arr(segment && segment.videos);
      var documents = arr(segment && segment.documents);
      var journals = arr(segment && segment.journals);
      var counts = [];
      if (images.length) counts.push(images.length + (images.length === 1 ? ' foto' : ' foton'));
      if (videos.length) counts.push(videos.length + (videos.length === 1 ? ' film' : ' filmer'));
      if (documents.length)
        counts.push(documents.length + (documents.length === 1 ? ' dokument' : ' dokument'));
      if (journals.length)
        counts.push(journals.length + (journals.length === 1 ? ' journal' : ' journaler'));
      counts.push(journalStateForSegment(segment));
      var meta = [
        txt(segment && segment.visitType),
        txt(segment && segment.timeRange),
        counts.join(' · '),
      ]
        .filter(Boolean)
        .join(' · ');
      var reasons = arr(segment && segment.reasons)
        .map(function (reason) {
          return reasonLabels[reason] || reason;
        })
        .filter(Boolean);
      var confidence = txt(segment && segment.confidence);
      var warning =
        confidence && confidence !== 'high'
          ? '<div class="card-row"><span class="what">Koppling</span>' +
            chip(
              confidence === 'low' ? 'danger' : 'warn',
              confidence === 'low' ? 'Osäker' : 'Kontrollera'
            ) +
            '</div>'
          : '';
      var reasonRow = reasons.length
        ? '<div class="visit-segment-reasons">' + esc(reasons.join(' · ')) + '</div>'
        : '';
      var photos = images.length
        ? '<div class="photo-grid v12-canon-visit-photo-grid">' +
          images
            .map(function (image) {
              return photoTile(image, segment);
            })
            .join('') +
          '</div>'
        : '<div class="visit-segment-empty">Inga bilder kopplade till detta tillfälle.</div>';
      var encounterId = txt(segment && segment.encounterId);
      var reviewLinks = encounterId
        ? images
            .filter(function (image) {
              return Boolean(txt(image && image.assetId)) && !txt(image && image.encounterId);
            })
            .map(function (image) {
              return (
                '<button type="button" class="warn-action" data-v12-link-encounter' +
                ' data-patient-id="' +
                esc(patientId) +
                '" data-asset-id="' +
                esc(txt(image && image.assetId)) +
                '" data-encounter-id="' +
                esc(encounterId) +
                '">Koppla ' +
                esc(txt(image && image.fileName) || 'bild') +
                ' till besöket</button>'
              );
            })
            .join('')
        : '';
      var reviewBlock = reviewLinks
        ? '<div class="visit-segment-link-review"><b>Behöver bekräftas</b>' + reviewLinks + '</div>'
        : '';
      var films = videos.length
        ? '<div class="v12-canon-visit-video-grid">' + videos.map(videoTile).join('') + '</div>'
        : '<div class="visit-segment-empty">Ingen film kopplad till detta tillfälle.</div>';
      var docs = documents.length
        ? '<div class="visit-segment-documents">' +
          documents
            .map(function (doc) {
              var href = txt(doc.openRef);
              var name = txt(doc.fileName) || 'Dokument';
              var metaParts = [txt(doc.documentDate), txt(doc.type)].filter(Boolean);
              var sizeBytes = Number(doc && doc.fileSize);
              if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
                metaParts.push((sizeBytes / 1024 / 1024).toFixed(1) + ' MB');
              }
              var content =
                '<span class="file-icn">📄</span><span class="file-name">' +
                esc(name) +
                (metaParts.length
                  ? ' <span class="when">' + esc(metaParts.join(' · ')) + '</span>'
                  : '') +
                '</span>';
              var row = href
                ? '<a class="file-row" href="' +
                  esc(href) +
                  '" target="_blank" rel="noopener">' +
                  content +
                  '</a>'
                : '<div class="file-row">' + content + '</div>';
              return (
                row +
                (doc.assetId
                  ? '<button type="button" class="warn-action" data-v12-archive-asset="' +
                    esc(doc.assetId) +
                    '">Arkivera</button>'
                  : '')
              );
            })
            .join('') +
          '</div>'
        : '<div class="visit-segment-empty">Inga dokument kopplade till detta tillfälle.</div>';
      var visitDate = txt(segment && segment.date);
      var roomActions =
        '<div class="visit-segment-actions">' +
        '<button type="button" class="sec-link" data-v11-active-visit-action="photo" data-encounter-id="' +
        esc(encounterId) +
        '" data-visit-date="' +
        esc(visitDate) +
        '">📷 Lägg till bild</button>' +
        '<button type="button" class="sec-link" data-v12-visit-document data-encounter-id="' +
        esc(encounterId) +
        '" data-visit-date="' +
        esc(visitDate) +
        '">📄 Lägg till dokument</button>' +
        '<button type="button" class="sec-link" data-v12-visit-video data-encounter-id="' +
        esc(encounterId) +
        '" data-visit-date="' +
        esc(visitDate) +
        '">🎥 Lägg till film</button>' +
        '</div>';
      return (
        '<details class="card v12-canon-visit-segment" data-visit-room-encounter="' +
        esc(encounterId) +
        '" data-visit-room-date="' +
        esc(visitDate) +
        '"><summary><span class="what">' +
        esc(txt(segment && (segment.label || segment.date)) || 'Tillfälle') +
        '</span><span class="when">' +
        esc(meta) +
        '</span></summary>' +
        warning +
        reasonRow +
        visitRoomStatus(segment) +
        journalBlock(segment) +
        roomActions +
        photos +
        reviewBlock +
        films +
        docs +
        '</details>'
      );
    }
    return (
      '<div class="v12-canon-visit-segments card" data-v12-visit-segments="1">' +
      '<div class="card-l">Foto- och besöksdokumentation</div>' +
      '<div class="visit-segments-list">' +
      segments.map(segmentMarkup).join('') +
      '</div></div>'
    );
  }

  /* ---------- 8 · BOKNINGAR ---------- */
  function s8(bookings, history, patientId) {
    var up = arr(bookings && bookings.items ? bookings.items : bookings);
    var hist = arr(history && history.items ? history.items : history);
    var head = secHead(
      '08',
      'Bokningar',
      up.length + ' kommande · ' + hist.length + ' historik',
      '<button class="sec-link" data-kk-ord48-open-calendar data-patient-id="' +
        esc(patientId) +
        '">+ Boka</button>'
    );
    var rows = up.concat(hist).slice(0, 8);
    if (!rows.length)
      return (
        '<section class="sec" id="s8">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga bokningar registrerade.</div></section>'
      );
    var cta =
      up.length > 0
        ? '<div class="section-cta"><span class="lbl">' +
          up.length +
          (up.length === 1 ? ' kommande tid' : ' kommande tider') +
          ' väntar på bekräftelse från kund</span><button type="button" class="warn-action" data-v12-confirm-bookings>Bekräfta alla</button></div>'
        : '';
    return (
      '<section class="sec" id="s8">' +
      head +
      rows
        .map(function (b, i) {
          var done = i >= up.length;
          var md = monDay(b.whenLong);
          var sourceRecords = arr(b.sourceRecords);
          var shadowMeta =
            b.shadowReadmodel === true && sourceRecords.length
              ? 'Approved historical shadow · ' +
                sourceRecords
                  .map(function (record) {
                    return txt(record && record.tenantId);
                  })
                  .filter(Boolean)
                  .join(' + ')
              : '';
          var notes = arr(b.notes)
            .map(function (n) {
              return txt(n && n.label) + ' · ' + txt(n && n.text);
            })
            .filter(Boolean)
            .join(' · ');
          var bookingMeta = [txt(b.whenShort), txt(b.staff), txt(b.sub), shadowMeta].filter(
            Boolean
          );
          return (
            '<div class="booking-row"><div class="b-date">' +
            esc(md.mon) +
            '<span class="d">' +
            esc(md.day || '—') +
            '</span></div>' +
            '<div><div class="b-title">' +
            esc(txt(b.title || 'Besök')) +
            '</div>' +
            '<div class="b-meta">' +
            esc(bookingMeta.join(' · ')) +
            (notes ? '<br>' + esc(notes) : '') +
            '</div></div>' +
            chip(done ? 'ok' : 'info', done ? 'Genomförd' : txt(b.stateLabel) || 'Bokad') +
            '<button class="j-btn" data-kk-ord48-open-calendar data-patient-id="' +
            esc(patientId) +
            '">' +
            (done ? 'Visa' : 'Bekräfta') +
            '</button></div>'
          );
        })
        .join('') +
      (up.length + hist.length > rows.length
        ? '<div class="empty-state">+ ' +
          (up.length + hist.length - rows.length) +
          ' fler bokningar</div>'
        : '') +
      cta +
      '</section>'
    );
  }

  /* ---------- 9 · DOKUMENT ---------- */
  function s9(files, offers, autoDocs, patientId) {
    var fileItems = arr(files && files.items ? files.items : files);
    var offerItems = arr(offers && offers.items ? offers.items : offers).map(function (o) {
      return {
        id: o.registryId || o.id || '',
        name: o.title || 'Offert',
        title: o.title || 'Offert',
        href: o.viewUrl || '',
        badge: o.amount || '',
        status: o.statusLabel || o.status || '',
        statusLabel: o.statusLabel || o.status || '',
        dateLabel: '',
        category: 'offer',
        previewable: o.previewable === true,
      };
    });
    var autoDocItems = arr(autoDocs && autoDocs.items ? autoDocs.items : autoDocs).map(
      function (d) {
        return {
          id: d.registryId || d.id || '',
          name: d.title || 'Auto-dokument',
          title: d.title || 'Auto-dokument',
          href: '',
          badge: '',
          status: d.statusLabel || d.status || '',
          statusLabel: d.statusLabel || d.status || '',
          dateLabel: '',
          category: 'auto-doc',
          previewable: d.previewable === true,
        };
      }
    );
    var items = offerItems.concat(autoDocItems, fileItems);
    var pending = items.filter(function (f) {
      return /vänt|vant|utkast|pending|sign/i.test(txt(f && (f.status || f.statusLabel)));
    }).length;
    var sub = items.length
      ? items.length + ' totalt' + (pending ? ' · ' + pending + ' signering väntar' : '')
      : null;
    var docInput =
      '<input type="file" accept="application/pdf,.pdf" hidden data-v12-doc-input="' +
      esc(patientId) +
      '">' +
      '<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden data-v12-video-input="' +
      esc(patientId) +
      '">';
    var head = secHead(
      'F',
      'Dokument',
      sub,
      '<button class="sec-link" data-v12-doc-add="' + esc(patientId) + '">+ Lägg till PDF</button>'
    );
    if (!items.length)
      return (
        '<section class="sec" id="s9">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga dokument registrerade.</div>' +
        docInput +
        '</section>'
      );
    return (
      '<section class="sec" id="s9">' +
      head +
      '<div class="doc-grid">' +
      items
        .slice(0, 8)
        .map(function (f) {
          var rawName = txt(f.name || f.title || f.fileName || 'Dokument');
          var lname = rawName.toLowerCase();
          var cat = txt(f.category).toLowerCase();
          var ic = /pdf/i.test(txt(f.mimeType) + ' ' + rawName)
            ? 'pdf'
            : /xls/i.test(rawName)
              ? 'xlsx'
              : cat === 'offer' || cat === 'quote'
                ? 'off'
                : cat === 'auto-doc' || cat === 'auto'
                  ? 'auto'
                  : 'docx';
          // Vänligt namn: facit visar korta kategori-namn ("Avtal + samtycke"),
          // inte råa filnamn (getaccept-5kk3vb…pdf). Härleds ur kategori/filnamn.
          // Tål mojibake (å/ä/ö → "??"/"-") i filnamn: matcha luckor mellan h…sodekl.
          var name = /h.{0,4}[il]sodekl|halsodekl|hd[-_ ]/.test(lname)
            ? 'Hälsodeklaration'
            : /frisk/.test(lname)
              ? 'Friskförsäkran'
              : cat === 'agreement' || /avtal/.test(lname)
                ? 'Avtal + samtycke'
                : cat === 'consent' || /samtycke/.test(lname)
                  ? 'Samtycke'
                  : cat === 'journal' || /journal/.test(lname)
                    ? 'Journal'
                    : cat === 'offer' || cat === 'quote' || /offert/.test(lname)
                      ? 'Offert'
                      : cat === 'auto-doc' || cat === 'auto' || /auto/.test(lname)
                        ? 'Auto-dokument'
                        : cat === 'form' || /formul[aä]r/.test(lname)
                          ? 'Formulär'
                          : rawName
                              .replace(/\.[a-z0-9]+$/i, '')
                              .replace(/[-_]+/g, ' ')
                              .replace(/\s+/g, ' ')
                              .trim() || 'Dokument';
          // Vänlig källa i meta-raden (facit: "12 maj · GetAccept · arkiverad").
          var src = txt(f.sourceSystem).toLowerCase();
          var srcLabel = /getaccept/.test(src)
            ? 'GetAccept'
            : /m365|h[aä]lso/.test(src)
              ? 'Hälsomejl'
              : /journal_sign|cco/.test(src)
                ? 'Signerad i CCO'
                : /drive/.test(src)
                  ? 'Drive'
                  : cat === 'offer'
                    ? 'Offert'
                    : cat === 'auto-doc' || cat === 'auto'
                      ? 'Auto'
                      : '';
          var meta = [txt(f.dateLabel || f.documentDate), srcLabel, txt(f.badge)]
            .filter(Boolean)
            .join(' · ');
          // Vänlig status-chip — mappa rå status (t.ex. VISIBLE_ON_PATIENT_CARD)
          // till facit-etiketter (Klar/Vänta sign/Auto/Intern/Signerat).
          var st = txt(f.status || f.statusLabel).toLowerCase();
          var tone = /v[aä]nt|utkast|pending|await/.test(st)
            ? 'warn'
            : /auto|planerad/.test(st)
              ? 'info'
              : /intern|internal/.test(st)
                ? 'neutral'
                : 'ok';
          var clabel = /v[aä]nt|utkast|pending|await/.test(st)
            ? 'Vänta sign'
            : /auto|planerad/.test(st)
              ? 'Auto'
              : /intern|internal/.test(st)
                ? 'Intern'
                : /signer|signed/.test(st)
                  ? 'Signerat'
                  : /accept/.test(st)
                    ? 'Accepterad'
                    : cat === 'offer' || cat === 'quote'
                      ? 'Skickad'
                      : 'Klar';
          var send = tone === 'warn';
          var btn = f.previewable ? 'Förhandsgranska' : send ? 'Skicka' : 'Öppna';
          var href = txt(f.href);
          var openable = !send && href;
          return (
            '<div class="doc-row"><span class="doc-ic ' +
            ic +
            '">' +
            ic.toUpperCase() +
            '</span>' +
            '<div><div class="doc-name" title="' +
            esc(rawName) +
            '">' +
            esc(name) +
            '</div>' +
            '<div class="doc-meta">' +
            esc(meta) +
            '</div></div>' +
            chip(tone, clabel) +
            '<button class="j-btn' +
            (send ? ' primary' : '') +
            '"' +
            (openable
              ? ' data-doc-open="' + esc(href) + '" data-doc-name="' + esc(name) + '"'
              : '') +
            '>' +
            esc(btn) +
            '</button>' +
            '</div>'
          );
        })
        .join('') +
      '</div>' +
      docInput +
      '</section>'
    );
  }

  /* ---------- 10 · KOMMUNIKATION ---------- */
  function s10(comm, card, conversationThreads) {
    var replyEmail = txt(card && (card.primaryEmail || card.email));
    // Fas 2.1: om riktiga konversationstrådar finns, rendera dem istället för
    // den syntetiska kommunikationslistan.
    if (conversationThreads && conversationThreads.threads && conversationThreads.threads.length) {
      return s10ConversationThreads(conversationThreads, card, replyEmail);
    }
    var items = arr(comm && comm.items ? comm.items : comm);
    // "senaste kontakt: <datum>" ur första (nyaste) meddelandets meta.
    var lastDate = items.length ? txt(items[0].meta).split('·').pop().trim() : '';
    var head = secHead(
      'G',
      'Kommunikation',
      lastDate ? 'senaste kontakt: ' + lastDate : null,
      replyEmail ? '<a class="sec-link" href="mailto:' + esc(replyEmail) + '">+ Svara</a>' : ''
    );
    if (!items.length)
      return (
        '<section class="sec" id="s10">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Ingen kommunikation registrerad.</div></section>'
      );
    return (
      '<section class="sec" id="s10">' +
      head +
      items
        .slice(0, 6)
        .map(function (c) {
          var k = /sms/i.test(txt(c.type))
            ? 'sms'
            : /call|samtal|ring|phone/i.test(txt(c.type))
              ? 'call'
              : 'mail';
          var ic = k === 'sms' ? '💬' : k === 'call' ? '📞' : '✉️';
          return (
            '<div class="comm-row"><span class="comm-ic ' +
            k +
            '">' +
            ic +
            '</span>' +
            '<div class="comm-body"><div class="who">' +
            esc(txt(c.text || 'Meddelande')) +
            '</div>' +
            (txt(c.preview) ? '<div class="pre">' + esc(txt(c.preview)) + '</div>' : '') +
            '</div>' +
            '<div class="comm-meta">' +
            esc(txt(c.meta || '')) +
            '</div></div>'
          );
        })
        .join('') +
      '</section>'
    );
  }

  function s10ConversationThreads(data, card, replyEmail) {
    var threads = arr(data.threads);
    var counts = data.counts || {};
    var total = Number(counts.all || threads.length) || 0;
    var lastThread = threads[0] || {};
    var lastDate = lastThread.ts ? lastThread.ts.slice(0, 10) : '';
    var customerId = data.customerId || card.id || card.patientId || card.customerId || '';

    var head = secHead(
      'G',
      'Kommunikation',
      lastDate ? total + ' trådar · senaste ' + lastDate : total + ' trådar',
      replyEmail ? '<a class="sec-link" href="mailto:' + esc(replyEmail) + '">+ Svara</a>' : ''
    );

    var kindMap = {
      incoming_mail: { cls: 'in', icon: '✉', label: 'In' },
      outgoing_mail: { cls: 'out', icon: '✉', label: 'Ut' },
      system_mail: { cls: 'system', icon: '🤖', label: 'System' },
      internal_note: { cls: 'internal', icon: '📝', label: 'Intern' },
      comm_draft: { cls: 'draft', icon: '✏️', label: 'Utkast' },
      comm_draft_needs_approval: { cls: 'needs-approval', icon: '⚡', label: 'Godkänn' },
      comm_sent: { cls: 'sent', icon: '✓', label: 'Skickat' },
      form_sent: { cls: 'sent', icon: '📋', label: 'Formulär' },
      consent_sent: { cls: 'sent', icon: '✅', label: 'Samtycke' },
      file_sent: { cls: 'sent', icon: '📎', label: 'Fil' },
      portal_message: { cls: 'portal', icon: '💬', label: 'Portal' },
    };

    var rows = threads
      .slice(0, 8)
      .map(function (t) {
        var k = kindMap[t.kind] || { cls: '', icon: '•', label: t.kind || '?' };
        var isUnread = t.threadStatus === 'unread';
        var subject = esc(txt(t.subject || '(utan ämne)'));
        var preview = esc(txt(t.preview || ''));
        var time = t.ts ? t.ts.slice(0, 10) : '';
        var statusHtml = '';
        if (t.unanswered) statusHtml += '<span class="comm-status unanswered">Obesvarad</span>';
        else if (t.snoozedUntil) statusHtml += '<span class="comm-status snoozed">Snoozad</span>';
        else if (t.handled) statusHtml += '<span class="comm-status handled">Klar</span>';
        else if (isUnread) statusHtml += '<span class="comm-status unread">Oläst</span>';

        var linkHtml = '';
        if (t.conversationId) {
          var convParams = 'view=conversations&conv=' + encodeURIComponent(t.conversationId);
          if (customerId) convParams += '&customerId=' + encodeURIComponent(customerId);
          linkHtml =
            '<a class="sec-link" href="?' +
            esc(convParams) +
            '" title="Öppna tråden i Konversationer">Visa →</a>';
        }

        return (
          '<div class="comm-row' +
          (isUnread ? ' is-unread' : '') +
          '">' +
          '<span class="comm-ic ' +
          k.cls +
          '">' +
          k.icon +
          '</span>' +
          '<div class="comm-body"><div class="who">' +
          subject +
          '</div>' +
          (preview ? '<div class="pre">' + preview + '</div>' : '') +
          '</div>' +
          '<div class="comm-meta">' +
          '<span class="comm-kind ' +
          k.cls +
          '">' +
          esc(k.label) +
          '</span>' +
          statusHtml +
          (time ? '<span class="comm-time">' + esc(time) + '</span>' : '') +
          linkHtml +
          '</div></div>'
        );
      })
      .join('');

    return '<section class="sec" id="s10">' + head + rows + '</section>';
  }

  /* ---------- 11 · EKONOMI ---------- */
  function s11(econ, invoices, patientId) {
    var head = secHead(
      'H',
      'Ekonomi',
      null,
      '<button class="sec-link" data-v12-fortnox-sync data-patient-id="' +
        esc(patientId) +
        '">→ Fortnox</button>'
    );
    var cells = arr(econ && econ.items);
    var inv = arr(invoices && invoices.items ? invoices.items : invoices);
    return (
      '<section class="sec" id="s11">' +
      head +
      (cells.length
        ? '<div class="eko-stats">' +
          cells
            .map(function (c) {
              return (
                '<div class="eko-cell"><div class="l">' +
                esc(txt(c.label)) +
                '</div><div class="v">' +
                esc(txt(c.value)) +
                '</div></div>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      (inv.length
        ? '<div class="doc-grid">' +
          inv
            .slice(0, 6)
            .map(function (r) {
              var tone = /betald|paid/i.test(txt(r.status))
                ? 'ok'
                : /makul|fail/i.test(txt(r.status))
                  ? 'danger'
                  : 'neutral';
              return (
                '<div class="doc-row"><span class="doc-ic pdf">PDF</span>' +
                '<div><div class="doc-name">' +
                esc(txt(r.title || 'Faktura')) +
                '</div>' +
                '<div class="doc-meta">' +
                esc(txt((r.amount || '') + (r.date ? ' · ' + r.date : ''))) +
                '</div></div>' +
                chip(tone, txt(r.statusLabel || r.status || '—')) +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      '<div class="when" data-v12-fortnox-status></div></section>'
    );
  }

  /* ---------- 12 · INSIKTER ---------- */
  function s12(nextStep, insights, patientId) {
    var head = secHead('12', 'Insikter och nästa bästa åtgärd');
    var blocks = '';
    if (nextStep && nextStep.what) {
      blocks +=
        '<div class="insight-card"><div class="insight-l">⚡ Gör nu</div>' +
        '<div class="insight-what">' +
        esc(txt(nextStep.what)) +
        '</div>' +
        (nextStep.why ? '<div class="insight-why">' + esc(txt(nextStep.why)) + '</div>' : '') +
        '<div class="insight-actions"><button class="warn-action amber" data-kk-sig="' +
        esc(nextStep.ruleId) +
        '">' +
        esc(nextStep.ctaLabel || 'Åtgärda') +
        '</button></div></div>';
    }
    var opp = arr(insights && insights.items ? insights.items : insights).filter(function (i) {
      return i && i.tone !== 'blocker' && i.tone !== 'review';
    });
    if (opp.length) {
      var o = opp[0];
      blocks +=
        '<div class="insight-card green"><div class="insight-l">💡 Möjlighet</div>' +
        '<div class="insight-what">' +
        esc(txt(o.title)) +
        '</div>' +
        (o.text ? '<div class="insight-why">' + esc(txt(o.text)) + '</div>' : '') +
        '<div class="insight-actions"><button class="warn-action greenbtn" data-kk-ord48-open-calendar data-patient-id="' +
        esc(patientId) +
        '">Boka</button></div></div>';
    }
    if (!blocks)
      blocks =
        '<div class="card" style="color:var(--ink-mute)">Inga aktiva insikter just nu.</div>';
    return '<section class="sec" id="s12">' + head + blocks + '</section>';
  }

  /* ---------- E · BEHANDLINGSPLAN / OFFERT (SAMMANSLAGEN) ---------- */
  function sPlan(offers, commercialCase, patientId) {
    var offerItems = arr(offers && offers.items ? offers.items : offers);
    var head = secHead(
      'E',
      'Behandlingsplan / Offert',
      'blockerande moment · kräver godkännande',
      '<button class="sec-link" data-v11-active-visit-action="journal">+ Skapa utkast</button>'
    );
    // Graftantal läses defensivt ur kommersiellt ärende / offertplan. Saknas det
    // visas SAMMANSLAGEN:s tom-tillstånd ("Saknas" + "Sätt antal") — ingen fejk.
    var cc = commercialCase || {};
    var graftTotal =
      txt(cc.graftsTotal) ||
      txt(cc.offerPlan && cc.offerPlan.graftsTotal) ||
      txt(cc.offerPlan && cc.offerPlan.grafts && cc.offerPlan.grafts.total) ||
      '';
    var planRow;
    if (offerItems.length) {
      var o = offerItems[0];
      planRow =
        '<div class="doc-row"><span class="doc-ic off">OFF</span><div><div class="doc-name">' +
        esc(txt(o.title) || 'Behandlingsplan') +
        '</div><div class="doc-meta">' +
        esc([txt(o.amount), txt(o.statusLabel || o.status)].filter(Boolean).join(' · ')) +
        '</div></div>' +
        chip('warn', 'Väntar steg 4') +
        '<button class="j-btn" data-v11-active-visit-action="journal">Öppna</button></div>';
    } else {
      planRow =
        '<div class="doc-row"><span class="doc-ic docx">PLAN</span><div><div class="doc-name">Ingen behandlingsplan ännu</div><div class="doc-meta">Skapas i steg 5 · efter slutförd konsultation</div></div>' +
        chip('warn', 'Väntar steg 4') +
        '<button class="j-btn" data-v11-active-visit-action="journal">Förbered</button></div>';
    }
    var graftRow = graftTotal
      ? '<div class="doc-row"><span class="doc-ic xlsx">ANT</span><div><div class="doc-name">Graftantal · ' +
        esc(graftTotal) +
        '</div><div class="doc-meta">Sätts per zon i rit-editorn · matar offertens prissättning</div></div>' +
        chip('ok', 'Satt') +
        '<button class="j-btn primary" data-v11-active-visit-action="journal">Redigera</button></div>'
      : '<div class="doc-row"><span class="doc-ic xlsx">ANT</span><div><div class="doc-name">Graftantal ej beräknat</div><div class="doc-meta">Sätts per zon i rit-editorn · matar offertens prissättning</div></div>' +
        chip('danger', 'Saknas') +
        '<button class="j-btn primary" data-v11-active-visit-action="journal">Sätt antal</button></div>';
    return (
      '<section class="sec" id="s-plan" data-v12-module="plan">' +
      head +
      '<div class="doc-grid">' +
      planRow +
      graftRow +
      '</div></section>'
    );
  }

  /* ---------- C · JOURNAL (SAMMANSLAGEN) ---------- */
  function sJournal(journals) {
    var items = arr(journals && journals.items ? journals.items : journals);
    var head = secHead(
      'C',
      'Journal',
      items.length ? items.length + ' journalposter' : '0 dagens · 0 tidigare',
      '<button class="sec-link" data-v11-active-visit-action="notes">+ Ny anteckning</button>'
    );
    if (!items.length) {
      return (
        '<section class="sec" id="s-journal" data-v12-module="journal">' +
        head +
        '<div class="journal-row"><div class="journal-date">Ingen<span class="d">—</span></div>' +
        '<div><div class="journal-title">Inga journalanteckningar ännu</div>' +
        '<div class="journal-meta">Första anteckningen skapas när konsultationen startas</div></div>' +
        chip('warn', 'Saknas') +
        '<div class="journal-actions"><button class="j-btn primary" data-v11-active-visit-action="journal">Starta journal</button></div></div></section>'
      );
    }
    return (
      '<section class="sec" id="s-journal" data-v12-module="journal">' +
      head +
      items
        .map(function (j) {
          var signed = j.state === 'signed';
          var meta = txt(j.meta) || txt(j.snippet) || '';
          return (
            '<div class="journal-row"><div class="journal-date">—</div>' +
            '<div><div class="journal-title">' +
            esc(txt(j.title)) +
            '</div>' +
            (meta ? '<div class="journal-meta">' + esc(meta) + '</div>' : '') +
            '</div>' +
            chip(signed ? 'ok' : 'warn', txt(j.badge) || (signed ? 'Signerad' : 'Utkast')) +
            '<div class="journal-actions"><button class="j-btn' +
            (signed ? '' : ' primary') +
            '" data-v11-active-visit-action="journal">' +
            (signed ? 'Öppna' : 'Fortsätt') +
            '</button></div></div>'
          );
        })
        .join('') +
      '</section>'
    );
  }

  /* ---------- SMART INFORMATION (V11-banner) ---------- */
  function smartBanner(nextStep) {
    if (!nextStep || !nextStep.what) return '';
    return (
      '<div class="card" data-v12-module="smart-info" style="box-shadow:inset 3px 0 0 var(--amber)">' +
      '<div class="card-l">Smart information</div>' +
      '<div class="card-row"><span class="what">Nästa: <b>' +
      esc(txt(nextStep.what)) +
      '</b></span></div>' +
      (nextStep.why
        ? '<div class="card-row"><span class="what"><em>' +
          esc(txt(nextStep.why)) +
          '</em></span></div>'
        : '') +
      '</div>'
    );
  }

  /* ---------- AUTO-DOKUMENT (V11) — egen sektion ---------- */
  function sAutoDocs(autoDocs) {
    var items = arr(autoDocs && autoDocs.items ? autoDocs.items : autoDocs);
    if (!items.length) return '';
    var head = secHead('', 'Auto-dokument', items.length + ' auto-genererade', '');
    return (
      '<section class="sec" id="s-auto-docs" data-v12-module="auto-docs">' +
      head +
      '<div class="doc-grid">' +
      items
        .slice(0, 6)
        .map(function (d) {
          var st = txt(d.status || d.statusLabel).toLowerCase();
          var tone = /v[äa]nt|utkast/i.test(st)
            ? 'warn'
            : /lever|klar|send|betald/i.test(st)
              ? 'ok'
              : 'info';
          var label = txt(d.statusLabel || d.status) || 'Auto';
          return (
            '<div class="doc-row"><span class="doc-ic auto">AUTO</span>' +
            '<div><div class="doc-name">' +
            esc(txt(d.title || d.name)) +
            '</div>' +
            '<div class="doc-meta">auto-genererad</div></div>' +
            chip(tone, label) +
            '<button class="j-btn" data-v11-active-visit-action="journal">Öppna</button></div>'
          );
        })
        .join('') +
      '</div></section>'
    );
  }

  /* ---------- ANTECKNINGAR (V11) — egen sektion ---------- */
  function sNotes(journalEntries) {
    var notes = arr(journalEntries).filter(function (e) {
      return e && (e.type === 'note' || e.journalType === 'note');
    });
    if (!notes.length) return '';
    var head = secHead('', 'Anteckningar', notes.length + ' anteckningar', '');
    return (
      '<section class="sec" id="s-notes" data-v12-module="notes">' +
      head +
      '<div class="card">' +
      notes
        .slice(0, 8)
        .map(function (n) {
          var text = txt(n.note || n.text || n.title || n.snippet);
          var meta = [txt(n.author), txt(n.dateLabel)].filter(Boolean).join(' · ');
          return (
            '<div class="subcard-row"><span class="what">' +
            esc(text) +
            '</span>' +
            (meta ? '<span class="when">' + esc(meta) + '</span>' : '') +
            '</div>'
          );
        })
        .join('') +
      '</div></section>'
    );
  }

  /* ---------- RAIL + STICKY ---------- */
  var JUMP = [
    ['s3', 'Varningar', 'A'],
    ['s5', 'Kundresa', 'B'],
    ['s-journal', 'Journal', 'C'],
    ['s7', 'Foto', 'D'],
    ['s-plan', 'Plan / Offert', 'E'],
    ['s9', 'Dokument', 'F'],
    ['s10', 'Kommunikation', 'G'],
    ['s11', 'Ekonomi', 'H'],
    ['s-uppfoljning', 'Uppföljning', 'I'],
    ['s-historik', 'Historik', 'J'],
  ];

  /* ---------- HEADER + TABBAR (scroll-ankare) ---------- */
  function header(profile, patientId) {
    profile = profile || {};
    var name = txt(profile.name || 'Kund');
    return (
      '<header class="v12-canon__header">' +
      '<button type="button" class="v12-canon__back" data-v12-canon-back aria-label="Stäng kundvy">' +
      '<span aria-hidden="true">‹</span> Tillbaka' +
      '</button>' +
      '<div class="v12-canon__header-main">' +
      '<h1 class="v12-canon__header-title">' +
      esc(name) +
      '</h1>' +
      '<div class="v12-canon__header-meta">' +
      (patientId ? '<span>#' + esc(patientId) + '</span>' : '') +
      '<span class="v12-canon__header-pill">V12</span>' +
      '</div>' +
      '</div>' +
      '</header>'
    );
  }

  function rail(events, nextStep, bundle, card) {
    var evs = arr(events);
    var rows = evs.length
      ? evs
          .map(function (e) {
            return (
              '<div class="rail-row"><span class="what">' +
              esc(txt(e.what)) +
              '</span><span class="when">' +
              esc(txt(e.when)) +
              '</span></div>'
            );
          })
          .join('')
      : '<div class="rail-row"><span class="what">Kunddossier öppnad</span><span class="when">nu</span></div>';
    // Rail-hero-action (ABDIRAHMAN) — smart nästa steg högst upp i railen.
    var heroAction =
      nextStep && nextStep.what
        ? '<div class="rail-hero-action"><div class="lbl">Smart nästa steg · nu</div>' +
          '<div class="title">' +
          esc(txt(nextStep.what)) +
          '</div>' +
          (nextStep.why ? '<div class="sub">' + esc(txt(nextStep.why)) + '</div>' : '') +
          '<div class="ctas"><button type="button" class="cta secondary" data-v12-scroll-module="insights">Granska</button>' +
          '<button class="cta primary" data-kk-sig="' +
          esc(txt(nextStep.ruleId)) +
          '">' +
          esc(txt(nextStep.ctaLabel) || 'Skicka') +
          '</button></div></div>'
        : '';
    // Kommande bokningar (ABDIRAHMAN) — med badge + tom-läge.
    var up = arr(bundle && bundle.upcomingBookings);
    var bookCard =
      '<div class="rail-card"><div class="rail-l"><span>Kommande bokningar</span><span class="badge">' +
      up.length +
      '</span></div>' +
      (up.length
        ? up
            .slice(0, 3)
            .map(function (b) {
              return (
                '<div class="subcard-row"><span class="what">' +
                esc(txt(b.title || b.serviceLabel || 'Bokning')) +
                '</span><span class="when">' +
                esc(txt(b.dayLabel || b.dateLabel || b.timeLabel || '')) +
                '</span></div>'
              );
            })
            .join('')
        : '<div class="empty-state">Inga kommande bokningar — kontakta kunden för återbesök så hen inte tappas.</div>') +
      '</div>';
    // Snabb-åtgärder (ABDIRAHMAN).
    var quickCard =
      '<div class="rail-card"><div class="rail-l">Snabb-åtgärder</div><div class="quick-actions">' +
      '<button class="quick-btn dark full" data-v11-active-visit-action="photo">📷 Ta bild · spara i journal</button>' +
      '<button class="quick-btn" data-v11-active-visit-action="notes">✏️ Anteckna</button>' +
      '<button type="button" class="quick-btn" data-v12-reply-studio>💬 Svarstudio</button>' +
      '<button type="button" class="quick-btn full" data-kk-ord48-open-calendar data-patient-id="' +
      esc(txt(card && (card.patientId || card.id))) +
      '">📅 Boka återbesök</button>' +
      '</div></div>';
    return (
      '<aside class="rail">' +
      heroAction +
      '<div class="rail-card"><div class="rail-l">Snabb-jump</div><div class="rail-jump">' +
      JUMP.map(function (j) {
        return (
          '<a data-v12-canon-jump="' +
          j[0] +
          '"><span>' +
          esc(j[1]) +
          '</span><span class="num">' +
          j[2] +
          '</span></a>'
        );
      }).join('') +
      '</div></div>' +
      bookCard +
      quickCard +
      '<div class="rail-card"><div class="rail-l">Senaste händelser</div>' +
      rows +
      '</div></aside>'
    );
  }
  function sticky(nextStep, card, av) {
    var name = txt(card.displayName || card.name);
    // Kontext-detalj (facit: "· PRP 2/3 pågår · Rum 2") ur aktivt besök.
    var ctxParts = [name];
    var visitState = txt(av && av.state).toLowerCase();
    var visitSuffix =
      visitState === 'completed_today'
        ? 'avslutat'
        : visitState === 'scheduled_today'
          ? 'planerat idag'
          : visitState === 'checked_in'
            ? 'incheckad'
            : 'pågår';
    if (av && txt(av.title)) ctxParts.push(txt(av.title) + ' ' + visitSuffix);
    if (av && txt(av.room)) ctxParts.push(txt(av.room));
    var msg = nextStep && nextStep.what ? '⚡ ' + txt(nextStep.what) : 'Förbered nästa steg';
    // Primär sticky: när ett hälsodeklarations-/friskförsäkran-steg är nästa steg
    // blir knappen "Skicka HD nu" (samma signal-handler som smart nästa steg),
    // annars besökets egen primäråtgärd (journal / avsluta / …).
    var hdPending =
      nextStep &&
      /h[äa]lsodekl|h[äa]lsoform|friskf[öo]rs|signer/i.test(
        txt(nextStep.what) + ' ' + txt(nextStep.ruleId)
      );
    var primaryAction = txt(av && av.primary && av.primary.action) || 'journal';
    var primaryLabel = txt(av && av.primary && av.primary.label) || 'Starta journal';
    var primaryBtn = hdPending
      ? '<button class="sticky-btn primary" data-kk-sig="' +
        esc(txt(nextStep.ruleId)) +
        '">📤 Skicka HD nu</button>'
      : '<button class="sticky-btn primary" data-v11-active-visit-action="' +
        esc(primaryAction) +
        '">' +
        esc(primaryLabel) +
        '</button>';
    return (
      '<div class="v12-canon__sticky"><div class="v12-canon__sticky-inner">' +
      '<div class="sticky-context">' +
      esc(ctxParts.join(' · ')) +
      '<b>' +
      esc(msg) +
      '</b></div>' +
      '<button class="sticky-btn sec" data-v11-active-visit-action="photo">📷 Foto</button>' +
      '<button class="sticky-btn sec" data-v12-scroll-module="photos">✎ Rita</button>' +
      primaryBtn +
      '</div></div>'
    );
  }

  /* ---------- STATS-rad (ABDIRAHMAN) — nyckeltal under hero ---------- */
  function statCell(cls, l, v, subCls, sub) {
    return (
      '<div class="stat' +
      (cls ? ' ' + cls : '') +
      '"><div class="l">' +
      esc(l) +
      '</div><div class="v">' +
      esc(v) +
      '</div>' +
      (sub ? '<div class="sub ' + subCls + '">' + esc(sub) + '</div>' : '') +
      '</div>'
    );
  }
  function stats(card, econ, bundle) {
    var up = arr(bundle && bundle.upcomingBookings);
    var hist = arr(bundle && bundle.historyBookings);
    var visits =
      card.visitsThisYear != null
        ? String(card.visitsThisYear)
        : hist.length
          ? String(hist.length)
          : '—';
    var value =
      txt(card.totalValue) ||
      txt(econ && econ.items && econ.items[0] && econ.items[0].value) ||
      '—';
    var debt = card.outstandingBalance != null ? txt(card.outstandingBalance) : '0';
    var nb = up[0];
    return (
      '<div class="stats">' +
      statCell('hero', 'Besök · i år', visits, 'mute', '') +
      statCell('', 'Värde totalt', value, 'mute', '') +
      statCell('', 'Skuld', debt, 'mute', 'kronor') +
      statCell(
        '',
        'Nästa besök',
        nb ? txt(nb.dayLabel || nb.day || nb.dateLabel || '—') : '—',
        nb ? 'mute' : 'warn',
        nb ? txt(nb.title || nb.serviceLabel || 'Bokad') : 'Inga bokningar'
      ) +
      '</div>'
    );
  }

  /* ---------- FOTO-DOKUMENTATION (ABDIRAHMAN) — tvärsnitt alla besök ----------
     Grupperas PER BESÖK (datum) så vyn skalar för kunder med många besök utan
     omdesign: ett märkt foto-band per besök, nyast först. Ingen fejk — grupp =
     bildernas egna capturedAt/dateLabel. */
  function fotoDok(photos) {
    var items = arr(photos && photos.items ? photos.items : photos);
    if (!items.length) return '';
    // Gruppera per besök (datum). Bevarar inkommande ordning (nyast först).
    var groups = {};
    var order = [];
    items.forEach(function (p) {
      var key = txt(p.dateLabel || p.photoDateLabel || p.capturedAt).slice(0, 12) || 'Okänt datum';
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(p);
    });
    var pi = 0;
    var groupsHtml = order
      .map(function (key) {
        var g = groups[key];
        var tiles = g
          .slice(0, 12)
          .map(function (p) {
            var bg = p.thumbnailUrl || p.viewUrl || p.url || p.href;
            pi += 1;
            var ph = txt(p.phase);
            var prefix =
              ph === 'before'
                ? 'FÖRE'
                : ph === 'after'
                  ? 'EFTER'
                  : p.isImage === false
                    ? 'FILM'
                    : 'ÖVER';
            // Klickbar → öppna rit-editorn på besöksfotot (foto-annotation →
            // sparas i Foto + offert/behandlingsplan). Bara stillbilder, ej film.
            var src = txt(p.href || p.viewUrl || p.url);
            var editable = p.isImage !== false && src;
            return (
              '<div class="photo-tile p' +
              ((pi % 6) + 1) +
              (editable ? ' photo-tile--editable' : '') +
              '"' +
              (bg ? ' style="background-image:url(' + esc(bg) + ')"' : '') +
              (editable
                ? ' role="button" tabindex="0" data-v12-photo-edit' +
                  ' data-asset-id="' +
                  esc(txt(p.id)) +
                  '" data-photo-src="' +
                  esc(src) +
                  '" data-photo-name="' +
                  esc(txt(p.name || 'Bild')) +
                  '" data-photo-zone="' +
                  esc(txt(p.zone || p.phase)) +
                  '" data-photo-date="' +
                  esc(txt(p.dateLabel || p.capturedAt)) +
                  '"'
                : '') +
              '><span class="lbl">' +
              esc(prefix) +
              '</span>' +
              (editable ? '<span class="photo-tile__draw" aria-hidden="true">✎ Rita</span>' : '') +
              '</div>'
            );
          })
          .join('');
        var more =
          g.length > 12
            ? '<div class="empty-state">+ ' + (g.length - 12) + ' fler bilder</div>'
            : '';
        return (
          '<div class="subcard-l" style="margin-top:12px">' +
          esc(key) +
          ' · ' +
          g.length +
          ' bilder</div><div class="foto-strip">' +
          tiles +
          '</div>' +
          more
        );
      })
      .join('');
    var fl = txt(items[0].dateLabel || items[0].capturedAt).slice(0, 12);
    var ll = txt(items[items.length - 1].dateLabel || items[items.length - 1].capturedAt).slice(
      0,
      12
    );
    var gap = items.some(function (p) {
      return p.gap || p.viewGap;
    });
    return (
      '<section class="section"><div class="section-head"><span class="section-title">Foto-dokumentation · alla besök</span><span class="section-meta">' +
      items.length +
      ' bilder · ' +
      order.length +
      (order.length === 1 ? ' besök' : ' besök') +
      ' · nyast först</span></div>' +
      groupsHtml +
      (items.length >= 2
        ? '<div class="before-after-bar"><div class="lbl">Före/efter-par föreslaget: <b>' +
          esc(fl || 'Före') +
          '</b> <span class="sep">↔</span> <b>' +
          esc(ll || 'Efter') +
          '</b></div><button class="smart-btn primary">Jämför</button></div>'
        : '') +
      (gap
        ? '<div class="gap-notice"><span>⚠ Hårlinje &amp; Krona-vy saknas för fullständig dokumentation</span><button class="smart-btn">Begär foto</button></div>'
        : '') +
      '</section>'
    );
  }

  /* ---------- HISTORIK (SAMMANSLAGEN J) — tidigare resor ---------- */
  function histSection(bundle, patientId) {
    var hist = arr(bundle && bundle.historyBookings);
    if (!hist.length) return '';
    var rows = hist
      .slice(0, 8)
      .map(function (b) {
        var d = txt(b.dateLabel || b.dayLabel || b.day);
        var md = monDay(d, '');
        var meta = [txt(b.timeLabel || b.duration), txt(b.practitioner)]
          .filter(Boolean)
          .join(' · ');
        var status = txt(b.statusLabel || b.status);
        var tone = /ofullst|incomplete|saknas/i.test(status) ? 'warn' : 'ok';
        var label = status || 'Genomförd';
        return (
          '<div class="booking-row"><div class="b-date">' +
          esc(md.mon) +
          '<span class="d">' +
          esc(md.day || '—') +
          '</span></div><div><div class="b-title">' +
          esc(txt(b.title || b.serviceLabel || 'Besök')) +
          '</div><div class="b-meta">' +
          esc(meta) +
          '</div></div>' +
          chip(tone, label) +
          '<button class="j-btn" data-kk-ord48-open-calendar data-patient-id="' +
          esc(patientId) +
          '">Öppna</button></div>'
        );
      })
      .join('');
    return (
      '<section class="section" id="s-historik" data-v12-module="historik"><div class="section-head"><span class="section-title">Historik · tidigare resor</span><span class="section-meta">' +
      hist.length +
      ' tidigare besök</span></div>' +
      rows +
      (hist.length > 8
        ? '<div class="empty-state">+ ' + (hist.length - 8) + ' fler tidigare besök</div>'
        : '') +
      '</section>'
    );
  }

  /* ---------- UPPFÖLJNING (SAMMANSLAGEN I) — efter avslutad resa ---------- */
  function uppfoljning(insights, patientId) {
    // Recall-schema = standard klinisk kadens (ej fabricerad patientdata).
    var recall = [
      ['3', 'Efterkontroll', 'Planeras när behandling genomförts'],
      ['6', 'Resultatbild', 'Före/efter-par mot baseline'],
      ['12', 'Utvärdering', 'Slututvärdering + retention-signal'],
    ];
    var opps = arr(insights && insights.items ? insights.items : insights)
      .filter(function (i) {
        return i && i.tone !== 'blocker' && i.tone !== 'review';
      })
      .slice(0, 3);
    var retentionRows = opps.length
      ? opps
          .map(function (o) {
            return (
              '<div class="subcard-row"><span class="what">' +
              esc(txt(o.title || o.what)) +
              '</span>' +
              chip('info', 'Möjlighet') +
              '</div>'
            );
          })
          .join('')
      : '<div class="subcard-row"><span class="what">Inga retention-signaler ännu</span></div>';
    return (
      '<section class="section" id="s-uppfoljning" data-v12-module="uppfoljning"><div class="section-head"><span class="section-title">Uppföljning · efter avslutad resa</span><span class="section-meta">recall-plan</span></div>' +
      recall
        .map(function (r) {
          return (
            '<div class="booking-row"><div class="b-date">mån<span class="d">' +
            esc(r[0]) +
            '</span></div><div><div class="b-title">' +
            esc(r[1]) +
            '</div><div class="b-meta">' +
            esc(r[2]) +
            '</div></div>' +
            chip('neutral', 'Ej schemalagd') +
            '<button class="j-btn" data-kk-ord48-open-calendar data-patient-id="' +
            esc(patientId) +
            '">Boka</button></div>'
          );
        })
        .join('') +
      '<div class="subcard"><div class="subcard-l">Retention-signaler</div>' +
      retentionRows +
      '</div></section>'
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
    // Fas 2.1: riktiga konversationstrådar från backend (patient-master-ui.js laddar dem asynkront).
    var conversationThreads = ctx.conversationThreads || null;
    var econ = call('buildEconomyFromCard', [card], null);
    var invoices = call('buildEconomyInvoices', [bundle && bundle.paymentHistory], null);
    var nextStep = call('buildSmartNextStep', [card], null);
    var insights = call('buildInsightsFromSignals', [card], null);
    var recentEvents = call('buildRecentEvents', [card, bundle, ctx.journalEntries], []);
    // Per-steg asset-räknare: ctx.stepAssets (demo äger sin data) vinner; annars
    // härled ur RIKTIGA driveFiles/journalEntries (filnamn → steg). Ingen fejk.
    var stepAssets =
      ctx.stepAssets || call('buildStepAssets', [journey, ctx.driveFiles, ctx.journalEntries], {});

    var patientId = card.id || card.patientId || (ctx.patient && ctx.patient.id);

    var profile = call('buildProfileFromBcard', [card], null);

    var main =
      '<div class="v12-canon__main">' +
      s1(card, journey) +
      stats(card, econ, bundle) +
      s3(warnings) +
      s5(journey, av, nextStep, photos, health, stepAssets) +
      sJournal(journals) +
      s7(photos, ctx.visitSegments, patientId) +
      sPlan(offers, ctx.commercialCase, patientId) +
      s9(files, offers, autoDocs, patientId) +
      s10(comm, card, conversationThreads) +
      s11(econ, invoices, patientId) +
      uppfoljning(insights, patientId) +
      histSection(bundle, patientId) +
      '</div>';
    // Lägg data-v12-module på varje sektion så befintlig scrollV12WorkspaceModule
    // + jump-rail-launcher (inferV12ModuleFromRailClick) landar rätt vid sektionsklick.
    var SEC_MODULE = {
      s1: 'current-state',
      s2: 'active-visit',
      s3: 'warnings',
      s4: 'health',
      s5: 'journey',
      s7: 'visits',
      s8: 'bookings',
      s9: 'documents',
      s10: 'communication',
      s11: 'economy',
      s12: 'insights',
    };
    main = main.replace(/<section class="sec" id="(s\d+)"/g, function (m, id) {
      return SEC_MODULE[id] ? m + ' data-v12-module="' + SEC_MODULE[id] + '"' : m;
    });

    return (
      '<div class="v12-canon" data-v12-canon="1">' +
      header(profile, patientId) +
      '<div class="v12-canon__grid">' +
      main +
      rail(recentEvents, nextStep, bundle, card) +
      '</div>' +
      sticky(nextStep, card, av) +
      '</div>'
    );
  }

  global.CcoV12Canon = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
