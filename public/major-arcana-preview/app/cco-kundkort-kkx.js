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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mapJourneyState(status) {
    if (status === 'done') return 'done';
    if (status === 'active') return 'act';
    return '';
  }

  function signalActive(card, fragment) {
    var signals = card && card.automationSignals ? card.automationSignals : [];
    return signals.some(function (s) {
      return String(s.ruleId || '').indexOf(fragment) >= 0 && (s.status === 'active' || s.level);
    });
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

  function resolveStepGateOk(card, def, status) {
    if (status === 'done') return true;
    var id = def.ruleId;
    if (!id) return status === 'done';
    if (id === 'missing_health_declaration') {
      return Boolean(
        card.hasHealthDeclaration ||
        !card.missingHealthDeclaration ||
        (card.healthDeclaration &&
          (card.healthDeclaration.signedAt || card.healthDeclaration.signed))
      );
    }
    if (id === 'missing_journal') return Boolean(card.hasJournal);
    if (id === 'missing_treatment_plan')
      return Boolean(card.treatmentPlanStatus && card.treatmentPlanStatus !== 'draft');
    if (id === 'cooling_off_active') return !signalActive(card, 'cooling_off_active');
    if (id === 'missing_agreement_consent_bundle')
      return Boolean(card.agreementSigned) || !card.missingAgreement;
    if (id === 'missing_operation_day_insurance') return !card.missingFitnessCertificate;
    if (id === 'missing_photo_consent') {
      return Boolean(card.photoConsent && card.photoConsent.signed);
    }
    return false;
  }

  /** Mockup-facit: 9 steg inkl. bekräftelse-mail som steg 2, HD = steg 3. */
  function buildCanonicalJourneyLive(card, journalEntries, dossierBundle) {
    void journalEntries;
    void dossierBundle;
    card = card || {};
    var steps = [];
    var allowActive = true;
    CANONICAL_COPY.forEach(function (def) {
      var satisfied;
      if (def.step === 1 || def.step === 2) {
        satisfied = hasBooking(card);
      } else {
        satisfied = resolveStepGateOk(card, def, 'done');
      }
      var status = 'future';
      if (satisfied) {
        status = 'done';
      } else if (allowActive) {
        status = 'active';
        allowActive = false;
      }
      var meta = '';
      if (
        status === 'done' &&
        def.step === 3 &&
        card.healthDeclaration &&
        card.healthDeclaration.signedAt
      ) {
        meta = 'Signerad';
      }
      steps.push({
        step: def.step,
        label: def.title,
        status: status,
        meta: meta,
      });
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
      var status = live ? live.status : 'future';
      var state = mapJourneyState(status);
      var gateOk = resolveStepGateOk(card, def, status === 'done' ? 'done' : status);
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
      var title = (su.textContent || '').replace(/▾/g, '').trim();
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
    CANONICAL_COPY: CANONICAL_COPY,
  };
})();
