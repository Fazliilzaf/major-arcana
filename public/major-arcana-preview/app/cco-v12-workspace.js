/**
 * V12 Customer Workspace — renderer (Block 0 · Journal-modul).
 *
 * Zon 2-djupvy. Rent `.v12-workspace__*`-namespace (canon §5), inga legacy-
 * override-klasser. Återanvänder BEFINTLIGA handlers: journal-raderna bär
 * `data-v9-section-link="journal"` och primäråtgärden `data-v9-quick="journal"`
 * — wire:as av cco-v9-customers-parity.js (bindDossierScroll). INGEN ny handler.
 *
 *   window.CcoV12Workspace.render(ctx) → HTML-sträng (Zon 2-innehåll)
 *   ctx: { journalEntries, ... }  (samma ctx som V11-railen får)
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Kundens nuläge-modul (sektion 1) — identitet, kontakt, tags, status och
   * nyckeltal överst i arbetsytan. Återanvänder V11-adaptrarna
   * buildProfileFromBcard + buildStatsFromExtras. Snabbåtgärder ring/SMS/mejl
   * är native länkar (tel:/sms:/mailto:) precis som V11:s kontaktlänkar —
   * INGEN ny handler. Status härleds endast från riktig data (readyForTreatment);
   * saknas fältet visas ingen påhittad status. Personnummer saknas i datakällan
   * idag → renderas inte (explicit utelämnat, ingen fejk; per inventory-spike).
   */
  function renderCurrentStateModule(profile, stats, status) {
    profile = profile || { name: 'Kund', initials: '–', pills: [] };

    function telHref(p) {
      return String(p == null ? '' : p).replace(/[^\d+]/g, '');
    }

    var actions = [];
    if (profile.phone) {
      actions.push(
        '<a class="v12-workspace__cs-action" href="tel:' +
          esc(telHref(profile.phone)) +
          '"><span aria-hidden="true">📞</span> Ring</a>'
      );
      actions.push(
        '<a class="v12-workspace__cs-action" href="sms:' +
          esc(telHref(profile.phone)) +
          '"><span aria-hidden="true">💬</span> SMS</a>'
      );
    }
    if (profile.email) {
      actions.push(
        '<a class="v12-workspace__cs-action" href="mailto:' +
          esc(profile.email) +
          '"><span aria-hidden="true">✉</span> Mejl</a>'
      );
    }
    var actionsRow = actions.length
      ? '<div class="v12-workspace__cs-actions">' + actions.join('') + '</div>'
      : '';

    var contactBits = [];
    if (profile.phone) contactBits.push(esc(profile.phone));
    if (profile.email) contactBits.push(esc(profile.email));
    var contactRow = contactBits.length
      ? '<div class="v12-workspace__cs-contact">' + contactBits.join(' · ') + '</div>'
      : '<div class="v12-workspace__cs-contact v12-workspace__health-muted">Inga kontaktuppgifter registrerade</div>';

    var addr = profile.addrLine
      ? '<div class="v12-workspace__cs-addr">📍 ' + esc(profile.addrLine) + '</div>'
      : '';

    var pills =
      profile.pills && profile.pills.length
        ? '<div class="v12-workspace__cs-pills">' +
          profile.pills
            .map(function (pill) {
              return (
                '<span class="v12-workspace__cs-pill" data-tone="' +
                esc(pill.tone) +
                '">' +
                esc(pill.label) +
                '</span>'
              );
            })
            .join('') +
          '</div>'
        : '';

    var statusBadge = status
      ? '<span class="v12-workspace__cs-status" data-tone="' +
        esc(status.tone) +
        '">' +
        esc(status.label) +
        '</span>'
      : '';

    var statBlock = '';
    if (stats) {
      var skuldState = stats.skuld.unknown ? 'unknown' : stats.skuld.hasDebt ? 'debt' : 'clear';
      function cell(label, data, extraAttr) {
        return (
          '<div class="v12-workspace__cs-stat"' +
          (extraAttr || '') +
          '><div class="v12-workspace__cs-stat-label">' +
          esc(label) +
          '</div><div class="v12-workspace__cs-stat-value">' +
          esc(data.value) +
          '</div><div class="v12-workspace__cs-stat-sub">' +
          esc(data.sub) +
          '</div></div>'
        );
      }
      statBlock =
        '<div class="v12-workspace__cs-stats">' +
        cell('Besök', stats.besok) +
        cell('Värde tot', stats.vardeTot) +
        cell('Skuld', stats.skuld, ' data-skuld-state="' + esc(skuldState) + '"') +
        '</div>';
    }

    return (
      '<section class="v12-workspace__module v12-workspace__current-state" data-v12-module="current-state" aria-label="Kundens nuläge">' +
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">KUNDENS NULÄGE</div>' +
      statusBadge +
      '</header>' +
      '<div class="v12-workspace__cs-identity">' +
      '<div class="v12-workspace__cs-avatar" aria-hidden="true">' +
      esc(profile.initials) +
      '</div>' +
      '<div class="v12-workspace__cs-id-main">' +
      '<div class="v12-workspace__cs-name">' +
      esc(profile.name) +
      '</div>' +
      contactRow +
      addr +
      '</div></div>' +
      pills +
      actionsRow +
      statBlock +
      '</section>'
    );
  }

  /**
   * Kundresa / steg-modul (sektion 5) — visuell stepper ovanpå BEFINTLIG
   * journey-logik. Återanvänder V11-adaptern buildJourneyFromState (samma
   * CcoKundkortKkx.buildCanonicalJourneyLive som legacy) och de BEFINTLIGA
   * deep-link-attributen `data-kk-jump` / `data-kk-med-form` (navigation, ingen
   * ny handler). Saknad journey-logik → explicit empty-state ("Kundresan har
   * inte startat"), ingen fejkad resa.
   */
  function renderJourneyModule(j) {
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">KUNDRESA' +
      (j && j.total ? ' · ' + esc(String(j.total)) + ' STEG' : '') +
      '</div>' +
      (j && j.cur
        ? '<span class="v12-workspace__count">Steg ' + esc(String(j.cur)) + '</span>'
        : '') +
      '</header>';

    if (!j || !j.steps || !j.steps.length) {
      return (
        '<section class="v12-workspace__module v12-workspace__journey" data-v12-module="journey" aria-label="Kundresa">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Kundresan har inte startat</div>' +
        '<div class="v12-workspace__empty-hint">Inga steg registrerade ännu.</div>' +
        '</div></section>'
      );
    }

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
        var note =
          s.note ||
          (s.state === 'done'
            ? 'Klar'
            : s.state === 'active'
              ? 'Pågår · nästa steg'
              : s.state === 'neutral'
                ? '—'
                : 'Kommande');
        var inner =
          '<span class="v12-workspace__journey-mk" aria-hidden="true">' +
          esc(mk) +
          '</span>' +
          '<span class="v12-workspace__journey-body">' +
          '<span class="v12-workspace__journey-label">' +
          esc(s.label) +
          '</span>' +
          '<span class="v12-workspace__journey-note">' +
          esc(note) +
          '</span></span>';
        // Steg med jump-slug → klickbar knapp som bär de BEFINTLIGA deep-link-
        // attributen. Övriga steg = ren rad (ingen död knapp).
        if (s.jump) {
          return (
            '<li class="v12-workspace__journey-step" data-state="' +
            esc(s.state) +
            '"><button type="button" class="v12-workspace__journey-row" data-kk-jump="' +
            esc(s.jump) +
            '"' +
            (s.medForm ? ' data-kk-med-form="' + esc(s.medForm) + '"' : '') +
            '>' +
            inner +
            '</button></li>'
          );
        }
        return (
          '<li class="v12-workspace__journey-step" data-state="' +
          esc(s.state) +
          '"><div class="v12-workspace__journey-row v12-workspace__journey-row--static">' +
          inner +
          '</div></li>'
        );
      })
      .join('');

    return (
      '<section class="v12-workspace__module v12-workspace__journey" data-v12-module="journey" aria-label="Kundresa">' +
      head +
      '<div class="v12-workspace__journey-bar"><span style="width:' +
      esc(String(j.pct || 0)) +
      '%"></span></div>' +
      '<ul class="v12-workspace__journey-steps">' +
      steps +
      '</ul></section>'
    );
  }

  /** Journal-modul — full djupvy (full nottext), till skillnad från railens snippet. */
  function renderJournalModule(journal) {
    var count = (journal && journal.count) || 0;
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">JOURNAL</div>' +
      '<span class="v12-workspace__count">' +
      esc(String(count)) +
      '</span>' +
      '<button type="button" class="v12-workspace__primary" data-v9-quick="journal">' +
      '+ Ny anteckning' +
      '</button>' +
      '</header>';

    if (!count) {
      return (
        '<section class="v12-workspace__module" data-v12-module="journal" aria-label="Journal">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inga journalanteckningar</div>' +
        '<div class="v12-workspace__empty-hint">Skapa den första via “Ny anteckning”.</div>' +
        '</div>' +
        '</section>'
      );
    }

    var rows = journal.items
      .map(function (it) {
        return (
          '<li class="v12-workspace__journal-item">' +
          '<button type="button" class="v12-workspace__journal-card" data-v9-section-link="journal" data-journal-state="' +
          esc(it.state) +
          '">' +
          '<span class="v12-workspace__journal-top">' +
          '<span class="v12-workspace__journal-title">' +
          esc(it.title) +
          '</span>' +
          '<span class="v12-workspace__journal-badge" data-state="' +
          esc(it.state) +
          '">' +
          esc(it.badge) +
          '</span>' +
          '</span>' +
          (it.body ? '<span class="v12-workspace__journal-body">' + esc(it.body) + '</span>' : '') +
          '<span class="v12-workspace__journal-meta">' +
          esc(it.author) +
          (it.date ? ' · ' + esc(it.date) : '') +
          (it.locked ? ' · 🔒' : '') +
          '</span>' +
          '</button>' +
          '</li>'
        );
      })
      .join('');

    return (
      '<section class="v12-workspace__module" data-v12-module="journal" aria-label="Journal">' +
      head +
      '<ul class="v12-workspace__journal-list">' +
      rows +
      '</ul>' +
      '</section>'
    );
  }

  function avFmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch (_error) {
      return '';
    }
  }

  /**
   * Aktivt besök-modul (hero, sektion 2) — full arbetsversion. Återanvänder
   * V11-adaptern (buildActiveVisitFromBundle) som datakälla och de BEFINTLIGA
   * `data-v11-active-visit-action`-knapparna (checkin/journal/complete/followup/
   * photo/notes) → wire:as av bindIntelligentJourney. INGEN ny handler.
   */
  function renderActiveVisitModule(av) {
    if (!av) {
      return (
        '<section class="v12-workspace__module v12-workspace__av" data-v12-module="active-visit" aria-label="Aktivt besök">' +
        '<header class="v12-workspace__module-head">' +
        '<div class="v12-workspace__kicker" data-v12-kicker="amber">AKTIVT BESÖK</div>' +
        '</header>' +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inget aktivt besök idag</div>' +
        '<div class="v12-workspace__empty-hint">Dagens behandling visas här vid incheckning.</div>' +
        '</div></section>'
      );
    }

    var ci = avFmtTime(av.checkedInAt);
    var co = avFmtTime(av.completedAt);
    // Facit 6-node besöksförlopp: bokad → incheckad → behandling → journal →
    // eftervård → klar. Nod-status härleds ur den RIKTIGA visit-staten (inget
    // påhittat): allt före aktuellt steg = klart, aktuellt = aktivt, efter = kvar.
    // - in_progress med påbörjad journal → journal aktiv, behandling klar.
    // - completed_today → dagens behandling+journal klar, eftervård är nästa steg
    //   (uppföljning ej bokad), klar tänds först när hela resan är slut.
    var avCurrent = {
      scheduled_today: 1,
      checked_in: 2,
      in_progress: av.journalStarted ? 3 : 2,
      completed_today: 4,
    }[av.state];
    if (typeof avCurrent !== 'number') avCurrent = 0;
    var nodes = [
      { label: 'Bokad' },
      { label: ci ? ci + ' incheckad' : 'Incheckad' },
      { label: 'Behandling' },
      { label: 'Journal' },
      { label: 'Eftervård' },
      { label: co ? co + ' klar' : 'Klar' },
    ];
    function nodeState(i) {
      if (i < avCurrent) return 'is-done';
      if (i === avCurrent) return 'is-active';
      return '';
    }
    var timeline = av.showTimeline
      ? '<div class="v12-workspace__av-timeline" aria-label="Besöksförlopp">' +
        nodes
          .map(function (n, i) {
            return (
              '<div class="v12-workspace__av-node ' +
              nodeState(i) +
              '"><span class="v12-workspace__av-dot" aria-hidden="true"></span>' +
              '<span class="v12-workspace__av-node-label">' +
              esc(n.label) +
              '</span></div>'
            );
          })
          .join('') +
        '</div>'
      : '';

    var preflight;
    if (av.preflightCompact) {
      preflight = '<p class="v12-workspace__av-preflight-ok">Besöket är avslutat för idag.</p>';
    } else if (av.blockers && av.blockers.length) {
      preflight =
        '<span class="v12-workspace__av-preflight-kicker">Innan besöket</span>' +
        '<div class="v12-workspace__av-blockers">' +
        av.blockers
          .map(function (b) {
            return (
              '<div class="v12-workspace__av-blocker" data-blocker="' +
              esc(b.code || '') +
              '"><span class="v12-workspace__av-blocker-badge" aria-hidden="true">!</span>' +
              '<span class="v12-workspace__av-blocker-label">' +
              esc(b.label || 'Blockerare') +
              '</span></div>'
            );
          })
          .join('') +
        '</div>';
    } else {
      preflight =
        '<span class="v12-workspace__av-preflight-kicker">Innan besöket</span>' +
        '<p class="v12-workspace__av-preflight-ok">Inga blockerare för dagens besök.</p>';
    }

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
      '<div class="v12-workspace__av-actions" data-v11-active-visit-actions>' +
      actionBtn(
        av.primary.action,
        withDetail(av.primary.action, av.primary.label),
        'v12-workspace__av-primary'
      ) +
      (av.secondary
        ? actionBtn(
            av.secondary.action,
            withDetail(av.secondary.action, av.secondary.label),
            'v12-workspace__av-secondary'
          )
        : '') +
      actionBtn('photo', 'Ta bild', 'v12-workspace__av-secondary', av.photoDisabled) +
      actionBtn('notes', 'Anteckning', 'v12-workspace__av-secondary', av.notesDisabled) +
      '</div>';

    var headMeta = '';
    if (av.headMeta) headMeta = av.headMeta + (av.practitioner ? ' · ' + av.practitioner : '');
    else if (av.practitioner) headMeta = av.practitioner;

    return (
      '<section class="v12-workspace__module v12-workspace__av" data-v12-module="active-visit" data-v11-active-visit data-v11-active-visit-state="' +
      esc(av.state) +
      '" aria-label="Aktivt besök">' +
      '<header class="v12-workspace__av-head">' +
      '<span class="v12-workspace__av-status"><span class="v12-workspace__av-dot v12-workspace__av-dot--' +
      esc(av.state) +
      '" aria-hidden="true"></span>' +
      '<span class="v12-workspace__kicker" data-v12-kicker="amber">' +
      esc(av.kicker) +
      '</span></span>' +
      (headMeta ? '<span class="v12-workspace__av-time">' + esc(headMeta) + '</span>' : '') +
      '</header>' +
      '<div class="v12-workspace__av-context">' +
      '<h3 class="v12-workspace__av-title">' +
      esc(av.title) +
      '</h3>' +
      '<p class="v12-workspace__av-status-line">' +
      esc(av.statusLine) +
      '</p>' +
      '</div>' +
      timeline +
      '<div class="v12-workspace__av-preflight' +
      (av.preflightCompact ? ' is-compact' : '') +
      '" data-v11-active-visit-preflight>' +
      preflight +
      '</div>' +
      actions +
      '</section>'
    );
  }

  /**
   * Kritiska varningar-modul (sektion 3) — röda blocker/legal-gates. Display-only
   * (inga handlers, inga write-actions). Datakälla: återanvänd V11-adapter
   * buildCriticalWarnings (CcoKundkortKkx-logiklager med fallback automationSignals).
   */
  function renderCriticalWarningsModule(list) {
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="warn">KRITISKA VARNINGAR</div>' +
      '</header>';
    if (!list || !list.length) {
      return (
        '<section class="v12-workspace__module v12-workspace__warn" data-v12-module="warnings" aria-label="Kritiska varningar">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inga kritiska varningar</div>' +
        '<div class="v12-workspace__empty-hint">Inga blockerare eller risker att åtgärda.</div>' +
        '</div></section>'
      );
    }
    var cards = list
      .map(function (w) {
        return (
          '<div class="v12-workspace__warn-card" data-rule-id="' +
          esc(w.ruleId) +
          '"><span class="v12-workspace__warn-badge" aria-hidden="true">⚠</span>' +
          '<span class="v12-workspace__warn-copy">' +
          '<span class="v12-workspace__warn-what">' +
          esc(w.what) +
          (w.legal ? '<span class="v12-workspace__warn-legal">Juridik</span>' : '') +
          '</span>' +
          (w.why ? '<span class="v12-workspace__warn-why">' + esc(w.why) + '</span>' : '') +
          '</span></div>'
        );
      })
      .join('');
    return (
      '<section class="v12-workspace__module v12-workspace__warn" role="alert" data-v12-module="warnings" aria-label="Kritiska varningar">' +
      head +
      '<div class="v12-workspace__warn-list">' +
      cards +
      '</div></section>'
    );
  }

  /**
   * Bokningar-modul (sektion 8) — kommande + tidigare besök. Återanvänder
   * V11-adaptrarna buildBookingsFromExtras/buildHistoryFromExtras och de
   * BEFINTLIGA handlers: "Bekräfta tider" `data-v9-quick="confirm"` (confirmBookings)
   * + rader `data-v9-section-link="upcoming"/"historik"`. INGEN ny handler.
   */
  function renderBookingsModule(bookings, history) {
    var upCount = (bookings && bookings.count) || 0;
    var histCount = (history && history.count) || 0;

    function bookingRow(it) {
      var staff = it.staff
        ? '<span class="v12-workspace__booking-staff" title="' +
          esc(it.staff) +
          '"><span class="v12-workspace__booking-avatar" aria-hidden="true">' +
          esc(it.initials || '—') +
          '</span></span>'
        : '';
      var status = it.stateLabel
        ? '<span class="v12-workspace__booking-status" data-state="' +
          esc(it.state) +
          '">' +
          esc(it.stateLabel) +
          '</span>'
        : '';
      return (
        '<li class="v12-workspace__booking"><button type="button" class="v12-workspace__booking-row" data-v9-section-link="upcoming">' +
        '<span class="v12-workspace__booking-when"><span class="v12-workspace__booking-date">' +
        esc(it.whenLong || '—') +
        '</span>' +
        (it.whenShort
          ? '<span class="v12-workspace__booking-time">' + esc(it.whenShort) + '</span>'
          : '') +
        '</span><span class="v12-workspace__booking-copy"><span class="v12-workspace__booking-title">' +
        esc(it.title) +
        '</span>' +
        (it.sub ? '<span class="v12-workspace__booking-sub">' + esc(it.sub) + '</span>' : '') +
        '</span>' +
        staff +
        status +
        '</button></li>'
      );
    }
    function historyRow(it) {
      return (
        '<li class="v12-workspace__booking"><button type="button" class="v12-workspace__booking-row v12-workspace__booking-row--history" data-v9-section-link="historik">' +
        '<span class="v12-workspace__booking-when"><span class="v12-workspace__booking-date">' +
        esc(it.whenLong || '—') +
        '</span>' +
        (it.whenShort
          ? '<span class="v12-workspace__booking-time">' + esc(it.whenShort) + '</span>'
          : '') +
        '</span><span class="v12-workspace__booking-copy"><span class="v12-workspace__booking-title">' +
        esc(it.title) +
        '</span>' +
        (it.sub ? '<span class="v12-workspace__booking-sub">' + esc(it.sub) + '</span>' : '') +
        '</span><span class="v12-workspace__booking-done" aria-hidden="true">✓</span></button></li>'
      );
    }

    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">BOKNINGAR</div>' +
      (upCount ? '<span class="v12-workspace__count">' + esc(String(upCount)) + '</span>' : '') +
      '</header>';

    var upcoming = upCount
      ? '<ul class="v12-workspace__booking-list">' +
        bookings.items.map(bookingRow).join('') +
        '</ul>' +
        '<div class="v12-workspace__booking-actions">' +
        '<button type="button" class="v12-workspace__primary" data-v9-quick="confirm">Bekräfta kommande tider (' +
        esc(String(upCount)) +
        ')</button></div>'
      : '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inga kommande bokningar</div>' +
        '<div class="v12-workspace__empty-hint">Inga kommande tider bokade.</div></div>';

    var historyBlock =
      '<div class="v12-workspace__subhead">Tidigare besök' +
      (histCount ? ' · ' + esc(String(histCount)) : '') +
      '</div>' +
      (histCount
        ? '<ul class="v12-workspace__booking-list v12-workspace__booking-list--history">' +
          history.items.map(historyRow).join('') +
          '</ul>'
        : '<div class="v12-workspace__empty" role="status">' +
          '<div class="v12-workspace__empty-title">Ingen historik ännu</div>' +
          '<div class="v12-workspace__empty-hint">Inga tidigare besök registrerade.</div></div>');

    return (
      '<section class="v12-workspace__module v12-workspace__bookings" data-v12-module="bookings" aria-label="Bokningar">' +
      head +
      upcoming +
      historyBlock +
      '</section>'
    );
  }

  /**
   * Hälsa-modul (sektion 4) — hälsodeklaration-status + allergier +
   * kontraindikationer. Återanvänder V11-adaptern buildHealthPreview + befintlig
   * "Öppna"-jump `data-kk-jump="kk-card-halsa"` (navigation, ingen ny handler).
   * Kontraindikationer surfas från hälsodeklarationens RIKTIGA riskflaggor
   * (hd.flags, röd/amber). Läkemedel (namn) saknar datakälla idag — formuläret
   * fångar dem inte → explicit okänd-state (B3-beslut 2026-06-23; ingen fejk).
   */
  function renderHealthModule(hp) {
    hp = hp || { status: 'unknown', allergies: [] };
    var statusText =
      hp.status === 'signed' ? 'Signerad' : hp.status === 'missing' ? 'Saknas' : 'Okänd';
    var meta = [];
    if (hp.status === 'signed') {
      if (hp.signedAt) meta.push(esc(String(hp.signedAt).slice(0, 10)));
      if (hp.source) meta.push(esc(hp.source));
    }
    var metaLine = meta.length
      ? '<span class="v12-workspace__health-meta">' + meta.join(' · ') + '</span>'
      : '';

    var allergies =
      hp.allergies && hp.allergies.length
        ? '<div class="v12-workspace__subhead">Allergier · ' +
          esc(String(hp.allergies.length)) +
          '</div><div class="v12-workspace__health-allergies">' +
          hp.allergies
            .map(function (a) {
              return '<span class="v12-workspace__health-allergy">' + esc(a) + '</span>';
            })
            .join('') +
          '</div>'
        : '<div class="v12-workspace__subhead">Allergier</div>' +
          '<div class="v12-workspace__health-muted">Inga registrerade allergier</div>';

    // Kontraindikationer — RIKTIGA riskflaggor ur hälsodeklarationen (röd/amber).
    // Tom lista → dämpad not. Ingen fejk.
    var contra =
      hp.contraindications && hp.contraindications.length
        ? '<div class="v12-workspace__subhead">Kontraindikationer · ' +
          esc(String(hp.contraindications.length)) +
          '</div><div class="v12-workspace__health-contra">' +
          hp.contraindications
            .map(function (c) {
              return (
                '<span class="v12-workspace__health-flag" data-level="' +
                esc(c.level) +
                '">' +
                esc(c.text) +
                '</span>'
              );
            })
            .join('') +
          '</div>'
        : '<div class="v12-workspace__subhead">Kontraindikationer</div>' +
          '<div class="v12-workspace__health-muted">Inga registrerade kontraindikationer</div>';

    // Läkemedel — saknar datakälla idag (owner-beslut B3, utredning 2026-06-23).
    // Explicit okänd-state tills hälsodeklarationen fångar pågående läkemedel.
    var medications =
      '<div class="v12-workspace__subhead">Läkemedel</div>' +
      '<div class="v12-workspace__health-muted">Pågående läkemedel registreras inte i hälsodeklarationen ännu.</div>';

    return (
      '<section class="v12-workspace__module v12-workspace__health" data-v12-module="health" aria-label="Hälsa">' +
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">HÄLSA</div>' +
      '</header>' +
      '<div class="v12-workspace__health-row">' +
      '<span class="v12-workspace__health-status" data-status="' +
      esc(hp.status) +
      '">' +
      esc(statusText) +
      '</span>' +
      metaLine +
      '<button type="button" class="v12-workspace__health-open" data-kk-jump="kk-card-halsa">Öppna full hälsoprofil</button>' +
      '</div>' +
      allergies +
      contra +
      medications +
      '</section>'
    );
  }

  /**
   * Insikter & nästa bästa åtgärd-modul (sektion 12) — kombinerar V11:s
   * Smart Next Step (G) + Insights (R). Återanvänder adaptrarna
   * buildSmartNextStep + buildInsightsFromSignals och de BEFINTLIGA CTA-
   * attributen `data-kk-sig` / `data-kk-sig-label` / `data-kk-patient-id`
   * som den globala signal-action-handlern redan wire:ar. INGEN ny handler.
   * Inga aktiva signaler → explicit empty-state (ingen fejkad rekommendation).
   */
  function renderInsightsModule(nextStep, insights) {
    var icons = { blocker: '⚠', review: '◐', insight: '↗' };
    var items = (insights && insights.items) || [];
    var count = items.length;

    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">INSIKTER &amp; NÄSTA ÅTGÄRD</div>' +
      (count ? '<span class="v12-workspace__count">' + esc(String(count)) + '</span>' : '') +
      '</header>';

    var nextBlock = '';
    if (nextStep && nextStep.what) {
      var sigAttrs =
        ' data-kk-sig="' +
        esc(nextStep.ruleId) +
        '" data-kk-sig-label="' +
        esc(nextStep.what) +
        '" data-kk-patient-id="' +
        esc(nextStep.patientId) +
        '"';
      var toneClass = nextStep.tone === 'Blockerare' ? 'blocker' : 'suggested';
      nextBlock =
        '<div class="v12-workspace__next" data-tone="' +
        esc(toneClass) +
        '">' +
        '<div class="v12-workspace__next-head">' +
        '<span class="v12-workspace__subhead">Nästa bästa åtgärd</span>' +
        '<span class="v12-workspace__next-tone" data-tone="' +
        esc(toneClass) +
        '">' +
        esc(nextStep.tone) +
        '</span>' +
        '</div>' +
        '<div class="v12-workspace__next-what">' +
        esc(nextStep.what) +
        '</div>' +
        (nextStep.why
          ? '<div class="v12-workspace__next-why">' + esc(nextStep.why) + '</div>'
          : '') +
        '<div class="v12-workspace__next-actions">' +
        '<button type="button" class="v12-workspace__primary"' +
        sigAttrs +
        '>' +
        esc(nextStep.ctaLabel || 'Granska & åtgärda') +
        '</button>' +
        '<button type="button" class="v12-workspace__next-secondary"' +
        sigAttrs +
        '>Granska utkast</button>' +
        '</div></div>';
    }

    // Facit-parity: insikter delas i amber "Gör nu" (blockerare/granska) och
    // grön "Möjlighet" (positiva signaler). Endast grupper med riktiga items
    // renderas — ingen påhittad rekommendation, inga tomma grupprubriker.
    function renderInsightRows(list) {
      return (
        '<ul class="v12-workspace__insights-list">' +
        list
          .map(function (it) {
            var icon = icons[it.tone] || '↗';
            return (
              '<li class="v12-workspace__insight" data-tone="' +
              esc(it.tone) +
              '"><span class="v12-workspace__insight-icon" aria-hidden="true">' +
              icon +
              '</span><span class="v12-workspace__insight-main">' +
              '<span class="v12-workspace__insight-title">' +
              esc(it.title) +
              '</span>' +
              (it.text
                ? '<span class="v12-workspace__insight-text">' + esc(it.text) + '</span>'
                : '') +
              '</span></li>'
            );
          })
          .join('') +
        '</ul>'
      );
    }

    var insightsBlock;
    if (!count) {
      insightsBlock =
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inga insikter just nu</div>' +
        '<div class="v12-workspace__empty-hint">Inga aktiva signaler att lyfta.</div></div>';
    } else {
      var gorNu = items.filter(function (it) {
        return it.tone === 'blocker' || it.tone === 'review';
      });
      var mojlighet = items.filter(function (it) {
        return it.tone !== 'blocker' && it.tone !== 'review';
      });
      insightsBlock =
        '<div class="v12-workspace__insight-groups">' +
        (gorNu.length
          ? '<div class="v12-workspace__insight-group" data-group="gor-nu">' +
            '<div class="v12-workspace__insight-group-label" data-tone="amber">Gör nu</div>' +
            renderInsightRows(gorNu) +
            '</div>'
          : '') +
        (mojlighet.length
          ? '<div class="v12-workspace__insight-group" data-group="mojlighet">' +
            '<div class="v12-workspace__insight-group-label" data-tone="green">Möjlighet</div>' +
            renderInsightRows(mojlighet) +
            '</div>'
          : '') +
        '</div>';
    }

    return (
      '<section class="v12-workspace__module v12-workspace__insights" data-v12-module="insights" aria-label="Insikter och nästa åtgärd">' +
      head +
      nextBlock +
      insightsBlock +
      '</section>'
    );
  }

  /**
   * Sticky arbetsbar-modul (sektion 13) — persistent åtgärdsrad sist i
   * arbetsytan. Återanvänder V11-adaptern buildStickyActions och de BEFINTLIGA
   * handlers: "Boka nästa" bär `data-kk-ord48-open-calendar` (delegerad ord48-
   * kalender, disabled tills kunden är redo) och "Bekräfta kommande tider (N)"
   * bär `data-v9-quick="confirm"` (confirmBookings). INGEN ny handler. N och
   * ready härleds från riktig data; inga kommande tider → disabled (ingen
   * påhittad siffra).
   */
  function renderStickyBarModule(s) {
    s = s || { patientId: '', bookCount: 0, ready: false };
    var pid = esc(s.patientId);
    var ready = s.ready === true;
    var count = Number(s.bookCount) > 0 ? Number(s.bookCount) : 0;

    var bookBtn =
      '<button type="button" class="v12-workspace__primary v12-workspace__sticky-primary' +
      (ready ? '' : ' is-disabled') +
      '" data-kk-ord48-open-calendar data-kk-ord48-cal-footer data-patient-id="' +
      pid +
      '"' +
      (ready ? '' : ' disabled aria-disabled="true"') +
      '>Boka nästa</button>';

    var confirmBtn =
      '<button type="button" class="v12-workspace__sticky-secondary' +
      (count ? '' : ' is-disabled') +
      '" data-v9-quick="confirm"' +
      (count ? '' : ' disabled aria-disabled="true"') +
      '>Bekräfta kommande tider' +
      (count ? ' (' + esc(String(count)) + ')' : '') +
      '</button>';

    var hint = ready
      ? ''
      : '<p class="v12-workspace__sticky-hint">Boka nästa aktiveras när kunden är redo för behandling.</p>';

    return (
      '<section class="v12-workspace__sticky" data-v12-module="sticky" aria-label="Snabbåtgärder">' +
      '<div class="v12-workspace__sticky-actions">' +
      bookBtn +
      confirmBtn +
      '</div>' +
      hint +
      '</section>'
    );
  }

  /**
   * Bilder / före–efter-modul (sektion 7) — kundens foton/media. Återanvänder
   * V11-adaptern buildPhotosFromDriveFiles (driveFiles). Varje bild är en native
   * länk (target=_blank) med `data-photo=<id>` så ev. BEFINTLIG lightbox-handler
   * wire:as — INGEN ny handler. Bilder försöker ladda thumbnail (onerror →
   * fallback-tile, presentationellt); film visar alltid fallback. Före/efter-
   * etikett + datum-koppling saknas i datakällan idag (endast filnamn) →
   * jämförelsevy uppskjuten med dämpad not (ingen fejk; per inventory-spike #3).
   * Tom lista → explicit empty-state.
   */
  function renderPhotosModule(photos) {
    var count = (photos && photos.count) || 0;
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">BILDER · FÖRE–EFTER</div>' +
      (count ? '<span class="v12-workspace__count">' + esc(String(count)) + '</span>' : '') +
      '</header>';

    if (!count) {
      return (
        '<section class="v12-workspace__module v12-workspace__photos" data-v12-module="photos" aria-label="Bilder">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inga bilder ännu</div>' +
        '<div class="v12-workspace__empty-hint">Inga foton eller media registrerade.</div>' +
        '</div></section>'
      );
    }

    var grid =
      '<div class="v12-workspace__photos-grid">' +
      photos.items
        .map(function (it) {
          var kindLabel = it.isImage ? 'Foto' : 'Film';
          var fallback =
            '<span class="v12-workspace__photo-fallback" aria-hidden="true">' +
            '<span class="v12-workspace__photo-fallback-icon">' +
            (it.isImage ? '🖼' : '🎬') +
            '</span><span class="v12-workspace__photo-fallback-label">' +
            kindLabel +
            '</span></span>';
          var thumbInner = it.isImage
            ? '<img class="v12-workspace__photo-img" src="' +
              esc(it.href) +
              '" alt="' +
              esc(it.name) +
              '" loading="lazy" decoding="async"' +
              " onerror=\"this.closest('.v12-workspace__photo').classList.add('is-missing')\" />" +
              fallback
            : fallback;
          return (
            '<a class="v12-workspace__photo' +
            (it.isImage ? '' : ' is-missing') +
            '" href="' +
            esc(it.href) +
            '" target="_blank" rel="noopener"' +
            (it.id ? ' data-photo="' + esc(it.id) + '"' : '') +
            ' title="' +
            esc(it.name) +
            '"><span class="v12-workspace__photo-thumb">' +
            thumbInner +
            '</span><span class="v12-workspace__photo-name">' +
            esc(it.name) +
            '</span></a>'
          );
        })
        .join('') +
      '</div>';

    return (
      '<section class="v12-workspace__module v12-workspace__photos" data-v12-module="photos" aria-label="Bilder">' +
      head +
      grid +
      '<div class="v12-workspace__health-muted">Före/efter-etiketter &amp; jämförelsevy: visas när bild-metadata finns.</div>' +
      '</section>'
    );
  }

  /**
   * Dokument-modul (sektion 9) — offerter + auto-dokument + filer i en sektion.
   * Återanvänder V11-adaptrarna buildOffersFromPayload + buildAutoDocsFromPayload
   * + buildFilesFromDriveFiles (via CcoV9CustomersParity.resolveV11DocumentPayload
   * / driveFiles). Rader bär de BEFINTLIGA `data-v11-doc-*`-attributen (öppnar
   * dokument-/mall-preview — samma handler som legacy dokumentrader, INGEN ny
   * handler; signering-write ingår ej). Filer = native länkar (target=_blank).
   * Tomma listor → explicit empty-state (inga påhittade dokument).
   */
  function renderDocumentsModule(offers, autoDocs, files) {
    var offCount = (offers && offers.count) || 0;
    var autoCount = (autoDocs && autoDocs.count) || 0;
    var fileCount = (files && files.count) || 0;

    function docRow(it, fillerAuto) {
      var previewable = it.previewable === true;
      var meta =
        (it.journeyStep
          ? '<span class="v12-workspace__doc-step">steg ' + esc(it.journeyStep) + '</span>'
          : '') +
        (it.amount ? '<span class="v12-workspace__doc-amount">' + esc(it.amount) + '</span>' : '');
      return (
        '<li class="v12-workspace__doc-item">' +
        '<div class="v12-workspace__doc-row" data-v11-doc-row' +
        (fillerAuto ? ' data-v11-doc-filler="auto"' : '') +
        ' data-v11-doc-registry="' +
        esc(it.registryId) +
        '" data-v11-doc-status="' +
        esc(it.status) +
        '" data-v11-doc-previewable="' +
        (previewable ? '1' : '0') +
        '"' +
        (previewable ? ' role="button" tabindex="0"' : '') +
        '>' +
        (fillerAuto ? '<span class="v12-workspace__doc-icon" aria-hidden="true">📄</span>' : '') +
        '<span class="v12-workspace__doc-main">' +
        '<span class="v12-workspace__doc-title">' +
        esc(it.title) +
        '</span>' +
        (meta ? '<span class="v12-workspace__doc-meta">' + meta + '</span>' : '') +
        '</span>' +
        '<span class="v12-workspace__doc-status" data-state="' +
        esc(it.status) +
        '">' +
        esc(it.statusLabel) +
        '</span>' +
        '</div></li>'
      );
    }

    function emptyState(title, hint) {
      return (
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">' +
        esc(title) +
        '</div><div class="v12-workspace__empty-hint">' +
        esc(hint) +
        '</div></div>'
      );
    }

    var offersBlock =
      '<div class="v12-workspace__subhead">Offerter &amp; behandlingsplaner' +
      (offCount ? ' · ' + esc(String(offCount)) : '') +
      '</div>' +
      (offCount
        ? '<ul class="v12-workspace__doc-list">' +
          offers.items
            .map(function (it) {
              return docRow(it, false);
            })
            .join('') +
          '</ul>'
        : emptyState('Inga offerter ännu', 'Inga offerter eller behandlingsplaner registrerade.'));

    var autoBlock =
      '<div class="v12-workspace__subhead">Auto-dokument' +
      (autoCount ? ' · ' + esc(String(autoCount)) : '') +
      '</div>' +
      (autoCount
        ? '<ul class="v12-workspace__doc-list">' +
          autoDocs.items
            .map(function (it) {
              return docRow(it, true);
            })
            .join('') +
          '</ul>'
        : emptyState('Inga auto-dokument ännu', 'Inga auto-genererade dokument registrerade.'));

    var filesBlock =
      '<div class="v12-workspace__subhead">Filer' +
      (fileCount ? ' · ' + esc(String(fileCount)) : '') +
      '</div>' +
      (fileCount
        ? '<ul class="v12-workspace__doc-list">' +
          files.items
            .map(function (it) {
              return (
                '<li class="v12-workspace__doc-item">' +
                '<a class="v12-workspace__doc-row v12-workspace__doc-file" href="' +
                esc(it.href) +
                '" target="_blank" rel="noopener"' +
                (it.id ? ' data-file-id="' + esc(it.id) + '"' : '') +
                ' title="' +
                esc(it.name) +
                '"><span class="v12-workspace__doc-icon" aria-hidden="true">📄</span>' +
                '<span class="v12-workspace__doc-main"><span class="v12-workspace__doc-title">' +
                esc(it.name) +
                '</span></span>' +
                (it.badge
                  ? '<span class="v12-workspace__doc-badge">' + esc(it.badge) + '</span>'
                  : '') +
                '</a></li>'
              );
            })
            .join('') +
          '</ul>'
        : emptyState('Inga filer ännu', 'Inga dokumentfiler registrerade.'));

    var total = offCount + autoCount + fileCount;
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">DOKUMENT</div>' +
      (total ? '<span class="v12-workspace__count">' + esc(String(total)) + '</span>' : '') +
      '</header>';

    return (
      '<section class="v12-workspace__module v12-workspace__documents" data-v12-module="documents" aria-label="Dokument">' +
      head +
      offersBlock +
      autoBlock +
      filesBlock +
      '</section>'
    );
  }

  /**
   * Kommunikation-modul (sektion 10) — mejl/SMS/samtalslogg + svarstudio.
   * Återanvänder V11-adaptern buildCommunicationFromState (occasionTimeline +
   * fallback senaste kontaktväg). "Svarstudio" bär det BEFINTLIGA
   * `data-v9-quick="reply"` (openReply) — INGEN ny handler. Avsändaridentitet,
   * meddelande-snippet och läst-status saknas i datakällan idag → uppskjutet
   * med dämpad not (ingen fejk; per inventory). Tom lista → explicit empty-state.
   */
  function renderCommunicationModule(comm) {
    var count = (comm && comm.count) || 0;
    var icons = { mail: '✉', sms: '💬', call: '📞' };
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">KOMMUNIKATION</div>' +
      (count ? '<span class="v12-workspace__count">' + esc(String(count)) + '</span>' : '') +
      '</header>';

    if (!count) {
      return (
        '<section class="v12-workspace__module v12-workspace__comm" data-v12-module="communication" aria-label="Kommunikation">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Ingen kommunikation</div>' +
        '<div class="v12-workspace__empty-hint">Ingen registrerad kommunikation.</div>' +
        '</div></section>'
      );
    }

    var list =
      '<ul class="v12-workspace__comm-list">' +
      comm.items
        .map(function (it) {
          var icon = icons[it.type] || '•';
          return (
            '<li class="v12-workspace__comm-item" data-type="' +
            esc(it.type) +
            '"><span class="v12-workspace__comm-icon" aria-hidden="true">' +
            icon +
            '</span><span class="v12-workspace__comm-main">' +
            '<span class="v12-workspace__comm-text">' +
            esc(it.text) +
            '</span>' +
            (it.meta ? '<span class="v12-workspace__comm-meta">' + esc(it.meta) + '</span>' : '') +
            '</span></li>'
          );
        })
        .join('') +
      '</ul>';

    return (
      '<section class="v12-workspace__module v12-workspace__comm" data-v12-module="communication" aria-label="Kommunikation">' +
      head +
      list +
      '<div class="v12-workspace__comm-actions">' +
      '<button type="button" class="v12-workspace__primary" data-v9-quick="reply">✉ Svarstudio</button>' +
      '</div>' +
      '<div class="v12-workspace__health-muted">Avsändare, meddelande-utdrag &amp; läst-status: visas när data finns.</div>' +
      '</section>'
    );
  }

  /**
   * Ekonomi-modul (sektion 11) — nyckeltal (intäkt/utestående/snitt/LTV).
   * Återanvänder V11-adaptern buildEconomyFromCard (parity.buildEconomyFields +
   * fallback). Display-only — ingen handler (som legacy). Fakturor/betalstatus,
   * skuld-breakdown och rabatter saknas i datakällan idag → uppskjutet med dämpad
   * not (ingen fejk; per inventory-spike #3). Ingen ekonomidata → explicit
   * empty-state.
   */
  function renderEconomyModule(econ, invoices) {
    var count = (econ && econ.count) || 0;
    var invoiceCount = (invoices && invoices.count) || 0;
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">EKONOMI</div>' +
      '</header>';

    if (!count && !invoiceCount) {
      return (
        '<section class="v12-workspace__module v12-workspace__econ" data-v12-module="economy" aria-label="Ekonomi">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Ingen ekonomidata</div>' +
        '<div class="v12-workspace__empty-hint">Inga ekonomi-nyckeltal registrerade.</div>' +
        '</div></section>'
      );
    }

    var grid = count
      ? '<div class="v12-workspace__econ-grid">' +
        econ.items
          .map(function (it) {
            return (
              '<div class="v12-workspace__econ-cell">' +
              '<div class="v12-workspace__econ-label">' +
              esc(it.label) +
              '</div><div class="v12-workspace__econ-value">' +
              esc(it.value) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '';

    // Fakturarader/betalstatus ur RIKTIG paymentHistory (Fortnox + Swish).
    var invoiceBlock = invoiceCount
      ? '<div class="v12-workspace__subhead">Fakturor &amp; betalningar</div>' +
        '<div class="v12-workspace__econ-invoices">' +
        invoices.rows
          .map(function (r) {
            return (
              '<div class="v12-workspace__econ-invoice" data-status="' +
              esc(r.status) +
              '">' +
              '<div class="v12-workspace__econ-invoice-main">' +
              '<div class="v12-workspace__econ-invoice-title">' +
              esc(r.title) +
              '</div>' +
              '<div class="v12-workspace__econ-invoice-date">' +
              esc(r.date) +
              '</div></div>' +
              '<div class="v12-workspace__econ-invoice-amount">' +
              esc(r.amount) +
              '</div>' +
              '<div class="v12-workspace__econ-invoice-status" data-status="' +
              esc(r.status) +
              '">' +
              esc(r.statusLabel) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '';

    return (
      '<section class="v12-workspace__module v12-workspace__econ" data-v12-module="economy" aria-label="Ekonomi">' +
      head +
      grid +
      invoiceBlock +
      '<div class="v12-workspace__health-muted">Skuld-breakdown och rabatter: visas när data finns.</div>' +
      '</section>'
    );
  }

  function render(ctx) {
    ctx = ctx || {};
    var profile = null;
    var stats = null;
    try {
      if (global.CcoV11RailAdapters) {
        if (typeof global.CcoV11RailAdapters.buildProfileFromBcard === 'function') {
          profile = global.CcoV11RailAdapters.buildProfileFromBcard(ctx.bcard || ctx.card) || null;
        }
        if (typeof global.CcoV11RailAdapters.buildStatsFromExtras === 'function') {
          stats = global.CcoV11RailAdapters.buildStatsFromExtras(ctx.bcard || ctx.card) || null;
        }
      }
    } catch (_error) {
      profile = null;
      stats = null;
    }
    // Status härleds endast från riktig data (readyForTreatment). Saknas fältet
    // → ingen påhittad status (null).
    var status = null;
    var srcCard = ctx.card || ctx.bcard || {};
    if (srcCard.readyForTreatment === true) {
      status = { label: 'Redo för behandling', tone: 'ready' };
    } else if (srcCard.readyForTreatment === false) {
      status = { label: 'Ej redo', tone: 'blocked' };
    }

    var av = null;
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildActiveVisitFromBundle === 'function'
      ) {
        av = global.CcoV11RailAdapters.buildActiveVisitFromBundle(ctx.dossierBundle) || null;
      }
    } catch (_error) {
      av = null;
    }
    var warnings = [];
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildCriticalWarnings === 'function'
      ) {
        warnings =
          global.CcoV11RailAdapters.buildCriticalWarnings(
            ctx.card,
            ctx.journalEntries,
            ctx.dossierBundle
          ) || [];
      }
    } catch (_error) {
      warnings = [];
    }
    var health = null;
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildHealthPreview === 'function'
      ) {
        health = global.CcoV11RailAdapters.buildHealthPreview(ctx.bcard || ctx.card) || null;
      }
    } catch (_error) {
      health = null;
    }
    var journey = null;
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildJourneyFromState === 'function'
      ) {
        journey =
          global.CcoV11RailAdapters.buildJourneyFromState(
            ctx.card,
            ctx.journalEntries,
            ctx.dossierBundle
          ) || null;
      }
    } catch (_error) {
      journey = null;
    }
    var journal = { items: [], count: 0 };
    try {
      if (
        global.CcoV12WorkspaceAdapters &&
        typeof global.CcoV12WorkspaceAdapters.buildJournalModule === 'function'
      ) {
        journal = global.CcoV12WorkspaceAdapters.buildJournalModule(ctx.journalEntries) || journal;
      }
    } catch (_error) {
      journal = { items: [], count: 0 };
    }
    var photos = { items: [], count: 0 };
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildPhotosFromDriveFiles === 'function'
      ) {
        photos = global.CcoV11RailAdapters.buildPhotosFromDriveFiles(ctx.driveFiles) || photos;
      }
    } catch (_error) {
      photos = { items: [], count: 0 };
    }
    var bookings = { items: [], count: 0 };
    var history = { items: [], count: 0 };
    try {
      if (global.CcoV11RailAdapters) {
        if (typeof global.CcoV11RailAdapters.buildBookingsFromExtras === 'function') {
          bookings =
            global.CcoV11RailAdapters.buildBookingsFromExtras(
              ctx.card,
              ctx.bcard,
              ctx.dossierBundle,
              ctx.occasionTimeline
            ) || bookings;
        }
        if (typeof global.CcoV11RailAdapters.buildHistoryFromExtras === 'function') {
          history =
            global.CcoV11RailAdapters.buildHistoryFromExtras(
              ctx.card,
              ctx.bcard,
              ctx.dossierBundle,
              ctx.occasionTimeline
            ) || history;
        }
      }
    } catch (_error) {
      bookings = { items: [], count: 0 };
      history = { items: [], count: 0 };
    }
    var offers = { items: [], count: 0 };
    var autoDocs = { items: [], count: 0 };
    var files = { items: [], count: 0 };
    try {
      if (global.CcoV11RailAdapters) {
        if (typeof global.CcoV11RailAdapters.buildOffersFromPayload === 'function') {
          offers =
            global.CcoV11RailAdapters.buildOffersFromPayload(ctx.card, ctx.dossierBundle) || offers;
        }
        if (typeof global.CcoV11RailAdapters.buildAutoDocsFromPayload === 'function') {
          autoDocs =
            global.CcoV11RailAdapters.buildAutoDocsFromPayload(ctx.card, ctx.dossierBundle) ||
            autoDocs;
        }
        if (typeof global.CcoV11RailAdapters.buildFilesFromDriveFiles === 'function') {
          files = global.CcoV11RailAdapters.buildFilesFromDriveFiles(ctx.driveFiles) || files;
        }
      }
    } catch (_error) {
      offers = { items: [], count: 0 };
      autoDocs = { items: [], count: 0 };
      files = { items: [], count: 0 };
    }
    var comm = { items: [], count: 0 };
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildCommunicationFromState === 'function'
      ) {
        comm =
          global.CcoV11RailAdapters.buildCommunicationFromState(ctx.card, ctx.occasionTimeline) ||
          comm;
      }
    } catch (_error) {
      comm = { items: [], count: 0 };
    }
    var econ = { items: [], count: 0 };
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildEconomyFromCard === 'function'
      ) {
        econ = global.CcoV11RailAdapters.buildEconomyFromCard(ctx.bcard || ctx.card) || econ;
      }
    } catch (_error) {
      econ = { items: [], count: 0 };
    }
    // Fakturarader/betalstatus ur dossier-bundlens RIKTIGA paymentHistory
    // (Fortnox + Swish). Display-only; tom lista → renderaren visar dämpad not.
    var econInvoices = { rows: [], count: 0 };
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildEconomyInvoices === 'function'
      ) {
        var paymentHistory = ctx.dossierBundle && ctx.dossierBundle.paymentHistory;
        econInvoices =
          global.CcoV11RailAdapters.buildEconomyInvoices(paymentHistory) || econInvoices;
      }
    } catch (_error) {
      econInvoices = { rows: [], count: 0 };
    }
    var nextStep = null;
    var insights = { items: [], count: 0 };
    try {
      if (global.CcoV11RailAdapters) {
        if (typeof global.CcoV11RailAdapters.buildSmartNextStep === 'function') {
          nextStep = global.CcoV11RailAdapters.buildSmartNextStep(ctx.card) || null;
        }
        if (typeof global.CcoV11RailAdapters.buildInsightsFromSignals === 'function') {
          insights = global.CcoV11RailAdapters.buildInsightsFromSignals(ctx.card) || insights;
        }
      }
    } catch (_error) {
      nextStep = null;
      insights = { items: [], count: 0 };
    }
    var sticky = null;
    try {
      if (
        global.CcoV11RailAdapters &&
        typeof global.CcoV11RailAdapters.buildStickyActions === 'function'
      ) {
        sticky =
          global.CcoV11RailAdapters.buildStickyActions(
            ctx.card,
            ctx.bcard,
            ctx.dossierBundle,
            ctx.occasionTimeline
          ) || null;
      }
    } catch (_error) {
      sticky = null;
    }

    return (
      '<div class="v12-workspace__inner" data-v12-workspace-inner="1">' +
      '<div class="v12-workspace__zone-label" aria-hidden="true">Zon 2 · Arbetsyta</div>' +
      renderCurrentStateModule(profile, stats, status) +
      renderActiveVisitModule(av) +
      renderCriticalWarningsModule(warnings) +
      renderHealthModule(health) +
      renderJourneyModule(journey) +
      renderJournalModule(journal) +
      renderPhotosModule(photos) +
      renderBookingsModule(bookings, history) +
      renderDocumentsModule(offers, autoDocs, files) +
      renderCommunicationModule(comm) +
      renderEconomyModule(econ, econInvoices) +
      renderInsightsModule(nextStep, insights) +
      renderStickyBarModule(sticky) +
      '</div>'
    );
  }

  global.CcoV12Workspace = {
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
