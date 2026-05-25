const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createMonitorRouter } = require('../../src/routes/monitor');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('monitor executive-feed includes SLO/governance owner hints and synthetic entries', async () => {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'tenant-a', userId: 'owner-1', role: 'OWNER' };
    next();
  };
  const requireRole = () => (_req, _res, next) => next();

  app.use(
    '/api/v1',
    createMonitorRouter({
      authStore: {
        async listTenantMembers() {
          return [];
        },
        async listAuditEvents() {
          return [];
        },
        async getLatestAuditEvent() {
          return null;
        },
        async addAuditEvent() {
          return true;
        },
      },
      templateStore: {
        async listTemplates() {
          return [];
        },
        async summarizeRisk() {
          return { highCriticalOpen: [], topReasonCodes: [] };
        },
        async summarizeIncidents() {
          return { totals: { openUnresolved: 0, breachedOpen: 0 } };
        },
      },
      tenantConfigStore: {
        async getTenantConfig() {
          return { assistantName: 'Arcana', toneStyle: 'neutral' };
        },
      },
      sloTicketStore: {
        summarize() {
          return {
            totals: { open: 3, openBreaches: 2, tickets: 3, resolved: 0 },
            latestOpenAt: new Date().toISOString(),
          };
        },
      },
      releaseGovernanceStore: {
        async getLatestCycle() {
          return {
            cycle: { cycleId: 'rel_1', phase: 'go_no_go' },
            evaluation: { goAllowed: false, blockingFindings: [{ id: 'b1' }] },
          };
        },
      },
      executiveDecisionFeed: {
        list() {
          return [{ id: 'feed_1', status: 'pending', title: 'Existing feed row' }];
        },
        getSummary() {
          return { totalActive: 1, ownerActionRequired: 1 };
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
      },
      scheduler: null,
      requireAuth,
      requireRole,
      runtimeState: {},
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/monitor/executive-feed?limit=10`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.tenantId, 'tenant-a');
    assert.ok(Array.isArray(payload.entries));
    assert.ok(payload.entries.some((row) => row.id === 'slo_open_breaches_tenant-a'));
    assert.ok(payload.entries.some((row) => row.id === 'release_governance_blockers_tenant-a'));
    assert.ok(payload.entries.some((row) => row.id === 'feed_1'));
    assert.ok(Array.isArray(payload.ownerHints));
    assert.ok(payload.ownerHints.some((row) => row.actionEndpoint === '/api/v1/monitor/slo'));
    assert.ok(payload.ownerHints.some((row) => row.actionEndpoint === '/api/v1/monitor/readiness'));
  });
});
