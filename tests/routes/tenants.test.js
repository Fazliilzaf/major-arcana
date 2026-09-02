'use strict';

/* POST /tenants/:tenantId/members — ge en BEFINTLIG användare medlemskap i en
 * ytterligare tenant, UTAN att röra lösenordet.
 *
 * Bakgrund (ORD-167-följden): POST /users/staff kör `setUserPassword` även på
 * redan befintliga konton, och `tenants/onboard` kräver lösenord för en annan
 * e-post. Den här endpointen täpper luckan "ge befintlig användare medlemskap i
 * en till tenant" — OWNER-only, lösenordslös, revisionsloggad.
 *
 * Två fällor testas explicit:
 *   (a) lösenordet rörs ALDRIG — användaren kan fortfarande logga in med sitt
 *       gamla lösenord efteråt;
 *   (b) befintligt medlemskap i den gamla tenanten ändras inte. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const express = require('express');

const { createAuthStore } = require('../../src/security/authStore');
const { createTenantsRouter } = require('../../src/routes/tenants');

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

function makeApp(authStore) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createTenantsRouter({
      tenantConfigStore: {
        async getTenantConfig() {
          return { tenantId: 'curatiio', brandProfile: 'curatiio' };
        },
        async updateTenantConfig() {},
      },
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
              resourceId: context.membership.resourceId || null,
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
    })
  );
  return app;
}

async function makeStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-tenants-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  return { authStore, tempDir };
}

async function ownerToken(authStore) {
  const owner = await authStore.bootstrapOwner({
    tenantId: 'hair-tp-clinic',
    email: 'owner@example.com',
    password: 'owner-secret-12',
  });
  const session = await authStore.createSession({
    userId: owner.user.id,
    membershipId: owner.membership.id,
  });
  return session.token;
}

test('ger befintlig användare medlemskap i ny tenant utan att röra lösenordet', async () => {
  const { authStore } = await makeStore();
  const token = await ownerToken(authStore);

  // Befintlig staff-användare med ett medlemskap i hair-tp-clinic.
  const staff = await authStore.createUser({
    email: 'nurse@example.com',
    password: 'nurse-pass-12',
  });
  const beforeMembership = await authStore.ensureMembership({
    userId: staff.id,
    tenantId: 'hair-tp-clinic',
    role: 'STAFF',
  });

  const app = makeApp(authStore);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/tenants/curatiio/members`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: 'nurse@example.com' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.membership.tenantId, 'curatiio');
    assert.equal(body.membership.role, 'STAFF');
    assert.equal(body.membership.status, 'active');
  });

  // (a) lösenordet rördes INTE — gamla lösenordet fungerar fortfarande.
  const stillAuthenticates = await authStore.authenticateUser({
    email: 'nurse@example.com',
    password: 'nurse-pass-12',
  });
  assert.ok(stillAuthenticates, 'lösenordet får inte ha bytts ut');

  // (b) det nya medlemskapet finns, och det gamla är oförändrat.
  const memberships = await authStore.listMembershipsForUser(staff.id);
  const curatiioMembership = memberships.find((m) => m.tenantId === 'curatiio');
  const oldMembership = memberships.find((m) => m.tenantId === 'hair-tp-clinic');
  assert.ok(curatiioMembership, 'nytt medlemskap i curatiio saknas');
  assert.equal(curatiioMembership.role, 'STAFF');
  assert.ok(oldMembership, 'befintligt medlemskap i hair-tp-clinic saknas');
  assert.equal(oldMembership.id, beforeMembership.id, 'gammalt medlemskap får inte ändras');
  assert.equal(oldMembership.role, beforeMembership.role);
  assert.equal(oldMembership.status, 'active');

  // Revisionshändelse ska finnas.
  const latest = await authStore.getLatestAuditEvent();
  assert.equal(latest.action, 'tenants.member_grant');
  assert.equal(latest.targetType, 'user');
  assert.equal(latest.targetId, staff.id);
});

test('avvisar okänd e-post, ogiltig roll och saknad e-post', async () => {
  const { authStore } = await makeStore();
  const token = await ownerToken(authStore);

  const app = makeApp(authStore);
  await withServer(app, async (baseUrl) => {
    const unknown = await fetch(`${baseUrl}/tenants/curatiio/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'ghost@example.com' }),
    });
    assert.equal(unknown.status, 404);

    const missingEmail = await fetch(`${baseUrl}/tenants/curatiio/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(missingEmail.status, 400);

    await authStore.createUser({ email: 'nurse@example.com', password: 'nurse-pass-12' });
    const patientRole = await fetch(`${baseUrl}/tenants/curatiio/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'nurse@example.com', role: 'PATIENT' }),
    });
    assert.equal(patientRole.status, 400);
  });
});

test('icke-OWNER nekas', async () => {
  const { authStore } = await makeStore();
  const owner = await authStore.bootstrapOwner({
    tenantId: 'hair-tp-clinic',
    email: 'owner@example.com',
    password: 'owner-secret-12',
  });
  const staff = await authStore.createUser({
    email: 'nurse@example.com',
    password: 'nurse-pass-12',
  });
  const staffMembership = await authStore.ensureMembership({
    userId: staff.id,
    tenantId: 'hair-tp-clinic',
    role: 'STAFF',
  });
  const staffSession = await authStore.createSession({
    userId: staff.id,
    membershipId: staffMembership.id,
  });
  void owner;

  const app = makeApp(authStore);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/tenants/curatiio/members`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${staffSession.token}`,
      },
      body: JSON.stringify({ email: 'nurse@example.com' }),
    });
    assert.equal(res.status, 403);
  });
});
