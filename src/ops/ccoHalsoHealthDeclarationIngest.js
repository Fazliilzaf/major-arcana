'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const {
  normalizeEmail,
  normalizePersonnummer,
  normalizePhone,
  phoneMatchKey,
  nameOverlapScore,
} = require('../../scripts/migration/lib/migrationUtils');
const { buildPipedrivePatientLookup } = require('./ccoPatientMasterStore');
const {
  HALSO_MAILBOX,
  isHalsoHealthDeclarationMessage,
  parseHealthDeclarationMessage,
} = require('./ccoHalsoHealthDeclarationParser');
const { PROCESSOR_VERSION } = require('./ccoMailIngestion/constants');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function emptyDedupState() {
  return {
    modelVersion: 'cco.halso.hd-ingest.v1',
    updatedAt: nowIso(),
    entries: {},
    stats: {
      imported: 0,
      updated: 0,
      skippedDuplicate: 0,
      needsReview: 0,
      failed: 0,
    },
  };
}

function buildHealthDeclarationDedupKeys(parsed = {}, rawMessage = {}) {
  const keys = [];
  const internetMessageId = normalizeText(parsed.internetMessageId || rawMessage.internetMessageId);
  if (internetMessageId) keys.push(`internetMessageId:${internetMessageId.toLowerCase()}`);
  if (parsed.personnummer && parsed.signedAt) {
    keys.push(`pnrSignedAt:${parsed.personnummer}:${parsed.signedAt}`);
  }
  if (rawMessage.id) keys.push(`rawMessageId:${rawMessage.id}`);
  return keys;
}

function mergeAllergies(existing = [], incoming = []) {
  return [
    ...new Set([...asArray(existing), ...asArray(incoming)].map(normalizeText).filter(Boolean)),
  ];
}

function mergeHealthDeclaration(existing = null, incoming = null) {
  if (!incoming || typeof incoming !== 'object') return existing || null;
  if (!existing || typeof existing !== 'object') return incoming;
  const existingTs = Date.parse(existing.signedAt || existing.importedAt || 0);
  const incomingTs = Date.parse(incoming.signedAt || incoming.importedAt || 0);
  if (incomingTs >= existingTs) {
    return {
      ...existing,
      ...incoming,
      answers: incoming.answers?.length ? incoming.answers : existing.answers,
      flags: incoming.flags?.length ? incoming.flags : existing.flags,
    };
  }
  return existing;
}

function matchPatientFromParsed(parsed = {}, patients = []) {
  const lookup = buildPipedrivePatientLookup(patients);

  if (parsed.personnummer) {
    const patient = lookup.byPersonnummer.get(parsed.personnummer);
    if (patient) {
      const patientId = patient.id || patient.patientId;
      return {
        status: 'MATCHED',
        confidence: 0.98,
        patientId,
        method: 'personnummer',
        reason: 'personnummer_match',
        candidates: [{ patientId, method: 'personnummer', confidence: 0.98 }],
      };
    }
  }

  const matches = new Map();
  const add = (patient, method, confidence) => {
    const patientId = patient?.id || patient?.patientId;
    if (!patientId) return;
    const existing = matches.get(patientId);
    if (!existing || confidence > existing.confidence) {
      matches.set(patientId, {
        patient: { ...patient, id: patientId },
        method,
        confidence,
      });
    }
  };

  if (parsed.personnummer) {
    const patient = lookup.byPersonnummer.get(parsed.personnummer);
    if (patient) add(patient, 'personnummer', 0.98);
  }

  if (parsed.email) {
    asArray(lookup.byEmail.get(normalizeEmail(parsed.email))).forEach((patient) => {
      add(patient, 'email', 0.9);
    });
  }

  if (parsed.phoneKey) {
    asArray(lookup.byPhone.get(parsed.phoneKey)).forEach((patient) => {
      add(patient, 'phone', 0.85);
    });
  }

  if (parsed.displayName) {
    for (const patient of patients) {
      const pid = patient?.id || patient?.patientId;
      if (!pid) continue;
      const score = nameOverlapScore(parsed.displayName, patient.displayName || '');
      if (score >= 0.85) add(patient, 'displayName', 0.72);
    }
  }

  const candidates = [...matches.values()];
  if (candidates.length === 1) {
    const hit = candidates[0];
    return {
      status: 'MATCHED',
      confidence: hit.confidence,
      patientId: hit.patient.id,
      method: hit.method,
      reason: `${hit.method}_match`,
      candidates: [{ patientId: hit.patient.id, method: hit.method, confidence: hit.confidence }],
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'NEEDS_REVIEW',
      confidence: 0.45,
      patientId: null,
      method: 'ambiguous',
      reason: 'multiple_identity_matches',
      candidates: candidates.map((row) => ({
        patientId: row.patient.id,
        method: row.method,
        confidence: row.confidence,
      })),
    };
  }

  return {
    status: 'UNMATCHED',
    confidence: 0,
    patientId: null,
    method: null,
    reason: 'no_patient_match',
    candidates: [],
  };
}

function createCcoHalsoHealthDeclarationIngest({
  config = {},
  patientMasterStore = null,
  dedupStorePath = '',
  logger = console,
} = {}) {
  if (!patientMasterStore) {
    throw new Error('createCcoHalsoHealthDeclarationIngest requires patientMasterStore');
  }

  const filePath =
    normalizeText(dedupStorePath) ||
    normalizeText(config.ccoHalsoHealthDeclarationDedupStorePath) ||
    path.join(process.cwd(), 'data', 'cco-halso-health-declaration-ingest.json');

  let dedupState = null;

  async function loadDedupState() {
    if (dedupState) return dedupState;
    dedupState = await readJson(filePath, emptyDedupState());
    return dedupState;
  }

  async function saveDedupState() {
    if (!dedupState) return;
    dedupState.updatedAt = nowIso();
    await writeJsonAtomic(filePath, dedupState);
  }

  async function findDuplicateEntry(dedupKeys = []) {
    const state = await loadDedupState();
    for (const key of dedupKeys) {
      if (state.entries[key]) return { key, entry: state.entries[key] };
    }
    return null;
  }

  async function recordDedupEntry(dedupKeys = [], entry = {}) {
    const state = await loadDedupState();
    const payload = { ...entry, recordedAt: nowIso() };
    dedupKeys.forEach((key) => {
      state.entries[key] = payload;
    });
    await saveDedupState();
    return payload;
  }

  async function listPatients(tenantId) {
    const listed = await patientMasterStore.listPatients({
      tenantId: tenantId || config.defaultTenantId || config.defaultTenant || 'hair-tp-clinic',
      limit: 20000,
    });
    return asArray(listed.patients);
  }

  async function createReviewStubPatient(parsed, tenantId) {
    const payload = {
      tenantId,
      personnummer: parsed.personnummer || '',
      displayName: parsed.displayName || 'Hälsodeklaration (ogranskad)',
      firstName: parsed.firstName || '',
      lastName: parsed.lastName || '',
      primaryEmail: parsed.email || '',
      primaryPhone: parsed.phone || '',
      emails: parsed.email ? [parsed.email] : [],
      phones: parsed.phone ? [parsed.phone] : [],
      matchStatus: 'needs_review',
      matchConfidence: 0.2,
      flags: ['needs_review', 'halso_import_stub'],
    };
    const saved = await patientMasterStore.upsertPatient(payload);
    return saved;
  }

  async function upsertHealthDeclarationOnPatient({
    patient,
    parsed,
    rawMessage,
    match,
    tenantId,
    reviewRequired = false,
  }) {
    const healthDeclaration = {
      source: 'halso_mailbox',
      channel: parsed.channel,
      signedAt: parsed.signedAt,
      consent: parsed.consent,
      importedAt: nowIso(),
      internetMessageId: parsed.internetMessageId || rawMessage.internetMessageId || '',
      rawMessageId: parsed.rawMessageId || rawMessage.id || '',
      mailboxId: normalizeEmail(rawMessage.mailboxId || HALSO_MAILBOX),
      subject: parsed.subject || rawMessage.subject || '',
      matchMethod: match.method,
      matchConfidence: match.confidence,
      reviewRequired,
      answers: parsed.answers,
      flags: parsed.flags,
      processorVersion: PROCESSOR_VERSION,
    };

    const allergies = mergeAllergies(patient.allergies, parsed.allergies);
    const mergedHealthDeclaration = mergeHealthDeclaration(
      patient.healthDeclaration,
      healthDeclaration
    );

    const saved = await patientMasterStore.upsertPatient({
      ...patient,
      tenantId: patient.tenantId || tenantId,
      personnummer: patient.personnummer || parsed.personnummer || '',
      primaryEmail: patient.primaryEmail || parsed.email || '',
      primaryPhone: patient.primaryPhone || parsed.phone || '',
      displayName: patient.displayName || parsed.displayName || '',
      healthDeclaration: mergedHealthDeclaration,
      allergies,
      matchStatus: reviewRequired ? 'needs_review' : patient.matchStatus,
    });

    return saved;
  }

  async function processRawMessage({
    rawMessage = {},
    mode = 'read_only',
    tenantId = '',
    store = null,
    ledger = null,
    persist = true,
  } = {}) {
    const resolvedTenantId =
      tenantId || config.defaultTenantId || config.defaultTenant || 'hair-tp-clinic';

    if (!isHalsoHealthDeclarationMessage(rawMessage, config)) {
      return { skipped: true, reason: 'not_halso_health_declaration', rawMessage };
    }

    const parsed = parseHealthDeclarationMessage(rawMessage);
    if (!parsed.ok) {
      if (store && ledger) {
        await store.updateLedger(
          ledger.id,
          {
            status: 'DUPLICATE_SKIPPED',
            errorCode: 'halso_hd_parse_failed',
            errorMessage: parsed.reason,
            completedAt: nowIso(),
          },
          { persist }
        );
      }
      return { skipped: true, reason: parsed.reason, rawMessage, parsed };
    }

    const dedupKeys = buildHealthDeclarationDedupKeys(parsed, rawMessage);
    const duplicate = await findDuplicateEntry(dedupKeys);
    if (duplicate) {
      const state = await loadDedupState();
      state.stats.skippedDuplicate += 1;
      await saveDedupState();
      if (store && ledger) {
        await store.updateLedger(
          ledger.id,
          {
            status: 'DUPLICATE_SKIPPED',
            patientMatchStatus: 'DUPLICATE',
            errorCode: 'halso_hd_duplicate',
            errorMessage: duplicate.key,
            completedAt: nowIso(),
          },
          { persist }
        );
      }
      return {
        skipped: true,
        reason: 'duplicate',
        dedupKey: duplicate.key,
        patientId: duplicate.entry?.patientId || null,
        rawMessage,
        parsed,
      };
    }

    const patients = await listPatients(resolvedTenantId);
    const match = matchPatientFromParsed(parsed, patients);
    const reviewRequired = match.status !== 'MATCHED';

    if (mode === 'dry_run') {
      return {
        skipped: false,
        dryRun: true,
        match,
        parsed,
        dedupKeys,
        rawMessage,
      };
    }

    let targetPatient = null;
    if (match.status === 'MATCHED' && match.patientId) {
      const found = await patientMasterStore.getPatient({
        tenantId: resolvedTenantId,
        patientId: match.patientId,
      });
      targetPatient = found || null;
    } else if (match.status === 'UNMATCHED') {
      targetPatient = await createReviewStubPatient(parsed, resolvedTenantId);
      match.patientId = targetPatient?.id || null;
    } else if (match.status === 'NEEDS_REVIEW') {
      const state = await loadDedupState();
      state.stats.needsReview += 1;
      await saveDedupState();
      if (store && ledger) {
        await store.updateLedger(
          ledger.id,
          {
            status: 'NEEDS_REVIEW',
            patientMatchStatus: 'NEEDS_REVIEW',
            errorCode: 'halso_hd_ambiguous_match',
            errorMessage: match.reason,
            processedAt: nowIso(),
            completedAt: nowIso(),
          },
          { persist }
        );
        await store.savePatientMatch(
          {
            id: `${rawMessage.id}:halso-hd-match`,
            rawMessageId: rawMessage.id,
            status: 'NEEDS_REVIEW',
            confidence: match.confidence,
            patientId: null,
            reason: match.reason,
            candidates: match.candidates,
            matchVersion: 'halso-hd-v1',
            createdAt: nowIso(),
          },
          { persist }
        );
      }
      return {
        skipped: false,
        imported: false,
        needsReview: true,
        match,
        parsed,
        dedupKeys,
        rawMessage,
      };
    }

    if (!targetPatient) {
      const state = await loadDedupState();
      state.stats.failed += 1;
      await saveDedupState();
      throw new Error('halso_hd_target_patient_missing');
    }

    const updatedPatient = await upsertHealthDeclarationOnPatient({
      patient: targetPatient,
      parsed,
      rawMessage,
      match,
      tenantId: resolvedTenantId,
      reviewRequired,
    });

    const state = await loadDedupState();
    const isUpdate = Boolean(targetPatient.healthDeclaration?.signedAt);
    if (isUpdate) state.stats.updated += 1;
    else state.stats.imported += 1;
    if (reviewRequired) state.stats.needsReview += 1;
    await recordDedupEntry(dedupKeys, {
      patientId: updatedPatient.id,
      signedAt: parsed.signedAt,
      internetMessageId: parsed.internetMessageId || rawMessage.internetMessageId || '',
      matchMethod: match.method,
      reviewRequired,
    });

    if (store && ledger) {
      await store.updateLedger(
        ledger.id,
        {
          status: reviewRequired ? 'NEEDS_REVIEW' : 'COMPLETED',
          patientMatchStatus: match.status,
          patientId: updatedPatient.id,
          processedAt: nowIso(),
          completedAt: nowIso(),
        },
        { persist }
      );
      await store.savePatientMatch(
        {
          id: `${rawMessage.id}:halso-hd-match`,
          rawMessageId: rawMessage.id,
          status: match.status,
          confidence: match.confidence,
          patientId: updatedPatient.id,
          reason: match.reason,
          candidates: match.candidates,
          matchVersion: 'halso-hd-v1',
          createdAt: nowIso(),
        },
        { persist }
      );
      await store.appendAudit(
        {
          type: 'halso_health_declaration_imported',
          rawMessageId: rawMessage.id,
          patientId: updatedPatient.id,
          matchMethod: match.method,
          reviewRequired,
          signedAt: parsed.signedAt,
        },
        { persist }
      );
    }

    logger?.log?.(
      `[halso-hd-ingest] patient=${updatedPatient.id} match=${match.method || 'stub'} review=${reviewRequired}`
    );

    return {
      skipped: false,
      imported: true,
      updated: isUpdate,
      needsReview: reviewRequired,
      match,
      parsed,
      patientId: updatedPatient.id,
      dedupKeys,
      rawMessage,
    };
  }

  async function getStats() {
    const state = await loadDedupState();
    return {
      ...state.stats,
      totalEntries: Object.keys(state.entries || {}).length,
      updatedAt: state.updatedAt,
    };
  }

  return {
    HALSO_MAILBOX,
    buildHealthDeclarationDedupKeys,
    isHalsoHealthDeclarationMessage: (rawMessage) =>
      isHalsoHealthDeclarationMessage(rawMessage, config),
    matchPatientFromParsed,
    mergeHealthDeclaration,
    processRawMessage,
    getStats,
  };
}

module.exports = {
  buildHealthDeclarationDedupKeys,
  createCcoHalsoHealthDeclarationIngest,
  matchPatientFromParsed,
  mergeHealthDeclaration,
};
