'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findDuplicateCandidates,
  computePatientCompleteness,
  auditDriveFiles,
  computeNameSimilarity,
  matchUnlinkedDriveProfilesToPatients,
  normalizePhone,
  normalizePersonnummer,
} = require('../../src/migration/reconciliationEngine');

test('findDuplicateCandidates: samma personnummer ger hög-confidence-kandidat', () => {
  const patients = [
    { patientId: 'a', personnummer: '19900101-1234' },
    { patientId: 'b', personnummer: '199001011234' },
    { patientId: 'c', personnummer: '19850505-5678' },
  ];
  const cands = findDuplicateCandidates(patients);
  const pnrCand = cands.find((c) => c.matchField === 'personnummer');
  assert.ok(pnrCand, 'ska hitta pnr-dubblett');
  assert.deepEqual(pnrCand.patients.slice().sort(), ['a', 'b']);
  assert.equal(pnrCand.confidence, 98);
});

test('findDuplicateCandidates: telefon/e-post matchas och paret dedupas', () => {
  const patients = [
    { patientId: 'a', phone: '070-123 45 67', email: 'X@Example.com' },
    { patientId: 'b', phone: '0701234567', email: 'x@example.com' },
  ];
  const cands = findDuplicateCandidates(patients);
  assert.ok(cands.length >= 1);
  assert.ok(cands.every((c) => c.patients.length === 2));
});

test('computePatientCompleteness: räknar filer/journaler och flaggar saknad data', () => {
  const patient = {
    patientId: 'p1', personnummer: '19900101-1234', phone: '0700000000',
    clientoId: 'cl1', source: 'cliento', name: 'Anna Andersson',
  };
  const driveFiles = [
    { patientId: 'p1', driveFolderId: 'f1', driveFileId: 'd1', fileType: 'journal_pdf', fileName: 'journal.pdf' },
    { patientId: 'p1', driveFolderId: 'f1', driveFileId: 'd2', fileType: 'image', fileName: 'bild.jpg' },
    { patientId: 'p1', driveFolderId: 'f1', fileType: 'unknown', fileName: 'osaker?.pdf', matchConfidence: 50 },
  ];
  const result = computePatientCompleteness(patient, driveFiles, []);
  assert.equal(result.driveFileCount, 3);
  assert.equal(result.journalPdfCount, 1);
  assert.equal(result.imageCount, 1);
  assert.equal(result.missingDriveFileIdCount, 1);
  assert.equal(result.questionMarkFiles, 1);
  assert.equal(result.unknownFileCount, 1);
  assert.ok(result.flags.includes('DRIVE_FILE_MISSING_DRIVE_FILE_ID'));
  assert.ok(result.flags.includes('DRIVE_FILE_HAS_QUESTION_MARK'));
  assert.ok(result.flags.includes('NEEDS_MANUAL_REVIEW'));
});

test('auditDriveFiles: okopplade, ?/!, saknad driveFileId och multi-patient-mappar', () => {
  const files = [
    { driveFolderId: 'F', patientId: 'p1', driveFileId: 'd1', fileName: 'a.pdf' },
    { driveFolderId: 'F', patientId: 'p2', driveFileId: 'd2', fileName: 'b.pdf' },
    { driveFileId: 'd3', fileName: 'orphan!.pdf' },
    { patientId: 'p3', fileName: 'fraga?.pdf' },
  ];
  const audit = auditDriveFiles(files);
  assert.equal(audit.totalFiles, 4);
  assert.equal(audit.unlinkedFiles, 1);
  assert.equal(audit.missingDriveFileId, 1);
  assert.equal(audit.questionMarkFiles, 1);
  assert.equal(audit.exclamationMarkFiles, 1);
  assert.equal(audit.multiPatientFolders, 1);
});

test('normalizers: pnr och telefon', () => {
  assert.equal(normalizePersonnummer('19900101-1234'), '199001011234');
  assert.equal(normalizePhone('070-123 45 67'), '+46701234567');
});

test('computeNameSimilarity: exakt = 100, delvis < 100, tomt = 0', () => {
  assert.equal(computeNameSimilarity('Anna Andersson', 'Anna Andersson'), 100);
  assert.ok(computeNameSimilarity('Anna Andersson', 'Anna Svensson') < 100);
  assert.equal(computeNameSimilarity('', 'x'), 0);
});

test('findDuplicateCandidates: fuzzy namn-matchning ger SIMILAR_NAME-kandidat (tier 2/3)', () => {
  const patients = [
    { patientId: 'a', name: 'Anna Andersson' }, // drive-only, ingen pnr/telefon/epost
    { patientId: 'b', name: 'Anna Andersson', personnummer: '199001011234' },
    { patientId: 'c', name: 'Bo Bengtsson' }, // delar ingen namn-token → ingen träff
  ];
  const cands = findDuplicateCandidates(patients);
  const nameCand = cands.find((x) => x.matchField === 'name');
  assert.ok(nameCand, 'ska hitta namn-baserad kandidat');
  assert.deepEqual(nameCand.patients.slice().sort(), ['a', 'b']);
  assert.equal(nameCand.flag, 'DUPLICATE_PATIENT_SIMILAR_NAME');
  assert.ok(nameCand.confidence <= 94, 'aldrig lika säker som exakt match');
  assert.ok(!cands.some((x) => x.patients.includes('c')), 'olika namn ska inte matcha');
});

test('findDuplicateCandidates: samma födelsedatum (ur pnr) höjer namn-confidence', () => {
  const patients = [
    { patientId: 'a', name: 'Anna Maria Andersson', personnummer: '19900101-1234' },
    { patientId: 'b', name: 'Anna Andersson', personnummer: '19900101-9999' }, // samma datum, annat pnr
  ];
  const cands = findDuplicateCandidates(patients);
  const nameCand = cands.find((x) => x.matchField === 'name');
  assert.ok(nameCand);
  assert.match(nameCand.matchReason, /samma födelsedatum/);
});

test('findDuplicateCandidates: exakt pnr-par dubbleras inte som fuzzy namn-kandidat', () => {
  const patients = [
    { patientId: 'a', name: 'Anna Andersson', personnummer: '199001011234' },
    { patientId: 'b', name: 'Anna Andersson', personnummer: '199001011234' },
  ];
  const cands = findDuplicateCandidates(patients);
  const pairCands = cands.filter((x) => x.patients.slice().sort().join() === 'a,b');
  assert.equal(pairCands.length, 1, 'paret ska bara finnas en gång (pnr), inte även fuzzy');
  assert.equal(pairCands[0].matchField, 'personnummer');
});

test('#9 matchUnlinkedDriveProfilesToPatients: föreslår patient för okopplad profil via namn', () => {
  const patients = [
    { patientId: 'p1', name: 'Anna Andersson', personnummer: '199001011234' },
    { patientId: 'p2', name: 'Bo Bengtsson', personnummer: '198505055678' },
  ];
  const driveFiles = [
    { id: 'f1', personnummer: '20000101-0000', displayName: 'Anna Andersson', fileType: 'journal_pdf' }, // pnr ej i master
    { id: 'f2', personnummer: '199001011234', displayName: 'Anna A', fileType: 'image' }, // kopplad → exkluderas
  ];
  const results = matchUnlinkedDriveProfilesToPatients(driveFiles, patients);
  assert.equal(results.length, 1, 'bara den okopplade profilen');
  assert.equal(results[0].fileCount, 1);
  assert.equal(results[0].suggestions[0].patientId, 'p1');
  assert.ok(results[0].suggestions[0].confidence >= 50);
  assert.equal(results[0].flag, 'NEEDS_MANUAL_REVIEW');
});

test('#9 matchUnlinkedDriveProfilesToPatients: samma födelsedatum höjer confidence', () => {
  const patients = [{ patientId: 'p1', name: 'Anna Andersson', personnummer: '19900101-1234' }];
  const driveFiles = [{ id: 'f1', personnummer: '19900101-9999', displayName: 'Anna Andersson' }]; // samma datum, annat pnr
  const [prof] = matchUnlinkedDriveProfilesToPatients(driveFiles, patients);
  assert.match(prof.suggestions[0].reason, /samma födelsedatum/);
});

test('#9 matchUnlinkedDriveProfilesToPatients: ingen namn-match → DRIVE_ONLY-flagga, inga förslag', () => {
  const patients = [{ patientId: 'p1', name: 'Anna Andersson', personnummer: '199001011234' }];
  const driveFiles = [{ id: 'f1', personnummer: '20101212-0000', displayName: 'Helt Annat Namn' }];
  const [prof] = matchUnlinkedDriveProfilesToPatients(driveFiles, patients);
  assert.equal(prof.suggestions.length, 0);
  assert.equal(prof.flag, 'DRIVE_ONLY_PATIENT_NO_CLIENTO_MATCH');
});
