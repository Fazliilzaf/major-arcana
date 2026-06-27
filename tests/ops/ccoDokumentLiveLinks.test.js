'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildLiveManifest } = require('../../src/ops/patientDocumentLiveRegistry');

const htmlPath = path.join(
  __dirname,
  '../../public/major-arcana-preview/cco-dokument-v1.html'
);

test('cco-dokument-v1 fetches the patient document live manifest', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /\/api\/v1\/cco\/patient-documents\/live\/manifest/);
  assert.match(html, /function renderLiveDetail\(doc\)/);
  assert.match(html, /Öppna live-dokument/);
});

test('cco-dokument-v1 live links are backed by the complete manifest contract', () => {
  const manifest = buildLiveManifest();
  assert.equal(manifest.length, 36);
  assert.ok(manifest.every((row) => row.exists), 'alla katalogdokument ska ha livefil');
  assert.ok(
    manifest.every((row) => row.livePath.startsWith('/major-arcana-preview/patient-doc/'))
  );
  assert.ok(
    manifest.some((row) => row.registryId === 'haelso_tp_sve' && row.audience === 'patient')
  );
  assert.ok(manifest.some((row) => row.registryId === 'journal_tp' && row.audience === 'staff'));
});
