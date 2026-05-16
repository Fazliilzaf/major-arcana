const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

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

function createRouter({ runtimeMetricsStore, role = 'OWNER', auditEvents = [] }) {
  return createMonitorRouter({
    authStore: {
      async addAuditEvent(event) {
        auditEvents.push(event);
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
    executionGateway: null,
    config: {},
    requireAuth: createRequireAuth(role),
    requireRole: createRequireRole,
    runtimeState: {
      ready: true,
      startedAt: new Date().toISOString(),
    },
    runtimeMetricsStore,
  });
}

test('monitor metrics reset clears the runtime window for OWNER', async () => {
  const auditEvents = [];
  const runtimeMetricsStore = {
    resetCalls: 0,
    reset() {
      this.resetCalls += 1;
      return {
        totals: {
          requests: 0,
          sampledRequests: 0,
        },
      };
    },
    getSnapshot() {
      return {
        totals: {
          requests: 4,
          sampledRequests: 4,
        },
        latency: {
          p95Ms: 2400,
        },
      };
    },
  };

  const app = express();
  app.use('/api/v1', createRouter({ runtimeMetricsStore, role: 'OWNER', auditEvents }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitor/metrics/reset`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.snapshot.totals.sampledRequests, 0);
    assert.equal(runtimeMetricsStore.resetCalls, 1);
    assert.equal(auditEvents.at(-1)?.action, 'monitor.metrics.reset');
  });
});

test('monitor metrics reset requires OWNER role', async () => {
  const runtimeMetricsStore = {
    reset() {
      return {
        totals: {
          requests: 0,
          sampledRequests: 0,
        },
      };
    },
    getSnapshot() {
      return {
        totals: {
          requests: 1,
          sampledRequests: 1,
        },
        latency: {
          p95Ms: 100,
        },
      };
    },
  };

  const app = express();
  app.use('/api/v1', createRouter({ runtimeMetricsStore, role: 'STAFF' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitor/metrics/reset`, {
      method: 'POST',
    });
    assert.equal(response.status, 403);
  });
});
