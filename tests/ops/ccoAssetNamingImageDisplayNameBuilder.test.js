'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyImage,
  buildImageDisplayName,
  detectZone,
} = require('../../src/ops/ccoAssetNaming/imageDisplayNameBuilder');

test('detectZone matches known body-zone keywords', () => {
  assert.equal(detectZone('donor-area-01.jpg'), 'donorområde');
  assert.equal(detectZone('crown_top.jpg'), 'crown');
  assert.equal(detectZone('random-file.jpg'), null);
});

// CCO-STATUS.md punkt 1, uppföljning (2026-08-14): mätt mot prod att
// 86 892 av 90 069 lågkonfidenta poster (96 %) var photo_during-bilder
// som föll på just den här regeln — ett generiskt kamerafilnamn
// (IMG_1234.jpg) tvingade confidence: 'low' trots att fasen
// (före/under/efter) redan var tillförlitligt känd via category.
test('classifyImage: photo_during med generiskt kamerafilnamn får medium (inte low) — fasen är känd via category, oavsett filnamn', () => {
  const result = classifyImage({
    category: 'photo_during',
    originalFileName: 'IMG_20260115_0042.jpg',
  });
  assert.equal(result.imageType, 'during');
  assert.equal(result.bodyArea, null);
  assert.equal(result.confidence, 'medium');
});

test('classifyImage: photo_before/after med generiskt filnamn får också medium, oberoende av fas', () => {
  assert.equal(
    classifyImage({ category: 'photo_before', originalFileName: 'IMG_0001.jpg' }).confidence,
    'medium'
  );
  assert.equal(
    classifyImage({ category: 'photo_after', originalFileName: 'IMG_9999.jpg' }).confidence,
    'medium'
  );
});

test('classifyImage: känd fas OCH kroppszon i filnamnet ger fortfarande high', () => {
  const result = classifyImage({
    category: 'photo_during',
    originalFileName: 'donor-area-crown-01.jpg',
  });
  assert.equal(result.bodyArea, 'donorområde');
  assert.equal(result.confidence, 'high');
});

test('classifyImage: en okänd fas (t.ex. fel/saknad category, inget matchande filnamn) förblir low', () => {
  const result = classifyImage({ category: '', originalFileName: 'random-export-042.jpg' });
  assert.equal(result.imageType, 'unknown');
  assert.equal(result.confidence, 'low');
});

test('buildImageDisplayName: ett medium-konfident foto får ett rent, användbart namn utan platshållare för zon', () => {
  const result = buildImageDisplayName(
    {
      category: 'photo_during',
      originalFileName: 'IMG_20260115_0042.jpg',
      treatmentType: 'FUE',
      documentDate: '2026-01-15',
      status: 'VISIBLE_ON_PATIENT_CARD',
    },
    {}
  );
  assert.equal(result.namingConfidence, 'medium');
  assert.equal(result.displayName, '2026-01-15 · FUE · Under · synlig');
  assert.ok(
    !result.displayName.includes('zon okänd'),
    'zon-platshållare ska aldrig synas i namnet'
  );
});
