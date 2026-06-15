'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDocumentTypeById } = require('../../src/ops/ccoDocumentTypeRegistry');

const bundlePath = path.join(
  __dirname,
  '../../public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

function findDocumentByRegistryId(registryId) {
  for (const section of ['customerFilled', 'staffFilled', 'information']) {
    const hit = (bundle[section] || []).find((doc) => doc.registryId === registryId);
    if (hit) return hit;
  }
  return null;
}

function hasPreviewContent(doc) {
  const content = doc?.content || {};
  return Boolean(content.smsText || content.emailBody || content.emailSample?.text);
}

test('content bundle exposes all auto_ registry types from catalog', () => {
  const autoTypes = Object.values(bundle.information || {})
    .concat(bundle.customerFilled || [], bundle.staffFilled || [])
    .filter((doc) => String(doc.registryId || '').startsWith('auto_'));

  const registryAutoIds = [
    'auto_bokningsbekraftelse',
    'auto_bokningspaminnelse',
    'auto_avbokningsbekraftelse',
    'auto_instruktion_formular',
    'auto_betanketid',
    'auto_medical_finance',
    'auto_integritet',
    'auto_internt_sms',
  ];

  for (const id of registryAutoIds) {
    const doc = findDocumentByRegistryId(id);
    assert.ok(doc, `missing auto doc in bundle: ${id}`);
    assert.equal(getDocumentTypeById(id)?.filler, 'system_auto');
  }

  assert.ok(autoTypes.length >= registryAutoIds.length);
});

test('primary auto docs include SMS or email preview text when content exists', () => {
  const previewIds = ['auto_bokningsbekraftelse', 'auto_bokningspaminnelse', 'auto_betanketid'];

  for (const id of previewIds) {
    const doc = findDocumentByRegistryId(id);
    assert.ok(doc, `${id} missing from bundle`);
    if (doc.contentStatus === 'FULL') {
      assert.ok(hasPreviewContent(doc), `${id} FULL should expose sms/email preview text`);
    }
  }

  assert.ok(hasPreviewContent(findDocumentByRegistryId('auto_bokningsbekraftelse')));
});

test('auto_internt_sms is present but may lack preview body (MISSING/PARTIAL acceptable)', () => {
  const doc = findDocumentByRegistryId('auto_internt_sms');
  assert.ok(doc);
  assert.ok(['FULL', 'PARTIAL', 'MISSING'].includes(String(doc.contentStatus || '').toUpperCase()));
});
