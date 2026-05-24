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

test('staff first login returns mustChangePassword and clears after password change', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-staff-first-login-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  await authStore.bootstrapOwner({
    tenantId: 'hair-tp-clinic',
    email: 'owner@example.com',
    password: 'owner-secret-12',
    forcePasswordReset: true,
    forceMfaReset: true,
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createAuthRouter({
      authStore,
      requireAuth: (req, res, next) => {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!token) return res.status(401).json({ error: 'Unauthorized.' });
        authStore
          .getSessionContextByToken(token)
          .then((context) => {
            if (!context) return res.status(401).json({ error: 'Unauthorized.' });
            req.auth = {
              token,
              sessionId: context.session.id,
              userId: context.user.id,
              membershipId: context.membership.id,
              tenantId: context.membership.tenantId,
              role: context.membership.role,
            };
            req.currentUser = context.user;
            req.currentMembership = context.membership;
            return next();
          })
          .catch(next);
      },
      requireRole:
        (...roles) =>
        (req, res, next) => {
          if (!roles.includes(req.auth?.role)) {
            return res.status(403).json({ error: 'Forbidden.' });
          }
          return next();
        },
      requireTenantScope: () => (_req, _res, next) => next(),
      ownerMfaRequired: false,
      ownerMfaBypassHosts: [],
      loginSessionRotationScope: 'tenant',
    })
  );

  await withServer(app, async (baseUrl) => {
    const ownerLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'owner-secret-12',
        tenantId: 'hair-tp-clinic',
      }),
    });
    const ownerBody = await ownerLogin.json();
    assert.equal(ownerLogin.status, 200);

    const createStaff = await fetch(`${baseUrl}/users/staff`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerBody.token}`,
      },
      body: JSON.stringify({
        email: 'nurse@example.com',
        password: 'temp-pass-1234',
        tenantId: 'hair-tp-clinic',
        mustChangePassword: true,
      }),
    });
    assert.equal(createStaff.status, 201);
    const staffCreated = await createStaff.json();
    assert.equal(staffCreated.user.mustChangePassword, true);

    const staffLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-arcana-client': 'major_arcana_admin',
      },
      body: JSON.stringify({
        email: 'nurse@example.com',
        password: 'temp-pass-1234',
        tenantId: 'hair-tp-clinic',
      }),
    });
    assert.equal(staffLogin.status, 200);
    const staffBody = await staffLogin.json();
    assert.equal(staffBody.user.mustChangePassword, true);
    assert.ok(staffBody.token);

    const changePassword = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${staffBody.token}`,
      },
      body: JSON.stringify({
        currentPassword: 'temp-pass-1234',
        newPassword: 'my-chosen-pass-99',
        revokeCurrentSession: true,
      }),
    });
    assert.equal(changePassword.status, 200);

    const staffRelogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-arcana-client': 'major_arcana_admin',
      },
      body: JSON.stringify({
        email: 'nurse@example.com',
        password: 'my-chosen-pass-99',
        tenantId: 'hair-tp-clinic',
      }),
    });
    assert.equal(staffRelogin.status, 200);
    const reloginBody = await staffRelogin.json();
    assert.equal(reloginBody.user.mustChangePassword, false);
    assert.equal(reloginBody.membership.role, 'STAFF');
  });
});
