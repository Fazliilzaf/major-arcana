'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  collectPipedriveEmails,
  collectPipedrivePhones,
  normalizeEmail,
  normalizeKey,
  computeAgeYearsFromPersonnummer,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  phoneMatchKey,
  splitName,
  nameOverlapScore,
} = require('../../scripts/migration/lib/migrationUtils');
const { normalizePhotoPublishConsent } = require('./ccoPhotoPublishConsent');
const { normalizeFortnoxPatientRef } = require('../cfo/cfoFortnoxPatientSync');
const { normalizePatientDemographics, buildDemographicsReadout } = require('./patientDemographics');
const { sanitizePatientDisplayName } = require('../lib/patientDisplayName');
const { isPipedriveDealWon, parseDealValue } = require('./pipedriveDealHelpers');
const {
  rebuildPatientMasterIndexes,
  lookupPatientsByQuery,
  resolvePatientIndex,
} = require('./ccoStoreIndexes');

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
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) {
      await quarantineCorruptPatientMasterFile(filePath, 'tom fil');
      return fallbackValue;
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    if (error instanceof SyntaxError) {
      await quarantineCorruptPatientMasterFile(filePath, error.message);
      return fallbackValue;
    }
    throw error;
  }
}

async function quarantineCorruptPatientMasterFile(filePath, reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePath = `${filePath}.corrupt.${stamp}`;
  try {
    await fs.rename(filePath, quarantinePath);
    console.error(
      `[cco-patient-master] korrupt patient-master-fil karantänlagd: ${quarantinePath} (${reason})`
    );
  } catch (renameError) {
    console.error(
      `[cco-patient-master] korrupt JSON i ${filePath} (${reason}); kunde inte karantänlagra:`,
      renameError?.message || renameError
    );
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
      mergeDismissals: [],
    };
  }
  if (!Array.isArray(state.tenants[tenant].mergeDismissals)) {
    state.tenants[tenant].mergeDismissals = [];
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

function normalizePipedriveDealRecord(input = {}) {
  const safe = asObject(input);
  return {
    dealId: normalizeText(safe.ID),
    title: normalizeText(safe.Namn),
    status: normalizeText(safe.Status),
    stage: normalizeText(safe.Fas),
    value: normalizeText(safe.Värde),
    currency: normalizeText(safe['Valuta för Värde']),
    pipeline: normalizeText(safe.Pipeline),
    contactPersonId: normalizeText(safe['Kontaktpersonens id']),
    contactPersonName: normalizeText(safe.Kontaktperson),
    organization: normalizeText(safe.Organisation),
    owner: normalizeText(safe.Ägare),
    productName: normalizeText(safe.Produktnamn),
    graftCount: normalizeText(safe['Antal grafts']),
    treatmentDate: normalizeText(safe['Treatment date']),
    wonAt: normalizeText(safe['Tidpunkt för vunnen affär']),
    createdAt: normalizeText(safe['Affär skapad']),
    updatedAt: normalizeText(safe['Uppdaterat klockan']),
  };
}

function normalizePipedrivePersonRecord(input = {}) {
  const safe = asObject(input);
  const name = normalizeText(safe.Namn);
  const firstName = normalizeText(safe.Förnamn);
  const lastName = normalizeText(safe.Efternamn);
  const { firstName: splitFirst, lastName: splitLast } = splitName(name);
  const emails = collectPipedriveEmails(safe);
  const phones = collectPipedrivePhones(safe);
  return {
    personId: normalizeText(safe.ID),
    name,
    firstName: firstName || splitFirst,
    lastName: lastName || splitLast,
    personnummer: normalizePersonnummer(safe['Social Number']),
    emails,
    primaryEmail: emails[0] || '',
    phones,
    primaryPhone: phones[0] || '',
    organization: normalizeText(safe.Organisation),
    owner: normalizeText(safe.Ägare),
    createdAt: normalizeText(safe['Person skapad']),
    updatedAt: normalizeText(safe['Uppdaterat klockan']),
  };
}

function patientHasEmail(patient, email) {
  const target = normalizeEmail(email);
  if (!target) return false;
  if (normalizeEmail(patient.primaryEmail) === target) return true;
  return asArray(patient.emails).some((value) => normalizeEmail(value) === target);
}

function patientHasPhone(patient, phone) {
  const target = phoneMatchKey(phone);
  if (!target) return false;
  if (phoneMatchKey(patient.primaryPhone) === target) return true;
  return asArray(patient.phones).some((value) => phoneMatchKey(value) === target);
}

// Namn-nyckel för lågkonfidens-fallback. Kräver minst förnamn + efternamn så vi
// inte kolliderar på ett enda vanligt namn. Endast använd som needs_review-förslag.
function pipedriveNameKey(value) {
  const text = normalizeText(value).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.split(' ').length < 2) return '';
  return text;
}

function buildPipedrivePatientLookup(patients) {
  const byPersonnummer = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  const byName = new Map();

  patients.forEach((patient) => {
    const pnr = normalizePersonnummer(patient.personnummer);
    if (pnr && !byPersonnummer.has(pnr)) byPersonnummer.set(pnr, patient);
    const emailKeys = new Set(
      [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeEmail).filter(Boolean)
    );
    emailKeys.forEach((email) => {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(patient);
    });
    const phoneKeys = new Set(
      [patient.primaryPhone, ...asArray(patient.phones)].map(phoneMatchKey).filter(Boolean)
    );
    phoneKeys.forEach((phone) => {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(patient);
    });
    const nameKey =
      pipedriveNameKey(patient.displayName) ||
      pipedriveNameKey(`${patient.firstName || ''} ${patient.lastName || ''}`);
    if (nameKey) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(patient);
    }
  });

  return { byPersonnummer, byEmail, byPhone, byName };
}

function findPatientsForPipedrivePerson(lookup, pipedrivePerson, options = {}) {
  const matches = new Map();
  const add = (patient, method, confidence) => {
    if (!patient?.id) return;
    const existing = matches.get(patient.id);
    if (!existing || confidence > existing.confidence) {
      matches.set(patient.id, { patient, method, confidence });
    }
  };

  const pnr = normalizePersonnummer(pipedrivePerson.personnummer);
  if (pnr) {
    const patient = lookup.byPersonnummer.get(pnr);
    if (patient) add(patient, 'personnummer', 0.98);
  }

  pipedrivePerson.emails.forEach((email) => {
    asArray(lookup.byEmail.get(normalizeEmail(email))).forEach((patient) => {
      add(patient, 'email', 0.9);
    });
  });

  pipedrivePerson.phones.forEach((phone) => {
    asArray(lookup.byPhone.get(phoneMatchKey(phone))).forEach((patient) => {
      add(patient, 'phone', 0.85);
    });
  });

  // Namn-fallback: ENDAST när inget starkare (pnr/mail/tel) matchat, och bara som
  // lågkonfidens-förslag. Aldrig auto-merge — importen flaggar dessa needs_review.
  if (options.enableNameFallback && matches.size === 0 && lookup.byName) {
    const nameKey =
      pipedriveNameKey(pipedrivePerson.name) ||
      pipedriveNameKey(`${pipedrivePerson.firstName || ''} ${pipedrivePerson.lastName || ''}`);
    if (nameKey) {
      asArray(lookup.byName.get(nameKey)).forEach((patient) => {
        add(patient, 'name', 0.5);
      });
    }
  }

  return [...matches.values()];
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

function normalizePatientAccess(input = {}, existing = {}) {
  const safe = asObject(input);
  const existingSafe = asObject(existing);
  const blocked =
    safe.journalBlocked !== undefined
      ? Boolean(safe.journalBlocked)
      : Boolean(existingSafe.journalBlocked);
  return {
    journalBlocked: blocked,
    journalBlockReason: normalizeText(safe.journalBlockReason ?? existingSafe.journalBlockReason),
    journalBlockedAt: blocked
      ? normalizeText(safe.journalBlockedAt ?? existingSafe.journalBlockedAt) || nowIso()
      : null,
    journalBlockedBy: blocked
      ? normalizeText(safe.journalBlockedBy ?? existingSafe.journalBlockedBy)
      : null,
  };
}

function derivePatientOrigin(patient) {
  const safe = asObject(patient);
  const status = normalizeKey(safe.matchStatus);
  if (status === 'web_booking') return 'web_booking';
  if (safe.cliento || safe.drive || Number(asObject(safe.fileSummary).journalPdfs) > 0) {
    return 'imported';
  }
  if (status === 'matched' || status === 'cliento_only' || status === 'drive_only') {
    return 'imported';
  }
  return 'new';
}

function assertPatientJournalWritable(patient) {
  const access = normalizePatientAccess(asObject(patient).access);
  if (!access.journalBlocked) return;
  const error = new Error(
    access.journalBlockReason
      ? `Journalen är spärrad: ${access.journalBlockReason}`
      : 'Journalen är spärrad för denna patient.'
  );
  error.statusCode = 403;
  error.metadata = { journalBlocked: true, reason: access.journalBlockReason || '' };
  throw error;
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

function normalizeAllergies(existing = [], incoming = []) {
  return [
    ...new Set(
      [...asArray(existing), ...asArray(incoming)]
        .map((value) => normalizeText(value))
        .filter(Boolean)
    ),
  ];
}

function normalizeHealthDeclaration(existing = null, incoming = null) {
  if (!incoming || typeof incoming !== 'object') return existing || null;
  if (!existing || typeof existing !== 'object') return incoming;
  const existingTs = Date.parse(existing.signedAt || existing.importedAt || 0);
  const incomingTs = Date.parse(incoming.signedAt || incoming.importedAt || 0);
  if (incomingTs >= existingTs) {
    return {
      ...existing,
      ...incoming,
      answers: asArray(incoming.answers).length ? incoming.answers : existing.answers,
      flags: asArray(incoming.flags).length ? incoming.flags : existing.flags,
    };
  }
  return existing;
}

function normalizeFitnessCertificate(existing = null, incoming = null) {
  return normalizeHealthDeclaration(existing, incoming);
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
    pipedrive: safe.pipedrive || existingSafe.pipedrive || null,
    // Lågkonfidens namn-förslag (needs_review). Aldrig auto-länkad LTV/affär förrän bekräftad.
    pipedriveSuggestion: safe.pipedriveSuggestion || existingSafe.pipedriveSuggestion || null,
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
    access: normalizePatientAccess(safe.access, existingSafe.access),
    consents: normalizePhotoPublishConsent(safe.consents, existingSafe.consents),
    fortnox: normalizeFortnoxPatientRef(safe.fortnox, existingSafe.fortnox),
    demographics: normalizePatientDemographics(safe.demographics, existingSafe.demographics),
    healthDeclaration: normalizeHealthDeclaration(
      existingSafe.healthDeclaration,
      safe.healthDeclaration
    ),
    fitnessCertificate: normalizeFitnessCertificate(
      existingSafe.fitnessCertificate,
      safe.fitnessCertificate
    ),
    allergies: normalizeAllergies(existingSafe.allergies, safe.allergies),
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

function scorePatientAsMergePrimary(patient) {
  const safe = asObject(patient);
  let score = 0;
  if (safe.personnummer) score += 100;
  if (safe.cliento) score += 40;
  if (safe.drive) score += 30;
  if (safe.pipedrive) score += 20;
  score += Number(asObject(safe.fileSummary).totalFiles) || 0;
  if (safe.matchStatus === 'matched') score += 10;
  return score;
}

function mergePipedriveRecords(primary, secondary) {
  const left = asObject(primary);
  const right = asObject(secondary);
  if (!left.personId && right.personId) return right;
  if (!left.personId) return left;
  const deals = [...asArray(left.deals), ...asArray(right.deals)];
  const seen = new Set();
  const mergedDeals = deals.filter((deal) => {
    const id = normalizeText(asObject(deal).dealId);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { ...left, deals: mergedDeals };
}

function mergePatientSources(primary, secondary) {
  const left = asObject(primary);
  const right = asObject(secondary);
  const emails = [
    ...new Set([
      ...asArray(left.emails),
      ...asArray(right.emails),
      normalizeEmail(left.primaryEmail),
      normalizeEmail(right.primaryEmail),
    ]),
  ].filter(Boolean);
  const phones = [
    ...new Set([
      ...asArray(left.phones),
      ...asArray(right.phones),
      normalizePhone(left.primaryPhone),
      normalizePhone(right.primaryPhone),
    ]),
  ].filter(Boolean);
  const fileSummary = {
    totalFiles: Math.max(
      Number(asObject(left.fileSummary).totalFiles) || 0,
      Number(asObject(right.fileSummary).totalFiles) || 0
    ),
    journalPdfs: Math.max(
      Number(asObject(left.fileSummary).journalPdfs) || 0,
      Number(asObject(right.fileSummary).journalPdfs) || 0
    ),
    images: Math.max(
      Number(asObject(left.fileSummary).images) || 0,
      Number(asObject(right.fileSummary).images) || 0
    ),
  };
  let pipedrive = left.pipedrive || null;
  if (right.pipedrive) {
    pipedrive = pipedrive ? mergePipedriveRecords(pipedrive, right.pipedrive) : right.pipedrive;
  }
  let matchStatus = 'matched';
  const hasCliento = Boolean(left.cliento || right.cliento);
  const hasDrive = Boolean(left.drive || right.drive);
  if (hasCliento && hasDrive) matchStatus = 'matched';
  else if (hasCliento) matchStatus = 'cliento_only';
  else if (hasDrive) matchStatus = 'drive_only';
  else matchStatus = 'unmatched';

  return {
    personnummer:
      normalizePersonnummer(left.personnummer) || normalizePersonnummer(right.personnummer),
    displayName: left.displayName || right.displayName,
    firstName: left.firstName || right.firstName,
    lastName: left.lastName || right.lastName,
    primaryEmail: left.primaryEmail || right.primaryEmail || emails[0] || '',
    primaryPhone: left.primaryPhone || right.primaryPhone || phones[0] || '',
    emails,
    phones,
    cliento: left.cliento || right.cliento || null,
    drive: left.drive || right.drive || null,
    pipedrive,
    fileSummary,
    matchStatus,
    matchConfidence: Math.max(
      Number(left.matchConfidence) || 0,
      Number(right.matchConfidence) || 0,
      0.95
    ),
    duplicateEmail: Boolean(left.duplicateEmail || right.duplicateEmail),
  };
}

function sumPipedriveWonDeals(pipedrive) {
  const deals = asArray(asObject(pipedrive).deals);
  let total = 0;
  let wonCount = 0;
  for (const deal of deals) {
    if (!isPipedriveDealWon(deal)) continue;
    const n = parseDealValue(asObject(deal).value);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n;
    wonCount += 1;
  }
  return { total, wonCount };
}

function derivePatientHealthProjection(patient = {}) {
  const safe = asObject(patient);
  const hd = asObject(safe.healthDeclaration);
  const fc = asObject(safe.fitnessCertificate);
  const hasHealthDeclaration = Boolean(hd.signedAt || safe.hasHealthDeclaration);
  const hasFitnessCertificate = Boolean(fc.signedAt || safe.hasFitnessCertificate);
  const missingHealthDeclaration =
    safe.missingHealthDeclaration === false
      ? false
      : safe.missingHealthDeclaration === true
        ? true
        : !hasHealthDeclaration;
  const missingFitnessCertificate =
    safe.missingFitnessCertificate === false
      ? false
      : safe.missingFitnessCertificate === true
        ? true
        : !hasFitnessCertificate;
  return {
    hdSignedAt: normalizeText(hd.signedAt) || normalizeText(safe.hdSignedAt) || null,
    hdSource:
      normalizeText(hd.source) ||
      normalizeText(hd.sourceSystem) ||
      normalizeText(safe.hdSource) ||
      null,
    hasHealthDeclaration,
    missingHealthDeclaration,
    hasFitnessCertificate,
    missingFitnessCertificate,
    fitnessSigned: Boolean(fc.signedAt || safe.fitnessSigned),
    fitnessCertificateAt:
      normalizeText(fc.signedAt) || normalizeText(safe.fitnessCertificateAt) || null,
    fitnessCertificateBy:
      normalizeText(fc.source) ||
      normalizeText(fc.sourceSystem) ||
      normalizeText(safe.fitnessCertificateBy) ||
      null,
  };
}

function hydratePatientHealthProjection(patient = {}) {
  const safe = asObject(patient);
  return {
    ...safe,
    ...derivePatientHealthProjection(safe),
  };
}

function buildPatientCardReadout(patient) {
  const safe = asObject(patient);
  const access = normalizePatientAccess(safe.access);
  const patientOrigin = derivePatientOrigin(safe);
  const pipedriveWon = sumPipedriveWonDeals(safe.pipedrive);
  const healthProjection = derivePatientHealthProjection(safe);
  return {
    patientId: safe.id,
    personnummer: safe.personnummer || '',
    ageYears: computeAgeYearsFromPersonnummer(safe.personnummer),
    displayName: sanitizePatientDisplayName(safe.displayName, { fallback: '' }),
    primaryEmail: safe.primaryEmail || '',
    primaryPhone: safe.primaryPhone || '',
    matchStatus: safe.matchStatus || 'unmatched',
    matchConfidence: safe.matchConfidence || 0,
    patientOrigin,
    flags: asArray(safe.flags),
    attendance: asObject(safe.attendance),
    fileSummary: asObject(safe.fileSummary),
    hasJournalHistory: Number(asObject(safe.fileSummary).journalPdfs) > 0,
    hasImages: Number(asObject(safe.fileSummary).images) > 0,
    clientoLinked: Boolean(safe.cliento),
    driveLinked: Boolean(safe.drive),
    pipedriveLinked: Boolean(safe.pipedrive),
    pipedriveDealCount: asArray(asObject(safe.pipedrive).deals).length,
    lifetimeValue: pipedriveWon.total > 0 ? pipedriveWon.total : null,
    dealValue: pipedriveWon.total > 0 ? pipedriveWon.total : null,
    pipedriveDealValue: pipedriveWon.total > 0 ? pipedriveWon.total : null,
    lifetimeValueLabel: pipedriveWon.wonCount > 0 ? `${pipedriveWon.wonCount} vunna affärer` : null,
    journalBlocked: access.journalBlocked,
    journalBlockReason: access.journalBlockReason,
    fortnoxCustomerId: normalizeText(asObject(safe.fortnox).customerNumber),
    fortnoxSyncedAt: normalizeText(asObject(safe.fortnox).syncedAt) || null,
    fortnoxSyncError: normalizeText(asObject(safe.fortnox).lastError) || '',
    demographics: buildDemographicsReadout(safe.demographics),
    healthDeclaration: asObject(safe.healthDeclaration),
    fitnessCertificate: asObject(safe.fitnessCertificate),
    allergies: asArray(safe.allergies),
    ...healthProjection,
    updatedAt: safe.updatedAt || null,
    contactEmail: safe.primaryEmail || '',
    contactPhone: safe.primaryPhone || '',
  };
}

async function createCcoPatientMasterStore({ filePath }) {
  const state = await readJson(filePath, emptyState());
  Object.values(state.tenants || {}).forEach((bucket) => rebuildPatientMasterIndexes(bucket));

  async function save() {
    state.updatedAt = nowIso();
    Object.values(state.tenants || {}).forEach((bucket) => rebuildPatientMasterIndexes(bucket));
    await writeJsonAtomic(filePath, state);
  }

  async function getPatient({ tenantId, patientId, personnummer } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const index = resolvePatientIndex(bucket, { patientId, personnummer });
    if (index >= 0 && bucket.patients[index]) {
      return clonePatient(bucket.patients[index]);
    }
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
    const index = resolvePatientIndex(bucket, { email: normalizedEmail });
    if (index >= 0 && bucket.patients[index]) {
      return clonePatient(bucket.patients[index]);
    }
    const found = bucket.patients.find((item) => {
      if (normalizeEmail(item.primaryEmail) === normalizedEmail) return true;
      return asArray(item.emails).some((value) => normalizeEmail(value) === normalizedEmail);
    });
    return found ? clonePatient(found) : null;
  }

  async function findPatientByPhone({ tenantId, phone } = {}) {
    // phoneMatchKey (sista 9 siffror) förenar svenska format: 070…, +4670…, 004670…
    const key = phoneMatchKey(phone);
    if (!key) return null;
    const bucket = tenantBucket(state, tenantId);
    const found = bucket.patients.find((item) => {
      if (item.matchStatus === 'merged') return false;
      if (phoneMatchKey(item.primaryPhone) === key) return true;
      return asArray(item.phones).some((value) => phoneMatchKey(value) === key);
    });
    return found ? clonePatient(found) : null;
  }

  function applyPatientPatch(input = {}) {
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
    return bucket.patients[index >= 0 ? index : bucket.patients.length - 1];
  }

  async function upsertPatient(input = {}) {
    const patient = applyPatientPatch(input);
    await save();
    return getPatient({
      tenantId: patient.tenantId,
      patientId: patient.id,
      personnummer: patient.personnummer,
    });
  }

  async function listPatients({ tenantId, query = '', flags = [], limit = 100, offset = 0 } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const q = normalizeKey(query);
    const flagSet = new Set(asArray(flags).map(normalizeKey).filter(Boolean));
    // Hide merged-away secondaries from active views (kept in bucket for audit).
    let rows = bucket.patients.slice().filter((item) => item.matchStatus !== 'merged');

    const indexedMatches = lookupPatientsByQuery(bucket, query);
    if (indexedMatches) {
      rows = indexedMatches.map((index) => bucket.patients[index]).filter(Boolean);
    } else if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
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
        if (tokens.length <= 1) return haystack.includes(q);
        return tokens.every((token) => haystack.includes(token));
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

  async function mergePipedriveProfiles({
    tenantId,
    peopleRows = [],
    dealRows = [],
    dryRun = false,
    enableNameFallback = false,
  } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const dealsByPersonId = new Map();
    for (const row of asArray(dealRows)) {
      const deal = normalizePipedriveDealRecord(row);
      const personId = deal.contactPersonId;
      if (!personId) continue;
      if (!dealsByPersonId.has(personId)) dealsByPersonId.set(personId, []);
      dealsByPersonId.get(personId).push(deal);
    }

    let matched = 0;
    let unmatched = 0;
    let ambiguous = 0;
    let dealsLinked = 0;
    let personnummerBackfilled = 0;
    let nameSuggested = 0;
    const nameSamples = [];
    const lookup = buildPipedrivePatientLookup(bucket.patients);
    // I dry-run skriver vi aldrig — bara räknar och samlar stickprov.
    const patch = (next) => {
      if (!dryRun) applyPatientPatch(next);
    };

    for (const row of asArray(peopleRows)) {
      const person = normalizePipedrivePersonRecord(row);
      if (!person.personId) continue;
      const candidates = findPatientsForPipedrivePerson(lookup, person, { enableNameFallback });
      if (!candidates.length) {
        unmatched += 1;
        continue;
      }
      if (candidates.length > 1) {
        ambiguous += 1;
        for (const { patient } of candidates) {
          patch({
            ...patient,
            tenantId,
            matchStatus: 'needs_review',
          });
        }
        continue;
      }

      const { patient, method, confidence } = candidates[0];

      // Namn-bara-träff = lågkonfidens-FÖRSLAG. Länka ALDRIG affärer/LTV automatiskt;
      // markera needs_review + spara förslaget så personal kan bekräfta i review-kön.
      if (method === 'name' || confidence < 0.7) {
        nameSuggested += 1;
        if (nameSamples.length < 60) {
          nameSamples.push({
            pipedrivePerson: person.name,
            pipedrivePersonId: person.personId,
            patientId: patient.id,
            patientName: patient.displayName,
            method,
            confidence,
            dealCount: (dealsByPersonId.get(person.personId) || []).length,
          });
        }
        patch({
          ...patient,
          tenantId,
          matchStatus: 'needs_review',
          pipedriveSuggestion: {
            personId: person.personId,
            name: person.name,
            method,
            confidence,
            dealCount: (dealsByPersonId.get(person.personId) || []).length,
            suggestedAt: nowIso(),
          },
        });
        continue;
      }
      const deals = dealsByPersonId.get(person.personId) || [];
      dealsLinked += deals.length;
      const pipedrive = {
        source: 'pipedrive',
        personId: person.personId,
        name: person.name,
        firstName: person.firstName,
        lastName: person.lastName,
        emails: person.emails,
        phones: person.phones,
        organization: person.organization,
        owner: person.owner,
        matchMethod: method,
        matchConfidence: confidence,
        deals,
        importedAt: nowIso(),
      };

      const backfillPnr =
        !normalizePersonnummer(patient.personnummer) && person.personnummer
          ? person.personnummer
          : patient.personnummer;
      if (backfillPnr && !normalizePersonnummer(patient.personnummer)) {
        personnummerBackfilled += 1;
      }

      let matchStatus = patient.matchStatus || 'unmatched';
      if (patient.cliento || patient.drive) {
        matchStatus = patient.cliento && patient.drive ? 'matched' : patient.matchStatus;
        if (matchStatus === 'cliento_only' || matchStatus === 'drive_only') {
          matchStatus = 'matched';
        }
      }

      patch({
        ...patient,
        tenantId,
        personnummer: backfillPnr,
        displayName: patient.displayName || person.name,
        firstName: patient.firstName || person.firstName,
        lastName: patient.lastName || person.lastName,
        emails: [...new Set([...asArray(patient.emails), ...person.emails])],
        phones: [...new Set([...asArray(patient.phones), ...person.phones])],
        primaryEmail: patient.primaryEmail || person.primaryEmail,
        primaryPhone: patient.primaryPhone || person.primaryPhone,
        pipedrive,
        matchStatus,
        matchConfidence: Math.max(Number(patient.matchConfidence) || 0, confidence),
      });
      matched += 1;
    }

    const report = {
      importedAt: nowIso(),
      peopleRows: peopleRows.length,
      dealRows: dealRows.length,
      matched,
      unmatched,
      ambiguous,
      dealsLinked,
      personnummerBackfilled,
      nameFallback: Boolean(enableNameFallback),
      nameSuggested,
    };
    if (dryRun) {
      // Inget skrivs i dry-run — returnera bara rapport + stickprov på namn-förslag.
      return { ...report, dryRun: true, nameSamples };
    }
    bucket.imports.pipedrive = report;
    await save();
    return bucket.imports.pipedrive;
  }

  async function listMergeReviewGroups({ tenantId, limit = 80 } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const reviewPatients = bucket.patients.filter(
      (item) => item.matchStatus === 'needs_review' || asArray(item.flags).includes('needs_review')
    );
    const patientById = new Map(reviewPatients.map((item) => [item.id, item]));
    const parent = new Map();
    const edgeReasons = new Map();

    function find(id) {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
      return parent.get(id);
    }

    function unite(aId, bId, reason) {
      if (!aId || !bId || aId === bId) return;
      const rootA = find(aId);
      const rootB = find(bId);
      if (rootA === rootB) return;
      parent.set(rootB, rootA);
      const key = [aId, bId].sort().join('|');
      if (!edgeReasons.has(key)) edgeReasons.set(key, new Set());
      edgeReasons.get(key).add(reason);
    }

    const emailMap = new Map();
    const phoneMap = new Map();
    const pnrMap = new Map();
    reviewPatients.forEach((patient) => {
      const emails = new Set(
        [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeEmail).filter(Boolean)
      );
      const phones = new Set(
        [patient.primaryPhone, ...asArray(patient.phones)].map(phoneMatchKey).filter(Boolean)
      );
      emails.forEach((email) => {
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email).push(patient.id);
      });
      phones.forEach((phone) => {
        if (!phoneMap.has(phone)) phoneMap.set(phone, []);
        phoneMap.get(phone).push(patient.id);
      });
      const pnr = normalizePersonnummer(patient.personnummer);
      if (pnr) {
        if (!pnrMap.has(pnr)) pnrMap.set(pnr, []);
        pnrMap.get(pnr).push(patient.id);
      }
    });

    const linkBucket = (ids, reason) => {
      if (ids.length < 2) return;
      const anchor = ids[0];
      ids.slice(1).forEach((id) => unite(anchor, id, reason));
    };
    emailMap.forEach((ids) => linkBucket(ids, 'shared_email'));
    phoneMap.forEach((ids) => linkBucket(ids, 'shared_phone'));
    pnrMap.forEach((ids) => linkBucket(ids, 'shared_personnummer'));

    const grouped = new Map();
    reviewPatients.forEach((patient) => {
      const root = find(patient.id);
      if (!grouped.has(root)) grouped.set(root, new Set());
      grouped.get(root).add(patient.id);
    });

    const groups = [];
    grouped.forEach((memberIds, rootId) => {
      if (memberIds.size < 2) return;
      const ids = [...memberIds];
      const members = ids.map((id) => patientById.get(id)).filter(Boolean);
      const sorted = members
        .map((item) => ({ patient: item, score: scorePatientAsMergePrimary(item) }))
        .sort((a, b) => b.score - a.score);
      const reasons = new Set();
      ids.forEach((a) => {
        ids.forEach((b) => {
          if (a >= b) return;
          const edge = edgeReasons.get([a, b].sort().join('|'));
          if (edge) edge.forEach((reason) => reasons.add(reason));
        });
      });
      groups.push({
        groupId: ids.sort().join('|'),
        reasons: [...reasons],
        suggestedPrimaryId: sorted[0]?.patient?.id || rootId,
        members: sorted.map(({ patient: item, score }) => ({
          patientId: item.id,
          displayName: item.displayName,
          personnummer: item.personnummer || '',
          primaryEmail: item.primaryEmail || '',
          primaryPhone: item.primaryPhone || '',
          matchStatus: item.matchStatus,
          clientoLinked: Boolean(item.cliento),
          driveLinked: Boolean(item.drive),
          pipedriveLinked: Boolean(item.pipedrive),
          pipedriveDealCount: asArray(asObject(item.pipedrive).deals).length,
          score,
        })),
      });
    });

    const dismissed = new Set(asArray(bucket.mergeDismissals).map(normalizeText).filter(Boolean));
    const visible = groups.filter((group) => !dismissed.has(group.groupId));

    visible.sort((a, b) => b.members.length - a.members.length);
    return {
      total: visible.length,
      groups: visible.slice(0, Math.max(1, Math.min(200, Number(limit) || 80))),
    };
  }

  async function dismissMergeReviewGroup({ tenantId, groupId } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const id = normalizeText(groupId);
    if (!id) throw new Error('groupId krävs.');
    if (!bucket.mergeDismissals.includes(id)) {
      bucket.mergeDismissals.push(id);
      await save();
    }
    return { ok: true, groupId: id };
  }

  async function setPatientAccess({
    tenantId,
    patientId,
    journalBlocked,
    journalBlockReason = '',
    actorUserId = '',
  } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const id = normalizeText(patientId);
    const patient = bucket.patients.find((item) => item.id === id);
    if (!patient) {
      const error = new Error('Patienten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    patient.access = normalizePatientAccess(
      {
        journalBlocked: Boolean(journalBlocked),
        journalBlockReason: normalizeText(journalBlockReason),
        journalBlockedBy: journalBlocked ? normalizeText(actorUserId) : null,
      },
      patient.access
    );
    patient.updatedAt = nowIso();
    await save();
    return { patient: clonePatient(patient), card: buildPatientCardReadout(patient) };
  }

  async function buildGdprExportPackage({
    tenantId,
    patientId,
    journalStore = null,
    migrationIndexStore = null,
    includeDriveFileIndex = true,
  } = {}) {
    const patient = await getPatient({ tenantId, patientId });
    if (!patient) {
      const error = new Error('Patienten hittades inte.');
      error.statusCode = 404;
      throw error;
    }

    let journalEntries = [];
    if (journalStore) {
      journalEntries = await journalStore.listEntries({ tenantId, patientId: patient.id });
    }

    let driveFiles = [];
    if (includeDriveFileIndex && migrationIndexStore && patient.personnummer) {
      const files = await migrationIndexStore.getFilesForPersonnummer(patient.personnummer);
      driveFiles = files.map((file) => ({
        id: file.id,
        fileName: file.fileName || file.relativePath,
        relativePath: file.relativePath,
        fileType: file.fileType,
        capturedAt: file.capturedAt || null,
        driveFileId: file.driveFileId || null,
      }));
    }

    return {
      exportedAt: nowIso(),
      tenantId,
      patientId: patient.id,
      format: 'arcana-gdpr-patient-v1',
      profile: {
        personnummer: patient.personnummer,
        displayName: patient.displayName,
        primaryEmail: patient.primaryEmail,
        primaryPhone: patient.primaryPhone,
        emails: asArray(patient.emails),
        phones: asArray(patient.phones),
        matchStatus: patient.matchStatus,
        patientOrigin: derivePatientOrigin(patient),
        flags: asArray(patient.flags),
        cliento: patient.cliento,
        pipedrive: patient.pipedrive,
        access: normalizePatientAccess(patient.access),
      },
      journal: journalEntries.map((entry) =>
        journalStore ? journalStore.buildJournalReadout(entry) : entry
      ),
      files: driveFiles,
      summary: {
        journalEntryCount: journalEntries.length,
        driveFileCount: driveFiles.length,
      },
    };
  }

  async function mergePatients({ tenantId, primaryPatientId, secondaryPatientIds = [] } = {}) {
    const bucket = tenantBucket(state, tenantId);
    const primaryId = normalizeText(primaryPatientId);
    const secondaryIds = [
      ...new Set(
        asArray(secondaryPatientIds)
          .map(normalizeText)
          .filter((id) => id && id !== primaryId)
      ),
    ];
    if (!primaryId || !secondaryIds.length) {
      throw new Error('primaryPatientId och minst en secondaryPatientId krävs.');
    }

    const primary = bucket.patients.find((item) => item.id === primaryId);
    if (!primary) {
      const error = new Error('Primär patient hittades inte.');
      error.statusCode = 404;
      throw error;
    }

    const secondaries = secondaryIds
      .map((id) => bucket.patients.find((item) => item.id === id))
      .filter(Boolean);
    if (secondaries.length !== secondaryIds.length) {
      const error = new Error('En eller flera sekundära patienter hittades inte.');
      error.statusCode = 404;
      throw error;
    }

    let merged = clonePatient(primary);
    for (const secondary of secondaries) {
      merged = normalizePatientRecord(
        {
          ...merged,
          tenantId,
          id: primaryId,
          ...mergePatientSources(merged, secondary),
        },
        merged
      );
    }

    applyPatientPatch({ ...merged, tenantId, id: primaryId });
    // ARCHIVE (do not delete) secondaries so the audit trail survives and verify/
    // rollback can still find them. matchStatus='merged' + mergedInto + archivedAt
    // is the signal listPatients/completeness use to hide them from active views.
    const archiveTs = nowIso();
    for (const sid of secondaryIds) {
      const idx = bucket.patients.findIndex((item) => item.id === sid);
      if (idx >= 0) {
        bucket.patients[idx] = {
          ...bucket.patients[idx],
          matchStatus: 'merged',
          mergedInto: primaryId,
          archivedAt: archiveTs,
          updatedAt: archiveTs,
        };
      }
    }
    bucket.imports.patientMerge = bucket.imports.patientMerge || {
      mergedGroups: 0,
      removedPatients: 0,
    };
    bucket.imports.patientMerge.mergedGroups += 1;
    bucket.imports.patientMerge.removedPatients += secondaryIds.length;
    bucket.imports.patientMerge.lastMergedAt = nowIso();
    await save();

    return {
      primaryPatientId: primaryId,
      removedPatientIds: secondaryIds, // legacy alias
      archivedPatientIds: secondaryIds,
      patient: clonePatient(bucket.patients.find((item) => item.id === primaryId) || merged),
    };
  }

  async function getTenantStats({ tenantId } = {}) {
    const bucket = tenantBucket(state, tenantId);
    // Active stats exclude archived (merged-away) secondaries; archived count tracked separately.
    const allPatients = asArray(bucket.patients);
    const archived = allPatients.filter((item) => item.matchStatus === 'merged');
    const patients = allPatients.filter((item) => item.matchStatus !== 'merged');
    return {
      totalPatients: patients.length,
      withPersonnummer: patients.filter((item) => item.personnummer).length,
      matched: patients.filter((item) => item.matchStatus === 'matched').length,
      clientoOnly: patients.filter((item) => item.matchStatus === 'cliento_only').length,
      driveOnly: patients.filter((item) => item.matchStatus === 'drive_only').length,
      needsReview: patients.filter((item) => item.matchStatus === 'needs_review').length,
      pipedriveLinked: patients.filter((item) => item.pipedrive).length,
      archivedPatients: archived.length,
      imports: bucket.imports || {},
      updatedAt: state.updatedAt,
    };
  }

  async function setAttendance({ tenantId, patientId, status, actorName } = {}) {
    // Närvaro: receptionist markerar Show (ankommen) / No-show. Sparas på kunden
    // + loggas i historik så behandlare/andra rum ser det.
    const bucket = tenantBucket(state, tenantId);
    const idx = bucket.patients.findIndex((item) => item.id === patientId);
    if (idx < 0) return { ok: false, error: 'not_found' };
    const norm = normalizeKey(status);
    if (norm !== 'show' && norm !== 'no_show') return { ok: false, error: 'bad_status' };
    const at = nowIso();
    const entry = {
      status: norm,
      at,
      by: normalizeText(actorName) || 'reception',
    };
    const patient = bucket.patients[idx];
    patient.attendance = entry;
    patient.attendanceLog = asArray(patient.attendanceLog).concat([entry]).slice(-50);
    patient.updatedAt = at;
    await save();
    return { ok: true, attendance: entry };
  }

  async function bulkApplyDriveAttachDeltas({ tenantId, deltas = [] } = {}) {
    // SÄKERHET: update-only. Patient som inte finns hoppas över — kan ALDRIG
    // skapa nya poster. Returnerar rollback-data per uppdaterad patient.
    const bucket = tenantBucket(state, tenantId);
    const updated = [];
    const skippedNotFound = [];
    const rollback = [];
    for (const delta of asArray(deltas)) {
      const safe = asObject(delta);
      const pnr = normalizePersonnummer(safe.personnummer);
      let index = -1;
      if (safe.id) index = bucket.patients.findIndex((item) => item.id === safe.id);
      if (index < 0 && pnr) {
        index = bucket.patients.findIndex(
          (item) => normalizePersonnummer(item.personnummer) === pnr
        );
      }
      if (index < 0) {
        skippedNotFound.push(safe.id || pnr || '?');
        continue;
      }
      const existing = bucket.patients[index];
      rollback.push({
        id: existing.id,
        drive: existing.drive || null,
        fileSummary: existing.fileSummary || null,
        matchStatus: existing.matchStatus,
        matchConfidence: existing.matchConfidence,
      });
      bucket.patients[index] = normalizePatientRecord(
        {
          id: existing.id,
          tenantId,
          drive: safe.drive,
          fileSummary: safe.fileSummary,
          matchStatus: safe.matchStatus,
          matchConfidence: safe.matchConfidence,
        },
        existing
      );
      updated.push(existing.id);
    }
    if (updated.length) await save();
    return { updated, skippedNotFound, rollback };
  }

  async function hardDeleteStubPatients({ tenantId, patientIds = [] } = {}) {
    // SÄKERHET: raderar ENDAST poster med flaggan 'halso_import_stub' som
    // saknar e-post och telefon. Riktiga kunder kan aldrig raderas här.
    const bucket = tenantBucket(state, tenantId);
    const ids = new Set(asArray(patientIds).map((value) => String(value)));
    const removed = [];
    const skipped = [];
    const kept = [];
    for (const item of asArray(bucket.patients)) {
      const wanted = ids.has(String(item.id));
      const noContact = !normalizeText(item.primaryEmail) && !normalizeText(item.primaryPhone);
      const pnrAsName = /^\d{8}-?\d{4}$/.test(normalizeText(item.displayName));
      const legacyHalsoStub =
        item.matchStatus === 'needs_review' && pnrAsName && !item.cliento && !item.drive;
      const isStub =
        noContact && (asArray(item.flags).includes('halso_import_stub') || legacyHalsoStub);
      if (wanted && isStub) {
        removed.push(item.id);
        continue;
      }
      if (wanted) skipped.push(item.id);
      kept.push(item);
    }
    bucket.patients = kept;
    if (removed.length) await save();
    return { removed, skipped };
  }

  return {
    assertPatientJournalWritable,
    buildGdprExportPackage,
    buildPatientCardReadout,
    bulkApplyDriveAttachDeltas,
    setAttendance,
    dismissMergeReviewGroup,
    findPatientByEmail,
    findPatientByPhone,
    getPatient,
    getTenantStats,
    hardDeleteStubPatients,
    importClientoRows,
    listPatients,
    listMergeReviewGroups,
    mergeDriveProfiles,
    mergePatients,
    mergePipedriveProfiles,
    setPatientAccess,
    upsertPatient,
    patientKey,
  };
}

module.exports = {
  PATIENT_FLAGS,
  assertPatientJournalWritable,
  buildPatientCardReadout,
  derivePatientHealthProjection,
  hydratePatientHealthProjection,
  derivePatientOrigin,
  normalizePatientAccess,
  createCcoPatientMasterStore,
  normalizePatientRecord,
  normalizePipedriveDealRecord,
  normalizePipedrivePersonRecord,
  buildPipedrivePatientLookup,
  findPatientsForPipedrivePerson,
  scorePatientAsMergePrimary,
  mergePatientSources,
};
