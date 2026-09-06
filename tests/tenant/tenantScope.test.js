'use strict';

/**
 * P1-003/004 — enhetstester för den delade canonical tenant-scopen:
 *   - resolveTenantScope(req, { clientTenant, fallbackTenantId })
 *   - tenantReadCandidates(canonicalValue)
 *
 * En autentiserad tenant → en tenant. Client-styrda tenant-värden (query/body)
 * får aldrig välja en annan tenant.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveTenantScope } = require('../../src/tenant/conversationTenantResolver');
const { tenantReadCandidates, HAIR_TP_CANONICAL } = require('../../src/tenant/tenantIdCanonical');

// ── T-006: alias-kandidater härleds från den autentiserade tenanten ──────────

test('T-006: Hair TP ger Hair TP-alias-kandidater', () => {
  assert.deepEqual(tenantReadCandidates('hair-tp-clinic'), [
    'hair-tp-clinic',
    'hairtpclinic',
    'hair_tp',
  ]);
});

test('T-006: Curatiio ger ENDAST curatiio — aldrig Hair TP-alias', () => {
  assert.deepEqual(tenantReadCandidates('curatiio'), ['curatiio']);
});

test('T-006: Hair TP-alias canonicaliseras till samma kandidatlista', () => {
  assert.deepEqual(tenantReadCandidates('hairtpclinic'), [
    'hair-tp-clinic',
    'hairtpclinic',
    'hair_tp',
  ]);
});

// ── T-007: 'cco' är aldrig en aktiv tenant ──────────────────────────────────

test("T-007: 'cco' är aldrig en aktiv tenant-kandidat", () => {
  // Hair TP och Curatiio får aldrig 'cco' i sina kandidatlistor.
  for (const c of tenantReadCandidates('hair-tp-clinic')) assert.notEqual(c, 'cco');
  for (const c of tenantReadCandidates('curatiio')) assert.notEqual(c, 'cco');
});

test("T-007: client-tenant 'cco' nekas (403) — inte en tenant", () => {
  assert.throws(
    () =>
      resolveTenantScope(
        { auth: { tenantId: 'hair-tp-clinic' } },
        { clientTenant: 'cco', fallbackTenantId: 'hair-tp-clinic' }
      ),
    (err) => err.statusCode === 403
  );
});

// ── T-013: saknas client-tenant används den autentiserade tenanten ───────────

test('T-013: utan client-tenant används autentiserad canonical tenant', () => {
  assert.equal(
    resolveTenantScope({ auth: { tenantId: 'hairtpclinic' } }, { fallbackTenantId: 'hair-tp-clinic' }),
    HAIR_TP_CANONICAL
  );
  assert.equal(
    resolveTenantScope({ auth: { tenantId: 'curatiio' } }, { fallbackTenantId: 'hair-tp-clinic' }),
    'curatiio'
  );
});

// ── T-003 / T-004: främmande query-tenant → 403 (fail closed) ────────────────

test('T-003: Hair TP-auth + query tenantId=curatiio → 403', () => {
  assert.throws(
    () =>
      resolveTenantScope(
        { auth: { tenantId: 'hair-tp-clinic' }, query: { tenantId: 'curatiio' } },
        { clientTenant: 'curatiio', fallbackTenantId: 'hair-tp-clinic' }
      ),
    (err) => err.statusCode === 403 && err.message === 'tenant_scope_forbidden'
  );
});

test('T-004: Curatiio-auth + query tenantId=hair-tp-clinic → 403', () => {
  assert.throws(
    () =>
      resolveTenantScope(
        { auth: { tenantId: 'curatiio' }, query: { tenantId: 'hair-tp-clinic' } },
        { clientTenant: 'hair-tp-clinic', fallbackTenantId: 'hair-tp-clinic' }
      ),
    (err) => err.statusCode === 403
  );
});

// ── T-008: body/query/header-värde kan inte välja en annan tenant ────────────

test('T-008: client body/query/header-tenant kan inte välja en främmande tenant', () => {
  const req = {
    auth: { tenantId: 'hair-tp-clinic' },
    body: { tenantId: 'curatiio' },
    query: { tenantId: 'curatiio' },
    headers: { 'x-cco-tenant': 'curatiio' },
  };
  assert.throws(
    () => resolveTenantScope(req, { clientTenant: 'curatiio', fallbackTenantId: 'hair-tp-clinic' }),
    (err) => err.statusCode === 403
  );
});

// ── T-012: malformed/okänd tenant fail closed ───────────────────────────────

test('T-012: Hair TP-typo (malformed) fail closed → 403', () => {
  assert.throws(
    () =>
      resolveTenantScope(
        { auth: { tenantId: 'hair-tp-clinic' } },
        { clientTenant: 'hairtp', fallbackTenantId: 'hair-tp-clinic' }
      ),
    (err) => err.statusCode === 403
  );
});

test('T-012: okänd främmande tenant fail closed → 403', () => {
  assert.throws(
    () =>
      resolveTenantScope(
        { auth: { tenantId: 'hair-tp-clinic' } },
        { clientTenant: 'acme-corp', fallbackTenantId: 'hair-tp-clinic' }
      ),
    (err) => err.statusCode === 403
  );
});

// ── T-024: alias som canonicaliserar till SAMMA tenant är tillåten ───────────

test('T-024: Hair TP-alias (samma tenant) accepteras och normaliseras', () => {
  assert.equal(
    resolveTenantScope(
      { auth: { tenantId: 'hair-tp-clinic' } },
      { clientTenant: 'hairtpclinic', fallbackTenantId: 'hair-tp-clinic' }
    ),
    HAIR_TP_CANONICAL
  );
  assert.equal(
    resolveTenantScope(
      { auth: { tenantId: 'hair-tp-clinic' } },
      { clientTenant: 'hair_tp', fallbackTenantId: 'hair-tp-clinic' }
    ),
    HAIR_TP_CANONICAL
  );
});

// ── T-024: Curatiio-alias accepteras bara för Curatiio-auth ─────────────────

test('T-024: curatiio accepteras för Curatiio-auth men nekas för Hair TP-auth', () => {
  assert.equal(
    resolveTenantScope({ auth: { tenantId: 'curatiio' } }, { clientTenant: 'curatiio' }),
    'curatiio'
  );
  assert.throws(
    () =>
      resolveTenantScope(
        { auth: { tenantId: 'hair-tp-clinic' } },
        { clientTenant: 'curatiio', fallbackTenantId: 'hair-tp-clinic' }
      ),
    (err) => err.statusCode === 403
  );
});
