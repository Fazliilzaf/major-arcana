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
      '<button class="quick-btn">📞 Ring</button><button class="quick-btn">💬 SMS</button>' +
      '<button class="quick-btn">✉️ Mejl</button><button class="quick-btn">📅 Ny bokning</button>' +
      '<button class="quick-btn" data-v12-edit-open>✏️ Redigera</button>' +
      '</div></div>' +
      '<div class="s1-actions"><button class="btn-primary">⚡ Förbered besök</button>' +
      '<button class="btn-edit">Åtgärder ▾</button></div>' +
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
    var nodes = [
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
      '</div></div>' +
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
                  ? '<div class="tline' + (i >= 1 ? ' todo' : '') + '"></div>'
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
    var head = secHead('03', 'Kritiska varningar', 'måste lösas innan behandling');
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
            '<button class="warn-action">Visa</button></div>'
          );
        })
        .join('') +
      '</section>'
    );
  }

  /* ---------- 4 · HÄLSA ---------- */
  function s4(health) {
    var updated = health && txt(health.updatedAt || health.signedAt);
    var head = secHead(
      '04',
      'Hälsa',
      updated ? 'senast uppdaterad ' + updated : null,
      '<button class="sec-link">Öppna full hälsoprofil →</button>'
    );
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
          chip('ok', 'NEJ') +
          '</div>';
      hdRows += hMeds.length
        ? '<div class="card-row"><span class="what">Pågående mediciner</span>' +
          chip('warn', 'JA · ' + hMeds.length + ' st') +
          '</div>'
        : '<div class="card-row"><span class="what">Pågående mediciner</span>' +
          chip(
            health.medications && health.medications.known ? 'warn' : 'ok',
            health.medications && health.medications.known ? 'JA' : 'NEJ'
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
  function s5(journey, av, smart) {
    var head = secHead(
      '05',
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
          // jump-länk (per-steg → relevant canon-sektion)
          var jl = '';
          if (s.jump && JUMP_LABEL[s.jump]) {
            jl =
              '<div class="step-links"><button type="button" class="step-link" data-v12-jump="' +
              esc(JUMP_SECTION[s.jump] || 'current-state') +
              '">Öppna ' +
              esc(JUMP_LABEL[s.jump]) +
              ' →</button></div>';
          } else {
            jl = '<div class="step-links"></div>';
          }
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
            body = miniActiveVisit(av) + smartHtml;
          } else if (s.state === 'blocked') {
            body =
              '<div class="gate-list"><div class="gate-list-l">Krävs för att låsa upp</div>' +
              '<div class="gate-row"><span class="what">Föregående steg slutfört</span>' +
              chip('danger', 'Saknas') +
              '</div></div>';
          }
          var hasBody = !!body;
          var open = s.state === 'active';
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
            '<div><div class="step-text">' +
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

  /* ---------- 6 · JOURNAL ---------- */
  function s6(entries) {
    var list = arr(entries);
    var head = secHead(
      '06',
      'Journal',
      list.length ? list.length + ' anteckningar' : null,
      '<button class="sec-link">+ Ny anteckning</button>'
    );
    if (!list.length)
      return (
        '<section class="sec" id="s6">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga journalanteckningar ännu.</div></section>'
      );
    return (
      '<section class="sec" id="s6">' +
      head +
      list
        .slice(0, 8)
        .map(function (e) {
          var signed = /signed|signerad|locked/i.test(txt(e.status));
          var today = /utkast|draft/i.test(txt(e.status));
          var md = monDay(e.dateLabel || e.date || e.signedAt);
          return (
            '<div class="journal-row' +
            (today ? ' today' : '') +
            '">' +
            '<div class="journal-date">' +
            esc(today ? 'Idag' : md.mon) +
            '<span class="d">' +
            esc(md.day || '—') +
            '</span></div>' +
            '<div><div class="journal-title">' +
            esc(txt(e.title || e.journalType || 'Journal')) +
            '</div>' +
            '<div class="journal-meta">' +
            esc(txt(e.author || e.practitioner || '')) +
            '</div></div>' +
            chip(signed ? 'ok' : 'warn', signed ? 'Signerad' : 'Utkast') +
            // Utkast → två knappar (Spara + Fortsätt) som facit; signerad → Öppna.
            '<div class="journal-actions">' +
            (signed
              ? '<button class="j-btn">Öppna</button>'
              : '<button class="j-btn">Spara</button><button class="j-btn primary">Fortsätt</button>') +
            '</div></div>'
          );
        })
        .join('') +
      '</section>'
    );
  }

  /* ---------- 7 · BILDER ---------- */
  function s7(photos) {
    var items = arr(photos && photos.items ? photos.items : photos);
    var head = secHead(
      '07',
      'Bilder',
      items.length ? items.length + ' bilder' : null,
      '<button class="sec-link">📷 Ta bild</button><button class="sec-link">Jämför →</button>'
    );
    if (!items.length)
      return (
        '<section class="sec" id="s7">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga bilder uppladdade ännu.</div></section>'
      );
    var tiles = items
      .slice(0, 12)
      .map(function (p) {
        var bg = p.thumbnailUrl || p.viewUrl || p.url;
        var lbl = txt(p.dateLabel || p.photoDateLabel || p.capturedAt || '').slice(0, 12);
        return (
          '<div class="photo-tile over"' +
          (bg ? ' style="background-image:url(' + esc(bg) + ')"' : '') +
          '>' +
          (lbl ? '<span class="lbl">' + esc(lbl) + '</span>' : '') +
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
          '</b></div><button class="warn-action">Jämför</button></div>'
        : '';
    return (
      '<section class="sec" id="s7">' +
      head +
      '<div class="photo-grid">' +
      tiles +
      '</div>' +
      bar +
      (gap
        ? '<div class="photo-gap"><span>⚠ Krona-vy saknas för fullständig dokumentation</span><button class="warn-action">Begär foto</button></div>'
        : '') +
      '</section>'
    );
  }

  /* ---------- 8 · BOKNINGAR ---------- */
  function s8(bundle) {
    var up = arr(bundle && bundle.upcomingBookings);
    var hist = arr(bundle && bundle.historyBookings);
    var head = secHead(
      '08',
      'Bokningar',
      up.length + ' kommande · ' + hist.length + ' historik',
      '<button class="sec-link">+ Boka</button>'
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
          ' väntar på bekräftelse från kund</span><button class="warn-action">Bekräfta alla</button></div>'
        : '';
    return (
      '<section class="sec" id="s8">' +
      head +
      rows
        .map(function (b, i) {
          var done = i >= up.length;
          var md = monDay(b.dateLabel || b.monthLabel || b.month, b.dayLabel || b.day);
          return (
            '<div class="booking-row"><div class="b-date">' +
            esc(md.mon) +
            '<span class="d">' +
            esc(md.day || '—') +
            '</span></div>' +
            '<div><div class="b-title">' +
            esc(txt(b.title || b.serviceLabel || 'Bokning')) +
            '</div>' +
            '<div class="b-meta">' +
            esc(txt(b.timeLabel || b.time || '') + (b.practitioner ? ' · ' + b.practitioner : '')) +
            '</div></div>' +
            chip(done ? 'ok' : 'info', done ? 'Genomförd' : 'Bokad') +
            '<button class="j-btn">' +
            (done ? 'Visa' : 'Bekräfta') +
            '</button></div>'
          );
        })
        .join('') +
      cta +
      '</section>'
    );
  }

  /* ---------- 9 · DOKUMENT ---------- */
  function s9(files) {
    var items = arr(files && files.items ? files.items : files);
    var head = secHead(
      '09',
      'Dokument',
      items.length ? items.length + ' totalt' : null,
      '<button class="sec-link">+ Lägg till</button>'
    );
    if (!items.length)
      return (
        '<section class="sec" id="s9">' +
        head +
        '<div class="card" style="color:var(--ink-mute)">Inga dokument registrerade.</div></section>'
      );
    return (
      '<section class="sec" id="s9">' +
      head +
      '<div class="doc-grid">' +
      items
        .slice(0, 8)
        .map(function (f) {
          var ic = /pdf/i.test(txt(f.mimeType || f.name))
            ? 'pdf'
            : /xls/i.test(txt(f.name))
              ? 'xlsx'
              : 'docx';
          return (
            '<div class="doc-row"><span class="doc-ic ' +
            ic +
            '">' +
            ic.toUpperCase() +
            '</span>' +
            '<div><div class="doc-name">' +
            esc(txt(f.name || f.title || 'Dokument')) +
            '</div>' +
            '<div class="doc-meta">' +
            esc(txt(f.dateLabel || f.documentDate || '')) +
            '</div></div>' +
            // Per-dokument status + knapp ur riktig data (facit: Klar/Vänta sign/
            // Auto/Intern + Öppna/Skicka/Förhandsgranska). Default Klar/Öppna.
            (function () {
              var st = txt(f.status || f.statusLabel).toLowerCase();
              var tone = /vänt|vant|utkast|pending|sign/.test(st)
                ? 'warn'
                : /auto/.test(st)
                  ? 'info'
                  : /intern/.test(st)
                    ? 'neutral'
                    : 'ok';
              var clabel = txt(f.statusLabel || f.status) || 'Klar';
              var send = /vänt|vant|skicka|pending|sign/.test(st);
              var btn = send ? 'Skicka' : /auto/.test(st) ? 'Förhandsgranska' : 'Öppna';
              return (
                chip(tone, clabel) +
                '<button class="j-btn' +
                (send ? ' primary' : '') +
                '">' +
                esc(btn) +
                '</button>'
              );
            })() +
            '</div>'
          );
        })
        .join('') +
      '</div></section>'
    );
  }

  /* ---------- 10 · KOMMUNIKATION ---------- */
  function s10(comm) {
    var items = arr(comm && comm.items ? comm.items : comm);
    var head = secHead(
      '10',
      'Kommunikation',
      null,
      '<button class="sec-link">+ Svara</button><button class="sec-link">Svarstudio →</button>'
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

  /* ---------- 11 · EKONOMI ---------- */
  function s11(econ, invoices) {
    var head = secHead('11', 'Ekonomi', null, '<button class="sec-link">→ Fortnox</button>');
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
                '<button class="j-btn">Visa</button></div>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      '</section>'
    );
  }

  /* ---------- 12 · INSIKTER ---------- */
  function s12(nextStep, insights) {
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
        '</button><button class="warn-action">Granska först</button></div></div>';
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
        '<div class="insight-actions"><button class="warn-action greenbtn">Boka</button><button class="warn-action">Påminn senare</button></div></div>';
    }
    if (!blocks)
      blocks =
        '<div class="card" style="color:var(--ink-mute)">Inga aktiva insikter just nu.</div>';
    return '<section class="sec" id="s12">' + head + blocks + '</section>';
  }

  /* ---------- RAIL + STICKY ---------- */
  var JUMP = [
    ['s1', 'Nuläge', '01'],
    ['s2', 'Aktivt besök', '02'],
    ['s3', 'Varningar', '03'],
    ['s4', 'Hälsa', '04'],
    ['s5', 'Kundresa', '05'],
    ['s6', 'Journal', '06'],
    ['s7', 'Bilder', '07'],
    ['s8', 'Bokningar', '08'],
    ['s9', 'Dokument', '09'],
    ['s10', 'Kommunikation', '10'],
    ['s11', 'Ekonomi', '11'],
    ['s12', 'Insikter', '12'],
  ];
  function rail(events) {
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
    return (
      '<aside class="rail">' +
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
      '<div class="rail-card"><div class="rail-l">Senaste händelser</div>' +
      rows +
      '</div></aside>'
    );
  }
  function sticky(nextStep, card) {
    var name = txt(card.displayName || card.name);
    var msg = nextStep && nextStep.what ? '⚡ ' + txt(nextStep.what) : 'Förbered nästa steg';
    return (
      '<div class="v12-canon__sticky"><div class="v12-canon__sticky-inner">' +
      '<div class="sticky-context">' +
      esc(name) +
      '<b>' +
      esc(msg) +
      '</b></div>' +
      '<button class="sticky-btn sec" data-v11-active-visit-action="photo">📷 Foto</button>' +
      '<button class="sticky-btn primary" data-v11-active-visit-action="journal">📝 Starta journal</button>' +
      '</div></div>'
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
    var comm = call('buildCommunicationFromState', [card, ctx.occasionTimeline, bundle], null);
    var econ = call('buildEconomyFromCard', [card], null);
    var invoices = call('buildEconomyInvoices', [bundle && bundle.paymentHistory], null);
    var nextStep = call('buildSmartNextStep', [card], null);
    var insights = call('buildInsightsFromSignals', [card], null);
    var recentEvents = call('buildRecentEvents', [card, bundle, ctx.journalEntries], []);

    var main =
      '<div class="v12-canon__main">' +
      s1(card, journey) +
      s2(av) +
      s3(warnings) +
      s4(health) +
      s5(journey, av, nextStep) +
      s6(ctx.journalEntries) +
      s7(photos) +
      s8(bundle) +
      s9(files) +
      s10(comm) +
      s11(econ, invoices) +
      s12(nextStep, insights) +
      '</div>';
    // Lägg data-v12-module på varje sektion så befintlig scrollV12WorkspaceModule
    // + jump-rail-launcher (inferV12ModuleFromRailClick) landar rätt vid sektionsklick.
    var SEC_MODULE = {
      s1: 'current-state',
      s2: 'active-visit',
      s3: 'warnings',
      s4: 'health',
      s5: 'journey',
      s6: 'journal',
      s7: 'photos',
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
      '<div class="v12-canon__grid">' +
      main +
      rail(recentEvents) +
      '</div>' +
      sticky(nextStep, card) +
      '</div>'
    );
  }

  global.CcoV12Canon = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
