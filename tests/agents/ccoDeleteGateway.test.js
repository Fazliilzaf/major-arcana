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
        return res.status(403).json({ error: 'Du saknar behorighet for detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

async function withDeleteEnv(overrides, run) {
  const keys = [
    'ARCANA_CCO_DELETE_ENABLED',
    'ARCANA_CCO_DELETE_ALLOWLIST',
    'ARCANA_GRAPH_SEND_ALLOWLIST',
  ];
  const previous = {};
  for (const key of keys) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value === undefined || value === null) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function createTestContext({ graphSendConnector }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-delete-'));
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
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
      graphSendConnector,
    })
  );

  return { app, authStore };
}

function buildDeletePayload() {
  return {
    channel: 'admin',
    mailboxId: 'contact@hairtpclinic.com',
    messageId: 'message-1',
    conversationId: 'conversation-1',
    softDelete: true,
  };
}

test('CCO delete route returns NOT_ENABLED when feature flag is off', async () => {
  await withDeleteEnv(
    {
      ARCANA_CCO_DELETE_ENABLED: 'false',
      ARCANA_CCO_DELETE_ALLOWLIST: 'contact@hairtpclinic.com',
    },
    async () => {
      let moveCalls = 0;
      const graphSendConnector = {
        async sendReply() {
          return { ok: true };
        },
        async moveMessageToDeletedItems() {
          moveCalls += 1;
          return { ok: true };
        },
      };
      const { app } = await createTestContext({ graphSendConnector });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/cco/delete`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-idempotency-key': 'delete-disabled-1',
          },
          body: JSON.stringify(buildDeletePayload()),
        });
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.code, 'CCO_DELETE_NOT_ENABLED');
      });

      assert.equal(moveCalls, 0);
    }
  );
});

test('CCO delete route blocks mailbox outside allowlist', async () => {
  await withDeleteEnv(
    {
      ARCANA_CCO_DELETE_ENABLED: 'true',
      ARCANA_CCO_DELETE_ALLOWLIST: 'egzona@hairtpclinic.com',
    },
    async () => {
      let moveCalls = 0;
      const graphSendConnector = {
        async sendReply() {
          return { ok: true };
        },
        async moveMessageToDeletedItems() {
          moveCalls += 1;
          return { ok: true };
        },
      };
      const { app } = await createTestContext({ graphSendConnector });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/cco/delete`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-idempotency-key': 'delete-allowlist-block-1',
          },
          body: JSON.stringify(buildDeletePayload()),
        });
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.code, 'CCO_DELETE_ALLOWLIST_BLOCKED');
      });

      assert.equal(moveCalls, 0);
    }
  );
});

test('CCO delete route moves mail to Deleted Items and writes audit', async () => {
  await withDeleteEnv(
    {
      ARCANA_CCO_DELETE_ENABLED: 'true',
      ARCANA_CCO_DELETE_ALLOWLIST: 'contact@hairtpclinic.com',
    },
    async () => {
      let moveCalls = 0;
      let lastMoveArgs = null;
      const graphSendConnector = {
        async sendReply() {
          return { ok: true };
        },
        async moveMessageToDeletedItems({ mailboxId, messageId }) {
          moveCalls += 1;
          lastMoveArgs = { mailboxId, messageId };
          return {
            provider: 'microsoft_graph',
            mailboxId,
            messageId,
            movedMessageId: 'message-1-moved',
            destinationFolderId: 'deleteditems',
            deletedAt: new Date().toISOString(),
            deleteMode: 'soft_delete',
          };
        },
      };
      const { app, authStore } = await createTestContext({ graphSendConnector });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/cco/delete`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-idempotency-key': 'delete-success-1',
          },
          body: JSON.stringify(buildDeletePayload()),
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.equal(body.mode, 'soft_delete');
        assert.equal(body.deleteResult?.destinationFolderId, 'deleteditems');
      });

      assert.equal(moveCalls, 1);
      assert.deepEqual(lastMoveArgs, {
        mailboxId: 'contact@hairtpclinic.com',
        messageId: 'message-1',
      });

      const audits = await authStore.listAuditEvents({
        tenantId: 'tenant-a',
        limit: 200,
      });
      const actions = audits.map((event) => event.action);
      assert.equal(actions.includes('cco.delete.requested'), true);
      assert.equal(actions.includes('cco.delete.completed'), true);
    }
  );
});

test('CCO delete route returns graph error and writes failed audit', async () => {
  await withDeleteEnv(
    {
      ARCANA_CCO_DELETE_ENABLED: 'true',
      ARCANA_CCO_DELETE_ALLOWLIST: 'contact@hairtpclinic.com',
    },
    async () => {
      const graphSendConnector = {
        async sendReply() {
          return { ok: true };
        },
        async moveMessageToDeletedItems() {
          const error = new Error('graph move failed');
          error.code = 'GRAPH_REQUEST_FAILED';
          throw error;
        },
      };
      const { app, authStore } = await createTestContext({ graphSendConnector });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/cco/delete`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-idempotency-key': 'delete-graph-error-1',
          },
          body: JSON.stringify(buildDeletePayload()),
        });
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.equal(body.code, 'CCO_DELETE_GRAPH_ERROR');
      });

      const audits = await authStore.listAuditEvents({
        tenantId: 'tenant-a',
        limit: 200,
      });
      const failedEvent = audits.find(
        (event) => event.action === 'cco.delete.completed' && event.outcome === 'error'
      );
      assert.equal(Boolean(failedEvent), true);
    }
  );
});

test('CCO delete status route reports disabled state when feature flag is off', async () => {
  await withDeleteEnv(
    {
      ARCANA_CCO_DELETE_ENABLED: 'false',
      ARCANA_CCO_DELETE_ALLOWLIST: 'contact@hairtpclinic.com',
    },
    async () => {
      const graphSendConnector = {
        async sendReply() {
          return { ok: true };
        },
        async moveMessageToDeletedItems() {
          return { ok: true };
        },
      };
      const { app } = await createTestContext({ graphSendConnector });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/cco/delete/status`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.equal(body.deleteEnabled, false);
        assert.equal(body.reasonCode, 'CCO_DELETE_NOT_ENABLED');
      });
    }
  );
});

test('CCO delete status route reports enabled state when feature flag and allowlist are present', async () => {
  await withDeleteEnv(
    {
      ARCANA_CCO_DELETE_ENABLED: 'true',
      ARCANA_CCO_DELETE_ALLOWLIST: 'contact@hairtpclinic.com',
    },
    async () => {
      const graphSendConnector = {
        async sendReply() {
          return { ok: true };
        },
        async moveMessageToDeletedItems() {
          return { ok: true };
        },
      };
      const { app } = await createTestContext({ graphSendConnector });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/cco/delete/status`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.equal(body.deleteEnabled, true);
        assert.equal(body.reasonCode, null);
      });
    }
  );
});
