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
} = require('../../scripts/migration/lib/migrationUtils');

test('normalizePersonnummer formats Swedish personnummer', () => {
  assert.equal(normalizePersonnummer('19801224-5513'), '19801224-5513');
  assert.equal(normalizePersonnummer('198012245513'), '19801224-5513');
});

test('nameOverlapScore finds likely same person', () => {
  const score = nameOverlapScore('David Persson', 'David Persson - 19801224-5513');
  assert.ok(score >= 0.5);
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
