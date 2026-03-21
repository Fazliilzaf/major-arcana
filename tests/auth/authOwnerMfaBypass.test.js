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

test('owner login bypasses MFA on configured prelaunch hosts only', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-mfa-bypass-'));
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
      ownerMfaBypassHosts: ['arcana-staging.onrender.com', 'localhost', '127.0.0.1'],
      loginSessionRotationScope: 'none',
    })
  );

  await withServer(app, async (baseUrl) => {
    const localResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'localhost:3000',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'secret12345',
        tenantId: 'tenant-a',
      }),
    });

    assert.equal(localResponse.status, 200);
    const localPayload = await localResponse.json();
    assert.equal(typeof localPayload.token, 'string');
    assert.equal(localPayload.requiresMfa, undefined);

    const stagingResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'arcana-staging.onrender.com',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'secret12345',
        tenantId: 'tenant-a',
      }),
    });

    assert.equal(stagingResponse.status, 200);
    const stagingPayload = await stagingResponse.json();
    assert.equal(typeof stagingPayload.token, 'string');
    assert.equal(stagingPayload.requiresMfa, undefined);

    const prodResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'arcana.hairtpclinic.se',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'secret12345',
        tenantId: 'tenant-a',
      }),
    });

    assert.equal(prodResponse.status, 200);
    const prodPayload = await prodResponse.json();
    assert.equal(prodPayload.requiresMfa, true);
    assert.equal(typeof prodPayload.mfaTicket, 'string');
    assert.equal(prodPayload.mfaTicket.length > 0, true);
  });
});

test('login accepts hairtpclinic.com/.se alias for same mailbox identity', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-email-alias-'));
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
    email: 'fazli@hairtpclinic.se',
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
      ownerMfaBypassHosts: ['arcana.hairtpclinic.se'],
      loginSessionRotationScope: 'none',
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'arcana.hairtpclinic.se',
      },
      body: JSON.stringify({
        email: 'fazli@hairtpclinic.com',
        password: 'secret12345',
        tenantId: 'tenant-a',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(typeof payload.token, 'string');
    assert.equal(payload.token.length > 0, true);
    assert.equal(payload.requiresMfa, undefined);
  });
});

test('owner login can complete from bootstrap self-heal when env credentials match', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-owner-self-heal-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
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
      ownerMfaBypassHosts: ['arcana.hairtpclinic.se'],
      loginSessionRotationScope: 'none',
      bootstrapOwnerEmail: 'fazli@hairtpclinic.com',
      bootstrapOwnerPassword: 'ArcanaPilot!2026',
      bootstrapOwnerTenantId: 'hair-tp-clinic',
      ownerCredentialSelfHeal: true,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'arcana.hairtpclinic.se',
      },
      body: JSON.stringify({
        email: 'fazli@hairtpclinic.com',
        password: 'ArcanaPilot!2026',
        tenantId: '',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(
      typeof payload.token === 'string' || payload.requiresMfa === true,
      true
    );
  });
});

test('owner login can complete from emergency bootstrap reset when reset flag is enabled', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-owner-emergency-reset-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
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
      ownerMfaBypassHosts: ['arcana.hairtpclinic.se'],
      loginSessionRotationScope: 'none',
      bootstrapOwnerEmail: 'fazli@hairtpclinic.com',
      bootstrapOwnerPassword: 'ArcanaPilot!2026',
      bootstrapOwnerTenantId: 'hair-tp-clinic',
      bootstrapOwnerResetPassword: true,
      ownerCredentialSelfHeal: true,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'arcana.hairtpclinic.se',
      },
      body: JSON.stringify({
        email: 'fazli@hairtpclinic.com',
        password: 'fel-losenord-ska-sjalvlakas',
        tenantId: '',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(
      typeof payload.token === 'string' || payload.requiresMfa === true,
      true
    );
  });
});
