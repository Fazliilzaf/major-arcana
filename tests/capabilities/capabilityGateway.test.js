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
const { AnalyzeInboxCapability } = require('../../src/capabilities/analyzeInbox');

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

test('capability run goes through gateway and writes capability + gateway audit trail', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-gateway-'));
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
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/GenerateTaskPlan/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-capability-1',
        'x-idempotency-key': 'idem-capability-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          openReviews: [{ id: 'rev-1', riskLevel: 5, decision: 'blocked' }],
          incidents: [{ id: 'inc-1', severity: 'L5', ownerDecision: 'escalate_to_owner' }],
          kpi: { sloBreaches: 1, openUnresolvedIncidents: 1, highCriticalOpenReviews: 1 },
          latestTemplateChanges: [{ templateId: 'tpl-1', updatedAt: '2026-02-01T10:00:00.000Z' }],
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.capability.name, 'GenerateTaskPlan');
    assert.equal(payload.capability.persistStrategy, 'analysis');
    assert.equal(payload.decision, 'allow');
    assert.equal(Boolean(payload.riskSummary?.input), true);
    assert.equal(Boolean(payload.riskSummary?.output), true);
    assert.equal(payload.policySummary?.blocked, false);
    assert.equal(Array.isArray(payload.output?.data?.tasks), true);
    assert.equal(payload.output.data.tasks.length <= 5, true);
    assert.equal(payload.output?.metadata?.capability, 'GenerateTaskPlan');
  });

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 200,
  });
  const actions = new Set(audits.map((item) => item.action));
  assert.equal(actions.has('capability.run.start'), true);
  assert.equal(actions.has('capability.run.decision'), true);
  assert.equal(actions.has('capability.run.persist'), true);
  assert.equal(actions.has('capability.run.complete'), true);
  assert.equal(actions.has('gateway.run.start'), true);
  assert.equal(actions.has('gateway.run.decision'), true);
  assert.equal(actions.has('gateway.run.persist'), true);
  assert.equal(actions.has('gateway.run.response'), true);

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateTaskPlan',
    limit: 20,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].capability.name, 'GenerateTaskPlan');
  assert.equal(entries[0].decision, 'allow');
});

test('SummarizeIncidents run goes through gateway and persists analysis only', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-summarize-'));
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
      templateStore: {
        async listIncidents() {
          return [
            {
              id: 'inc-1',
              category: 'CONSULTATION',
              reasonCodes: ['DISCLOSURE_MISSING', 'DISCLOSURE_MISSING'],
              severity: 'L5',
              riskLevel: 5,
              status: 'open',
              ownerDecision: 'pending',
              openedAt: '2026-02-25T10:00:00.000Z',
              updatedAt: '2026-02-26T10:00:00.000Z',
              sla: { state: 'critical', breached: false, deadline: '2026-02-26T12:00:00.000Z' },
            },
            {
              id: 'inc-2',
              category: 'AFTERCARE',
              reasonCodes: ['DISCLAIMERS_MISSING'],
              severity: 'L4',
              riskLevel: 4,
              status: 'open',
              ownerDecision: 'pending',
              openedAt: '2026-02-24T09:00:00.000Z',
              updatedAt: '2026-02-26T09:00:00.000Z',
              sla: { state: 'warn', breached: false, deadline: '2026-02-26T14:00:00.000Z' },
            },
          ];
        },
        async summarizeIncidents() {
          return {
            bySlaState: { critical: 1, warn: 1, breached: 0 },
            generatedAt: '2026-02-26T10:05:00.000Z',
          };
        },
      },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/SummarizeIncidents/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-capability-sum-1',
        'x-idempotency-key': 'idem-capability-sum-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: false,
          timeframeDays: 14,
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.capability.name, 'SummarizeIncidents');
    assert.equal(payload.capability.persistStrategy, 'analysis');
    assert.equal(payload.decision, 'allow');
    assert.equal(Boolean(payload.riskSummary?.input), true);
    assert.equal(Boolean(payload.riskSummary?.output), true);
    assert.equal(payload.policySummary?.blocked, false);
    assert.equal(typeof payload.output?.data?.summary, 'string');
    assert.equal(Array.isArray(payload.output?.data?.recommendations), true);
    assert.equal(payload.output.data.recommendations.length <= 5, true);
    assert.equal(payload.output?.metadata?.capability, 'SummarizeIncidents');
  });

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'SummarizeIncidents',
    limit: 20,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].capability.name, 'SummarizeIncidents');
  assert.equal(entries[0].capability.persistStrategy, 'analysis');
  assert.equal(Boolean(entries[0].metadata?.channel), true);

  const otherEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateTaskPlan',
    limit: 20,
  });
  assert.equal(otherEntries.length, 0);
});

test('AnalyzeInbox run goes through gateway, persists analysis only, and performs no mailbox writes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-inbox-'));
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

  const mailboxWriteCounters = {
    sendReply: 0,
    markAsRead: 0,
    updateThread: 0,
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
      templateStore: {
        async sendReply() {
          mailboxWriteCounters.sendReply += 1;
          throw new Error('sendReply should never be called by AnalyzeInbox');
        },
        async markAsRead() {
          mailboxWriteCounters.markAsRead += 1;
          throw new Error('markAsRead should never be called by AnalyzeInbox');
        },
        async updateThread() {
          mailboxWriteCounters.updateThread += 1;
          throw new Error('updateThread should never be called by AnalyzeInbox');
        },
      },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-capability-inbox-1',
        'x-idempotency-key': 'idem-capability-inbox-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: false,
          maxDrafts: 5,
        },
        systemStateSnapshot: {
          conversations: [
            {
              conversationId: 'conv-1',
              subject: 'Symptom efter behandling',
              status: 'open',
              slaDeadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              messages: [
                {
                  messageId: 'msg-1',
                  direction: 'inbound',
                  sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                  bodyPreview: 'Jag har smarta och feber. Kontakta mig pa 0701234567.',
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

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.capability.name, 'AnalyzeInbox');
    assert.equal(payload.capability.persistStrategy, 'analysis');
    assert.equal(payload.decision, 'allow');
    assert.equal(Boolean(payload.riskSummary?.input), true);
    assert.equal(Boolean(payload.riskSummary?.output), true);
    assert.equal(payload.riskSummary?.output?.scope, 'output');
    assert.equal(typeof payload.riskSummary?.output?.decision, 'string');
    assert.equal(payload.policySummary?.blocked, false);
    assert.equal(Array.isArray(payload.policySummary?.reasonCodes), true);
    assert.equal(Array.isArray(payload.output?.data?.suggestedDrafts), true);
    assert.equal(payload.output.data.suggestedDrafts.length <= 5, true);
    assert.equal(payload.output?.metadata?.capability, 'AnalyzeInbox');
  });

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AnalyzeInbox',
    limit: 20,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].capability.name, 'AnalyzeInbox');
  assert.equal(entries[0].capability.persistStrategy, 'analysis');
  assert.equal(entries[0].policySummary?.blocked, false);
  assert.equal(entries[0].riskSummary?.output?.scope, 'output');
  assert.equal(Boolean(entries[0].riskSummary?.output?.decision), true);

  assert.deepEqual(mailboxWriteCounters, {
    sendReply: 0,
    markAsRead: 0,
    updateThread: 0,
  });
});

test('AnalyzeInbox hydrates Graph snapshot and writes mailbox read start/complete audit events', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-inbox-graph-'));
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

  const graphCalls = [];
  const graphReadConnector = {
    async fetchInboxSnapshot(options = {}) {
      graphCalls.push({ ...options });
      return {
        snapshotVersion: 'graph.inbox.snapshot.v1',
        timestamps: {
          capturedAt: '2026-02-26T18:00:00.000Z',
          sourceGeneratedAt: '2026-02-26T17:59:58.000Z',
        },
        conversations: [
          {
            conversationId: 'graph-conv-1',
            subject: 'Fraga efter behandling',
            status: 'open',
            messages: [
              {
                messageId: 'graph-msg-1',
                direction: 'inbound',
                sentAt: '2026-02-26T17:00:00.000Z',
                bodyPreview: 'Jag har symptom efter behandling och undrar om uppfoljning.',
              },
            ],
            riskWords: ['symptom'],
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
      templateStore: null,
      graphReadConnector,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-capability-inbox-graph-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          maxDrafts: 3,
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.capability.name, 'AnalyzeInbox');
    assert.equal(payload.output?.metadata?.capability, 'AnalyzeInbox');
    assert.equal(Array.isArray(payload.output?.data?.suggestedDrafts), true);
    assert.equal(payload.output.data.suggestedDrafts.length >= 1, true);
  });

  assert.equal(graphCalls.length, 1);
  assert.equal(graphCalls[0].days, 14);
  assert.equal(graphCalls[0].maxMessages, 100);
  assert.equal(graphCalls[0].includeRead, false);

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 300,
  });
  const mailboxAudits = audits.filter((item) => String(item.action || '').startsWith('mailbox.read.'));
  const actions = new Set(mailboxAudits.map((item) => item.action));
  assert.equal(actions.has('mailbox.read.start'), true);
  assert.equal(actions.has('mailbox.read.complete'), true);
  assert.equal(actions.has('mailbox.read.error'), false);

  const completeEvent = mailboxAudits.find((item) => item.action === 'mailbox.read.complete');
  assert.equal(completeEvent?.metadata?.messageCount, 1);
  assert.equal(completeEvent?.metadata?.conversationCount, 1);

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AnalyzeInbox',
    limit: 20,
  });
  assert.equal(entries.length, 1);
});

test('AnalyzeInbox writes mailbox.read.error and returns 500 when Graph snapshot ingest fails', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-inbox-graph-error-'));
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

  const graphReadConnector = {
    async fetchInboxSnapshot() {
      throw new Error('graph_api_unavailable');
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
      templateStore: null,
      graphReadConnector,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-capability-inbox-graph-error-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          maxDrafts: 1,
        },
      }),
    });

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.code, 'CAPABILITY_INBOX_SOURCE_UNAVAILABLE');
  });

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 300,
  });
  const mailboxAudits = audits.filter((item) => String(item.action || '').startsWith('mailbox.read.'));
  const actions = new Set(mailboxAudits.map((item) => item.action));
  assert.equal(actions.has('mailbox.read.start'), true);
  assert.equal(actions.has('mailbox.read.error'), true);

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AnalyzeInbox',
    limit: 20,
  });
  assert.equal(entries.length, 0);
});

test('AnalyzeInbox policy floor blocks forbidden draft language before persist', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-inbox-policy-'));
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
    })
  );

  const originalExecute = AnalyzeInboxCapability.prototype.execute;
  AnalyzeInboxCapability.prototype.execute = async function unsafeExecute(context) {
    const base = await originalExecute.call(this, context);
    base.data.suggestedDrafts = [
      {
        conversationId: 'conv-unsafe',
        messageId: 'msg-unsafe',
        mailboxId: 'owner@hairtpclinic.se',
        sender: 'p***@example.com',
        latestInboundPreview: 'Meddelandepreview',
        hoursSinceInbound: 1,
        slaStatus: 'ok',
        intent: 'follow_up',
        tone: 'neutral',
        priorityLevel: 'High',
        priorityScore: 66,
        recommendedAction: 'Be om mer info',
        escalationRequired: false,
        subject: 'Unsafe',
        proposedReply: 'Vi garanterar 100% resultat och detta ar en diagnos.',
        confidenceLevel: 'High',
      },
    ];
    base.data.executiveSummary = 'Unsafe policy content inserted for enforcement test.';
    base.data.priorityLevel = 'High';
    return base;
  };

  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-capability-inbox-policy-1',
        },
        body: JSON.stringify({
          channel: 'admin',
          input: {
            maxDrafts: 1,
          },
          systemStateSnapshot: {
            conversations: [
              {
                conversationId: 'conv-1',
                subject: 'Kontroll',
                status: 'open',
                messages: [
                  {
                    messageId: 'msg-1',
                    direction: 'inbound',
                    sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    bodyPreview: 'Hej, en vanlig fraga.',
                  },
                ],
              },
            ],
          },
        }),
      });

      assert.equal(response.status, 403);
      const payload = await response.json();
      assert.equal(typeof payload.error, 'string');
      assert.equal(payload.error.length > 0, true);
    });
  } finally {
    AnalyzeInboxCapability.prototype.execute = originalExecute;
  }

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AnalyzeInbox',
    limit: 20,
  });
  assert.equal(entries.length, 0);
});

test('GenerateTaskPlan enforces output risk + policy evaluation before response', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-risk-enforce-'));
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
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/GenerateTaskPlan/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          maxTasks: 3,
          openReviews: [{ id: 'rev-1', riskLevel: 5, decision: 'blocked' }],
          incidents: [{ id: 'inc-1', severity: 'L5', ownerDecision: 'escalate_to_owner' }],
          latestTemplateChanges: [{ templateId: 'tpl-1', updatedAt: '2026-02-01T10:00:00.000Z' }],
          kpi: { highCriticalOpenReviews: 2, sloBreaches: 1, openUnresolvedIncidents: 1 },
        },
      }),
    });

    assert.equal([200, 403].includes(response.status), true);
    const payload = await response.json();
    if (response.status === 200) {
      assert.equal(Boolean(payload.riskSummary?.output?.decision), true);
      assert.equal(Boolean(payload.riskSummary?.output?.versions?.ruleSetVersion), true);
      assert.equal(Boolean(payload.policySummary), true);
      assert.equal(payload.policySummary?.blocked, false);
      return;
    }
    assert.equal(typeof payload.error, 'string');
    assert.equal(payload.error.length > 0, true);
  });
});

test('SummarizeIncidents enforces output risk + policy evaluation before response', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-summarize-enforce-'));
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
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/SummarizeIncidents/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: true,
          timeframeDays: 30,
        },
        systemStateSnapshot: {
          incidents: [
            {
              id: 'inc-1',
              category: 'CONSULTATION',
              reasonCodes: ['GUARANTEE_LANGUAGE', 'DIAGNOSIS_TONE'],
              severity: 'L5',
              riskLevel: 5,
              status: 'open',
              ownerDecision: 'pending',
              updatedAt: new Date().toISOString(),
              sla: { state: 'breached', breached: true },
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
      assert.equal(payload.policySummary?.blocked, false);
      return;
    }
    assert.equal(typeof payload.error, 'string');
    assert.equal(payload.error.length > 0, true);
  });
});

test('capability run rejects disallowed channel before gateway execution', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-channel-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 2000,
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
          return {};
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/GenerateTaskPlan/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'patient',
        input: {
          openReviews: [],
          incidents: [],
          kpi: {},
          latestTemplateChanges: [],
        },
      }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, 'CAPABILITY_CHANNEL_DENIED');
  });

  const entries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateTaskPlan',
    limit: 20,
  });
  assert.equal(entries.length, 0);
});

test('capability meta exposes registry + agent bundles', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-meta-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 2000,
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
          return {};
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities/meta`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(Array.isArray(payload.capabilities), true);
    assert.equal(
      payload.capabilities.some((item) => item?.name === 'GenerateTaskPlan'),
      true
    );
    assert.equal(
      payload.capabilities.some((item) => item?.name === 'SummarizeIncidents'),
      true
    );
    assert.equal(
      payload.capabilities.some((item) => item?.name === 'AnalyzeInbox'),
      true
    );
    assert.equal(Array.isArray(payload.agentBundles), true);
    assert.equal(payload.agentBundles.some((item) => item?.role === 'COO'), true);
    assert.equal(payload.agentBundles.some((item) => item?.role === 'CCO'), true);
    const coo = payload.agentBundles.find((item) => item?.role === 'COO');
    assert.equal(Array.isArray(coo?.capabilities), true);
    assert.equal(coo.capabilities.includes('SummarizeIncidents'), true);
    const cco = payload.agentBundles.find((item) => item?.role === 'CCO');
    assert.equal(Array.isArray(cco?.capabilities), true);
    assert.equal(cco.capabilities.includes('AnalyzeInbox'), true);
  });
});

test('capabilities router fails fast when Graph read is enabled without required credentials', () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_TENANT_ID: process.env.ARCANA_GRAPH_TENANT_ID,
    ARCANA_GRAPH_CLIENT_ID: process.env.ARCANA_GRAPH_CLIENT_ID,
    ARCANA_GRAPH_CLIENT_SECRET: process.env.ARCANA_GRAPH_CLIENT_SECRET,
    ARCANA_GRAPH_USER_ID: process.env.ARCANA_GRAPH_USER_ID,
    ARCANA_GRAPH_FULL_TENANT: process.env.ARCANA_GRAPH_FULL_TENANT,
    ARCANA_GRAPH_USER_SCOPE: process.env.ARCANA_GRAPH_USER_SCOPE,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'true';
  delete process.env.ARCANA_GRAPH_FULL_TENANT;
  delete process.env.ARCANA_GRAPH_USER_SCOPE;
  delete process.env.ARCANA_GRAPH_TENANT_ID;
  delete process.env.ARCANA_GRAPH_CLIENT_ID;
  delete process.env.ARCANA_GRAPH_CLIENT_SECRET;
  delete process.env.ARCANA_GRAPH_USER_ID;

  try {
    assert.throws(
      () =>
        createCapabilitiesRouter({
          authStore: {
            async addAuditEvent() {},
          },
          tenantConfigStore: {
            async getTenantConfig() {
              return {};
            },
          },
          requireAuth(_req, _res, next) {
            next();
          },
          requireRole() {
            return (_req, _res, next) => next();
          },
          executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
          capabilityAnalysisStore: null,
          templateStore: null,
        }),
      /ARCANA_GRAPH_READ_ENABLED=true requires: ARCANA_GRAPH_TENANT_ID, ARCANA_GRAPH_CLIENT_ID, ARCANA_GRAPH_CLIENT_SECRET\./
    );
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('capabilities router allows Graph full-tenant mode without ARCANA_GRAPH_USER_ID', () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_TENANT_ID: process.env.ARCANA_GRAPH_TENANT_ID,
    ARCANA_GRAPH_CLIENT_ID: process.env.ARCANA_GRAPH_CLIENT_ID,
    ARCANA_GRAPH_CLIENT_SECRET: process.env.ARCANA_GRAPH_CLIENT_SECRET,
    ARCANA_GRAPH_USER_ID: process.env.ARCANA_GRAPH_USER_ID,
    ARCANA_GRAPH_FULL_TENANT: process.env.ARCANA_GRAPH_FULL_TENANT,
    ARCANA_GRAPH_USER_SCOPE: process.env.ARCANA_GRAPH_USER_SCOPE,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'true';
  process.env.ARCANA_GRAPH_TENANT_ID = 'tenant-id';
  process.env.ARCANA_GRAPH_CLIENT_ID = 'client-id';
  process.env.ARCANA_GRAPH_CLIENT_SECRET = 'client-secret';
  process.env.ARCANA_GRAPH_FULL_TENANT = 'true';
  process.env.ARCANA_GRAPH_USER_SCOPE = 'all';
  delete process.env.ARCANA_GRAPH_USER_ID;

  try {
    assert.doesNotThrow(() =>
      createCapabilitiesRouter({
        authStore: {
          async addAuditEvent() {},
        },
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth(_req, _res, next) {
          next();
        },
        requireRole() {
          return (_req, _res, next) => next();
        },
        executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
        capabilityAnalysisStore: null,
        templateStore: null,
        graphReadConnectorFactory() {
          return {
            async fetchInboxSnapshot() {
              return {
                snapshotVersion: 'graph.inbox.snapshot.v1',
                conversations: [],
                timestamps: { capturedAt: new Date().toISOString() },
                metadata: {},
              };
            },
          };
        },
      })
    );
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('AnalyzeInbox uses locked default Graph read allowlist when ARCANA_MAILBOX_ALLOWLIST is missing', async () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_FULL_TENANT: process.env.ARCANA_GRAPH_FULL_TENANT,
    ARCANA_GRAPH_USER_SCOPE: process.env.ARCANA_GRAPH_USER_SCOPE,
    ARCANA_GRAPH_MAILBOX_IDS: process.env.ARCANA_GRAPH_MAILBOX_IDS,
    ARCANA_MAILBOX_ALLOWLIST: process.env.ARCANA_MAILBOX_ALLOWLIST,
    ARCANA_GRAPH_SEND_ALLOWLIST: process.env.ARCANA_GRAPH_SEND_ALLOWLIST,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'true';
  process.env.ARCANA_GRAPH_FULL_TENANT = 'false';
  process.env.ARCANA_GRAPH_USER_SCOPE = 'single';
  delete process.env.ARCANA_GRAPH_MAILBOX_IDS;
  delete process.env.ARCANA_MAILBOX_ALLOWLIST;
  process.env.ARCANA_GRAPH_SEND_ALLOWLIST =
    'contact@hairtpclinic.com; info@hairtpclinic.com';

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-allowlist-fallback-'));
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

  const graphCalls = [];
  const graphReadConnector = {
    async fetchInboxSnapshot(options = {}) {
      graphCalls.push({ ...options });
      return {
        snapshotVersion: 'graph.inbox.snapshot.v1',
        timestamps: {
          capturedAt: '2026-03-02T10:00:00.000Z',
        },
        conversations: [],
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
      templateStore: null,
      graphReadConnector,
    })
  );

  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-allowlist-fallback-1',
        },
        body: JSON.stringify({
          channel: 'admin',
          input: {
            maxDrafts: 1,
          },
        }),
      });
      assert.equal(response.status, 200);
    });

    assert.equal(graphCalls.length, 1);
    assert.equal(graphCalls[0].allowlistMode, true);
    assert.equal(graphCalls[0].fullTenant, true);
    assert.equal(graphCalls[0].userScope, 'all');
    assert.deepEqual(graphCalls[0].allowlistMailboxIds, [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ]);
    assert.deepEqual(graphCalls[0].mailboxIds, [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ]);
    assert.deepEqual(graphCalls[0].mailboxIndexes, []);

    const audits = await authStore.listAuditEvents({
      tenantId: 'tenant-a',
      limit: 200,
    });
    const readStartEvent = audits.find((event) => event.action === 'mailbox.read.start');
    assert.equal(Boolean(readStartEvent), true);
    assert.equal(readStartEvent.metadata.allowlistMode, true);
    assert.deepEqual(readStartEvent.metadata.allowlistMailboxIds, [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ]);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('AnalyzeInbox still uses locked default Graph read allowlist when send allowlist is wildcard-only', async () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_FULL_TENANT: process.env.ARCANA_GRAPH_FULL_TENANT,
    ARCANA_GRAPH_USER_SCOPE: process.env.ARCANA_GRAPH_USER_SCOPE,
    ARCANA_GRAPH_MAILBOX_IDS: process.env.ARCANA_GRAPH_MAILBOX_IDS,
    ARCANA_MAILBOX_ALLOWLIST: process.env.ARCANA_MAILBOX_ALLOWLIST,
    ARCANA_GRAPH_SEND_ALLOWLIST: process.env.ARCANA_GRAPH_SEND_ALLOWLIST,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'true';
  process.env.ARCANA_GRAPH_FULL_TENANT = 'false';
  process.env.ARCANA_GRAPH_USER_SCOPE = 'single';
  delete process.env.ARCANA_GRAPH_MAILBOX_IDS;
  delete process.env.ARCANA_MAILBOX_ALLOWLIST;
  process.env.ARCANA_GRAPH_SEND_ALLOWLIST = '*';

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-allowlist-wildcard-'));
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

  const graphCalls = [];
  const graphReadConnector = {
    async fetchInboxSnapshot(options = {}) {
      graphCalls.push({ ...options });
      return {
        snapshotVersion: 'graph.inbox.snapshot.v1',
        timestamps: {
          capturedAt: '2026-03-02T10:00:00.000Z',
        },
        conversations: [],
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
      templateStore: null,
      graphReadConnector,
    })
  );

  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-allowlist-wildcard-1',
        },
        body: JSON.stringify({
          channel: 'admin',
          input: {
            maxDrafts: 1,
          },
        }),
      });
      assert.equal(response.status, 200);
    });

    assert.equal(graphCalls.length, 1);
    assert.equal(graphCalls[0].allowlistMode, true);
    assert.equal(graphCalls[0].fullTenant, true);
    assert.equal(graphCalls[0].userScope, 'all');
    assert.deepEqual(graphCalls[0].allowlistMailboxIds, [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ]);
    assert.deepEqual(graphCalls[0].mailboxIds, [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ]);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('AnalyzeInbox ignores ARCANA_GRAPH_MAILBOX_IDS outside locked allowlist', async () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_FULL_TENANT: process.env.ARCANA_GRAPH_FULL_TENANT,
    ARCANA_GRAPH_USER_SCOPE: process.env.ARCANA_GRAPH_USER_SCOPE,
    ARCANA_GRAPH_MAILBOX_IDS: process.env.ARCANA_GRAPH_MAILBOX_IDS,
    ARCANA_MAILBOX_ALLOWLIST: process.env.ARCANA_MAILBOX_ALLOWLIST,
    ARCANA_GRAPH_SEND_ALLOWLIST: process.env.ARCANA_GRAPH_SEND_ALLOWLIST,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'true';
  process.env.ARCANA_GRAPH_FULL_TENANT = 'false';
  process.env.ARCANA_GRAPH_USER_SCOPE = 'single';
  process.env.ARCANA_GRAPH_MAILBOX_IDS =
    'arya@hairtpclinic.com,contact@hairtpclinic.com,clara@hairtpclinic.com';
  delete process.env.ARCANA_MAILBOX_ALLOWLIST;
  process.env.ARCANA_GRAPH_SEND_ALLOWLIST =
    'contact@hairtpclinic.com; info@hairtpclinic.com';

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-capability-allowlist-locked-'));
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

  const graphCalls = [];
  const graphReadConnector = {
    async fetchInboxSnapshot(options = {}) {
      graphCalls.push({ ...options });
      return {
        snapshotVersion: 'graph.inbox.snapshot.v1',
        timestamps: {
          capturedAt: '2026-03-02T10:00:00.000Z',
        },
        conversations: [],
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
      templateStore: null,
      graphReadConnector,
    })
  );

  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/capabilities/AnalyzeInbox/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-allowlist-locked-1',
        },
        body: JSON.stringify({
          channel: 'admin',
          input: {
            maxDrafts: 1,
          },
        }),
      });
      assert.equal(response.status, 200);
    });

    assert.equal(graphCalls.length, 1);
    assert.equal(graphCalls[0].allowlistMode, true);
    assert.deepEqual(graphCalls[0].mailboxIds, [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ]);
    assert.equal(graphCalls[0].mailboxIds.includes('arya@hairtpclinic.com'), false);
    assert.equal(graphCalls[0].mailboxIds.includes('clara@hairtpclinic.com'), false);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
