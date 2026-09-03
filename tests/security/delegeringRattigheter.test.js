'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoDelegationStore } = require('../../src/ops/ccoDelegationStore');
const { PERMISSIONS } = require('../../src/security/ccoRbac');

/**
 * Vem får läsa vad, och framför allt: vem får UTFÄRDA.
 *
 * En delegering är ett läkarbeslut. Kunde personal utfärda skulle en sköterska
 * kunna ge sig själv rätt att utföra ett moment hon inte är delegerad för —
 * vilket är exakt det problem hela ORD-170 finns för att lösa.
 */

const TENANT = 'hair-tp-clinic';

async function medServer(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'delegering-rbac-'));
  const delegationStore = await createCcoDelegationStore({
    filePath: path.join(dir, 'cco-delegations.json'),
  });

  const app = express();
  // Roll OCH identitet sätts explicit — headern x-cco-role gäller bara när
  // NODE_ENV !== 'production', och testet ska ge samma svar oavsett miljö.
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    const userId = req.headers['x-test-user'];
    if (role) req.cco = { role: String(role) };
    if (userId) req.auth = { userId: String(userId), tenantId: TENANT };
    next();
  });
  app.use(createStaffPortalRouter({ delegationStore }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ baseUrl, delegationStore });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function huvuden(role, userId) {
  const h = { 'x-test-role': role };
  if (userId) h['x-test-user'] = userId;
  return h;
}

async function post(baseUrl, sokvag, role, userId, body) {
  const res = await fetch(`${baseUrl}${sokvag}`, {
    method: 'POST',
    headers: { ...huvuden(role, userId), 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(baseUrl, sokvag, role, userId) {
  const res = await fetch(`${baseUrl}${sokvag}`, { headers: huvuden(role, userId) });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

test('personal kan INTE utfärda en delegering', async () => {
  await medServer(async ({ baseUrl }) => {
    const { status } = await post(baseUrl, '/api/v1/staff/delegations', 'personal', 'u-anna', {
      holderUserId: 'u-anna',
      task: 'Lokal infiltrationsanestesi',
      validUntil: '2030-01-01T00:00:00Z',
    });
    assert.equal(status, 403, 'en sköterska får inte ge sig själv en delegering');
  });
});

test('läkare och ägare kan utfärda', async () => {
  await medServer(async ({ baseUrl }) => {
    for (const role of ['konsult', 'owner']) {
      const { status } = await post(baseUrl, '/api/v1/staff/delegations', role, `u-${role}`, {
        holderUserId: 'u-anna',
        task: 'PRP-förberedelse',
        validUntil: '2030-01-01T00:00:00Z',
      });
      assert.equal(status, 201, `${role} borde kunna utfärda`);
    }
  });
});

test('en delegering utan slutdatum avvisas av rutten, inte bara av storen', async () => {
  await medServer(async ({ baseUrl }) => {
    const { status, body } = await post(
      baseUrl,
      '/api/v1/staff/delegations',
      'konsult',
      'u-lakare',
      { holderUserId: 'u-anna', task: 'Något' }
    );
    assert.equal(status, 400);
    assert.match(body.error, /validUntil/);
  });
});

test('sköterskan ser bara sina egna delegeringar', async () => {
  await medServer(async ({ baseUrl }) => {
    await post(baseUrl, '/api/v1/staff/delegations', 'konsult', 'u-lakare', {
      holderUserId: 'u-anna',
      task: 'Anestesi',
      validUntil: '2030-01-01T00:00:00Z',
    });
    await post(baseUrl, '/api/v1/staff/delegations', 'konsult', 'u-lakare', {
      holderUserId: 'u-clara',
      task: 'PRP',
      validUntil: '2030-01-01T00:00:00Z',
    });

    const anna = await get(baseUrl, '/api/v1/staff/delegations/mine', 'personal', 'u-anna');
    assert.equal(anna.status, 200);
    assert.equal(anna.body.count, 1);
    assert.equal(anna.body.delegations[0].holderUserId, 'u-anna');
  });
});

test('personal kommer inte åt klinikens hela delegeringsöversikt', async () => {
  await medServer(async ({ baseUrl }) => {
    const { status } = await get(
      baseUrl,
      '/api/v1/staff/delegations/overview',
      'personal',
      'u-anna'
    );
    assert.equal(status, 403);
  });
});

test('utan känd användare blir "mina delegeringar" tom — inte hela klinikens', async () => {
  await medServer(async ({ baseUrl }) => {
    await post(baseUrl, '/api/v1/staff/delegations', 'konsult', 'u-lakare', {
      holderUserId: 'u-anna',
      task: 'Anestesi',
      validUntil: '2030-01-01T00:00:00Z',
    });
    // Roll men ingen identitet: får inte falla tillbaka på allt.
    const res = await fetch(`${baseUrl}/api/v1/staff/delegations/mine`, {
      headers: { 'x-test-role': 'personal' },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.count, 0);
  });
});

test('rättighetslistorna är åtskilda och personal saknar utfärdanderätt', () => {
  assert.deepEqual(PERMISSIONS['delegation.issue'], ['owner', 'konsult']);
  assert.deepEqual(PERMISSIONS['delegation.overview'], ['owner', 'operator']);
  // Läsa sin egen delegering är något helt annat än att kunna skapa en.
  assert.ok(PERMISSIONS['delegation.read'].includes('personal'));
  assert.ok(!PERMISSIONS['delegation.issue'].includes('personal'));
});
