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
 * Block 6: E Health Declaration preview (buildHealthPreview).
 * Block 7: F Customer Journey (buildJourneyFromState).
 * Block 8: G Smart Next Step (buildSmartNextStep).
 * Block 9: S Sticky Footer (buildStickyActions).
 * Block 10: H Bookings — KEEP (buildBookingsFromExtras).
 * Block 11: I History — KEEP (buildHistoryFromExtras).
 * Block 12: J Journals — KEEP (buildJournalsFromEntries).
 * Block 13: K Offers — KEEP (buildOffersFromPayload).
 * Block 14: L Auto-documents — KEEP (buildAutoDocsFromPayload).
 * Block 15: M Photos — KEEP (buildPhotosFromDriveFiles).
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

  /**
   * E · Health Declaration (preview) — summerar HD-status (canon §6 E:
   * "top expandable preview"). Duplicerar INTE workflow; deep-link till HÄLSA
   * (data-kk-jump="kk-card-halsa") öppnar full HÄLSA-arbetsyta i Zon 2.
   *
   * Status från riktig data: signerad (hd.signedAt/signed eller
   * hasHealthDeclaration / missingHealthDeclaration===false), saknas
   * (missingHealthDeclaration===true), annars okänd. Ingen fejk.
   *
   * @param {object} bcard
   * @returns {{status:'signed'|'missing'|'unknown', signedAt:string,
   *            source:string, allergies:string[]}}
   */
  function buildHealthPreview(bcard) {
    bcard = bcard || {};
    var hd = bcard.healthDeclaration || null;

    var signedSignal =
      (hd && (hd.signedAt || hd.signed)) ||
      bcard.hasHealthDeclaration === true ||
      bcard.missingHealthDeclaration === false;
    var missingSignal = bcard.missingHealthDeclaration === true;
    var status = signedSignal ? 'signed' : missingSignal ? 'missing' : 'unknown';

    var srcRaw = text((hd && (hd.sourceSystem || hd.source)) || bcard.healthDeclarationSource);
    var source = /halso|m365/i.test(srcRaw) ? 'halso@' : '';

    var allergies = toArray(bcard.allergies).length
      ? toArray(bcard.allergies)
      : toArray(hd && hd.allergies);
    allergies = allergies.map(text).filter(Boolean);

    return {
      status: status,
      signedAt: hd ? text(hd.signedAt) : '',
      source: source,
      allergies: allergies,
    };
  }

  // F · Customer Journey — bevarad stepJumpSlug/stepMedFormSlug-mappning
  // (ORD47_V1=true-grenen), replikerad så data-kk-jump/data-kk-med-form matchar
  // legacy exakt (workflow-betydelse oförändrad).
  function journeyJumpSlug(label) {
    var l = String(label || '').toLowerCase();
    if (/hälsodek|halsodek|konsultation/.test(l)) return 'kk-card-halsa';
    if (/offert|behandlingsplan/.test(l)) return 'kk-card-behandling';
    if (/betänketid|betanketid|avtal|samtycke|ånger|anger/.test(l)) return 'kk-card-juridik';
    if (/friskförs|friskfors|operation|op-dag/.test(l)) return 'kk-card-operation';
    if (/foto/.test(l)) return 'kk-card-foto';
    if (/bokning|bekräftelse|bekraftelse/.test(l)) return 'kk-card-bokning';
    if (/uppfölj|uppfolj|efterkontroll/.test(l)) return 'kk-card-uppfoljning';
    return '';
  }
  function journeyMedFormSlug(label) {
    var l = String(label || '').toLowerCase();
    if (/hälsodek|halsodek/.test(l)) return 'health_declaration';
    if (/friskförs|friskfors/.test(l)) return 'fitness_certificate';
    return '';
  }

  /**
   * F · Customer Journey — V11 visuell stepper ovanpå BEFINTLIG journey-logik
   * (canon §6 F). Återanvänder CcoKundkortKkx.buildCanonicalJourneyLive (samma
   * källa som legacy groupedSteps) → bevarar den kanoniska 9-stegsmeningen och
   * workflow-betydelsen. Endast presentation; jump/med-form-mappningen behålls.
   *
   * Returnerar null när journey-logiken saknas (F utelämnas).
   *
   * @returns {null|{steps:Array, cur:number|null, total:number, pct:number, nextLabel:string}}
   */
  function buildJourneyFromState(card, journalEntries, dossierBundle) {
    var kkx = global.CcoKundkortKkx;
    if (!kkx || typeof kkx.buildCanonicalJourneyLive !== 'function') return null;
    var j = kkx.buildCanonicalJourneyLive(card || {}, journalEntries, dossierBundle, {});
    if (!j || !j.steps || !j.steps.length) return null;

    var steps = j.steps.map(function (s) {
      var state =
        s.status === 'done'
          ? 'done'
          : s.status === 'active'
            ? 'active'
            : s.status === 'neutral'
              ? 'neutral'
              : 'todo';
      return {
        id: s.step,
        label: text(s.label),
        note: text(s.meta),
        state: state,
        jump: journeyJumpSlug(s.label),
        medForm: journeyMedFormSlug(s.label),
      };
    });
    var doneCount = steps.filter(function (s) {
      return s.state === 'done';
    }).length;
    var total = steps.length;

    return {
      steps: steps,
      cur: j.activeStep || null,
      total: total,
      pct: total ? Math.round((doneCount / total) * 100) : 0,
      nextLabel: text(j.nextLabel),
    };
  }

  /**
   * G · Smart Next Step — fokuserat rekommendationskort med EN primär CTA
   * (canon §6 G). Top-aktiv signal via logik-lagret CcoKunderSmartNextStep
   * (sortSignals); CTA-etikett från exporterade SIGNAL_ACTIONS. CTA:n
   * återanvänder den BEFINTLIGA globala kk-sig-handlern (data-kk-sig) — ingen
   * ny handler. "Granska utkast" behålls som nåbar sekundär (samma handler).
   *
   * Returnerar null när ingen aktiv signal finns (G utelämnas).
   *
   * @returns {null|{ruleId,what,why,tone,ctaLabel,patientId}}
   */
  function buildSmartNextStep(card) {
    card = card || {};
    var mod = global.CcoKunderSmartNextStep;
    if (!mod || typeof mod.sortSignals !== 'function') return null;
    var signals = mod.sortSignals(toArray(card.automationSignals));
    var active = signals.filter(function (s) {
      return s && s.status === 'active';
    });
    var top = active[0] || null;
    if (!top || !text(top.what)) return null;

    var actions = mod.SIGNAL_ACTIONS || {};
    var act = actions[String(top.ruleId || '')] || {};
    var risk = String(top.risk || '');

    return {
      ruleId: text(top.ruleId),
      what: text(top.what),
      why: text(top.why) || text(top.next),
      tone: /block|legal/i.test(risk) ? 'Blockerare' : 'Föreslaget',
      ctaLabel: text(act.buttonLabel) || 'Granska & åtgärda',
      patientId: text(card.patientId || card.id || card.customerId),
    };
  }

  /**
   * S · Sticky Footer — persistent åtgärdsrad (canon §6 S). Två livscykel-
   * actions med riktig data:
   *
   *  - "Boka nästa" (primär): återanvänder den BEFINTLIGA dokument-delegerade
   *    ord48-kalenderhandlern via data-kk-ord48-open-calendar (ingen ny
   *    handler). Aktiv endast när kunden är redo för behandling — speglar det
   *    primära villkoret i legacy resolveOrd48ReadyState (card.readyForTreatment
   *    === true). Inte redo → disabled + förklarande text (ingen fejkad CTA).
   *
   *  - "Bekräfta kommande tider (N)": N hämtas från det EXPORTERADE booking-
   *    lagret (CcoKundkortKkx.resolveReferensBookingExtras → upcomingBooking-
   *    Count). Inga kommande tider → disabled, ingen påhittad siffra.
   *
   * Returnerar alltid ett objekt (footern är den persistenta åtgärdsraden och
   * renderas alltid när rail-innehåll finns).
   *
   * @returns {{patientId:string, bookCount:number, ready:boolean}}
   */
  function buildStickyActions(card, bcard, dossierBundle, occasionTimeline) {
    card = card || {};
    bcard = bcard || {};
    var pid = text(card.patientId || card.id || bcard.patientId || bcard.id || card.customerId);

    // N kommande bokningar — återanvänd det exporterade referens-booking-lagret.
    var bookCount = 0;
    var kkx = global.CcoKundkortKkx;
    if (kkx && typeof kkx.resolveReferensBookingExtras === 'function') {
      try {
        var bx = kkx.resolveReferensBookingExtras(card, dossierBundle || {}, {
          occasionTimeline:
            occasionTimeline || (dossierBundle && dossierBundle.occasionTimeline) || null,
        });
        var n = bx ? Number(bx.upcomingBookingCount) : NaN;
        if (Number.isFinite(n) && n > 0) bookCount = n;
      } catch (_bx) {
        bookCount = 0;
      }
    }
    if (!bookCount) {
      bookCount =
        toArray(card.upcomingBookings).length ||
        toArray(bcard.upcomingBookings).length ||
        (Number(bcard.bookings) > 0 ? Number(bcard.bookings) : 0);
    }

    return {
      patientId: pid,
      bookCount: bookCount,
      ready: card.readyForTreatment === true,
    };
  }

  var BOOKING_DAY_NAMES = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
  var BOOKING_MONTHS = [
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

  /** Staff/initialer ur "Tjänst · Personal"-sub (speglar parity staffFromSub). */
  function bookingStaff(sub) {
    var parts = String(sub || '')
      .split('·')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
    var staff = parts.length ? parts[parts.length - 1] : '';
    var words = staff.split(/\s+/).filter(Boolean);
    var ini = words
      .map(function (w) {
        return w[0];
      })
      .join('')
      .slice(0, 2)
      .toUpperCase();
    return { staff: staff, initials: ini };
  }

  /** Normaliserar en bokningsrad till ren presentationsdata (ingen fejk). */
  function normalizeBooking(item) {
    item = item || {};
    var iso = text(item.iso) || text(item.at) || text(item.startsAt) || text(item.nextBookingAt);
    var d = iso ? new Date(iso) : null;
    var valid = d && !isNaN(d.getTime());
    var whenLong =
      text(item.whenLong) ||
      (item.num != null && item.mon
        ? text(item.num) + ' ' + String(item.mon).toLowerCase()
        : valid
          ? d.getDate() + ' ' + BOOKING_MONTHS[d.getMonth()]
          : '');
    var whenShort =
      text(item.whenShort) ||
      text(item.day) ||
      (valid
        ? BOOKING_DAY_NAMES[d.getDay()] +
          ' ' +
          d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        : '');
    var title =
      text(item.title) || text(item.type) || text(item.serviceLabel) || text(item.nextBookingType);
    var sub = text(item.area) || text(item.sub) || text(item.resourceLabel);
    var st = bookingStaff(item.sub || sub);
    return {
      iso: iso,
      whenLong: whenLong,
      whenShort: whenShort,
      title: title || 'Besök',
      sub: sub,
      state: text(item.state) || 'planned',
      stateLabel: text(item.stateLabel),
      staff: st.staff,
      initials: st.initials,
    };
  }

  /**
   * H · Bookings (KEEP) — V11-presentation av KOMMANDE bokningar ovanpå
   * befintlig bokningslogik (canon KEEP). Bevarar bokningsworkflow utan ny
   * handler eller ändrad betydelse:
   *
   *  - Listan byggs från det EXPORTERADE referens-booking-lagret
   *    (CcoKundkortKkx.resolveReferensBookingExtras → upcomingBookings, som i sin
   *    tur återanvänder parity.buildUpcomingBookings). Fallback: card/bcard
   *    .upcomingBookings. Inga påhittade bokningar.
   *  - Varje rad är NÅBAR via den befintliga data-v9-section-link="upcoming"
   *    (öppnar tidslinjen där avboka/omboka/bekräfta-flödet lever) — samma
   *    handler som legacy bokningsrader, graceful tills KEEP-Zon 2 är wire:ad.
   *  - confirm-action bevaras via data-v9-quick="confirm" (renderaren), så
   *    "Bekräfta kommande tider" aldrig tappas.
   *
   * Returnerar { items, count }; tom lista → renderaren visar explicit
   * empty-state (kommande bokningar saknas är normalt).
   *
   * @returns {{items:Array, count:number, patientId:string}}
   */
  function buildBookingsFromExtras(card, bcard, dossierBundle, occasionTimeline) {
    card = card || {};
    bcard = bcard || {};
    var rows = [];
    var kkx = global.CcoKundkortKkx;
    if (kkx && typeof kkx.resolveReferensBookingExtras === 'function') {
      try {
        var bx = kkx.resolveReferensBookingExtras(card, dossierBundle || {}, {
          occasionTimeline:
            occasionTimeline || (dossierBundle && dossierBundle.occasionTimeline) || null,
        });
        rows = toArray(bx && bx.upcomingBookings);
      } catch (_bx) {
        rows = [];
      }
    }
    if (!rows.length) rows = toArray(card.upcomingBookings);
    if (!rows.length) rows = toArray(bcard.upcomingBookings);

    var items = rows.map(normalizeBooking).filter(function (it) {
      return it.whenLong || it.title;
    });

    return {
      items: items,
      count: items.length,
      patientId: text(card.patientId || card.id || bcard.patientId || bcard.id || card.customerId),
    };
  }

  /**
   * I · History (KEEP) — V11-presentation av TIDIGARE besök/bokningar ovanpå
   * befintlig historik-logik (canon KEEP). Bevarar historik-workflow utan ny
   * handler eller ändrad betydelse:
   *
   *  - Listan byggs från det EXPORTERADE referens-booking-lagret
   *    (CcoKundkortKkx.resolveReferensBookingExtras → historyBookings, som i sin
   *    tur återanvänder parity.buildHistoryBookings: senaste besök +
   *    occasionTimeline, deduppat, kapat). Inga påhittade besök.
   *  - Renderaren gör varje rad NÅBAR via befintlig
   *    data-v9-section-link="historik" (öppnar tidslinjen) — samma handler som
   *    legacy historik, graceful tills KEEP-Zon 2 är wire:ad.
   *
   * Returnerar { items, count }; tom lista → renderaren visar explicit
   * empty-state (ingen historik ännu är normalt).
   *
   * @returns {{items:Array, count:number}}
   */
  function buildHistoryFromExtras(card, bcard, dossierBundle, occasionTimeline) {
    card = card || {};
    bcard = bcard || {};
    var rows = [];
    var kkx = global.CcoKundkortKkx;
    if (kkx && typeof kkx.resolveReferensBookingExtras === 'function') {
      try {
        var bx = kkx.resolveReferensBookingExtras(card, dossierBundle || {}, {
          occasionTimeline:
            occasionTimeline || (dossierBundle && dossierBundle.occasionTimeline) || null,
        });
        rows = toArray(bx && bx.historyBookings);
      } catch (_bx) {
        rows = [];
      }
    }
    if (!rows.length) rows = toArray(card.bookingHistory);
    if (!rows.length) rows = toArray(bcard.bookingHistory);

    var items = rows
      .map(normalizeBooking)
      .filter(function (it) {
        return it.whenLong || it.title;
      })
      .slice(0, 8);

    return { items: items, count: items.length };
  }

  function journalNoteText(entry) {
    if (!entry) return '';
    return text(entry.summary || entry.note || entry.clinicalSummary || entry.title).slice(0, 140);
  }

  function journalMeta(entry) {
    var parts = [];
    var who = text(entry.authorName || entry.signedByName);
    if (who) parts.push(who);
    var ts = entry.signedAt || entry.updatedAt || entry.createdAt;
    if (ts) parts.push(String(ts).slice(0, 10));
    return parts.join(' · ') || 'Journal';
  }

  /**
   * J · Journals (KEEP) — V11-presentation av journalposter ovanpå befintlig
   * journal-logik (canon KEEP). Bevarar journal-workflow utan ny handler eller
   * ändrad betydelse. Self-contained: speglar parity-preview-logiken
   * (buildJournalPreviewEntries/journalEntryState/normalizeNoteText/
   * formatNoteMeta) utan beroende på interna funktioner (canon §5).
   *
   *  - Bygger på ctx.journalEntries (riktiga journalposter). Sorteras på
   *    signedAt/updatedAt/createdAt (senaste först), kapas till 5.
   *  - State: locked||signedAt → 'signed'; annars 'draft'. Ingen påhittad text.
   *  - Renderaren gör varje rad NÅBAR via befintlig data-v9-section-link="journal"
   *    (öppnar journal-fliken) — befintlig handler, graceful tills KEEP-Zon 2.
   *
   * Returnerar { items, count }; tom lista → renderaren visar explicit
   * empty-state (inga journalposter ännu är normalt).
   *
   * @returns {{items:Array, count:number}}
   */
  function buildJournalsFromEntries(journalEntries) {
    var entries = toArray(journalEntries).filter(function (e) {
      return e && typeof e === 'object';
    });
    var sorted = entries.slice().sort(function (a, b) {
      var ta = Date.parse(a.signedAt || a.updatedAt || a.createdAt || 0) || 0;
      var tb = Date.parse(b.signedAt || b.updatedAt || b.createdAt || 0) || 0;
      return tb - ta;
    });

    var items = sorted.slice(0, 5).map(function (e) {
      var state = e.locked || e.signedAt ? 'signed' : 'draft';
      return {
        title: text(e.title) || text(e.journalType) || text(e.formKey) || 'Journalpost',
        snippet: journalNoteText(e),
        meta: journalMeta(e),
        state: state,
        badge: state === 'signed' ? 'Signerad' : 'Utkast',
      };
    });

    return { items: items, count: items.length };
  }

  var OFFER_STATUS_LABELS = {
    signed: 'Signerad',
    pending: 'Att fylla i',
    planned: 'Planerad',
    sent: 'Skickad',
  };

  function normalizeOffer(item) {
    item = item || {};
    var registryId = text(item.registryId || item.documentTypeId);
    var status = (text(item.status) || 'planned').toLowerCase();
    return {
      title: text(item.title) || text(item.name) || text(item.label) || 'Offert',
      amount: text(item.amount) || text(item.total),
      status: status,
      statusLabel: text(item.statusLabel) || OFFER_STATUS_LABELS[status] || status,
      journeyStep: text(item.journeyStep),
      registryId: registryId,
      previewable: item.previewable === true || /^offert_/.test(registryId),
    };
  }

  /**
   * K · Offers (KEEP) — V11-presentation av offerter/behandlingsplaner ovanpå
   * befintlig dokument-logik (canon KEEP). Bevarar offert-workflow utan ny
   * handler eller ändrad betydelse:
   *
   *  - Bygger på det EXPORTERADE CcoV9CustomersParity.resolveV11DocumentPayload
   *    (→ offers); fallback: dossierBundle.documents.offers/offerter eller
   *    card.offers. Inga påhittade offerter.
   *  - Renderaren gör varje rad NÅBAR via befintliga data-v11-doc-row/
   *    data-v11-doc-registry/data-v11-doc-previewable (öppnar offert-preview/
   *    dokumentvyn) — samma handler som legacy dokumentrader, graceful tills
   *    KEEP-Zon 2 är wire:ad.
   *
   * Returnerar { items, count }; tom lista → renderaren visar explicit
   * empty-state (inga offerter ännu är normalt).
   *
   * @returns {{items:Array, count:number}}
   */
  function buildOffersFromPayload(card, dossierBundle) {
    card = card || {};
    var rows = [];
    var parity = global.CcoV9CustomersParity;
    if (parity && typeof parity.resolveV11DocumentPayload === 'function') {
      try {
        var payload = parity.resolveV11DocumentPayload(card, dossierBundle || {});
        rows = toArray(payload && payload.offers);
      } catch (_p) {
        rows = [];
      }
    }
    if (!rows.length) {
      var docs = dossierBundle && dossierBundle.documents;
      if (docs) rows = toArray(docs.offers || docs.offerter);
    }
    if (!rows.length) rows = toArray(card.offers);

    var items = rows
      .map(normalizeOffer)
      .filter(function (it) {
        return it.title;
      })
      .slice(0, 6);

    return { items: items, count: items.length };
  }

  function normalizeAutoDoc(item) {
    item = item || {};
    var registryId = text(item.registryId || item.documentTypeId);
    var status = (text(item.status) || 'planned').toLowerCase();
    return {
      title: text(item.title) || text(item.name) || text(item.label) || 'Auto-dokument',
      status: status,
      statusLabel: text(item.statusLabel) || OFFER_STATUS_LABELS[status] || status,
      journeyStep: text(item.journeyStep),
      registryId: registryId,
      previewable: item.previewable === true || item.filler === 'auto' || /^auto_/.test(registryId),
    };
  }

  /**
   * L · Auto-documents (KEEP) — V11-presentation av auto-genererade dokument
   * (mallar/system-dokument) ovanpå befintlig dokument-logik (canon KEEP).
   * Bevarar dokument-workflow utan ny handler eller ändrad betydelse:
   *
   *  - Bygger på det EXPORTERADE CcoV9CustomersParity.resolveV11DocumentPayload
   *    (→ autoDocs); fallback: dossierBundle.documents.autoDokument/auto/
   *    autoDocuments/autoDocs eller card.autoDocs. Inga påhittade dokument.
   *  - Renderaren gör varje rad NÅBAR via befintliga data-v11-doc-row/
   *    data-v11-doc-registry/data-v11-doc-previewable (öppnar mall-/dokument-
   *    preview) — samma handler som legacy dokumentrader, graceful tills
   *    KEEP-Zon 2 är wire:ad.
   *
   * Returnerar { items, count }; tom lista → renderaren visar explicit
   * empty-state (inga auto-dokument ännu är normalt).
   *
   * @returns {{items:Array, count:number}}
   */
  function buildAutoDocsFromPayload(card, dossierBundle) {
    card = card || {};
    var rows = [];
    var parity = global.CcoV9CustomersParity;
    if (parity && typeof parity.resolveV11DocumentPayload === 'function') {
      try {
        var payload = parity.resolveV11DocumentPayload(card, dossierBundle || {});
        rows = toArray(payload && payload.autoDocs);
      } catch (_p) {
        rows = [];
      }
    }
    if (!rows.length) {
      var docs = dossierBundle && dossierBundle.documents;
      if (docs) {
        rows = toArray(docs.autoDokument || docs.auto || docs.autoDocuments || docs.autoDocs);
      }
    }
    if (!rows.length) rows = toArray(card.autoDocs);

    var items = rows
      .map(normalizeAutoDoc)
      .filter(function (it) {
        return it.title;
      })
      .slice(0, 6);

    return { items: items, count: items.length };
  }

  var PHOTO_EXT = /\.(heic|heif|jpe?g|png|webp|gif|mp4|mov|m4v|webm|dng)$/i;
  var IMG_EXT = /\.(jpe?g|png|webp|gif|heic|heif|dng)$/i;

  /** Speglar parity isV10MediaFile: bild/film-detektering (self-contained). */
  function isRailMediaFile(file) {
    file = file || {};
    var name = String(
      file.fileName || file.relativePath || file.originalFileName || file.name || file.title || ''
    ).toLowerCase();
    var mime = String(file.mimeType || file.contentType || '').toLowerCase();
    var type = String(file.fileType || '').toLowerCase();
    var category = String(file.category || '').toLowerCase();
    return (
      type === 'image' ||
      type === 'video' ||
      mime.indexOf('image/') === 0 ||
      mime.indexOf('video/') === 0 ||
      /^(photo|image|video|film)_(before|during|after|overview|donor|hairline|crown)$/.test(
        category
      ) ||
      /(^|\s·\s)(foto|photo|film|video)(\s·|$)/.test(name) ||
      PHOTO_EXT.test(name)
    );
  }

  function railFileViewUrl(file) {
    if (file && file.viewUrl) return String(file.viewUrl);
    if (file && file.id) {
      return '/api/v1/cco-patient-master/file?fileId=' + encodeURIComponent(file.id);
    }
    return '';
  }

  /**
   * M · Photos (KEEP) — V11-presentation av kundens foton/media ovanpå
   * befintlig drive-files-logik (canon KEEP). Bevarar foto-workflow utan ny
   * handler eller ändrad betydelse:
   *
   *  - Filtrerar ctx.driveFiles på media (speglar parity isV10MediaFile) och
   *    bygger länkar med samma URL-logik som parity (resolveFileViewUrl:
   *    viewUrl → /api/v1/cco-patient-master/file?fileId=). Inga påhittade foton.
   *  - Renderaren gör varje foto NÅBART som en native-länk (target=_blank) och
   *    behåller data-photo=<id> så ev. befintlig lightbox-handler wire:as —
   *    ingen ny handler.
   *
   * Returnerar { items, count }; tom lista → renderaren visar explicit
   * empty-state (inga foton ännu är normalt).
   *
   * @returns {{items:Array, count:number}}
   */
  function buildPhotosFromDriveFiles(driveFiles) {
    var media = toArray(driveFiles).filter(isRailMediaFile);
    var items = media
      .map(function (f) {
        var name = text(f.originalFileName || f.fileName || f.relativePath || f.name) || 'Foto';
        var nameLc = name.toLowerCase();
        return {
          id: text(f.id),
          name: name,
          href: railFileViewUrl(f),
          isImage: f.fileType === 'image' || IMG_EXT.test(nameLc),
        };
      })
      .filter(function (it) {
        return it.href;
      })
      .slice(0, 9);

    return { items: items, count: items.length };
  }

  global.CcoV11RailAdapters = {
    v11RailEmpty: v11RailEmpty,
    buildProfileFromBcard: buildProfileFromBcard,
    buildSmartInfoFromSignals: buildSmartInfoFromSignals,
    buildStatsFromExtras: buildStatsFromExtras,
    buildActiveVisitFromBundle: buildActiveVisitFromBundle,
    buildCriticalWarnings: buildCriticalWarnings,
    buildHealthPreview: buildHealthPreview,
    buildJourneyFromState: buildJourneyFromState,
    buildSmartNextStep: buildSmartNextStep,
    buildStickyActions: buildStickyActions,
    buildBookingsFromExtras: buildBookingsFromExtras,
    buildHistoryFromExtras: buildHistoryFromExtras,
    buildJournalsFromEntries: buildJournalsFromEntries,
    buildOffersFromPayload: buildOffersFromPayload,
    buildAutoDocsFromPayload: buildAutoDocsFromPayload,
    buildPhotosFromDriveFiles: buildPhotosFromDriveFiles,
    // Block 16+ section adapters registreras här.
  };
})(typeof window !== 'undefined' ? window : global);
