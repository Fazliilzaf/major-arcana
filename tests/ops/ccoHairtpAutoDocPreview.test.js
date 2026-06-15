'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

test('reference kundkort auto-doc rows are previewable', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-kundkort-referens.js'),
    'utf8'
  );
  const noop = () => {};
  const window = { addEventListener: noop, setTimeout, clearTimeout };
  const document = {
    addEventListener: noop,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return {
        classList: { add: noop, remove: noop },
        style: {},
        setAttribute: noop,
        appendChild: noop,
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
      };
    },
  };
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  class IntersectionObserver {
    observe() {}
    disconnect() {}
  }

  vm.runInNewContext(
    source,
    {
      window,
      document,
      console,
      setTimeout,
      clearTimeout,
      URLSearchParams,
      MutationObserver,
      IntersectionObserver,
    },
    { filename: 'cco-kundkort-referens.js' }
  );

  const html = window.__renderReferensKundkort(
    { id: 'patient-1', displayName: 'Test Kund' },
    {
      documents: {
        autoDocs: [
          {
            registryId: 'auto_bokningsbekraftelse',
            title: 'Bokningsbekräftelse (SMS/e-post)',
            statusLabel: 'Planerad',
            step: 2,
          },
          {
            registryId: 'auto_internt_sms',
            title: 'Internt SMS vid bokning/avbokning',
            statusLabel: 'Planerad',
          },
        ],
      },
    },
    [],
    { driveFiles: [] }
  );

  assert.match(html, /data-kk-auto-doc-preview="auto_bokningsbekraftelse"/);
  assert.match(html, /data-kk-auto-doc-preview="auto_internt_sms"/);
  assert.match(html, /data-v11-doc-previewable="1"/);
  assert.match(html, /role="button"/);
  assert.match(html, /Visa mall/);
});
