'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { createClientoBookingStore } = require('../../src/ops/clientoBookingStore');
const {
  parseArgs,
  maskPatientId,
  SESSION_TYPES,
  loadFullTenantPatientIdScope,
} = require('../../scripts/report-encounter-session-numbers');

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'arcana-encounter-session-numbers-'));
}

test('maskPatientId keeps only start/end of the id', () => {
  assert.equal(maskPatientId('patient-1234567890'), 'pati***7890');
  assert.equal(maskPatientId(''), '');
});

test('SESSION_TYPES covers the encounter types that carry a sessionNumber', () => {
  assert.deepEqual(SESSION_TYPES, ['transplant_fue', 'transplant_dhi', 'prp_hair', 'prp_skin']);
});

test('parseArgs requires all four store paths and an explicit tenant', () => {
  assert.throws(() => parseArgs(['node', 'script']), /--patients-store/);
  assert.throws(() => parseArgs(['node', 'script', '--patients-store', 'x']), /--journal-store/);
  assert.throws(
    () =>
      parseArgs([
        'node',
        'script',
        '--patients-store',
        'x',
        '--journal-store',
        'y',
        '--patient-assets-store',
        'z',
      ]),
    /--cliento-bookings-store/,
    'must not silently fall back to a guessed cwd-relative path'
  );
  assert.throws(
    () =>
      parseArgs([
        'node',
        'script',
        '--patients-store',
        'x',
        '--journal-store',
        'y',
        '--patient-assets-store',
        'z',
        '--cliento-bookings-store',
        'w',
      ]),
    /--tenant/
  );
});

test('end-to-end: 6 pipedrive smartdocs without real dates produce sessionNumber up to 6 in the real registry', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Frag Patient',
    primaryEmail: 'frag@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  for (let i = 0; i < 6; i += 1) {
    await assetStore.addAsset({
      patientId: patient.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      importedAt: `2026-0${(i % 6) + 1}-15T10:00:00.000Z`,
    });
  }

  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });
  await createClientoBookingStore({ filePath: path.join(dir, 'cliento-bookings.json') });

  const { execFileSync } = require('node:child_process');
  const scriptPath = path.join(__dirname, '../../scripts/report-encounter-session-numbers.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--journal-store',
      path.join(dir, 'cco-journal.json'),
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--cliento-bookings-store',
      path.join(dir, 'cliento-bookings.json'),
      '--tenant',
      'test-tenant',
      '--min-sessions',
      '3',
    ],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(out);

  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.groupsAboveThreshold, 1);
  assert.equal(report.topBySessionNumber.length, 1);
  const [row] = report.topBySessionNumber;
  assert.equal(row.encounterType, 'transplant_fue');
  assert.equal(row.maxSessionNumber, 6);
  assert.equal(row.entryCount, 6);
  assert.deepEqual(row.sources, ['pipedrive_smartdoc']);
  // patientId must never appear in clear text.
  assert.equal(row.patientId.includes(patient.id), false);

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: a patient below --min-sessions is excluded from the report', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Clean Patient',
    primaryEmail: 'clean@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  for (let i = 0; i < 2; i += 1) {
    await assetStore.addAsset({
      patientId: patient.id,
      sourceSystem: 'pipedrive_import',
      status: 'VERIFIED_IN_CCO',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      documentDate: '2026-03-01',
      importedAt: `2026-0${i + 4}-15T10:00:00.000Z`,
    });
  }

  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });
  await createClientoBookingStore({ filePath: path.join(dir, 'cliento-bookings.json') });

  const { execFileSync } = require('node:child_process');
  const scriptPath = path.join(__dirname, '../../scripts/report-encounter-session-numbers.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--journal-store',
      path.join(dir, 'cco-journal.json'),
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--cliento-bookings-store',
      path.join(dir, 'cliento-bookings.json'),
      '--tenant',
      'test-tenant',
      '--min-sessions',
      '3',
    ],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(out);
  assert.equal(report.groupsAboveThreshold, 0);
  assert.deepEqual(report.topBySessionNumber, []);

  await fs.rm(dir, { recursive: true, force: true });
});

test('a fragmenting patient in a DIFFERENT tenant bucket is excluded — cco-patient-assets.json has no tenantId field, so the scoping must happen via the patientId set, not via listItemsForEnrichment', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const inScope = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'In Scope',
    primaryEmail: 'inscope@example.test',
  });
  const otherTenant = await patientStore.upsertPatient({
    tenantId: 'other-tenant',
    displayName: 'Other Tenant',
    primaryEmail: 'other@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  // Fragmenting asset set for the OTHER tenant's patient — must never
  // surface when querying --tenant test-tenant.
  for (let i = 0; i < 6; i += 1) {
    await assetStore.addAsset({
      patientId: otherTenant.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      importedAt: `2026-0${(i % 6) + 1}-15T10:00:00.000Z`,
    });
  }
  // in-scope patient stays below --min-sessions so the report is
  // unambiguous: any row present would have to be the leaked one.
  await assetStore.addAsset({
    patientId: inScope.id,
    sourceSystem: 'pipedrive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    patientCardSection: 'behandling',
    treatmentType: 'FUE',
    importedAt: '2026-01-15T10:00:00.000Z',
  });

  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });
  await createClientoBookingStore({ filePath: path.join(dir, 'cliento-bookings.json') });

  const { execFileSync } = require('node:child_process');
  const scriptPath = path.join(__dirname, '../../scripts/report-encounter-session-numbers.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--journal-store',
      path.join(dir, 'cco-journal.json'),
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--cliento-bookings-store',
      path.join(dir, 'cliento-bookings.json'),
      '--tenant',
      'test-tenant',
      '--min-sessions',
      '3',
    ],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(out);
  assert.equal(report.groupsAboveThreshold, 0, 'other-tenant fragmentation must not leak in');
  assert.deepEqual(report.topBySessionNumber, []);

  await fs.rm(dir, { recursive: true, force: true });
});

test('loadFullTenantPatientIdScope includes merged (archived) patient IDs, not just active ones — measured on prod 2026-08-13: scoping against listPatients() alone excluded 77% of all assets (97,735 of 126,642)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const primary = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Primary',
    primaryEmail: 'primary@example.test',
  });
  const secondary = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Secondary Dup',
    primaryEmail: 'secondary@example.test',
  });
  await patientStore.mergePatients({
    tenantId: 'test-tenant',
    primaryPatientId: primary.id,
    secondaryPatientIds: [secondary.id],
  });

  // The merged secondary must no longer appear in the active list...
  const activePage = await patientStore.listPatients({ tenantId: 'test-tenant', limit: 100 });
  assert.equal(
    activePage.patients.some((p) => p.id === secondary.id),
    false,
    'sanity check: listPatients() hides merged patients, this is the gap being fixed'
  );

  // ...but must still be present in the full tenant scope used for
  // asset/registry filtering.
  const scope = loadFullTenantPatientIdScope(
    path.join(dir, 'cco-patient-master.json'),
    'test-tenant'
  );
  assert.equal(scope.has(primary.id), true);
  assert.equal(scope.has(secondary.id), true, 'merged patient IDs must not be silently dropped');

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: assets on a merged-away patient ID still surface in the report (the 77% data-loss bug)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const primary = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Primary',
    primaryEmail: 'primary@example.test',
  });
  const secondary = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Secondary Dup',
    primaryEmail: 'secondary@example.test',
  });
  await patientStore.mergePatients({
    tenantId: 'test-tenant',
    primaryPatientId: primary.id,
    secondaryPatientIds: [secondary.id],
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  // Historical assets imported before the merge still reference the
  // now-archived secondary patientId.
  for (let i = 0; i < 6; i += 1) {
    await assetStore.addAsset({
      patientId: secondary.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      importedAt: `2026-0${(i % 6) + 1}-15T10:00:00.000Z`,
    });
  }

  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });
  await createClientoBookingStore({ filePath: path.join(dir, 'cliento-bookings.json') });

  const { execFileSync } = require('node:child_process');
  const scriptPath = path.join(__dirname, '../../scripts/report-encounter-session-numbers.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--journal-store',
      path.join(dir, 'cco-journal.json'),
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--cliento-bookings-store',
      path.join(dir, 'cliento-bookings.json'),
      '--tenant',
      'test-tenant',
      '--min-sessions',
      '3',
    ],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(out);
  assert.equal(
    report.groupsAboveThreshold,
    1,
    'assets on a merged-away patient ID must not be silently dropped from the diagnostic'
  );
  assert.equal(report.topBySessionNumber[0].maxSessionNumber, 6);

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: assets carrying a non-canonical alias patientId resolve to the real patient via personnummer matching (ORD-85 identity resolution) — measured on prod 2026-08-13: 97,735 of 126,642 assets (77%) needed exactly this', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Alias Patient',
    primaryEmail: 'alias@example.test',
    personnummer: '199001011234',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  // patientId is a legacy alias, NOT patient.id — only the personnummer
  // embedded in the filename can resolve it to the real patient.
  for (let i = 0; i < 6; i += 1) {
    await assetStore.addAsset({
      patientId: `legacy-drive-alias-${i}`,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      originalFileName: `199001011234_FUE_avtal_${i}.pdf`,
      importedAt: `2026-0${(i % 6) + 1}-15T10:00:00.000Z`,
    });
  }

  await createCcoJournalStore({ filePath: path.join(dir, 'cco-journal.json') });
  await createClientoBookingStore({ filePath: path.join(dir, 'cliento-bookings.json') });

  const { execFileSync } = require('node:child_process');
  const scriptPath = path.join(__dirname, '../../scripts/report-encounter-session-numbers.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--journal-store',
      path.join(dir, 'cco-journal.json'),
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--cliento-bookings-store',
      path.join(dir, 'cliento-bookings.json'),
      '--tenant',
      'test-tenant',
      '--min-sessions',
      '3',
    ],
    { encoding: 'utf8' }
  );
  const report = JSON.parse(out);
  assert.equal(
    report.inputCounts.assetsResolvedViaAlias,
    6,
    'all 6 alias-keyed assets must resolve via personnummer matching'
  );
  assert.equal(report.groupsAboveThreshold, 1);
  assert.equal(report.topBySessionNumber[0].maxSessionNumber, 6);
  assert.equal(report.topBySessionNumber[0].patientId, maskPatientId(patient.id));

  await fs.rm(dir, { recursive: true, force: true });
});
