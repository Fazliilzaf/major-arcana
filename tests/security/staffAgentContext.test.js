'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const express = require('express');

const { buildContextToken, verifyContextToken } = require('../../src/security/staffAgentContext');
const { createStaffAgentEntitlementStore } = require('../../src/security/staffAgentEntitlementStore');
const { createStaffAgentEntitlementsRouter } = require('../../src/routes/staffAgentEntitlements');

const TENANT = 'hair-tp-clinic';
const USER = 'staff-user-17';
const OWNER = { userId: 'owner-a', tenantId: TENANT, role: 'OWNER' };

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ctx-'));
  const store = await createStaffAgentEntitlementStore({ filePath: path.join(dir, 'e.json') });
  return store;
}

async function makeApp(store, auth) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createStaffAgentEntitlementsRouter({
    requireAuth: (req, _res, next) => { req.auth = auth; next(); },
    store,
  }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  return { server, url };
}

function post(url, path, body) {
  return fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('WP-003: 1. valid user + CCO entitlement -> context issued (verifierbart)', async () => {
  const store = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'CCO' });
  const body = await res.json();
  server.close();
  assert.equal(res.status, 200);
  const payload = verifyContextToken(body.context);
  assert.ok(payload);
  assert.equal(payload.agent_id, 'CCO');
  assert.equal(payload.user_id, USER);
  assert.equal(payload.tenant_id, TENANT);
});

test('WP-003: 2. no entitlement -> deny (403)', async () => {
  const store = await makeStore();
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'CCO' });
  server.close();
  assert.equal(res.status, 403);
});

test('WP-003: 3. revoked entitlement -> deny (403)', async () => {
  const store = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  await store.revoke({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'CCO' });
  server.close();
  assert.equal(res.status, 403);
});

test('WP-003: 4. disabled user -> deny (401)', async () => {
  const store = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL', membershipStatus: 'disabled' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'CCO' });
  server.close();
  assert.equal(res.status, 401);
});

test('WP-003: 5+6. forged userId/tenantId i body ignoreras (auth vinner)', async () => {
  const store = await makeStore();
  await store.grant({ userId: USER, tenantId: TENANT, agent: 'CCO', actor: OWNER });
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'CCO', user_id: 'forged-user', tenant_id: 'forged-tenant' });
  const body = await res.json();
  server.close();
  assert.equal(res.status, 200);
  const payload = verifyContextToken(body.context);
  assert.equal(payload.user_id, USER); // inte forged
  assert.equal(payload.tenant_id, TENANT); // inte forged
});

test('WP-003: 7. unknown agent -> deny (400)', async () => {
  const store = await makeStore();
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'XYZ' });
  server.close();
  assert.equal(res.status, 400);
});

test('WP-003: 8. CM -> deny (400)', async () => {
  const store = await makeStore();
  const { server, url } = await makeApp(store, { userId: USER, tenantId: TENANT, role: 'PERSONAL' });
  const res = await post(url, '/staff/agent-context', { agent_id: 'CM' });
  server.close();
  assert.equal(res.status, 400);
});

test('WP-003: 9. expired context -> verify nekar', () => {
  const secret = 'dev-only-staff-agent-context-secret-v1';
  const payload = {
    user_id: 'u', tenant_id: 't', agent_id: 'CCO', staff_role: 'PERSONAL', portal_id: 'CCO',
    issued_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() - 60000).toISOString(),
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const b64 = Buffer.from(canonical, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64).digest('hex');
  assert.equal(verifyContextToken(`${b64}.${sig}`), null);
});

test('WP-003: 10. tampered context -> verify nekar', () => {
  const token = buildContextToken({ userId: USER, tenantId: TENANT, staffRole: 'PERSONAL', agentId: 'CCO' });
  const [b64, sig] = token.split('.');
  // ändra payload (agent CCO -> CFO) men behåll signatur
  const tamperedPayload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  tamperedPayload.agent_id = 'CFO';
  const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload, Object.keys(tamperedPayload).sort()), 'utf8').toString('base64url');
  assert.equal(verifyContextToken(`${tamperedB64}.${sig}`), null);
});

test('WP-003: 13. CCO-token kan inte användas som CFO (agent_id är signerad)', () => {
  const token = buildContextToken({ userId: USER, tenantId: TENANT, staffRole: 'PERSONAL', agentId: 'CCO' });
  const payload = verifyContextToken(token);
  assert.equal(payload.agent_id, 'CCO');
  assert.notEqual(payload.agent_id, 'CFO');
});
