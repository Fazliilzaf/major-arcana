'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const {
  normalizePersonnummer,
  nameOverlapScore,
  extractFileOccasionContext,
  buildOccasionTimeline,
} = require('../../scripts/migration/lib/migrationUtils');

test('normalizePersonnummer formats Swedish personnummer', () => {
  assert.equal(normalizePersonnummer('19801224-5513'), '19801224-5513');
  assert.equal(normalizePersonnummer('198012245513'), '19801224-5513');
});

test('nameOverlapScore finds likely same person', () => {
  const score = nameOverlapScore('David Persson', 'David Persson - 19801224-5513');
  assert.ok(score >= 0.5);
});

test('extractFileOccasionContext reads TP batch, PRP date and journal date', () => {
  const imageContext = extractFileOccasionContext({
    relativePath:
      'Hair TP Clinic 2020/Januari TP 2020/Abbe Holmlund - 19960830-4698/Abbe Holmlund _ 2025 05 17 _ PRP 9/IMG_3464.HEIC',
    fileName: 'IMG_3464.HEIC',
    fileType: 'image',
  });
  assert.equal(imageContext.capturedAt, '2025-05-17');
  assert.match(imageContext.timelineLabel, /17 maj 2025/i);
  assert.match(imageContext.timelineLabel, /PRP/i);

  const journalContext = extractFileOccasionContext({
    relativePath:
      'Hair TP Clinic 2020/Januari TP 2020/Abbe Holmlund - 19960830-4698/Journal Abbe Holmlund- 2024-05-14.pdf',
    fileName: 'Journal Abbe Holmlund- 2024-05-14.pdf',
    fileType: 'journal_pdf',
  });
  assert.equal(journalContext.capturedAt, '2024-05-14');
  assert.match(journalContext.timelineLabel, /14 maj 2024/i);

  const timeline = buildOccasionTimeline([
    { ...journalContext, fileType: 'journal_pdf', occasionContext: journalContext },
    { ...imageContext, fileType: 'image', occasionContext: imageContext },
  ]);
  assert.ok(timeline.length >= 2);
});

test('buildFileRecord indexes folder and drive_api sources', () => {
  const { buildFileRecord } = require('../../scripts/migration/lib/migrationUtils');
  const folderRecord = buildFileRecord({
    source: 'folder',
    folderRoot: '/tmp/drive-mirror',
    relativePath: '2024/David Persson 19801224-5513/journal behandling.pdf',
  });
  assert.equal(folderRecord.source, 'folder');
  assert.equal(folderRecord.personnummer, '19801224-5513');
  assert.equal(folderRecord.fileType, 'journal_pdf');

  const driveRecord = buildFileRecord({
    source: 'drive_api',
    relativePath: '2023/Anna Svensson 19900101-1234/foto.jpg',
    driveFileId: 'abc123',
    mimeType: 'image/jpeg',
  });
  assert.equal(driveRecord.driveFileId, 'abc123');
  assert.equal(driveRecord.fileType, 'image');
});

test('walkFolderEntries finds files in nested folders', async () => {
  const { walkFolderEntries } = require('../../scripts/migration/lib/migrationUtils');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-mirror-'));
  await fs.mkdir(path.join(dir, '2024', 'Test Person 19801224-5513'), { recursive: true });
  await fs.writeFile(path.join(dir, '2024', 'Test Person 19801224-5513', 'journal.pdf'), 'pdf');
  const listing = walkFolderEntries(dir);
  assert.equal(listing.ok, true);
  assert.equal(listing.entries.length, 1);
  assert.match(listing.entries[0], /journal\.pdf$/);
});

test('patient master imports cliento rows and merges drive profile', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patient-master-'));
  const filePath = path.join(dir, 'cco-patient-master.json');
  const store = await createCcoPatientMasterStore({ filePath });

  await store.importClientoRows({
    tenantId: 'hair-tp-clinic',
    rows: [
      {
        Namn: 'David Persson',
        Telefon: '+46701234567',
        'E-post': 'david@example.com',
        Skapad: '2026-01-01',
        rowNumber: 2,
      },
    ],
    duplicateEmails: new Set(),
  });

  await store.mergeDriveProfiles({
    tenantId: 'hair-tp-clinic',
    profiles: [
      {
        personnummer: '19801224-5513',
        displayName: 'David Persson',
        fileCount: 12,
        journalPdfCount: 2,
        imageCount: 10,
      },
    ],
  });

  const patient = await store.getPatient({
    tenantId: 'hair-tp-clinic',
    personnummer: '19801224-5513',
  });
  assert.ok(patient);
  assert.equal(patient.matchStatus, 'matched');
  assert.equal(patient.fileSummary.journalPdfs, 2);
});

test('patient master enriches cliento row with pipedrive person and deals', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipedrive-merge-'));
  const filePath = path.join(dir, 'cco-patient-master.json');
  const store = await createCcoPatientMasterStore({ filePath });

  await store.importClientoRows({
    tenantId: 'hair-tp-clinic',
    rows: [
      {
        Namn: 'Camilla Ingemarsson',
        Telefon: '+46707774756',
        'E-post': 'camilla.ingemarsson78@gmail.com',
        Skapad: '2023-12-19',
        rowNumber: 2,
      },
    ],
    duplicateEmails: new Set(),
  });

  const result = await store.mergePipedriveProfiles({
    tenantId: 'hair-tp-clinic',
    peopleRows: [
      {
        ID: '9001',
        Namn: 'Camilla Ingemarsson',
        Förnamn: 'Camilla',
        Efternamn: 'Ingemarsson',
        'E-post - Hem': 'camilla.ingemarsson78@gmail.com',
        'Telefon - Mobil': '+46707774756',
        'Social Number': '',
      },
    ],
    dealRows: [
      {
        ID: '7001',
        Namn: 'TP konsultation',
        Status: 'open',
        Fas: 'Konsultation',
        'Kontaktpersonens id': '9001',
        Kontaktperson: 'Camilla Ingemarsson',
        Värde: '0',
      },
    ],
  });

  assert.equal(result.matched, 1);
  assert.equal(result.dealsLinked, 1);

  const patient = await store.findPatientByEmail({
    tenantId: 'hair-tp-clinic',
    email: 'camilla.ingemarsson78@gmail.com',
  });
  assert.ok(patient?.pipedrive);
  assert.equal(patient.pipedrive.personId, '9001');
  assert.equal(patient.pipedrive.deals.length, 1);
  assert.equal(patient.pipedrive.deals[0].dealId, '7001');
  assert.equal(patient.pipedrive.matchMethod, 'email');
});

test('historical journal import dedupes by zip path', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-import-'));
  const filePath = path.join(dir, 'cco-journal.json');
  const store = await createCcoJournalStore({ filePath });
  const file = {
    id: 'file-1',
    zipName: 'Hair TP Clinic 2024.zip',
    relativePath: '2024/Test 19801224-5513/journal.pdf',
    fileName: 'journal.pdf',
    fileType: 'journal_pdf',
  };
  const first = await store.importHistoricalEntries({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    personnummer: '19801224-5513',
    files: [file],
    actor: { userId: 'staff-1', role: 'STAFF' },
  });
  const second = await store.importHistoricalEntries({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    personnummer: '19801224-5513',
    files: [file],
    actor: { userId: 'staff-1', role: 'STAFF' },
  });
  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.skipped, 1);
  const entries = await store.listEntries({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
  });
  assert.equal(entries.length, 1);
});

test('journal store locks entry after signing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-'));
  const filePath = path.join(dir, 'cco-journal.json');
  const store = await createCcoJournalStore({ filePath });

  const entry = await store.upsertEntry(
    {
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
      personnummer: '19801224-5513',
      journalType: 'tp_treatment',
      fields: { metod: 'FUE' },
    },
    { actor: { userId: 'staff-1', role: 'STAFF', displayName: 'Staff One' } }
  );

  const signed = await store.signEntry({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    entryId: entry.entryId,
    actor: { userId: 'staff-1', role: 'STAFF', displayName: 'Staff One' },
  });
  assert.equal(signed.status, 'signed');
  assert.equal(signed.locked, true);

  await assert.rejects(
    () =>
      store.upsertEntry(
        {
          tenantId: 'hair-tp-clinic',
          patientId: 'patient-1',
          entryId: entry.entryId,
          fields: { metod: 'DHI' },
        },
        { actor: { userId: 'staff-1', role: 'STAFF' } }
      ),
    /Signerad journalpost/
  );
});
