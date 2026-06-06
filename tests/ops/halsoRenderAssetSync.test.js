'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProdAssetStorePayload,
  buildAssetIdPatientMap,
} = require('../../scripts/lib/halsoRenderAssetSync');

test('buildAssetIdPatientMap reads assetId from dedup entries', () => {
  const map = buildAssetIdPatientMap({
    entries: {
      a: { assetId: 'asset-1', patientId: 'patient-1' },
    },
  });
  assert.equal(map.get('asset-1'), 'patient-1');
});

test('buildProdAssetStorePayload patches m365_halso patientId from dedup', async () => {
  const local = {
    schemaVersion: '1.1.0',
    items: {
      'asset-1': {
        id: 'asset-1',
        sourceSystem: 'm365_halso',
        patientId: 'cliento_old',
        storageKey: '2024/a.pdf',
        status: 'VISIBLE_ON_PATIENT_CARD',
      },
    },
  };
  const dedup = {
    entries: {
      k: { assetId: 'asset-1', patientId: 'prod-uuid-1' },
    },
  };

  const tmp = require('node:os').tmpdir();
  const localPath = `${tmp}/assets-local.json`;
  const dedupPath = `${tmp}/dedup.json`;
  await require('node:fs/promises').writeFile(localPath, JSON.stringify(local));
  await require('node:fs/promises').writeFile(dedupPath, JSON.stringify(dedup));

  const { payload, stats } = await buildProdAssetStorePayload({
    localAssetsPath: localPath,
    dedupPath,
  });
  assert.equal(payload.items['asset-1'].patientId, 'prod-uuid-1');
  assert.equal(stats.patchedPatientIds, 1);
});
