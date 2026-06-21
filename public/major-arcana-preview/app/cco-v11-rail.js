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
   * Renderar V11-rail-innehåll för en kund. Ordning: D (top-banners) → A → V → B → C → E.
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

    return out;
  }

  global.CcoV11Rail = {
    BLOCK: 6,
    esc: esc,
    renderProfile: renderProfile,
    renderSmartInfo: renderSmartInfo,
    renderStats: renderStats,
    renderActiveVisit: renderActiveVisit,
    renderCriticalWarnings: renderCriticalWarnings,
    renderHealthPreview: renderHealthPreview,
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
