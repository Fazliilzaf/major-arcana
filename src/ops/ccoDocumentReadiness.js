'use strict';

const { getAllDocumentTypes, getDocumentTypeById } = require('./ccoDocumentTypeRegistry');
const {
  resolvePrimaryFlow,
  mapInstanceUiStatus,
  inferStatusFromPatientSignals,
  typeAppliesToPatient,
} = require('./ccoPatientDocumentAggregator');

const REQUIRED_FOR_LABELS = Object.freeze({
  konsultation: 'konsultation',
  konsult: 'konsultation',
  offert: 'offert',
  avtal: 'avtal och samtycke',
  behandling: 'behandling',
  op_dag: 'operationsdagen',
  behandlingsdag: 'behandlingsdagen',
  pre_op: 'förberedelse inför operation',
  accept: 'accept av behandlingsplan',
  info_samtycke: 'patientsamtycke',
  foto_publik: 'foto för publicering',
  foto_protokoll: 'foto-protokoll',
  follow_up: 'uppföljning',
  '4_man_check': '4-månaderskontroll',
  '6_man_check': '6-månaderskontroll',
  '12_man_final': '12-månaderskontroll',
  undantag_betanketid: 'undantag betänketid',
  undantag_angerratt: 'undantag ångerrätt',
});

const STEP_TO_ACTION_IDS = Object.freeze({
  konsultation: ['form'],
  konsult: ['journal'],
  offert: ['offer'],
  avtal: ['agreement', 'book'],
  behandling: ['book', 'rebook'],
  op_dag: ['book', 'rebook'],
  behandlingsdag: ['book', 'rebook'],
  pre_op: ['book', 'rebook'],
  accept: ['book', 'rebook'],
  info_samtycke: ['agreement'],
  foto_publik: ['photo'],
  foto_protokoll: ['photo'],
});

const LEGAL_STEPS = new Set([
  'avtal',
  'info_samtycke',
  'foto_publik',
  'undantag_betanketid',
  'undantag_angerratt',
]);

function isDocumentStatusSatisfied(uiStatus) {
  return uiStatus === 'signed';
}

function statusLabelForUi(uiStatus) {
  if (uiStatus === 'signed') return 'klart';
  if (uiStatus === 'pending') return 'väntar ifyllnad';
  return 'planerat';
}

function evaluateDocumentReadiness({ card = {}, instances = [], journalEntries = [] } = {}) {
  const primaryFlow = resolvePrimaryFlow(card);
  const instanceByType = new Map(
    (instances || []).filter((row) => row.documentTypeId).map((row) => [row.documentTypeId, row])
  );

  const evaluatedTypes = [];
  for (const type of getAllDocumentTypes()) {
    const requiredFor = type.requiredFor || [];
    if (!requiredFor.length) continue;
    if (!typeAppliesToPatient(type, card, primaryFlow)) continue;

    const instance = instanceByType.get(type.id);
    const uiStatus = instance
      ? mapInstanceUiStatus(instance.status)
      : inferStatusFromPatientSignals(type, card, journalEntries);
    evaluatedTypes.push({
      type,
      uiStatus,
      satisfied: isDocumentStatusSatisfied(uiStatus),
    });
  }

  const satisfiedSteps = new Set();
  for (const row of evaluatedTypes) {
    if (!row.satisfied) continue;
    for (const step of row.type.requiredFor || []) {
      satisfiedSteps.add(step);
    }
  }

  const blockers = [];
  const satisfied = [];
  const blockedStepsSet = new Set();

  for (const row of evaluatedTypes) {
    if (row.satisfied) {
      satisfied.push({
        documentTypeId: row.type.id,
        documentName: row.type.name,
        requiredFor: row.type.requiredFor,
        status: row.uiStatus,
      });
      continue;
    }

    for (const step of row.type.requiredFor || []) {
      if (satisfiedSteps.has(step)) continue;
      blockedStepsSet.add(step);
      blockers.push({
        step,
        documentTypeId: row.type.id,
        documentName: row.type.name,
        journeyStep: row.type.journeyStep,
        status: row.uiStatus,
        reason: `${row.type.name} är ${statusLabelForUi(row.uiStatus)} — krävs för ${REQUIRED_FOR_LABELS[step] || step}`,
      });
    }
  }

  return {
    blockers,
    satisfied,
    blockedSteps: [...blockedStepsSet],
    hasBlockers: blockers.length > 0,
    primaryFlow,
  };
}

function buildDocumentBlockerSignals(readiness, { buildSignal, rulesById = {} } = {}) {
  if (!readiness?.hasBlockers) return [];

  const byStep = new Map();
  for (const blocker of readiness.blockers || []) {
    if (!byStep.has(blocker.step)) byStep.set(blocker.step, []);
    byStep.get(blocker.step).push(blocker);
  }

  const signals = [];
  for (const [step, items] of byStep.entries()) {
    const ruleId = `document.requiredFor.${step}`;
    const rule = rulesById[ruleId] || {
      id: ruleId,
      step: Math.min(...items.map((item) => Number(item.journeyStep) || 99)),
      what: `Dokument saknas för ${REQUIRED_FOR_LABELS[step] || step}`,
      why: `${items.map((item) => item.documentName).join(' · ')} — signera/fyll i innan nästa steg`,
      next: 'Öppna dokument-segmentet på kundkortet',
      risk: LEGAL_STEPS.has(step) ? 'legal_blocker' : 'blocker',
      humanApprovalRequired: LEGAL_STEPS.has(step),
      suggestedRoute: null,
      confidenceDefault: 'high',
      v1Enabled: true,
    };

    if (typeof buildSignal === 'function') {
      signals.push(
        buildSignal(rule, {
          active: true,
          confidence: 'high',
          dataProvenance: ['ccoDocumentReadiness.requiredFor', `step.${step}`],
        })
      );
    } else {
      signals.push({
        ruleId: rule.id,
        status: 'active',
        what: rule.what,
        why: rule.why,
        next: rule.next,
        risk: rule.risk,
        confidence: 'high',
        humanApprovalRequired: Boolean(rule.humanApprovalRequired),
        dryRun: true,
        suggestedRoute: null,
        dataProvenance: ['ccoDocumentReadiness.requiredFor', `step.${step}`],
        step: rule.step,
        priority: LEGAL_STEPS.has(step) ? 95 : 90,
      });
    }
  }

  return signals;
}

function mapBlockersToActionIds(blockedSteps = []) {
  const actionIds = new Set();
  for (const step of blockedSteps) {
    for (const actionId of STEP_TO_ACTION_IDS[step] || []) {
      actionIds.add(actionId);
    }
  }
  return [...actionIds];
}

function actionBlockedByDocuments(actionId, blockedActionIds = []) {
  return blockedActionIds.includes(actionId);
}

module.exports = {
  REQUIRED_FOR_LABELS,
  STEP_TO_ACTION_IDS,
  evaluateDocumentReadiness,
  buildDocumentBlockerSignals,
  mapBlockersToActionIds,
  actionBlockedByDocuments,
  isDocumentStatusSatisfied,
};
