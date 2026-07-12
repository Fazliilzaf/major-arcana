const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fortnoxTenantCandidates,
  resolveConnectedFortnoxTenantId,
} = require('../../src/cfo/cfoFortnoxTenantResolve');

test('fortnoxTenantCandidates inkluderar hair_tp-alias för hair-tp-clinic', () => {
  const rows = fortnoxTenantCandidates('hair-tp-clinic');
  assert.ok(rows.includes('hair-tp-clinic'));
  assert.ok(rows.includes('hair_tp'));
});

test('resolveConnectedFortnoxTenantId väljer första anslutna alias', async () => {
  const calls = [];
  const tenantId = await resolveConnectedFortnoxTenantId(
    {
      async getPublicStatus({ tenantId: candidate }) {
        calls.push(candidate);
        return { connected: candidate === 'hair_tp' };
      },
    },
    'hair-tp-clinic'
  );
  assert.equal(tenantId, 'hair_tp');
  assert.ok(calls.includes('hair-tp-clinic'));
  assert.ok(calls.includes('hair_tp'));
});

test('resolveConnectedFortnoxTenantId faller tillbaka till request-tenant', async () => {
  const tenantId = await resolveConnectedFortnoxTenantId(
    {
      async getPublicStatus() {
        return { connected: false };
      },
    },
    'hair-tp-clinic'
  );
  assert.equal(tenantId, 'hair-tp-clinic');
});
