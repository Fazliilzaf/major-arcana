const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createExecutionGateway } = require('../../src/gateway/executionGateway');
const { createMonitorRouter } = require('../../src/routes/monitor');

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

function createRequireAuth(role = 'OWNER') {
  return (req, _res, next) => {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role,
    };
    next();
  };
}

function createRequireRole(...roles) {
  const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
  return (req, res, next) => {
    const role = String(req.auth?.role || '').toUpperCase();
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
    }
    return next();
  };
}

async function seedDeadLetter(executionGateway) {
  await executionGateway.run({
    context: {
      tenant_id: 'tenant-a',
      channel: 'template',
      intent: 'generate_draft',
      payload: { instruction: 'hej' },
      correlation_id: 'corr-monitor-dlq',
      idempotency_key: 'dlq-monitor-seed',
    },
    handlers: {
      inputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
      agentRun: async () => {
        throw new Error('seed dead letter');
      },
      outputRisk: async () => ({ decision: 'allow', riskLevel: 1, riskScore: 1 }),
      policyFloor: async () => ({ blocked: false, maxFloor: 1, hits: [] }),
    },
  });
}

function createRouter({ executionGateway, role = 'OWNER' }) {
  return createMonitorRouter({
    authStore: {
      async addAuditEvent(event) {
        return event;
      },
      async listAuditEvents() {
        return [];
      },
      async listTenantMembers() {
        return [];
      },
    },
    templateStore: {},
    tenantConfigStore: {},
    executionGateway,
    config: {},
    requireAuth: createRequireAuth(role),
    requireRole: createRequireRole,
    runtimeState: {
      ready: true,
      startedAt: new Date().toISOString(),
    },
  });
}

test('monitor gateway dead-letters returns tenant scoped entries', async () => {
  const executionGateway = createExecutionGateway({
    agentRetryMaxAttempts: 1,
  });
  await seedDeadLetter(executionGateway);

  const app = express();
  app.use('/api/v1', createRouter({ executionGateway, role: 'OWNER' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitor/gateway/dead-letters?limit=10`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.tenantId, 'tenant-a');
    assert.equal(Array.isArray(payload.deadLetters), true);
    assert.equal(payload.count > 0, true);
    assert.equal(payload.deadLetters[payload.deadLetters.length - 1].tenantId, 'tenant-a');
    assert.equal(payload.runtime?.deadLetters?.entries >= 1, true);
  });
});

test('monitor gateway dead-letters blocks cross-tenant read for STAFF', async () => {
  const executionGateway = createExecutionGateway({
    agentRetryMaxAttempts: 1,
  });
  const app = express();
  app.use('/api/v1', createRouter({ executionGateway, role: 'STAFF' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/monitor/gateway/dead-letters?tenantId=tenant-b&limit=5`
    );
    assert.equal(response.status, 403);
  });
});

test('monitor gateway dead-letters clamps limit between 1 and 200', async () => {
  const executionGateway = createExecutionGateway({
    agentRetryMaxAttempts: 1,
  });
  const app = express();
  app.use('/api/v1', createRouter({ executionGateway, role: 'OWNER' }));

  await withServer(app, async (baseUrl) => {
    const high = await fetch(`${baseUrl}/api/v1/monitor/gateway/dead-letters?limit=9999`);
    assert.equal(high.status, 200);
    assert.equal((await high.json()).limit, 200);

    const low = await fetch(`${baseUrl}/api/v1/monitor/gateway/dead-letters?limit=0`);
    assert.equal(low.status, 200);
    assert.equal((await low.json()).limit, 1);
  });
});

test('monitor gateway dead-letters returns empty when gateway has no dead letters', async () => {
  const executionGateway = createExecutionGateway({
    agentRetryMaxAttempts: 1,
  });
  const app = express();
  app.use('/api/v1', createRouter({ executionGateway, role: 'OWNER' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitor/gateway/dead-letters?limit=10`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.count, 0);
    assert.deepEqual(payload.deadLetters, []);
  });
});

test('monitor gateway dead-letters allows STAFF for explicit own tenant', async () => {
  const executionGateway = createExecutionGateway({
    agentRetryMaxAttempts: 1,
  });
  await seedDeadLetter(executionGateway);
  const app = express();
  app.use('/api/v1', createRouter({ executionGateway, role: 'STAFF' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/monitor/gateway/dead-letters?tenantId=tenant-a&limit=5`
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.tenantId, 'tenant-a');
    assert.equal(payload.count > 0, true);
  });
});

test('monitor gateway dead-letters allows OWNER to read another tenant scope', async () => {
  const executionGateway = createExecutionGateway({
    agentRetryMaxAttempts: 1,
  });
  await seedDeadLetter(executionGateway);
  const app = express();
  app.use('/api/v1', createRouter({ executionGateway, role: 'OWNER' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/monitor/gateway/dead-letters?tenantId=tenant-b&limit=10`
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.tenantId, 'tenant-b');
    assert.equal(Array.isArray(payload.deadLetters), true);
  });
});
