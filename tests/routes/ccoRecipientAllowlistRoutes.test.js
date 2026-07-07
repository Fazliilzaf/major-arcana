'use strict';

/* Mottagar-allowlist — HTTP-hantering (list/add/remove) på 2a-storen. Läsning =
 * mail.read; mutation = mail.live_send (owner). Svaren exponerar bara maskerade
 * adresser. SKICKAR INGENTING. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommDraftRouter } = require('../../src/routes/ccoCommDraft');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture({ recipientAllowlistStore = null } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-allowlist-'));
  const auditEvents = [];
  const app = express();
  app.use(
    '/api/v1',
    createCcoCommDraftRouter({
      config: { stateRoot: tempDir, buildVersion: 'test' },
      requireAuth: (req, _res, next) => {
        req.auth = {
          tenantId: req.headers['x-tenant'] || 'hairtpclinic',
          userId: req.headers['x-user'] || 'u1',
          role: req.headers['x-role'] || 'operator',
        };
        next();
      },
      recipientAllowlistStore,
      auditLog: { append: (e) => auditEvents.push(e) },
    })
  );
  return { app, tempDir, auditEvents };
}

function j(baseUrl, method, route, { role = 'operator', tenant, body } = {}) {
  const headers = { 'content-type': 'application/json', 'x-role': role };
  if (tenant) headers['x-tenant'] = tenant;
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

test('owner lägger till → 201, endast maskerad adress i svaret', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const res = await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'Anna@Mail.SE', note: 'patient' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.recipient.addressMasked, 'an***@mail.se');
    assert.equal(res.json.recipient.address, undefined); // rå adress läcker aldrig
    assert.equal(res.json.recipient.active, true);
  });
});

test('operator och konsult nekas mutation (403, mail.live_send owner-only)', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    for (const role of ['operator', 'konsult']) {
      const res = await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
        role,
        body: { address: 'anna@mail.se' },
      });
      assert.equal(res.status, 403);
    }
  });
});

test('ogiltig adress → 400', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const res = await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'inte-en-adress' },
    });
    assert.equal(res.status, 400);
  });
});

test('list (mail.read) visar aktiva, bara maskerade adresser', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'anna@mail.se' },
    });
    // operator har mail.read → får lista
    const res = await j(baseUrl, 'GET', '/cco-comm/recipient-allowlist', { role: 'operator' });
    assert.equal(res.status, 200);
    assert.equal(res.json.recipients.length, 1);
    assert.equal(res.json.recipients[0].addressMasked, 'an***@mail.se');
    assert.equal(res.json.recipients[0].address, undefined);
  });
});

test('DELETE (owner) tar bort → borta ur default-listan', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'anna@mail.se' },
    });
    const del = await j(
      baseUrl,
      'DELETE',
      `/cco-comm/recipient-allowlist/${encodeURIComponent('anna@mail.se')}`,
      { role: 'owner' }
    );
    assert.equal(del.status, 200);
    assert.equal(del.json.removed, true);
    const list = await j(baseUrl, 'GET', '/cco-comm/recipient-allowlist', { role: 'owner' });
    assert.equal(list.json.recipients.length, 0);
    const listAll = await j(
      baseUrl,
      'GET',
      '/cco-comm/recipient-allowlist?includeInactive=1',
      { role: 'owner' }
    );
    assert.equal(listAll.json.recipients.length, 1);
    assert.equal(listAll.json.recipients[0].active, false);
  });
});

test('DELETE hanterar procenttecken i adress utan dubbel-decode', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'foo%bar@mail.se' },
    });
    const del = await j(
      baseUrl,
      'DELETE',
      `/cco-comm/recipient-allowlist/${encodeURIComponent('foo%bar@mail.se')}`,
      { role: 'owner' }
    );
    assert.equal(del.status, 200);
    assert.equal(del.json.removed, true);
    assert.equal(del.json.recipient.addressMasked, 'fo***@mail.se');
  });
});

test('DELETE av icke-owner nekas (403)', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'anna@mail.se' },
    });
    const del = await j(
      baseUrl,
      'DELETE',
      `/cco-comm/recipient-allowlist/${encodeURIComponent('anna@mail.se')}`,
      { role: 'operator' }
    );
    assert.equal(del.status, 403);
  });
});

test('interna allowlist-fel returnerar 500, inte klient-400', async () => {
  const failingStore = {
    listRecipients: () => {
      throw new Error('store offline');
    },
    addRecipient: async () => {
      throw new Error('disk offline');
    },
    removeRecipient: async () => {
      throw new Error('disk offline');
    },
  };
  const { app } = await createFixture({ recipientAllowlistStore: failingStore });
  await withServer(app, async (baseUrl) => {
    const list = await j(baseUrl, 'GET', '/cco-comm/recipient-allowlist', { role: 'owner' });
    assert.equal(list.status, 500);

    const add = await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      body: { address: 'anna@mail.se' },
    });
    assert.equal(add.status, 500);

    const del = await j(
      baseUrl,
      'DELETE',
      `/cco-comm/recipient-allowlist/${encodeURIComponent('anna@mail.se')}`,
      { role: 'owner' }
    );
    assert.equal(del.status, 500);
  });
});

test('per-tenant-isolering: en tenants allowlist syns inte för en annan', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    await j(baseUrl, 'POST', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      tenant: 'tenant-a',
      body: { address: 'anna@mail.se' },
    });
    const other = await j(baseUrl, 'GET', '/cco-comm/recipient-allowlist', {
      role: 'owner',
      tenant: 'tenant-b',
    });
    assert.equal(other.json.recipients.length, 0);
  });
});
