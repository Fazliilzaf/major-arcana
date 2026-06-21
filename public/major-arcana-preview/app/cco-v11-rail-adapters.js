/**
 * V11-RAIL Fas 3 — data-adapter-lager.
 *
 * Per canon §5: varje sektion får en egen data-adapter som exponerar ett
 * rent input/output-kontrakt mellan live-datakällor (bcard, extras,
 * gateSignals, bookings ...) och renderaren i cco-v11-rail.js.
 *
 * Block 1: A Profile (buildProfileFromBcard).
 * Block 2: B Smart information (buildSmartInfoFromSignals).
 * Block 3: C Stats (buildStatsFromExtras).
 * Block 4: V Active Visit (buildActiveVisitFromBundle).
 * Block 5: D Critical warnings (buildCriticalWarnings).
 */
(function (global) {
  'use strict';

  function toArray(x) {
    return Array.isArray(x) ? x : x ? [x] : [];
  }

  function text(v) {
    if (v == null) return '';
    return typeof v === 'string' ? v.trim() : String(v);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(name) {
    var p = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ((p[0] || '')[0] || '?') + ((p[1] || '')[0] || '');
  }

  /**
   * Konsekvent empty-state-markup för en sektion (canon §5:
   * "Missing data produces an explicit empty state, not a layout compromise").
   * section/hint escapas alltid — det är en gemensam helper som kan få riktig
   * data senare och får aldrig kunna injicera HTML.
   */
  function v11RailEmpty(section, hint) {
    var label = esc(section ? String(section) : 'Sektion');
    var sub = hint ? '<div class="v11-rail__empty-hint">' + esc(hint) + '</div>' : '';
    return (
      '<div class="v11-rail__empty" role="status" data-v11-rail-section="' +
      label +
      '">' +
      '<div class="v11-rail__empty-title">Ingen data</div>' +
      sub +
      '</div>'
    );
  }

  /**
   * A · Profile — bygger profil-data från bcard (Pipedrive person/org-dossier
   * mergad med card). Returnerar ren data; renderaren escapar/HTML-ar.
   *
   * Pills byggs ENDAST från riktiga fält (canon §6 A: "if tags are missing,
   * show no fake pills"). Inga platshållar-pills.
   *
   * @param {object} bcard
   * @returns {{name:string, initials:string, phone:string, email:string,
   *            addrLine:string, pills:Array<{label:string,tone:string}>}}
   */
  function buildProfileFromBcard(bcard) {
    bcard = bcard || {};
    var name = text(bcard.displayName) || text(bcard.name) || text(bcard.fullName) || 'Kund';
    var phone = text(bcard.primaryPhone) || text(bcard.contact && bcard.contact.phone);
    var email = text(bcard.primaryEmail) || text(bcard.contact && bcard.contact.email);
    var addr = bcard.contact && bcard.contact.address;
    var addrLine = addr
      ? [text(addr.street), [text(addr.zip), text(addr.city)].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
      : '';

    var pills = [];
    if (bcard.vip || (bcard.tags && bcard.tags.vip)) {
      pills.push({ label: 'VIP', tone: 'vip' });
    }
    toArray(bcard.treatmentTypes).forEach(function (t) {
      var label = text(t);
      if (label) pills.push({ label: label, tone: 'treatment' });
    });
    // Fri-form etiketter om de finns som sträng-array (riktig data, ej fejk).
    toArray(bcard.tags && bcard.tags.labels).forEach(function (t) {
      var label = text(t);
      if (label) pills.push({ label: label, tone: 'label' });
    });

    return {
      name: name,
      initials: initials(name),
      phone: phone,
      email: email,
      addrLine: addrLine,
      pills: pills,
    };
  }

  /**
   * B · Smart information — bygger en sammanfattning från kundens
   * automation-signaler via logik-lagret CcoKunderSmartNextStep (canon §6 B:
   * "one clear primary signal plus concise supporting metadata").
   *
   * Endast riktig data: topp-aktiv signal (what/why/next) eller, om ingen
   * aktiv signal finns, en meningsfull step-label. Returnerar null när inget
   * finns → renderaren visar explicit empty-state (ingen fejk).
   *
   * @param {object} card - kund-readout med automationSignals/automationTop
   * @returns {null|{primary:string, why:string, next:string,
   *                  approvalRequired:boolean, confidence:string, moreCount:number}}
   */
  function buildSmartInfoFromSignals(card) {
    card = card || {};
    var mod = global.CcoKunderSmartNextStep;
    var raw = toArray(card.automationSignals);
    var signals = mod && typeof mod.sortSignals === 'function' ? mod.sortSignals(raw) : raw;
    var active = signals.filter(function (s) {
      return s && s.status === 'active';
    });
    var top = active[0] || null;

    if (top && text(top.what)) {
      return {
        primary: text(top.what),
        why: text(top.why),
        next: text(top.next),
        approvalRequired: !!top.humanApprovalRequired,
        confidence: text(top.confidence),
        moreCount: Math.max(0, active.length - 1),
      };
    }

    var label =
      mod && typeof mod.listStepLabel === 'function'
        ? mod.listStepLabel(card)
        : text(card.nextStep) || text(card.nextRequirement);
    label = text(label);
    if (label && label !== '—') {
      return {
        primary: label,
        why: '',
        next: '',
        approvalRequired: false,
        confidence: '',
        moreCount: 0,
      };
    }
    return null;
  }

  /**
   * C · Stats — tre nyckeltal: BESÖK, VÄRDE TOT, SKULD (canon §6 C).
   *
   * - BESÖK: visits/visitCount/stats.visits.
   * - VÄRDE TOT: nuvarande revenue/LTV-logik (lifetimeValueLabel →
   *   lifetimeValue/dealValue/pipedriveDealValue → stats.revenue).
   * - SKULD: outstandingBalance (debt/öppna fakturor) OM data finns. Saknas
   *   fältet helt → explicit unknown-state ('—', 'okänd'); ingen fejkad skuld.
   *   '0 kr'/0 är riktig data = ingen skuld.
   *
   * @param {object} bcard
   * @returns {{besok:{value:string,sub:string},
   *            vardeTot:{value:string,sub:string},
   *            skuld:{value:string,sub:string,unknown:boolean,hasDebt:boolean}}}
   */
  function buildStatsFromExtras(bcard) {
    bcard = bcard || {};
    var stats = bcard.stats || {};

    // BESÖK
    var visits = bcard.visits != null ? bcard.visits : bcard.visitCount;
    if (visits == null) visits = stats.visits;
    var besok = {
      value: visits != null ? String(visits) : '—',
      sub: visits != null ? 'totalt' : 'inga än',
    };

    // VÄRDE TOT (revenue/LTV)
    var ltvRaw = bcard.lifetimeValue != null ? bcard.lifetimeValue : bcard.dealValue;
    if (ltvRaw == null) ltvRaw = bcard.pipedriveDealValue;
    var ltvNum = Number(ltvRaw);
    var revenue =
      text(bcard.lifetimeValueLabel) ||
      (Number.isFinite(ltvNum) && ltvNum > 0 ? ltvNum.toLocaleString('sv-SE') + ' kr' : '') ||
      text(stats.revenue);
    var vardeTot = {
      value: revenue || '—',
      sub: revenue ? 'LTV' : 'okänt',
    };

    // SKULD (debt / öppna fakturor) — ingen fejk vid saknad data
    var rawDebt = bcard.outstandingBalance;
    var skuld;
    if (rawDebt == null || text(rawDebt) === '') {
      skuld = { value: '—', sub: 'okänd', unknown: true, hasDebt: false };
    } else {
      var debtStr = text(rawDebt);
      var debtNum = Number(
        String(debtStr)
          .replace(/[^\d.,-]/g, '')
          .replace(/\s/g, '')
          .replace(',', '.')
      );
      var isZero = debtStr === '0 kr' || debtNum === 0;
      skuld = {
        value: debtStr,
        sub: isZero ? 'ingen skuld' : 'utestående',
        unknown: false,
        hasDebt: Number.isFinite(debtNum) && debtNum > 0,
      };
    }

    return { besok: besok, vardeTot: vardeTot, skuld: skuld };
  }

  var ACTIVE_VISIT_STATES = ['scheduled_today', 'checked_in', 'in_progress', 'completed_today'];

  function avTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function avMinutesSince(iso) {
    var ms = Date.parse(String(iso || ''));
    if (!Number.isFinite(ms)) return '';
    var mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return mins < 1 ? 'nyss' : mins + ' min sedan check-in';
  }

  /**
   * V · Active Visit — bygger hero-data från dossierBundle.activeVisit
   * (data-contract LÅST 2026-06-21). Self-contained: speglar det dokumenterade
   * state→presentation-kontraktet utan beroende på CcoV9CustomersParity-interna
   * funktioner (canon §5). Behåller CTA-actions (checkin/journal/complete/
   * followup) så den BEFINTLIGA handlern wire:ar dem.
   *
   * Returnerar null när inget aktivt besök är synligt (V utelämnas — besök
   * saknas är normalt, ej empty-state).
   *
   * @param {object} dossierBundle
   * @returns {null|object} ren hero-data (inga klasser)
   */
  function buildActiveVisitFromBundle(dossierBundle) {
    var visit =
      dossierBundle && dossierBundle.activeVisit && dossierBundle.activeVisit.visible === true
        ? dossierBundle.activeVisit
        : null;
    if (!visit) return null;

    var state =
      ACTIVE_VISIT_STATES.indexOf(String(visit.state || '')) >= 0
        ? String(visit.state)
        : 'scheduled_today';

    var startsTime = avTime(visit.startsAt);
    var checkedInTime = avTime(visit.checkedInAt);
    var completedTime = avTime(visit.completedAt || visit.startedAt);
    var journalLabel = visit.journalStarted ? 'Fortsätt journal' : 'Starta journal';

    var kicker = {
      scheduled_today: 'Nytt besök · idag',
      checked_in: 'Incheckad',
      in_progress: 'Pågår',
      completed_today: completedTime ? 'Besök avslutat ' + completedTime : 'Besök avslutat',
    }[state];

    var statusLine = {
      scheduled_today: 'Väntar incheckning',
      checked_in: 'Redo att starta',
      in_progress: 'Behandling pågår',
      completed_today: 'Klart för idag',
    }[state];

    var headMeta = {
      scheduled_today: startsTime ? 'Kl ' + startsTime : '',
      checked_in: checkedInTime ? 'Incheckad ' + checkedInTime : '',
      in_progress:
        avMinutesSince(visit.checkedInAt || visit.startedAt) ||
        (checkedInTime ? 'Incheckad ' + checkedInTime : ''),
      completed_today: completedTime ? 'Avslutat ' + completedTime : '',
    }[state];

    var primary = {
      scheduled_today: { action: 'checkin', label: 'Checka in' },
      checked_in: { action: 'journal', label: journalLabel },
      in_progress: { action: 'journal', label: journalLabel },
      completed_today: { action: 'followup', label: 'Boka uppföljning' },
    }[state];

    var secondary = {
      scheduled_today: { action: 'journal', label: journalLabel },
      checked_in: null,
      in_progress: { action: 'complete', label: 'Avsluta besök' },
      completed_today: { action: 'journal', label: 'Visa journal' },
    }[state];

    return {
      state: state,
      kicker: kicker,
      statusLine: statusLine,
      headMeta: headMeta,
      showTimeline: state !== 'scheduled_today',
      preflightCompact: state === 'completed_today',
      primary: primary,
      secondary: secondary,
      journalDetail: text(visit.serviceLabel),
      title: text(visit.serviceLabel) || 'Besök idag',
      practitioner: text(visit.practitionerLabel),
      checkedInAt: text(visit.checkedInAt),
      startedAt: text(visit.startedAt),
      completedAt: text(visit.completedAt),
      blockers: toArray(visit.blockers),
      photoDisabled: visit.photoCaptureAvailable === false,
      notesDisabled: visit.notesAvailable === false,
    };
  }

  // D · Critical warnings — blocker/legal-gates (cooling_off=info exkluderas).
  // Etiketter speglar CcoKundkortKkx SIGNAL_BLURBS; fallback om signal saknar risk.
  var CRITICAL_BY_RULE = {
    missing_health_declaration: { what: 'Hälsodeklaration saknas', legal: false },
    missing_journal: { what: 'Journal saknas', legal: false },
    missing_treatment_plan: { what: 'Behandlingsplan/offert saknas', legal: false },
    missing_agreement_consent_bundle: { what: 'Avtal + samtycke saknas', legal: true },
    missing_operation_day_insurance: { what: 'Friskförsäkran saknas', legal: false },
    missing_photo_consent: { what: 'Foto-samtycke saknas', legal: true },
  };

  function criticalRuleKey(ruleId) {
    var id = String(ruleId || '').replace(/^customer\./, '');
    return CRITICAL_BY_RULE[id] ? id : '';
  }

  /**
   * D · Critical warnings — kritiska blocker-/legal-gates som röda top-banners
   * (canon §6 D). Datakälla: CcoKundkortKkx.resolvePanelSignals (canonical
   * logik-lager), fallback card.automationSignals. Kritisk = aktiv signal med
   * risk blocker/legal_blocker/legal (eller, om risk saknas, ruleId i
   * blocker-allowlist). info-signaler (t.ex. betänketid) exkluderas.
   *
   * Returnerar [] när inga kritiska varningar → D utelämnas (ingen tom banner).
   *
   * @returns {Array<{ruleId:string, what:string, why:string, legal:boolean}>}
   */
  function buildCriticalWarnings(card, journalEntries, dossierBundle) {
    var kkx = global.CcoKundkortKkx;
    var signals =
      kkx && typeof kkx.resolvePanelSignals === 'function'
        ? toArray(kkx.resolvePanelSignals(card || {}, journalEntries, dossierBundle, {}))
        : toArray(card && card.automationSignals);

    var out = [];
    signals.forEach(function (s) {
      if (!s || s.status !== 'active') return;
      var risk = String(s.risk || '');
      var key = criticalRuleKey(s.ruleId);
      var isCritical = risk ? /blocker|legal/i.test(risk) : !!key;
      if (!isCritical) return;
      var def = key ? CRITICAL_BY_RULE[key] : null;
      out.push({
        ruleId: text(s.ruleId),
        what: text(s.what) || (def && def.what) || 'Kritisk varning',
        why: text(s.why),
        legal: /legal/i.test(risk) || !!(def && def.legal),
      });
    });
    return out;
  }

  global.CcoV11RailAdapters = {
    v11RailEmpty: v11RailEmpty,
    buildProfileFromBcard: buildProfileFromBcard,
    buildSmartInfoFromSignals: buildSmartInfoFromSignals,
    buildStatsFromExtras: buildStatsFromExtras,
    buildActiveVisitFromBundle: buildActiveVisitFromBundle,
    buildCriticalWarnings: buildCriticalWarnings,
    // Block 6+ section adapters registreras här.
  };
})(typeof window !== 'undefined' ? window : global);
