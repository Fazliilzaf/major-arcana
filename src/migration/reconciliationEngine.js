'use strict';

/**
 * Migration Reconciliation Engine.
 *
 * Compares Cliento import against Google Drive index to find:
 * - Duplicate patients
 * - Unlinked Drive files
 * - Patients with missing data
 * - Files with ? or ! markers
 * - Files without driveFileId
 * - Files linked to wrong/multiple patients
 *
 * NEVER auto-merges. All merge candidates require manual review.
 * Cliento = master for customer data.
 * Google Drive = master for files/images/historical documents.
 * Journal content NEVER sent to external AI.
 */

const crypto = require('node:crypto');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function normalizePhone(v) { return normalizeText(v).replace(/[\s\-\(\)]/g, '').replace(/^0/, '+46'); }
function normalizePersonnummer(v) { return normalizeText(v).replace(/[\s\-]/g, ''); }
function nowIso() { return new Date().toISOString(); }

// ─── FLAGS ───

const FLAGS = Object.freeze({
  DUPLICATE_PATIENT_SAME_PERSONNUMBER: 'DUPLICATE_PATIENT_SAME_PERSONNUMBER',
  DUPLICATE_PATIENT_SAME_PHONE: 'DUPLICATE_PATIENT_SAME_PHONE',
  DUPLICATE_PATIENT_SAME_EMAIL: 'DUPLICATE_PATIENT_SAME_EMAIL',
  DUPLICATE_PATIENT_SIMILAR_NAME: 'DUPLICATE_PATIENT_SIMILAR_NAME',
  CLIENTO_PATIENT_NO_DRIVE_FILES: 'CLIENTO_PATIENT_NO_DRIVE_FILES',
  CLIENTO_PATIENT_PARTIAL_DRIVE_MATCH: 'CLIENTO_PATIENT_PARTIAL_DRIVE_MATCH',
  CLIENTO_PATIENT_MISSING_CONTACT_DATA: 'CLIENTO_PATIENT_MISSING_CONTACT_DATA',
  CLIENTO_PATIENT_MISSING_PERSONNUMBER: 'CLIENTO_PATIENT_MISSING_PERSONNUMBER',
  DRIVE_ONLY_PATIENT_NO_CLIENTO_MATCH: 'DRIVE_ONLY_PATIENT_NO_CLIENTO_MATCH',
  DRIVE_FOLDER_LINKED_TO_MULTIPLE_PATIENTS: 'DRIVE_FOLDER_LINKED_TO_MULTIPLE_PATIENTS',
  DRIVE_FILE_LINKED_TO_MULTIPLE_PATIENTS: 'DRIVE_FILE_LINKED_TO_MULTIPLE_PATIENTS',
  DRIVE_FILE_UNLINKED: 'DRIVE_FILE_UNLINKED',
  DRIVE_FILE_LOW_CONFIDENCE: 'DRIVE_FILE_LOW_CONFIDENCE',
  DRIVE_FILE_HAS_QUESTION_MARK: 'DRIVE_FILE_HAS_QUESTION_MARK',
  DRIVE_FILE_HAS_EXCLAMATION_MARK: 'DRIVE_FILE_HAS_EXCLAMATION_MARK',
  DRIVE_FILE_MISSING_DRIVE_FILE_ID: 'DRIVE_FILE_MISSING_DRIVE_FILE_ID',
  DRIVE_FILE_MISSING_FOLDER_ID: 'DRIVE_FILE_MISSING_FOLDER_ID',
  POSSIBLE_WRONG_PATIENT_LINK: 'POSSIBLE_WRONG_PATIENT_LINK',
  IMPORTED_PATIENT_SPLIT_INTO_TWO_RECORDS: 'IMPORTED_PATIENT_SPLIT_INTO_TWO_RECORDS',
  PATIENT_HAS_FILES_IN_MULTIPLE_FOLDERS: 'PATIENT_HAS_FILES_IN_MULTIPLE_FOLDERS',
  PATIENT_HAS_UNKNOWN_FILE_TYPES: 'PATIENT_HAS_UNKNOWN_FILE_TYPES',
  PATIENT_HAS_MISSING_JOURNAL_PDF: 'PATIENT_HAS_MISSING_JOURNAL_PDF',
  PATIENT_HAS_MISSING_IMAGES: 'PATIENT_HAS_MISSING_IMAGES',
  PATIENT_HAS_MISSING_CONSENTS: 'PATIENT_HAS_MISSING_CONSENTS',
  PATIENT_HAS_MISSING_AGREEMENTS: 'PATIENT_HAS_MISSING_AGREEMENTS',
  NEEDS_MANUAL_REVIEW: 'NEEDS_MANUAL_REVIEW',
  SAFE_TO_MERGE_CANDIDATE: 'SAFE_TO_MERGE_CANDIDATE',
  BLOCKED_FROM_AUTO_MERGE: 'BLOCKED_FROM_AUTO_MERGE',
  CONTACT_CONFLICT_NEEDS_REVIEW: 'CONTACT_CONFLICT_NEEDS_REVIEW',
});

// ─── MATCHING ENGINE ───

function computeNameSimilarity(a, b) {
  const na = normalizeText(a).toLowerCase();
  const nb = normalizeText(b).toLowerCase();
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const partsA = na.split(/\s+/).sort();
  const partsB = nb.split(/\s+/).sort();
  const common = partsA.filter((p) => partsB.includes(p));
  const maxParts = Math.max(partsA.length, partsB.length);
  return Math.round((common.length / maxParts) * 100);
}

function findDuplicateCandidates(patients) {
  const candidates = [];
  const byPersonnummer = new Map();
  const byPhone = new Map();
  const byEmail = new Map();

  for (const patient of patients) {
    const pnr = normalizePersonnummer(patient.personnummer || patient.socialSecurityNumber || '');
    const phone = normalizePhone(patient.phone || patient.mobile || '');
    const email = normalizeText(patient.email || '').toLowerCase();

    if (pnr) {
      if (!byPersonnummer.has(pnr)) byPersonnummer.set(pnr, []);
      byPersonnummer.get(pnr).push(patient);
    }
    if (phone && phone.length >= 8) {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(patient);
    }
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(patient);
    }
  }

  const seen = new Set();

  for (const [pnr, group] of byPersonnummer) {
    if (group.length < 2) continue;
    const key = group.map((p) => p.patientId).sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      candidateId: crypto.randomUUID(),
      patients: group.map((p) => p.patientId),
      matchReason: `Samma personnummer: ${pnr}`,
      matchField: 'personnummer',
      confidence: 98,
      flag: FLAGS.DUPLICATE_PATIENT_SAME_PERSONNUMBER,
    });
  }

  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;
    const key = group.map((p) => p.patientId).sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      candidateId: crypto.randomUUID(),
      patients: group.map((p) => p.patientId),
      matchReason: `Samma telefon: ${phone}`,
      matchField: 'phone',
      confidence: 85,
      flag: FLAGS.DUPLICATE_PATIENT_SAME_PHONE,
    });
  }

  for (const [email, group] of byEmail) {
    if (group.length < 2) continue;
    const key = group.map((p) => p.patientId).sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      candidateId: crypto.randomUUID(),
      patients: group.map((p) => p.patientId),
      matchReason: `Samma e-post: ${email}`,
      matchField: 'email',
      confidence: 82,
      flag: FLAGS.DUPLICATE_PATIENT_SAME_EMAIL,
    });
  }

  return candidates;
}

// ─── COMPLETENESS CHECKER ───

function computePatientCompleteness(patient, driveFiles = [], journalEntries = []) {
  const patientFiles = driveFiles.filter((f) => f.patientId === patient.patientId);
  const patientJournals = journalEntries.filter((j) => j.patientId === patient.patientId);

  const hasClientoRecord = Boolean(patient.clientoId || patient.source === 'cliento');
  const hasDriveFolder = patientFiles.some((f) => f.driveFolderId);
  const driveFileCount = patientFiles.length;
  const journalPdfCount = patientFiles.filter((f) => f.fileType === 'journal_pdf' || f.mimeType === 'application/pdf').length;
  const imageCount = patientFiles.filter((f) => f.fileType === 'image' || (f.mimeType || '').startsWith('image/')).length;
  const formCount = patientJournals.filter((j) => j.journalType === 'health_declaration' || j.journalType === 'fitness_certificate').length;
  const consentCount = patientJournals.filter((j) => j.journalType === 'consent' || j.type === 'consent').length;
  const agreementCount = patientJournals.filter((j) => j.journalType === 'agreement' || j.type === 'agreement').length;
  const unknownFileCount = patientFiles.filter((f) => !f.fileType || f.fileType === 'unknown').length;
  const lowConfidenceFileCount = patientFiles.filter((f) => f.matchConfidence != null && f.matchConfidence < 80).length;
  const missingDriveFileIdCount = patientFiles.filter((f) => !f.driveFileId).length;
  const questionMarkFiles = patientFiles.filter((f) => /[?]/.test(f.fileName || f.originalPath || '')).length;
  const exclamationMarkFiles = patientFiles.filter((f) => /[!]/.test(f.fileName || f.originalPath || '')).length;
  const hasPersonnummer = Boolean(normalizePersonnummer(patient.personnummer || patient.socialSecurityNumber || ''));
  const hasContactData = Boolean(normalizeText(patient.phone || patient.mobile) || normalizeText(patient.email));

  const checks = [
    hasClientoRecord,
    hasDriveFolder,
    driveFileCount > 0,
    journalPdfCount > 0,
    imageCount > 0,
    hasPersonnummer,
    hasContactData,
    missingDriveFileIdCount === 0,
    questionMarkFiles === 0,
    lowConfidenceFileCount === 0,
  ];
  const completenessScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const flags = [];
  if (!hasClientoRecord && driveFileCount > 0) flags.push(FLAGS.DRIVE_ONLY_PATIENT_NO_CLIENTO_MATCH);
  if (hasClientoRecord && driveFileCount === 0) flags.push(FLAGS.CLIENTO_PATIENT_NO_DRIVE_FILES);
  if (!hasPersonnummer) flags.push(FLAGS.CLIENTO_PATIENT_MISSING_PERSONNUMBER);
  if (!hasContactData) flags.push(FLAGS.CLIENTO_PATIENT_MISSING_CONTACT_DATA);
  if (missingDriveFileIdCount > 0) flags.push(FLAGS.DRIVE_FILE_MISSING_DRIVE_FILE_ID);
  if (questionMarkFiles > 0) flags.push(FLAGS.DRIVE_FILE_HAS_QUESTION_MARK);
  if (exclamationMarkFiles > 0) flags.push(FLAGS.DRIVE_FILE_HAS_EXCLAMATION_MARK);
  if (lowConfidenceFileCount > 0) flags.push(FLAGS.DRIVE_FILE_LOW_CONFIDENCE);
  if (unknownFileCount > 0) flags.push(FLAGS.PATIENT_HAS_UNKNOWN_FILE_TYPES);
  if (journalPdfCount === 0 && driveFileCount > 0) flags.push(FLAGS.PATIENT_HAS_MISSING_JOURNAL_PDF);
  if (flags.length > 0) flags.push(FLAGS.NEEDS_MANUAL_REVIEW);

  return {
    patientId: patient.patientId,
    patientName: normalizeText(patient.name || `${patient.firstName || ''} ${patient.lastName || ''}`),
    source: patient.source || 'unknown',
    hasClientoRecord,
    hasDriveFolder,
    driveFileCount,
    journalPdfCount,
    imageCount,
    formCount,
    consentCount,
    agreementCount,
    unknownFileCount,
    lowConfidenceFileCount,
    missingDriveFileIdCount,
    questionMarkFiles,
    exclamationMarkFiles,
    hasPersonnummer,
    hasContactData,
    completenessScore,
    flags,
    status: completenessScore >= 90 ? 'complete' : completenessScore >= 60 ? 'needs_review' : 'incomplete',
  };
}

// ─── DRIVE FILE AUDIT ───

function auditDriveFiles(driveFiles) {
  const unlinked = driveFiles.filter((f) => !f.patientId);
  const missingDriveFileId = driveFiles.filter((f) => !f.driveFileId);
  const questionMark = driveFiles.filter((f) => /[?]/.test(f.fileName || f.originalPath || ''));
  const exclamationMark = driveFiles.filter((f) => /[!]/.test(f.fileName || f.originalPath || ''));
  const lowConfidence = driveFiles.filter((f) => f.matchConfidence != null && f.matchConfidence < 80);

  const folderToPatients = new Map();
  for (const f of driveFiles) {
    if (!f.driveFolderId || !f.patientId) continue;
    if (!folderToPatients.has(f.driveFolderId)) folderToPatients.set(f.driveFolderId, new Set());
    folderToPatients.get(f.driveFolderId).add(f.patientId);
  }
  const multiPatientFolders = [...folderToPatients.entries()]
    .filter(([, patients]) => patients.size > 1)
    .map(([folderId, patients]) => ({ folderId, patientIds: [...patients] }));

  return {
    totalFiles: driveFiles.length,
    linkedFiles: driveFiles.length - unlinked.length,
    unlinkedFiles: unlinked.length,
    missingDriveFileId: missingDriveFileId.length,
    questionMarkFiles: questionMark.length,
    exclamationMarkFiles: exclamationMark.length,
    lowConfidenceFiles: lowConfidence.length,
    multiPatientFolders: multiPatientFolders.length,
    details: {
      unlinked: unlinked.slice(0, 100),
      missingDriveFileId: missingDriveFileId.slice(0, 100),
      questionMark: questionMark.slice(0, 100),
      exclamationMark: exclamationMark.slice(0, 100),
      lowConfidence: lowConfidence.slice(0, 100),
      multiPatientFolders,
    },
  };
}

// ─── OVERVIEW DASHBOARD ───

function buildReconciliationOverview(patients, driveFiles, journalEntries = []) {
  const clientoPatients = patients.filter((p) => p.source === 'cliento' || p.clientoId);
  const driveOnlyPatients = patients.filter((p) => (p.source === 'google_drive' || p.source === 'drive') && !p.clientoId);
  const duplicateCandidates = findDuplicateCandidates(patients);
  const driveAudit = auditDriveFiles(driveFiles);

  const completenessResults = patients.map((p) => computePatientCompleteness(p, driveFiles, journalEntries));
  const needsReview = completenessResults.filter((r) => r.status === 'needs_review' || r.status === 'incomplete');
  const clientoWithoutDrive = completenessResults.filter((r) => r.hasClientoRecord && r.driveFileCount === 0);

  return {
    overview: {
      totalClientoPatients: clientoPatients.length,
      totalDriveFolders: new Set(driveFiles.map((f) => f.driveFolderId).filter(Boolean)).size,
      totalDriveFiles: driveFiles.length,
      linkedFiles: driveAudit.linkedFiles,
      unlinkedFiles: driveAudit.unlinkedFiles,
      duplicateCandidates: duplicateCandidates.length,
      driveOnlyPatients: driveOnlyPatients.length,
      clientoWithoutDriveData: clientoWithoutDrive.length,
      questionMarkFiles: driveAudit.questionMarkFiles,
      exclamationMarkFiles: driveAudit.exclamationMarkFiles,
      missingDriveFileId: driveAudit.missingDriveFileId,
      patientsNeedingReview: needsReview.length,
    },
    duplicateCandidates,
    driveAudit,
    completenessResults: completenessResults.sort((a, b) => a.completenessScore - b.completenessScore),
    generatedAt: nowIso(),
  };
}

module.exports = {
  FLAGS,
  computeNameSimilarity,
  findDuplicateCandidates,
  computePatientCompleteness,
  auditDriveFiles,
  buildReconciliationOverview,
  normalizePhone,
  normalizePersonnummer,
};
