'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  extractDriveCandidate,
  isHairTpBookedPath,
  runCcoDriveAttachPipeline,
} = require('../../src/ops/ccoDriveAttachPipeline');

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-drive-attach-'));
  const patientMasterPath = path.join(tempDir, 'cco-patient-master.json');
  const reviewQueuePath = path.join(tempDir, 'cco-drive-attach-review-queue.json');
  const state = {
    version: 1,
    tenants: {
      'hair-tp-clinic': {
        patients: [
          {
            id: 'patient-pnr',
            tenantId: 'hair-tp-clinic',
            personnummer: '19800101-1234',
            displayName: 'Anna Pnr',
            primaryEmail: 'wrong@example.com',
            emails: ['wrong@example.com'],
            primaryPhone: '0701111111',
            phones: ['0701111111'],
            matchStatus: 'cliento_only',
            matchConfidence: 0.8,
            cliento: { sourceId: 'c1' },
            fileSummary: { totalFiles: 0, journalPdfs: 0, images: 0 },
          },
          {
            id: 'patient-email',
            tenantId: 'hair-tp-clinic',
            personnummer: '',
            displayName: 'Erik Email',
            primaryEmail: 'erik@example.com',
            emails: ['erik@example.com'],
            primaryPhone: '0702222222',
            phones: ['0702222222'],
            matchStatus: 'cliento_only',
            matchConfidence: 0.7,
            cliento: { sourceId: 'c2' },
            fileSummary: { totalFiles: 0, journalPdfs: 0, images: 0 },
          },
          {
            id: 'patient-phone',
            tenantId: 'hair-tp-clinic',
            personnummer: '',
            displayName: 'Sofia Phone',
            primaryEmail: '',
            emails: [],
            primaryPhone: '0703333333',
            phones: ['0703333333'],
            matchStatus: 'cliento_only',
            matchConfidence: 0.7,
            cliento: { sourceId: 'c3' },
            fileSummary: { totalFiles: 0, journalPdfs: 0, images: 0 },
          },
          {
            id: 'patient-name',
            tenantId: 'hair-tp-clinic',
            personnummer: '',
            displayName: 'Mikael Namn',
            primaryEmail: '',
            emails: [],
            primaryPhone: '',
            phones: [],
            matchStatus: 'cliento_only',
            matchConfidence: 0.7,
            cliento: { sourceId: 'c4' },
            fileSummary: { totalFiles: 0, journalPdfs: 0, images: 0 },
          },
        ],
        imports: {},
      },
    },
  };
  await fs.writeFile(patientMasterPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return { tempDir, patientMasterPath, reviewQueuePath };
}

test('isHairTpBookedPath kräver Hair TP-år, Bokade och månadsnivå', () => {
  assert.equal(
    isHairTpBookedPath('Hair TP Clinic 2024/Bokade /Maj 2024 Begum & Sukru (20-27)/Anna.pdf'),
    true
  );
  assert.equal(isHairTpBookedPath('Hair TP Clinic 2024/Prospects/Maj 2024/Anna.pdf'), false);
});

test('extractDriveCandidate plockar pnr, email, tel och maskningsbar displayName från path', () => {
  const candidate = extractDriveCandidate({
    driveFileId: 'drive-1',
    relativePath:
      'Hair TP Clinic 2024/Bokade /Maj 2024 Begum & Sukru (20-27)/Anna Test 19800101-1234 anna@example.com 0701234567/journal.pdf',
    mimeType: 'application/pdf',
  });
  assert.deepEqual(candidate.personnummerCandidates, ['19800101-1234']);
  assert.deepEqual(candidate.emails, ['anna@example.com']);
  assert.deepEqual(candidate.phones, ['0701234567']);
  assert.equal(candidate.inBookedHairTpStructure, true);
});

test('dry-run matchar men skriver inte patient-master eller review-kö', async () => {
  const fixture = await createFixture();
  try {
    const before = await fs.readFile(fixture.patientMasterPath, 'utf8');
    const report = await runCcoDriveAttachPipeline({
      patientMasterPath: fixture.patientMasterPath,
      reviewQueuePath: fixture.reviewQueuePath,
      dryRun: true,
      driveItems: [
        {
          driveFileId: 'drive-pnr',
          relativePath:
            'Hair TP Clinic 2024/Bokade /Maj 2024 Begum & Sukru (20-27)/Someone 19800101-1234 erik@example.com/file.pdf',
          mimeType: 'application/pdf',
        },
      ],
    });
    assert.equal(report.stats.matched, 1);
    assert.equal(report.stats.byMethod.pnr, 1);
    assert.equal(report.stats.createdPatients, 0);
    assert.equal(await fs.readFile(fixture.patientMasterPath, 'utf8'), before);
    await assert.rejects(fs.stat(fixture.reviewQueuePath), /ENOENT/);
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('commit använder pnr→email→phone→name och skapar inga patienter', async () => {
  const fixture = await createFixture();
  try {
    const report = await runCcoDriveAttachPipeline({
      patientMasterPath: fixture.patientMasterPath,
      reviewQueuePath: fixture.reviewQueuePath,
      dryRun: false,
      driveItems: [
        {
          driveFileId: 'drive-pnr',
          relativePath:
            'Hair TP Clinic 2024/Bokade /Maj 2024 Begum & Sukru (20-27)/Wrong Name 19800101-1234 erik@example.com/file.pdf',
          mimeType: 'application/pdf',
        },
        {
          driveFileId: 'drive-email',
          relativePath:
            'Hair TP Clinic 2024/Bokade /Juni 2024 Sukru (24 - 1 Juli)/erik@example.com/offer.pdf',
          mimeType: 'application/pdf',
        },
        {
          driveFileId: 'drive-phone',
          relativePath: 'Hair TP Clinic 2024/Bokade /Juli 2024 Begum/0703333333/bild.jpg',
          mimeType: 'image/jpeg',
        },
        {
          driveFileId: 'drive-name',
          relativePath:
            'Hair TP Clinic 2024/Bokade /Augusti 2024 Begum och Sukru/Mikael Namn/journal.pdf',
          mimeType: 'application/pdf',
        },
      ],
    });
    assert.equal(report.stats.matched, 4);
    assert.equal(report.stats.createdPatients, 0);
    assert.equal(report.stats.byMethod.pnr, 1);
    assert.equal(report.stats.byMethod.email, 1);
    assert.equal(report.stats.byMethod.phone, 1);
    assert.equal(report.stats.byMethod.name, 1);

    const state = JSON.parse(await fs.readFile(fixture.patientMasterPath, 'utf8'));
    const patients = state.tenants['hair-tp-clinic'].patients;
    assert.equal(patients.length, 4);
    assert.equal(
      patients.find((p) => p.id === 'patient-pnr').drive.attachments[0].driveFileId,
      'drive-pnr'
    );
    assert.equal(
      patients.find((p) => p.id === 'patient-email').drive.attachments[0].driveFileId,
      'drive-email'
    );
    assert.equal(
      patients.find((p) => p.id === 'patient-phone').drive.attachments[0].driveFileId,
      'drive-phone'
    );
    assert.equal(
      patients.find((p) => p.id === 'patient-name').drive.attachments[0].driveFileId,
      'drive-name'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('unmatched skrivs till review queue-fil och commit är idempotent', async () => {
  const fixture = await createFixture();
  try {
    const driveItems = [
      {
        driveFileId: 'drive-email',
        relativePath:
          'Hair TP Clinic 2024/Bokade /Juni 2024 Sukru (24 - 1 Juli)/erik@example.com/offer.pdf',
        mimeType: 'application/pdf',
      },
      {
        driveFileId: 'drive-unmatched',
        relativePath:
          'Hair TP Clinic 2024/Bokade /September 2024 Begum & Sukru (15-29)/Unknown Person/file.pdf',
        mimeType: 'application/pdf',
      },
    ];
    const first = await runCcoDriveAttachPipeline({
      patientMasterPath: fixture.patientMasterPath,
      reviewQueuePath: fixture.reviewQueuePath,
      dryRun: false,
      driveItems,
    });
    const second = await runCcoDriveAttachPipeline({
      patientMasterPath: fixture.patientMasterPath,
      reviewQueuePath: fixture.reviewQueuePath,
      dryRun: false,
      driveItems,
    });
    assert.equal(first.stats.updated, 1);
    assert.equal(second.stats.unchanged, 1);
    assert.equal(second.stats.createdPatients, 0);

    const state = JSON.parse(await fs.readFile(fixture.patientMasterPath, 'utf8'));
    const patient = state.tenants['hair-tp-clinic'].patients.find((p) => p.id === 'patient-email');
    assert.equal(patient.drive.attachments.length, 1);

    const review = JSON.parse(await fs.readFile(fixture.reviewQueuePath, 'utf8'));
    assert.equal(Object.keys(review.items).length, 1);
    assert.equal(Object.values(review.items)[0].reason, 'unmatched_review_required');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
