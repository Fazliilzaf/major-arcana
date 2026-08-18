'use strict';

const { isAutomationRunnerEnabled } = require('./ccoAutomationRegistry');
const { TREATMENT_PLAN_OK } = require('./ccoKunderFasAReadiness');
const {
  buildTreatmentAgreementReadout,
  createCcoTreatmentAgreementStore,
  getCoolingOffMeta,
} = require('./ccoTreatmentAgreementStore');
const { resolveTemplateApprovalForAgreement } = require('./ccoTreatmentAgreementTemplateGate');
const { buildDocumentBlockerSignals } = require('./ccoDocumentReadiness');

let agreementStoreSingleton = null;
let templateApprovalStoreSingleton = null;

async function getTreatmentAgreementStore(config) {
  const filePath = config?.ccoTreatmentAgreementStorePath;
  if (!filePath) return null;
  if (!agreementStoreSingleton) {
    agreementStoreSingleton = await createCcoTreatmentAgreementStore({ filePath });
  }
  return agreementStoreSingleton;
}

async function getTemplateVersionApprovalStore(config) {
  const filePath = config?.ccoTemplateVersionApprovalStorePath;
  if (!filePath) return null;
  if (!templateApprovalStoreSingleton) {
    const { createCcoTemplateVersionApprovalStore } = require('./ccoTemplateVersionApprovalStore');
    templateApprovalStoreSingleton = await createCcoTemplateVersionApprovalStore({ filePath });
  }
  return templateApprovalStoreSingleton;
}

function buildSignal(
  rule,
  { active, confidence, inactiveReason = null, dataProvenance = [] } = {}
) {
  const route = rule.suggestedRoute;
  return {
    ruleId: rule.id,
    status: active ? 'active' : 'inactive',
    what: rule.what,
    why: inactiveReason ? `${rule.why} (${inactiveReason})` : rule.why,
    next: rule.next,
    risk: rule.risk,
    confidence: confidence || rule.confidenceDefault,
    humanApprovalRequired: Boolean(rule.humanApprovalRequired),
    dryRun: true,
    suggestedRoute: route || null,
    dataProvenance,
    step: rule.step,
    priority: riskPriority(rule.risk),
  };
}

function riskPriority(risk) {
  const map = {
    legal_blocker: 95,
    blocker: 90,
    needs_review: 70,
    legal: 65,
    info: 40,
    ready: 30,
  };
  return map[risk] ?? 50;
}

function normalizeKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function evaluateRule(rule, ctx) {
  const { readout, agreement } = ctx;
  if (!rule.v1Enabled) {
    return buildSignal(rule, {
      active: false,
      confidence: 'low',
      inactiveReason: rule.inactiveReason || 'Ej aktiverad i v1',
      dataProvenance: ['registry.v1Enabled'],
    });
  }

  switch (rule.id) {
    case 'customer.missing_health_declaration': {
      const active = readout.missingHealthDeclaration === true || readout.missingForm === true;
      return buildSignal(rule, {
        active,
        confidence: 'medium',
        dataProvenance: ['readout.missingHealthDeclaration'],
      });
    }
    case 'customer.missing_journal': {
      return buildSignal(rule, {
        active: readout.missingJournal === true,
        confidence: 'high',
        dataProvenance: ['readout.missingJournal'],
      });
    }
    case 'customer.missing_treatment_plan': {
      const status = normalizeKey(readout.treatmentPlanStatus);
      const active = !status || !TREATMENT_PLAN_OK.has(status);
      return buildSignal(rule, {
        active,
        confidence: status ? 'medium' : 'low',
        inactiveReason: status ? null : 'Ingen behandlingsplan-status i readout',
        dataProvenance: ['readout.treatmentPlanStatus', 'ccoConsultationStore.getCase'],
      });
    }
    case 'customer.cooling_off_active': {
      const cooling = agreement?.coolingOff || { active: false };
      const active = cooling.active === true;
      return buildSignal(rule, {
        active,
        confidence: agreement ? 'high' : 'low',
        inactiveReason: agreement ? null : 'Inget avtal i store',
        dataProvenance: ['ccoTreatmentAgreementStore.coolingOff'],
      });
    }
    case 'customer.cooling_off_passed': {
      const cooling = agreement?.coolingOff || { active: false };
      const status = agreement?.status || '';
      const active =
        agreement &&
        !cooling.active &&
        (status === 'sent' || status === 'cooling_off' || status === 'patient_info_sent');
      return buildSignal(rule, {
        active,
        confidence: agreement ? 'high' : 'low',
        inactiveReason: agreement ? null : 'Inget avtal i store',
        dataProvenance: ['ccoTreatmentAgreementStore.coolingOff'],
      });
    }
    case 'customer.missing_agreement_consent_bundle': {
      const bundleReady = agreement?.bookable === true;
      const active =
        readout.hasJournal === true && (readout.missingAgreement === true || !bundleReady);
      return buildSignal(rule, {
        active,
        confidence: 'medium',
        inactiveReason: bundleReady ? 'Bundle + mall-godkännande uppfyllt' : null,
        dataProvenance: [
          'readout.missingAgreement',
          'readout.hasJournal',
          'agreement.bookable',
          'templateVersionApproval',
        ],
      });
    }
    case 'customer.missing_operation_day_insurance': {
      const active = readout.todayVisit === true && readout.fitnessSigned !== true;
      return buildSignal(rule, {
        active,
        confidence: readout.todayVisit ? 'high' : 'low',
        inactiveReason: readout.todayVisit ? null : 'Ej operationsdag (todayVisit=false)',
        dataProvenance: ['readout.todayVisit', 'readout.fitnessSigned'],
      });
    }
    case 'customer.missing_photo_consent': {
      const hasPhoto = readout.hasJournalPhoto === true || readout.needsPhotoReview === true;
      const signed = readout.photoConsent?.signed === true;
      const active = hasPhoto && !signed;
      return buildSignal(rule, {
        active,
        confidence: hasPhoto ? 'high' : 'low',
        inactiveReason: hasPhoto ? null : 'Inget journalfoto som kräver samtycke',
        dataProvenance: ['readout.hasJournalPhoto', 'readout.photoConsent.signed'],
      });
    }
    case 'customer.has_photo_review': {
      return buildSignal(rule, {
        active: readout.needsPhotoReview === true,
        confidence: 'high',
        dataProvenance: ['readout.needsPhotoReview'],
      });
    }
    case 'customer.ready_for_treatment': {
      const active = readout.readyForTreatment === true;
      return buildSignal(rule, {
        active,
        confidence: active ? 'high' : 'medium',
        inactiveReason: active ? null : 'Komposit readiness ej uppfylld',
        dataProvenance: ['readout.readyForTreatment'],
      });
    }
    case 'conversation.unanswered_inbound': {
      const cc = ctx.conversationContext || {};
      const active = (cc.unanswered?.count || 0) > 0;
      return buildSignal(rule, {
        active,
        confidence: active ? 'high' : 'medium',
        inactiveReason: active ? null : 'Inga obesvarade konversationer',
        dataProvenance: ['conversationContext.unanswered.count'],
      });
    }
    case 'conversation.sla_breach': {
      const cc = ctx.conversationContext || {};
      const active = normalizeKey(cc.slaStatus?.slaStatus) === 'breach';
      return buildSignal(rule, {
        active,
        confidence: active ? 'high' : 'medium',
        inactiveReason: active ? null : 'Ingen aktiv SLA-breach',
        dataProvenance: ['conversationContext.slaStatus.slaStatus'],
      });
    }
    case 'conversation.frustrated_tone': {
      const cc = ctx.conversationContext || {};
      const tone = normalizeKey(cc.sentiment?.tone || cc.temperature?.temperature);
      const dominantRisk = normalizeKey(cc.dominantRisk);
      const active =
        tone === 'frustrated' ||
        tone === 'angry' ||
        tone === 'negative' ||
        dominantRisk === 'frustrated' ||
        dominantRisk === 'complaint';
      return buildSignal(rule, {
        active,
        confidence: active ? 'medium' : 'low',
        inactiveReason: active ? null : 'Ingen frustrerad/missnöjd signal',
        dataProvenance: ['conversationContext.sentiment.tone', 'conversationContext.dominantRisk'],
      });
    }
    case 'conversation.booking_request_intent': {
      const cc = ctx.conversationContext || {};
      const intent = normalizeKey(cc.intent?.code);
      const active = intent === 'booking' || intent === 'book' || intent === 'appointment';
      return buildSignal(rule, {
        active,
        confidence: active ? 'medium' : 'low',
        inactiveReason: active ? null : 'Ingen bokningsavsikt identifierad',
        dataProvenance: ['conversationContext.intent.code'],
      });
    }
    case 'conversation.follow_up_due': {
      const cc = ctx.conversationContext || {};
      const active = (cc.needsActionCount || 0) > 0;
      return buildSignal(rule, {
        active,
        confidence: active ? 'high' : 'medium',
        inactiveReason: active ? null : 'Inga behandlingskrävande ärenden',
        dataProvenance: ['conversationContext.needsActionCount'],
      });
    }
    default:
      return buildSignal(rule, { active: false, confidence: 'low', inactiveReason: 'Okänd regel' });
  }
}

function evaluatePatientSignals(readout, ctx = {}) {
  if (!isAutomationRunnerEnabled() && ctx.forceEvaluate !== true) {
    return { enabled: false, signals: [], reason: 'ENABLE_AUTOMATION_RUNNER är inte true' };
  }
  const { RULES } = require('./ccoAutomationRegistry');
  const registrySignals = RULES.map((rule) => evaluateRule(rule, { ...ctx, readout }));
  const documentSignals = buildDocumentBlockerSignals(ctx.documentReadiness, {
    buildSignal,
  });
  const signals = [...registrySignals, ...documentSignals];
  const active = signals.filter((s) => s.status === 'active');
  active.sort((a, b) => b.priority - a.priority);
  return {
    enabled: true,
    dryRun: true,
    signals,
    topSignal: active[0] || null,
    activeCount: active.length,
  };
}

async function loadAgreementContext(
  treatmentAgreementStore,
  templateVersionApprovalStore,
  tenantId,
  patientId
) {
  if (!treatmentAgreementStore || !patientId) return null;
  try {
    const agreement = await treatmentAgreementStore.getPatientAgreement({
      tenantId,
      patientId,
    });
    if (!agreement) return null;
    const templateApproval = await resolveTemplateApprovalForAgreement(
      templateVersionApprovalStore,
      agreement
    );
    const readout = buildTreatmentAgreementReadout(agreement, { templateApproval });
    return {
      status: readout.status,
      bookable: readout.bookable,
      templateVersionApproved: readout.templateVersionApproved,
      templateId: readout.templateId,
      templateVersion: readout.templateVersion,
      coolingOff: readout.coolingOff || getCoolingOffMeta(agreement),
    };
  } catch {
    return null;
  }
}

module.exports = {
  evaluatePatientSignals,
  evaluateRule,
  loadAgreementContext,
  getTreatmentAgreementStore,
  getTemplateVersionApprovalStore,
  buildSignal,
};
