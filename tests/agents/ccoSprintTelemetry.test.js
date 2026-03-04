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

function createTenantConfigStore() {
  return {
    async getTenantConfig() {
      return {
        riskSensitivityModifier: 0,
        riskThresholdVersion: 1,
      };
    },
  };
}

test('CCO sprint telemetry route writes start/item/complete audit events', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-sprint-events-'));
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
      tenantConfigStore: createTenantConfigStore(),
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
      graphReadConnector: null,
      graphSendConnector: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const startResponse = await fetch(`${baseUrl}/api/v1/cco/sprint/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType: 'start',
        sprintId: 'sprint-telemetry-1',
        queueSize: 3,
        criticalCount: 1,
        highCount: 1,
      }),
    });
    assert.equal(startResponse.status, 200);

    const itemResponse = await fetch(`${baseUrl}/api/v1/cco/sprint/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType: 'item_completed',
        sprintId: 'sprint-telemetry-1',
        conversationId: 'conv-1',
        priorityLevel: 'High',
        slaAge: '26.0h',
        handledAt: new Date().toISOString(),
      }),
    });
    assert.equal(itemResponse.status, 200);

    const completeResponse = await fetch(`${baseUrl}/api/v1/cco/sprint/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType: 'complete',
        sprintId: 'sprint-telemetry-1',
        durationMs: 240000,
        itemsCompleted: 3,
        remainingHigh: 0,
        remainingCritical: 0,
      }),
    });
    assert.equal(completeResponse.status, 200);
  });

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 200,
  });
  const startEvent = audits.find((event) => event.action === 'cco.sprint.start');
  const itemEvent = audits.find((event) => event.action === 'cco.sprint.item_completed');
  const completeEvent = audits.find((event) => event.action === 'cco.sprint.complete');
  assert.ok(startEvent);
  assert.ok(itemEvent);
  assert.ok(completeEvent);
  assert.equal(startEvent.metadata.queueSize, 3);
  assert.equal(startEvent.metadata.criticalCount, 1);
  assert.equal(startEvent.metadata.highCount, 1);
  assert.equal(itemEvent.metadata.conversationId, 'conv-1');
  assert.equal(itemEvent.metadata.priorityLevel, 'High');
  assert.equal(completeEvent.metadata.itemsCompleted, 3);
  assert.equal(completeEvent.metadata.remainingCritical, 0);
});

test('CCO metrics endpoint returns sprint KPIs and stress proxy index', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-metrics-'));
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

  await analysisStore.append({
    tenantId: 'tenant-a',
    capability: {
      name: 'CCO.InboxAnalysis',
      version: '1.0.0',
      persistStrategy: 'analysis',
    },
    decision: 'allow',
    runId: 'run-cco-metrics-1',
    capabilityRunId: 'cap-run-cco-metrics-1',
    correlationId: 'corr-cco-metrics-1',
    actor: {
      id: 'owner-a',
      role: 'OWNER',
    },
    output: {
      data: {
        conversationWorklist: [
          {
            conversationId: 'conv-critical',
            priorityLevel: 'Critical',
            hoursSinceInbound: 52,
            needsReplyStatus: 'needs_reply',
          },
          {
            conversationId: 'conv-high',
            priorityLevel: 'High',
            hoursSinceInbound: 26,
            needsReplyStatus: 'needs_reply',
          },
          {
            conversationId: 'conv-low',
            priorityLevel: 'Low',
            hoursSinceInbound: 4,
            needsReplyStatus: 'needs_reply',
          },
          {
            conversationId: 'conv-handled',
            priorityLevel: 'Medium',
            hoursSinceInbound: 2,
            needsReplyStatus: 'handled',
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
      tenantConfigStore: createTenantConfigStore(),
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
      graphReadConnector: null,
      graphSendConnector: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const postEvent = async (payload) =>
      fetch(`${baseUrl}/api/v1/cco/sprint/event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

    let response = await postEvent({
      eventType: 'start',
      sprintId: 'sprint-metrics-1',
      queueSize: 3,
      criticalCount: 1,
      highCount: 1,
    });
    assert.equal(response.status, 200);

    response = await postEvent({
      eventType: 'item_completed',
      sprintId: 'sprint-metrics-1',
      conversationId: 'conv-critical',
      priorityLevel: 'Critical',
      slaAgeHours: 26,
      handledAt: new Date().toISOString(),
    });
    assert.equal(response.status, 200);

    response = await postEvent({
      eventType: 'item_completed',
      sprintId: 'sprint-metrics-1',
      conversationId: 'conv-high',
      priorityLevel: 'High',
      slaAgeHours: 4,
      handledAt: new Date().toISOString(),
    });
    assert.equal(response.status, 200);

    response = await postEvent({
      eventType: 'complete',
      sprintId: 'sprint-metrics-1',
      durationMs: 600000,
      itemsCompleted: 3,
      remainingHigh: 0,
      remainingCritical: 0,
    });
    assert.equal(response.status, 200);

    response = await postEvent({
      eventType: 'start',
      sprintId: 'sprint-metrics-2',
      queueSize: 2,
      criticalCount: 0,
      highCount: 1,
    });
    assert.equal(response.status, 200);

    const metricsResponse = await fetch(`${baseUrl}/api/v1/cco/metrics?since=7d`);
    assert.equal(metricsResponse.status, 200);
    const metrics = await metricsResponse.json();

    assert.equal(metrics.avgResponseTimeHours, 15);
    assert.equal(metrics.criticalOver48hCount, 1);
    assert.equal(metrics.avgSprintDurationMinutes, 10);
    assert.equal(metrics.avgItemsPerSprint, 3);
    assert.equal(metrics.sprintCompletionRate, 50);
    assert.equal(metrics.stressProxyIndex.score, 8);
    assert.equal(metrics.stressProxyIndex.level, 'High');
    assert.equal(metrics.latestSprintFeedback.sprintId, 'sprint-metrics-1');
    assert.equal(metrics.latestSprintFeedback.itemsCompleted, 3);
    assert.equal(metrics.latestSprintFeedback.resolvedCritical, 1);
    assert.equal(metrics.latestSprintFeedback.slaImproved, true);
  });
});

test('CCO usage event route logs indicator override set/cleared audit events', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-usage-events-'));
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
      tenantConfigStore: createTenantConfigStore(),
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
      graphReadConnector: null,
      graphSendConnector: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const setResponse = await fetch(`${baseUrl}/api/v1/cco/usage/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType: 'indicator_override_set',
        conversationId: 'conv-override-1',
        overrideState: 'high',
        overrideBy: 'owner-a',
        overrideAt: new Date().toISOString(),
      }),
    });
    assert.equal(setResponse.status, 200);

    const clearResponse = await fetch(`${baseUrl}/api/v1/cco/usage/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType: 'indicator_override_cleared',
        conversationId: 'conv-override-1',
        clearedAt: new Date().toISOString(),
      }),
    });
    assert.equal(clearResponse.status, 200);
  });

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 200,
  });
  const setEvent = audits.find((event) => event.action === 'cco.indicator.override.set');
  const clearEvent = audits.find((event) => event.action === 'cco.indicator.override.cleared');
  assert.ok(setEvent);
  assert.ok(clearEvent);
  assert.equal(setEvent.metadata.conversationId, 'conv-override-1');
  assert.equal(setEvent.metadata.overrideState, 'high');
  assert.equal(clearEvent.metadata.conversationId, 'conv-override-1');
});
