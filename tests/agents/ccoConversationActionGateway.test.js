const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createCapabilitiesRouter } = require('../../src/routes/capabilities');
const { createExecutionGateway } = require('../../src/gateway/executionGateway');
const { createAuthStore } = require('../../src/security/authStore');
const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');
const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');
const {
  createCcoConversationStateStore,
} = require('../../src/ops/ccoConversationStateStore');

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

function createMockAuth(role = 'OWNER', email = 'owner@hairtpclinic.se') {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role,
    };
    req.currentUser = {
      id: 'owner-a',
      email,
    };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behorighet for detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

async function createRouteFixture({
  truthMessages = [],
  historyStoreOverride = null,
  auditFailureActions = new Set(),
} = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-conversation-actions-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const realAddAuditEvent = authStore.addAuditEvent.bind(authStore);
  authStore.addAuditEvent = async (event) => {
    if (auditFailureActions.has(String(event?.action || ''))) {
      throw new Error(`audit blocked:${event.action}`);
    }
    return realAddAuditEvent(event);
  };
  const analysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'capability-analysis.json'),
    maxEntries: 2000,
  });
  const ccoHistoryStore =
    historyStoreOverride ||
    (await createCcoHistoryStore({
      filePath: path.join(tempDir, 'cco-history.json'),
    }));
  const ccoConversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'cco-conversation-state.json'),
  });
  const app = express();
  app.use(express.json());
  const auth = createMockAuth();
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
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      ccoHistoryStore,
      ccoMailboxTruthStore: {
        listMessages({ mailboxIds = [] } = {}) {
          const selected = Array.isArray(mailboxIds) && mailboxIds.length > 0
            ? new Set(mailboxIds.map((item) => String(item || '').toLowerCase()))
            : null;
          return truthMessages.filter((message) => {
            const mailboxId = String(message.mailboxId || '').toLowerCase();
            return !selected || selected.has(mailboxId);
          });
        },
      },
      ccoCustomerStore: {
        async getTenantCustomerState() {
          return null;
        },
      },
      ccoConversationStateStore,
      templateStore: null,
      graphReadConnector: null,
      graphSendConnector: null,
    })
  );

  return {
    app,
    tempDir,
    authStore,
    ccoHistoryStore,
    ccoConversationStateStore,
  };
}

function buildTruthMessages({ withReviewConflict = false } = {}) {
  return [
    {
      mailboxId: 'contact@hairtpclinic.com',
      mailboxAddress: 'contact@hairtpclinic.com',
      userPrincipalName: 'contact@hairtpclinic.com',
      mailboxConversationId: 'contact@hairtpclinic.com:conv-1',
      conversationId: 'conv-1',
      graphMessageId: 'msg-1',
      folderType: 'inbox',
      direction: 'inbound',
      isRead: false,
      subject: 'Patient behöver svar',
      bodyPreview: 'Hej, kan ni hjälpa mig med nästa steg?',
      from: {
        address: 'patient@example.com',
        name: 'Patient Example',
      },
      receivedAt: '2026-04-16T07:00:00.000Z',
      hardConflictSignals: withReviewConflict
        ? [{ type: 'identity', field: 'canonicalCustomerId', left: 'cust-1', right: 'cust-2' }]
        : [],
      mergeReviewDecisionsByPairId: withReviewConflict ? {} : {},
    },
  ];
}

function buildHandledPayload(overrides = {}) {
  return {
    channel: 'admin',
    mailboxId: 'contact@hairtpclinic.com',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    source: 'major_arcana_preview',
    ...overrides,
  };
}

function buildReplyLaterPayload(overrides = {}) {
  return {
    channel: 'admin',
    mailboxId: 'contact@hairtpclinic.com',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    followUpDueAt: '2026-04-17T09:00:00.000Z',
    waitingOn: 'owner',
    nextActionLabel: 'Svara i morgon',
    nextActionSummary: 'Ring tillbaka efter lunch.',
    source: 'major_arcana_preview',
    ...overrides,
  };
}

test('CCO handled route writes conversation overlay, history and projection refresh metadata', async () => {
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages(),
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/handled`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'handled-success-1',
        },
        body: JSON.stringify(buildHandledPayload()),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'handled');
      assert.equal(body.writeCommitted, true);
      assert.equal(body.historyLogged, true);
      assert.equal(body.auditLogged, true);
      assert.deepEqual(body.projection.invalidate, ['worklist', 'focus', 'history']);
      assert.equal(body.projection.refreshMode, 'bootstrap_refresh');
      assert.equal(body.state.actionState, 'handled');
      assert.equal(body.state.needsReplyStatusOverride, 'handled');
    });

    const state = fixture.ccoConversationStateStore.getActiveState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'contact@hairtpclinic.com:conv-1',
    });
    assert.ok(state);
    assert.equal(state.actionState, 'handled');

    const actions = await fixture.ccoHistoryStore.listActions({
      tenantId: 'tenant-a',
      mailboxIds: ['contact@hairtpclinic.com'],
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].actionType, 'handled');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CCO reply-later route writes conversation overlay, history and follow-up metadata', async () => {
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages(),
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/reply-later`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'reply-later-success-1',
        },
        body: JSON.stringify(buildReplyLaterPayload()),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'reply_later');
      assert.equal(body.state.actionState, 'reply_later');
      assert.equal(body.state.followUpDueAt, '2026-04-17T09:00:00.000Z');
      assert.equal(body.state.waitingOn, 'owner');
      assert.equal(body.historyLogged, true);
      assert.equal(body.auditLogged, true);
    });

    const state = fixture.ccoConversationStateStore.getActiveState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'contact@hairtpclinic.com:conv-1',
    });
    assert.ok(state);
    assert.equal(state.actionState, 'reply_later');
    assert.equal(state.nextActionLabel, 'Svara i morgon');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CCO conversation action routes replay resolved result for same x-idempotency-key', async () => {
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages(),
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const payload = buildReplyLaterPayload();
      const first = await fetch(`${baseUrl}/api/v1/cco/reply-later`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'reply-later-replay-1',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(first.status, 200);
      const firstBody = await first.json();

      const second = await fetch(`${baseUrl}/api/v1/cco/reply-later`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'reply-later-replay-1',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(second.status, 200);
      const secondBody = await second.json();
      assert.deepEqual(secondBody, firstBody);
    });

    const actions = await fixture.ccoHistoryStore.listActions({
      tenantId: 'tenant-a',
      mailboxIds: ['contact@hairtpclinic.com'],
    });
    assert.equal(actions.length, 1);
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CCO conversation action routes reject payload mismatch for reused x-idempotency-key', async () => {
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages(),
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/v1/cco/reply-later`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'reply-later-mismatch-1',
        },
        body: JSON.stringify(buildReplyLaterPayload()),
      });
      assert.equal(first.status, 200);

      const second = await fetch(`${baseUrl}/api/v1/cco/reply-later`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'reply-later-mismatch-1',
        },
        body: JSON.stringify(
          buildReplyLaterPayload({
            followUpDueAt: '2026-04-18T09:00:00.000Z',
          })
        ),
      });
      assert.equal(second.status, 409);
      const secondBody = await second.json();
      assert.equal(secondBody.code, 'CCO_IDEMPOTENCY_PAYLOAD_MISMATCH');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CCO conversation action routes return in-progress conflict while first request is still pending', async () => {
  let releaseHistory = null;
  let historyStartedResolve = null;
  const historyStarted = new Promise((resolve) => {
    historyStartedResolve = resolve;
  });
  const historyStore = {
    async recordAction(payload) {
      historyStartedResolve(payload);
      await new Promise((resolve) => {
        releaseHistory = resolve;
      });
      return {
        ...payload,
        recordedAt: payload.recordedAt,
      };
    },
    async listActions() {
      return [];
    },
  };
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages(),
    historyStoreOverride: historyStore,
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const firstPromise = fetch(`${baseUrl}/api/v1/cco/handled`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'handled-pending-1',
        },
        body: JSON.stringify(buildHandledPayload()),
      });

      await historyStarted;

      const second = await fetch(`${baseUrl}/api/v1/cco/handled`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'handled-pending-1',
        },
        body: JSON.stringify(buildHandledPayload()),
      });
      assert.equal(second.status, 409);
      const secondBody = await second.json();
      assert.equal(secondBody.code, 'CCO_IDEMPOTENCY_IN_PROGRESS');

      releaseHistory();
      const first = await firstPromise;
      assert.equal(first.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CCO conversation action routes block review-required canonical resolution', async () => {
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages({ withReviewConflict: true }),
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/handled`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'handled-review-1',
        },
        body: JSON.stringify(buildHandledPayload()),
      });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.code, 'CCO_CONVERSATION_REVIEW_REQUIRED');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CCO conversation action routes keep committed state when history logging fails and return warning', async () => {
  const fixture = await createRouteFixture({
    truthMessages: buildTruthMessages(),
    historyStoreOverride: {
      async recordAction() {
        throw new Error('history-write-failed');
      },
      async listActions() {
        return [];
      },
    },
  });

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/handled`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'handled-warning-1',
        },
        body: JSON.stringify(buildHandledPayload()),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.writeCommitted, true);
      assert.equal(body.historyLogged, false);
      assert.equal(body.auditLogged, true);
      assert.equal(body.warningCode, 'CCO_ACTION_HISTORY_WRITE_FAILED');
    });

    const state = fixture.ccoConversationStateStore.getActiveState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'contact@hairtpclinic.com:conv-1',
    });
    assert.ok(state);

    const audits = await fixture.authStore.listAuditEvents({
      tenantId: 'tenant-a',
      limit: 200,
    });
    const actions = audits.map((event) => event.action);
    assert.equal(actions.includes('cco.reply.handled.requested'), true);
    assert.equal(actions.includes('cco.reply.handled.failed'), true);
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
