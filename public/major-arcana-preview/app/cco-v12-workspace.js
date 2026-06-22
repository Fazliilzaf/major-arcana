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
    var st = avFmtTime(av.startedAt || av.checkedInAt);
    var co = avFmtTime(av.completedAt);
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
      ? '<div class="v12-workspace__av-timeline" aria-label="Besöksförlopp">' +
        nodes
          .map(function (n) {
            return (
              '<div class="v12-workspace__av-node ' +
              nodeState(n.phase) +
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

  function render(ctx) {
    ctx = ctx || {};
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

    return (
      '<div class="v12-workspace__inner" data-v12-workspace-inner="1">' +
      '<div class="v12-workspace__zone-label" aria-hidden="true">Zon 2 · Arbetsyta</div>' +
      renderActiveVisitModule(av) +
      renderCriticalWarningsModule(warnings) +
      renderJournalModule(journal) +
      renderBookingsModule(bookings, history) +
      '</div>'
    );
  }

  global.CcoV12Workspace = {
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
