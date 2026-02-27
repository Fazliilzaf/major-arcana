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

test('CCO agent run uses Graph hydrate path, persists analysis only, and resolves agent analysis key', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-agent-'));
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

  let writeCalls = 0;
  const templateStore = {
    async createTemplateVersion() {
      writeCalls += 1;
      throw new Error('createTemplateVersion should not be called by CCO agent');
    },
    async updateTemplateVersion() {
      writeCalls += 1;
      throw new Error('updateTemplateVersion should not be called by CCO agent');
    },
  };

  const graphCalls = [];
  const graphReadConnector = {
    async fetchInboxSnapshot(options) {
      graphCalls.push({ ...(options || {}) });
      return {
        snapshotVersion: 'graph.inbox.snapshot.v1',
        timestamps: {
          capturedAt: '2026-02-26T12:00:00.000Z',
          sourceGeneratedAt: '2026-02-26T11:59:00.000Z',
        },
        conversations: [
          {
            conversationId: 'conv-1',
            subject: 'Fraga om eftervard',
            status: 'open',
            messages: [
              {
                messageId: 'msg-1',
                direction: 'inbound',
                sentAt: '2026-02-26T10:30:00.000Z',
                bodyPreview: 'Hej, jag behover hjalp med eftervard.',
              },
            ],
            riskWords: [],
          },
        ],
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
      templateStore,
      graphReadConnector,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/CCO/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-cco-1',
        'x-idempotency-key': 'idem-cco-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: false,
          maxDrafts: 3,
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.agent?.name, 'CCO');
    assert.equal(payload.agent?.persistStrategy, 'analysis');
    assert.equal(payload.decision, 'allow');
    assert.equal(typeof payload.output?.data?.executiveSummary, 'string');
    assert.equal(
      ['Low', 'Medium', 'High', 'Critical'].includes(
        String(payload.output?.data?.priorityLevel || '')
      ),
      true
    );
    assert.equal(Array.isArray(payload.output?.data?.conversationWorklist), true);
    assert.equal((payload.output?.data?.suggestedDrafts || []).length <= 5, true);

    const analysisResponse = await fetch(`${baseUrl}/api/v1/agents/analysis?agent=CCO&limit=1`);
    assert.equal(analysisResponse.status, 200);
    const analysisPayload = await analysisResponse.json();
    assert.equal(analysisPayload.capability, 'CCO.InboxAnalysis');
    assert.equal(Array.isArray(analysisPayload.entries), true);
    assert.equal(analysisPayload.entries.length, 1);
  });

  assert.equal(graphCalls.length, 1);
  assert.equal(graphCalls[0].days, 14);
  assert.equal(graphCalls[0].maxMessages, 100);
  assert.equal(graphCalls[0].includeRead, false);
  assert.equal(writeCalls, 0);

  const ccoEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'CCO.InboxAnalysis',
    limit: 20,
  });
  assert.equal(ccoEntries.length, 1);
  assert.equal(ccoEntries[0].capability.name, 'CCO.InboxAnalysis');
  assert.equal(ccoEntries[0].capability.persistStrategy, 'analysis');
  assert.equal(ccoEntries[0].metadata?.agentName, 'CCO');

  const inboxEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AnalyzeInbox',
    limit: 20,
  });
  assert.equal(inboxEntries.length, 1);

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 300,
  });
  const actions = new Set(audits.map((item) => item.action));
  assert.equal(actions.has('mailbox.read.start'), true);
  assert.equal(actions.has('mailbox.read.complete'), true);
  assert.equal(actions.has('agent.run.start'), true);
  assert.equal(actions.has('agent.run.complete'), true);
  assert.equal(actions.has('gateway.run.start'), true);
  assert.equal(actions.has('gateway.run.response'), true);
});

test('CCO agent run enforces output risk + policy before response', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-agent-enforce-'));
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
            riskSensitivityModifier: 2,
            riskThresholdVersion: 2,
          };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
      graphReadConnector: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/CCO/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: true,
          maxDrafts: 5,
        },
        systemStateSnapshot: {
          conversations: [
            {
              conversationId: 'conv-risk-1',
              subject: 'Akut fraga om behandling',
              status: 'open',
              messages: [
                {
                  messageId: 'msg-risk-1',
                  direction: 'inbound',
                  sentAt: new Date().toISOString(),
                  bodyPreview: 'Jag har kraftig smarta och feber, svara akut.',
                },
              ],
            },
          ],
          timestamps: {
            capturedAt: new Date().toISOString(),
          },
        },
      }),
    });

    assert.equal([200, 403].includes(response.status), true);
    const payload = await response.json();
    if (response.status === 200) {
      assert.equal(Boolean(payload.riskSummary?.output?.decision), true);
      assert.equal(Boolean(payload.riskSummary?.output?.versions?.ruleSetVersion), true);
      assert.equal(Boolean(payload.policySummary), true);
      assert.equal(Array.isArray(payload.output?.data?.suggestedDrafts), true);
      return;
    }
    assert.equal(typeof payload.error, 'string');
    assert.equal(payload.error.length > 0, true);
  });

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 250,
  });
  const actions = new Set(audits.map((item) => item.action));
  assert.equal(actions.has('agent.run.start'), true);
  assert.equal(actions.has('gateway.run.decision'), true);
  assert.equal(actions.has('agent.run.complete'), true);
});
