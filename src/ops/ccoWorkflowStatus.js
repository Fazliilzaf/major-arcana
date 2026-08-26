'use strict';

/* ─── ccoWorkflowStatus — Komm: kundresa / workflow-status ─────────────
 *
 * Ren utledning av "var kunden befinner sig" i kedjan
 *   offert → signering → behandling (op) → eftervård
 * ur de kanoniska källorna som redan finns:
 *   - commercialCase  (quoteStatus / esignStatus / quoteAcceptedAt)
 *   - treatmentAgreement (buildTreatmentAgreementReadout)
 *   - ccoCustomerJourneyStore (12-stegs kundresa: treatment_offered →
 *     agreement_signed → treatment_booked → treatment_done → aftercare…)
 *
 * Inga store-/fs-beroenden här — anroparen hämtar data och skickar in färdiga
 * objekt. Inga affärsbeslut fattas; funktionen mappar bara tillstånd till steg.
 * ────────────────────────────────────────────────────────────────────── */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isDone(value) {
  if (value === true) return true;
  const normalized = normalizeKey(value);
  return [
    'accepted',
    'bookable',
    'complete',
    'completed',
    'done',
    'granted',
    'ok',
    'signed',
    'true',
  ].includes(normalized);
}

const DOING = ['draft', 'sent', 'in_progress', 'active', 'pending', 'needs_review'];

/** Kanoniska workflow-steg (ordning). */
const WORKFLOW_STAGES = Object.freeze([
  { key: 'offer_draft', label: 'Offertutkast', order: 0 },
  { key: 'offer_sent', label: 'Offert skickad', order: 1 },
  { key: 'signed', label: 'Offert signerad', order: 2 },
  { key: 'pre_op', label: 'Inför operation', order: 3 },
  { key: 'operation_booked', label: 'Operation bokad', order: 4 },
  { key: 'operation_done', label: 'Behandling klar', order: 5 },
  { key: 'aftercare', label: 'Eftervård', order: 6 },
  { key: 'completed', label: 'Avslutat', order: 7 },
]);

const STAGE_BY_KEY = Object.fromEntries(WORKFLOW_STAGES.map((s) => [s.key, s]));

const JOURNEY_STEP_TO_STAGE = Object.freeze({
  lead_first_contact: 'offer_draft',
  consultation_booked: 'offer_draft',
  consultation_done: 'offer_draft',
  treatment_offered: 'offer_sent',
  agreement_signed: 'pre_op',
  pre_treatment_documents: 'pre_op',
  treatment_booked: 'operation_booked',
  treatment_done: 'operation_done',
  aftercare_d7: 'aftercare',
  aftercare_d30: 'aftercare',
  follow_up_3m: 'aftercare',
  completed: 'completed',
});

const SIDE_STATES = Object.freeze(['cancelled', 'no_show', 'on_hold']);

/** Spegel av ccoCustomerJourneyStore.STEPS (12 steg) — ingen import-cirkel. */
const JOURNEY_STEPS = Object.freeze([
  { id: 'lead_first_contact', label: 'Lead välkomnande', order: 1 },
  { id: 'consultation_booked', label: 'Konsultation bokad', order: 2 },
  { id: 'consultation_done', label: 'Konsultation klar', order: 3 },
  { id: 'treatment_offered', label: 'Behandlingsförslag', order: 4 },
  { id: 'agreement_signed', label: 'Avtal signerat', order: 5 },
  { id: 'pre_treatment_documents', label: 'Dokument inskickade', order: 6 },
  { id: 'treatment_booked', label: 'Behandling bokad', order: 7 },
  { id: 'treatment_done', label: 'Behandling klar', order: 8 },
  { id: 'aftercare_d7', label: 'Eftervård vecka 1', order: 9 },
  { id: 'aftercare_d30', label: 'Eftervård 30 dagar', order: 10 },
  { id: 'follow_up_3m', label: 'Uppföljning 3 mån', order: 11 },
  { id: 'completed', label: 'Avslutat', order: 12 },
]);

const JOURNEY_STEP_BY_ID = Object.fromEntries(JOURNEY_STEPS.map((s) => [s.id, s]));

function journeyStepOrder(journey = {}) {
  const stepId = normalizeKey(journey?.currentStep);
  const direct = Number(journey?.stepOrder || 0);
  if (direct > 0) return direct;
  return JOURNEY_STEP_BY_ID[stepId]?.order || 0;
}

function journeyCurrentLabel(journey = {}) {
  const stepId = normalizeKey(journey?.currentStep);
  return normalizeText(journey?.currentLabel) || JOURNEY_STEP_BY_ID[stepId]?.label || stepId || '';
}

/** Toppnivå-order i kundresan (1..12) — används för op/eftervård-gates. */
function journeyMainOrder(journey = {}) {
  return journeyStepOrder(journey);
}

function journeyIsReal(journey = {}) {
  if (!journey || typeof journey !== 'object') return false;
  // Standard-getJourney() ger updatedAt=null när ingen post finns. En spilld
  // post har alltid updatedAt satt efter första advance/ensure.
  if (normalizeText(journey.updatedAt)) return true;
  if (Array.isArray(journey.completedSteps) && journey.completedSteps.length > 0) return true;
  return false;
}

/**
 * Bygg "Din resa"-gates (kundportalen) ur verkligt tillstånd.
 * Varje gate: { id, title, order, state: done|active|locked, status }.
 */
function resolveWorkflowGates({
  commercialCase = {},
  treatmentAgreement = null,
  journey = null,
  operation = null,
  aftercare = null,
  fitnessCertificate = null,
  healthDeclaration = null,
} = {}) {
  const quoteStatus = normalizeKey(commercialCase.quoteStatus || 'draft');
  const esignStatus = normalizeKey(commercialCase.esignStatus || 'draft');
  const quoteAccepted = quoteStatus === 'accepted' || esignStatus === 'accepted';
  const quoteSent = quoteStatus === 'sent' || quoteAccepted;

  const agreement = asObject(treatmentAgreement);
  const agreementDone =
    agreement.bookable === true ||
    agreement.consentSigned === true ||
    isDone(agreement.phase) ||
    isDone(agreement.status);

  const operationStatus = normalizeKey(operation?.operationStatus || '');
  const journeyStep = normalizeKey(journey?.currentStep);
  const journeyOrder = journeyStepOrder(journey);
  const operationDone =
    operationStatus === 'complete' ||
    isDone(operationStatus) ||
    ['treatment_done', 'aftercare_d7', 'aftercare_d30', 'follow_up_3m', 'completed'].includes(
      journeyStep
    ) ||
    journeyOrder >= 8;
  const operationBooked =
    operationStatus === 'planned' ||
    operationStatus === 'ready' ||
    operationStatus === 'scheduled' ||
    operationDone ||
    journeyStep === 'treatment_booked' ||
    journeyOrder >= 7;

  const aftercareStatus = normalizeKey(aftercare?.aftercareStatus || '');
  const aftercareDone =
    journeyStep === 'completed' || aftercareStatus === 'complete' || isDone(aftercareStatus);
  const aftercareActive =
    aftercareDone ||
    operationDone ||
    ['aftercare_d7', 'aftercare_d30', 'follow_up_3m'].includes(journeyStep) ||
    aftercareStatus !== '';

  const fitnessDone =
    ((Boolean(commercialCase.fitnessSigned) || normalizeKey(commercialCase.fitnessStatus)) &&
      isDone(commercialCase.fitnessSigned || commercialCase.fitnessStatus)) ||
    isDone(fitnessCertificate?.signed) ||
    isDone(fitnessCertificate?.status);
  const healthSigned = isDone(healthDeclaration?.signed) || isDone(healthDeclaration?.status);

  return [
    {
      id: 'offer',
      title: 'Offert och behandlingsplan',
      order: 1,
      state: quoteAccepted ? 'done' : quoteSent ? 'active' : 'locked',
      status: quoteAccepted ? 'Klar' : quoteSent ? 'Pågår' : 'Låst',
    },
    {
      id: 'agreement',
      title: 'Avtal och behandlingssamtycke',
      order: 2,
      state: agreementDone ? 'done' : quoteAccepted ? 'active' : 'locked',
      status: agreementDone ? 'Klar' : quoteAccepted ? 'Nästa' : 'Låst',
    },
    {
      id: 'fitness',
      title: 'Friskförsäkran på operationsdagen',
      order: 3,
      state: fitnessDone ? 'done' : agreementDone ? 'active' : 'locked',
      status: fitnessDone ? 'Klar' : agreementDone ? 'Op-dag' : 'Låst',
    },
    {
      id: 'operation',
      title: 'Operation och behandling',
      order: 4,
      state: operationDone ? 'done' : operationBooked ? 'active' : 'locked',
      status: operationDone ? 'Klar' : operationBooked ? 'Bokad' : 'Låst',
    },
    {
      id: 'aftercare',
      title: 'Eftervård och uppföljning',
      order: 5,
      state: aftercareDone ? 'done' : aftercareActive ? 'active' : 'locked',
      status: aftercareDone ? 'Klar' : aftercareActive ? 'Pågår' : 'Låst',
    },
  ];
}

/**
 * Bygg ett kompakt workflow-kort för personalportalen: stege + aktivt steg.
 */
function resolveWorkflowReadout(input = {}) {
  const commercialCase = asObject(input.commercialCase);
  const journey = asObject(input.journey);
  const journeyReal = journeyIsReal(journey);

  const quoteStatus = normalizeKey(commercialCase.quoteStatus || 'draft');
  const esignStatus = normalizeKey(commercialCase.esignStatus || 'draft');
  const quoteAccepted = quoteStatus === 'accepted' || esignStatus === 'accepted';
  const quoteSent = quoteStatus === 'sent' || quoteAccepted;
  const agreementDone =
    asObject(input.treatmentAgreement).bookable === true ||
    asObject(input.treatmentAgreement).consentSigned === true ||
    isDone(asObject(input.treatmentAgreement).phase) ||
    isDone(asObject(input.treatmentAgreement).status);

  // Affärsläge → min-ordning.
  const offerStageOrder = quoteAccepted ? 2 : quoteSent ? 1 : 0;
  const journeyStageKey = JOURNEY_STEP_TO_STAGE[normalizeKey(journey.currentStep)] || 'offer_draft';
  let journeyStageOrder = STAGE_BY_KEY[journeyStageKey]?.order ?? 0;

  if (!journeyReal) {
    // Utan journey-ledtråd: hålla oss till det vi med säkerhet känner från
    // affärsläget — dra aldrig slutsatser om op/eftervård utan grund.
    journeyStageOrder = 0;
  }

  // Ordning: affärsläge + avtal + kundresa → ta det mest avancerade.
  let stageOrder = Math.max(offerStageOrder, journeyStageOrder);
  if (agreementDone && stageOrder < 3) stageOrder = 3;
  const stage = WORKFLOW_STAGES.find((s) => s.order === stageOrder) || STAGE_BY_KEY['offer_draft'];
  const stageKey = stage.key;
  const side = SIDE_STATES.includes(normalizeKey(journey.sideState))
    ? normalizeKey(journey.sideState)
    : null;

  const journeySteps = Array.isArray(journey.steps)
    ? journey.steps.map((step) => ({
        id: normalizeText(step.id),
        label: normalizeText(step.label),
        order: Number(step.order || 0),
        state: normalizeKey(step.state) || 'pending',
      }))
    : null;

  return {
    stageKey: stage.key,
    stageLabel: stage.label,
    stageOrder: stage.order,
    progressPercent: Math.round((stage.order / (WORKFLOW_STAGES.length - 1)) * 100),
    sideState: side,
    healthSigned: isDone(input.healthDeclaration?.signed || input.healthDeclaration?.status),
    fitnessSigned: isDone(input.fitnessCertificate?.signed || input.fitnessCertificate?.status),
    // Kundresa-stege (12 steg) — null när inga data finns att visa.
    journey: journeyReal
      ? {
          currentStep: normalizeText(journey.currentStep),
          currentLabel: journeyCurrentLabel(journey),
          stepOrder: journeyMainOrder(journey),
          completedSteps: Array.isArray(journey.completedSteps) ? journey.completedSteps : [],
          steps: journeySteps,
        }
      : null,
    gates: resolveWorkflowGates(input),
  };
}

module.exports = {
  WORKFLOW_STAGES,
  JOURNEY_STEPS,
  resolveWorkflowReadout,
  resolveWorkflowGates,
  journeyIsReal,
};
