'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  E8_SIGN_REGISTRY_IDS,
  isE8SignRegistry,
  resolveSignConfig,
  listE8SignRegistryIds,
  buildSignManifest,
} = require('../../src/ops/patientDocumentSignRegistry');
const { OFFERT_SLUG } = require('../../src/ops/patientDocumentLiveRegistry');

test('E8 covers 12 signera registryIds (A1–A11, A15)', () => {
  assert.equal(E8_SIGN_REGISTRY_IDS.length, 12);
  assert.ok(isE8SignRegistry('haelso_tp_sve'));
  assert.ok(isE8SignRegistry('foto_samtycke'));
  assert.equal(isE8SignRegistry('journal_tp'), false);
});

test('offert phase 5 disables signering', () => {
  const cfg = resolveSignConfig('offert_tp', { phase: 5 });
  assert.equal(cfg.disabled, true);
  assert.match(cfg.disabledReason, /steg 7/i);
});

test('offert phase 7 enables treatment_agreement handler', () => {
  const cfg = resolveSignConfig('offert_prp_hair', { phase: 7 });
  assert.equal(cfg.signEnabled, true);
  assert.equal(cfg.handler, 'treatment_agreement');
  assert.deepEqual(cfg.requiredAckSelectors, ['#bundle-ack', '#cooling-ack']);
});

test('all E8 ids resolve sign config', () => {
  for (const registryId of listE8SignRegistryIds()) {
    const phase = OFFERT_SLUG[registryId] ? 7 : undefined;
    const cfg = resolveSignConfig(registryId, { phase });
    assert.ok(cfg, `${registryId} saknar config`);
    assert.ok(cfg.handler, `${registryId} saknar handler`);
    if (OFFERT_SLUG[registryId]) {
      assert.equal(cfg.handler, 'treatment_agreement');
    }
  }
});

test('buildSignManifest lists all E8 rows', () => {
  const rows = buildSignManifest();
  assert.equal(rows.length, 12);
  const offertRows = rows.filter((r) => OFFERT_SLUG[r.registryId]);
  assert.equal(offertRows.length, Object.keys(OFFERT_SLUG).length);
  for (const row of offertRows) {
    assert.equal(row.signEnabledPhase7, true);
    assert.equal(row.signDisabledPhase5, true);
  }
});
