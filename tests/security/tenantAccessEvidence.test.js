'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAuthStore } = require('../../src/security/authStore');

async function makeStore(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-ev-'));
  const filePath = path.join(dir, 'auth.json');
  return { store: await createAuthStore({ filePath, ...opts }), filePath };
}

test('tenants.access_check-event persisterar evidens som överlever rotation', async () => {
  const { store, filePath } = await makeStore({ auditMaxEntries: 5 });
  await store.addAuditEvent({
    tenantId: 'hair-tp-clinic',
    action: 'tenants.access_check',
    outcome: 'success',
  });
  // Churn: fler events än auditMaxEntries → access_check-eventet roteras bort.
  for (let i = 0; i < 10; i += 1) {
    await store.addAuditEvent({ tenantId: 'hair-tp-clinic', action: 'noise.event' });
  }
  const viaList = await store.getLatestAuditEvent({
    tenantId: 'hair-tp-clinic',
    action: 'tenants.access_check',
    outcome: 'success',
  });
  assert.equal(viaList, null, 'eventet ska vara bortroterat ur listan');
  const ts = store.getTenantAccessEvidence({ tenantId: 'hair-tp-clinic' });
  assert.ok(ts, 'evidensen ska överleva rotationen');
  // Persisterad på disk: ny store-instans läser samma evidens.
  const store2 = await createAuthStore({ filePath, auditMaxEntries: 5 });
  assert.equal(store2.getTenantAccessEvidence({ tenantId: 'hair-tp-clinic' }), ts);
});

test('evidens skrivs inte för andra actions eller failure-outcome', async () => {
  const { store } = await makeStore();
  await store.addAuditEvent({ tenantId: 't1', action: 'auth.login', outcome: 'success' });
  await store.addAuditEvent({ tenantId: 't1', action: 'tenants.access_check', outcome: 'failure' });
  assert.equal(store.getTenantAccessEvidence({ tenantId: 't1' }), null);
});

test('evidens är per tenant', async () => {
  const { store } = await makeStore();
  await store.addAuditEvent({ tenantId: 'a', action: 'tenants.access_check', outcome: 'success' });
  assert.ok(store.getTenantAccessEvidence({ tenantId: 'a' }));
  assert.equal(store.getTenantAccessEvidence({ tenantId: 'b' }), null);
});
