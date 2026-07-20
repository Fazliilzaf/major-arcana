const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const {
  createCapabilitiesRouter,
  clearWorklistConsumerResponseCache,
} = require('../../src/routes/capabilities');
const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');
const { createAuthStore } = require('../../src/security/authStore');
const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const { createCcoMailboxTruthShardedStore } = require('../../src/ops/ccoMailboxTruthShardedStore');
const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  const address = server.address();
  const host = address && typeof address === 'object' ? address.address : '127.0.0.1';
  const port = address && typeof address === 'object' ? address.port : address;
  const baseUrl = `http://${host}:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function createMockAuth(role = 'OWNER') {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role,
    };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

function createBearerAuth(contexts = {}) {
  function requireAuth(req, res, next) {
    const authorization = req.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!/^Bearer\s+/i.test(authorization) || !contexts[token]) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.auth = contexts[token];
    return next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'forbidden' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

test('runtime worklist consumer rejects broad mailbox sweeps before reading truth data', async () => {
  const app = express();
  app.use(express.json());
  const auth = createMockAuth('OWNER');
  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore: {
        async addAuditEvent() {},
      },
      tenantConfigStore: {
        async getTenantConfig() {
          return {};
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=` +
        'kons@hairtpclinic.com,contact@hairtpclinic.com,info@hairtpclinic.com&limit=500'
    );
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error, 'worklist_scope_too_broad');
    assert.equal(payload.maxMailboxIds, 2);
  });
});

test('runtime worklist consumer contract: Bearer, tenant cache and mailbox scope are fail-closed for v2 parity', async () => {
  clearWorklistConsumerResponseCache();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-v2-parity-'));
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  const scopedMailboxId = 'contact@hairtpclinic.com';
  const offScopeMailboxId = 'legacy@other-clinic.test';
  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: scopedMailboxId,
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: scopedMailboxId,
          conversationId: 'v2-contact-visible',
          graphMessageId: 'v2-contact-message',
          subject: 'Synlig scoped tråd',
          preview: 'Ska nå både legacy och v2 via samma state.',
          receivedAt: '2026-07-20T08:00:00.000Z',
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: offScopeMailboxId,
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: offScopeMailboxId,
          conversationId: 'v2-offscope-hidden',
          graphMessageId: 'v2-offscope-message',
          subject: 'Off-scope tråd',
          preview: 'Får aldrig läcka in via vald mailbox.',
          receivedAt: '2026-07-20T08:01:00.000Z',
        }),
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createBearerAuth({
      'tenant-a-owner': { tenantId: 'tenant-a', userId: 'owner-a', role: 'OWNER' },
      'tenant-b-owner': { tenantId: 'tenant-b', userId: 'owner-b', role: 'OWNER' },
      'tenant-a-viewer': { tenantId: 'tenant-a', userId: 'viewer-a', role: 'PERSONAL' },
    });
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore: { async addAuditEvent() {} },
        capabilityAnalysisStore: null,
        ccoMailboxTruthStore,
        tenantConfigStore: { async getTenantConfig() { return {}; } },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        runtimeWorklistMailboxIds: [scopedMailboxId],
      })
    );

    await withServer(app, async (baseUrl) => {
      const consumerPath = `/api/v1/cco/runtime/worklist/consumer?mailboxIds=${encodeURIComponent(
        scopedMailboxId
      )}&limit=20`;

      const anonymous = await fetch(`${baseUrl}${consumerPath}`);
      assert.equal(anonymous.status, 401, 'worklist consumer ska kräva Bearer-auth');

      const wrongRole = await fetch(`${baseUrl}${consumerPath}`, {
        headers: { authorization: 'Bearer tenant-a-viewer' },
      });
      assert.equal(wrongRole.status, 403, 'worklist consumer ska kräva owner/staff-scope');

      const tenantA = await fetch(`${baseUrl}${consumerPath}`, {
        headers: { authorization: 'Bearer tenant-a-owner' },
      });
      assert.equal(tenantA.status, 200);
      assert.equal(tenantA.headers.get('x-cco-worklist-cache'), 'miss');
      const tenantAPayload = await tenantA.json();
      assert.deepEqual(
        tenantAPayload.rows.map((row) => row.conversation.conversationId),
        ['v2-contact-visible'],
        'serverkontraktet ska exponera exakt scoped conversation key, inte bara antal'
      );
      assert.equal(tenantAPayload.rows[0].mailbox.mailboxId, scopedMailboxId);

      const tenantB = await fetch(`${baseUrl}${consumerPath}`, {
        headers: { authorization: 'Bearer tenant-b-owner' },
      });
      assert.equal(tenantB.status, 200);
      assert.equal(
        tenantB.headers.get('x-cco-worklist-cache'),
        'miss',
        'cache måste vara tenant-scopad så en annan tenant inte kan återanvända payload'
      );

      const tenantBRepeat = await fetch(`${baseUrl}${consumerPath}`, {
        headers: { authorization: 'Bearer tenant-b-owner' },
      });
      assert.equal(tenantBRepeat.status, 200);
      assert.equal(tenantBRepeat.headers.get('x-cco-worklist-cache'), 'hit');

      const offScope = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=${encodeURIComponent(
          offScopeMailboxId
        )}&limit=20`,
        { headers: { authorization: 'Bearer tenant-a-owner' } }
      );
      assert.equal(offScope.status, 422, 'off-scope mailbox ska nekas fail-closed');
      const offScopePayload = await offScope.json();
      assert.equal(offScopePayload.error, 'worklist_scope_too_broad');
      assert.equal(
        JSON.stringify(offScopePayload).includes('v2-offscope-hidden'),
        false,
        'off-scope mailbox får aldrig läsa eller läcka en conversation key'
      );
    });
  } finally {
    clearWorklistConsumerResponseCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer honours an explicit Hälso mailbox scope', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-halso-'));
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'halso@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'halso@hairtpclinic.com',
          conversationId: 'halso-conversation',
          graphMessageId: 'halso-message',
          subject: 'Hälsodeklaration',
          preview: 'Här kommer min hälsodeklaration.',
          receivedAt: '2026-07-14T08:00:00.000Z',
        }),
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore: { async addAuditEvent() {} },
        capabilityAnalysisStore: null,
        ccoMailboxTruthStore,
        tenantConfigStore: { async getTenantConfig() { return {}; } },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=halso@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.mailboxIds, ['halso@hairtpclinic.com']);
      assert.deepEqual(payload.rows.map((row) => row.mailboxId), ['halso@hairtpclinic.com']);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer emits cold timing without changing its JSON contract', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-timing-'));
  const mailboxId = 'contact@hairtpclinic.com';
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  const timingEvents = [];
  clearWorklistConsumerResponseCache();
  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId,
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId,
          conversationId: 'timing-conversation',
          graphMessageId: 'timing-message',
          subject: 'Timingkontroll',
          preview: 'Endast en läsande kontroll.',
          receivedAt: '2026-07-17T08:00:00.000Z',
        }),
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore: { async addAuditEvent() {} },
        capabilityAnalysisStore: null,
        ccoMailboxTruthStore,
        tenantConfigStore: { async getTenantConfig() { return {}; } },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        worklistTimingLogger(entry) {
          timingEvents.push(entry);
        },
      })
    );

    await withServer(app, async (baseUrl) => {
      const url = `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=${encodeURIComponent(
        mailboxId
      )}&limit=20`;
      const coldResponse = await fetch(url);
      assert.equal(coldResponse.status, 200);
      assert.equal(coldResponse.headers.get('X-CCO-Worklist-Cache'), 'miss');
      assert.match(coldResponse.headers.get('Server-Timing') || '', /cco_data;dur=/);
      assert.match(coldResponse.headers.get('Server-Timing') || '', /cco_enrichment;dur=/);
      const coldPayload = await coldResponse.json();
      assert.equal(Object.hasOwn(coldPayload, 'timing'), false);

      assert.equal(timingEvents.length, 1);
      assert.deepEqual(timingEvents[0].mailboxIds, [mailboxId]);
      assert.equal(timingEvents[0].event, 'cco.worklist.consumer.cold_timing');
      assert.equal(timingEvents[0].cache, 'miss');
      assert.equal(Number.isFinite(timingEvents[0].dataReadMs), true);
      assert.equal(Number.isFinite(timingEvents[0].enrichmentMs), true);
      assert.equal(Number.isFinite(timingEvents[0].serializationMs), true);
      assert.equal(timingEvents[0].dataReadMs >= 0, true);
      assert.equal(timingEvents[0].enrichmentMs >= 0, true);
      assert.equal(timingEvents[0].serializationMs >= 0, true);

      const cachedResponse = await fetch(url);
      assert.equal(cachedResponse.status, 200);
      assert.equal(cachedResponse.headers.get('X-CCO-Worklist-Cache'), 'hit');
      assert.equal(cachedResponse.headers.get('Server-Timing'), null);
      assert.deepEqual(await cachedResponse.json(), coldPayload);
      assert.equal(timingEvents.length, 1, 'cache-hit får ingen ny kallmätning');
    });
  } finally {
    clearWorklistConsumerResponseCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer honours a configured external CCO IMAP mailbox scope', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-imap-'));
  const mailboxId = 'info@fazli.se';
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId,
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId,
          conversationId: 'imap-conversation',
          graphMessageId: 'imap-message',
          subject: 'One.com-fråga',
          preview: 'Ett externt mailbox-test.',
          receivedAt: '2026-07-17T08:00:00.000Z',
        }),
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore: { async addAuditEvent() {} },
        capabilityAnalysisStore: null,
        ccoMailboxTruthStore,
        ccoRuntimeMailboxIds: [mailboxId],
        tenantConfigStore: { async getTenantConfig() { return {}; } },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=${encodeURIComponent(mailboxId)}&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.mailboxIds, [mailboxId]);
      assert.deepEqual(payload.rows.map((row) => row.mailboxId), [mailboxId]);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer rolls exact patient aliases across mailboxes but leaves ambiguous emails separate', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-patient-rollup-'));
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'kons@hairtpclinic.com',
          conversationId: 'anna-kons',
          graphMessageId: 'anna-kons-message',
          subject: 'Fråga till kons',
          preview: 'Jag behöver hjälp med min bokning.',
          receivedAt: '2026-07-15T08:00:00.000Z',
          from: { address: 'anna.private@example.test', name: 'Anna Karlsson' },
        }),
        inboxMessage({
          mailboxId: 'kons@hairtpclinic.com',
          conversationId: 'shared-kons',
          graphMessageId: 'shared-kons-message',
          subject: 'Delad adress',
          preview: 'Fråga från delad adress.',
          receivedAt: '2026-07-15T08:10:00.000Z',
          from: { address: 'shared@example.test', name: 'Oklar kund' },
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'contact@hairtpclinic.com',
          conversationId: 'anna-contact',
          graphMessageId: 'anna-contact-message',
          subject: 'Fråga till contact',
          preview: 'Samma kund från en annan adress.',
          receivedAt: '2026-07-15T08:20:00.000Z',
          from: { address: 'anna.work@example.test', name: 'Anna Karlsson' },
        }),
        inboxMessage({
          mailboxId: 'contact@hairtpclinic.com',
          conversationId: 'shared-contact',
          graphMessageId: 'shared-contact-message',
          subject: 'Delad adress',
          preview: 'Samma delade adress i annan mailbox.',
          receivedAt: '2026-07-15T08:30:00.000Z',
          from: { address: 'shared@example.test', name: 'Oklar kund' },
        }),
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore: { async addAuditEvent() {} },
        ccoMailboxTruthStore,
        patientMasterStore: {
          async findPatientsByEmails({ emails }) {
            const matches = Object.fromEntries(emails.map((email) => [email, []]));
            for (const email of emails) {
              if (email === 'anna.private@example.test' || email === 'anna.work@example.test') {
                matches[email] = [
                  {
                    id: 'patient-anna-uuid',
                    displayName: 'Anna Karlsson',
                    primaryEmail: 'anna.private@example.test',
                    emails: ['anna.work@example.test'],
                  },
                ];
              }
              if (email === 'shared@example.test') {
                matches[email] = [
                  { id: 'patient-a', displayName: 'Patient A', primaryEmail: email },
                  { id: 'patient-b', displayName: 'Patient B', primaryEmail: email },
                ];
              }
            }
            return { matches };
          },
        },
        tenantConfigStore: { async getTenantConfig() { return {}; } },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=kons@hairtpclinic.com,contact@hairtpclinic.com&limit=19`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      const annaRows = payload.rows.filter(
        (row) => row.patientId === 'patient-anna-uuid'
      );
      assert.equal(annaRows.length, 1, 'två alias ska bli en kundtråd');
      assert.equal(annaRows[0].customerIdentity.canonicalCustomerId, 'patient-anna-uuid');
      assert.equal(annaRows[0].patientMatch.status, 'matched');
      assert.equal(annaRows[0].rollup.enabled, true);
      assert.deepEqual(
        [...annaRows[0].rollup.underlyingMailboxIds].sort(),
        ['contact@hairtpclinic.com', 'kons@hairtpclinic.com']
      );

      const ambiguousRows = payload.rows.filter(
        (row) => row.customer.email === 'shared@example.test'
      );
      assert.equal(ambiguousRows.length, 2, 'delad e-post får aldrig auto-rollas ihop');
      assert.ok(ambiguousRows.every((row) => row.patientId === null));
      assert.ok(ambiguousRows.every((row) => row.patientMatch.status === 'ambiguous'));
      assert.ok(ambiguousRows.every((row) => row.rollup.enabled === false));
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

async function seedFolder(store, { mailboxId, folderType, messages = [] }) {
  await store.recordFolderPage({
    account: {
      mailboxId,
      mailboxAddress: mailboxId,
      userPrincipalName: mailboxId,
    },
    folder: {
      folderType,
      folderId: `${mailboxId}-${folderType}`,
      folderName: folderType,
      wellKnownName: folderType,
      totalItemCount: messages.length,
      unreadItemCount: messages.filter(
        (item) => item.folderType === 'inbox' && item.isRead === false
      ).length,
      messageCollectionCount: messages.length,
    },
    messages,
    complete: true,
  });
}

function inboxMessage({
  mailboxId = 'kons@hairtpclinic.com',
  conversationId,
  graphMessageId,
  subject,
  preview,
  receivedAt,
  isRead = false,
  from = {
    address: 'patient@example.com',
    name: 'Patient One',
  },
}) {
  return {
    graphMessageId,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    folderType: 'inbox',
    folderId: `${mailboxId}-inbox`,
    folderName: 'Inbox',
    conversationId,
    subject,
    bodyPreview: preview,
    direction: 'inbound',
    isRead,
    receivedAt,
    createdAt: receivedAt,
    lastModifiedAt: receivedAt,
    from,
    toRecipients: [{ address: mailboxId, name: 'Clinic' }],
    replyToRecipients: [],
  };
}

function sentMessage({
  mailboxId = 'kons@hairtpclinic.com',
  conversationId,
  graphMessageId,
  subject,
  preview,
  sentAt,
}) {
  return {
    graphMessageId,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    folderType: 'sent',
    folderId: `${mailboxId}-sent`,
    folderName: 'Sent',
    conversationId,
    subject,
    bodyPreview: preview,
    direction: 'outbound',
    isRead: true,
    sentAt,
    createdAt: sentAt,
    lastModifiedAt: sentAt,
    from: {
      address: mailboxId,
      name: 'Clinic',
    },
    toRecipients: [{ address: 'patient@example.com', name: 'Patient One' }],
    replyToRecipients: [],
  };
}

function draftMessage({
  mailboxId = 'kons@hairtpclinic.com',
  conversationId,
  graphMessageId,
  subject,
  preview,
  lastModifiedAt,
}) {
  return {
    graphMessageId,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    folderType: 'drafts',
    folderId: `${mailboxId}-drafts`,
    folderName: 'Drafts',
    conversationId,
    subject,
    bodyPreview: preview,
    direction: 'draft',
    isRead: true,
    createdAt: lastModifiedAt,
    lastModifiedAt,
    from: {
      address: mailboxId,
      name: 'Clinic',
    },
    toRecipients: [{ address: 'patient@example.com', name: 'Patient One' }],
    replyToRecipients: [],
  };
}

test('runtime worklist shadow reports aggregate and conversation-level diffs against mailbox truth', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-shadow-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          conversationId: 'conv-unread-diff',
          graphMessageId: 'msg-unread',
          subject: 'Unread diff',
          preview: 'Kunden väntar på svar.',
          receivedAt: '2026-04-01T10:00:00.000Z',
          isRead: false,
        }),
        inboxMessage({
          conversationId: 'conv-review',
          graphMessageId: 'msg-review-inbound',
          subject: 'Draft pending',
          preview: 'Kan ni återkomma?',
          receivedAt: '2026-04-01T10:30:00.000Z',
          isRead: true,
        }),
        inboxMessage({
          conversationId: 'conv-later-heur',
          graphMessageId: 'msg-later-inbound',
          subject: 'Later lane',
          preview: 'Tack för uppdateringen.',
          receivedAt: '2026-04-01T08:00:00.000Z',
          isRead: true,
        }),
        inboxMessage({
          conversationId: 'conv-ownership',
          graphMessageId: 'msg-ownership',
          subject: 'Mailbox mismatch',
          preview: 'Jag behöver hjälp.',
          receivedAt: '2026-04-01T11:00:00.000Z',
          isRead: true,
        }),
        inboxMessage({
          conversationId: 'conv-truth-only',
          graphMessageId: 'msg-truth-only',
          subject: 'Truth only',
          preview: 'Ingen i legacy såg det här.',
          receivedAt: '2026-04-01T12:00:00.000Z',
          isRead: false,
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'sent',
      messages: [
        sentMessage({
          conversationId: 'conv-later-heur',
          graphMessageId: 'msg-later-sent',
          subject: 'Later lane',
          preview: 'Vi återkommer vid behov.',
          sentAt: '2026-04-01T09:00:00.000Z',
        }),
        sentMessage({
          conversationId: 'conv-draft-review',
          graphMessageId: 'msg-draft-review-sent',
          subject: 'Draft review only',
          preview: 'Senaste skickade utkastskontext.',
          sentAt: '2026-04-01T09:30:00.000Z',
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'drafts',
      messages: [
        draftMessage({
          conversationId: 'conv-review',
          graphMessageId: 'msg-review-draft',
          subject: 'Draft pending',
          preview: 'Utkast sparat.',
          lastModifiedAt: '2026-04-01T10:45:00.000Z',
        }),
        draftMessage({
          conversationId: 'conv-draft-review',
          graphMessageId: 'msg-draft-review-draft',
          subject: 'Draft review only',
          preview: 'Rent draft-only review-fall.',
          lastModifiedAt: '2026-04-01T09:45:00.000Z',
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'deleted',
      messages: [],
    });

    for (const folderType of ['inbox', 'sent', 'drafts', 'deleted']) {
      await seedFolder(ccoMailboxTruthStore, {
        mailboxId: 'contact@hairtpclinic.com',
        folderType,
        messages: [],
      });
    }

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-01T12:30:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'conv-unread-diff',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Unread diff',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-01T10:00:00.000Z',
              priorityLevel: 'Normal',
            },
            {
              conversationId: 'conv-later-heur',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Later lane',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-01T08:00:00.000Z',
              lastOutboundAt: '2026-04-01T09:00:00.000Z',
              waitingOn: 'customer',
              workflowLane: 'waiting_reply',
            },
            {
              conversationId: 'conv-ownership',
              mailboxId: 'contact@hairtpclinic.com',
              mailboxAddress: 'contact@hairtpclinic.com',
              subject: 'Mailbox mismatch',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-01T11:00:00.000Z',
            },
          ],
          needsReplyToday: [
            {
              conversationId: 'conv-review',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Draft pending',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-01T10:30:00.000Z',
            },
          ],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/shadow?mailboxIds=kons@hairtpclinic.com,contact@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.aggregate.legacyCount, 4);
      assert.equal(payload.aggregate.shadowCount, 6);
      assert.equal(payload.aggregate.bothCount, 3);
      assert.equal(payload.aggregate.legacyOnlyCount, 1);
      assert.equal(payload.aggregate.shadowOnlyCount, 3);
      assert.equal(payload.aggregate.classificationCounts.mapping_gap, 1);
      assert.equal(payload.aggregate.classificationCounts.legacy_heuristic, 2);
      assert.equal(payload.aggregate.classificationCounts.truth_shift, 3);
      assert.equal(payload.aggregate.classificationCounts.out_of_scope_draft_review, 1);
      assert.equal(payload.metadata.parityScope?.draftOnlyReview, 'out_of_scope');

      const byConversationKey = new Map(
        payload.conversationDiffs.map((item) => [item.conversationKey, item])
      );

      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-later-heur')?.classification,
        'legacy_heuristic'
      );
      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-later-heur')?.presence,
        'both'
      );

      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-truth-only')?.classification,
        'truth_shift'
      );
      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-truth-only')?.presence,
        'shadow_only'
      );
      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-draft-review')?.classification,
        'out_of_scope_draft_review'
      );
      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-draft-review')?.presence,
        'shadow_only'
      );

      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-unread-diff')?.diffs?.unread
          ?.classification,
        'truth_shift'
      );
      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-review')?.diffs?.lane?.classification,
        'match'
      );
      assert.equal(
        byConversationKey.get('contact@hairtpclinic.com:conv-ownership')?.classification,
        'mapping_gap'
      );
      assert.equal(
        byConversationKey.get('kons@hairtpclinic.com:conv-ownership')?.classification,
        'truth_shift'
      );

      assert.equal(payload.dimensionAssessment.lane.unexplained, 0);
      assert.equal(payload.dimensionAssessment.ownership.unexplained, 0);
      assert.equal(payload.dimensionAssessment.unread.unexplained, 0);
      assert.equal(payload.acceptanceGate.canConsiderCutover, false);
      assert.deepEqual(payload.acceptanceGate.blockers, ['mapping_gap_present']);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('worklist truth, consumer and shadow carry backfilled customer identity from established customer-state', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-worklist-identity-backfill-')
  );
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  const ccoCustomerStore = await createCcoCustomerStore({
    filePath: path.join(tempDir, 'cco-customer-store.json'),
  });

  try {
    await ccoCustomerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          strong_customer: {
            name: 'Strong Customer',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
          weak_customer: {
            name: 'Weak Customer',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
        },
        details: {
          strong_customer: {
            emails: ['strong@example.com'],
            phone: '',
            mailboxes: ['kons'],
          },
          weak_customer: {
            emails: ['weak@example.com'],
            phone: '',
            mailboxes: ['contact'],
          },
        },
        primaryEmailByKey: {
          strong_customer: 'strong@example.com',
          weak_customer: 'weak@example.com',
        },
        identityByKey: {
          strong_customer: {
            customerKey: 'strong_customer',
            customerName: 'Strong Customer',
            canonicalCustomerId: 'cust-strong-1',
            identitySource: 'backend',
            identityConfidence: 'strong',
            provenance: {
              source: 'backend',
              mailboxIds: ['kons@hairtpclinic.com'],
              conversationIds: ['conv-strong'],
              sourceRecordIds: ['strong_customer'],
            },
          },
          weak_customer: {
            customerKey: 'weak_customer',
            customerName: 'Weak Customer',
            customerEmail: 'weak@example.com',
            identitySource: 'derived',
            identityConfidence: 'weak',
            provenance: {
              source: 'derived',
              mailboxIds: ['contact@hairtpclinic.com'],
              conversationIds: ['conv-weak'],
              sourceRecordIds: ['weak_customer'],
            },
          },
        },
      },
    });

    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          conversationId: 'conv-strong',
          graphMessageId: 'msg-strong',
          subject: 'Strong customer',
          preview: 'Säker kundidentitet ska backfyllas.',
          receivedAt: '2026-04-02T08:00:00.000Z',
          isRead: false,
          mailboxId: 'kons@hairtpclinic.com',
          from: {
            address: 'strong@example.com',
            name: 'Strong Customer',
          },
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'contact@hairtpclinic.com',
          conversationId: 'conv-weak',
          graphMessageId: 'msg-weak',
          subject: 'Weak customer',
          preview: 'Svag identitet ska lämnas tom.',
          receivedAt: '2026-04-02T09:00:00.000Z',
          isRead: false,
          from: {
            address: 'weak@example.com',
            name: 'Weak Customer',
          },
        }),
        inboxMessage({
          mailboxId: 'contact@hairtpclinic.com',
          conversationId: 'conv-null',
          graphMessageId: 'msg-null',
          subject: 'No identity',
          preview: 'Saknar match i customer-state.',
          receivedAt: '2026-04-02T10:00:00.000Z',
          isRead: false,
          from: {
            address: 'no-match@example.com',
            name: 'No Match',
          },
        }),
      ],
    });
    for (const folderType of ['sent', 'drafts', 'deleted']) {
      await seedFolder(ccoMailboxTruthStore, {
        mailboxId: 'kons@hairtpclinic.com',
        folderType,
        messages: [],
      });
      await seedFolder(ccoMailboxTruthStore, {
        mailboxId: 'contact@hairtpclinic.com',
        folderType,
        messages: [],
      });
    }

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-02T12:00:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'conv-strong',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Strong customer',
              hasUnreadInbound: true,
              lastInboundAt: '2026-04-02T08:00:00.000Z',
            },
            {
              conversationId: 'conv-weak',
              mailboxId: 'contact@hairtpclinic.com',
              mailboxAddress: 'contact@hairtpclinic.com',
              subject: 'Weak customer',
              hasUnreadInbound: true,
              lastInboundAt: '2026-04-02T09:00:00.000Z',
            },
            {
              conversationId: 'conv-null',
              mailboxId: 'contact@hairtpclinic.com',
              mailboxAddress: 'contact@hairtpclinic.com',
              subject: 'No identity',
              hasUnreadInbound: true,
              lastInboundAt: '2026-04-02T10:00:00.000Z',
            },
          ],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoCustomerStore,
        ccoMailboxTruthStore,
        patientMasterStore: {
          async listPatients() {
            return {
              patients: [
                {
                  id: 'patient-strong-uuid',
                  displayName: 'Strong Patient',
                  primaryEmail: 'strong@example.com',
                },
                {
                  id: 'patient-dup-a',
                  displayName: 'Duplicate A',
                  primaryEmail: 'weak@example.com',
                },
                {
                  id: 'patient-dup-b',
                  displayName: 'Duplicate B',
                  emails: ['weak@example.com'],
                },
              ],
            };
          },
        },
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const truthResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/truth?mailboxIds=kons@hairtpclinic.com,contact@hairtpclinic.com&limit=20`
      );
      assert.equal(truthResponse.status, 200);
      const truthPayload = await truthResponse.json();

      const consumerResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=kons@hairtpclinic.com,contact@hairtpclinic.com&limit=20`
      );
      assert.equal(consumerResponse.status, 200);
      const consumerPayload = await consumerResponse.json();

      const shadowResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/shadow?mailboxIds=kons@hairtpclinic.com,contact@hairtpclinic.com&limit=20`
      );
      assert.equal(shadowResponse.status, 200);
      const shadowPayload = await shadowResponse.json();

      assert.equal(truthPayload.summary.identityCount, 1);
      assert.equal(consumerPayload.summary.identityCount, 1);
      assert.equal(shadowPayload.aggregate.shadowIdentityCount, 1);

      const truthRows = new Map(truthPayload.rows.map((row) => [row.conversationId, row]));
      const consumerRows = new Map(
        consumerPayload.rows.map((row) => [row.conversation?.conversationId, row])
      );

      assert.equal(
        truthRows.get('conv-strong')?.customerIdentity?.canonicalCustomerId,
        'cust-strong-1'
      );
      assert.equal(
        consumerRows.get('conv-strong')?.customerIdentity?.canonicalCustomerId,
        'patient-strong-uuid',
        'consumer-rollupen ska använda patient.id som canonical id vid exakt match'
      );
      assert.equal(
        consumerRows.get('conv-strong')?.identityProvenance?.source,
        'patient_master'
      );
      assert.equal(consumerRows.get('conv-strong')?.patientId, 'patient-strong-uuid');
      assert.equal(consumerRows.get('conv-strong')?.patientDisplayName, 'Strong Patient');
      assert.equal(consumerRows.get('conv-strong')?.patientMatch?.status, 'matched');
      assert.equal(consumerRows.get('conv-weak')?.patientId, null);
      assert.equal(consumerRows.get('conv-weak')?.patientMatch?.status, 'ambiguous');
      assert.equal(consumerRows.get('conv-null')?.patientId, null);
      assert.equal(consumerRows.get('conv-null')?.patientMatch?.status, 'unmatched');
      assert.equal(truthRows.get('conv-weak')?.customerIdentity, null);
      assert.equal(consumerRows.get('conv-weak')?.customerIdentity, null);
      assert.equal(truthRows.get('conv-null')?.customerIdentity, null);
      assert.equal(consumerRows.get('conv-null')?.customerIdentity, null);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist shadow treats legacy-only booking overlay rows as legacy heuristics instead of mapping gaps', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-shadow-booking-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'fazli@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'fazli@hairtpclinic.com',
          conversationId: 'conv-truth-both',
          graphMessageId: 'msg-truth-both',
          subject: 'Truth-backed conversation',
          preview: 'Kunden väntar på svar.',
          receivedAt: '2026-04-01T10:00:00.000Z',
          isRead: false,
        }),
      ],
    });
    for (const folderType of ['sent', 'drafts', 'deleted']) {
      await seedFolder(ccoMailboxTruthStore, {
        mailboxId: 'fazli@hairtpclinic.com',
        folderType,
        messages: [],
      });
    }

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-03T06:40:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'conv-truth-both',
              mailboxId: 'fazli@hairtpclinic.com',
              mailboxAddress: 'fazli@hairtpclinic.com',
              subject: 'Truth-backed conversation',
              hasUnreadInbound: true,
              lastInboundAt: '2026-04-01T10:00:00.000Z',
            },
            {
              conversationId: 'conv-booking-overlay',
              messageId: 'msg-booking-overlay',
              mailboxId: 'fazli@hairtpclinic.com',
              mailboxAddress: 'fazli@hairtpclinic.com',
              userPrincipalName: 'fazli@hairtpclinic.com',
              subject: 'Ny bokning (web): Mikael Kildal-Leblond, måndag 6 april 2026 10:00',
              sender: 'Hair TP Clinic',
              customerKey: 'no-reply@cliento.com',
              intent: 'booking_request',
              priorityLevel: 'Medium',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-02T22:13:48.000Z',
              lastOutboundAt: null,
              followUpSuggestedAt: null,
            },
          ],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/shadow?mailboxIds=fazli@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.aggregate.classificationCounts.mapping_gap || 0, 0);
      assert.equal(payload.aggregate.classificationCounts.legacy_heuristic, 1);
      assert.equal(payload.acceptanceGate.canConsiderCutover, true);

      const byConversationKey = new Map(
        payload.conversationDiffs.map((item) => [item.conversationKey, item])
      );
      assert.equal(
        byConversationKey.get('fazli@hairtpclinic.com:conv-booking-overlay')?.classification,
        'legacy_heuristic'
      );
      assert.equal(
        byConversationKey.get('fazli@hairtpclinic.com:conv-booking-overlay')?.presence,
        'legacy_only'
      );
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist shadow normalizes mailbox-scoped conversation keys before comparing legacy and truth rows', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-shadow-identity-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'egzona@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'egzona@hairtpclinic.com',
          conversationId: 'AAQkScopedConversation',
          graphMessageId: 'msg-egzona-1',
          subject: 'Scoped identity parity',
          preview: 'Kunden väntar på svar.',
          receivedAt: '2026-04-01T10:00:00.000Z',
          isRead: false,
        }),
      ],
    });
    for (const folderType of ['sent', 'drafts', 'deleted']) {
      await seedFolder(ccoMailboxTruthStore, {
        mailboxId: 'egzona@hairtpclinic.com',
        folderType,
        messages: [],
      });
    }

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-01T12:30:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'Egzona@hairtpclinic.com:AAQkScopedConversation',
              mailboxId: 'egzona@hairtpclinic.com',
              mailboxAddress: 'egzona@hairtpclinic.com',
              subject: 'Scoped identity parity',
              hasUnreadInbound: true,
              lastInboundAt: '2026-04-01T10:00:00.000Z',
            },
          ],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/shadow?mailboxIds=egzona@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.aggregate.legacyCount, 1);
      assert.equal(payload.aggregate.shadowCount, 1);
      assert.equal(payload.aggregate.bothCount, 1);
      assert.equal(payload.aggregate.legacyOnlyCount, 0);
      assert.equal(payload.aggregate.shadowOnlyCount, 0);
      assert.equal(payload.metadata.comparisonKey, 'canonicalMailboxConversationKey');
      assert.equal(payload.aggregate.classificationCounts.mapping_gap || 0, 0);

      const diff = payload.conversationDiffs[0];
      assert.equal(diff.presence, 'both');
      assert.equal(diff.conversationKey, 'egzona@hairtpclinic.com:AAQkScopedConversation');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist truth route exposes scoped mailbox-truth rows while keeping shadow as a guardrail', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-truth-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          conversationId: 'conv-unread-model',
          graphMessageId: 'msg-unread-model',
          subject: 'Unread model',
          preview: 'Kunden väntar fortfarande.',
          receivedAt: '2020-01-01T10:00:00.000Z',
          isRead: false,
        }),
        inboxMessage({
          conversationId: 'conv-needs-reply-model',
          graphMessageId: 'msg-needs-reply-model',
          subject: 'Needs reply model',
          preview: 'Kan ni återkomma?',
          receivedAt: '2020-01-02T10:00:00.000Z',
          isRead: true,
        }),
        inboxMessage({
          conversationId: 'conv-draft-review-model',
          graphMessageId: 'msg-draft-review-model',
          subject: 'Draft review model',
          preview: 'Vi bör läsa igenom det här.',
          receivedAt: '2020-01-03T10:00:00.000Z',
          isRead: true,
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'sent',
      messages: [
        sentMessage({
          conversationId: 'conv-needs-reply-model',
          graphMessageId: 'msg-needs-reply-sent-model',
          subject: 'Needs reply model',
          preview: 'Vi svarade tidigare.',
          sentAt: '2020-01-01T08:00:00.000Z',
        }),
        sentMessage({
          conversationId: 'conv-draft-review-model',
          graphMessageId: 'msg-draft-review-sent-model',
          subject: 'Draft review model',
          preview: 'Senaste utskick.',
          sentAt: '2020-01-04T10:00:00.000Z',
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'drafts',
      messages: [
        draftMessage({
          conversationId: 'conv-draft-review-model',
          graphMessageId: 'msg-draft-review-draft-model',
          subject: 'Draft review model',
          preview: 'Rent draft-only review-fall.',
          lastModifiedAt: '2020-01-05T10:00:00.000Z',
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'deleted',
      messages: [
        {
          ...inboxMessage({
            conversationId: 'conv-deleted-only-model',
            graphMessageId: 'msg-deleted-only-model',
            subject: 'Deleted only model',
            preview: 'Den här ska inte synas.',
            receivedAt: '2020-01-06T10:00:00.000Z',
            isRead: true,
          }),
          folderType: 'deleted',
          folderId: 'kons@hairtpclinic.com-deleted',
          folderName: 'Deleted',
          direction: 'inbound',
        },
      ],
    });

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-02T09:00:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'conv-unread-model',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Unread model',
              hasUnreadInbound: false,
              lastInboundAt: '2020-01-01T10:00:00.000Z',
              priorityLevel: 'Normal',
            },
            {
              conversationId: 'conv-needs-reply-model',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Needs reply model',
              hasUnreadInbound: false,
              lastInboundAt: '2020-01-02T10:00:00.000Z',
              lastOutboundAt: '2020-01-01T08:00:00.000Z',
              priorityLevel: 'Normal',
            },
          ],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/truth?mailboxIds=kons@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'mailbox_truth_store');
      assert.equal(payload.modelVersion, 'cco.worklist.truth.v1');
      assert.equal(payload.parityScope?.draftOnlyReview, 'out_of_scope');
      assert.deepEqual(payload.parityScope?.legacyOverlayLanes, [
        'later',
        'bookable',
        'medical',
        'admin',
        'unclear',
        'sprint',
      ]);
      assert.equal(payload.summary.rowCount, 2);
      assert.equal(payload.summary.unreadCount, 1);
      assert.equal(payload.summary.needsReplyCount, 2);
      assert.equal(payload.summary.actNowCount, 1);
      assert.equal(payload.summary.outOfScopeDraftReviewCount, 1);
      assert.deepEqual(payload.summary.laneCounts, {
        'act-now': 1,
        all: 1,
      });

      const byConversationKey = new Map(payload.rows.map((item) => [item.conversationKey, item]));

      assert.equal(byConversationKey.size, 2);
      assert.equal(byConversationKey.has('kons@hairtpclinic.com:conv-draft-review-model'), false);
      assert.equal(byConversationKey.has('kons@hairtpclinic.com:conv-deleted-only-model'), false);

      const unreadRow = byConversationKey.get('kons@hairtpclinic.com:conv-unread-model');
      assert.equal(unreadRow.hasUnreadInbound, true);
      assert.equal(unreadRow.needsReply, true);
      assert.equal(unreadRow.lane, 'act-now');
      assert.equal(unreadRow.ownershipMailbox, 'kons@hairtpclinic.com');

      const needsReplyRow = byConversationKey.get('kons@hairtpclinic.com:conv-needs-reply-model');
      assert.equal(needsReplyRow.hasUnreadInbound, false);
      assert.equal(needsReplyRow.needsReply, true);
      assert.equal(needsReplyRow.lane, 'all');

      assert.equal(
        payload.shadowGuardrail.latestAnalysisEntry.generatedAt,
        '2026-04-02T09:00:00.000Z'
      );
      assert.equal(payload.shadowGuardrail.acceptanceGate.canConsiderCutover, true);
      assert.equal(
        payload.shadowGuardrail.metadata.shadowSource,
        'mailbox truth worklist read-model'
      );
      assert.equal(payload.shadowGuardrail.metadata.parityScope?.draftOnlyReview, 'out_of_scope');
      assert.equal(
        payload.shadowGuardrail.aggregate.classificationCounts.out_of_scope_draft_review,
        1
      );
      assert.equal(payload.shadowGuardrail.aggregate.classificationCounts.mapping_gap || 0, 0);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer skips a newer empty legacy analysis entry and keeps the latest usable baseline', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-worklist-consumer-baseline-')
  );
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'egzona@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'egzona@hairtpclinic.com',
          conversationId: 'conv-baseline-preserved',
          graphMessageId: 'msg-baseline-preserved',
          subject: 'Baseline preserved',
          preview: 'Kunden väntar fortfarande.',
          receivedAt: '2026-04-01T10:00:00.000Z',
          isRead: false,
        }),
      ],
    });
    for (const folderType of ['sent', 'drafts', 'deleted']) {
      await seedFolder(ccoMailboxTruthStore, {
        mailboxId: 'egzona@hairtpclinic.com',
        folderType,
        messages: [],
      });
    }

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      capabilityVersion: '2.0.0',
      output: {
        data: {
          generatedAt: '2026-04-02T19:07:59.244Z',
          conversationWorklist: [
            {
              conversationId: 'egzona@hairtpclinic.com:conv-baseline-preserved',
              mailboxId: 'egzona@hairtpclinic.com',
              mailboxAddress: 'egzona@hairtpclinic.com',
              subject: 'Baseline preserved',
              hasUnreadInbound: true,
              lastInboundAt: '2026-04-01T10:00:00.000Z',
            },
          ],
          needsReplyToday: [],
        },
      },
      metadata: {
        source: 'worklist_shadow_real_data_verification',
      },
    });

    const wrappedLiveEntry = await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      capabilityVersion: '2.0.0',
      output: {
        data: {
          data: {
            generatedAt: '2026-04-02T20:07:59.244Z',
            conversationWorklist: [
              {
                conversationId: 'egzona@hairtpclinic.com:conv-baseline-preserved',
                mailboxId: 'egzona@hairtpclinic.com',
                mailboxAddress: 'egzona@hairtpclinic.com',
                subject: 'Baseline preserved',
                hasUnreadInbound: true,
                lastInboundAt: '2026-04-01T10:00:00.000Z',
              },
            ],
            needsReplyToday: [],
          },
          metadata: {
            source: 'wrapped_live_baseline',
          },
          warnings: [],
        },
      },
      metadata: {
        source: 'wrapped_live_baseline',
      },
    });

    const emptyEntry = await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      capabilityVersion: '1.0.0',
      output: {
        data: {
          generatedAt: '2026-04-02T20:41:02.053Z',
          conversationWorklist: [],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=egzona@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.summary.rowCount, 1);
      assert.deepEqual(payload.parityBaseline.comparableMailboxIds, []);
      assert.deepEqual(payload.parityBaseline.notComparableMailboxIds, ['egzona@hairtpclinic.com']);
      assert.equal(payload.shadowGuardrail, null);
      assert.equal(payload.readiness.canStartLimitedConsumerExposure, false);
      assert.equal(wrappedLiveEntry.id.length > 0, true);
      assert.equal(emptyEntry.id.length > 0, true);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer route exposes limited truth-driven rows while keeping legacy parity separate', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-consumer-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'kons@hairtpclinic.com',
          conversationId: 'conv-kons-consumer',
          graphMessageId: 'msg-kons-consumer',
          subject: 'Kons consumer row',
          preview: 'Hej, jag väntar på svar.',
          receivedAt: '2026-04-01T10:00:00.000Z',
          isRead: false,
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'marknad@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'marknad@hairtpclinic.com',
          conversationId: 'conv-marknad-consumer',
          graphMessageId: 'msg-marknad-consumer',
          subject: 'Marknad consumer row',
          preview: 'Hej från marknad.',
          receivedAt: '2026-04-01T11:00:00.000Z',
          isRead: false,
        }),
      ],
    });

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-02T09:00:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'conv-kons-consumer',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Kons consumer row',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-01T10:00:00.000Z',
              priorityLevel: 'Normal',
              intent: 'booking_request',
              intentConfidence: 0.84,
              followUpSuggested: true,
            },
          ],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=kons@hairtpclinic.com,marknad@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'mailbox_truth_worklist_consumer');
      assert.equal(payload.modelVersion, 'cco.worklist.consumer.v1');
      assert.equal(payload.consumerExposure.mode, 'limited');
      assert.equal(payload.consumerExposure.legacyUiDriving, true);
      assert.equal(payload.consumerExposure.cutoverState, 'not_allowed');
      assert.equal(payload.consumerExposure.shadowGuardrail, 'readout_only');
      assert.equal(payload.enrichment.rowCount, 1);
      assert.equal(payload.enrichment.conversationWorklist[0].intent, 'booking_request');
      assert.equal(payload.enrichment.conversationWorklist[0].intentConfidence, 0.84);
      assert.equal(payload.enrichment.conversationWorklist[0].followUpSuggested, true);

      assert.equal(payload.readiness.canStartLimitedConsumerExposure, false);
      assert.equal(payload.readiness.canConsiderCutover, false);

      assert.deepEqual(payload.parityBaseline.comparableMailboxIds, []);
      assert.deepEqual(payload.parityBaseline.notComparableMailboxIds, [
        'kons@hairtpclinic.com',
        'marknad@hairtpclinic.com',
      ]);

      const parityByMailbox = new Map(
        payload.parityBaseline.mailboxAssessment.map((item) => [item.mailboxId, item])
      );
      assert.equal(
        parityByMailbox.get('kons@hairtpclinic.com')?.parityStatus,
        'not_comparable_no_data'
      );
      assert.equal(
        parityByMailbox.get('marknad@hairtpclinic.com')?.parityStatus,
        'not_comparable_no_data'
      );

      assert.equal(payload.summary.rowCount, 2);
      const byId = new Map(payload.rows.map((item) => [item.id, item]));
      assert.equal(byId.size, 2);

      const konsRow = byId.get('kons@hairtpclinic.com:conv-kons-consumer');
      assert.equal(konsRow.mailbox.mailboxId, 'kons@hairtpclinic.com');
      assert.equal(konsRow.mailbox.ownershipMailbox, 'kons@hairtpclinic.com');
      assert.equal(konsRow.state.hasUnreadInbound, true);
      assert.equal(konsRow.state.needsReply, true);
      assert.equal(konsRow.provenance.source, 'mailbox_truth_store');
      assert.equal(konsRow.provenance.parityScope, 'in_scope');

      const marknadRow = byId.get('marknad@hairtpclinic.com:conv-marknad-consumer');
      assert.equal(marknadRow.mailbox.mailboxId, 'marknad@hairtpclinic.com');
      assert.equal(marknadRow.state.hasUnreadInbound, true);
      assert.equal(marknadRow.state.needsReply, true);

      assert.equal(payload.shadowGuardrail, null);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer preloads sharded mailbox truth before building rows', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-consumer-sharded-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const shardDir = path.join(tempDir, 'truth-shards');
  const writerStore = await createCcoMailboxTruthShardedStore({
    baseDir: shardDir,
    legacyFilePath: path.join(tempDir, 'missing-legacy-truth.json'),
    lazyPreload: true,
  });

  try {
    await seedFolder(writerStore, {
      mailboxId: 'contact@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'contact@hairtpclinic.com',
          conversationId: 'conv-cold-shard',
          graphMessageId: 'msg-cold-shard',
          subject: 'Kall shard ska synas',
          preview: 'Det här mailet finns på disk men sharden är kall.',
          receivedAt: '2026-04-03T10:00:00.000Z',
          isRead: false,
        }),
      ],
    });

    const ccoMailboxTruthStore = await createCcoMailboxTruthShardedStore({
      baseDir: shardDir,
      legacyFilePath: path.join(tempDir, 'missing-legacy-truth.json'),
      lazyPreload: true,
    });
    assert.equal(
      ccoMailboxTruthStore.listMessages({
        mailboxIds: ['contact@hairtpclinic.com'],
        folderTypes: ['inbox'],
      }).length,
      0,
      'sanity: en ny lazy sharded store startar utan laddade mailboxar'
    );

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer?mailboxIds=contact@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.ok, true);
      assert.equal(payload.summary.rowCount, 1);
      assert.equal(payload.rows[0].conversation.conversationId, 'conv-cold-shard');
      assert.equal(payload.rows[0].mailbox.mailboxId, 'contact@hairtpclinic.com');
      assert.equal(payload.rows[0].state.needsReply, true);
      assert.deepEqual(ccoMailboxTruthStore.listLoadedMailboxes(), ['contact@hairtpclinic.com']);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer does not cache an empty cold response over later mailbox truth', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-worklist-consumer-empty-cache-')
  );
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });
  const mailboxId = 'contact@hairtpclinic.com';
  const consumerPath = `/api/v1/cco/runtime/worklist/consumer?mailboxIds=${encodeURIComponent(mailboxId)}&limit=37`;

  try {
    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const emptyResponse = await fetch(`${baseUrl}${consumerPath}`);
      assert.equal(emptyResponse.status, 200);
      assert.equal(emptyResponse.headers.get('x-cco-worklist-cache'), 'miss');
      const emptyPayload = await emptyResponse.json();
      assert.equal(emptyPayload.summary.rowCount, 0);
      assert.equal(emptyPayload.rows.length, 0);

      await seedFolder(ccoMailboxTruthStore, {
        mailboxId,
        folderType: 'inbox',
        messages: [
          inboxMessage({
            mailboxId,
            conversationId: 'conv-c11-cache-live',
            graphMessageId: 'msg-c11-cache-live',
            subject: 'Tom cache får inte dölja live-mail',
            preview: 'Det här ska synas på andra anropet.',
            receivedAt: '2026-04-04T10:00:00.000Z',
            isRead: false,
          }),
        ],
      });

      const liveResponse = await fetch(`${baseUrl}${consumerPath}`);
      assert.equal(liveResponse.status, 200);
      assert.equal(liveResponse.headers.get('x-cco-worklist-cache'), 'miss');
      const livePayload = await liveResponse.json();
      assert.equal(livePayload.summary.rowCount, 1);
      assert.equal(livePayload.rows[0].conversation.conversationId, 'conv-c11-cache-live');

      const cachedLiveResponse = await fetch(`${baseUrl}${consumerPath}`);
      assert.equal(cachedLiveResponse.status, 200);
      assert.equal(cachedLiveResponse.headers.get('x-cco-worklist-cache'), 'hit');
      const cachedLivePayload = await cachedLiveResponse.json();
      assert.equal(cachedLivePayload.summary.rowCount, 1);
      assert.equal(cachedLivePayload.rows[0].conversation.conversationId, 'conv-c11-cache-live');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime worklist consumer readout exposes an internal preview surface without presenting itself as the primary queue', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-worklist-consumer-readout-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'analysis.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'kons@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'kons@hairtpclinic.com',
          conversationId: 'conv-kons-readout',
          graphMessageId: 'msg-kons-readout',
          subject: 'Kons readout row',
          preview: 'Det här är en truth-rad i previewn.',
          receivedAt: '2026-04-01T10:00:00.000Z',
          isRead: false,
        }),
      ],
    });
    await seedFolder(ccoMailboxTruthStore, {
      mailboxId: 'marknad@hairtpclinic.com',
      folderType: 'inbox',
      messages: [
        inboxMessage({
          mailboxId: 'marknad@hairtpclinic.com',
          conversationId: 'conv-marknad-readout',
          graphMessageId: 'msg-marknad-readout',
          subject: 'Marknad readout row',
          preview: 'Det här är inte jämförbart ännu.',
          receivedAt: '2026-04-01T11:00:00.000Z',
          isRead: false,
        }),
      ],
    });

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.InboxAnalysis',
      output: {
        data: {
          generatedAt: '2026-04-02T09:00:00.000Z',
          conversationWorklist: [
            {
              conversationId: 'conv-kons-readout',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              subject: 'Kons readout row',
              hasUnreadInbound: false,
              lastInboundAt: '2026-04-01T10:00:00.000Z',
              priorityLevel: 'Normal',
            },
          ],
          needsReplyToday: [],
        },
      },
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        capabilityAnalysisStore,
        ccoMailboxTruthStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/worklist/consumer/readout?mailboxIds=kons@hairtpclinic.com,marknad@hairtpclinic.com&limit=20`
      );
      assert.equal(response.status, 200);
      const html = await response.text();

      assert.equal(html.includes('CCO worklist consumer preview'), true);
      assert.equal(html.includes('Detta är inte primär operativ arbetskö'), true);
      assert.equal(html.includes('Legacy-worklisten fortsätter vara styrande.'), true);
      assert.equal(
        html.includes(
          '/api/v1/cco/runtime/worklist/consumer?mailboxIds=kons%40hairtpclinic.com%2Cmarknad%40hairtpclinic.com&amp;limit=20'
        ),
        true
      );
      assert.equal(html.includes('Comparable mailboxar: kons@hairtpclinic.com'), true);
      assert.equal(html.includes('Not comparable yet: marknad@hairtpclinic.com'), true);
      assert.equal(html.includes('not_comparable_no_legacy_baseline'), true);
      assert.equal(html.includes('Mapping gap'), true);
      assert.equal(html.includes('Truth-rad'), true);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
