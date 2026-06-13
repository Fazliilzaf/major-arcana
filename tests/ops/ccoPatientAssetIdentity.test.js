const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assetToPatientFile,
  resolvePatientAssetIds,
} = require('../../src/ops/ccoPatientAssetIdentity');

function makeCustomerStore(statesByTenant) {
  return {
    async listTenantIds() {
      return Object.keys(statesByTenant);
    },
    async peekTenantCustomerState({ tenantId }) {
      return statesByTenant[tenantId] || null;
    },
  };
}

test('resolvePatientAssetIds bridges patient UUID to Cliento asset id via strong contact match', async () => {
  const ids = await resolvePatientAssetIds({
    patientId: 'patient-uuid-1',
    tenantId: 'hair-tp-clinic',
    patient: {
      id: 'patient-uuid-1',
      displayName: 'Daniel Bodin',
      primaryEmail: 'dbodin@hotmail.se',
      primaryPhone: '+46768514000',
    },
    customerStore: makeCustomerStore({
      hair_tp: {
        directory: {
          cliento_04947b0308277dd76a03dbf4: { name: 'Daniel  Bodin' },
        },
        details: {
          cliento_04947b0308277dd76a03dbf4: {
            emails: ['dbodin@hotmail.se'],
            phone: '+46 768 514 000',
          },
        },
        identityByKey: {
          cliento_04947b0308277dd76a03dbf4: {
            canonicalCustomerId: 'cliento_04947b0308277dd76a03dbf4',
            customerKey: 'cliento_04947b0308277dd76a03dbf4',
          },
        },
        primaryEmailByKey: {},
      },
    }),
  });

  assert.deepEqual(ids, ['patient-uuid-1', 'cliento_04947b0308277dd76a03dbf4']);
});

test('resolvePatientAssetIds scans existing customer tenants when canonical tenant misses', async () => {
  const ids = await resolvePatientAssetIds({
    patientId: 'patient-uuid-2',
    tenantId: 'hair-tp-clinic',
    patient: {
      id: 'patient-uuid-2',
      displayName: 'Amina Test',
      primaryEmail: 'amina@example.test',
    },
    customerStore: makeCustomerStore({
      archived_hair_tp: {
        customerState: {
          directory: {
            cliento_archived_1: { name: 'Amina Test' },
          },
          details: {
            cliento_archived_1: { emails: ['amina@example.test'] },
          },
          identityByKey: {
            cliento_archived_1: { canonicalCustomerId: 'cliento_archived_1' },
          },
        },
      },
    }),
  });

  assert.deepEqual(ids, ['patient-uuid-2', 'cliento_archived_1']);
});

test('resolvePatientAssetIds only uses name fallback when the exact match is unique', async () => {
  const ids = await resolvePatientAssetIds({
    patientId: 'patient-uuid-3',
    tenantId: 'hair-tp-clinic',
    patient: {
      id: 'patient-uuid-3',
      displayName: 'Sam Same',
    },
    customerStore: makeCustomerStore({
      hair_tp: {
        directory: {
          cliento_a: { name: 'Sam Same' },
          cliento_b: { name: 'Sam Same' },
        },
        details: {},
        identityByKey: {},
      },
    }),
  });

  assert.deepEqual(ids, ['patient-uuid-3']);
});

test('assetToPatientFile exposes thumbnails only for patient-visible verified assets', () => {
  const visible = assetToPatientFile({
    id: 'asset-1',
    status: 'VISIBLE_ON_PATIENT_CARD',
    category: 'photo_during',
    mimeType: 'image/heic',
    displayName: 'IMG_001.HEIC',
    thumbnailKey: 'thumbs/asset-1.jpg',
    documentDate: '2026-05-05',
  });
  const review = assetToPatientFile({
    id: 'asset-2',
    status: 'NEEDS_REVIEW',
    category: 'photo_during',
    mimeType: 'image/jpeg',
    displayName: 'IMG_002.jpg',
    thumbnailKey: 'thumbs/asset-2.jpg',
    documentDate: '2026-05-05',
  });

  assert.equal(visible.fileType, 'image');
  assert.equal(visible.thumbnailUrl, '/api/v1/cco/assets/asset-1/thumbnail');
  assert.equal(review.thumbnailUrl, '');
  assert.equal(review.viewUrl, '');
});
