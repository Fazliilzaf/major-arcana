'use strict';

const {
  getAllDocumentTypes,
  getDocumentTypeById,
  mapFillerForUi,
  mapFlowLabel,
  resolveTypeClinics,
} = require('./ccoDocumentTypeRegistry');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
}

function resolvePrimaryFlow(card = {}) {
  const blob = [...asArray(card.treatmentTypes), card.nextBookingType, card.lastBookingType]
    .join(' ')
    .toLowerCase();
  if (blob.includes('profhilo')) return 'profhilo';
  if (blob.includes('microneedling')) return 'microneedling';
  if (blob.includes('prf')) return 'prf';
  if (blob.includes('prp') && blob.includes('hud')) return 'prp_skin';
  if (blob.includes('prp')) return 'prp_hair';
  return 'tp';
}

function typeAppliesToPatient(type, card, primaryFlow) {
  const flows = type.flowApplies || [];
  const flowMatch = flows.includes('all') || flows.includes(primaryFlow);
  if (!flowMatch) return false;

  const clinics = resolveTypeClinics(type);
  const curatiioOnly = clinics.length === 1 && clinics[0] === 'curatiio';
  if (curatiioOnly) return primaryFlow === 'profhilo';

  const hairtpOnly = clinics.length === 1 && clinics[0] === 'hairtp';
  if (primaryFlow === 'profhilo' && hairtpOnly && !flows.includes('profhilo')) {
    return false;
  }

  return true;
}

function mapInstanceUiStatus(status) {
  const value = normalizeText(status).toLowerCase();
  if (value === 'signed' || value === 'filled' || value === 'delivered' || value === 'archived') {
    return 'signed';
  }
  if (value === 'sent' || value === 'viewed' || value === 'filling' || value === 'pending') {
    return 'pending';
  }
  return 'planned';
}

function statusLabelFor(status) {
  if (status === 'signed') return 'Signerad';
  if (status === 'pending') return 'Att fylla i';
  if (status === 'sent') return 'Skickad';
  return 'Planerad';
}

function inferStatusFromPatientSignals(type, card = {}, journalEntries = []) {
  const entries = asArray(journalEntries);
  const id = type.id;
  if (id === 'haelso_tp_sve' || id === 'health_tp_eng') {
    if (card.missingHealthDeclaration) return 'pending';
    if (entries.some((e) => String(e.journalType || '').includes('health'))) return 'signed';
    if (card.hasForm && !card.missingForm) return 'signed';
    return 'planned';
  }
  if (id === 'friskfoers_tp') {
    if (card.missingFitnessCertificate) return card.hasUpcomingBooking ? 'pending' : 'planned';
    return 'signed';
  }
  if (id === 'foto_samtycke') {
    if (card.photoConsent?.signed) return 'signed';
    return 'planned';
  }
  if (id.startsWith('offert_')) {
    if (card.agreementSigned || card.treatmentPlanStatus === 'accepted') return 'signed';
    if (card.treatmentPlanStatus === 'draft') return 'pending';
    return 'planned';
  }
  if (id.startsWith('journal_')) {
    if (entries.some((e) => e.locked || e.signedAt)) return 'signed';
    if (entries.length > 0) return 'pending';
    return 'planned';
  }
  if (type.filler === 'system_auto') {
    if (card.hasUpcomingBooking && (id.includes('boknings') || id.includes('auto_boknings'))) {
      return 'sent';
    }
    return 'planned';
  }
  return 'planned';
}

function buildRowFromType(type, instance, card, journalEntries) {
  const uiStatus = instance
    ? mapInstanceUiStatus(instance.status)
    : inferStatusFromPatientSignals(type, card, journalEntries);
  const flow = (type.flowApplies || []).find((f) => f !== 'all') || 'tp';
  return {
    instanceId: instance?.instanceId || null,
    documentTypeId: type.id,
    title: type.name,
    flow,
    flowLabel: mapFlowLabel(type.flowApplies),
    filler: mapFillerForUi(type.filler),
    journeyStep: type.journeyStep,
    status: uiStatus,
    statusLabel: statusLabelFor(uiStatus),
    planned: uiStatus === 'planned',
    amount:
      instance?.payload?.amountKr ||
      instance?.payload?.beloppKr ||
      (type.category === 'commit' && type.filler === 'patient' ? null : null),
    signedAt: instance?.signedAt || null,
    signedBy: instance?.actor || null,
    channel: type.formProvider,
  };
}

function groupForType(type) {
  if (type.category === 'commit' && type.filler === 'patient' && type.id.startsWith('offert_')) {
    return 'offers';
  }
  if (type.category === 'commit' && type.filler === 'patient') return 'healthForms';
  if (type.category === 'intake' && type.filler === 'patient') return 'healthForms';
  if (type.category === 'treatment' && type.filler === 'patient') return 'healthForms';
  if (type.filler === 'staff') return 'journals';
  if (type.filler === 'system_auto') return 'autoDocs';
  return null;
}

function buildCounts(rows) {
  const counts = { total: 0, done: 0, pending: 0, upcoming: 0 };
  for (const row of rows) {
    counts.total += 1;
    if (row.status === 'signed' || row.status === 'sent') counts.done += 1;
    else if (row.status === 'pending') counts.pending += 1;
    else counts.upcoming += 1;
  }
  return counts;
}

function buildFilterCounts(rows) {
  const fillerCounts = { patient: 0, staff: 0, auto: 0 };
  const flowCounts = { tp: 0, prp_hair: 0, all: 0 };
  for (const row of rows) {
    if (row.filler === 'patient') fillerCounts.patient += 1;
    else if (row.filler === 'staff') fillerCounts.staff += 1;
    else fillerCounts.auto += 1;
    if (row.flow === 'tp') flowCounts.tp += 1;
    else if (String(row.flow).startsWith('prp')) flowCounts.prp_hair += 1;
    else flowCounts.all += 1;
  }
  return { fillerCounts, flowCounts };
}

async function buildPatientDocumentBundle({
  tenantId,
  patientId,
  card = {},
  journalEntries = [],
  documentInstanceStore = null,
}) {
  const primaryFlow = resolvePrimaryFlow(card);
  const instances = documentInstanceStore
    ? await documentInstanceStore.listForPatient({ tenantId, patientId })
    : [];
  const instanceByType = new Map(instances.map((row) => [row.documentTypeId, row]));

  const groups = {
    offers: [],
    healthForms: [],
    haelsoSamtycke: [],
    journals: [],
    journaler: [],
    autoDocs: [],
    autoDokument: [],
  };

  const allRows = [];

  for (const type of getAllDocumentTypes()) {
    if (!(type.surfaces || []).includes('document_group')) continue;
    if (!typeAppliesToPatient(type, card, primaryFlow)) continue;
    const bucket = groupForType(type);
    if (!bucket) continue;
    const row = buildRowFromType(type, instanceByType.get(type.id), card, journalEntries);
    groups[bucket].push(row);
    if (bucket === 'healthForms') groups.haelsoSamtycke.push(row);
    if (bucket === 'journals') groups.journaler.push(row);
    if (bucket === 'autoDocs') groups.autoDokument.push(row);
    allRows.push(row);
  }

  const counts = buildCounts(allRows);
  const filtersAvailable = buildFilterCounts(allRows);

  return {
    ready: true,
    registryVersion: 1,
    registryCount: getAllDocumentTypes().length,
    primaryFlow,
    counts: {
      total: counts.total,
      done: counts.done,
      pending: counts.pending,
      upcoming: counts.upcoming,
      klara: counts.done,
      vantar: counts.pending,
      kommer: counts.upcoming,
    },
    filtersAvailable,
    groups,
    documents: {
      offers: groups.offers,
      healthForms: groups.healthForms,
      haelsoSamtycke: groups.haelsoSamtycke,
      consents: groups.healthForms,
      journalStatus: { expected: groups.journals },
      journaler: groups.journaler,
      journals: groups.journals,
      autoDocs: groups.autoDocs,
      autoDokument: groups.autoDokument,
      filtersAvailable,
      counts: {
        total: counts.total,
        done: counts.done,
        pending: counts.pending,
        upcoming: counts.upcoming,
      },
    },
  };
}

module.exports = {
  buildPatientDocumentBundle,
  resolvePrimaryFlow,
  mapInstanceUiStatus,
  inferStatusFromPatientSignals,
  typeAppliesToPatient,
  groupForType,
  getDocumentTypeById,
};
