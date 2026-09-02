'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  HAIR_TP_CANONICAL,
  canonicalTenantId,
  isKnownTenantId,
} = require('../../src/tenant/tenantIdCanonical');

test('canonicalTenantId normaliserar alla Hair TP-varianter till hair-tp-clinic', () => {
  for (const variant of ['hair-tp-clinic', 'hairtpclinic', 'hairtp-clinic', 'hair_tp']) {
    assert.equal(canonicalTenantId(variant), HAIR_TP_CANONICAL, `${variant} ska bli ${HAIR_TP_CANONICAL}`);
  }
  // Skiftläge och whitespace ska inte spela roll.
  assert.equal(canonicalTenantId('  Hair_TP  '), HAIR_TP_CANONICAL);
});

test('canonicalTenantId behåller curatiio som egen tenant', () => {
  assert.equal(canonicalTenantId('curatiio'), 'curatiio');
});

test('canonicalTenantId ger null för Hair TP-typo (anroparen ska larma, inte anta)', () => {
  for (const typo of ['', 'hairtpclinc', 'hair_tp_clinic', 'hair-tp-clinc']) {
    assert.equal(canonicalTenantId(typo), null, `"${typo}" ska vara en Hair TP-typo`);
  }
  assert.equal(canonicalTenantId(undefined), null);
});

test('canonicalTenantId passerar andra tenants oförändrade', () => {
  assert.equal(canonicalTenantId('arcana'), 'arcana');
  assert.equal(canonicalTenantId('unknown-clinic'), 'unknown-clinic');
});

test('isKnownTenantId speglar canonicalTenantId', () => {
  assert.equal(isKnownTenantId('hair_tp'), true);
  assert.equal(isKnownTenantId('curatiio'), true);
  assert.equal(isKnownTenantId('typo-hair-tp'), false);
});
