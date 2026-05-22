'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  normalizeEmail,
  normalizeKey,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  splitName,
  nameOverlapScore,
} = require('../../scripts/migration/lib/migrationUtils');

const PATIENT_FLAGS = Object.freeze([
  'missing_email',
  'missing_phone',
  'missing_personnummer',
  'duplicate_email',
  'drive_only',
  'cliento_only',
  'needs_review',
]);

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tenants: {},
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function tenantBucket(state, tenantId) {
  const tenant = normalizeText(tenantId);
  if (!tenant) throw new Error('tenantId saknas.');
  state.tenants = state.tenants || {};
  if (!state.tenants[tenant]) {
    state.tenants[tenant] = {
      patients: [],
      imports: {},
      stats: {},
    };
  }
  return state.tenants[tenant];
}

function patientKey(tenantId, personnummer) {
  const pnr = normalizePersonnummer(personnummer);
  if (!pnr) return '';
  return `${normalizeText(tenantId)}::${pnr}`;
}

function normalizeFlags(flags) {
  return [
    ...new Set(
      asArray(flags)
        .map((item) => normalizeKey(item))
        .filter((item) => PATIENT_FLAGS.includes(item))
    ),
  ];
}

function normalizeClientoRecord(input = {}) {
  const safe = asObject(input);
  const name = normalizeText(safe.name || safe.Namn);
  const { firstName, lastName } = splitName(name);
  const emails = [
    ...new Set(
      [
        normalizeEmail(safe.email),
        normalizeEmail(safe['E-post']),
        normalizeEmail(safe.customerEmail),
      ].filter(Boolean)
    ),
  ];
  const phones = [
    ...new Set(
      [
        normalizePhone(safe.phone),
        normalizePhone(safe.Telefon),
        normalizePhone(safe.customerPhone),
      ].filter(Boolean)
    ),
  ];
  return {
    source: 'cliento',
    sourceId: normalizeText(safe.sourceId || safe.rowNumber),
    name,
    firstName,
    lastName,
    emails,
    primaryEmail: emails[0] || '',
    phones,
    primaryPhone: phones[0] || '',
    clientoCreatedAt: normalizeText(safe.createdAt || safe.Skapad),
    importedAt: nowIso(),
  };
}

function normalizeDriveRecord(input = {}) {
  const safe = asObject(input);
  const personnummer = normalizePersonnummer(safe.personnummer);
  const displayName = normalizeText(safe.displayName);
  const { firstName, lastName } = splitName(displayName);
  return {
    source: 'drive',
    personnummer,
    displayName,
    firstName: normalizeText(safe.firstName) || firstName,
    lastName: normalizeText(safe.lastName) || lastName,
    fileCount: Number(safe.fileCount) || 0,
    journalPdfCount: Number(safe.journalPdfCount) || 0,
    imageCount: Number(safe.imageCount) || 0,
    importedAt: nowIso(),
  };
}

function computeFlags(patient) {
  const flags = [];
  if (!patient.primaryEmail && !asArray(patient.emails).length) flags.push('missing_email');
  if (!patient.primaryPhone && !asArray(patient.phones).length) flags.push('missing_phone');
  if (!patient.personnummer) flags.push('missing_personnummer');
  if (patient.matchStatus === 'drive_only') flags.push('drive_only');
  if (patient.matchStatus === 'cliento_only') flags.push('cliento_only');
  if (patient.matchStatus === 'needs_review') flags.push('needs_review');
  if (patient.duplicateEmail) flags.push('duplicate_email');
  if (Number(asObject(patient.fileSummary).totalFiles) > 0) flags.push('has_drive_files');
  return normalizeFlags(flags);
}

function normalizePatientRecord(input = {}, existing = {}) {
  const safe = asObject(input);
  const existingSafe = asObject(existing);
  const personnummer =
    normalizePersonnummer(safe.personnummer) || normalizePersonnummer(existingSafe.personnummer);
  const tenantId = normalizeText(safe.tenantId || existingSafe.tenantId);
  const emails = [
    ...new Set(
      [...asArray(safe.emails), ...asArray(existingSafe.emails), normalizeEmail(safe.primaryEmail)]
        .map(normalizeEmail)
        .filter(Boolean)
    ),
  ];
  const phones = [
    ...new Set(
      [...asArray(safe.phones), ...asArray(existingSafe.phones), normalizePhone(safe.primaryPhone)]
        .map(normalizePhone)
        .filter(Boolean)
    ),
  ];
  const firstName = normalizeText(safe.firstName || existingSafe.firstName);
  const lastName = normalizeText(safe.lastName || existingSafe.lastName);
  const displayName =
    normalizeText(safe.displayName || existingSafe.displayName) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    normalizeText(safe.name || existingSafe.name);

  const patient = {
    id: normalizeText(safe.id || existingSafe.id) || crypto.randomUUID(),
    tenantId,
    personnummer,
    displayName,
    firstName,
    lastName,
    primaryEmail: normalizeEmail(safe.primaryEmail || existingSafe.primaryEmail) || emails[0] || '',
    primaryPhone: normalizePhone(safe.primaryPhone || existingSafe.primaryPhone) || phones[0] || '',
    emails,
    phones,
    matchStatus: normalizeKey(safe.matchStatus || existingSafe.matchStatus) || 'unmatched',
    matchConfidence: Number.isFinite(Number(safe.matchConfidence))
      ? Number(safe.matchConfidence)
      : Number(existingSafe.matchConfidence) || 0,
    duplicateEmail: Boolean(safe.duplicateEmail ?? existingSafe.duplicateEmail),
    cliento: safe.cliento || existingSafe.cliento || null,
    drive: safe.drive || existingSafe.drive || null,
    fileSummary: {
      totalFiles:
        Number(
          asObject(safe.fileSummary).totalFiles || asObject(existingSafe.fileSummary).totalFiles
        ) || 0,
      journalPdfs:
        Number(
          asObject(safe.fileSummary).journalPdfs || asObject(existingSafe.fileSummary).journalPdfs
        ) || 0,
      images:
        Number(asObject(safe.fileSummary).images || asObject(existingSafe.fileSummary).images) || 0,
    },
    flags: [],
    createdAt: normalizeText(existingSafe.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
  patient.flags = computeFlags(patient);
  return patient;
}

function clonePatient(patient) {
  return JSON.parse(JSON.stringify(patient));
}

function buildPatientCardReadout(patient) {
  const safe = asObject(patient);
  return {
    patientId: safe.id,
    personnummer: safe.personnummer || '',
    displayName: safe.displayName || '',
    primaryEmail: safe.primaryEmail || '',
    primaryPhone: safe.primaryPhone || '',
    matchStatus: safe.matchStatus || 'unmatched',
    matchConfidence: safe.matchConfidence || 0,
    flags: asArray(safe.flags),
    fileSummary: asObject(safe.fileSummary),
    hasJournalHistory: Number(asObject(safe.fileSummary).journalPdfs) > 0,
    hasImages: Number(asObject(safe.fileSummary).images) > 0,
    clientoLinked: Boolean(safe.cliento),
    driveLinked: Boolean(safe.drive),
    updatedAt: safe.updatedAt || null,
  };
}

async function createCcoPatientMasterStore({ filePath }) {
  const state = await readJson(filePath, emptyState());

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getPatient({ tenantId, patientId, personnummer } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const byId = normalizeText(patientId);
    const pnr = normalizePersonnummer(personnummer);
    const found = bucket.patients.find((item) => {
      if (byId && item.id === byId) return true;
      if (pnr && normalizePersonnummer(item.personnummer) === pnr) return true;
      return false;
    });
    return found ? clonePatient(found) : null;
  }

  async function findPatientByEmail({ tenantId, email } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    const bucket = tenantBucket(state, tenantId);
    const found = bucket.patients.find((item) => {
      if (normalizeEmail(item.primaryEmail) === normalizedEmail) return true;
      return asArray(item.emails).some((value) => normalizeEmail(value) === normalizedEmail);
    });
    return found ? clonePatient(found) : null;
  }

  async function upsertPatient(input = {}) {
    const normalized = normalizePatientRecord(input);
    if (!normalized.tenantId) throw new Error('tenantId saknas.');
    const bucket = tenantBucket(state, normalized.tenantId);
    const pnr = normalizePersonnummer(normalized.personnummer);
    let index = -1;
    if (pnr) {
      index = bucket.patients.findIndex((item) => normalizePersonnummer(item.personnummer) === pnr);
    }
    if (index < 0 && normalized.id) {
      index = bucket.patients.findIndex((item) => item.id === normalized.id);
    }
    if (index >= 0) {
      bucket.patients[index] = normalizePatientRecord(normalized, bucket.patients[index]);
    } else {
      bucket.patients.push(normalized);
    }
    await save();
    return getPatient({
      tenantId: normalized.tenantId,
      patientId: normalized.id,
      personnummer: normalized.personnummer,
    });
  }

  async function listPatients({ tenantId, query = '', flags = [], limit = 100, offset = 0 } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const q = normalizeKey(query);
    const flagSet = new Set(asArray(flags).map(normalizeKey).filter(Boolean));
    let rows = bucket.patients.slice();
    if (q) {
      rows = rows.filter((item) => {
        const haystack = [
          item.displayName,
          item.personnummer,
          item.primaryEmail,
          item.primaryPhone,
          ...(item.emails || []),
          ...(item.phones || []),
        ]
          .map(normalizeKey)
          .join(' ');
        return haystack.includes(q);
      });
    }
    if (flagSet.size) {
      if (flagSet.has('has_drive_files')) {
        rows = rows.filter((item) => Number(asObject(item.fileSummary).totalFiles) > 0);
        flagSet.delete('has_drive_files');
      }
      if (flagSet.size) {
        rows = rows.filter((item) =>
          asArray(item.flags).some((flag) => flagSet.has(normalizeKey(flag)))
        );
      }
    }
    rows.sort((a, b) => {
      const nameA = normalizeKey(a.displayName);
      const nameB = normalizeKey(b.displayName);
      if (nameA && nameB) return nameA.localeCompare(nameB, 'sv');
      return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
    });
    const start = Math.max(0, Number(offset) || 0);
    const max = Math.max(1, Math.min(20000, Number(limit) || 100));
    return {
      total: rows.length,
      offset: start,
      limit: max,
      patients: rows.slice(start, start + max).map(clonePatient),
    };
  }

  async function importClientoRows({ tenantId, rows = [], duplicateEmails = new Set() } = {}) {
    const bucket = tenantBucket(state, tenantId);
    let created = 0;
    let updated = 0;
    for (const row of asArray(rows)) {
      const cliento = normalizeClientoRecord(row);
      const primaryEmail = cliento.primaryEmail;
      const existingByEmail = primaryEmail
        ? bucket.patients.find((item) =>
            asArray(item.emails).some((email) => normalizeEmail(email) === primaryEmail)
          )
        : null;
      const payload = {
        tenantId,
        displayName: cliento.name,
        firstName: cliento.firstName,
        lastName: cliento.lastName,
        primaryEmail,
        primaryPhone: cliento.primaryPhone,
        emails: cliento.emails,
        phones: cliento.phones,
        cliento,
        matchStatus: existingByEmail ? 'needs_review' : 'cliento_only',
        duplicateEmail: primaryEmail ? duplicateEmails.has(primaryEmail) : false,
      };
      if (existingByEmail) {
        await upsertPatient({ ...existingByEmail, ...payload, id: existingByEmail.id });
        updated += 1;
      } else {
        await upsertPatient(payload);
        created += 1;
      }
    }
    bucket.imports.cliento = {
      importedAt: nowIso(),
      totalRows: rows.length,
      created,
      updated,
    };
    await save();
    return bucket.imports.cliento;
  }

  async function mergeDriveProfiles({ tenantId, profiles = [] } = {}) {
    const bucket = tenantBucket(state, tenantId);
    let matched = 0;
    let driveOnly = 0;
    for (const profile of asArray(profiles)) {
      const drive = normalizeDriveRecord(profile);
      const pnr = drive.personnummer;
      if (!pnr) continue;
      let existing = bucket.patients.find(
        (item) => normalizePersonnummer(item.personnummer) === pnr
      );
      if (!existing && drive.displayName) {
        existing = bucket.patients.find((item) => {
          if (item.matchStatus !== 'cliento_only' && !item.cliento) return false;
          return nameOverlapScore(item.displayName, drive.displayName) >= 0.66;
        });
      }
      const fileSummary = {
        totalFiles: drive.fileCount,
        journalPdfs: drive.journalPdfCount,
        images: drive.imageCount,
      };
      if (existing) {
        await upsertPatient({
          ...existing,
          personnummer: pnr,
          displayName: existing.displayName || drive.displayName,
          firstName: existing.firstName || drive.firstName,
          lastName: existing.lastName || drive.lastName,
          drive,
          fileSummary,
          matchStatus: existing.cliento ? 'matched' : 'drive_only',
          matchConfidence: existing.cliento ? 0.95 : 0.7,
        });
        matched += 1;
      } else {
        await upsertPatient({
          tenantId,
          personnummer: pnr,
          displayName: drive.displayName,
          firstName: drive.firstName,
          lastName: drive.lastName,
          drive,
          fileSummary,
          matchStatus: 'drive_only',
          matchConfidence: 0.7,
        });
        driveOnly += 1;
      }
    }
    bucket.imports.drive = {
      importedAt: nowIso(),
      profiles: profiles.length,
      matched,
      driveOnly,
    };
    await save();
    return bucket.imports.drive;
  }

  async function getTenantStats({ tenantId } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const patients = asArray(bucket.patients);
    return {
      totalPatients: patients.length,
      withPersonnummer: patients.filter((item) => item.personnummer).length,
      matched: patients.filter((item) => item.matchStatus === 'matched').length,
      clientoOnly: patients.filter((item) => item.matchStatus === 'cliento_only').length,
      driveOnly: patients.filter((item) => item.matchStatus === 'drive_only').length,
      needsReview: patients.filter((item) => item.matchStatus === 'needs_review').length,
      imports: bucket.imports || {},
      updatedAt: state.updatedAt,
    };
  }

  return {
    buildPatientCardReadout,
    findPatientByEmail,
    getPatient,
    getTenantStats,
    importClientoRows,
    listPatients,
    mergeDriveProfiles,
    upsertPatient,
    patientKey,
  };
}

module.exports = {
  PATIENT_FLAGS,
  buildPatientCardReadout,
  createCcoPatientMasterStore,
  normalizePatientRecord,
};
