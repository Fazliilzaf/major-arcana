const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createDashboardRouter } = require('../../src/routes/dashboard');
const { publishRuntimeEvent } = require('../../src/observability/eventBus');

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

function parseSseEnvelope(raw) {
  const lines = String(raw || '')
    .split('\n')
    .map((line) => line.trimEnd());
  let event = 'message';
  let id = '';
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('id:')) {
      id = line.slice(3).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  let data = null;
  const rawData = dataLines.join('\n');
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = { raw: rawData };
    }
  }

  return { event, id, data };
}

async function readSseUntil(stream, predicate, { timeoutMs = 3000 } = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let buffer = '';

  try {
    while (Date.now() < deadline) {
      const remainingMs = Math.max(0, deadline - Date.now());
      const readNext = reader.read();
      const timeout = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error('timeout'));
        }, remainingMs || 1);
      });

      const chunk = await Promise.race([readNext, timeout]);
      if (!chunk || chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');

      let splitIndex = buffer.indexOf('\n\n');
      while (splitIndex !== -1) {
        const raw = buffer.slice(0, splitIndex).trim();
        buffer = buffer.slice(splitIndex + 2);
        if (raw) {
          const envelope = parseSseEnvelope(raw);
          if (predicate(envelope)) {
            return envelope;
          }
        }
        splitIndex = buffer.indexOf('\n\n');
      }
    }
    throw new Error('timeout');
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancel errors on already-closed streams.
    }
  }
}

function createRequireAuth() {
  return (req, res, next) => {
    const authHeader = String(req.get('authorization') || '');
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ error: 'Inloggning krävs.' });
    }
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: 'OWNER',
    };
    return next();
  };
}

function createRequireRole(...roles) {
  const allowed = new Set(roles.map((value) => String(value || '').toUpperCase()));
  return (req, res, next) => {
    const role = String(req.auth?.role || '').toUpperCase();
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
    }
    return next();
  };
}

function createRouter() {
  return createDashboardRouter({
    templateStore: {
      async listTemplates() {
        return [];
      },
      async summarizeRisk() {
        return {
          totals: {
            evaluations: 0,
            highCriticalOpen: 0,
          },
          byLevel: {},
          byOwnerDecision: {},
          highCriticalOpen: [],
        };
      },
    },
    tenantConfigStore: {
      async getTenantConfig() {
        return {};
      },
    },
    authStore: {
      async listAuditEvents() {
        return [];
      },
      async addAuditEvent(event) {
        return event;
      },
    },
    runtimeMetricsStore: {
      getSnapshot() {
        return {
          totals: {
            requests: 10,
            sampledRequests: 10,
            statusBuckets: {
              '5xx': 1,
            },
          },
          latency: {
            p95Ms: 220,
            p99Ms: 480,
          },
        };
      },
    },
    scheduler: {
      getStatus() {
        return {
          enabled: true,
          started: true,
          jobs: [
            { id: 'alert_probe', running: false },
          ],
        };
      },
    },
    sloTicketStore: {
      async summarize() {
        return {
          totals: {
            open: 2,
            openBreaches: 1,
          },
        };
      },
    },
    releaseGovernanceStore: {
      async evaluateCycle() {
        return {
          cycle: {
            id: 'rel_1',
            status: 'planning',
          },
          evaluation: {
            releaseGatePassed: false,
            blockers: [{ id: 'signoff_missing' }],
          },
        };
      },
    },
    requireAuth: createRequireAuth(),
    requireRole: createRequireRole,
  });
}

test('dashboard owner stream requires auth token', async () => {
  const app = express();
  app.use('/api/v1', createRouter());

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/owner/stream`);
    assert.equal(response.status, 401);
  });
});

test('dashboard owner stream emits status snapshots', async () => {
  const app = express();
  app.use('/api/v1', createRouter());

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/owner/stream`, {
      headers: {
        authorization: 'Bearer test-token',
      },
    });
    assert.equal(response.status, 200);
    assert.ok(response.body);

    const envelope = await readSseUntil(
      response.body,
      (event) => event?.event === 'status' && Number(event?.data?.availability?.sampledRequests || 0) > 0,
      { timeoutMs: 3000 }
    );

    assert.equal(envelope.event, 'status');
    assert.equal(envelope.data.tenantId, 'tenant-a');
    assert.equal(envelope.data.availability.totalRequests, 10);
    assert.equal(envelope.data.availability.sampledRequests, 10);
    assert.equal(envelope.data.availability.errorRatePct, 10);
    assert.equal(envelope.data.incidents.open, 0);
    assert.equal(envelope.data.sloTickets.openBreaches, 1);
    assert.equal(envelope.data.releaseGovernance.cycleId, 'rel_1');
    assert.equal(envelope.data.releaseGovernance.releaseGatePassed, false);
  });
});

test('dashboard owner stream emits only same-tenant audit events', async () => {
  const app = express();
  app.use('/api/v1', createRouter());

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/owner/stream`, {
      headers: {
        authorization: 'Bearer test-token',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type')?.includes('text/event-stream'), true);
    assert.ok(response.body);

    await new Promise((resolve) => setTimeout(resolve, 80));

    publishRuntimeEvent('audit.event', {
      id: 'evt-wrong-tenant',
      tenantId: 'tenant-b',
      action: 'chat.response',
      outcome: 'success',
      targetType: 'chat',
      targetId: 'chat-1',
      metadata: {},
      ts: new Date().toISOString(),
    });

    publishRuntimeEvent('audit.event', {
      id: 'evt-right-tenant',
      tenantId: 'tenant-a',
      action: 'chat.response',
      outcome: 'success',
      targetType: 'chat',
      targetId: 'chat-2',
      metadata: {},
      ts: new Date().toISOString(),
    });

    const envelope = await readSseUntil(
      response.body,
      (event) => event?.event === 'audit' && event?.data?.id === 'evt-right-tenant',
      { timeoutMs: 3000 }
    );

    assert.equal(envelope.event, 'audit');
    assert.equal(envelope.data.id, 'evt-right-tenant');
    assert.equal(envelope.data.tenantId, 'tenant-a');
  });
});
