'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  extractDisplayNameFromSegment,
  extractPersonnummerFromPath,
  nameOverlapScore,
  normalizeEmail,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  phoneMatchKey,
} = require('../../scripts/migration/lib/migrationUtils');

const MONTH_WORD_RE =
  /\b(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\b/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?46|0)\s?7[\d\s().-]{7,}/g;

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function readJson(filePath, fallbackValue = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function stableAttachId(item = {}) {
  const sourceId =
    normalizeText(item.driveFileId) ||
    normalizeText(item.id) ||
    normalizeText(item.folderId) ||
    normalizeText(item.webViewLink) ||
    normalizeText(item.url) ||
    normalizeText(item.relativePath) ||
    normalizeText(item.path) ||
    normalizeText(item.name);
  return crypto
    .createHash('sha256')
    .update(sourceId || JSON.stringify(item))
    .digest('hex')
    .slice(0, 24);
}

function normalizeDriveItem(input = {}) {
  const safe = asObject(input);
  const relativePath =
    normalizeText(safe.relativePath) ||
    normalizeText(safe.path) ||
    normalizeText(safe.fullPath) ||
    normalizeText(safe.title) ||
    normalizeText(safe.name);
  const fileName =
    normalizeText(safe.fileName) || path.basename(relativePath || normalizeText(safe.title));
  const webViewLink = normalizeText(safe.webViewLink || safe.url);
  return {
    attachId: stableAttachId({ ...safe, relativePath }),
    driveFileId: normalizeText(safe.driveFileId || safe.id),
    folderId: normalizeText(
      safe.folderId || (safe.mimeType === 'application/vnd.google-apps.folder' ? safe.id : '')
    ),
    name: normalizeText(safe.name || safe.title || fileName),
    fileName,
    relativePath,
    mimeType: normalizeText(safe.mimeType || safe.mime_type),
    webViewLink,
    modifiedTime: normalizeText(safe.modifiedTime || safe.modified_time),
    size: normalizeText(safe.size),
    source: normalizeText(safe.source) || 'drive',
  };
}

function splitPathSegments(relativePath = '') {
  return normalizeText(relativePath)
    .split('/')
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
}

function isHairTpBookedPath(relativePath = '') {
  const segments = splitPathSegments(relativePath);
  const hasHairTpYear = segments.some((segment) => /hair\s*tp\s*clinic\s*20\d{2}/i.test(segment));
  const hasBooked = segments.some((segment) => /^bokade\b/i.test(segment));
  const hasMonth = segments.some(
    (segment) => MONTH_WORD_RE.test(segment) && /20\d{2}/.test(segment)
  );
  return hasHairTpYear && hasBooked && hasMonth;
}

function extractEmails(value = '') {
  return [
    ...new Set((normalizeText(value).match(EMAIL_RE) || []).map(normalizeEmail).filter(Boolean)),
  ];
}

function extractPhones(value = '') {
  return [
    ...new Set((normalizeText(value).match(PHONE_RE) || []).map(normalizePhone).filter(Boolean)),
  ];
}

function extractCandidateName(item = {}) {
  const segments = splitPathSegments(item.relativePath);
  const preferred =
    segments
      .slice()
      .reverse()
      .find((segment) => {
        if (extractPersonnummerFromPath(segment).length && !/[A-Za-zÅÄÖåäö]{2,}/.test(segment)) {
          return false;
        }
        EMAIL_RE.lastIndex = 0;
        if (EMAIL_RE.test(segment)) {
          EMAIL_RE.lastIndex = 0;
          return false;
        }
        EMAIL_RE.lastIndex = 0;
        if (/\.[A-Za-z0-9]{2,5}$/.test(segment)) return false;
        if (/^bokade\b/i.test(segment)) return false;
        if (/hair\s*tp\s*clinic/i.test(segment)) return false;
        if (MONTH_WORD_RE.test(segment) && /20\d{2}/.test(segment)) return false;
        return /[A-Za-zÅÄÖåäö]{2,}/.test(segment);
      }) ||
    item.name ||
    item.fileName;
  return extractDisplayNameFromSegment(preferred) || normalizeText(preferred);
}

function extractDriveCandidate(input = {}) {
  const item = normalizeDriveItem(input);
  const haystack = [item.relativePath, item.name, item.fileName].filter(Boolean).join(' ');
  return {
    ...item,
    personnummerCandidates: extractPersonnummerFromPath(haystack)
      .map(normalizePersonnummer)
      .filter(Boolean),
    emails: extractEmails(haystack),
    phones: extractPhones(haystack),
    displayName: extractCandidateName(item),
    inBookedHairTpStructure: isHairTpBookedPath(item.relativePath),
  };
}

function collectPatientEmails(patient = {}) {
  return [
    ...new Set(
      [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeEmail).filter(Boolean)
    ),
  ];
}

function collectPatientPhones(patient = {}) {
  return [
    ...new Set(
      [patient.primaryPhone, ...asArray(patient.phones)].map(phoneMatchKey).filter(Boolean)
    ),
  ];
}

function buildPatientLookup(patients = []) {
  const byPnr = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  for (const patient of asArray(patients)) {
    const pnr = normalizePersonnummer(patient.personnummer);
    if (pnr) {
      if (!byPnr.has(pnr)) byPnr.set(pnr, []);
      byPnr.get(pnr).push(patient);
    }
    for (const email of collectPatientEmails(patient)) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(patient);
    }
    for (const phone of collectPatientPhones(patient)) {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(patient);
    }
  }
  return { byPnr, byEmail, byPhone, patients: asArray(patients) };
}

function uniqueMatch(matches = []) {
  const byId = new Map();
  for (const match of matches) {
    if (match?.patient?.id) byId.set(match.patient.id, match);
  }
  return byId.size === 1 ? [...byId.values()][0] : null;
}

function resolveDriveCandidate(candidate, lookup) {
  for (const pnr of candidate.personnummerCandidates) {
    const match = uniqueMatch(
      asArray(lookup.byPnr.get(pnr)).map((patient) => ({
        patient,
        method: 'pnr',
        confidence: 0.99,
      }))
    );
    if (match) return match;
    if (asArray(lookup.byPnr.get(pnr)).length > 1) return { method: 'pnr', ambiguous: true };
  }
  for (const email of candidate.emails) {
    const match = uniqueMatch(
      asArray(lookup.byEmail.get(email)).map((patient) => ({
        patient,
        method: 'email',
        confidence: 0.93,
      }))
    );
    if (match) return match;
    if (asArray(lookup.byEmail.get(email)).length > 1) return { method: 'email', ambiguous: true };
  }
  for (const phone of candidate.phones) {
    const key = phoneMatchKey(phone);
    const match = uniqueMatch(
      asArray(lookup.byPhone.get(key)).map((patient) => ({
        patient,
        method: 'phone',
        confidence: 0.88,
      }))
    );
    if (match) return match;
    if (asArray(lookup.byPhone.get(key)).length > 1) return { method: 'phone', ambiguous: true };
  }
  const candidateName = normalizeText(candidate.displayName);
  if (candidateName) {
    const nameMatches = lookup.patients
      .map((patient) => ({
        patient,
        method: 'name',
        confidence: nameOverlapScore(patient.displayName, candidateName),
      }))
      .filter((match) => match.confidence >= 0.72)
      .sort((left, right) => right.confidence - left.confidence);
    if (
      nameMatches.length === 1 ||
      (nameMatches[0] && nameMatches[0].confidence - nameMatches[1]?.confidence >= 0.12)
    ) {
      return nameMatches[0];
    }
    if (nameMatches.length > 1) return { method: 'name', ambiguous: true };
  }
  return null;
}

function maskValue(value = '', { keepStart = 2, keepEnd = 2 } = {}) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.includes('@')) {
    const [local, domain] = text.split('@');
    return `${local.slice(0, 2)}***@${domain.slice(0, 2)}***`;
  }
  if (text.length <= keepStart + keepEnd) return '*'.repeat(text.length);
  return `${text.slice(0, keepStart)}***${text.slice(-keepEnd)}`;
}

function maskSample({ candidate, match, decision }) {
  return {
    decision,
    method: match?.method || '',
    confidence: Number(match?.confidence || 0),
    patientId: match?.patient?.id ? maskValue(match.patient.id, { keepStart: 4, keepEnd: 4 }) : '',
    pnr: maskValue(candidate.personnummerCandidates[0] || ''),
    email: maskValue(candidate.emails[0] || ''),
    phone: maskValue(candidate.phones[0] || ''),
    name: maskValue(candidate.displayName || '', { keepStart: 1, keepEnd: 1 }),
    driveRef: maskValue(candidate.driveFileId || candidate.folderId || candidate.attachId, {
      keepStart: 4,
      keepEnd: 4,
    }),
  };
}

function buildAttachment(candidate, match) {
  return {
    attachId: candidate.attachId,
    driveFileId: candidate.driveFileId,
    folderId: candidate.folderId,
    name: candidate.name,
    relativePath: candidate.relativePath,
    mimeType: candidate.mimeType,
    webViewLink: candidate.webViewLink,
    modifiedTime: candidate.modifiedTime,
    matchedBy: match.method,
    matchConfidence: Number(match.confidence || 0),
    attachedAt: nowIso(),
  };
}

function mergePatientDriveAttachment(patient, candidate, match) {
  const existingDrive = asObject(patient.drive);
  const attachments = asArray(existingDrive.attachments);
  const attachment = buildAttachment(candidate, match);
  const existingIndex = attachments.findIndex(
    (item) => normalizeText(item.attachId) === attachment.attachId
  );
  const nextAttachments = attachments.slice();
  if (existingIndex >= 0) {
    nextAttachments[existingIndex] = { ...nextAttachments[existingIndex], ...attachment };
  } else {
    nextAttachments.push(attachment);
  }
  const journalPdfs = nextAttachments.filter((item) =>
    /pdf/i.test(item.mimeType || item.name)
  ).length;
  const images = nextAttachments.filter((item) => /^image\//i.test(item.mimeType)).length;
  return {
    ...patient,
    drive: {
      ...existingDrive,
      source: existingDrive.source || 'drive_attach',
      attachPipeline: {
        version: 1,
        updatedAt: nowIso(),
        lastMatchedBy: match.method,
      },
      attachments: nextAttachments,
    },
    fileSummary: {
      ...asObject(patient.fileSummary),
      totalFiles: Math.max(
        Number(asObject(patient.fileSummary).totalFiles) || 0,
        nextAttachments.length
      ),
      journalPdfs: Math.max(Number(asObject(patient.fileSummary).journalPdfs) || 0, journalPdfs),
      images: Math.max(Number(asObject(patient.fileSummary).images) || 0, images),
    },
    matchStatus: patient.cliento ? 'matched' : patient.matchStatus || 'unmatched',
    matchConfidence: Math.max(Number(patient.matchConfidence) || 0, Number(match.confidence) || 0),
    updatedAt: nowIso(),
  };
}

function buildReviewItem(candidate, reason, match = null) {
  return {
    id: `drive_attach_${candidate.attachId}`,
    sourceSystem: 'google_drive',
    status: 'needs_review',
    decision: null,
    reason,
    createdAt: nowIso(),
    candidate: {
      attachId: candidate.attachId,
      driveFileId: candidate.driveFileId,
      folderId: candidate.folderId,
      relativePath: candidate.relativePath,
      name: candidate.name,
      mimeType: candidate.mimeType,
      webViewLink: candidate.webViewLink,
      signals: {
        hasPersonnummer: candidate.personnummerCandidates.length > 0,
        hasEmail: candidate.emails.length > 0,
        hasPhone: candidate.phones.length > 0,
        hasName: Boolean(candidate.displayName),
        inBookedHairTpStructure: candidate.inBookedHairTpStructure,
      },
    },
    suggestedMatch: match?.patient?.id
      ? {
          patientId: match.patient.id,
          method: match.method,
          confidence: Number(match.confidence || 0),
        }
      : null,
  };
}

function emptyReviewQueue() {
  return { schemaVersion: 'drive-attach-review-v1', createdAt: nowIso(), items: {} };
}

async function writeReviewQueue({ reviewQueuePath, items = [], dryRun }) {
  if (!reviewQueuePath || dryRun) return { path: reviewQueuePath || '', written: 0 };
  const state = (await readJson(reviewQueuePath, emptyReviewQueue())) || emptyReviewQueue();
  state.items = asObject(state.items);
  for (const item of items) state.items[item.id] = { ...state.items[item.id], ...item };
  state.updatedAt = nowIso();
  await writeJsonAtomic(reviewQueuePath, state);
  return { path: reviewQueuePath, written: items.length };
}

async function runCcoDriveAttachPipeline({
  tenantId = 'hair-tp-clinic',
  patientMasterPath,
  reviewQueuePath,
  driveItems = [],
  dryRun = true,
  sampleSize = 5,
  requireBookedHairTpPath = true,
} = {}) {
  if (!patientMasterPath) throw new Error('patientMasterPath krävs.');
  const state = await readJson(patientMasterPath, null);
  if (!state?.tenants?.[tenantId]) throw new Error(`tenant saknas i patient master: ${tenantId}`);
  const bucket = state.tenants[tenantId];
  bucket.patients = asArray(bucket.patients);

  const stats = {
    scanned: 0,
    eligible: 0,
    matched: 0,
    updated: 0,
    unchanged: 0,
    reviewQueued: 0,
    ambiguous: 0,
    skipped: 0,
    createdPatients: 0,
    byMethod: { pnr: 0, email: 0, phone: 0, name: 0 },
  };
  const reviewItems = [];
  const samples = [];
  const updatedById = new Map(bucket.patients.map((patient) => [patient.id, patient]));

  for (const raw of asArray(driveItems)) {
    stats.scanned += 1;
    const candidate = extractDriveCandidate(raw);
    if (requireBookedHairTpPath && !candidate.inBookedHairTpStructure) {
      stats.skipped += 1;
      continue;
    }
    stats.eligible += 1;
    const match = resolveDriveCandidate(candidate, buildPatientLookup([...updatedById.values()]));
    if (!match?.patient || match.ambiguous) {
      const reason = match?.ambiguous ? `ambiguous_${match.method}` : 'unmatched_review_required';
      if (match?.ambiguous) stats.ambiguous += 1;
      stats.reviewQueued += 1;
      reviewItems.push(buildReviewItem(candidate, reason, match));
      if (samples.length < sampleSize)
        samples.push(maskSample({ candidate, match, decision: 'review' }));
      continue;
    }
    stats.matched += 1;
    stats.byMethod[match.method] = (stats.byMethod[match.method] || 0) + 1;
    const before = updatedById.get(match.patient.id) || match.patient;
    const beforeCount = asArray(asObject(before.drive).attachments).length;
    const next = mergePatientDriveAttachment(before, candidate, match);
    const afterCount = asArray(asObject(next.drive).attachments).length;
    updatedById.set(next.id, next);
    if (afterCount > beforeCount) stats.updated += 1;
    else stats.unchanged += 1;
    if (samples.length < sampleSize)
      samples.push(maskSample({ candidate, match, decision: 'attach' }));
  }

  const report = {
    generatedAt: nowIso(),
    dryRun,
    tenantId,
    model: 'UPSERT · pnr→e-post→tel→namn · dry-run → 5 stickprov → GO → batch-commit · idempotent',
    safety: {
      createsPatients: false,
      unmatchedTarget: 'review_queue_file',
      driveIsControlSourceOnly: true,
    },
    stats,
    samples,
    reviewQueuePath: reviewQueuePath || '',
  };

  if (!dryRun) {
    bucket.patients = bucket.patients.map((patient) => updatedById.get(patient.id) || patient);
    bucket.imports = asObject(bucket.imports);
    bucket.imports.driveAttach = {
      importedAt: nowIso(),
      stats,
    };
    state.updatedAt = nowIso();
    await writeJsonAtomic(patientMasterPath, state);
  }
  report.reviewQueue = await writeReviewQueue({ reviewQueuePath, items: reviewItems, dryRun });
  return report;
}

module.exports = {
  buildPatientLookup,
  extractDriveCandidate,
  isHairTpBookedPath,
  maskSample,
  mergePatientDriveAttachment,
  resolveDriveCandidate,
  runCcoDriveAttachPipeline,
};
