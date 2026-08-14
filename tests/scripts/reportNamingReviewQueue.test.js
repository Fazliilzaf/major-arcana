'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { parseArgs, maskId, classifyReason } = require('../../scripts/report-naming-review-queue');

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'arcana-naming-review-queue-'));
}

function runScript(dir, extraArgs = []) {
  const scriptPath = path.join(__dirname, '../../scripts/report-naming-review-queue.js');
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

test('classifyReason distinguishes low confidence from fallback sessionNumber', () => {
  assert.equal(
    classifyReason({ namingConfidence: 'low', sessionNumberIsUnreliable: false }),
    'low_confidence'
  );
  assert.equal(
    classifyReason({ namingConfidence: 'high', sessionNumberIsUnreliable: true }),
    'fallback_session_number'
  );
  assert.equal(
    classifyReason({ namingConfidence: 'low', sessionNumberIsUnreliable: true }),
    'both'
  );
  assert.equal(
    classifyReason({ namingConfidence: 'high', sessionNumberIsUnreliable: false }),
    'other'
  );
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

test('end-to-end: separates a bulk-fixable patient (fallback-only) from one needing manual review (low confidence)', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const bulkPatient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Bulk Fixable',
    primaryEmail: 'bulk@example.test',
  });
  const manualPatient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'Needs Manual',
    primaryEmail: 'manual@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  for (let i = 0; i < 3; i += 1) {
    await assetStore.addAsset({
      patientId: bulkPatient.id,
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      mimeType: 'application/pdf',
      category: 'journal',
      patientCardSection: 'behandling',
      treatmentType: 'FUE',
      originalFileName: `FUE-avtal-${i}.pdf`,
      importedAt: `2026-0${i + 1}-15T10:00:00.000Z`,
    });
  }
  await assetStore.addAsset({
    patientId: manualPatient.id,
    sourceSystem: 'pipedrive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'image/jpeg',
    category: 'other',
    originalFileName: 'IMG_9999.jpg',
  });

  const report = runScript(dir);

  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.totalAssetsScanned, 4);
  assert.equal(report.totalReviewQueueSize, 4);
  assert.equal(report.reasonTotals.fallback_session_number, 3);
  assert.equal(report.reasonTotals.low_confidence, 1);
  assert.equal(report.reasonTotals.both, 0);
  assert.equal(report.patientsAffected, 2);
  assert.equal(report.patientsLikelyBulkFixable, 1);
  assert.equal(report.assetsLikelyBulkFixable, 3);

  const bulkRow = report.topPatientsByQueueSize.find((r) => r.patientId === maskId(bulkPatient.id));
  assert.equal(bulkRow.likelyBulkFixable, true);
  assert.equal(bulkRow.total, 3);

  const manualRow = report.topPatientsByQueueSize.find(
    (r) => r.patientId === maskId(manualPatient.id)
  );
  assert.equal(manualRow.likelyBulkFixable, false);
  assert.equal(manualRow.lowConfidence, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: patients with nothing needing review do not appear at all', async () => {
  const dir = await makeDir();
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.join(dir, 'cco-patient-master.json'),
  });
  const cleanPatient = await patientStore.upsertPatient({
    tenantId: 'test-tenant',
    displayName: 'All Good',
    primaryEmail: 'good@example.test',
  });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'cco-patient-assets.json'),
  });
  await assetStore.addAsset({
    patientId: cleanPatient.id,
    sourceSystem: 'pipedrive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    category: 'journal',
    patientCardSection: 'behandling',
    treatmentType: 'FUE',
    documentDate: '2026-01-15',
  });

  const report = runScript(dir);
  assert.equal(report.totalReviewQueueSize, 0);
  assert.equal(report.patientsAffected, 0);
  assert.deepEqual(report.topPatientsByQueueSize, []);

  await fs.rm(dir, { recursive: true, force: true });
});
