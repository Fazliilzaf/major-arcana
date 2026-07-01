/**
 * V11-RAIL Fas 3 — renderer.
 *
 * Ren `.v11-rail__*`-renderare utan beroende på legacy .kkref / .cr-v10 /
 * v9/v10-override-klasser (canon §5). Enda legacy-kontaktpunkten är
 * mount-switchen i patient-master-ui.js som väljer denna renderare när
 * ?v11rail=on och matar in { card, bcard, ... }.
 *
 * Block 1: endast A Profile. B/C/V och övriga sektioner tillkommer i
 * efterföljande block.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * A · Profile — amber kicker, identitet (avatar + namn + kontakt),
   * pills (endast riktig data) och edit-action.
   * @param {object} profile - output från CcoV11RailAdapters.buildProfileFromBcard
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderProfile(profile) {
    if (!profile) return '';

    var contact = '';
    if (profile.phone) {
      contact +=
        '<a class="v11-rail__contact" href="tel:' +
        esc(String(profile.phone).replace(/[^\d+]/g, '')) +
        '">📞 ' +
        esc(profile.phone) +
        '</a>';
    }
    if (profile.email) {
      contact +=
        (profile.phone ? '<span class="v11-rail__sep" aria-hidden="true">·</span>' : '') +
        '<a class="v11-rail__contact" href="mailto:' +
        esc(profile.email) +
        '">✉ ' +
        esc(profile.email) +
        '</a>';
    }

    var addr = profile.addrLine
      ? '<div class="v11-rail__addr">📍 ' + esc(profile.addrLine) + '</div>'
      : '';

    var pills =
      profile.pills && profile.pills.length
        ? '<div class="v11-rail__pills">' +
          profile.pills
            .map(function (pill) {
              return (
                '<span class="v11-rail__pill" data-tone="' +
                esc(pill.tone) +
                '">' +
                esc(pill.label) +
                '</span>'
              );
            })
            .join('') +
          '</div>'
        : '';

    return (
      '<section class="v11-rail__profile" aria-label="Profil">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">KUNDDOSSIÉR</div>' +
      '<div class="v11-rail__identity">' +
      '<div class="v11-rail__avatar" aria-hidden="true">' +
      esc(profile.initials) +
      '</div>' +
      '<div class="v11-rail__id-main">' +
      '<div class="v11-rail__name">' +
      esc(profile.name) +
      '</div>' +
      (contact ? '<div class="v11-rail__contact-row">' + contact + '</div>' : '') +
      addr +
      '</div>' +
      '<button type="button" class="v11-rail__edit" data-v11-rail-edit-profile aria-label="Redigera profil">✎ Redigera</button>' +
      '</div>' +
      pills +
      '</section>'
    );
  }

  /**
   * Renderar V11-rail-innehåll för en kund.
   * @param {object} [ctx] - { card, bcard, journalEntries, occasionTimeline, driveFiles, patient, tab, lite }
   * B · Smart information — separat vellum smart-info-kort: amber kicker,
   * ett tydligt primärt signal-värde plus koncis stödmetadata (canon §6 B).
   * @param {object} info - output från CcoV11RailAdapters.buildSmartInfoFromSignals
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderSmartInfo(info) {
    if (!info) return '';

    var why = info.why
      ? '<div class="v11-rail__smart-meta"><strong>Varför:</strong> ' + esc(info.why) + '</div>'
      : '';
    var next = info.next
      ? '<div class="v11-rail__smart-meta"><strong>Nästa:</strong> ' + esc(info.next) + '</div>'
      : '';

    var metaBits = '';
    if (info.approvalRequired) {
      metaBits += '<span class="v11-rail__smart-flag">Kräver godkännande</span>';
    }
    if (info.moreCount > 0) {
      metaBits +=
        '<span class="v11-rail__smart-more">+' +
        esc(String(info.moreCount)) +
        ' fler signaler</span>';
    }
    var metaRow = metaBits ? '<div class="v11-rail__smart-row">' + metaBits + '</div>' : '';

    return (
      '<section class="v11-rail__smart-info" aria-label="Smart information">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">SMART INFORMATION</div>' +
      '<div class="v11-rail__smart-primary">' +
      esc(info.primary) +
      '</div>' +
      why +
      next +
      metaRow +
      '</section>'
    );
  }

  /**
   * C · Stats — tre vellum-celler: BESÖK, VÄRDE TOT, SKULD (canon §6 C).
   * SKULD visar unknown-state ('—' / 'okänd') när debt-data saknas — ingen fejk.
   * @param {object} stats - output från CcoV11RailAdapters.buildStatsFromExtras
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderStats(stats) {
    if (!stats) return '';

    function cell(label, data, extraAttr) {
      return (
        '<div class="v11-rail__stat"' +
        (extraAttr || '') +
        '>' +
        '<div class="v11-rail__stat-label">' +
        esc(label) +
        '</div>' +
        '<div class="v11-rail__stat-value">' +
        esc(data.value) +
        '</div>' +
        '<div class="v11-rail__stat-sub">' +
        esc(data.sub) +
        '</div>' +
        '</div>'
      );
    }

    var skuldState = stats.skuld.unknown ? 'unknown' : stats.skuld.hasDebt ? 'debt' : 'clear';

    return (
      '<section class="v11-rail__stats" aria-label="Nyckeltal">' +
      cell('Besök', stats.besok) +
      cell('Värde tot', stats.vardeTot) +
      cell('Skuld', stats.skuld, ' data-skuld-state="' + esc(skuldState) + '"') +
      '</section>'
    );
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * V · Active Visit — hero med timeline, preflight och journal-CTA (canon §6 V,
   * data-contract LÅST 2026-06-21). CTA-knappar bär `data-v11-active-visit-action`
   * som den BEFINTLIGA handlern (CcoV9CustomersParity/bindIntelligentJourney)
   * wire:ar — ingen ny handler. Ren .v11-rail__active-visit-presentation.
   * @param {object} av - output från CcoV11RailAdapters.buildActiveVisitFromBundle
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderActiveVisit(av) {
    if (!av) return '';

    // Timeline-noder (checkin/progress/done) per state
    var ci = fmtTime(av.checkedInAt);
    var st = fmtTime(av.startedAt || av.checkedInAt);
    var co = fmtTime(av.completedAt);
    function nodeState(phase) {
      if (av.state === 'completed_today') return 'is-done';
      if (av.state === 'in_progress')
        return phase === 'checkin' ? 'is-done' : phase === 'progress' ? 'is-active' : '';
      if (av.state === 'checked_in' && phase === 'checkin') return 'is-active';
      return '';
    }
    var nodes = [
      { phase: 'checkin', label: ci ? ci + ' incheckad' : 'Incheckad' },
      { phase: 'progress', label: st ? st + ' pågår' : 'Pågår' },
      { phase: 'done', label: co ? co + ' klart' : 'Klart' },
    ];
    var timeline = av.showTimeline
      ? '<div class="v11-rail__av-timeline" aria-label="Besöksförlopp">' +
        nodes
          .map(function (n) {
            return (
              '<div class="v11-rail__av-node ' +
              nodeState(n.phase) +
              '"><span class="v11-rail__av-dot" aria-hidden="true"></span>' +
              '<span class="v11-rail__av-node-label">' +
              esc(n.label) +
              '</span></div>'
            );
          })
          .join('') +
        '</div>'
      : '';

    // Preflight — visas ALLTID (locked); tom lista → klartext
    var preflight;
    if (av.preflightCompact) {
      preflight = '<p class="v11-rail__av-preflight-ok">Besöket är avslutat för idag.</p>';
    } else if (av.blockers.length) {
      preflight =
        '<span class="v11-rail__av-preflight-kicker">Innan besöket</span>' +
        '<div class="v11-rail__av-blockers">' +
        av.blockers
          .map(function (b) {
            return (
              '<div class="v11-rail__av-blocker" data-blocker="' +
              esc(b.code || '') +
              '"><span class="v11-rail__av-blocker-badge" aria-hidden="true">!</span>' +
              '<span class="v11-rail__av-blocker-label">' +
              esc(b.label || 'Blockerare') +
              '</span></div>'
            );
          })
          .join('') +
        '</div>';
    } else {
      preflight =
        '<span class="v11-rail__av-preflight-kicker">Innan besöket</span>' +
        '<p class="v11-rail__av-preflight-ok">Inga blockerare för dagens besök.</p>';
    }

    // CTA-knappar — behåll data-v11-active-visit-action (befintlig handler)
    function actionBtn(act, label, cls, disabled) {
      return (
        '<button type="button" class="' +
        cls +
        (disabled ? ' is-disabled' : '') +
        '" data-v11-active-visit-action="' +
        esc(act) +
        '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        '>' +
        esc(label) +
        '</button>'
      );
    }
    function withDetail(action, label) {
      return action === 'journal' && av.journalDetail ? label + ' · ' + av.journalDetail : label;
    }
    var actions =
      '<div class="v11-rail__av-actions" data-v11-active-visit-actions>' +
      actionBtn(
        av.primary.action,
        withDetail(av.primary.action, av.primary.label),
        'v11-rail__av-primary'
      ) +
      (av.secondary
        ? actionBtn(
            av.secondary.action,
            withDetail(av.secondary.action, av.secondary.label),
            'v11-rail__av-secondary'
          )
        : '') +
      actionBtn('photo', 'Ta bild', 'v11-rail__av-secondary', av.photoDisabled) +
      actionBtn('notes', 'Anteckning', 'v11-rail__av-secondary', av.notesDisabled) +
      '</div>';

    var headMeta = '';
    if (av.headMeta) headMeta = av.headMeta + (av.practitioner ? ' · ' + av.practitioner : '');
    else if (av.practitioner) headMeta = av.practitioner;

    return (
      '<section class="v11-rail__active-visit" data-v11-active-visit data-v11-active-visit-state="' +
      esc(av.state) +
      '" aria-label="Aktivt besök idag">' +
      '<header class="v11-rail__av-head">' +
      '<span class="v11-rail__av-status"><span class="v11-rail__av-dot v11-rail__av-dot--' +
      esc(av.state) +
      '" aria-hidden="true"></span>' +
      '<span class="v11-rail__av-kicker">' +
      esc(av.kicker) +
      '</span></span>' +
      (headMeta ? '<span class="v11-rail__av-time">' + esc(headMeta) + '</span>' : '') +
      '</header>' +
      '<div class="v11-rail__av-context">' +
      '<h3 class="v11-rail__av-title">' +
      esc(av.title) +
      '</h3>' +
      '<p class="v11-rail__av-status-line">' +
      esc(av.statusLine) +
      '</p>' +
      '</div>' +
      timeline +
      '<div class="v11-rail__av-preflight' +
      (av.preflightCompact ? ' v11-rail__av-preflight--compact' : '') +
      '" data-v11-active-visit-preflight>' +
      preflight +
      '</div>' +
      actions +
      '</section>'
    );
  }

  /**
   * D · Critical warnings — röda top-banner-kort (canon §6 D). Visas överst när
   * kritiska blocker-/legal-gates är aktiva; tom lista → inget renderas.
   * @param {Array} list - output från CcoV11RailAdapters.buildCriticalWarnings
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderCriticalWarnings(list) {
    if (!list || !list.length) return '';
    var cards = list
      .map(function (w) {
        return (
          '<div class="v11-rail__warning" data-rule-id="' +
          esc(w.ruleId) +
          '">' +
          '<span class="v11-rail__warning-badge" aria-hidden="true">⚠</span>' +
          '<span class="v11-rail__warning-copy">' +
          '<span class="v11-rail__warning-what">' +
          esc(w.what) +
          (w.legal ? '<span class="v11-rail__warning-legal">Juridik</span>' : '') +
          '</span>' +
          (w.why ? '<span class="v11-rail__warning-why">' + esc(w.why) + '</span>' : '') +
          '</span>' +
          '</div>'
        );
      })
      .join('');
    return (
      '<section class="v11-rail__warnings" role="alert" aria-label="Kritiska varningar">' +
      cards +
      '</section>'
    );
  }

  /**
   * E · Health Declaration (preview) — top expandable preview (canon §6 E).
   * Summerar HD-status + allergier; deep-link (data-kk-jump="kk-card-halsa")
   * öppnar full HÄLSA-arbetsyta i Zon 2 (workflow dupliceras ej).
   * @param {object} hp - output från CcoV11RailAdapters.buildHealthPreview
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderHealthPreview(hp) {
    if (!hp) return '';

    var statusText =
      hp.status === 'signed' ? 'Signerad' : hp.status === 'missing' ? 'Saknas' : 'Okänd';
    var meta = [];
    if (hp.status === 'signed') {
      if (hp.signedAt) meta.push(esc(String(hp.signedAt).slice(0, 10)));
      if (hp.source) meta.push(esc(hp.source));
    }
    var metaLine = meta.length
      ? '<span class="v11-rail__health-meta">' + meta.join(' · ') + '</span>'
      : '';

    var allergies =
      hp.allergies && hp.allergies.length
        ? '<details class="v11-rail__health-details"><summary>Allergier (' +
          esc(String(hp.allergies.length)) +
          ')</summary><div class="v11-rail__health-allergies">' +
          hp.allergies
            .map(function (a) {
              return '<span class="v11-rail__health-allergy">' + esc(a) + '</span>';
            })
            .join('') +
          '</div></details>'
        : '';

    return (
      '<section class="v11-rail__health" aria-label="Hälsodeklaration">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">HÄLSODEKLARATION</div>' +
      '<div class="v11-rail__health-row">' +
      '<span class="v11-rail__health-status" data-status="' +
      esc(hp.status) +
      '">' +
      esc(statusText) +
      '</span>' +
      metaLine +
      '<button type="button" class="v11-rail__health-open" data-kk-jump="kk-card-halsa">Öppna</button>' +
      '</div>' +
      allergies +
      '</section>'
    );
  }

  /**
   * F · Customer Journey — V11 visuell stepper (canon §6 F). Bevarar den
   * kanoniska 9-stegsmeningen + jump/med-form-mappningen (data-kk-jump /
   * data-kk-med-form) så workflow-betydelsen är oförändrad; endast presentation.
   * @param {object} j - output från CcoV11RailAdapters.buildJourneyFromState
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderJourney(j) {
    if (!j || !j.steps || !j.steps.length) return '';

    var steps = j.steps
      .map(function (s) {
        var mk =
          s.state === 'done'
            ? '✓'
            : s.state === 'neutral'
              ? '–'
              : s.id != null
                ? String(s.id)
                : '!';
        var v11State = s.state === 'active' ? 'active' : s.state === 'done' ? 'done' : 'pending';
        var jumpAttr = s.jump ? ' kk-jumpable" data-kk-jump="' + esc(s.jump) + '"' : '"';
        var medFormAttr = s.medForm ? ' data-kk-med-form="' + esc(s.medForm) + '"' : '';
        var activeAttr = s.state === 'active' ? ' data-v11-journey-active="true"' : '';
        var note =
          s.note ||
          (s.state === 'done'
            ? 'Klar'
            : s.state === 'active'
              ? 'Pågår · nästa steg'
              : s.state === 'neutral'
                ? '—'
                : 'Kommande');
        return (
          '<div class="v11-rail__journey-step ' +
          esc(s.state) +
          jumpAttr +
          medFormAttr +
          ' data-v11-step-state="' +
          esc(v11State) +
          '"' +
          activeAttr +
          '>' +
          '<div class="v11-rail__journey-mk" aria-hidden="true">' +
          esc(mk) +
          '</div>' +
          '<div class="v11-rail__journey-body">' +
          '<div class="v11-rail__journey-label">' +
          esc(s.label) +
          '</div>' +
          '<div class="v11-rail__journey-note">' +
          esc(note) +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    var chip = j.cur
      ? '<span class="v11-rail__journey-chip">Steg ' + esc(String(j.cur)) + '</span>'
      : '';

    return (
      '<section class="v11-rail__journey" aria-label="Kundresa">' +
      '<div class="v11-rail__journey-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">KUNDRESA · ' +
      esc(String(j.total)) +
      ' STEG</div>' +
      chip +
      '</div>' +
      '<div class="v11-rail__journey-bar"><span style="width:' +
      esc(String(j.pct)) +
      '%"></span></div>' +
      '<div class="v11-rail__journey-steps">' +
      steps +
      '</div>' +
      '</section>'
    );
  }

  /**
   * G · Smart Next Step — fokuserat rekommendationskort med EN primär CTA
   * (canon §6 G). CTA:n bär `data-kk-sig` som den BEFINTLIGA globala
   * kk-sig-handlern wire:ar (ingen ny handler). "Granska utkast" behålls som
   * nåbar sekundär. Endast presentation.
   * @param {object} g - output från CcoV11RailAdapters.buildSmartNextStep
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderSmartNextStep(g) {
    if (!g) return '';

    function sigAttrs() {
      return (
        ' data-kk-sig="' +
        esc(g.ruleId) +
        '" data-kk-sig-label="' +
        esc(g.what) +
        '" data-kk-patient-id="' +
        esc(g.patientId) +
        '"'
      );
    }

    var toneClass = g.tone === 'Blockerare' ? 'blocker' : 'suggested';

    return (
      '<section class="v11-rail__next" aria-label="Smart nästa steg">' +
      '<div class="v11-rail__next-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">SMART NÄSTA STEG</div>' +
      '<span class="v11-rail__next-tone" data-tone="' +
      esc(toneClass) +
      '">' +
      esc(g.tone) +
      '</span>' +
      '</div>' +
      '<div class="v11-rail__next-what">' +
      esc(g.what) +
      '</div>' +
      (g.why ? '<div class="v11-rail__next-why">' + esc(g.why) + '</div>' : '') +
      '<div class="v11-rail__next-actions">' +
      '<button type="button" class="v11-rail__next-primary"' +
      sigAttrs() +
      '>' +
      esc(g.ctaLabel) +
      '</button>' +
      '<button type="button" class="v11-rail__next-secondary"' +
      sigAttrs() +
      '>Granska utkast</button>' +
      '</div>' +
      '</section>'
    );
  }

  /**
   * H · Bookings (KEEP) — V11-presentation av kommande bokningar. Bevarar
   * bokningsworkflow: varje rad bär data-v9-section-link="upcoming" (öppnar
   * tidslinjen där avboka/omboka lever) och sektionen har en confirm-action med
   * data-v9-quick="confirm" — båda är BEFINTLIGA handlers (inga nya). Tom lista
   * → explicit empty-state.
   * @param {object} b - output från CcoV11RailAdapters.buildBookingsFromExtras
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderBookings(b) {
    if (!b) return '';
    var count = Number(b.count) > 0 ? Number(b.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Kommande bokningar">' +
        '<div class="v11-rail__empty-title">Inga kommande bokningar</div>' +
        '<div class="v11-rail__empty-hint">Inga kommande tider bokade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__bookings-list">' +
        b.items
          .map(function (it) {
            var staff = it.staff
              ? '<span class="v11-rail__booking-staff" title="' +
                esc(it.staff) +
                '"><span class="v11-rail__booking-avatar" aria-hidden="true">' +
                esc(it.initials || '—') +
                '</span></span>'
              : '';
            var status = it.stateLabel
              ? '<span class="v11-rail__booking-status" data-state="' +
                esc(it.state) +
                '">' +
                esc(it.stateLabel) +
                '</span>'
              : '';
            return (
              '<li class="v11-rail__booking">' +
              '<button type="button" class="v11-rail__booking-row" data-v9-section-link="upcoming">' +
              '<span class="v11-rail__booking-when">' +
              '<span class="v11-rail__booking-cal" aria-hidden="true">📅</span>' +
              '<span class="v11-rail__booking-date">' +
              esc(it.whenLong || '—') +
              '</span>' +
              (it.whenShort
                ? '<span class="v11-rail__booking-time">' + esc(it.whenShort) + '</span>'
                : '') +
              '</span>' +
              '<span class="v11-rail__booking-copy">' +
              '<span class="v11-rail__booking-title">' +
              esc(it.title) +
              '</span>' +
              (it.sub ? '<span class="v11-rail__booking-sub">' + esc(it.sub) + '</span>' : '') +
              '</span>' +
              staff +
              status +
              '<span class="v11-rail__booking-chevron" aria-hidden="true">›</span>' +
              '</button>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>' +
        '<div class="v11-rail__bookings-actions">' +
        '<button type="button" class="v11-rail__bookings-confirm" data-v9-quick="confirm">' +
        'Bekräfta kommande tider (' +
        count +
        ')</button>' +
        '</div>';
    }

    return (
      '<section class="v11-rail__bookings" data-v11-rail-bookings aria-label="Kommande bokningar">' +
      '<header class="v11-rail__bookings-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">KOMMANDE BOKNINGAR</div>' +
      (count ? '<span class="v11-rail__bookings-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * I · History (KEEP) — V11-presentation av tidigare besök/bokningar. Bevarar
   * historik-workflow: varje rad bär data-v9-section-link="historik" (öppnar
   * tidslinjen) — BEFINTLIG handler, ingen ny. Tom lista → explicit empty-state.
   * @param {object} h - output från CcoV11RailAdapters.buildHistoryFromExtras
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderHistory(h) {
    if (!h) return '';
    var count = Number(h.count) > 0 ? Number(h.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Historik">' +
        '<div class="v11-rail__empty-title">Ingen historik ännu</div>' +
        '<div class="v11-rail__empty-hint">Inga tidigare besök registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__history-list">' +
        h.items
          .map(function (it) {
            return (
              '<li class="v11-rail__history-item">' +
              '<button type="button" class="v11-rail__history-row" data-v9-section-link="historik">' +
              '<span class="v11-rail__history-when">' +
              '<span class="v11-rail__history-date">' +
              esc(it.whenLong || '—') +
              '</span>' +
              (it.whenShort
                ? '<span class="v11-rail__history-time">' + esc(it.whenShort) + '</span>'
                : '') +
              '</span>' +
              '<span class="v11-rail__history-copy">' +
              '<span class="v11-rail__history-title">' +
              esc(it.title) +
              '</span>' +
              (it.sub ? '<span class="v11-rail__history-sub">' + esc(it.sub) + '</span>' : '') +
              '</span>' +
              '<span class="v11-rail__history-badge" aria-hidden="true">✓</span>' +
              '</button>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__history" data-v11-rail-history aria-label="Historik">' +
      '<header class="v11-rail__history-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">HISTORIK</div>' +
      (count ? '<span class="v11-rail__history-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * J · Journals (KEEP) — V11-presentation av journalposter. Bevarar journal-
   * workflow: varje rad bär data-v9-section-link="journal" (öppnar journal-
   * fliken) — BEFINTLIG handler, ingen ny. Tom lista → explicit empty-state.
   * @param {object} j - output från CcoV11RailAdapters.buildJournalsFromEntries
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderJournals(j) {
    if (!j) return '';
    var count = Number(j.count) > 0 ? Number(j.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Journal">' +
        '<div class="v11-rail__empty-title">Inga journalposter ännu</div>' +
        '<div class="v11-rail__empty-hint">Inga journalanteckningar registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__journal-list">' +
        j.items
          .map(function (it) {
            return (
              '<li class="v11-rail__journal-item">' +
              '<button type="button" class="v11-rail__journal-row" data-v9-section-link="journal" data-journal-state="' +
              esc(it.state) +
              '">' +
              '<span class="v11-rail__journal-head">' +
              '<span class="v11-rail__journal-title">' +
              esc(it.title) +
              '</span>' +
              '<span class="v11-rail__journal-badge" data-state="' +
              esc(it.state) +
              '">' +
              esc(it.badge) +
              '</span>' +
              '</span>' +
              (it.snippet
                ? '<span class="v11-rail__journal-snippet">' + esc(it.snippet) + '</span>'
                : '') +
              '<span class="v11-rail__journal-meta">' +
              esc(it.meta) +
              '</span>' +
              '</button>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__journals" data-v11-rail-journals aria-label="Journal">' +
      '<header class="v11-rail__journals-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">JOURNAL</div>' +
      (count ? '<span class="v11-rail__journals-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * K · Offers (KEEP) — V11-presentation av offerter/behandlingsplaner. Bevarar
   * offert-workflow: varje rad bär data-v11-doc-row/data-v11-doc-registry/
   * data-v11-doc-previewable (öppnar offert-preview/dokumentvyn) — BEFINTLIGA
   * handlers, inga nya. Tom lista → explicit empty-state.
   * @param {object} k - output från CcoV11RailAdapters.buildOffersFromPayload
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderOffers(k) {
    if (!k) return '';
    var count = Number(k.count) > 0 ? Number(k.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Offerter">' +
        '<div class="v11-rail__empty-title">Inga offerter ännu</div>' +
        '<div class="v11-rail__empty-hint">Inga offerter eller behandlingsplaner registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__offers-list">' +
        k.items
          .map(function (it) {
            var meta =
              (it.journeyStep
                ? '<span class="v11-rail__offer-step">steg ' + esc(it.journeyStep) + '</span>'
                : '') +
              (it.amount
                ? '<span class="v11-rail__offer-amount">' + esc(it.amount) + '</span>'
                : '');
            return (
              '<li class="v11-rail__offer-item">' +
              '<div class="v11-rail__offer-row" data-v11-doc-row data-v11-doc-registry="' +
              esc(it.registryId) +
              '" data-v11-doc-status="' +
              esc(it.status) +
              '" data-v11-doc-previewable="' +
              (it.previewable ? '1' : '0') +
              '"' +
              (it.previewable ? ' role="button" tabindex="0"' : '') +
              '>' +
              '<span class="v11-rail__offer-main">' +
              '<span class="v11-rail__offer-title">' +
              esc(it.title) +
              '</span>' +
              (meta ? '<span class="v11-rail__offer-meta">' + meta + '</span>' : '') +
              '</span>' +
              '<span class="v11-rail__offer-status" data-state="' +
              esc(it.status) +
              '">' +
              esc(it.statusLabel) +
              '</span>' +
              '</div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__offers" data-v11-rail-offers aria-label="Offerter">' +
      '<header class="v11-rail__offers-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">OFFERTER</div>' +
      (count ? '<span class="v11-rail__offers-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * L · Auto-documents (KEEP) — V11-presentation av auto-genererade dokument/
   * mallar. Bevarar dokument-workflow: varje rad bär data-v11-doc-row/
   * data-v11-doc-registry/data-v11-doc-previewable + data-v11-doc-filler="auto"
   * (öppnar mall-/dokument-preview) — BEFINTLIGA handlers, inga nya. Tom lista →
   * explicit empty-state.
   * @param {object} l - output från CcoV11RailAdapters.buildAutoDocsFromPayload
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderAutoDocs(l) {
    if (!l) return '';
    var count = Number(l.count) > 0 ? Number(l.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Auto-dokument">' +
        '<div class="v11-rail__empty-title">Inga auto-dokument ännu</div>' +
        '<div class="v11-rail__empty-hint">Inga auto-genererade dokument registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__autodocs-list">' +
        l.items
          .map(function (it) {
            var meta = it.journeyStep
              ? '<span class="v11-rail__autodoc-step">steg ' + esc(it.journeyStep) + '</span>'
              : '';
            return (
              '<li class="v11-rail__autodoc-item">' +
              '<div class="v11-rail__autodoc-row" data-v11-doc-row data-v11-doc-filler="auto" data-v11-doc-registry="' +
              esc(it.registryId) +
              '" data-v11-doc-status="' +
              esc(it.status) +
              '" data-v11-doc-previewable="' +
              (it.previewable ? '1' : '0') +
              '"' +
              (it.previewable ? ' role="button" tabindex="0"' : '') +
              '>' +
              '<span class="v11-rail__autodoc-icon" aria-hidden="true">📄</span>' +
              '<span class="v11-rail__autodoc-main">' +
              '<span class="v11-rail__autodoc-title">' +
              esc(it.title) +
              '</span>' +
              (meta ? '<span class="v11-rail__autodoc-meta">' + meta + '</span>' : '') +
              '</span>' +
              (it.previewable
                ? '<span class="v11-rail__autodoc-preview" aria-hidden="true">Visa mall</span>'
                : '<span class="v11-rail__autodoc-status" data-state="' +
                  esc(it.status) +
                  '">' +
                  esc(it.statusLabel) +
                  '</span>') +
              '</div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__autodocs" data-v11-rail-autodocs aria-label="Auto-dokument">' +
      '<header class="v11-rail__autodocs-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">AUTO-DOKUMENT</div>' +
      (count ? '<span class="v11-rail__autodocs-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * M · Photos (KEEP) — V11-presentation av kundens foton/media. Bevarar foto-
   * workflow: varje foto är en native-länk (target=_blank) med data-photo=<id>
   * så ev. befintlig lightbox-handler wire:as — ingen ny handler.
   *
   * Riktiga thumbnails laddas via <img src=href> (samma fil-URL som legacy:
   * viewUrl / /api/v1/cco-patient-master/file). Om bilden inte kan laddas (eller
   * för film) visas en snygg fallback-tile (ikon + typ-etikett) i stället för
   * broken-image — inline onerror togglar .is-missing (tillåtet av app-CSP,
   * presentationellt, ingen workflow-handler). Tom lista → explicit empty-state.
   * @param {object} m - output från CcoV11RailAdapters.buildPhotosFromDriveFiles
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderPhotos(m) {
    if (!m) return '';
    var count = Number(m.count) > 0 ? Number(m.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Foton">' +
        '<div class="v11-rail__empty-title">Inga foton ännu</div>' +
        '<div class="v11-rail__empty-hint">Inga foton eller media registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<div class="v11-rail__photos-grid">' +
        m.items
          .map(function (it) {
            var kindLabel = it.isImage ? 'Foto' : 'Film';
            var fallback =
              '<span class="v11-rail__photo-fallback" aria-hidden="true">' +
              '<span class="v11-rail__photo-fallback-icon">' +
              (it.isImage ? '🖼' : '🎬') +
              '</span>' +
              '<span class="v11-rail__photo-fallback-label">' +
              kindLabel +
              '</span>' +
              '</span>';
            // Bara bilder försöker ladda en thumbnail; film visar alltid fallback.
            var thumbInner = it.isImage
              ? '<img class="v11-rail__photo-img" src="' +
                esc(it.href) +
                '" alt="' +
                esc(it.name) +
                '" loading="lazy" decoding="async"' +
                " onerror=\"this.closest('.v11-rail__photo').classList.add('is-missing')\" />" +
                fallback
              : fallback;
            return (
              '<a class="v11-rail__photo' +
              (it.isImage ? '' : ' is-missing is-film') +
              '" href="' +
              esc(it.href) +
              '" target="_blank" rel="noopener"' +
              (it.id ? ' data-photo="' + esc(it.id) + '"' : '') +
              ' title="' +
              esc(it.name) +
              '">' +
              '<span class="v11-rail__photo-thumb">' +
              thumbInner +
              '</span>' +
              '<span class="v11-rail__photo-name">' +
              esc(it.name) +
              '</span>' +
              '</a>'
            );
          })
          .join('') +
        '</div>';
    }

    return (
      '<section class="v11-rail__photos" data-v11-rail-photos aria-label="Foton">' +
      '<header class="v11-rail__photos-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">FOTON</div>' +
      (count ? '<span class="v11-rail__photos-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * N · Files (KEEP) — V11-presentation av kundens dokumentfiler. Bevarar fil-
   * workflow: varje fil är en native-länk (target=_blank) — samma sätt som legacy
   * dokumentrader, ingen ny handler. Tom lista → explicit empty-state.
   * @param {object} n - output från CcoV11RailAdapters.buildFilesFromDriveFiles
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderFiles(n) {
    if (!n) return '';
    var count = Number(n.count) > 0 ? Number(n.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Filer">' +
        '<div class="v11-rail__empty-title">Inga filer ännu</div>' +
        '<div class="v11-rail__empty-hint">Inga dokumentfiler registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__files-list">' +
        n.items
          .map(function (it) {
            return (
              '<li class="v11-rail__file-item">' +
              '<a class="v11-rail__file-row" href="' +
              esc(it.href) +
              '" target="_blank" rel="noopener"' +
              (it.id ? ' data-file-id="' + esc(it.id) + '"' : '') +
              ' title="' +
              esc(it.name) +
              '">' +
              '<span class="v11-rail__file-icon" aria-hidden="true">📄</span>' +
              '<span class="v11-rail__file-name">' +
              esc(it.name) +
              '</span>' +
              (it.badge ? '<span class="v11-rail__file-badge">' + esc(it.badge) + '</span>' : '') +
              '</a>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__files" data-v11-rail-files aria-label="Filer">' +
      '<header class="v11-rail__files-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">FILER</div>' +
      (count ? '<span class="v11-rail__files-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * O · Notes (KEEP) — V11-presentation av kundens anteckningar/noteringar.
   * Display-only (som legacy) — ingen handler. Tonklass markerar viktig/medicinsk/
   * notering. Tom lista → explicit empty-state.
   * @param {object} o - output från CcoV11RailAdapters.buildNotesFromState
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderNotes(o) {
    if (!o) return '';
    var count = Number(o.count) > 0 ? Number(o.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Anteckningar">' +
        '<div class="v11-rail__empty-title">Inga anteckningar</div>' +
        '<div class="v11-rail__empty-hint">Inga noteringar registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__notes-list">' +
        o.items
          .map(function (it) {
            return (
              '<li class="v11-rail__note" data-tone="' +
              esc(it.tone || 'note') +
              '">' +
              '<div class="v11-rail__note-text">' +
              esc(it.text) +
              '</div>' +
              (it.meta ? '<div class="v11-rail__note-meta">' + esc(it.meta) + '</div>' : '') +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__notes" data-v11-rail-notes aria-label="Anteckningar">' +
      '<header class="v11-rail__notes-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">ANTECKNINGAR</div>' +
      (count ? '<span class="v11-rail__notes-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * P2 · Konversationstrådar (C2) — skeleton-placeholder injiceras i HTML-strängen;
   * faktiska trådar hämtas asynkront av patient-master-ui.js (hydrateC2ThreadsPanel).
   * @param {string} customerId
   * @returns {string} HTML
   */
  function renderC2ThreadsPlaceholder(customerId) {
    return (
      '<section class="v11-rail__c2threads" data-v11-rail-section="Konversationstrådar"' +
      ' data-c2-threads-placeholder data-customer-id="' +
      esc(customerId) +
      '" aria-label="Konversationstrådar (C2)">' +
      '<header class="v11-rail__comm-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="violet">KONVERSATIONSTRÅDAR</div>' +
      '</header>' +
      '<div class="v11-rail__empty" role="status" data-c2-threads-loading>' +
      '<div class="v11-rail__empty-title">Hämtar konversationer…</div>' +
      '</div>' +
      '</section>'
    );
  }

  /**
   * P · Communication (KEEP) — V11-presentation av kommunikationslogg (mejl/SMS/
   * samtal). Loggraderna är display-only (som legacy); "Svarstudio"-actionen
   * bär befintlig data-v9-quick="reply" — ingen ny handler. Tom lista → explicit
   * empty-state.
   * @param {object} p - output från CcoV11RailAdapters.buildCommunicationFromState
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderCommunication(p) {
    if (!p) return '';
    var count = Number(p.count) > 0 ? Number(p.count) : 0;
    var icons = { mail: '✉', sms: '💬', call: '📞' };

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Kommunikation">' +
        '<div class="v11-rail__empty-title">Ingen kommunikation</div>' +
        '<div class="v11-rail__empty-hint">Ingen registrerad kommunikation.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__comm-list">' +
        p.items
          .map(function (it) {
            var icon = icons[it.type] || '•';
            return (
              '<li class="v11-rail__comm-item" data-type="' +
              esc(it.type) +
              '">' +
              '<span class="v11-rail__comm-icon" aria-hidden="true">' +
              icon +
              '</span>' +
              '<span class="v11-rail__comm-main">' +
              '<span class="v11-rail__comm-text">' +
              esc(it.text) +
              '</span>' +
              (it.meta ? '<span class="v11-rail__comm-meta">' + esc(it.meta) + '</span>' : '') +
              '</span>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>' +
        '<div class="v11-rail__comm-actions">' +
        '<button type="button" class="v11-rail__comm-reply" data-v9-quick="reply">✉ Svarstudio</button>' +
        '</div>';
    }

    return (
      '<section class="v11-rail__comm" data-v11-rail-comm aria-label="Kommunikation">' +
      '<header class="v11-rail__comm-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">KOMMUNIKATION</div>' +
      (count ? '<span class="v11-rail__comm-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * Q · Economy (KEEP) — V11-presentation av ekonomi-nyckeltal (intäkt/utestående/
   * snitt/LTV). Display-only — ingen handler. Saknas ekonomidata → empty-state.
   * @param {object} q - output från CcoV11RailAdapters.buildEconomyFromCard
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderEconomy(q) {
    if (!q) return '';
    var count = Number(q.count) > 0 ? Number(q.count) : 0;

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Ekonomi">' +
        '<div class="v11-rail__empty-title">Ingen ekonomidata</div>' +
        '<div class="v11-rail__empty-hint">Inga ekonomi-nyckeltal registrerade.</div>' +
        '</div>';
    } else {
      body =
        '<div class="v11-rail__econ-grid">' +
        q.items
          .map(function (it) {
            return (
              '<div class="v11-rail__econ-cell">' +
              '<div class="v11-rail__econ-label">' +
              esc(it.label) +
              '</div>' +
              '<div class="v11-rail__econ-value">' +
              esc(it.value) +
              '</div>' +
              '</div>'
            );
          })
          .join('') +
        '</div>';
    }

    return (
      '<section class="v11-rail__econ" data-v11-rail-economy aria-label="Ekonomi">' +
      '<header class="v11-rail__econ-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">EKONOMI</div>' +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * R · Insights (LATER) — V11-presentation av operativa insikter byggda på
   * kundens riktiga automation-signaler. Display-only insiktskort (ton:
   * blocker/review/insight) — ingen handler. Tom → explicit empty-state.
   * @param {object} r - output från CcoV11RailAdapters.buildInsightsFromSignals
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderInsights(r) {
    if (!r) return '';
    var count = Number(r.count) > 0 ? Number(r.count) : 0;
    var icons = { blocker: '⚠', review: '◐', insight: '↗' };

    var body;
    if (!count) {
      body =
        '<div class="v11-rail__empty" role="status" data-v11-rail-section="Insikter">' +
        '<div class="v11-rail__empty-title">Inga insikter just nu</div>' +
        '<div class="v11-rail__empty-hint">Inga aktiva signaler att lyfta.</div>' +
        '</div>';
    } else {
      body =
        '<ul class="v11-rail__insights-list">' +
        r.items
          .map(function (it) {
            var icon = icons[it.tone] || '↗';
            return (
              '<li class="v11-rail__insight" data-tone="' +
              esc(it.tone) +
              '">' +
              '<span class="v11-rail__insight-icon" aria-hidden="true">' +
              icon +
              '</span>' +
              '<span class="v11-rail__insight-main">' +
              '<span class="v11-rail__insight-title">' +
              esc(it.title) +
              '</span>' +
              (it.text ? '<span class="v11-rail__insight-text">' + esc(it.text) + '</span>' : '') +
              '</span>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="v11-rail__insights" data-v11-rail-insights aria-label="Insikter">' +
      '<header class="v11-rail__insights-head">' +
      '<div class="v11-rail__kicker" data-v11-rail-kicker="amber">INSIKTER</div>' +
      (count ? '<span class="v11-rail__insights-count">' + count + '</span>' : '') +
      '</header>' +
      body +
      '</section>'
    );
  }

  /**
   * S · Sticky Footer — persistent åtgärdsrad längst ner i rail (canon §6 S).
   * "Boka nästa" återanvänder den dokument-delegerade ord48-kalenderhandlern
   * (data-kk-ord48-open-calendar) och är disabled tills kunden är redo;
   * "Bekräfta kommande tider (N)" bär data-v9-quick="confirm" och visar N från
   * riktig booking-data (disabled vid 0). Inga nya handlers.
   * @param {object} s - output från CcoV11RailAdapters.buildStickyActions
   * @returns {string} HTML i .v11-rail__*-namespace
   */
  function renderStickyFooter(s) {
    if (!s) return '';
    var pid = esc(s.patientId);
    var ready = s.ready === true;
    var count = Number(s.bookCount) > 0 ? Number(s.bookCount) : 0;

    var bookBtn =
      '<button type="button" class="v11-rail__sticky-primary' +
      (ready ? '' : ' is-disabled') +
      '" data-kk-ord48-open-calendar data-kk-ord48-cal-footer data-patient-id="' +
      pid +
      '"' +
      (ready ? '' : ' disabled aria-disabled="true"') +
      '>Boka nästa</button>';

    var confirmBtn =
      '<button type="button" class="v11-rail__sticky-secondary' +
      (count ? '' : ' is-disabled') +
      '" data-v9-quick="confirm"' +
      (count ? '' : ' disabled aria-disabled="true"') +
      '>Bekräfta kommande tider' +
      (count ? ' (' + count + ')' : '') +
      '</button>';

    var hint = ready
      ? ''
      : '<p class="v11-rail__sticky-hint">Boka nästa aktiveras när kunden är redo för behandling.</p>';

    return (
      '<section class="v11-rail__sticky" data-v11-rail-sticky aria-label="Snabbåtgärder">' +
      '<div class="v11-rail__sticky-actions">' +
      bookBtn +
      confirmBtn +
      '</div>' +
      hint +
      '</section>'
    );
  }

  /**
   * Renderar V11-rail-innehåll för en kund. Ordning: D (top-banners) → A → V → B → C → E → F → G → H → I → J → K → L → M → N → O → P → Q → R → S.
   * @param {object} [ctx] - { card, bcard, dossierBundle, journalEntries, ... }
   * @returns {string} inner-HTML i .v11-rail__*-namespace
   */
  function render(ctx) {
    ctx = ctx || {};
    var adapters = global.CcoV11RailAdapters;
    if (!adapters) return '';
    var bcard = ctx.bcard || ctx.card || {};
    var card = ctx.card || {};
    var out = '';

    // D · Critical warnings (röda top-banners) — överst, endast när kritiska
    if (typeof adapters.buildCriticalWarnings === 'function') {
      out += renderCriticalWarnings(
        adapters.buildCriticalWarnings(card, ctx.journalEntries, ctx.dossierBundle)
      );
    }

    // A · Profile
    if (typeof adapters.buildProfileFromBcard === 'function') {
      out += renderProfile(adapters.buildProfileFromBcard(bcard));
    }

    // V · Active Visit (hero) — endast när synligt aktivt besök finns
    if (typeof adapters.buildActiveVisitFromBundle === 'function') {
      var av = adapters.buildActiveVisitFromBundle(ctx.dossierBundle);
      if (av) out += renderActiveVisit(av);
    }

    // B · Smart information (empty-state när inga signaler — ingen fejk)
    if (typeof adapters.buildSmartInfoFromSignals === 'function') {
      var info = adapters.buildSmartInfoFromSignals(card);
      out += info
        ? renderSmartInfo(info)
        : adapters.v11RailEmpty('Smart information', 'Inga öppna signaler.');
    }

    // C · Stats (BESÖK / VÄRDE TOT / SKULD)
    if (typeof adapters.buildStatsFromExtras === 'function') {
      out += renderStats(adapters.buildStatsFromExtras(bcard));
    }

    // E · Health Declaration (preview + deep-link, workflow ligger kvar i Zon 2)
    if (typeof adapters.buildHealthPreview === 'function') {
      out += renderHealthPreview(adapters.buildHealthPreview(bcard));
    }

    // F · Customer Journey (V11 visuell stepper ovanpå befintlig journey-logik)
    if (typeof adapters.buildJourneyFromState === 'function') {
      out += renderJourney(
        adapters.buildJourneyFromState(card, ctx.journalEntries, ctx.dossierBundle)
      );
    }

    // G · Smart Next Step (fokuserat rekommendationskort, en primär CTA)
    if (typeof adapters.buildSmartNextStep === 'function') {
      out += renderSmartNextStep(adapters.buildSmartNextStep(card));
    }

    // H · Bookings (KEEP) — kommande bokningar, bevarar bokningsworkflow
    if (typeof adapters.buildBookingsFromExtras === 'function') {
      out += renderBookings(
        adapters.buildBookingsFromExtras(card, bcard, ctx.dossierBundle, ctx.occasionTimeline)
      );
    }

    // I · History (KEEP) — tidigare besök/bokningar, bevarar historik-workflow
    if (typeof adapters.buildHistoryFromExtras === 'function') {
      out += renderHistory(
        adapters.buildHistoryFromExtras(card, bcard, ctx.dossierBundle, ctx.occasionTimeline)
      );
    }

    // J · Journals (KEEP) — journalposter, bevarar journal-workflow
    if (typeof adapters.buildJournalsFromEntries === 'function') {
      out += renderJournals(adapters.buildJournalsFromEntries(ctx.journalEntries));
    }

    // K · Offers (KEEP) — offerter/behandlingsplaner, bevarar offert-workflow
    if (typeof adapters.buildOffersFromPayload === 'function') {
      out += renderOffers(adapters.buildOffersFromPayload(card, ctx.dossierBundle));
    }

    // L · Auto-documents (KEEP) — auto-genererade dokument, bevarar dokument-workflow
    if (typeof adapters.buildAutoDocsFromPayload === 'function') {
      out += renderAutoDocs(adapters.buildAutoDocsFromPayload(card, ctx.dossierBundle));
    }

    // M · Photos (KEEP) — foton/media, bevarar foto-workflow
    if (typeof adapters.buildPhotosFromDriveFiles === 'function') {
      out += renderPhotos(adapters.buildPhotosFromDriveFiles(ctx.driveFiles));
    }

    // N · Files (KEEP) — dokumentfiler (icke-media), bevarar fil-workflow
    if (typeof adapters.buildFilesFromDriveFiles === 'function') {
      out += renderFiles(adapters.buildFilesFromDriveFiles(ctx.driveFiles));
    }

    // O · Notes (KEEP) — anteckningar/noteringar (display-only)
    if (typeof adapters.buildNotesFromState === 'function') {
      out += renderNotes(adapters.buildNotesFromState(card, ctx.dossierBundle));
    }

    // P · Communication (KEEP) — kommunikationslogg, bevarar reply-action
    if (typeof adapters.buildCommunicationFromState === 'function') {
      out += renderCommunication(adapters.buildCommunicationFromState(card, ctx.occasionTimeline));
    }

    // P2 · Konversationstrådar (C2) — read-only per-kund trådar från ccoConversationThreadStore
    // Renderar en placeholder; patient-master-ui.js hydraterar asynkront via
    // GET /api/v1/cco-customers/:id/conversation-threads. Inga writes, inget live-send.
    var c2Cid = String(
      card.patientId ||
        card.id ||
        card.customerId ||
        bcard.patientId ||
        bcard.id ||
        bcard.customerId ||
        ''
    ).trim();
    if (c2Cid) {
      out += renderC2ThreadsPlaceholder(c2Cid);
    }

    // Q · Economy (KEEP) — ekonomi-nyckeltal (display-only)
    if (typeof adapters.buildEconomyFromCard === 'function') {
      out += renderEconomy(adapters.buildEconomyFromCard(bcard));
    }

    // R · Insights (LATER) — operativa insikter från riktiga signaler (display-only)
    if (typeof adapters.buildInsightsFromSignals === 'function') {
      out += renderInsights(adapters.buildInsightsFromSignals(card));
    }

    // S · Sticky Footer (persistent åtgärdsrad längst ner) — endast när
    // rail-innehåll finns ovanför (inget tomt skal får en flytande footer).
    if (out && typeof adapters.buildStickyActions === 'function') {
      out += renderStickyFooter(
        adapters.buildStickyActions(card, bcard, ctx.dossierBundle, ctx.occasionTimeline)
      );
    }

    return out;
  }

  global.CcoV11Rail = {
    BLOCK: 20,
    esc: esc,
    renderProfile: renderProfile,
    renderSmartInfo: renderSmartInfo,
    renderStats: renderStats,
    renderActiveVisit: renderActiveVisit,
    renderCriticalWarnings: renderCriticalWarnings,
    renderHealthPreview: renderHealthPreview,
    renderJourney: renderJourney,
    renderSmartNextStep: renderSmartNextStep,
    renderBookings: renderBookings,
    renderHistory: renderHistory,
    renderJournals: renderJournals,
    renderOffers: renderOffers,
    renderAutoDocs: renderAutoDocs,
    renderPhotos: renderPhotos,
    renderFiles: renderFiles,
    renderNotes: renderNotes,
    renderCommunication: renderCommunication,
    renderEconomy: renderEconomy,
    renderInsights: renderInsights,
    renderStickyFooter: renderStickyFooter,
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
