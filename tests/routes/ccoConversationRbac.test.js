'use strict';

/* C1 — Explicit RBAC på konversations-routes.
 *
 * Verifierar att /cco/runtime/conversation/:key/* gate:as med rätt permission:
 *  - läsning (messages)   → mail.read   (owner/operator/konsult)
 *  - triage-write (action)→ mail.write  (owner/operator)
 *
 * Rollerna sätts via x-cco-role-headern (honoreras bara utanför production).
 * Permission-kartan (src/security/ccoRbac.js):
 *   personal → varken mail.read eller mail.write
 *   konsult  → mail.read men INTE mail.write   (read-only för triage)
 *   operator → mail.read + mail.write
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

const CUSTOMER = 'rbac-kund@test.se';
const CONV_KEY = 'conv-rbac-1';
const MESSAGES = [
  {
    mailboxConversationId: CONV_KEY,
    senderEmail: CUSTOMER,
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
];

async function createFixture({
  messages = MESSAGES,
  ingestionState = null,
  mailboxIdsForSync = [],
  tenantScopeId = '',
  requireAuth,
} = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-rbac-'));
  const auditEvents = [];
  const conversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'conv-state.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: {
        listMessages({ mailboxIds = [] } = {}) {
          const normalizedMailboxIds = new Set(
            mailboxIds.map((mailboxId) =>
              String(mailboxId || '')
                .trim()
                .toLowerCase()
            )
          );
          if (normalizedMailboxIds.size === 0) return messages;
          return messages.filter((message) =>
            normalizedMailboxIds.has(
              String(message.mailboxId || '')
                .trim()
                .toLowerCase()
            )
          );
        },
      },
      requireAuth,
      mailIngestionStore: ingestionState
        ? {
            getState: () => ingestionState,
          }
        : null,
      ccoConversationStateStore: conversationStateStore,
      mailboxIdsForSync,
      defaultTenantId: 'cco',
      tenantScopeId,
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
    })
  );
  return { app, tempDir, auditEvents };
}

function readReq(baseUrl, role) {
  return readReqByKey(baseUrl, CONV_KEY, role);
}

function readReqByKey(baseUrl, key, role, query = '') {
  const headers = {};
  if (role) headers['x-cco-role'] = role;
  return fetch(`${baseUrl}/cco/runtime/conversation/${encodeURIComponent(key)}/messages${query}`, {
    headers,
  });
}

function actionReq(baseUrl, role) {
  const headers = { 'content-type': 'application/json' };
  if (role) headers['x-cco-role'] = role;
  return fetch(`${baseUrl}/cco/runtime/conversation/${CONV_KEY}/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'handled', customerId: CUSTOMER }),
  });
}

const DASHBOARD_TENANT_ID = 'hair-tp-clinic';
const DASHBOARD_BEARER_CONTEXTS = {
  'dashboard-owner': { tenantId: DASHBOARD_TENANT_ID, role: 'owner' },
  'dashboard-other-tenant': { tenantId: 'another-clinic', role: 'owner' },
  'dashboard-personal': { tenantId: DASHBOARD_TENANT_ID, role: 'finance' },
  'dashboard-operator': { tenantId: DASHBOARD_TENANT_ID, role: 'operator' },
};

function requireDashboardBearerAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  const context = DASHBOARD_BEARER_CONTEXTS[token];
  if (!context || !/^Bearer\s+/i.test(authorization)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.auth = { ...context };
  return next();
}

function dashboardReq(baseUrl, token = '') {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}/cco/runtime/dashboard?days=90`, { headers });
}

// ── Saknad permission → 403 ──────────────────────────────────────────────────

test('RBAC: anonym (ingen roll) får 403 på både läsning och write', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, null);
      assert.equal(read.status, 403, 'anonym ska nekas läsning');
      const write = await actionReq(baseUrl, null);
      assert.equal(write.status, 403, 'anonym ska nekas write');
    });
    assert.equal(fixture.auditEvents.length, 0, 'inget audit-event vid nekad request');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('RBAC: roll utan mail.read (finance) får 403 på läsning', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'finance');
      assert.equal(read.status, 403);
      const body = await read.json();
      assert.equal(body.error, 'forbidden');
      assert.equal(body.requiredPermission, 'mail.read');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('RBAC: personal (operativ, har mail.read) får läsa tråden', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'personal');
      assert.equal(read.status, 200, 'personal har mail.read (P0-004)');
      const body = await read.json();
      assert.equal(body.ok, true);
      assert.equal(body.messages[0].senderEmail, CUSTOMER);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── Rätt permission → action fungerar ────────────────────────────────────────

test('RBAC: operator (mail.write) får utföra handled-action', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await actionReq(baseUrl, 'operator');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'handled');
    });
    assert.ok(
      fixture.auditEvents.some((e) => e.action === 'cco.conversation.handled'),
      'audit-event ska skapas när permission finns'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── Read-only roll: kan läsa men inte skriva ─────────────────────────────────

test('RBAC: konsult kan läsa tråden (200) men nekas triage-write (403)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'konsult');
      assert.equal(read.status, 200, 'konsult har mail.read');
      const readBody = await read.json();
      assert.equal(readBody.ok, true);
      assert.equal(readBody.messages[0].senderEmail, CUSTOMER);
      assert.equal(readBody.messages[0].fromEmail, CUSTOMER);
      assert.equal(readBody.messages[0].mailboxAddress, 'kons@hairtpclinic.com');

      const write = await actionReq(baseUrl, 'konsult');
      assert.equal(write.status, 403, 'konsult saknar mail.write');
      const writeBody = await write.json();
      assert.equal(writeBody.requiredPermission, 'mail.write');
    });
    assert.equal(
      fixture.auditEvents.length,
      0,
      'ingen mutation/audit när read-only-roll nekas write'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: scoped worklist key resolves stored conversation messages', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const scopedKey = `kons@hairtpclinic.com:${CONV_KEY}`;
      const read = await readReqByKey(baseUrl, scopedKey, 'operator');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.ok, true);
      assert.equal(body.conversationKey, scopedKey);
      assert.equal(body.messageCount, 1);
      assert.equal(body.messages[0].dir, 'inbound');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: tenant- och mailboxscope stanger ute annan tenant och legacy-mailbox', async () => {
  const allowedMailboxId = 'contact@hairtpclinic.com';
  const legacyMailboxId = 'legacy@other-clinic.test';
  const scopedMessages = [
    {
      mailboxConversationId: 'contact-thread',
      senderEmail: CUSTOMER,
      mailboxId: allowedMailboxId,
      mailboxAddress: allowedMailboxId,
      folderType: 'inbox',
      sentAt: '2025-01-01T10:00:00.000Z',
    },
    {
      mailboxConversationId: 'legacy-thread',
      senderEmail: 'other@example.test',
      mailboxId: legacyMailboxId,
      mailboxAddress: legacyMailboxId,
      folderType: 'inbox',
      sentAt: '2025-01-01T10:01:00.000Z',
    },
  ];
  const fixture = await createFixture({
    messages: scopedMessages,
    mailboxIdsForSync: [allowedMailboxId],
    tenantScopeId: 'hair-tp-clinic',
    requireAuth(req, _res, next) {
      req.auth = {
        tenantId: req.headers['x-test-tenant'] || 'hair-tp-clinic',
        role: req.headers['x-cco-role'] || 'operator',
      };
      next();
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const allowed = await readReqByKey(baseUrl, `${allowedMailboxId}:contact-thread`, 'operator');
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).messageCount, 1);

      const legacy = await readReqByKey(baseUrl, `${legacyMailboxId}:legacy-thread`, 'operator');
      assert.equal(legacy.status, 200);
      assert.equal((await legacy.json()).messageCount, 0, 'off-scope mailbox far inte lasa');

      const wrongTenant = await fetch(
        `${baseUrl}/cco/runtime/conversation/${encodeURIComponent(`${allowedMailboxId}:contact-thread`)}/messages`,
        { headers: { 'x-cco-role': 'operator', 'x-test-tenant': 'another-tenant' } }
      );
      assert.equal(wrongTenant.status, 403);
      assert.equal((await wrongTenant.json()).error, 'tenant_scope_forbidden');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('mailboxvaljaren kraver autentiserad mail.read och visar bara aktiv CCO-scope', async () => {
  const allowedMailboxId = 'contact@hairtpclinic.com';
  const fixture = await createFixture({
    mailboxIdsForSync: [allowedMailboxId],
    tenantScopeId: 'hair-tp-clinic',
    requireAuth(req, res, next) {
      if (req.get('authorization') !== 'Bearer test-token') {
        return res.status(401).json({ error: 'unauthorized' });
      }
      req.auth = { tenantId: 'hair-tp-clinic', role: 'operator' };
      return next();
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const anonymous = await fetch(`${baseUrl}/cco/runtime/mailboxes`);
      assert.equal(anonymous.status, 401);

      const anonymousHealth = await fetch(`${baseUrl}/cco/runtime/health/mailboxes`);
      assert.equal(anonymousHealth.status, 401);

      const authenticated = await fetch(`${baseUrl}/cco/runtime/mailboxes`, {
        headers: { authorization: 'Bearer test-token' },
      });
      assert.equal(authenticated.status, 200);
      const payload = await authenticated.json();
      assert.deepEqual(
        payload.mailboxes.map((mailbox) => mailbox.mailboxId),
        [allowedMailboxId]
      );

      const authenticatedHealth = await fetch(`${baseUrl}/cco/runtime/health/mailboxes`, {
        headers: { authorization: 'Bearer test-token' },
      });
      assert.equal(authenticatedHealth.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('dashboard: utan Bearer-auth nekas fail-closed', async () => {
  const fixture = await createFixture({
    tenantScopeId: DASHBOARD_TENANT_ID,
    requireAuth: requireDashboardBearerAuth,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await dashboardReq(baseUrl);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'unauthorized');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('dashboard: Bearer-token for fel tenant nekas fail-closed', async () => {
  const fixture = await createFixture({
    tenantScopeId: DASHBOARD_TENANT_ID,
    requireAuth: requireDashboardBearerAuth,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await dashboardReq(baseUrl, 'dashboard-other-tenant');
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, 'tenant_scope_forbidden');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('dashboard: Bearer-token utan mail.read nekas fail-closed', async () => {
  const fixture = await createFixture({
    tenantScopeId: DASHBOARD_TENANT_ID,
    requireAuth: requireDashboardBearerAuth,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await dashboardReq(baseUrl, 'dashboard-personal');
      assert.equal(response.status, 403);
      const body = await response.json();
      assert.equal(body.error, 'forbidden');
      assert.equal(body.requiredPermission, 'mail.read');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('dashboard: behorig Bearer-token far bara se aktiv mailbox-scope', async () => {
  const allowedMailboxId = 'contact@hairtpclinic.com';
  const legacyMailboxId = 'legacy@other-clinic.test';
  const now = new Date().toISOString();
  const fixture = await createFixture({
    messages: [
      {
        mailboxConversationId: 'contact-dashboard-thread',
        senderEmail: CUSTOMER,
        mailboxId: allowedMailboxId,
        mailboxAddress: allowedMailboxId,
        folderType: 'inbox',
        sentAt: now,
      },
      {
        mailboxConversationId: 'legacy-dashboard-thread',
        senderEmail: 'other@example.test',
        mailboxId: legacyMailboxId,
        mailboxAddress: legacyMailboxId,
        folderType: 'inbox',
        sentAt: now,
      },
    ],
    mailboxIdsForSync: [allowedMailboxId],
    tenantScopeId: DASHBOARD_TENANT_ID,
    requireAuth: requireDashboardBearerAuth,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await dashboardReq(baseUrl, 'dashboard-operator');
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.totals.total, 1);
      assert.deepEqual(Object.keys(body.perMailbox), [allowedMailboxId]);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('dashboard: raknar obesvarade tradar och SLA-risk korrekt', async () => {
  const mailboxId = 'contact@hairtpclinic.com';
  const nowMs = Date.now();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const toIso = (offsetMs) => new Date(nowMs - offsetMs).toISOString();
  const fixture = await createFixture({
    messages: [
      // Obesvarad + SLA-risk: senaste inbound för 48h sedan, inget svar
      {
        mailboxConversationId: 'sla-risk-thread',
        senderEmail: 'kund-a@test.se',
        mailboxId,
        mailboxAddress: mailboxId,
        folderType: 'inbox',
        sentAt: toIso(48 * hourMs),
      },
      // Obesvarad men inom SLA: senaste inbound för 1h sedan
      {
        mailboxConversationId: 'unanswered-ok-thread',
        senderEmail: 'kund-b@test.se',
        mailboxId,
        mailboxAddress: mailboxId,
        folderType: 'inbox',
        sentAt: toIso(1 * hourMs),
      },
      // Besvarad: inbound 36h sedan, outbound svar 12h sedan
      {
        mailboxConversationId: 'answered-thread',
        senderEmail: 'kund-c@test.se',
        mailboxId,
        mailboxAddress: mailboxId,
        folderType: 'inbox',
        sentAt: toIso(36 * hourMs),
      },
      {
        mailboxConversationId: 'answered-thread',
        senderEmail: 'kund-c@test.se',
        mailboxId,
        mailboxAddress: mailboxId,
        folderType: 'sentitems',
        sentAt: toIso(12 * hourMs),
      },
      // Endast utgående: räknas inte som obesvarad
      {
        mailboxConversationId: 'outbound-only-thread',
        senderEmail: 'klinik@hairtpclinic.com',
        mailboxId,
        mailboxAddress: mailboxId,
        folderType: 'sentitems',
        sentAt: toIso(2 * hourMs),
      },
    ],
    mailboxIdsForSync: [mailboxId],
    tenantScopeId: DASHBOARD_TENANT_ID,
    requireAuth: requireDashboardBearerAuth,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await dashboardReq(baseUrl, 'dashboard-operator');
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.unansweredThreads, 2);
      assert.equal(body.slaRiskThreads, 1);
      assert.equal(body.slaThresholdHours, 24);
      assert.equal(body.perMailbox[mailboxId].unanswered, 2);
      assert.equal(body.perMailbox[mailboxId].inbound, 3);
      assert.equal(body.perMailbox[mailboxId].outbound, 2);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: ingestion-fallback laser inte legacy-mailbox utanfor aktiv CCO-scope', async () => {
  const allowedMailboxId = 'contact@hairtpclinic.com';
  const legacyMailboxId = 'legacy@other-clinic.test';
  const fixture = await createFixture({
    messages: [],
    mailboxIdsForSync: [allowedMailboxId],
    ingestionState: {
      mailRawMessages: {
        allowed: {
          conversationId: 'contact-thread',
          mailboxId: allowedMailboxId,
          folderType: 'inbox',
          fromEmail: CUSTOMER,
          bodyText: 'Tillaten lokal historik.',
          receivedAt: '2025-01-01T10:00:00.000Z',
        },
        legacy: {
          conversationId: 'legacy-thread',
          mailboxId: legacyMailboxId,
          folderType: 'inbox',
          fromEmail: 'other@example.test',
          bodyText: 'Far aldrig visas.',
          receivedAt: '2025-01-01T10:01:00.000Z',
        },
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const allowed = await readReqByKey(baseUrl, `${allowedMailboxId}:contact-thread`, 'operator');
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).messageCount, 1);

      const legacy = await readReqByKey(baseUrl, `${legacyMailboxId}:legacy-thread`, 'operator');
      assert.equal(legacy.status, 200);
      assert.equal((await legacy.json()).messageCount, 0);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: full body fields are preferred before preview snippets', async () => {
  const fixture = await createFixture({
    messages: [
      {
        mailboxConversationId: CONV_KEY,
        senderEmail: CUSTOMER,
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        sentAt: '2025-01-01T10:00:00.000Z',
        bodyPreview: 'Kort preview som inte räcker',
        bodyText: 'Kort preview som inte räcker',
        rawJson: {
          body: {
            contentType: 'html',
            content:
              '<p>Hela mailet från Graph med alla rader och detaljer.</p><p>Rad två ska också visas.</p>',
          },
        },
      },
    ],
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'operator');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.messageCount, 1);
      assert.match(body.messages[0].body, /Hela mailet från Graph med alla rader och detaljer/);
      assert.match(body.messages[0].body, /Rad två ska också visas/);
      assert.notEqual(body.messages[0].body, 'Kort preview som inte räcker');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: raw ingestion fallback renders thread when truth alias lookup is empty', async () => {
  const fixture = await createFixture({
    messages: [],
    ingestionState: {
      mailRawMessages: {
        raw_1: {
          id: 'raw_1',
          rawMessageId: 'raw_1',
          graphMessageId: 'graph-1',
          conversationId: CONV_KEY,
          mailboxId: 'kons@hairtpclinic.com',
          folderType: 'inbox',
          fromEmail: CUSTOMER,
          fromName: 'Live Kund',
          subject: 'Live kontaktformulär',
          bodyPreview: 'Preview',
          bodyText: 'Full text från ingestion-storen.',
          receivedAt: '2025-01-01T10:00:00.000Z',
        },
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReqByKey(baseUrl, 'kons@hairtpclinic.com:conv-rbac-1', 'operator');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.messageCount, 1);
      assert.equal(body.messages[0].fromEmail, CUSTOMER);
      assert.equal(body.messages[0].mailboxAddress, 'kons@hairtpclinic.com');
      assert.equal(body.messages[0].body, 'Full text från ingestion-storen.');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: rollup key can resolve messages through explicit underlying aliases', async () => {
  const fixture = await createFixture({
    messages: [
      {
        mailboxConversationId: 'underlying-thread-1',
        conversationId: 'underlying-thread-1',
        graphMessageId: 'graph-underlying-1',
        senderEmail: CUSTOMER,
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        sentAt: '2025-01-01T10:00:00.000Z',
        bodyText: 'Meddelandet hör till underliggande trådnyckel.',
      },
    ],
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReqByKey(
        baseUrl,
        'rollup:customer:kons',
        'operator',
        '?aliases=underlying-thread-1,kons%40hairtpclinic.com%3Aunderlying-thread-1'
      );
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.ok, true);
      assert.equal(body.conversationKey, 'rollup:customer:kons');
      assert.equal(body.messageCount, 1);
      assert.equal(body.messages[0].body, 'Meddelandet hör till underliggande trådnyckel.');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: raw html uniqueBody is preferred before short preview', async () => {
  const fixture = await createFixture({
    messages: [
      {
        mailboxConversationId: CONV_KEY,
        senderEmail: CUSTOMER,
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        sentAt: '2025-01-01T10:00:00.000Z',
        bodyPreview: 'Kort preview',
        rawJson: {
          uniqueBody: {
            content:
              '<html><body><p>Full text från uniqueBody.</p><p>Rad två från kontaktformulär.</p></body></html>',
          },
        },
      },
    ],
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'operator');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.match(body.messages[0].body, /Full text från uniqueBody/);
      assert.match(body.messages[0].body, /Rad två från kontaktformulär/);
      assert.notEqual(body.messages[0].body, 'Kort preview');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: truth preview rows are enriched with raw ingestion full body', async () => {
  const fixture = await createFixture({
    messages: [
      {
        mailboxConversationId: CONV_KEY,
        conversationId: CONV_KEY,
        graphMessageId: 'graph-1',
        senderEmail: CUSTOMER,
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        sentAt: '2025-01-01T10:00:00.000Z',
        bodyPreview: 'Kort avhuggen preview...',
      },
    ],
    ingestionState: {
      mailRawMessages: {
        raw_1: {
          id: 'raw_1',
          graphMessageId: 'graph-1',
          conversationId: CONV_KEY,
          mailboxId: 'kons@hairtpclinic.com',
          folderType: 'inbox',
          fromEmail: CUSTOMER,
          fromName: 'Live Kund',
          subject: 'Live kontaktformulär',
          bodyPreview: 'Kort avhuggen preview...',
          bodyText: 'Fullt mail från raw ingestion, inte bara preview.',
          receivedAt: '2025-01-01T10:00:00.000Z',
        },
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'operator');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.messageCount, 1);
      assert.equal(body.messages[0].body, 'Fullt mail från raw ingestion, inte bara preview.');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── Live-send är owner-only (mail.live_send) ─────────────────────────────────

test('RBAC: roll utan mail.live_send (finance) nekas live-send reply', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/${CONV_KEY}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'finance' },
        body: JSON.stringify({ body: 'Hej!' }),
      });
      assert.equal(res.status, 403, 'finance saknar mail.live_send');
      const body = await res.json();
      assert.equal(body.requiredPermission, 'mail.live_send');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

function makeManyMessages(count) {
  return Array.from({ length: count }, (_, i) => ({
    mailboxConversationId: CONV_KEY,
    graphMessageId: `msg-${count - i}`,
    senderEmail: `kund${count - i}@test.se`,
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    sentAt: `2025-01-01T${String(count - i).padStart(2, '0')}:00:00.000Z`,
    bodyPreview: `Meddelande ${count - i}`,
  }));
}

test('messages: default pagination returns up to 100 messages and metadata', async () => {
  const fixture = await createFixture({ messages: makeManyMessages(150) });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReqByKey(baseUrl, CONV_KEY, 'operator');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.ok, true);
      assert.equal(body.messageCount, 100);
      assert.equal(body.totalMessageCount, 150);
      assert.ok(body.pagination, 'pagination ska finnas');
      assert.equal(body.pagination.limit, 100);
      assert.equal(body.pagination.offset, 0);
      assert.equal(body.pagination.totalCount, 150);
      assert.equal(body.pagination.returnedCount, 100);
      assert.equal(body.pagination.hasMore, true);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: limit and offset pagination works', async () => {
  const fixture = await createFixture({ messages: makeManyMessages(10) });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReqByKey(baseUrl, CONV_KEY, 'operator', '?limit=3&offset=4');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.ok, true);
      assert.equal(body.messageCount, 3);
      assert.equal(body.totalMessageCount, 10);
      assert.equal(body.pagination.limit, 3);
      assert.equal(body.pagination.offset, 4);
      assert.equal(body.pagination.returnedCount, 3);
      assert.equal(body.pagination.hasMore, true);
      // Pagination ska returnera unika meddelanden i rätt slice
      assert.equal(new Set(body.messages.map((m) => m.senderEmail)).size, 3);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('messages: all=true returns every message', async () => {
  const fixture = await createFixture({ messages: makeManyMessages(150) });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReqByKey(baseUrl, CONV_KEY, 'operator', '?all=true');
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.ok, true);
      assert.equal(body.messageCount, 150);
      assert.equal(body.totalMessageCount, 150);
      assert.equal(body.pagination.limit, null);
      assert.equal(body.pagination.offset, 0);
      assert.equal(body.pagination.hasMore, false);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
