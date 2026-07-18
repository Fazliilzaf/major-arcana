'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');

const TENANT_ID = 'hair-tp-clinic';
const GRAPH_MAILBOX_ID = 'contact@hairtpclinic.com';
const IMAP_MAILBOX_ID = 'info@fazli.se';

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

function createFixture() {
  const calls = [];
  const tokens = {
    owner: { tenantId: TENANT_ID, role: 'owner' },
    operator: { tenantId: TENANT_ID, role: 'operator' },
    konsult: { tenantId: TENANT_ID, role: 'konsult' },
    otherTenant: { tenantId: 'other-clinic', role: 'owner' },
  };
  const app = express();
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: { listMessages: () => [] },
      graphReadConnector: {},
      mailboxIdsForSync: [GRAPH_MAILBOX_ID, IMAP_MAILBOX_ID],
      graphMailboxIdsForSync: [GRAPH_MAILBOX_ID],
      tenantScopeId: TENANT_ID,
      requireAuth(req, res, next) {
        const match = /^Bearer (.+)$/.exec(String(req.get('authorization') || ''));
        const auth = match ? tokens[match[1]] : null;
        if (!auth) return res.status(401).json({ error: 'unauthorized' });
        req.auth = auth;
        return next();
      },
      manualGraphBackfillRunner: async (input) => {
        calls.push(input);
        return { folderCount: 0 };
      },
    })
  );
  return { app, calls };
}

function postSync(baseUrl, token, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/cco/runtime/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('manual Graph-sync fails closed for missing auth, tenant, role, off-scope and IMAP mailbox ids', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const missingAuth = await postSync(baseUrl, null, {});
    assert.equal(missingAuth.status, 401);

    const wrongTenant = await postSync(baseUrl, 'otherTenant', {});
    assert.equal(wrongTenant.status, 403);
    assert.equal((await wrongTenant.json()).error, 'tenant_scope_forbidden');

    const wrongRole = await postSync(baseUrl, 'konsult', {});
    assert.equal(wrongRole.status, 403);
    assert.equal((await wrongRole.json()).requiredPermission, 'mailbox.admin');

    const offScope = await postSync(baseUrl, 'owner', {
      mailboxIds: ['other@hairtpclinic.com'],
    });
    assert.equal(offScope.status, 403);
    assert.equal((await offScope.json()).error, 'mailbox_scope_forbidden');

    const imap = await postSync(baseUrl, 'owner', { mailboxIds: [IMAP_MAILBOX_ID] });
    assert.equal(imap.status, 403);
    assert.equal((await imap.json()).error, 'mailbox_scope_forbidden');
  });
  assert.equal(fixture.calls.length, 0, 'nekade requests far aldrig starta Graph-sync');
});

test('manual Graph-sync permits scoped owner and operator requests with Graph-only defaults', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const owner = await postSync(baseUrl, 'owner', { mailboxIds: [GRAPH_MAILBOX_ID] });
    assert.equal(owner.status, 200);
    assert.deepEqual((await owner.json()).mailboxIds, [GRAPH_MAILBOX_ID]);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fixture.calls[0].mailboxIds, [GRAPH_MAILBOX_ID]);

    const operator = await postSync(baseUrl, 'operator', {});
    assert.equal(operator.status, 200);
    assert.deepEqual((await operator.json()).mailboxIds, [GRAPH_MAILBOX_ID]);
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(fixture.calls[1].mailboxIds, [GRAPH_MAILBOX_ID]);
});
