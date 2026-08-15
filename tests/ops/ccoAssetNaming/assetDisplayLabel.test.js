'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assetDisplayLabel,
  looksTechnicalName,
} = require('../../../src/ops/ccoAssetNaming/assetDisplayLabel');

test('assetDisplayLabel: använder displayName när den finns och är mänsklig', () => {
  const asset = {
    displayName: 'Samuel Sälls · PRP 3 · Under',
    originalFileName: 'IMG_1234.jpg',
  };
  assert.equal(assetDisplayLabel(asset), 'Samuel Sälls · PRP 3 · Under');
});

test('assetDisplayLabel: faller tillbaka på documentTitle när displayName är teknisk', () => {
  const asset = {
    displayName: 'IMG_2025_1234',
    documentTitle: 'Samtycke 2025',
    originalFileName: 'IMG_1234.jpg',
  };
  assert.equal(assetDisplayLabel(asset), 'Samtycke 2025');
});

test('assetDisplayLabel: använder visitLabel + documentTitle när båda finns', () => {
  const asset = {
    displayName: 'IMG_1234',
    documentTitle: 'Journalanteckning',
    visitLabel: 'PRP 2',
  };
  assert.equal(assetDisplayLabel(asset), 'PRP 2 · Journalanteckning');
});

test('assetDisplayLabel: använder visitLabel ensamt om documentTitle saknas', () => {
  const asset = {
    displayName: 'DSC00001',
    visitLabel: 'FUE Operation 5',
  };
  assert.equal(assetDisplayLabel(asset), 'FUE Operation 5');
});

test('assetDisplayLabel: använder fallback om inget annat finns', () => {
  const asset = { originalFileName: 'IMG_1234.jpg' };
  assert.equal(assetDisplayLabel(asset, { fallback: 'Originalfil' }), 'Originalfil');
});

test('assetDisplayLabel: returnerar default när inget finns', () => {
  const asset = { originalFileName: 'IMG_1234.jpg' };
  assert.equal(assetDisplayLabel(asset), 'Importerat dokument');
});

test('assetDisplayLabel: prioriterar manuellt löst displayName', () => {
  const asset = {
    displayName: 'Manuellt namn',
    namingStatus: 'manual_resolved',
    documentTitle: 'Automatiskt namn',
  };
  assert.equal(assetDisplayLabel(asset), 'Manuellt namn');
});

test('looksTechnicalName: identifierar IMG_, DSC- och UUID-liknande namn', () => {
  assert.equal(looksTechnicalName('IMG_1234'), true);
  assert.equal(looksTechnicalName('DSC0001'), true);
  assert.equal(looksTechnicalName('22e00fd0-57bd-40fa-b3fc-fb688c14244c'), true);
  assert.equal(looksTechnicalName('PRP 3 · Under'), false);
});

test('looksTechnicalName: tomt namn räknas som tekniskt', () => {
  assert.equal(looksTechnicalName(''), true);
  assert.equal(looksTechnicalName('   '), true);
});
