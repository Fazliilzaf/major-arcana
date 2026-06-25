/**
 * V12 Customer Workspace · JOURNEY-SPINE render
 *
 * Faithful port av facit V12-WORKSPACE-JOURNEY-SPINE + ABDIRAHMAN-instansen.
 * Återanvänder BEFINTLIGA V11-adaptrar (CcoV11RailAdapters) som datakälla —
 * ingen ny datainsamling. Emitterar facit-DOM under .v12-spine (CSS i
 * cco-v12-spine.css ger 100% visuell identitet). Aktiveras via ?v13spine=on.
 *
 *   window.CcoV12Spine.render(ctx) -> HTML-sträng
 *
 * ctx: { card, bcard, dossierBundle, journalEntries, occasionTimeline, driveFiles, patient }
 */
(function (global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function txt(v) {
    return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  }
  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }
  function initials(name) {
    var parts = txt(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function A() {
    return global.CcoV11RailAdapters || {};
  }
  function call(fn, args, fallback) {
    try {
      var a = A();
      if (typeof a[fn] === 'function') return a[fn].apply(a, args);
    } catch (_e) {
      /* defensivt — aldrig krascha hela renderingen */
    }
    return fallback;
  }

  /* ---------- HERO ---------- */
  function renderHero(card, journey) {
    var name = txt(card.displayName || card.fullName || card.name) || 'Kund';
    var phone = txt(card.primaryPhone || card.phone);
    var email = txt(card.primaryEmail || card.email);
    var city = txt(card.city || card.ort);
    var metaBits = [phone, email, city].filter(Boolean);
    var stepCur = journey && journey.cur ? journey.cur : null;
    var stepTot = journey && journey.total ? journey.total : null;
    var stepLabel = stepCur && stepTot ? 'Steg ' + stepCur + ' av ' + stepTot : '';

    var tags = '';
    asArray(card.tags)
      .slice(0, 5)
      .forEach(function (t) {
        var label = txt(typeof t === 'string' ? t : t && (t.label || t.name));
        if (!label) return;
        var tone = /allerg|risk|saknas/i.test(label)
          ? 'warning'
          : /vip/i.test(label)
            ? 'vip'
            : /återkom|aterkom|klar/i.test(label)
              ? 'success'
              : 'info';
        tags += '<span class="tag ' + tone + '">' + esc(label) + '</span>';
      });

    var kicker = stepLabel
      ? esc(stepLabel) + (journey && journey.nextLabel ? ' · ' + esc(journey.nextLabel) : '')
      : 'Kundöversikt';

    return (
      '<header class="hero">' +
      '<div class="avatar-xl">' +
      esc(initials(name)) +
      '</div>' +
      '<div class="hero-body">' +
      '<div class="hero-kicker">' +
      kicker +
      '</div>' +
      '<h1 class="hero-name">' +
      esc(name) +
      '</h1>' +
      (metaBits.length
        ? '<div class="hero-meta">' +
          metaBits.map(esc).join(' <span class="sep">·</span> ') +
          '</div>'
        : '') +
      (tags ? '<div class="hero-tags">' + tags + '</div>' : '') +
      '</div>' +
      '<div class="hero-actions">' +
      (stepLabel ? '<span class="hero-step-pill">' + esc(stepLabel) + '</span>' : '') +
      '<button type="button" class="btn-gold" data-v12-scroll-module="active-visit">⚡ Förbered besök</button>' +
      '<button type="button" class="btn-ghost" data-v12-edit-open>Åtgärder ▾</button>' +
      '</div>' +
      '</header>'
    );
  }

  /* ---------- STATS ---------- */
  function renderStats(card, dossierBundle) {
    var visits =
      card.visitsThisYear != null
        ? card.visitsThisYear
        : asArray(dossierBundle && dossierBundle.historyBookings).length || '—';
    var value = txt(
      card.totalValue || card.lifetimeValue || (card.economy && card.economy.totalValue)
    );
    var debt = card.debt != null ? card.debt : card.balance != null ? card.balance : 0;
    var upcoming = asArray(dossierBundle && dossierBundle.upcomingBookings);
    var next = upcoming.length ? txt(upcoming[0].dateLabel || upcoming[0].date) : '—';

    function stat(cls, l, v, sub, subCls) {
      return (
        '<div class="stat' +
        (cls ? ' ' + cls : '') +
        '">' +
        '<div class="l">' +
        esc(l) +
        '</div>' +
        '<div class="v">' +
        esc(v) +
        '</div>' +
        (sub ? '<div class="sub ' + (subCls || 'mute') + '">' + esc(sub) + '</div>' : '') +
        '</div>'
      );
    }
    return (
      '<div class="stats">' +
      stat('hero', 'Besök · i år', visits, '', 'mute') +
      stat('', 'Värde totalt', value || '—', value ? 'sek' : 'Inget signerat', 'mute') +
      stat('', 'Skuld', debt || 0, 'kronor', debt ? 'warn' : 'mute') +
      stat('', 'Nästa besök', next, next === '—' ? 'Inga bokningar' : '', 'warn') +
      '</div>'
    );
  }

  /* ---------- AKTIVT BESÖK (i aktivt steg) ---------- */
  function avFmtTime(v) {
    var s = txt(v);
    var m = s.match(/(\d{2}):(\d{2})/);
    return m ? m[0] : '';
  }
  function renderActiveVisit(av) {
    if (!av) return '';
    var ci = avFmtTime(av.checkedInAt);
    var co = avFmtTime(av.completedAt);
    var nodes = [
      { cls: 'done', t: ci || 'Incheckad' },
      { cls: 'active', t: 'Nu' },
      { cls: 'todo', t: co || 'Klart' },
    ];
    var actions =
      '<button type="button" class="av-btn hero" data-v11-active-visit-action="' +
      esc((av.primary && av.primary.action) || 'journal') +
      '">' +
      esc((av.primary && av.primary.label) || 'Starta journal') +
      '</button>' +
      '<button type="button" class="av-btn sec" data-v11-active-visit-action="photo">📷 Ta bild</button>' +
      '<button type="button" class="av-btn sec" data-v11-active-visit-action="notes">✏️ Anteckning</button>' +
      (av.secondary
        ? '<button type="button" class="av-btn tert" data-v11-active-visit-action="' +
          esc(av.secondary.action) +
          '">' +
          esc(av.secondary.label) +
          '</button>'
        : '');
    return (
      '<div class="active-visit">' +
      '<div class="av-head"><span class="left"><span class="pulse"></span>' +
      esc(av.kicker || 'Aktivt besök') +
      '</span>' +
      (av.headMeta ? '<span class="time">' + esc(av.headMeta) + '</span>' : '') +
      '</div>' +
      '<div class="av-row"><div>' +
      '<div class="av-protocol">' +
      esc(av.title || 'Besök') +
      '</div>' +
      '<div class="av-protocol-sub">' +
      esc(av.statusLine || '') +
      '</div>' +
      '</div>' +
      (av.practitioner ? '<div class="av-staff">' + esc(av.practitioner) + '</div>' : '') +
      '</div>' +
      (av.showTimeline
        ? '<div class="av-timeline">' +
          nodes
            .map(function (n, i) {
              return (
                '<div class="av-tnode ' +
                n.cls +
                '"><span class="dot"></span><span class="t">' +
                esc(n.t) +
                '</span></div>' +
                (i < nodes.length - 1
                  ? '<div class="av-tline' + (i >= 1 ? ' todo' : '') + '"></div>'
                  : '')
              );
            })
            .join('') +
          '</div>'
        : '') +
      '<div class="av-actions">' +
      actions +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- SPINE ---------- */
  var JUMP_LABEL = {
    'kk-card-halsa': 'Hälsa',
    'kk-card-behandling': 'Behandling',
    'kk-card-juridik': 'Avtal',
    'kk-card-operation': 'Operation',
    'kk-card-foto': 'Foto',
    'kk-card-bokning': 'Bokning',
    'kk-card-uppfoljning': 'Uppföljning',
  };

  function renderStep(s, idx, av, smart) {
    var stateClass =
      s.state === 'done'
        ? 'step--done'
        : s.state === 'active'
          ? 'step--active'
          : s.state === 'blocked'
            ? 'step--future step--blocked'
            : 'step--future';
    var badge =
      s.state === 'done' ? '✓' : s.state === 'blocked' ? '!' : esc(s.id != null ? s.id : idx + 1);
    var meta =
      s.state === 'done'
        ? 'Klart'
        : s.state === 'active'
          ? 'Pågår'
          : s.state === 'blocked'
            ? 'Blockerare'
            : 'Kommande';
    var open = s.state === 'active';

    // Body byggs bara för aktivt steg (aktivt besök + smart) eller blockerat (gate).
    var body = '';
    if (s.state === 'active') {
      var smartRow = '';
      if (smart && smart.what) {
        smartRow =
          '<div class="smart-row"><div><div><b>' +
          esc(smart.what) +
          '</b></div>' +
          (smart.why ? '<div class="meta">' + esc(smart.why) + '</div>' : '') +
          '</div><div class="actions">' +
          '<button type="button" class="smart-btn" data-kk-sig="' +
          esc(smart.ruleId) +
          '">Granska</button>' +
          '<button type="button" class="smart-btn primary" data-kk-sig="' +
          esc(smart.ruleId) +
          '">' +
          esc(smart.ctaLabel || 'Åtgärda') +
          '</button></div></div>';
      }
      body = renderActiveVisit(av) + smartRow;
    } else if (s.state === 'blocked') {
      body =
        '<div class="gate-list"><div class="gate-list-l">Krävs för att låsa upp</div>' +
        '<div class="gate-row"><span class="what">Föregående steg slutfört</span><span class="chip danger">Saknas</span></div>' +
        '</div>';
    }
    var hasBody = !!body;

    var jumpChip = '';
    if (s.jump && JUMP_LABEL[s.jump]) {
      jumpChip =
        '<button type="button" class="smart-btn" data-kk-jump="' +
        esc(s.jump) +
        '"' +
        (s.medForm ? ' data-kk-med-form="' + esc(s.medForm) + '"' : '') +
        '>Öppna ' +
        esc(JUMP_LABEL[s.jump]) +
        ' →</button>';
    }

    return (
      '<article class="step ' +
      stateClass +
      '" data-spine-step="' +
      esc(idx) +
      '" data-open="' +
      (open ? 'true' : 'false') +
      '">' +
      '<button type="button" class="step-head"' +
      (hasBody ? ' aria-expanded="' + open + '"' : '') +
      '>' +
      '<span class="step-badge">' +
      badge +
      '</span>' +
      '<span><span class="step-title">' +
      esc(s.label) +
      '</span>' +
      (s.note ? '<span class="step-sub">' + esc(s.note) + '</span>' : '') +
      '</span>' +
      '<span class="step-meta">' +
      esc(meta) +
      '</span>' +
      '<span class="step-toggle" aria-hidden="true">' +
      (hasBody ? '▾' : '') +
      '</span>' +
      '</button>' +
      (hasBody
        ? '<div class="step-body"><div class="step-body-inner">' +
          body +
          (jumpChip ? '<div class="av-actions">' + jumpChip + '</div>' : '') +
          '</div></div>'
        : '') +
      '</article>'
    );
  }

  function renderSpine(journey, av, smart) {
    if (!journey || !asArray(journey.steps).length) {
      return (
        '<section class="spine"><div class="spine-head"><span class="spine-title">Kundresa</span></div>' +
        '<div class="empty-state">Kundresan har inte startat — inga steg registrerade ännu.</div></section>'
      );
    }
    var steps = journey.steps;
    var done = steps.filter(function (s) {
      return s.state === 'done';
    }).length;
    var active = steps.filter(function (s) {
      return s.state === 'active';
    }).length;
    var coming = steps.length - done - active;
    var pct = journey.pct || (steps.length ? Math.round((done / steps.length) * 100) : 0);

    return (
      '<section class="spine" aria-label="Kundresa">' +
      '<div class="spine-head">' +
      '<span class="spine-title">Kundresa · ' +
      esc(steps.length) +
      ' steg</span>' +
      '<div class="spine-progress">' +
      '<span>' +
      esc(done) +
      ' klara · ' +
      esc(active) +
      ' pågår · ' +
      esc(coming) +
      ' kommande</span>' +
      '<span class="bar"><i style="width:' +
      esc(pct) +
      '%"></i></span>' +
      '<span>' +
      esc(pct) +
      '%</span>' +
      '</div></div>' +
      steps
        .map(function (s, i) {
          return renderStep(s, i, av, smart);
        })
        .join('') +
      '</section>'
    );
  }

  /* ---------- FOTO ---------- */
  function renderPhotos(photos) {
    var items = asArray(photos && photos.items ? photos.items : photos);
    if (!items.length) {
      return (
        '<section class="section"><div class="section-head">' +
        '<span class="section-title">Foto-dokumentation</span></div>' +
        '<div class="empty-state">Inga bilder uppladdade ännu.</div></section>'
      );
    }
    var tiles = items
      .slice(0, 12)
      .map(function (p) {
        var label = esc(txt(p.dateLabel || p.photoDateLabel || p.capturedAt || ''));
        var bg = p.thumbnailUrl || p.viewUrl || p.url;
        return (
          '<div class="photo-tile"' +
          (bg ? ' style="background-image:url(' + esc(bg) + ')"' : '') +
          '>' +
          (label ? '<span class="lbl">' + label + '</span>' : '') +
          '</div>'
        );
      })
      .join('');
    var gap = items.some(function (p) {
      return p.gap || p.viewGap;
    });
    return (
      '<section class="section"><div class="section-head">' +
      '<span class="section-title">Foto-dokumentation · alla besök</span>' +
      '<span class="section-meta">' +
      esc(items.length) +
      ' bilder</span></div>' +
      '<div class="foto-strip">' +
      tiles +
      '</div>' +
      (gap
        ? '<div class="gap-notice"><span>⚠ Hårlinje &amp; krona-vy saknas för fullständig dokumentation</span>' +
          '<button type="button" class="smart-btn">Begär foto</button></div>'
        : '') +
      '</section>'
    );
  }

  /* ---------- RAIL ---------- */
  function renderRail(smart, dossierBundle, patientId) {
    var heroAction =
      smart && smart.what
        ? '<div class="rail-hero-action' +
          (smart.tone === 'Blockerare' ? ' danger' : '') +
          '">' +
          '<div class="lbl">Smart nästa steg · nu</div>' +
          '<div class="title">' +
          esc(smart.what) +
          '</div>' +
          (smart.why ? '<div class="sub">' + esc(smart.why) + '</div>' : '') +
          '<div class="ctas">' +
          '<button type="button" class="cta secondary" data-kk-sig="' +
          esc(smart.ruleId) +
          '">Granska</button>' +
          '<button type="button" class="cta primary" data-kk-sig="' +
          esc(smart.ruleId) +
          '">' +
          esc(smart.ctaLabel || 'Åtgärda') +
          '</button>' +
          '</div></div>'
        : '';

    var upcoming = asArray(dossierBundle && dossierBundle.upcomingBookings);
    var bookings =
      '<div class="rail-card"><div class="rail-l"><span>Kommande bokningar</span>' +
      '<span class="badge">' +
      esc(upcoming.length) +
      '</span></div>' +
      (upcoming.length
        ? upcoming
            .slice(0, 4)
            .map(function (b) {
              return (
                '<div class="booking-row"><div class="booking-date">' +
                esc(txt(b.monthLabel || '')) +
                '<span class="d">' +
                esc(txt(b.dayLabel || b.day || '')) +
                '</span></div>' +
                '<div><div>' +
                esc(txt(b.title || b.serviceLabel || 'Bokning')) +
                '</div>' +
                '<div class="booking-meta">' +
                esc(txt(b.timeLabel || b.time || '')) +
                '</div></div>' +
                '<span class="chip info">Bokad</span></div>'
              );
            })
            .join('')
        : '<div class="empty-state">Inga kommande bokningar — kontakta kunden för återbesök.</div>') +
      '</div>';

    var quick =
      '<div class="rail-card"><div class="rail-l">Snabb-åtgärder</div>' +
      '<div class="quick-actions">' +
      '<button type="button" class="quick-btn dark full" data-patient-photo-camera-trigger>📷 Ta bild · spara i journal</button>' +
      '<button type="button" class="quick-btn">✏️ Anteckna</button>' +
      '<button type="button" class="quick-btn">💬 Svarstudio</button>' +
      '<button type="button" class="quick-btn full" data-kk-ord48-open-calendar="' +
      esc(patientId || '') +
      '">📅 Boka återbesök</button>' +
      '</div></div>';

    return '<aside class="rail">' + heroAction + bookings + quick + '</aside>';
  }

  /* ---------- RENDER ---------- */
  function render(ctx) {
    ctx = ctx || {};
    var card = ctx.bcard || ctx.card || {};
    var dossierBundle = ctx.dossierBundle || null;
    var patientId = txt(card.patientId || card.id || (ctx.card && ctx.card.patientId));

    var journey = call('buildJourneyFromState', [card, ctx.journalEntries, dossierBundle], null);
    var av = call('buildActiveVisitFromBundle', [dossierBundle], null);
    var smart = call('buildSmartNextStep', [card], null);
    var photos = call('buildPhotosFromDriveFiles', [ctx.driveFiles], null);

    var main =
      '<div class="v12-spine__main">' +
      renderHero(card, journey) +
      renderStats(card, dossierBundle) +
      renderSpine(journey, av, smart) +
      renderPhotos(photos) +
      '</div>';

    return (
      '<div class="v12-spine" data-v12-spine="1">' +
      '<div class="v12-spine__grid">' +
      main +
      renderRail(smart, dossierBundle, patientId) +
      '</div></div>'
    );
  }

  global.CcoV12Spine = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
