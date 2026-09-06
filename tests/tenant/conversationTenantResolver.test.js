'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveConversationTenant } = require('../../src/tenant/conversationTenantResolver');
const { HAIR_TP_CANONICAL } = require('../../src/tenant/tenantIdCanonical');

// T-001 / T-008 / T-017 — canonical tenant kommer från den autentiserade
// membership-tenanten, aldrig från ett client-fält.

test('T-001: resolverar authenticated tenant till canonical (Hair TP)', () => {
  assert.equal(
    resolveConversationTenant({ auth: { tenantId: 'hair_tp' } }, 'hair-tp-clinic'),
    HAIR_TP_CANONICAL
  );
  assert.equal(
    resolveConversationTenant({ auth: { tenantId: 'hairtpclinic' } }, 'hair-tp-clinic'),
    HAIR_TP_CANONICAL
  );
  assert.equal(
    resolveConversationTenant({ auth: { tenantId: 'hair-tp-clinic' } }, 'hair-tp-clinic'),
    HAIR_TP_CANONICAL
  );
});

test('T-017: Curatiio behåller sin egen canonical tenant', () => {
  assert.equal(
    resolveConversationTenant({ auth: { tenantId: 'curatiio' } }, 'hair-tp-clinic'),
    'curatiio'
  );
});

test('T-017: Hair TP och Curatiio ger OLIKA tenant-nycklar', () => {
  const hair = resolveConversationTenant(
    { auth: { tenantId: 'hair-tp-clinic' } },
    'hair-tp-clinic'
  );
  const curatiio = resolveConversationTenant({ auth: { tenantId: 'curatiio' } }, 'hair-tp-clinic');
  assert.notEqual(hair, curatiio);
});

test('T-008: client-supplied tenantId (body/query/header) kan INTE ändra state-nyckeln', () => {
  // Resolver läser enbart req.auth.tenantId. Ett body/query-värde ignoreras.
  const req = {
    auth: { tenantId: 'hair-tp-clinic' },
    body: { tenantId: 'curatiio' },
    query: { tenantId: 'curatiio' },
    headers: { 'x-cco-tenant': 'curatiio' },
  };
  assert.equal(resolveConversationTenant(req, 'hair-tp-clinic'), HAIR_TP_CANONICAL);
});

test('fallback: canonical default används bara när trusted auth saknas', () => {
  assert.equal(resolveConversationTenant({}, 'hair-tp-clinic'), HAIR_TP_CANONICAL);
  assert.equal(resolveConversationTenant({ auth: {} }, 'hair-tp-clinic'), HAIR_TP_CANONICAL);
  assert.equal(resolveConversationTenant(null, 'hair-tp-clinic'), HAIR_TP_CANONICAL);
});

test('fallback: utan auth OCH utan canonical default blir nyckeln tom (fail-closed)', () => {
  assert.equal(resolveConversationTenant({}, ''), '');
});

test("'cco' är INTE en tenant och normaliseras INTE tyst till Hair TP", () => {
  // 'cco' ska aldrig användas som tenant-nyckel, men det ska heller INTE läggas
  // till som global alias (det vore att normalisera ett icke-tenantvärde till en
  // klinik). canonicalTenantId lämnar 'cco' oförändrat — konversationsrouterns
  // tenant-scope-fence nekar det innan det når state-keying.
  assert.notEqual(
    resolveConversationTenant({ auth: { tenantId: 'cco' } }, 'hair-tp-clinic'),
    HAIR_TP_CANONICAL
  );
});
