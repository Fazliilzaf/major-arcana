'use strict';

/**
 * CCO Konversationer Fas 1.2 — trådidentitetsroute.
 *
 * Verifierar att GET /cco/runtime/conversation/:key/identity:
 *  - kräver mail.read
 *  - returnerar identity från mailIngestionStore.getThreadIdentity(key)
 *  - hanterar saknad identity och saknad store
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');
const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

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

async function createFixture({ identities = {}, noStore = false } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-identity-'));
  const conversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'conv-state.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: { listMessages: () => [] },
      requireAuth: false,
      mailIngestionStore: noStore
        ? null
        : {
            getThreadIdentity(key) {
              return identities[key] || null;
            },
          },
      ccoConversationStateStore: conversationStateStore,
      mailboxIdsForSync: [],
      defaultTenantId: 'cco',
      tenantScopeId: '',
      authStore: { async addAuditEvent() { return true; } },
    })
  );
  return { app, tempDir };
}

function identityReq(baseUrl, key, role = 'operator') {
  const headers = {};
  if (role) headers['x-cco-role'] = role;
  return fetch(`${baseUrl}/cco/runtime/conversation/${encodeURIComponent(key)}/identity`, {
    headers,
  });
}

test('identity: returnerar trådens kanoniska patient', async () => {
  const key = 'kons@hairtpclinic.com:CONV-1';
  const fixture = await createFixture({
    identities: {
      [key]: {
        conversationKey: key,
        canonicalPatientId: 'p-123',
        identityConflict: false,
        linkedAt: '2026-08-17T10:00:00.000Z',
        linkedBy: 'owner@hairtpclinic.se',
        patientIds: ['p-123'],
        rawMessageIds: ['raw-1', 'raw-2'],
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await identityReq(baseUrl, key);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.conversationKey, key);
      assert.equal(body.identity.canonicalPatientId, 'p-123');
      assert.equal(body.identity.identityConflict, false);
      assert.equal(body.identity.linkedAt, '2026-08-17T10:00:00.000Z');
      assert.equal(body.identity.linkedBy, 'owner@hairtpclinic.se');
      assert.deepEqual(body.identity.patientIds, ['p-123']);
      assert.equal(body.identity.messageCount, 2);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('identity: saknad identity returnerar null', async () => {
  const fixture = await createFixture({ identities: {} });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await identityReq(baseUrl, 'okand@x.se:CONV-X');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.identity, null);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('identity: saknad store ger 503', async () => {
  const fixture = await createFixture({ noStore: true });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await identityReq(baseUrl, 'kons@hairtpclinic.com:CONV-1');
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'mail_ingestion_store_unavailable');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('identity: roll utan mail.read nekas', async () => {
  const key = 'kons@hairtpclinic.com:CONV-1';
  const fixture = await createFixture({
    identities: {
      [key]: { canonicalPatientId: 'p-123', patientIds: ['p-123'], rawMessageIds: ['raw-1'] },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await identityReq(baseUrl, key, 'personal');
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error, 'forbidden');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('identity: konflikt flaggas korrekt', async () => {
  const key = 'kons@hairtpclinic.com:CONV-CONFLICT';
  const fixture = await createFixture({
    identities: {
      [key]: {
        conversationKey: key,
        canonicalPatientId: null,
        identityConflict: true,
        linkedAt: '2026-08-17T10:00:00.000Z',
        linkedBy: 'system',
        patientIds: ['p-a', 'p-b'],
        rawMessageIds: ['raw-a', 'raw-b'],
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await identityReq(baseUrl, key);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.identity.identityConflict, true);
      assert.equal(body.identity.canonicalPatientId, null);
      assert.deepEqual(body.identity.patientIds, ['p-a', 'p-b']);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
