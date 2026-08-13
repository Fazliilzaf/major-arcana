'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const {
  parseArgs,
  maskId,
  groupByPatientId,
} = require('../../scripts/report-backfill-sibling-collision');

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backfill-collision-'));
}

function runScript(dir, extraArgs = []) {
  const scriptPath = path.join(__dirname, '../../scripts/report-backfill-sibling-collision.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patient-assets-store',
      path.join(dir, 'cco-patient-assets.json'),
      '--patients-store',
      path.join(dir, 'cco-patient-master.json'),
      '--tenant',
      'test-tenant',
      '--min-session',
      '3',
      ...extraArgs,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(out);
}

test('maskId keeps only start/end of an id', () => {
  assert.equal(maskId('patient-1234567890'), 'pati***7890');
  assert.equal(maskId(''), '(tomt)');
});

test('groupByPatientId matches scripts/backfill-asset-display-names.js verbatim', () => {
  const groups = groupByPatientId([
    { id: 'a1', patientId: 'p1' },
    { id: 'a2', patientId: 'p1' },
    { id: 'a3', patientId: '' },
    { id: 'a4', patientId: 'p2' },
  ]);
  assert.equal(groups.size, 2);
  assert.equal(groups.get('p1').length, 2);
  assert.equal(groups.get('p2').length, 1);
});

test('parseArgs requires the store paths and an explicit tenant', () => {
  assert.throws(() => parseArgs(['node', 'script']), /--patient-assets-store/);
  assert.throws(
    () => parseArgs(['node', 'script', '--patient-assets-store', 'x']),
    /--patients-store/
  );
  assert.throws(
    () => parseArgs(['node', 'script', '--patient-assets-store', 'x', '--patients-store', 'y']),
    /--tenant/
  );
});

test('end-to-end: 3 real patients sharing one alias patientId are flagged as a collision, reproducing sessionNumber inflation via the real countTreatmentSession()', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const p1 = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Patient One',
    primaryEmail: 'p1@example.test',
    personnummer: '199001011111',
  });
  const p2 = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Patient Two',
    primaryEmail: 'p2@example.test',
    personnummer: '199002022222',
  });
  const p3 = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Patient Three',
    primaryEmail: 'p3@example.test',
    personnummer: '199003033333',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  const SHARED_ALIAS = 'legacy-drive-folder-shared-placeholder';
  const personnummers = ['199001011111', '199002022222', '199003033333'];
  for (let p = 0; p < 3; p += 1) {
    for (let i = 0; i < 3; i += 1) {
      await assetStore.addAsset({
        patientId: SHARED_ALIAS,
        sourceSystem: 'pipedrive_import',
        status: 'VISIBLE_ON_PATIENT_CARD',
        mimeType: 'application/pdf',
        patientCardSection: 'behandling',
        treatmentType: 'FUE',
        originalFileName: `${personnummers[p]}_FUE_avtal_${i}.pdf`,
        documentDate: `2026-0${i + 1}-1${p}`,
      });
    }
  }

  const report = runScript(dir);

  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.totalAssetsScanned, 9);
  assert.equal(report.totalRawPatientIdGroups, 1);
  assert.equal(report.collisionGroupsFound, 1);

  const [group] = report.topCollisionGroups;
  assert.equal(group.groupSize, 9);
  assert.equal(group.distinctCanonicalPatients, 3);
  assert.equal(group.maxSessionInGroup, 9, 'three patients x three real docs each -> idx 1..9');
  assert.equal(group.affectedPatients.length, 3);

  const maskedIds = group.affectedPatients.map((row) => row.patientId).sort();
  const expectedMasked = [p1.id, p2.id, p3.id]
    .map((id) => `${id.slice(0, 4)}***${id.slice(-4)}`)
    .sort();
  assert.deepEqual(maskedIds, expectedMasked);

  // Each patient really only has 3 documents of their own — the
  // inflated maxSessionNumber (7, 8, or 9) is the bug being verified,
  // not a real count of that patient's treatments.
  for (const row of group.affectedPatients) {
    assert.equal(row.assetsInGroup, 3);
    assert.ok(row.maxSessionNumber > row.assetsInGroup);
  }

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: patients under their own distinct patientId are never flagged as a collision', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const p1 = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Clean One',
    primaryEmail: 'clean1@example.test',
  });
  const p2 = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Clean Two',
    primaryEmail: 'clean2@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  for (const patient of [p1, p2]) {
    for (let i = 0; i < 4; i += 1) {
      await assetStore.addAsset({
        patientId: patient.id,
        sourceSystem: 'pipedrive_import',
        status: 'VISIBLE_ON_PATIENT_CARD',
        mimeType: 'application/pdf',
        patientCardSection: 'behandling',
        treatmentType: 'FUE',
        documentDate: `2026-0${i + 1}-01`,
      });
    }
  }

  const report = runScript(dir);
  assert.equal(report.totalRawPatientIdGroups, 2);
  assert.equal(report.collisionGroupsFound, 0);
  assert.deepEqual(report.topCollisionGroups, []);

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: hypotes 2 — one correctly-identified patient with real, distinct sessions is flagged as high-session but with zero fallback share (not a bug)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Real Sessions',
    primaryEmail: 'real@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  for (let i = 0; i < 5; i += 1) {
    await assetStore.addAsset({
      patientId: patient.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'PRP',
      documentDate: `2026-0${i + 1}-01`,
    });
  }

  const report = runScript(dir);
  assert.equal(report.collisionGroupsFound, 0);
  assert.equal(report.singlePatientHighSessionGroupsFound, 1);
  const [group] = report.topSinglePatientHighSessionGroups;
  assert.equal(group.maxSessionNumber, 5);
  assert.equal(group.fallbackShare, 0, 'real documentDate on every asset -> no fallback used');

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: hypotes 2 — the exact bug-comment scenario: "fyra foton, samma patient, samma dag" without real dates fragments via importedAt fallback', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const patient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Same Day Patient',
    primaryEmail: 'sameday@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  // Four photos captured the same real day, but with no documentDate —
  // only scattered importedAt timestamps, exactly the bug comment's
  // description.
  for (let i = 0; i < 4; i += 1) {
    await assetStore.addAsset({
      patientId: patient.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      importedAt: `2026-0${i + 1}-15T10:00:00.000Z`,
    });
  }

  const report = runScript(dir, ['--min-session', '2']);
  assert.equal(report.collisionGroupsFound, 0);
  assert.equal(report.singlePatientHighSessionGroupsFound, 1);
  const [group] = report.topSinglePatientHighSessionGroups;
  assert.equal(group.maxSessionNumber, 4);
  assert.equal(group.fallbackShare, 1, 'no real documentDate anywhere -> full fallback');

  await fs.rm(dir, { recursive: true, force: true });
});

test('topByFallbackShare surfaces a fallback-heavy group even when its sessionNumber stays below --min-session (the gap flagged after #1370)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const hidden = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Hidden Below Threshold',
    primaryEmail: 'hidden@example.test',
  });
  const loud = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Loud Real History',
    primaryEmail: 'loud@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  // "hidden": only 4 assets, all importedAt-fallback (fallbackShare 1)
  // but sessionNumber tops out at 4 -- below a --min-session of 5, so
  // it would never appear in topSinglePatientHighSessionGroups.
  for (let i = 0; i < 4; i += 1) {
    await assetStore.addAsset({
      patientId: hidden.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      importedAt: `2026-0${i + 1}-15T10:00:00.000Z`,
    });
  }
  // "loud": 6 assets, all real documentDate (fallbackShare 0) -- passes
  // --min-session but must NOT dominate the fallback-share ranking.
  for (let i = 0; i < 6; i += 1) {
    await assetStore.addAsset({
      patientId: loud.id,
      sourceSystem: 'pipedrive_import',
      status: 'VERIFIED_IN_CCO',
      mimeType: 'application/pdf',
      patientCardSection: 'behandling',
      treatmentType: 'PRP',
      documentDate: `2026-0${i + 1}-01`,
    });
  }

  const report = runScript(dir, ['--min-session', '5', '--min-assets-for-fallback-ranking', '3']);

  // Confirms the gap: "hidden" never shows up in the session-gated view.
  assert.equal(
    report.topSinglePatientHighSessionGroups.some((g) => g.patientId === maskId(hidden.id)),
    false
  );

  // But it IS the top entry in the independent fallback-share ranking.
  assert.equal(report.fallbackRankingCandidatesScanned, 2);
  const [top] = report.topByFallbackShare;
  assert.equal(top.patientId, maskId(hidden.id));
  assert.equal(top.fallbackShare, 1);
  assert.equal(top.maxSessionNumber, 4);

  const loudRow = report.topByFallbackShare.find((g) => g.patientId === maskId(loud.id));
  assert.equal(loudRow.fallbackShare, 0);

  await fs.rm(dir, { recursive: true, force: true });
});
