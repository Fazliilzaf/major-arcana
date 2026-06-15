(function attachCcoJourneyDocResolver(global) {
  'use strict';

  const UI_CARDS = Object.freeze({
    bokning: { section: '§1', title: 'Bokning', step: '2 + cross' },
    halsa: { section: '§2', title: 'Hälsa', step: '3-4' },
    behandling: { section: '§3', title: 'Behandling', step: '5' },
    juridik: { section: '§4', title: 'Juridik', step: '6-7' },
    operation: { section: '§5', title: 'Operation', step: '8' },
    foto: { section: '§6', title: 'Foto-samtycke', step: '9' },
    uppfoljning: { section: '§7', title: 'Uppföljning', step: 'post-8' },
    ekonomi: { section: '§8', title: 'Ekonomi', step: 'cross' },
    anteckningar_policy: { section: '§9', title: 'Anteckningar & policy', step: 'cross' },
  });

  const DOCUMENT_TYPES = Object.freeze([
    doc(
      1,
      'haelso_tp_sve',
      'Hälsodeklaration · Hair TP Clinic',
      'halsa',
      ['halsa'],
      3,
      3,
      ['tp'],
      'signera',
      'hd_status'
    ),
    doc(
      2,
      'health_tp_eng',
      'ENG · Health Questionnaire',
      'halsa',
      ['halsa'],
      3,
      3,
      ['tp'],
      'signera',
      'hd_status_eng'
    ),
    doc(
      3,
      'friskfoers_tp',
      'Friskförsäkran · TP',
      'operation',
      ['operation'],
      8,
      8,
      ['tp'],
      'signera',
      'fc_status'
    ),
    doc(
      4,
      'offert_tp',
      'Offert · TP',
      'behandling',
      ['behandling', 'juridik'],
      5,
      7,
      ['tp'],
      'signera_steg_7',
      'offer_status'
    ),
    doc(
      5,
      'offert_prp_hair',
      'Offert · PRP hår',
      'behandling',
      ['behandling', 'juridik'],
      5,
      7,
      ['prp_hair'],
      'signera_steg_7',
      'offer_status_prp_hair'
    ),
    doc(
      6,
      'offert_prp_skin',
      'Offert · PRP hud',
      'behandling',
      ['behandling', 'juridik'],
      5,
      7,
      ['prp_skin'],
      'signera_steg_7',
      'offer_status_prp_skin'
    ),
    doc(
      7,
      'offert_microneedling',
      'Offert · Microneedling + PRP',
      'behandling',
      ['behandling', 'juridik'],
      5,
      7,
      ['microneedling'],
      'signera_steg_7',
      'offer_status_microneedling'
    ),
    doc(
      8,
      'offert_prf',
      'Offert · PRF hud',
      'behandling',
      ['behandling', 'juridik'],
      5,
      7,
      ['prf'],
      'signera_steg_7',
      'offer_status_prf'
    ),
    doc(
      9,
      'offert_profilo',
      'Offert · Profhilo',
      'behandling',
      ['behandling', 'juridik'],
      5,
      7,
      ['profhilo'],
      'signera_steg_7',
      'offer_status_profhilo'
    ),
    doc(
      10,
      'samtycke_bokning_2d',
      'Samtycke vid bokning inom 2 dagar',
      'juridik',
      ['juridik'],
      6,
      6,
      ['all'],
      'signera',
      'near_booking_consent'
    ),
    doc(
      11,
      'samtycke_angerratt',
      'Begäran + samtycke ångerfrist (2 d)',
      'juridik',
      ['juridik'],
      6,
      6,
      ['all'],
      'signera',
      'cooling_consent'
    ),
    doc(
      12,
      'prp_hair_info_sve',
      'PRP hår · Platelet Rich Plasma (SWE)',
      'halsa',
      ['halsa'],
      [3, 4],
      3,
      ['prp_hair'],
      'las',
      'pre_consult_info'
    ),
    doc(
      13,
      'prp_hair_info_eng',
      'PRP · Platelet Rich Plasma (ENG)',
      'halsa',
      ['halsa'],
      [3, 4],
      3,
      ['prp_hair'],
      'las',
      'pre_consult_info_eng'
    ),
    doc(
      14,
      'microneedling_info',
      'Microneedling (SWE/ENG)',
      'halsa',
      ['halsa'],
      [3, 4],
      3,
      ['microneedling'],
      'las',
      'pre_consult_info_microneedling'
    ),
    doc(
      15,
      'foto_samtycke',
      'Samtycke till foto-publicering',
      'foto',
      ['foto'],
      9,
      9,
      ['all'],
      'signera',
      'photo_consent_status'
    ),
    doc(
      16,
      'journal_tp',
      'Journal · TP Behandling',
      'operation',
      ['operation'],
      8,
      8,
      ['tp'],
      'skriv',
      'op_day_journal'
    ),
    doc(
      17,
      'journal_tp_post_prp',
      'Journal · TP Efterbehandling (PRP)',
      'uppfoljning',
      ['uppfoljning'],
      'post-8',
      'post-8',
      ['tp'],
      'skriv',
      'followup_post_prp'
    ),
    doc(
      18,
      'journal_tp_follow_4',
      'Journal · TP Uppföljning 4 mån',
      'uppfoljning',
      ['uppfoljning'],
      'post-8',
      'post-8',
      ['tp'],
      'skriv',
      'followup_4_months'
    ),
    doc(
      19,
      'journal_tp_follow_6',
      'Journal · TP Uppföljning 6 mån',
      'uppfoljning',
      ['uppfoljning'],
      'post-8',
      'post-8',
      ['tp'],
      'skriv',
      'followup_6_months'
    ),
    doc(
      20,
      'journal_tp_follow_12',
      'Journal · TP Resultatuppföljning 12 mån',
      'uppfoljning',
      ['uppfoljning'],
      'post-8',
      'post-8',
      ['tp'],
      'skriv',
      'followup_12_months'
    ),
    doc(
      21,
      'journal_prp_multi',
      'Journal · PRP/PRF/Microneedling',
      'operation',
      ['operation'],
      8,
      8,
      ['prp_hair', 'prp_skin', 'microneedling', 'prf'],
      'skriv',
      'treatment_day_journal'
    ),
    doc(
      22,
      'behandlingsplan_staff',
      'Behandlingsplan / offert (skapas av personal)',
      'behandling',
      ['behandling'],
      5,
      5,
      ['all'],
      'skapa',
      'plan_draft_status'
    ),
    doc(
      23,
      'konsultationsmall',
      'Konsultationsmall · Hair TP Clinic',
      'halsa',
      ['halsa'],
      4,
      4,
      ['all'],
      'skriv',
      'consultation_status'
    ),
    doc(
      24,
      'ordination_tp',
      'Ordinationsmall · Hårtransplantation',
      'behandling',
      ['behandling', 'operation'],
      [5, 8],
      8,
      ['tp'],
      'skriv',
      'ordination_status'
    ),
    doc(
      25,
      'anteckningar_kort',
      'Anteckningar på patientkort',
      'anteckningar_policy',
      ['anteckningar_policy'],
      'cross',
      'cross',
      ['all'],
      'skriv',
      'staff_notes'
    ),
    doc(
      26,
      'id_verifiering',
      'ID-verifiering (pass/körkort/leg)',
      'halsa',
      ['halsa', 'operation'],
      [4, 8],
      4,
      ['all'],
      'process',
      'id_status'
    ),
    doc(
      27,
      'info_offert_tp',
      'Offert & Behandlingsplan · TP',
      'behandling',
      ['behandling'],
      5,
      5,
      ['tp'],
      'skicka',
      'plan_sent_status'
    ),
    doc(
      28,
      'auto_bokningsbekraftelse',
      'Bokningsbekräftelse (SMS/e-post)',
      'bokning',
      ['bokning'],
      2,
      2,
      ['all'],
      'skicka',
      'booking_confirmation'
    ),
    doc(
      29,
      'auto_bokningspaminnelse',
      'Bokningspåminnelse (SMS/e-post)',
      'bokning',
      ['bokning'],
      'cross',
      'cross',
      ['all'],
      'skicka',
      'booking_reminder'
    ),
    doc(
      30,
      'auto_avbokningsbekraftelse',
      'Avbokningsbekräftelse (SMS/e-post)',
      'bokning',
      ['bokning'],
      'cross',
      'cross',
      ['all'],
      'skicka',
      'booking_cancel_confirmation'
    ),
    doc(
      31,
      'auto_instruktion_formular',
      'Instruktion: hälsodekl / friskförsäkran',
      'bokning',
      ['bokning', 'halsa', 'operation'],
      [3, 8],
      3,
      ['all'],
      'skicka',
      'form_instruction'
    ),
    doc(
      32,
      'auto_betanketid',
      'Betänketid enligt lag (2 d) (e-post)',
      'juridik',
      ['juridik'],
      6,
      6,
      ['all'],
      'skicka',
      'cooling_period_status'
    ),
    doc(
      33,
      'auto_medical_finance',
      'Medical Finance · betalningsinfo (e-post)',
      'ekonomi',
      ['ekonomi'],
      'cross',
      'cross',
      ['all'],
      'skicka',
      'medical_finance_status'
    ),
    doc(
      34,
      'auto_integritet',
      'Personuppgiftspolicy / integritetsinfo',
      'anteckningar_policy',
      ['anteckningar_policy'],
      'cross',
      'cross',
      ['all'],
      'las',
      'privacy_policy'
    ),
    doc(
      35,
      'fore_efter_bildmall',
      'Före/efter-bildmallar (journal → bild)',
      'operation',
      ['operation', 'foto'],
      [8, 9],
      8,
      ['tp'],
      'skriv',
      'photo_protocol'
    ),
    doc(
      36,
      'auto_internt_sms',
      'Internt SMS vid bokning/avbokning',
      'anteckningar_policy',
      ['anteckningar_policy'],
      'cross',
      'cross',
      ['all'],
      'arkiv',
      'internal_sms_archive'
    ),
  ]);

  function doc(
    number,
    id,
    name,
    uiCard,
    uiCards,
    journeyStepDisplay,
    journeyStepAction,
    flowApplies,
    actionKind,
    uiLayerA
  ) {
    return Object.freeze({
      number,
      id,
      name,
      uiCard,
      uiCards,
      journeyStepDisplay,
      journeyStepAction,
      flowApplies,
      actionKind,
      uiLayerA,
      hiddenFromRegistryDefault: true,
    });
  }

  function normalizeToken(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
  }

  function hasTruthy(card, keys) {
    return keys.some((key) => Boolean(card && card[key]));
  }

  function firstValue(card, keys) {
    for (const key of keys) {
      const value = card && card[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
    return null;
  }

  function resolveActiveFlow(card) {
    const source = [
      firstValue(card, [
        'activeFlow',
        'flow',
        'treatmentFlow',
        'treatmentType',
        'procedureType',
        'offerType',
      ]),
      card?.commercialCase?.offerType,
      card?.commercialCase?.treatmentType,
      card?.nextBooking?.service,
      card?.lastBooking?.service,
      card?.summary,
      card?.journeySummary,
      ...asArray(card?.treatmentTypes),
    ]
      .filter(Boolean)
      .join(' ');
    const token = normalizeToken(source);
    if (!token) return 'tp';
    if (token.includes('profhilo') || token.includes('profilo')) return 'profhilo';
    if (token.includes('microneedling') || token.includes('mn')) return 'microneedling';
    if (token.includes('prf')) return 'prf';
    if (token.includes('prp') && (token.includes('hud') || token.includes('skin')))
      return 'prp_skin';
    if (token.includes('prp')) return 'prp_hair';
    if (token.includes('hair') || token.includes('tp') || token.includes('transplant')) return 'tp';
    return 'tp';
  }

  function normalizeUiCard(value) {
    const token = normalizeToken(value);
    const aliases = {
      bokningar: 'bokning',
      boka: 'bokning',
      booking: 'bokning',
      halsa: 'halsa',
      h_lsa: 'halsa',
      medicinskt: 'halsa',
      health: 'halsa',
      behandling: 'behandling',
      behandlingsplan: 'behandling',
      treatment: 'behandling',
      offert: 'behandling',
      juridik: 'juridik',
      avtal: 'juridik',
      legal: 'juridik',
      operation: 'operation',
      op: 'operation',
      op_dag: 'operation',
      foto: 'foto',
      foto_samtycke: 'foto',
      photo: 'foto',
      uppfoljning: 'uppfoljning',
      uppf_ljning: 'uppfoljning',
      followup: 'uppfoljning',
      ekonomi: 'ekonomi',
      economy: 'ekonomi',
      anteckningar: 'anteckningar_policy',
      anteckningar_policy: 'anteckningar_policy',
      policy: 'anteckningar_policy',
      personal: 'anteckningar_policy',
      intern: 'anteckningar_policy',
    };
    return aliases[token] || token;
  }

  function flowMatches(docType, activeFlow) {
    const flows = asArray(docType.flowApplies).map(normalizeToken);
    if (!flows.length || flows.includes('all')) return true;
    return flows.includes(normalizeToken(activeFlow));
  }

  function uiCardForStep(step) {
    const stepKey = String(step || '')
      .trim()
      .toLowerCase();
    const map = {
      2: 'bokning',
      3: 'halsa',
      4: 'halsa',
      5: 'behandling',
      6: 'juridik',
      7: 'juridik',
      8: 'operation',
      9: 'foto',
      'post-8': 'uppfoljning',
      post8: 'uppfoljning',
      cross: '',
    };
    return map[stepKey] || '';
  }

  function filterOffersByFlow(offers, activeFlow) {
    const rows = Array.isArray(offers) ? offers : [];
    if (!rows.length) return rows;
    const flow = normalizeToken(activeFlow || 'tp');
    const registryByFlow = {
      tp: 'offert_tp',
      prp_hair: 'offert_prp_hair',
      prp_skin: 'offert_prp_skin',
      microneedling: 'offert_microneedling',
      prf: 'offert_prf',
      profhilo: 'offert_profilo',
    };
    const wantedRegistryId = registryByFlow[flow] || registryByFlow.tp;
    const exact = rows.filter((row) => normalizeToken(row && row.registryId) === wantedRegistryId);
    if (exact.length) return exact;
    const fuzzyNeedle = flow.split('_')[0];
    const fuzzy = rows.filter((row) => {
      const blob = normalizeToken(
        [row?.registryId, row?.type, row?.title, row?.label, row?.name].filter(Boolean).join(' ')
      );
      return blob.includes(fuzzyNeedle);
    });
    return fuzzy.length ? fuzzy : rows.slice(0, 1);
  }

  function listDocsForUiCard(card, uiCard) {
    const key = normalizeUiCard(uiCard);
    const activeFlow = resolveActiveFlow(card || {});
    return DOCUMENT_TYPES.filter((type) => {
      const cards = asArray(type.uiCards).map(normalizeUiCard);
      if (!cards.includes(key)) return false;
      return flowMatches(type, activeFlow);
    }).sort((a, b) => a.number - b.number);
  }

  function resolvePatientJourneyStep(card) {
    const explicit = firstValue(card || {}, [
      'currentJourneyStep',
      'journeyStep',
      'journeyStepNumber',
      'step',
      'pipelineStep',
    ]);
    const parsed = Number(explicit);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9) return parsed;
    if (hasTruthy(card, ['postOp', 'isPostOp', 'followUpDueAt', 'followUpStatus'])) return 'post-8';
    if (hasTruthy(card, ['missingHealthDeclaration', 'healthDeclarationMissing'])) return 3;
    if (hasTruthy(card, ['consultationDue', 'needsConsultation'])) return 4;
    if (hasTruthy(card, ['treatmentPlanDraft', 'offerDraft', 'needsTreatmentPlan'])) return 5;
    if (hasTruthy(card, ['coolingPeriodActive', 'nearBookingConsentRequired'])) return 6;
    if (hasTruthy(card, ['agreementPending', 'offerSignaturePending', 'needsAgreement'])) return 7;
    if (hasTruthy(card, ['operationDay', 'fitnessCertificateMissing', 'needsJournal'])) return 8;
    if (hasTruthy(card, ['photoConsentMissing', 'photoConsentPending'])) return 9;
    return 'cross';
  }

  function railStatusLine(card) {
    const step = resolvePatientJourneyStep(card || {});
    if (hasTruthy(card, ['missingHealthDeclaration', 'healthDeclarationMissing']))
      return 'HD saknas';
    if (hasTruthy(card, ['healthDeclarationSigned', 'healthDeclarationDone'])) return 'HD klar';
    if (hasTruthy(card, ['fitnessCertificateMissing'])) return 'FC saknas';
    if (hasTruthy(card, ['fitnessCertificateSigned', 'fitnessCertificateDone']))
      return 'FC signerad';
    if (hasTruthy(card, ['offerAccepted', 'agreementSigned'])) return 'Offert signerad';
    if (hasTruthy(card, ['offerSent', 'offerSignaturePending'])) return 'Offert väntar';
    if (hasTruthy(card, ['photoConsentMissing', 'photoConsentPending']))
      return 'Foto-samtycke saknas';
    if (hasTruthy(card, ['photoConsentSigned'])) return 'Foto-samtycke klart';
    if (step === 'post-8') return 'Uppföljning';
    if (step === 'cross') return 'Nästa action';
    return `Steg ${step} · Nästa action`;
  }

  const api = Object.freeze({
    version: 'ord47-v1',
    uiCards: UI_CARDS,
    documentTypes: DOCUMENT_TYPES,
    resolveActiveFlow,
    resolvePatientJourneyStep,
    uiCardForStep,
    filterOffersByFlow,
    listDocsForUiCard,
    railStatusLine,
  });

  global.CcoJourneyDocResolver = api;
})(window);
