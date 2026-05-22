const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const express = require('express');

const { createAuthStore } = require('../../src/security/authStore');
const { createAuthRouter } = require('../../src/routes/auth');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('tenant-scoped login rotation revokes previous session for same tenant', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-session-rotate-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  await authStore.bootstrapOwner({
    tenantId: 'tenant-a',
    email: 'owner@example.com',
    password: 'secret12345',
    forcePasswordReset: true,
    forceMfaReset: true,
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createAuthRouter({
      authStore,
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      requireTenantScope: () => (_req, _res, next) => next(),
      ownerMfaRequired: false,
      ownerMfaBypassHosts: [],
      loginSessionRotationScope: 'tenant',
    })
  );

  await withServer(app, async (baseUrl) => {
    const r1 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: '127.0.0.1' },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'secret12345',
        tenantId: 'tenant-a',
      }),
    });
    assert.equal(r1.status, 200);
    const t1 = (await r1.json()).token;

    const r2 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: '127.0.0.1' },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'secret12345',
        tenantId: 'tenant-a',
      }),
    });
    assert.equal(r2.status, 200);
    const t2 = (await r2.json()).token;

    assert.notEqual(t1, t2);
    assert.equal(await authStore.getSessionContextByToken(t1), null);
    const ctx2 = await authStore.getSessionContextByToken(t2);
    assert.ok(ctx2?.session?.id);
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('bootstrapOwner forcePasswordReset revokes existing sessions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-bootstrap-pwd-revoke-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  const user = await authStore.createUser({
    email: 'u@example.com',
    password: 'initialpass99',
    mfaRequired: false,
  });
  const membership = await authStore.ensureMembership({
    userId: user.id,
    tenantId: 'tenant-x',
    role: 'OWNER',
  });
  const { token: tokA } = await authStore.createSession({
    userId: user.id,
    membershipId: membership.id,
  });
  const { token: tokB } = await authStore.createSession({
    userId: user.id,
    membershipId: membership.id,
  });

  const out = await authStore.bootstrapOwner({
    tenantId: 'tenant-x',
    email: 'u@example.com',
    password: 'resetpass999',
    forcePasswordReset: true,
    forceMfaReset: false,
  });

  assert.ok(out.bootstrapped);
  assert.equal(out.revokedSessions, 2);
  assert.equal(await authStore.getSessionContextByToken(tokA), null);
  assert.equal(await authStore.getSessionContextByToken(tokB), null);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('upsertOwnerMember password update revokes all sessions for that user', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-upsert-revoke-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  await authStore.upsertOwnerMember({
    tenantId: 'tenant-z',
    email: 'o@example.com',
    password: 'firstpass999',
    actorUserId: null,
  });
  const authed = await authStore.authenticateUser({ email: 'o@example.com', password: 'firstpass999' });
  assert.ok(authed?.id);
  const memberships = await authStore.listMembershipsForUser(authed.id, { includeDisabled: false });
  const m = memberships[0];
  const { token: tok1 } = await authStore.createSession({ userId: authed.id, membershipId: m.id });

  await authStore.upsertOwnerMember({
    tenantId: 'tenant-z',
    email: 'o@example.com',
    password: 'secondpass888',
    actorUserId: 'admin-1',
  });

  assert.equal(await authStore.getSessionContextByToken(tok1), null);
  const u2 = await authStore.authenticateUser({ email: 'o@example.com', password: 'secondpass888' });
  assert.ok(u2?.id);

  await fs.rm(tempDir, { recursive: true, force: true });
});
