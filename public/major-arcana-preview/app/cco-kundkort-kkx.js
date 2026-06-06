/* v10 kkx — panel 3 bind, ⤢ stora vyer, ★-sanering (mockup-paritet) */
(function () {
  'use strict';

  var CANONICAL_COPY = [
    {
      step: 1,
      title: 'Bokning konsultation',
      when: '',
      rows: [
        ['Patient', 'Bokar via webb/Cliento → CCO booking-engine'],
        ['CCO auto', 'Slot-reservation · auto-bekräfta vid komplett data'],
      ],
      gate: 'Ingen gate',
      gateOk: true,
      ruleId: '',
    },
    {
      step: 2,
      title: 'Bokningsbekräftelse-mail',
      when: 'direkt efter steg 1',
      rows: [
        ['Patient', 'Bekräftelse + pre-info + hälsodeklarations-länk'],
        ['CCO auto', 'Mall skickas vid confirmed'],
      ],
      gate: 'Ingen gate',
      gateOk: true,
      ruleId: '',
    },
    {
      step: 3,
      title: 'Hälsodeklaration',
      when: 'innan konsultation',
      rows: [
        ['Patient', 'Fyller i + signerar (halso@)'],
        ['CCO auto', 'missingHealthDeclaration = false'],
      ],
      gate: 'Blockerar steg 4',
      gateOk: false,
      ruleId: 'missing_health_declaration',
    },
    {
      step: 4,
      title: 'Konsultation',
      when: '',
      rows: [
        ['Personal', 'Granskar HD · konsulterar · signerar journal'],
        ['CCO auto', 'Encounter vid check-in'],
      ],
      gate: 'Blockerar steg 5',
      gateOk: false,
      ruleId: 'missing_journal',
    },
    {
      step: 5,
      title: 'Offert = Behandlingsplan',
      when: 'direkt efter konsult',
      rows: [
        ['Personal', 'Mall + pris + scope'],
        ['CCO auto', 'missing_treatment_plan'],
      ],
      gate: 'Blockerar steg 7',
      gateOk: false,
      ruleId: 'missing_treatment_plan',
    },
    {
      step: 6,
      title: 'Betänketid 2 dagar',
      when: '',
      rows: [
        ['CCO auto', 'cooling_off_active → cooling_off_passed'],
        ['Aldrig', 'Skicka avtal under aktiv betänketid'],
      ],
      gate: 'Kärngate',
      gateOk: false,
      ruleId: 'cooling_off_active',
    },
    {
      step: 7,
      title: 'Avtal + behandlingssamtycke',
      when: 'bundle · samma transaktion',
      rows: [
        ['Personal', 'Legal review → send-for-sign'],
        ['CCO auto', 'Egen sign-flow · bookable = true'],
      ],
      gate: 'Blockerar bokning av behandling',
      gateOk: false,
      ruleId: 'missing_agreement_consent_bundle',
    },
    {
      step: 8,
      title: 'Friskförsäkran',
      when: 'operationsdagen',
      rows: [
        ['Patient', 'Signerar via tablet/QR på kliniken'],
        ['Personal', 'Verifierar identitet före start'],
      ],
      gate: 'Blockerar OPERATIONSSTART',
      gateOk: false,
      ruleId: 'missing_operation_day_insurance',
    },
    {
      step: 9,
      title: 'Foto-samtycke',
      when: 'samma dag som foto',
      rows: [
        ['Patient', 'Godkänner hårlinje/krona — aldrig ansikte'],
        ['CCO auto', 'Prompt vid första journal-foto'],
      ],
      gate: 'Blockerar före/efter-användning',
      gateOk: false,
      ruleId: 'missing_photo_consent',
    },
  ];

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

  var SIGNAL_BLURBS = {
    'customer.missing_health_declaration': {
      what: 'Hälsodeklaration saknas',
      why: 'Krävs inför konsultation (steg 3).',
      risk: 'blocker',
    },
    'customer.missing_journal': {
      what: 'Journal saknas',
      why: 'Konsultation (steg 4) kräver encounter och journal.',
      risk: 'blocker',
    },
    'customer.missing_treatment_plan': {
      what: 'Behandlingsplan/offert saknas',
      why: 'Efter konsult (steg 5) — offert = behandlingsplan.',
      risk: 'blocker',
    },
    'customer.cooling_off_active': {
      what: 'Betänketid pågår',
      why: 'Betänketid 2 dagar (steg 6).',
      risk: 'info',
    },
    'customer.missing_agreement_consent_bundle': {
      what: 'Avtal + samtycke saknas',
      why: 'Steg 7 — samma transaktion.',
      risk: 'legal_blocker',
    },
    'customer.missing_operation_day_insurance': {
      what: 'Friskförsäkran saknas',
      why: 'Operationsdagen — tablet/QR.',
      risk: 'blocker',
    },
    'customer.missing_photo_consent': {
      what: 'Foto-samtycke saknas',
      why: 'Vid för-/efterbild — hårlinje/krona.',
      risk: 'legal',
    },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mapJourneyState(status) {
    if (status === 'done') return 'done';
    if (status === 'active') return 'act';
    if (status === 'neutral') return 'neutral';
    return '';
  }

  function hasBooking(card) {
    if (!card) return false;
    return Boolean(
      card.hasUpcomingBooking ||
      Number(card.visitCount != null ? card.visitCount : card.bookingCount) > 0 ||
      card.lastVisitAt ||
      card.lastBookingAt
    );
  }

  function healthSigned(card) {
    if (!card) return false;
    return Boolean(
      card.hasHealthDeclaration ||
      card.missingHealthDeclaration === false ||
      (card.healthDeclaration && (card.healthDeclaration.signedAt || card.healthDeclaration.signed))
    );
  }

  function journalSigned(card) {
    if (!card) return false;
    if (card.missingJournal === true) return false;
    return Boolean(card.hasJournal || card.hasJournalHistory);
  }

  function signalActive(card, fragment) {
    var signals = card && card.automationSignals ? card.automationSignals : [];
    return signals.some(function (s) {
      return (
        String(s.ruleId || '').indexOf(fragment) >= 0 &&
        s.status === 'active' &&
        CANONICAL_SIGNAL_IDS[String(s.ruleId || '')]
      );
    });
  }

  function treatmentPlanDone(card) {
    var status = String(card.treatmentPlanStatus || '').toLowerCase();
    if (status && status !== 'draft' && status !== 'missing') return true;
    return card.missingTreatmentPlan === false;
  }

  function agreementDone(card) {
    if (card.agreementSigned === true) return true;
    if (card.hasAgreement === true && card.missingAgreement === false) return true;
    return false;
  }

  /**
   * done | open | neutral | future — open = aktiv blockerare, neutral = steg 2 (–), future = ej nått.
   * Okänt läge defaultar ALDRIG till done.
   */
  function computeStepTruth(card, def) {
    card = card || {};
    switch (def.step) {
      case 1:
        return hasBooking(card) ? 'done' : 'open';
      case 2:
        return hasBooking(card) ? 'neutral' : 'future';
      case 3:
        if (healthSigned(card)) return 'done';
        if (!hasBooking(card)) return 'future';
        return card.missingHealthDeclaration === true ? 'open' : 'future';
      case 4:
        if (!healthSigned(card)) return 'future';
        if (journalSigned(card)) return 'done';
        return card.missingJournal === true ? 'open' : 'future';
      case 5:
        if (!journalSigned(card) || !healthSigned(card)) return 'future';
        if (treatmentPlanDone(card)) return 'done';
        if (card.missingTreatmentPlan === true || signalActive(card, 'missing_treatment_plan')) {
          return 'open';
        }
        return 'future';
      case 6:
        if (!journalSigned(card)) return 'future';
        if (signalActive(card, 'cooling_off_active')) return 'open';
        if (signalActive(card, 'cooling_off_passed')) return 'done';
        return 'future';
      case 7:
        if (!journalSigned(card)) return 'future';
        if (agreementDone(card)) return 'done';
        if (card.missingAgreement === true || signalActive(card, 'missing_agreement')) {
          return 'open';
        }
        return 'future';
      case 8:
        if (!journalSigned(card)) return 'future';
        if (card.fitnessSigned === true) return 'done';
        if (card.missingFitnessCertificate === true || card.todayVisit === true) {
          return card.fitnessSigned === true ? 'done' : 'open';
        }
        return 'future';
      case 9:
        if (!journalSigned(card)) return 'future';
        if (card.photoConsent && card.photoConsent.signed === true) return 'done';
        if (card.missingPhotoConsent === true || signalActive(card, 'missing_photo_consent')) {
          return 'open';
        }
        return 'future';
      default:
        return 'future';
    }
  }

  function overlayGateOk(truth, def) {
    if (def.step === 1) return truth === 'done';
    if (def.step === 2) return truth === 'neutral' || truth === 'done';
    return truth === 'done';
  }

  function buildCanonicalJourneyLive(card, journalEntries, dossierBundle) {
    void journalEntries;
    void dossierBundle;
    card = card || {};
    var rows = CANONICAL_COPY.map(function (def) {
      return { def: def, truth: computeStepTruth(card, def) };
    });
    var activeStep = null;
    rows.forEach(function (row) {
      if (row.truth === 'open' && activeStep == null) activeStep = row.def.step;
    });
    var steps = rows.map(function (row) {
      var status = 'future';
      if (row.truth === 'done') status = 'done';
      else if (row.truth === 'neutral') status = 'neutral';
      else if (row.def.step === activeStep) status = 'active';
      var meta = '';
      if (status === 'done' && row.def.step === 3) meta = 'Signerad';
      return {
        step: row.def.step,
        label: row.def.title,
        status: status,
        meta: meta,
        truth: row.truth,
      };
    });
    var doneCount = steps.filter(function (s) {
      return s.status === 'done';
    }).length;
    var active = steps.find(function (s) {
      return s.status === 'active';
    });
    return {
      steps: steps,
      doneCount: doneCount,
      activeStep: active ? active.step : null,
      nextLabel: active ? active.label : '',
    };
  }

  function makeSyntheticSignal(ruleId) {
    var blur = SIGNAL_BLURBS[ruleId] || { what: ruleId, why: '', risk: 'info' };
    return {
      ruleId: ruleId,
      what: blur.what,
      why: blur.why,
      risk: blur.risk,
      level: blur.risk,
      status: 'active',
    };
  }

  /** Samma readout-fält som bannern / ccoKunderEnrichment.computeNextStep. */
  function synthesizeSignalsFromCard(card) {
    card = card || {};
    var out = [];
    if (card.missingHealthDeclaration === true || card.missingForm === true) {
      out.push(makeSyntheticSignal('customer.missing_health_declaration'));
    }
    if (card.missingJournal === true) {
      out.push(makeSyntheticSignal('customer.missing_journal'));
    }
    if (card.missingTreatmentPlan === true) {
      out.push(makeSyntheticSignal('customer.missing_treatment_plan'));
    }
    if (card.missingAgreement === true && card.hasJournal) {
      out.push(makeSyntheticSignal('customer.missing_agreement_consent_bundle'));
    }
    if (card.needsPhotoReview === true) {
      out.push(makeSyntheticSignal('customer.has_photo_review'));
    }
    if (card.readyForTreatment === true) {
      out.push(makeSyntheticSignal('customer.ready_for_treatment'));
    }
    return out;
  }

  function resolvePanelSignals(card) {
    card = card || {};
    var fromApi = (card.automationSignals || []).filter(function (s) {
      return s && CANONICAL_SIGNAL_IDS[String(s.ruleId || '')] && s.status === 'active';
    });
    var synth = synthesizeSignalsFromCard(card);
    var seen = {};
    fromApi.forEach(function (s) {
      seen[String(s.ruleId)] = true;
    });
    synth.forEach(function (s) {
      if (!seen[s.ruleId]) fromApi.push(s);
    });
    if (
      window.CcoKunderSmartNextStep &&
      typeof window.CcoKunderSmartNextStep.sortSignals === 'function'
    ) {
      return window.CcoKunderSmartNextStep.sortSignals(fromApi);
    }
    return fromApi;
  }

  function renderCanonicalJourneyBig(card, journalEntries, dossierBundle) {
    var journey = buildCanonicalJourneyLive(card, journalEntries, dossierBundle);
    var stepsByNum = {};
    journey.steps.forEach(function (s) {
      stepsByNum[s.step] = s;
    });
    var html =
      '<div class="kkx-canon">Canonical 9 steg (Hair TP) · betänketid 2d · egen sign-flow · aldrig T-48h</div>';
    CANONICAL_COPY.forEach(function (def) {
      var live = stepsByNum[def.step];
      var truth = live ? live.truth : 'future';
      var state = mapJourneyState(live ? live.status : 'future');
      var gateOk = overlayGateOk(truth, def);
      html +=
        '<div class="kkx-cstep ' +
        esc(state) +
        '"><div><span class="ct">' +
        def.step +
        ' · ' +
        esc(def.title) +
        '</span>' +
        (def.when ? '<span class="cw">' + esc(def.when) + '</span>' : '') +
        '</div>';
      def.rows.forEach(function (r) {
        html +=
          '<div class="kkx-crow"><span class="who">' +
          esc(r[0]) +
          '</span><span>' +
          r[1] +
          '</span></div>';
      });
      html +=
        '<div><span class="kkx-gate' +
        (gateOk ? ' ok' : '') +
        '">' +
        esc(gateOk ? 'Gate OK' : def.gate) +
        '</span></div></div>';
    });
    return html;
  }

  function ensureOverlay() {
    var ov = document.getElementById('kkx-ov');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'kkx-ov';
    ov.className = 'kkx-ov';
    ov.innerHTML =
      '<div class="kkx-big v9-surface-vellum"><div class="kkx-bighead"><div><div class="k">KUNDDOSSIÉR · STOR VY</div><div class="t" id="kkx-big-title"></div></div><button type="button" class="kkx-bigclose" id="kkx-big-close" aria-label="Stäng">&times;</button></div><div id="kkx-big-body"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeBig();
    });
    ov.querySelector('#kkx-big-close').addEventListener('click', closeBig);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeBig();
    });
    return ov;
  }

  function closeBig() {
    var ov = document.getElementById('kkx-ov');
    if (ov) {
      ov.classList.remove('open');
      var body = document.getElementById('kkx-big-body');
      if (body) body.innerHTML = '';
    }
  }

  function openBig(title, html, ctx) {
    var ov = ensureOverlay();
    document.getElementById('kkx-big-title').textContent = title;
    var body = document.getElementById('kkx-big-body');
    body.innerHTML = html;
    ov.classList.add('open');
    if (ctx && ctx.onMount) ctx.onMount(body);
  }

  function sanitizeStarMarkers(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (!n.textContent) return;
      var t = n.textContent;
      if (t.indexOf('★') >= 0 || /AI-insikter/i.test(t) || /AI\s*·/i.test(t)) {
        n.textContent = t
          .replace(/★\s*/g, '')
          .replace(/AI-insikter/gi, 'Insikter')
          .replace(/\bAI\s*·\s*/gi, '');
      }
    });
  }

  function summaryTitle(summaryEl) {
    if (!summaryEl) return '';
    var clone = summaryEl.cloneNode(true);
    clone.querySelectorAll('.count, .src, .sb-chip, .kkx-exp').forEach(function (node) {
      node.remove();
    });
    return String(clone.textContent || '')
      .replace(/⤢|▾/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function upgradeSectionsToDetails(root) {
    if (!root || root.dataset.kkxUpgraded === '1') return;
    root.querySelectorAll('.sec:not(.nb)').forEach(function (sec, idx) {
      if (sec.closest('details.dossier-section')) return;
      var lab = sec.querySelector('.lab');
      if (!lab) return;
      var title = summaryTitle(lab);
      var countEl = lab.querySelector('.src, .sb-chip, .count');
      var count = countEl ? countEl.textContent.trim() : '';
      var inner = sec.innerHTML.replace(lab.outerHTML, '');
      var details = document.createElement('details');
      details.className = 'dossier-section';
      details.id = 'kkx-sec-' + idx;
      if (/hälsodeklaration|kundresa|smart nästa/i.test(title)) details.open = true;
      details.innerHTML =
        '<summary>' +
        esc(title) +
        (count ? ' <span class="count">' + esc(count) + '</span>' : '') +
        '</summary><div style="padding:4px 2px 2px">' +
        inner +
        '</div>';
      sec.replaceWith(details);
    });
    root.dataset.kkxUpgraded = '1';
  }

  function addExpanders(root, ctx) {
    if (!root) return;
    root.querySelectorAll('details.dossier-section, .sec').forEach(function (d) {
      var su = d.querySelector('summary, .lab');
      if (!su || su.querySelector('.kkx-exp')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kkx-exp';
      btn.title = 'Öppna stort';
      btn.innerHTML = '&#x2922;';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var title = summaryTitle(su);
        var isResa = /kundresa/i.test(title);
        var isJournal = /journal/i.test(title);
        var body = d.querySelector('summary ~ *, .lab ~ *');
        if (isResa) {
          openBig(
            title,
            renderCanonicalJourneyBig(ctx.card, ctx.journalEntries, ctx.dossierBundle)
          );
          return;
        }
        if (isJournal && typeof ctx.mountJournalBig === 'function') {
          openBig('Journal · arbetsyta', '<div data-kkx-journal-mount></div>', {
            onMount: function (shell) {
              var slot = shell.querySelector('[data-kkx-journal-mount]');
              if (slot) ctx.mountJournalBig(slot, {});
            },
          });
          return;
        }
        openBig(title, body ? body.innerHTML : '');
      });
      su.appendChild(btn);
    });
  }

  function bindPanel(root, ctx) {
    ctx = ctx || {};
    if (!root) return;
    sanitizeStarMarkers(root);
    upgradeSectionsToDetails(root);
    addExpanders(root, ctx);
    root.querySelectorAll('.openb, .kkx-openb').forEach(function (btn) {
      if (btn.dataset.kkxJournalBound) return;
      btn.dataset.kkxJournalBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof ctx.mountJournalBig !== 'function') return;
        var entryId = btn.dataset.kkxJournalEntry || '';
        var journalType = btn.dataset.kkxJournalType || '';
        openBig('Journal · arbetsyta', '<div data-kkx-journal-mount></div>', {
          onMount: function (shell) {
            var slot = shell.querySelector('[data-kkx-journal-mount]');
            if (slot) ctx.mountJournalBig(slot, { entryId: entryId, journalType: journalType });
          },
        });
      });
    });
  }

  function sanitizeCustomerListScope() {
    var scope = document.querySelector('[data-customer-list]');
    if (scope) sanitizeStarMarkers(scope);
    var agg = document.querySelector('[data-v9-agg-insights]');
    if (agg) sanitizeStarMarkers(agg);
  }

  window.CcoKundkortKkx = {
    bindPanel: bindPanel,
    openBig: openBig,
    closeBig: closeBig,
    sanitizeCustomerListScope: sanitizeCustomerListScope,
    renderCanonicalJourneyBig: renderCanonicalJourneyBig,
    buildCanonicalJourneyLive: buildCanonicalJourneyLive,
    resolvePanelSignals: resolvePanelSignals,
    CANONICAL_COPY: CANONICAL_COPY,
  };
})();
