'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REVIEW_STAGES,
  BODY_AREAS,
  STAGE_DISPLAY,
  resolveReviewStage,
  normalizeBodyArea,
  buildTechnicalInfo,
  buildPhotoReviewDisplayName,
  buildPhotoReviewNamingPatch,
  buildPhotoReviewRejectPatch,
  buildPhotoReviewReassignPatch,
} = require('../../../src/ops/ccoAssetNaming/photoReviewNaming');

test('resolveReviewStage: hittar fas från imageStage', () => {
  const result = resolveReviewStage({ imageStage: 'during' });
  assert.equal(result.imageStage, 'during');
  assert.equal(result.category, 'photo_during');
  assert.equal(result.label, 'Under');
});

test('resolveReviewStage: faller tillbaka på category om imageStage saknas', () => {
  const result = resolveReviewStage({ category: 'photo_after' });
  assert.equal(result.imageStage, 'after');
  assert.equal(result.category, 'photo_after');
});

test('resolveReviewStage: returnerar null för ogiltig fas', () => {
  assert.equal(resolveReviewStage({ imageStage: 'invalid' }), null);
  assert.equal(resolveReviewStage({}), null);
});

test('normalizeBodyArea: accepterar kända kroppszoner', () => {
  assert.equal(normalizeBodyArea('skalp'), 'skalp');
  assert.equal(normalizeBodyArea('DONOR'), 'donorområde');
  assert.equal(normalizeBodyArea('  Hairline '), 'hairline');
});

test('normalizeBodyArea: avvisar okända värden', () => {
  assert.equal(normalizeBodyArea('nose'), null);
  assert.equal(normalizeBodyArea(''), null);
  assert.equal(normalizeBodyArea(null), null);
});

test('buildTechnicalInfo: samlar tekniska fält', () => {
  const asset = {
    storageKey: 's3://bucket/key',
    checksum: 'sha256:abc',
    fileSize: 12345,
    mimeType: 'image/jpeg',
    storageProvider: 's3',
  };
  const info = buildTechnicalInfo(asset);
  assert.equal(info.storageKey, 's3://bucket/key');
  assert.equal(info.checksum, 'sha256:abc');
  assert.equal(info.fileSize, 12345);
  assert.equal(info.mimeType, 'image/jpeg');
  assert.equal(info.storageProvider, 's3');
});

test('buildTechnicalInfo: hanterar saknade fält', () => {
  const info = buildTechnicalInfo({ fileSize: 'not-a-number' });
  assert.equal(info.storageKey, null);
  assert.equal(info.fileSize, null);
});

test('buildPhotoReviewDisplayName: bygger namn med zonkul', () => {
  const asset = {
    documentDate: '2025-03-15',
    treatmentType: 'FUE',
    imageStage: 'during',
    bodyArea: 'skalp',
  };
  const name = buildPhotoReviewDisplayName(asset, { visitLabel: 'FUE Operation 3' });
  assert.equal(name, '2025-03-15 · FUE Operation 3 · Under behandling · skalp');
});

test('buildPhotoReviewDisplayName: bygger namn utan zon', () => {
  const asset = {
    documentDate: '2025-03-15',
    treatmentType: 'PRP',
    imageStage: 'before',
  };
  const name = buildPhotoReviewDisplayName(asset, { visitLabel: 'PRP 1' });
  assert.equal(name, '2025-03-15 · PRP 1 · Före');
});

test('buildPhotoReviewDisplayName: använder okänt datum när inget datum finns', () => {
  const asset = { imageStage: 'after', bodyArea: 'donorområde' };
  const name = buildPhotoReviewDisplayName(asset, { visitLabel: 'Besök' });
  assert.equal(name, 'okänt datum · Besök · Efter · donorområde');
});

test('buildPhotoReviewDisplayName: hanterar follow_up som uppföljning', () => {
  const asset = { documentDate: '2025-06-01', imageStage: 'follow_up', bodyArea: 'skalp' };
  const name = buildPhotoReviewDisplayName(asset, { visitLabel: 'FUE Operation 5' });
  assert.equal(name, '2025-06-01 · FUE Operation 5 · Uppföljning · skalp');
});

test('buildPhotoReviewNamingPatch: bygger komplett patch', () => {
  const asset = {
    id: 'a1',
    originalFileName: 'foto.jpg',
    documentDate: '2025-03-15',
    treatmentType: 'FUE',
    storageKey: 's3://bucket/key',
  };
  const body = { imageStage: 'during', bodyArea: 'skalp', reviewer: 'Fazli', reason: 'godkänd' };
  const patch = buildPhotoReviewNamingPatch(asset, body, {
    siblingAssets: [asset],
    encounterStore: null,
  });

  assert.equal(patch.category, 'photo_during');
  assert.equal(patch.approvedCategory, 'photo_during');
  assert.equal(patch.imageStage, 'during');
  assert.equal(patch.imageType, 'during');
  assert.equal(patch.bodyArea, 'skalp');
  assert.equal(patch.namingStatus, 'manual_resolved');
  assert.equal(patch.uiStatus, 'visible');
  assert.equal(patch.namingConfidence, 'high');
  assert.equal(patch.reviewedBy, 'Fazli');
  assert.equal(patch.reviewReason, 'godkänd');
  assert.equal(patch.technicalInfo.storageKey, 's3://bucket/key');
  assert.ok(patch.displayName.includes('Under behandling'));
  assert.ok(patch.documentTitle.includes('Under'));
});

test('buildPhotoReviewNamingPatch: kastar vid ogiltig fas', () => {
  const asset = { id: 'a1' };
  assert.throws(
    () => buildPhotoReviewNamingPatch(asset, { imageStage: 'invalid', bodyArea: 'skalp' }),
    { message: /imageStage\/category ogiltig/ }
  );
});

test('buildPhotoReviewNamingPatch: kastar vid ogiltig bodyArea', () => {
  const asset = { id: 'a1' };
  assert.throws(
    () => buildPhotoReviewNamingPatch(asset, { imageStage: 'during', bodyArea: 'nose' }),
    { message: /bodyArea krävs/ }
  );
});

test('buildPhotoReviewRejectPatch: sätter rejected-status', () => {
  const asset = { id: 'a1' };
  const patch = buildPhotoReviewRejectPatch(asset, { reason: 'dålig kvalitet', reviewer: 'Fazli' });
  assert.equal(patch.namingStatus, 'rejected');
  assert.equal(patch.uiStatus, 'rejected');
  assert.equal(patch.reviewReason, 'dålig kvalitet');
  assert.equal(patch.reviewedBy, 'Fazli');
});

test('buildPhotoReviewReassignPatch: bygger omkategoriseringspatch', () => {
  const asset = {
    id: 'a1',
    category: 'photo_before',
    documentDate: '2025-03-15',
  };
  const patch = buildPhotoReviewReassignPatch(
    asset,
    { imageStage: 'after', bodyArea: 'skalp', reason: 'flyttad', reviewer: 'Fazli' },
    { siblingAssets: [asset] }
  );

  assert.equal(patch.oldCategory, 'photo_before');
  assert.equal(patch.category, 'photo_after');
  assert.equal(patch.suggestedCategory, 'photo_after');
  assert.equal(patch.imageStage, 'after');
  assert.equal(patch.imageType, 'after');
  assert.equal(patch.bodyArea, 'skalp');
  assert.equal(patch.namingStatus, 'needs_review_for_naming');
  assert.equal(patch.uiStatus, 'needs_review');
});

test('STAGE_DISPLAY och BODY_AREAS exporteras', () => {
  assert.equal(STAGE_DISPLAY.before, 'Före');
  assert.equal(BODY_AREAS.donor, 'donorområde');
});

test('REVIEW_STAGES har fyra faser', () => {
  assert.equal(REVIEW_STAGES.length, 4);
  assert.ok(REVIEW_STAGES.some((s) => s.id === 'follow_up'));
});
