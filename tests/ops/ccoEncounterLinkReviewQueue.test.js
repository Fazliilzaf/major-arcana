'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEncounterLinkReviewQueue } = require('../../src/ops/ccoEncounterLinkReviewQueue');

test('buildEncounterLinkReviewQueue groups only unresolved and ambiguous media', () => {
  const report = buildEncounterLinkReviewQueue({
    patients: [
      { id: 'patient-sam-1', displayName: 'Sam Same' },
      { id: 'patient-sam-2', displayName: 'Sam Same' },
    ],
    assets: [
      {
        id: 'asset-ambiguous-1',
        patientId: 'cliento-ambiguous',
        status: 'VISIBLE_ON_PATIENT_CARD',
        mimeType: 'image/jpeg',
        originalFileName: 'IMG_1.jpg',
        relativePath: 'Sam Same/IMG_1.jpg',
      },
      {
        id: 'asset-linked-1',
        patientId: 'cliento-linked',
        status: 'VISIBLE_ON_PATIENT_CARD',
        mimeType: 'image/jpeg',
        encounterId: 'encounter-1',
      },
    ],
    includeDetails: true,
  });

  assert.equal(report.zeroWrites, true);
  assert.equal(report.stats.missingEncounterId, 1);
  assert.equal(report.stats.identityResolved, 0);
  assert.equal(report.stats.reviewAssets, 1);
  assert.equal(report.stats.ambiguousGroups, 1);
  assert.equal(report.groups[0].reason, 'ambiguous_path_identity');
  assert.deepEqual(
    report.groups[0].candidatePatients.map((row) => row.patientId),
    ['patient-sam-1', 'patient-sam-2']
  );
});

test('buildEncounterLinkReviewQueue masks identifying details by default', () => {
  const report = buildEncounterLinkReviewQueue({
    assets: [
      {
        id: 'asset-unresolved-1234',
        patientId: 'cliento-unresolved-1234',
        status: 'VERIFIED_IN_CCO',
        mimeType: 'image/heif',
        originalFileName: 'Secret Name.HEIC',
      },
    ],
  });

  assert.equal(report.stats.unresolvedGroups, 1);
  assert.match(report.groups[0].assetPatientId, /\*\*\*/);
  assert.match(report.groups[0].assets[0].assetId, /\*\*\*/);
  assert.equal(report.groups[0].assets[0].fileName, null);
  assert.equal(report.groups[0].assets[0].path, null);
});

test('buildEncounterLinkReviewQueue excludes media already owned by a canonical patient id', () => {
  const report = buildEncounterLinkReviewQueue({
    patients: [{ id: 'patient-direct', displayName: 'Direct Patient' }],
    assets: [
      {
        id: 'asset-direct',
        patientId: 'patient-direct',
        status: 'VISIBLE_ON_PATIENT_CARD',
        category: 'photo_during',
        mimeType: 'image/jpeg',
      },
    ],
  });

  assert.equal(report.stats.missingEncounterId, 1);
  assert.equal(report.stats.identityResolved, 1);
  assert.equal(report.stats.reviewGroups, 0);
  assert.equal(report.stats.reviewAssets, 0);
  assert.deepEqual(report.groups, []);
});

test('buildEncounterLinkReviewQueue keeps only unresolved files from a shared alias', () => {
  const report = buildEncounterLinkReviewQueue({
    patients: [{ id: 'patient-lisa', displayName: 'Lisa Karlsson', personnummer: '020405-7160' }],
    assets: [
      {
        id: 'asset-resolved',
        patientId: 'shared-alias',
        status: 'VISIBLE_ON_PATIENT_CARD',
        mimeType: 'image/jpeg',
        relativePath: 'PRP 2025/Lisa Karlsson - 0204057160/IMG_1.jpg',
      },
      {
        id: 'asset-unresolved',
        patientId: 'shared-alias',
        status: 'VISIBLE_ON_PATIENT_CARD',
        mimeType: 'image/jpeg',
        relativePath: 'PRP 2025/Okänd/IMG_2.jpg',
      },
    ],
    includeDetails: true,
  });

  assert.equal(report.stats.missingEncounterId, 2);
  assert.equal(report.stats.identityResolved, 1);
  assert.equal(report.stats.reviewAssets, 1);
  assert.equal(report.groups[0].assets[0].assetId, 'asset-unresolved');
});
