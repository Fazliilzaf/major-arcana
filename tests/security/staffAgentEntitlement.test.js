'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffAgentEntitlementStore } = require('../../src/security/staffAgentEntitlementStore');
const { requireAgentEntitlement } = require('../../src/security/requireAgentEntitlement');
const { createStaffAgentEntitlementsRouter } = require('../../src/routes/staffAgentEntitlements');

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-entitlement-'));
  const events = [];
  const auditLog = { append: (e) => events.push(e) };
  const store = await createStaffAgentEntitlementStore({
    filePath: path.join(dir, 'entitlements.json'),
    auditLog,
  });
  return { store, events, dir };
}

const TENANT = 'hair-tp-clinic';
const USER = 'staff-user-17';
const OWNER = { userId: 'owner-a', tenantId: TENANT, role: 'OWNER' };

// ---- middleware helpers ----
function call(store, agent, req) {
  const mw = requireAgentEntitlement({ store, agent });
  let status = null;
  let body = null;
  mw(req, { status: (s) => { status = s; return { json: (b) => { body = b; } }; } }, () => { status = 200; });
  return { status, body };
}

function ctx(userId = USER, tenantId = TENANT) {
  return { auth: { userId, tenantId, role: 'PERSONAL' } };
}

test('WP-001: 1. user utan entitlement -> DENY', async () => {
  const { store } = await makeStore();
  assert.equal(store.hasActive(USER, TENANT, 'CCO'), false);
  const r = call(store, 'CCO', ctx());
  assert.equal(r.status, 403);
});

test('WP-001: 2. user med CCO -> CCO ALLOW', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  assert.equal(store.hasActive(USER, TENANT, 'CCO'), true);
  const r = call(store, 'CCO', ctx());
  assert.equal(r.status, 200);
});

test('WP-001: 3. samma user -> CFO DENY', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  assert.equal(store.hasActive(USER, TENANT, 'CFO'), false);
  const r = call(store, 'CFO', ctx());
  assert.equal(r.status, 403);
});

test('WP-001: 4. user med CCO + CAO -> båda ALLOW', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CAO', actor: OWNER });
  assert.equal(store.hasActive(USER, TENANT, 'CCO'), true);
  assert.equal(store.hasActive(USER, TENANT, 'CAO'), true);
  assert.deepEqual(store.listActive(USER, TENANT), ['CAO', 'CCO']);
});

test('WP-001: 5. revoked entitlement -> DENY', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  await store.revoke({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  assert.equal(store.hasActive(USER, TENANT, 'CCO'), false);
  assert.equal(call(store, 'CCO', ctx()).status, 403);
});

test('WP-001: 6. ingen verifierad auth (disabled/ej inloggad) -> 401 fail-closed', async () => {
  const { store } = await makeStore();
  const r = call(store, 'CCO', { auth: null });
  assert.equal(r.status, 401);
});

test('WP-001: 7. annan tenant -> DENY', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  assert.equal(store.hasActive(USER, 'other-tenant', 'CCO'), false);
});

test('WP-001: 8. obehörig (icke-OWNER) kan inte grant:a', async () => {
  const { store } = await makeStore();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffAgentEntitlementsRouter({
    requireAuth: (req, _res, next) => { req.auth = { userId: 'personal-a', tenantId: TENANT, role: 'PERSONAL' }; next(); },
    store,
  }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const res = await fetch(`${url}/staff/agent-entitlements/grant`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: USER, agent: 'CCO' }),
  });
  server.close();
  assert.equal(res.status, 403);
});

test('WP-001: 9. OWNER kan grant/revoke', async () => {
  const { store } = await makeStore();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffAgentEntitlementsRouter({
    requireAuth: (req, _res, next) => { req.auth = OWNER; next(); },
    store,
  }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const g = await fetch(`${url}/staff/agent-entitlements/grant`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: USER, agent: 'CFO' }),
  });
  assert.equal(g.status, 200);
  const rv = await fetch(`${url}/staff/agent-entitlements/revoke`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: USER, agent: 'CFO' }),
  });
  server.close();
  assert.equal(rv.status, 200);
  assert.equal(store.hasActive(USER, TENANT, 'CFO'), false);
});

test('WP-001: 10. duplicate grant deterministiskt (ingen dubblett)', async () => {
  const { store } = await makeStore();
  const a = await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  const b = await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  assert.equal(a.id, b.id);
  assert.equal(store.listActive(USER, TENANT).length, 1);
});

test('WP-001: 11. okänt agent-ID -> fail-closed', async () => {
  const { store } = await makeStore();
  await assert.rejects(() => store.grant({ userId: USER, tenantId: TENANT, agent: 'XYZ', actor: OWNER }));
  assert.equal(store.hasActive(USER, TENANT, 'XYZ'), false);
});

test('WP-001: 12. /me additiv (identity + role + agents) utan att röra /staff/me', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CAO', actor: OWNER });
  const app = express();
  app.use('/api/v1', createStaffAgentEntitlementsRouter({
    requireAuth: (req, _res, next) => { req.auth = { userId: USER, tenantId: TENANT, role: 'PERSONAL' }; next(); },
    store,
  }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const res = await fetch(`${url}/staff/agent-entitlements/me`);
  const body = await res.json();
  server.close();
  assert.equal(res.status, 200);
  assert.equal(body.identity.userId, USER);
  assert.equal(body.identity.role, 'PERSONAL');
  assert.deepEqual(body.agents, ['CAO']);
});

test('WP-001: 13. audit event vid grant/revoke', async () => {
  const { store, events } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  await store.revoke({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  const actions = events.map((e) => e.action);
  assert.ok(actions.includes('staff.agent_entitlement.grant'));
  assert.ok(actions.includes('staff.agent_entitlement.revoke'));
  assert.ok(events.every((e) => !e.targetUser?.includes('token') && !e.targetUser?.includes('secret')));
});

test('WP-002/A3: disabled membership -> DENY trots aktiv entitlement', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  assert.equal(store.hasActive(USER, TENANT, 'CCO'), true); // entitlement finns
  const req = { auth: { userId: USER, tenantId: TENANT, role: 'PERSONAL', membershipStatus: 'disabled' } };
  const r = call(store, 'CCO', req);
  assert.equal(r.status, 401); // fail-closed
});

test('WP-002/A2: tenant-isolation för OWNER-listning', async () => {
  const { store } = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  await store.grant({ userId: 'other-user', tenantId: 'other-tenant', agent: 'CFO', actor: OWNER });
  assert.equal(store.listForTenant(TENANT).length, 1);
  assert.equal(store.listForTenant('other-tenant').length, 1);
  assert.equal(store.listForTenant(TENANT)[0].agent, 'CCO');
  // router: OWNER i TENANT ser bara TENANT:s entitlements
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffAgentEntitlementsRouter({
    requireAuth: (req, _res, next) => { req.auth = OWNER; next(); },
    store,
  }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const res = await fetch(`${url}/staff/agent-entitlements`);
  const body = await res.json();
  server.close();
  assert.equal(res.status, 200);
  assert.equal(body.entitlements.length, 1);
  assert.equal(body.entitlements[0].agent, 'CCO');
});
