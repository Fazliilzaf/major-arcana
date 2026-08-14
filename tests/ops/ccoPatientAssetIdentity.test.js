const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assetToPatientFile,
  collectAssetStoreAliases,
  resolveCanonicalPatientsForAssetAliases,
  resolveCanonicalPatientsForAssets,
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

function makeAssetStore(items) {
  return {
    listItemsForEnrichment() {
      return items;
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

test('resolvePatientAssetIds bridges to visible asset patient id via personnummer in Drive path', async () => {
  const ids = await resolvePatientAssetIds({
    patientId: 'patient-uuid-4',
    tenantId: 'hair-tp-clinic',
    patient: {
      id: 'patient-uuid-4',
      displayName: 'Daniel Bodin',
      personnummer: '19810830-4653',
    },
    customerStore: makeCustomerStore({}),
    assetStore: makeAssetStore([
      {
        patientId: 'cliento_04947b0308277dd76a03dbf4',
        status: 'VISIBLE_ON_PATIENT_CARD',
        originalDrivePath:
          'Hair TP Clinic 2023/Oktober/Daniel Bodin - 19810830-4653/Journal Daniel Bodin.pdf',
      },
    ]),
  });

  assert.deepEqual(ids, ['patient-uuid-4', 'cliento_04947b0308277dd76a03dbf4']);
});

test('collectAssetStoreAliases does not trust needs-review paths as identity proof', () => {
  const aliases = collectAssetStoreAliases({
    tenantId: 'hair-tp-clinic',
    patient: {
      displayName: 'Daniel Bodin',
      personnummer: '19810830-4653',
    },
    assetStore: makeAssetStore([
      {
        patientId: 'cliento_unsafe',
        status: 'NEEDS_REVIEW',
        originalDrivePath: 'Hair TP Clinic/Daniel Bodin - 19810830-4653/IMG_001.HEIC',
      },
    ]),
  });

  assert.deepEqual(aliases, []);
});

test('resolveCanonicalPatientsForAssetAliases inverts unique personnummer path identity', () => {
  const mappings = resolveCanonicalPatientsForAssetAliases({
    patients: [
      { id: 'patient-1', displayName: 'Daniel Bodin', personnummer: '19810830-4653' },
      { id: 'patient-2', displayName: 'Daniel Bodin' },
    ],
    assets: [
      {
        patientId: 'cliento_old',
        originalDrivePath: 'Hair TP Clinic/Daniel Bodin - 19810830-4653/IMG_001.HEIC',
      },
    ],
  });

  assert.deepEqual(mappings, [
    {
      assetPatientId: 'cliento_old',
      canonicalPatientId: 'patient-1',
      reason: 'personnummer_path',
      candidatePatientIds: ['patient-1'],
    },
  ]);
});

test('resolveCanonicalPatientsForAssetAliases accepts an existing canonical patient id directly', () => {
  const mappings = resolveCanonicalPatientsForAssetAliases({
    patients: [{ id: 'patient-direct', displayName: 'Direct Patient' }],
    assets: [{ patientId: 'patient-direct', mimeType: 'image/jpeg' }],
  });

  assert.deepEqual(mappings, [
    {
      assetPatientId: 'patient-direct',
      canonicalPatientId: 'patient-direct',
      reason: 'direct_patient_id',
      candidatePatientIds: ['patient-direct'],
    },
  ]);
});

test('resolveCanonicalPatientsForAssets resolves shared aliases independently per file', () => {
  const mappings = resolveCanonicalPatientsForAssets({
    patients: [
      { id: 'patient-david', displayName: 'David' },
      { id: 'patient-david-baker', displayName: 'David Baker' },
      { id: 'patient-abdulrahman', displayName: 'Abdulrahman' },
      {
        id: 'patient-abdulrahman-ali',
        displayName: 'Abdulrahman Mohamed Ali',
        personnummer: '19990526-7358',
      },
    ],
    assets: [
      {
        id: 'asset-david',
        patientId: 'shared-alias',
        relativePath: 'Juli TP 2020/David Baker/IMG_3840.HEIC',
      },
      {
        id: 'asset-abdulrahman',
        patientId: 'shared-alias',
        relativePath: 'Abdulrahman Mohamed Ali - 19990526-7358/IMG_5126.HEIC',
      },
    ],
  });

  assert.deepEqual(
    mappings.map(({ assetId, canonicalPatientId, reason }) => ({
      assetId,
      canonicalPatientId,
      reason,
    })),
    [
      {
        assetId: 'asset-david',
        canonicalPatientId: 'patient-david-baker',
        reason: 'exact_name_path',
      },
      {
        assetId: 'asset-abdulrahman',
        canonicalPatientId: 'patient-abdulrahman-ali',
        reason: 'personnummer_path',
      },
    ]
  );
});

test('resolveCanonicalPatientsForAssets keeps personnummer matching across path punctuation', () => {
  const mappings = resolveCanonicalPatientsForAssets({
    patients: [
      { id: 'lisa', displayName: 'Lisa Karlsson', personnummer: '020405-7160' },
      { id: 'anna', displayName: 'Anna Svensson', personnummer: '850101-1234' },
    ],
    assets: [
      {
        id: 'a1',
        patientId: 'shared',
        originalDrivePath: '2026/Lisa Karlsson - 020405-7160/Foto 1.jpg',
      },
    ],
  });
  assert.equal(mappings[0].canonicalPatientId, 'lisa');
  assert.equal(mappings[0].reason, 'personnummer_path');
});

test('resolveCanonicalPatientsForAssets keeps prefix-name matching with the indexed resolver', () => {
  const mappings = resolveCanonicalPatientsForAssets({
    patients: [
      { id: 'patient-abdirahman', displayName: 'Abdirahman Hussein' },
      { id: 'patient-other', displayName: 'Anna Andersson' },
    ],
    assets: [
      {
        id: 'asset-photo',
        patientId: 'legacy-folder',
        relativePath: 'Maj 2026/Abdirahman Hussein konsultation/IMG_001.jpg',
      },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, 'patient-abdirahman');
  assert.equal(mappings[0].reason, 'name_prefix_path');
});

test('resolveCanonicalPatientsForAssetAliases leaves ambiguous exact names unresolved', () => {
  const mappings = resolveCanonicalPatientsForAssetAliases({
    patients: [
      { id: 'patient-1', displayName: 'Sam Same' },
      { id: 'patient-2', displayName: 'Sam Same' },
    ],
    assets: [
      { patientId: 'cliento_old', originalDrivePath: 'Hair TP Clinic/Sam Same/IMG_001.jpg' },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, null);
  assert.equal(mappings[0].reason, 'ambiguous_path_identity');
  assert.deepEqual(mappings[0].candidatePatientIds, ['patient-1', 'patient-2']);
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

test('resolvePatientAssetIds includes multiple path aliases when canonical name is population-unique', async () => {
  const patient = { id: 'patient-khalid', displayName: 'Khalid Ahmed Mohamed' };
  const ids = await resolvePatientAssetIds({
    patientId: patient.id,
    patient,
    patientPopulation: [patient, { id: 'patient-other', displayName: 'Other Person' }],
    tenantId: 'hair-tp-clinic',
    customerStore: makeCustomerStore({}),
    assetStore: makeAssetStore([
      {
        patientId: 'cliento-khalid-a',
        status: 'VISIBLE_ON_PATIENT_CARD',
        originalDrivePath: 'Mars 2026/Khalid Ahmed Mohamed/IMG_001.jpg',
      },
      {
        patientId: 'cliento-khalid-b',
        status: 'VISIBLE_ON_PATIENT_CARD',
        originalDrivePath: 'Mars 2026/Khalid Ahmed Mohamed/IMG_002.jpg',
      },
    ]),
  });

  assert.deepEqual(ids, ['patient-khalid', 'cliento-khalid-a', 'cliento-khalid-b']);
});

test('resolvePatientAssetIds keeps safe name aliases after a personnummer alias matched', async () => {
  const patient = {
    id: 'patient-khalid',
    displayName: 'Khalid Ahmed Mohamed',
    personnummer: '19941210-3971',
  };
  const ids = await resolvePatientAssetIds({
    patientId: patient.id,
    patient,
    patientPopulation: [patient, { id: 'patient-other', displayName: 'Other Person' }],
    tenantId: 'hair-tp-clinic',
    customerStore: makeCustomerStore({}),
    assetStore: makeAssetStore([
      {
        patientId: 'cliento-khalid-pnr',
        status: 'VISIBLE_ON_PATIENT_CARD',
        relativePath: 'Mars 2026/Khalid Ahmed Mohamed - 19941210-3971/journal.pdf',
      },
      {
        patientId: 'cliento-khalid-name',
        status: 'VISIBLE_ON_PATIENT_CARD',
        relativePath: 'Mars 2026/Khalid Ahmed Mohamed/IMG_001.jpg',
      },
    ]),
  });

  assert.deepEqual(ids, ['patient-khalid', 'cliento-khalid-pnr', 'cliento-khalid-name']);
});

test('resolvePatientAssetIds rejects path aliases when canonical name is duplicated', async () => {
  const patient = { id: 'patient-sam-1', displayName: 'Sam Same' };
  const ids = await resolvePatientAssetIds({
    patientId: patient.id,
    patient,
    patientPopulation: [patient, { id: 'patient-sam-2', displayName: 'Sam Same' }],
    tenantId: 'hair-tp-clinic',
    customerStore: makeCustomerStore({}),
    assetStore: makeAssetStore([
      {
        patientId: 'cliento-sam',
        status: 'VISIBLE_ON_PATIENT_CARD',
        originalDrivePath: 'Mars 2026/Sam Same/IMG_001.jpg',
      },
    ]),
  });

  assert.deepEqual(ids, ['patient-sam-1']);
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

test('assetToPatientFile uses EXIF capture time for visit timeline before Drive folder date', () => {
  const file = assetToPatientFile({
    id: 'asset-exif-1',
    status: 'VISIBLE_ON_PATIENT_CARD',
    category: 'photo_during',
    mimeType: 'image/jpeg',
    displayName: '025436E4.jpeg',
    originalFileName: '025436E4.jpeg',
    documentDate: '2025-01-06',
    captureDate: '2026-01-06',
    captureDateTime: '2026-01-06T11:36:21+01:00',
    captureDateSource: 'exif',
  });

  assert.equal(file.documentDate, '2025-01-06');
  assert.equal(file.captureDate, '2026-01-06');
  assert.equal(file.timelineDate, '2026-01-06');
  assert.equal(file.timelineDateSource, 'patient_asset.captureDateTime');
  assert.equal(file.occasionContext.timelineKey, '2026-01-06');
  assert.equal(file.occasionContext.documentDate, '2025-01-06');
  assert.equal(file.occasionContext.captureDate, '2026-01-06');
  assert.ok(file.timelineSortKey.startsWith('2026-01-06T11:36:21'));
});

test('assetToPatientFile rewrites stale generated image display date in payload only', () => {
  const file = assetToPatientFile({
    id: 'asset-stale-name-1',
    status: 'VISIBLE_ON_PATIENT_CARD',
    category: 'photo_during',
    mimeType: 'image/jpeg',
    displayName: '2025-01-06 · FUE Operation 1 · Under',
    originalFileName: '025436E4.jpeg',
    documentDate: '2025-01-06',
    captureDateTime: '2026-01-06T11:36:21+01:00',
  });

  assert.equal(file.fileName, '2026-01-06 · FUE Operation 1 · Under');
  assert.equal(file.originalFileName, '025436E4.jpeg');
});

test('assetToPatientFile exposes visit video metadata without leaking storage internals', () => {
  const file = assetToPatientFile({
    id: 'video-meta',
    patientId: 'patient-1',
    sourceSystem: 'upload',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'video/mp4',
    fileSize: 4_200_000,
    importedAt: '2026-06-19T10:00:00.000Z',
    technicalInfo: { durationSeconds: 92, uploadedAt: '2026-06-19T10:00:01.000Z' },
  });
  assert.equal(file.durationSeconds, 92);
  assert.equal(file.fileSize, 4_200_000);
  assert.equal(file.uploadedAt, '2026-06-19T10:00:01.000Z');
  assert.equal('storageKey' in file, false);
});

test('resolveCanonicalPatientsForAssetAliases prefers exact name over first-name prefix', () => {
  const mappings = resolveCanonicalPatientsForAssetAliases({
    patients: [
      { id: 'andreas-full', displayName: 'Andreas Paulsen Ernek' },
      { id: 'andreas-stub-1', displayName: 'Andreas' },
      { id: 'andreas-stub-2', displayName: 'Andreas' },
      { id: 'andreas-stub-3', displayName: 'Andreas' },
    ],
    assets: [
      {
        patientId: 'cliento_andreas',
        originalDrivePath: 'Hair TP Clinic 2022/Andreas Paulsen Ernek/IMG_001.HEIC',
      },
    ],
  });

  assert.deepEqual(mappings, [
    {
      assetPatientId: 'cliento_andreas',
      canonicalPatientId: 'andreas-full',
      reason: 'exact_name_path',
      candidatePatientIds: ['andreas-full'],
    },
  ]);
});

test('resolveCanonicalPatientsForAssetAliases still falls back to prefix when no exact match', () => {
  const mappings = resolveCanonicalPatientsForAssetAliases({
    patients: [{ id: 'simon-stub', displayName: 'Simon' }],
    assets: [
      {
        patientId: 'cliento_simon',
        originalDrivePath: 'Hair TP Clinic 2024/Simon de Woul/IMG_002.HEIC',
      },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, 'simon-stub');
  assert.equal(mappings[0].reason, 'name_prefix_path');
});

// Läs-endast-sampling mot prod (2026-08-14, kollisionsgrupp
// cliento_117a24b7…, 600 assets): sökvägar bär ofta riktig PII, men en
// del är dubbelkodade från Drive ("Grillsj+?" i stället för "Grillsjö")
// — samma mojibake documentClassifier.js redan löste för
// hälsodeklarationer/friskförsäkringar. Utan reparation missar
// PNR/namn-matchningen nedan dem helt.
test('resolveCanonicalPatientsForAssets reparerar dubbelkodat namn i sökvägen innan matchning', () => {
  const mappings = resolveCanonicalPatientsForAssets({
    patients: [{ id: 'p1', displayName: 'Anna Grillsjö' }],
    assets: [
      {
        id: 'a1',
        patientId: 'cliento_abc',
        // "Ã¶" = UTF-8-byten för "ö" feltolkade som Latin-1.
        originalDrivePath: 'Kunder/Anna GrillsjÃ¶/journal.pdf',
      },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, 'p1');
  assert.equal(mappings[0].reason, 'exact_name_path');
});

test('resolveCanonicalPatientsForAssets matchar fortfarande rent, icke-mojibake namn (regression)', () => {
  const mappings = resolveCanonicalPatientsForAssets({
    patients: [{ id: 'p1', displayName: 'Anna Grillsjö' }],
    assets: [
      { id: 'a1', patientId: 'cliento_abc', originalDrivePath: 'Kunder/Anna Grillsjö/journal.pdf' },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, 'p1');
  assert.equal(mappings[0].reason, 'exact_name_path');
});

test('resolveCanonicalPatientsForAssetAliases reparerar dubbelkodat namn i sökvägen innan matchning', () => {
  const mappings = resolveCanonicalPatientsForAssetAliases({
    patients: [{ id: 'daniel-full', displayName: 'Daniel Grillsjö' }],
    assets: [
      {
        patientId: 'cliento_daniel',
        originalDrivePath: 'Hair TP Clinic 2024/Daniel GrillsjÃ¶/journal.pdf',
      },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, 'daniel-full');
  assert.equal(mappings[0].reason, 'exact_name_path');
});

test('resolveCanonicalPatientsForAssets: en text som inte ser dubbelkodad ut lämnas orörd (mojibake-signaturen gissar inte i onödan)', () => {
  const mappings = resolveCanonicalPatientsForAssets({
    patients: [{ id: 'p1', displayName: 'Erik Ö' }],
    assets: [
      // Inget mojibake-mönster (Â/Ã följt av en specialtecken) i den här
      // sökvägen — ska varken repareras eller av misstag matcha fel patient.
      { id: 'a1', patientId: 'cliento_xyz', originalDrivePath: 'Kunder/Okänd Person/foto.jpg' },
    ],
  });

  assert.equal(mappings[0].canonicalPatientId, null);
  assert.equal(mappings[0].reason, 'unresolved_path_identity');
});
