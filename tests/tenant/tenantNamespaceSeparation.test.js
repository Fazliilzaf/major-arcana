'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { canonicalTenantId } = require('../../src/tenant/tenantIdCanonical');
const { DEFAULT_TENANT, resolveSignConfig } = require('../../src/ops/patientDocumentSignRegistry');

/**
 * ORD-165 §3 — `hair_tp` betyder TRE olika saker i koden. Det här testet låser
 * fast att tenant-modulen bara rör TENANT-namnrymden.
 *
 * patientDocumentSignRegistry.js bär två av betydelserna i samma fil:
 *   rad 33  DEFAULT_TENANT = 'hair_tp'   ← TENANT
 *   rad 63  formVariant: 'hair_tp'       ← FORMVARIANT (schema-nyckel)
 *   rad 79  formVariant: 'hair_tp'       ← FORMVARIANT
 *
 * Den tredje, BRAND (~15 ställen, t.ex. ccoDriveLinkBuilder), rörs inte här.
 *
 * Fällan ORD-165 beskriver: ett normaliseringssvep över filen förstör den ena
 * betydelsen. Testet gör den skillnaden sökbar och verifierbar.
 */

test('hair_tp som TENANT normaliseras, men hair_tp som FORMVARIANT är en schema-nyckel', () => {
  // TENANT — DEFAULT_TENANT ska kunna normaliseras till kanoniskt värde.
  assert.equal(DEFAULT_TENANT, 'hair_tp');
  assert.equal(canonicalTenantId(DEFAULT_TENANT), 'hair-tp-clinic');

  // FORMVARIANT — samma sträng, men här en schema-nyckel. Den får INTE matas
  // genom tenant-modulen: formVariant 'hair_tp' pekar på Hair TP:s
  // friskförsäkran-formulär, inte på en tenant.
  const friskfoers = resolveSignConfig('friskfoers_tp');
  assert.equal(friskfoers.formType, 'fitness_certificate');
  assert.equal(friskfoers.formVariant, 'hair_tp');
  // Hade formVariant normaliserats till 'hair-tp-clinic' hade schemat inte
  // hittat formuläret — det fångas också av signeringsvariantHarSchema.test.js.
  assert.notEqual(friskfoers.formVariant, canonicalTenantId(DEFAULT_TENANT));
});
