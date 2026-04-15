const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createCapabilitiesRouter } = require('../../src/routes/capabilities');
const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');
const { createAuthStore } = require('../../src/security/authStore');
const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');
const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
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

function buildRecentIso({ daysAgo = 0, hours = 0, minutes = 0 } = {}) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(daysAgo || 0));
  date.setUTCHours(Number(hours || 0), Number(minutes || 0), 0, 0);
  return date.toISOString();
}

const HISTORY_TEST_TIMESTAMPS = Object.freeze({
  inbound: buildRecentIso({ daysAgo: 6, hours: 9, minutes: 0 }),
  outbound: buildRecentIso({ daysAgo: 5, hours: 9, minutes: 30 }),
  outboundCreated: buildRecentIso({ daysAgo: 5, hours: 9, minutes: 25 }),
  secondaryInbound: buildRecentIso({ daysAgo: 7, hours: 8, minutes: 0 }),
});

function createHistorySnapshot(mailboxId = 'kons@hairtpclinic.com') {
  return {
    conversations: [
      {
        conversationId: `conv-1-${mailboxId}`,
        subject: `PRP uppföljning ${mailboxId}`,
        customerEmail: 'patient@example.com',
        mailboxId,
        mailboxAddress: mailboxId,
        userPrincipalName: mailboxId,
        messages: [
          {
            messageId: `msg-1-${mailboxId}`,
            sentAt: HISTORY_TEST_TIMESTAMPS.inbound,
            direction: 'inbound',
            bodyPreview: 'Hej, jag vill boka om.',
            senderEmail: 'patient@example.com',
            senderName: 'Patient One',
            recipients: [mailboxId],
            replyToRecipients: [],
          },
          {
            messageId: `msg-2-${mailboxId}`,
            sentAt: HISTORY_TEST_TIMESTAMPS.outbound,
            direction: 'outbound',
            bodyPreview: 'Vi kan erbjuda fredag.',
            senderEmail: mailboxId,
            senderName: mailboxId.split('@')[0],
            recipients: ['patient@example.com'],
            replyToRecipients: [],
          },
        ],
      },
      {
        conversationId: `conv-2-${mailboxId}`,
        subject: 'Annan kund',
        customerEmail: 'other@example.com',
        mailboxId,
        mailboxAddress: mailboxId,
        userPrincipalName: mailboxId,
        messages: [
          {
            messageId: `msg-3-${mailboxId}`,
            sentAt: HISTORY_TEST_TIMESTAMPS.secondaryInbound,
            direction: 'inbound',
            bodyPreview: 'Annan historik.',
            senderEmail: 'other@example.com',
            senderName: 'Patient Two',
            recipients: [mailboxId],
            replyToRecipients: [],
          },
        ],
      },
    ],
  };
}

function createMailboxTruthPage(mailboxId = 'kons@hairtpclinic.com', folderType = 'inbox') {
  const baseAccount = {
    graphUserId: `graph-${mailboxId}`,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
  };
  const folderId = `${folderType}-${mailboxId}`;
  if (folderType === 'drafts' || folderType === 'deleted') {
    return {
      account: baseAccount,
      folder: {
        folderType,
        folderId,
        folderName: folderType,
        wellKnownName: folderType,
        fetchStatus: 'success',
        totalItemCount: 0,
        unreadItemCount: 0,
        messageCollectionCount: 0,
      },
      page: {
        fetchedMessageCount: 0,
        nextPageUrl: null,
        pageSize: 500,
        complete: true,
        sourcePageUrl: `mock://${mailboxId}/${folderType}`,
      },
      messages: [],
    };
  }

  const inbound = folderType === 'inbox';
  return {
    account: baseAccount,
    folder: {
      folderType,
      folderId,
      folderName: folderType,
      wellKnownName: folderType,
      fetchStatus: 'success',
      totalItemCount: 1,
      unreadItemCount: inbound ? 1 : 0,
      messageCollectionCount: 1,
    },
    page: {
      fetchedMessageCount: 1,
      nextPageUrl: null,
      pageSize: 500,
      complete: true,
      sourcePageUrl: `mock://${mailboxId}/${folderType}`,
    },
    messages: [
      {
        graphMessageId: `${folderType}-msg-${mailboxId}`,
        mailboxId,
        mailboxAddress: mailboxId,
        userPrincipalName: mailboxId,
        folderId,
        folderName: folderType,
        folderType,
        wellKnownName: folderType,
        conversationId: `conv-${mailboxId}`,
        internetMessageId: `<${folderType}-${mailboxId}@example.com>`,
        subject: inbound ? `Patientfråga ${mailboxId}` : `Svar ${mailboxId}`,
        bodyPreview: inbound ? 'Hej, jag vill boka om.' : 'Vi kan erbjuda fredag.',
        direction: inbound ? 'inbound' : 'outbound',
        isRead: inbound ? false : true,
        hasAttachments: false,
        receivedAt: inbound ? HISTORY_TEST_TIMESTAMPS.inbound : null,
        sentAt: inbound ? null : HISTORY_TEST_TIMESTAMPS.outbound,
        createdAt: inbound
          ? HISTORY_TEST_TIMESTAMPS.inbound
          : HISTORY_TEST_TIMESTAMPS.outboundCreated,
        lastModifiedAt: inbound ? HISTORY_TEST_TIMESTAMPS.inbound : HISTORY_TEST_TIMESTAMPS.outbound,
        from: {
          address: inbound ? 'patient@example.com' : mailboxId,
          name: inbound ? 'Patient One' : mailboxId.split('@')[0],
        },
        toRecipients: [
          {
            address: inbound ? mailboxId : 'patient@example.com',
            name: inbound ? mailboxId.split('@')[0] : 'Patient One',
          },
        ],
        replyToRecipients: [],
      },
    ],
  };
}

function createMailboxTruthConnector() {
  return {
    async fetchMailboxTruthFolderPage(options = {}) {
      return createMailboxTruthPage(options.mailboxId, options.folderType);
    },
  };
}

test('runtime history route backfillar flera mailboxar en gång och läser sedan lokalt', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });

  try {
    let graphCalls = 0;
    const graphReadConnector = {
      async fetchInboxSnapshot(options = {}) {
        graphCalls += 1;
        assert.equal(Array.isArray(options.mailboxIds), true);
        assert.equal(options.mailboxIds.length, 1);
        return createHistorySnapshot(options.mailboxIds[0]);
      },
    };

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        graphReadConnector,
      })
    );

    await withServer(app, async (baseUrl) => {
      const first = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&customerEmail=patient@example.com&lookbackDays=30`
      );
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.ok, true);
      assert.equal(firstPayload.messages.length, 4);
      assert.equal(firstPayload.messages[0].mailDocument?.kind, 'mail_document');
      assert.equal(firstPayload.messages[0].mailThreadMessage?.kind, 'mail_thread_message');
      assert.equal(firstPayload.threadDocument?.kind, 'mail_thread_document');
      assert.ok(firstPayload.messages[0].mailDocument?.primaryBodyText);
      assert.equal(firstPayload.summary.mailboxCount, 2);
      assert.deepEqual(firstPayload.mailboxIds, ['kons@hairtpclinic.com', 'info@hairtpclinic.com']);
      assert.equal(firstPayload.backfilledWindowCount, 2);
      assert.equal(firstPayload.store.mailboxes.length, 2);
      assert.equal(firstPayload.store.mailboxes[0].mailbox.messageCount, 3);
      assert.equal(firstPayload.store.mailboxes[1].mailbox.messageCount, 3);
      assert.equal(graphCalls, 2);

      const second = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&customerEmail=patient@example.com&lookbackDays=30`
      );
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.ok, true);
      assert.equal(secondPayload.messages.length, 4);
      assert.equal(secondPayload.backfilledWindowCount, 0);
      assert.equal(secondPayload.store.mailboxes.length, 2);
      assert.equal(graphCalls, 2);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history backfill with refresh=true reruns mailbox truth fetch even when coverage is already complete', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-refresh-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    let graphCalls = 0;
    const graphReadConnector = {
      async fetchMailboxTruthFolderPage(options = {}) {
        graphCalls += 1;
        return createMailboxTruthPage(options.mailboxId, options.folderType);
      },
    };

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoMailboxTruthStore,
        graphReadConnector,
      })
    );

    await withServer(app, async (baseUrl) => {
      const firstResponse = await fetch(`${baseUrl}/api/v1/cco/runtime/history/backfill`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mailboxId: 'kons@hairtpclinic.com',
          lookbackDays: 90,
        }),
      });
      assert.equal(firstResponse.status, 200);
      const firstPayload = await firstResponse.json();
      assert.equal(firstPayload.ok, true);
      assert.equal(firstPayload.backfilledFolderCount, 4);
      assert.equal(graphCalls, 4);

      const refreshResponse = await fetch(`${baseUrl}/api/v1/cco/runtime/history/backfill`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mailboxId: 'kons@hairtpclinic.com',
          lookbackDays: 90,
          refresh: true,
        }),
      });
      assert.equal(refreshResponse.status, 200);
      const refreshPayload = await refreshResponse.json();
      assert.equal(refreshPayload.ok, true);
      assert.equal(refreshPayload.source, 'mailbox_truth_store');
      assert.equal(graphCalls, 8);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history status, backfill and read route use mailbox truth store as the primary history source', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-truth-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await ccoHistoryStore.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: '2026-03-01T00:00:00.000Z',
      windowEndIso: '2026-03-31T00:00:00.000Z',
      messages: [
        {
          messageId: 'legacy-msg-1',
          conversationId: 'legacy-conv-1',
          subject: 'Legacy historik ska inte vinna',
          customerEmail: 'legacy@example.com',
          sentAt: '2026-03-05T10:00:00.000Z',
          direction: 'inbound',
          bodyPreview: 'Legacy historik.',
          senderEmail: 'legacy@example.com',
          recipients: ['kons@hairtpclinic.com'],
        },
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        ccoMailboxTruthStore,
        graphReadConnector: createMailboxTruthConnector(),
      })
    );

    await withServer(app, async (baseUrl) => {
      const initialStatusResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history/status?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&lookbackDays=90`
      );
      assert.equal(initialStatusResponse.status, 200);
      const initialStatusPayload = await initialStatusResponse.json();
      assert.equal(initialStatusPayload.source, 'mailbox_truth_store');
      assert.equal(initialStatusPayload.coverage.complete, false);

      const backfillResponse = await fetch(`${baseUrl}/api/v1/cco/runtime/history/backfill`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
          lookbackDays: 90,
        }),
      });
      assert.equal(backfillResponse.status, 200);
      const backfillPayload = await backfillResponse.json();
      assert.equal(backfillPayload.source, 'mailbox_truth_store');
      assert.equal(backfillPayload.backfilledFolderCount, 8);
      assert.equal(backfillPayload.missingWindowCount, 0);

      const refreshResponse = await fetch(`${baseUrl}/api/v1/cco/runtime/history/backfill`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
          lookbackDays: 90,
          refresh: true,
        }),
      });
      assert.equal(refreshResponse.status, 200);
      const refreshPayload = await refreshResponse.json();
      assert.equal(refreshPayload.ok, true);
      assert.equal(refreshPayload.source, 'mailbox_truth_store');

      const statusResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history/status?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&lookbackDays=90`
      );
      assert.equal(statusResponse.status, 200);
      const statusPayload = await statusResponse.json();
      assert.equal(statusPayload.source, 'mailbox_truth_store');
      assert.equal(statusPayload.coverage.complete, true);
      assert.equal(statusPayload.mailbox.messageCount, 2);

      const historyResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&customerEmail=patient@example.com&lookbackDays=30`
      );
      assert.equal(historyResponse.status, 200);
      const historyPayload = await historyResponse.json();
      assert.equal(historyPayload.ok, true);
      assert.equal(historyPayload.source, 'mailbox_truth_store');
      assert.equal(historyPayload.messages.length, 4);
      assert.equal(historyPayload.messages[0].mailDocument?.kind, 'mail_document');
      assert.equal(historyPayload.messages[0].mailThreadMessage?.kind, 'mail_thread_message');
      assert.equal(historyPayload.messages[0].mailDocument?.sourceStore, 'mailbox_truth_store');
      assert.equal(historyPayload.threadDocument?.kind, 'mail_thread_document');
      assert.equal(historyPayload.events.length, 4);
      assert.equal(
        historyPayload.messages.some((message) => message.subject.includes('Legacy historik')),
        false
      );
      assert.equal(historyPayload.store.source, 'mailbox_truth_store');
      assert.equal(historyPayload.store.missingWindowCount, 0);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history backfill route persistar full mailboxhistorik i store', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-backfill-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });

  try {
    let graphCalls = 0;
    const graphReadConnector = {
      async fetchInboxSnapshot() {
        graphCalls += 1;
        return createHistorySnapshot();
      },
    };

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        graphReadConnector,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/runtime/history/backfill`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mailboxId: 'kons@hairtpclinic.com',
          lookbackDays: 30,
        }),
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.backfilledWindowCount, 1);
      assert.equal(payload.mailbox.messageCount, 3);
      assert.equal(graphCalls, 1);
    });

    const storedMessages = await ccoHistoryStore.listMailboxMessages({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
    });
    assert.equal(storedMessages.length, 3);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history status route visar coverage och senaste schedulerstatus', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-status-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });

  try {
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const startIso = new Date(nowMs - 30 * dayMs).toISOString();
    const endIso = new Date(nowMs).toISOString();
    await ccoHistoryStore.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: startIso,
      windowEndIso: endIso,
      source: 'test_seed',
      messages: [
        {
          messageId: 'msg-status-1',
          conversationId: 'conv-status-1',
          subject: 'Historikstatus',
          customerEmail: 'patient@example.com',
          sentAt: new Date(nowMs - 7 * dayMs).toISOString(),
          direction: 'inbound',
          bodyPreview: 'Historik i store.',
          senderEmail: 'patient@example.com',
          senderName: 'Patient One',
          recipients: ['kons@hairtpclinic.com'],
          replyToRecipients: [],
        },
      ],
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        scheduler: {
          getStatus() {
            return {
              enabled: true,
              started: true,
              jobs: [
                {
                  id: 'cco_history_sync',
                  name: 'CCO kons history sync',
                  enabled: true,
                  running: false,
                  lastRunAt: '2026-03-25T10:00:00.000Z',
                  lastSuccessAt: '2026-03-25T10:00:03.000Z',
                  lastStatus: 'success',
                  lastError: null,
                  nextRunAt: '2026-03-25T16:00:00.000Z',
                  lastResult: {
                    mailboxId: 'kons@hairtpclinic.com',
                    missingWindowCount: 2,
                  },
                },
              ],
            };
          },
        },
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history/status?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&lookbackDays=90`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.mailboxId, 'kons@hairtpclinic.com');
      assert.deepEqual(payload.mailboxIds, ['kons@hairtpclinic.com', 'info@hairtpclinic.com']);
      assert.equal(payload.lookbackDays, 90);
      assert.equal(payload.mailbox.messageCount, 1);
      assert.equal(payload.mailboxes.length, 2);
      assert.equal(payload.coverage.missingWindowCount, 2);
      assert.equal(payload.coverage.complete, false);
      assert.equal(payload.scheduler.job.id, 'cco_history_sync');
      assert.equal(payload.scheduler.job.lastStatus, 'success');
      assert.equal(payload.scheduler.job.lastResult.mailboxId, 'kons@hairtpclinic.com');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime calibration summary route visar preferred mode och negativa utfallsmönster', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-calibration-summary-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });

  try {
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-calibration-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      recordedAt: '2026-03-20T08:00:00.000Z',
      selectedMode: 'warm',
      dominantRisk: 'follow_up',
      recommendedAction: 'Upprepa två tydliga tider direkt.',
      intent: 'reschedule',
    });
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-calibration-2',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'booked',
      recordedAt: '2026-03-21T08:00:00.000Z',
      selectedMode: 'warm',
      dominantRisk: 'follow_up',
      recommendedAction: 'Upprepa två tydliga tider direkt.',
      intent: 'reschedule',
    });
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-calibration-3',
      mailboxId: 'info@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'no_response',
      recordedAt: '2026-03-22T08:00:00.000Z',
      selectedMode: 'short',
      dominantRisk: 'relationship',
      intent: 'reschedule',
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/calibration/summary?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&customerEmail=patient@example.com&lookbackDays=365&intent=reschedule`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.summary.totalOutcomeCount, 3);
      assert.equal(payload.summary.preferredMode, 'warm');
      assert.equal(payload.summary.preferredAction, 'Upprepa två tydliga tider direkt.');
      assert.equal(payload.summary.dominantFailureOutcome, 'no_response');
      assert.equal(payload.summary.dominantFailureRisk, 'relationship');
      assert.equal(payload.summary.actionSummaryByIntent[0]?.intent, 'reschedule');
      assert.equal(payload.summary.modeSummaryByIntent[0]?.best?.key, 'warm');
      assert.equal(payload.summary.mailboxComparisonSummary.length, 2);
      assert.equal(payload.intent, 'reschedule');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history search route returnerar store-baserad multi-mailbox-historik och calibration readout html', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-search-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });

  try {
    await ccoHistoryStore.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: '2026-03-01T00:00:00.000Z',
      windowEndIso: '2026-03-31T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-search-1',
          conversationId: 'conv-search-1',
          subject: 'PRP uppföljning',
          customerEmail: 'patient+vip@example.com',
          sentAt: '2026-03-11T10:00:00.000Z',
          direction: 'inbound',
          bodyPreview: 'Hej, jag vill boka om min tid.',
          senderEmail: 'patient+vip@example.com',
          recipients: ['kons@hairtpclinic.com'],
          internetMessageId: '<search-message@example.com>',
        },
      ],
    });
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-search-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      recordedAt: '2026-03-12T08:00:00.000Z',
      selectedMode: 'warm',
      recommendedAction: 'Upprepa två tydliga tider direkt.',
      intent: 'reschedule',
    });
    await ccoHistoryStore.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'conv-search-1',
      mailboxId: 'info@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'reply_sent',
      actionLabel: 'Svar skickat',
      subject: 'PRP uppföljning',
      recordedAt: '2026-03-12T09:00:00.000Z',
      nextActionLabel: 'Invänta kundens svar',
      nextActionSummary: 'Vänta på kundens bekräftelse och följ upp vid behov.',
      intent: 'reschedule',
    });
    await ccoHistoryStore.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'conv-search-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      subject: 'PRP uppföljning',
      recordedAt: '2026-03-12T09:45:00.000Z',
      nextActionLabel: 'Återuppta tråden',
      nextActionSummary: 'Kunden svarade och tråden bör öppnas igen.',
      intent: 'reschedule',
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
      })
    );

    await withServer(app, async (baseUrl) => {
      const searchResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history/search?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&customerEmail=patient@example.com&q=PRP&lookbackDays=365&intent=reschedule&resultTypes=action&actionTypes=customer_replied`
      );
      assert.equal(searchResponse.status, 200);
      const searchPayload = await searchResponse.json();
      assert.equal(searchPayload.ok, true);
      assert.equal(searchPayload.resultCount, 1);
      assert.deepEqual(
        searchPayload.results.map((item) => item.resultType),
        ['action']
      );
      assert.deepEqual(searchPayload.actionTypes, ['customer_replied']);
      assert.equal(searchPayload.results[0]?.actionType, 'customer_replied');
      assert.equal(searchPayload.results[0]?.nextActionLabel, 'Återuppta tråden');
      assert.equal(searchPayload.intent, 'reschedule');
      assert.deepEqual(searchPayload.resultTypes, ['action']);

      const readoutResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/calibration/readout?mailboxIds=kons@hairtpclinic.com,info@hairtpclinic.com&customerEmail=patient@example.com&lookbackDays=365&q=PRP&intent=reschedule&resultTypes=action&actionTypes=customer_replied`
      );
      assert.equal(readoutResponse.status, 200);
      const readoutHtml = await readoutResponse.text();
      assert.match(readoutHtml, /CCO kons-readout/);
      assert.match(readoutHtml, /Historiksök/);
      assert.match(readoutHtml, /Bästa mode/);
      assert.match(readoutHtml, /Bästa\/sämsta action per intent/);
      assert.match(readoutHtml, /Vanligaste failure patterns/);
      assert.match(readoutHtml, /Det som fungerar bäst/);
      assert.match(readoutHtml, /Öppna i CCO Next/);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history search uses mailbox truth store for explicit message-only searches', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-truth-search-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await ccoMailboxTruthStore.recordFolderPage({
      account: {
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        userPrincipalName: 'kons@hairtpclinic.com',
      },
      folder: {
        folderType: 'inbox',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        wellKnownName: 'inbox',
        totalItemCount: 1,
        unreadItemCount: 1,
        messageCollectionCount: 1,
      },
      messages: [
        {
          graphMessageId: 'truth-search-1',
          mailboxId: 'kons@hairtpclinic.com',
          mailboxAddress: 'kons@hairtpclinic.com',
          userPrincipalName: 'kons@hairtpclinic.com',
          folderType: 'inbox',
          folderId: 'folder-inbox',
          folderName: 'Inbox',
          conversationId: 'conv-truth-search-1',
          subject: 'PRP uppföljning',
          bodyPreview: 'Hej, jag vill boka om min tid.',
          direction: 'inbound',
          isRead: false,
          receivedAt: '2026-04-09T10:00:00.000Z',
          from: {
            address: 'patient@example.com',
            name: 'Patient One',
          },
          toRecipients: [{ address: 'kons@hairtpclinic.com', name: 'Kons' }],
          replyToRecipients: [],
        },
      ],
      complete: true,
    });
    await ccoHistoryStore.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'legacy-search-conv',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      recordedAt: '2026-03-12T09:45:00.000Z',
      subject: 'Legacy action',
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        ccoMailboxTruthStore,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history/search?mailboxIds=kons@hairtpclinic.com&customerEmail=patient@example.com&q=PRP&lookbackDays=365&resultTypes=message`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'mailbox_truth_store');
      assert.equal(payload.resultCount, 1);
      assert.equal(payload.results[0]?.resultType, 'message');
      assert.equal(payload.results[0]?.subject, 'PRP uppföljning');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history route repairs cid bodyHtml from mailbox truth store before returning messages', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-truth-inline-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await ccoMailboxTruthStore.recordFolderPage({
      account: {
        mailboxId: 'contact@hairtpclinic.com',
        mailboxAddress: 'contact@hairtpclinic.com',
        userPrincipalName: 'contact@hairtpclinic.com',
      },
      folder: {
        folderType: 'inbox',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        wellKnownName: 'inbox',
        totalItemCount: 1,
        unreadItemCount: 1,
        messageCollectionCount: 1,
      },
      messages: [
        {
          graphMessageId: 'truth-inline-1',
          mailboxId: 'contact@hairtpclinic.com',
          mailboxAddress: 'contact@hairtpclinic.com',
          userPrincipalName: 'contact@hairtpclinic.com',
          folderType: 'inbox',
          folderId: 'folder-inbox',
          folderName: 'Inbox',
          conversationId: 'conv-truth-inline-1',
          subject: 'Ralph Hultman',
          bodyPreview: 'Här kommer signaturen.',
          bodyHtml:
            '<div><p>Hej</p><img src="cid:image001.png@abc" alt="Hair TP Clinic" /></div>',
          direction: 'inbound',
          isRead: false,
          receivedAt: '2026-04-09T10:00:00.000Z',
          from: {
            address: 'ralph@example.com',
            name: 'Ralph Hultman',
          },
          toRecipients: [{ address: 'contact@hairtpclinic.com', name: 'Contact' }],
          replyToRecipients: [],
        },
      ],
      complete: true,
    });

    let assetCalls = 0;
    let mimeCalls = 0;
    const graphReadConnector = {
      async fetchMailboxTruthFolderPage() {
        throw new Error('not used in this test');
      },
      async enrichStoredMessagesWithMailAssets({ messages = [] } = {}) {
        assetCalls += 1;
        return messages.map((message) => ({
          ...message,
          attachments: [
            {
              id: 'att-inline-1',
              name: 'logo.png',
              contentType: 'image/png',
              contentId: 'image001.png@abc',
              isInline: true,
              size: 1280,
              contentBytesAvailable: true,
              sourceType: 'graph_file_attachment',
            },
          ],
          bodyHtml: String(message.bodyHtml || '').replace(
            'cid:image001.png@abc',
            'data:image/png;base64,YWJjMTIz'
          ),
        }));
      },
      async fetchMessageMimeContent() {
        mimeCalls += 1;
        return {
          rawMime: [
            'MIME-Version: 1.0',
            'Content-Type: multipart/related; boundary="abc"',
            '',
            '--abc',
            'Content-Type: text/html; charset=utf-8',
            '',
            '<html><body><table><tr><td><img src="cid:image001.png@abc" /></td><td>Hej Ralph</td></tr></table></body></html>',
            '--abc',
            'Content-Type: image/png; name="logo.png"',
            'Content-ID: <image001.png@abc>',
            'Content-Disposition: inline; filename="logo.png"',
            'Content-Transfer-Encoding: base64',
            '',
            'QUJDRA==',
            '--abc--',
          ].join('\r\n'),
          contentType: 'message/rfc822',
        };
      },
    };

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        ccoMailboxTruthStore,
        graphReadConnector,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history?mailboxIds=contact@hairtpclinic.com&customerEmail=ralph@example.com&lookbackDays=30`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'mailbox_truth_store');
      assert.equal(assetCalls, 1);
      assert.equal(mimeCalls, 1);
      assert.match(String(payload.messages[0]?.bodyHtml || ''), /data:image\/png;base64,YWJjMTIz/);
      assert.equal(payload.messages[0]?.mailDocument?.assets?.length >= 1, true);
      assert.equal(payload.messages[0]?.mailDocument?.assetSummary?.attachmentCount, 1);
      assert.deepEqual(payload.messages[0]?.mailDocument?.assetSummary?.familyCounts, {
        attachment: 0,
        inline: 1,
        external: 0,
      });
      assert.equal(payload.messages[0]?.mailDocument?.assetSummary?.renderableInlineCount >= 1, true);
      assert.equal(payload.messages[0]?.mailDocument?.mimeAvailable, true);
      assert.equal(payload.messages[0]?.mailDocument?.sourceDepth, 'mime');
      assert.equal(payload.messages[0]?.mailDocument?.mime?.contentType, 'message/rfc822');
      assert.equal(payload.messages[0]?.mailDocument?.mime?.version, 'phase_b');
      assert.equal(payload.messages[0]?.mailDocument?.mime?.parsed?.preferredBodyKind, 'html');
      assert.equal(payload.messages[0]?.mailDocument?.mime?.parsed?.assets?.inlineAssets?.length, 1);
      assert.match(String(payload.messages[0]?.mailDocument?.primaryBodyHtml || ''), /Hej Ralph/);
      assert.equal(payload.messages[0]?.mailDocument?.fidelity?.mimePreferredBodyKind, 'html');
      assert.equal(payload.messages[0]?.mailThreadMessage?.assets?.inlineAssetIds?.length >= 1, true);
      assert.deepEqual(payload.messages[0]?.mailThreadMessage?.assets?.familyCounts, {
        attachment: 0,
        inline: 1,
        external: 0,
      });
      assert.equal(payload.messages[0]?.mailThreadMessage?.assets?.mimeInlineAssetCount, 1);
      assert.equal(payload.messages[0]?.mailThreadMessage?.mimeBacked, true);
      assert.equal(payload.messages[0]?.mailThreadMessage?.contentSections?.source, 'mime_backed');
      assert.equal(payload.messages[0]?.mailThreadMessage?.contentSections?.mimePreferredBodyKind, 'html');
      assert.equal(payload.threadDocument?.hasMimeBackedMessages, true);
      assert.equal(payload.threadDocument?.messageCount, 1);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history route can return thin mailbox history without bodyHtml on initial live load', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-thin-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await ccoMailboxTruthStore.recordFolderPage({
      account: {
        mailboxId: 'contact@hairtpclinic.com',
        mailboxAddress: 'contact@hairtpclinic.com',
        userPrincipalName: 'contact@hairtpclinic.com',
      },
      folder: {
        folderType: 'inbox',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        wellKnownName: 'inbox',
        totalItemCount: 1,
        unreadItemCount: 1,
        messageCollectionCount: 1,
      },
      messages: [
        {
          graphMessageId: 'truth-thin-1',
          mailboxId: 'contact@hairtpclinic.com',
          mailboxAddress: 'contact@hairtpclinic.com',
          userPrincipalName: 'contact@hairtpclinic.com',
          folderType: 'inbox',
          folderId: 'folder-inbox',
          folderName: 'Inbox',
          conversationId: 'conv-truth-thin-1',
          subject: 'Thin history load',
          bodyPreview: 'Kort förhandsvisning',
          bodyHtml:
            '<div><p>Hej</p><img src="cid:image001.png@abc" alt="Hair TP Clinic" /></div>',
          direction: 'inbound',
          isRead: false,
          receivedAt: '2026-04-09T10:00:00.000Z',
          from: {
            address: 'ralph@example.com',
            name: 'Ralph Hultman',
          },
          toRecipients: [{ address: 'contact@hairtpclinic.com', name: 'Contact' }],
          replyToRecipients: [],
        },
      ],
      complete: true,
    });

    let repairCalls = 0;
    const graphReadConnector = {
      async fetchMailboxTruthFolderPage() {
        throw new Error('not used in this test');
      },
      async enrichStoredMessagesWithInlineHtmlAssets({ messages = [] } = {}) {
        repairCalls += 1;
        return messages;
      },
    };

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        ccoMailboxTruthStore,
        graphReadConnector,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history?mailboxIds=contact@hairtpclinic.com&customerEmail=ralph@example.com&lookbackDays=30&includeBodyHtml=0`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.includeBodyHtml, false);
      assert.equal(repairCalls, 0);
      assert.equal(payload.messages[0]?.bodyPreview, 'Kort förhandsvisning');
      assert.equal(payload.messages[0]?.bodyHtml, null);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime history route matches mailbox-prefixed conversation ids even when mailbox casing differs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-prefix-case-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'cco-mailbox-truth.json'),
  });

  try {
    await ccoMailboxTruthStore.recordFolderPage({
      account: {
        mailboxId: 'marknad@hairtpclinic.com',
        mailboxAddress: 'marknad@hairtpclinic.com',
        userPrincipalName: 'marknad@hairtpclinic.com',
      },
      folder: {
        folderType: 'sent',
        folderId: 'folder-sent',
        folderName: 'Sent',
        wellKnownName: 'sent',
        totalItemCount: 1,
        unreadItemCount: 0,
        messageCollectionCount: 1,
      },
      messages: [
        {
          graphMessageId: 'truth-prefix-case-1',
          mailboxId: 'marknad@hairtpclinic.com',
          mailboxAddress: 'marknad@hairtpclinic.com',
          userPrincipalName: 'marknad@hairtpclinic.com',
          folderType: 'sent',
          folderId: 'folder-sent',
          folderName: 'Sent',
          conversationId: 'AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
          mailboxConversationId:
            'marknad@hairtpclinic.com:AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
          subject: 'Sv: 8 månader update',
          bodyPreview: 'Stort tack!',
          bodyHtml:
            '<div><p>Stort tack!</p><img src="https://example.com/logo.png" alt="logo" /></div>',
          direction: 'outbound',
          isRead: true,
          sentAt: '2026-03-31T12:18:00.000Z',
          createdAt: '2026-03-31T12:18:00.000Z',
          lastModifiedAt: '2026-03-31T12:18:00.000Z',
          from: {
            address: 'marknad@hairtpclinic.com',
            name: 'Marknad | Hair TP Clinic',
          },
          toRecipients: [{ address: 'perssonalma00@gmail.com', name: 'Alma Persson' }],
          replyToRecipients: [],
        },
      ],
      complete: true,
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        ccoMailboxTruthStore,
        graphReadConnector: createMailboxTruthConnector(),
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/history?mailboxIds=marknad@hairtpclinic.com&conversationId=Marknad@hairtpclinic.com:AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=&lookbackDays=30`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'mailbox_truth_store');
      assert.equal(payload.messages.length, 1);
      assert.equal(payload.messages[0]?.subject, 'Sv: 8 månader update');
      assert.match(String(payload.messages[0]?.bodyHtml || ''), /logo\.png/);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime calibration summary default scope includes fazli mailbox history', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-history-fazli-default-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const analysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'capability-analysis.json'),
    maxEntries: 2000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });

  try {
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-fazli-default-1',
      mailboxId: 'fazli@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      recordedAt: '2026-03-18T08:00:00.000Z',
      selectedMode: 'warm',
      recommendedAction: 'Upprepa två tydliga tider direkt.',
      intent: 'reschedule',
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {
              riskSensitivityModifier: 0,
              riskThresholdVersion: 1,
            };
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        capabilityAnalysisStore: analysisStore,
        ccoHistoryStore,
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/calibration/summary?customerEmail=patient@example.com&lookbackDays=365&intent=reschedule`
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.summary.totalOutcomeCount, 1);
      assert.equal(payload.mailboxIds.includes('fazli@hairtpclinic.com'), true);
      assert.equal(payload.summary.mailboxComparisonSummary.some((item) => item.mailboxId === 'fazli@hairtpclinic.com'), true);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime shadow summary, readout and status expose shadow-run review on real actions and outcomes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-shadow-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'cco-history.json'),
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'capability-analysis.json'),
  });

  try {
    const now = Date.now();
    const earlierIso = new Date(now - 10 * 60 * 60 * 1000).toISOString();
    const overdueFollowUpIso = new Date(now - 8 * 60 * 60 * 1000).toISOString();

    await capabilityAnalysisStore.append({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.ShadowRun',
      capabilityVersion: 'v1',
      persistStrategy: 'analysis_only',
      decision: 'allow',
      output: {
        data: {
          recommendations: [
            {
              generatedAt: earlierIso,
              conversationId: 'conv-shadow-1',
              mailboxId: 'kons@hairtpclinic.com',
              customerEmail: 'patient@example.com',
              subject: 'Kan jag boka om min tid?',
              intent: 'reschedule',
              recommendedAction: 'Bekräfta ändring',
              recommendedMode: 'warm',
              dominantRisk: 'sla',
            },
            {
              generatedAt: earlierIso,
              conversationId: 'conv-shadow-2',
              mailboxId: 'kons@hairtpclinic.com',
              customerEmail: 'followup@example.com',
              subject: 'Följer ni upp mig?',
              intent: 'follow_up',
              recommendedAction: 'Ge statusuppdatering',
              recommendedMode: 'professional',
              dominantRisk: 'follow_up',
              followUpSuggestedAt: overdueFollowUpIso,
            },
          ],
        },
      },
    });

    await ccoHistoryStore.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'conv-shadow-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'reply_sent',
      actionLabel: 'Svar skickat',
      recordedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      selectedMode: 'professional',
      recommendedMode: 'warm',
      recommendedAction: 'Bekräfta ändring',
      intent: 'reschedule',
    });
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-shadow-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      outcomeLabel: 'Ombokad',
      recordedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      selectedMode: 'professional',
      recommendedMode: 'warm',
      recommendedAction: 'Bekräfta ändring',
      intent: 'reschedule',
    });

    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        ccoHistoryStore,
        capabilityAnalysisStore,
        scheduler: {
          getStatus() {
            return {
              enabled: true,
              started: true,
              jobs: [
                { id: 'cco_shadow_run', lastSuccessAt: earlierIso, lastStatus: 'success' },
                {
                  id: 'cco_shadow_review',
                  lastSuccessAt: new Date(now - 60 * 60 * 1000).toISOString(),
                  lastStatus: 'success',
                },
              ],
            };
          },
        },
      })
    );

    await withServer(app, async (baseUrl) => {
      const summaryResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/shadow/summary?mailboxIds=kons@hairtpclinic.com&lookbackDays=14&limit=10`
      );
      assert.equal(summaryResponse.status, 200);
      const summaryPayload = await summaryResponse.json();
      assert.equal(summaryPayload.ok, true);
      assert.equal(summaryPayload.summary.totals.recommendationCount, 2);
      assert.equal(summaryPayload.summary.totals.positiveCount, 1);
      assert.equal(summaryPayload.summary.suspectCounts.missedFollowUp, 1);
      assert.ok(
        summaryPayload.summary.summaries.actionSummaryByIntent.some(
          (item) => item.intent === 'follow_up'
        )
      );
      assert.equal(summaryPayload.summary.summaries.mailboxSummary.length, 1);

      const readoutResponse = await fetch(
        `${baseUrl}/api/v1/cco/runtime/shadow/readout?mailboxIds=kons@hairtpclinic.com&lookbackDays=14&limit=10`
      );
      assert.equal(readoutResponse.status, 200);
      const readoutHtml = await readoutResponse.text();
      assert.match(readoutHtml, /CCO shadow-run readout/);
      assert.match(readoutHtml, /Mailboxjämförelse/);
      assert.match(readoutHtml, /Bästa\/sämsta mode per intent/);
      assert.match(readoutHtml, /Suspekt missad follow-up/);
      assert.match(readoutHtml, /Öppna i CCO Next/);

      const statusResponse = await fetch(`${baseUrl}/api/v1/cco/runtime/shadow/status`);
      assert.equal(statusResponse.status, 200);
      const statusPayload = await statusResponse.json();
      assert.equal(statusPayload.ok, true);
      assert.equal(statusPayload.shadowRunJob.id, 'cco_shadow_run');
      assert.equal(statusPayload.shadowReviewJob.id, 'cco_shadow_review');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime mail asset route streams attachment content for focus attachment actions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-mail-asset-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const previousGraphReadEnabled = process.env.ARCANA_GRAPH_READ_ENABLED;
  const previousGraphTenantId = process.env.ARCANA_GRAPH_TENANT_ID;
  const previousGraphClientId = process.env.ARCANA_GRAPH_CLIENT_ID;
  const previousGraphClientSecret = process.env.ARCANA_GRAPH_CLIENT_SECRET;
  process.env.ARCANA_GRAPH_READ_ENABLED = 'true';
  process.env.ARCANA_GRAPH_TENANT_ID = process.env.ARCANA_GRAPH_TENANT_ID || 'tenant-test';
  process.env.ARCANA_GRAPH_CLIENT_ID = process.env.ARCANA_GRAPH_CLIENT_ID || 'client-test';
  process.env.ARCANA_GRAPH_CLIENT_SECRET =
    process.env.ARCANA_GRAPH_CLIENT_SECRET || 'secret-test';

  try {
    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        graphReadConnector: {
          async fetchInboxSnapshot() {
            return { conversations: [] };
          },
          async fetchMessageAttachmentContent({ userId, messageId, attachmentId }) {
            assert.equal(userId, 'contact@hairtpclinic.com');
            assert.equal(messageId, 'msg-asset-1');
            assert.equal(attachmentId, 'att-file-1');
            return {
              name: 'price-list.pdf',
              contentType: 'application/pdf',
              buffer: Buffer.from('PDF-BYTES'),
            };
          },
        },
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/cco/runtime/mail-asset/content?mailboxId=contact@hairtpclinic.com&messageId=msg-asset-1&attachmentId=att-file-1&mode=download`
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.match(String(response.headers.get('content-disposition') || ''), /attachment;/);
      const buffer = Buffer.from(await response.arrayBuffer());
      assert.equal(String(buffer), 'PDF-BYTES');
    });
  } finally {
    if (previousGraphReadEnabled === undefined) {
      delete process.env.ARCANA_GRAPH_READ_ENABLED;
    } else {
      process.env.ARCANA_GRAPH_READ_ENABLED = previousGraphReadEnabled;
    }
    if (previousGraphTenantId === undefined) {
      delete process.env.ARCANA_GRAPH_TENANT_ID;
    } else {
      process.env.ARCANA_GRAPH_TENANT_ID = previousGraphTenantId;
    }
    if (previousGraphClientId === undefined) {
      delete process.env.ARCANA_GRAPH_CLIENT_ID;
    } else {
      process.env.ARCANA_GRAPH_CLIENT_ID = previousGraphClientId;
    }
    if (previousGraphClientSecret === undefined) {
      delete process.env.ARCANA_GRAPH_CLIENT_SECRET;
    } else {
      process.env.ARCANA_GRAPH_CLIENT_SECRET = previousGraphClientSecret;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
