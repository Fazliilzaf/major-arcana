const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { SummarizeMarketingPerformanceCapability } = require('../../src/capabilities/summarizeMarketingPerformance');
const {
  CONNECTOR_STATUS,
  fetchChannelMetrics,
  listConnectorStatuses,
  mergeMarketingPerformanceFromConnectors,
  snapshotHasFreshMarketingPerformance,
} = require('../../src/ops/cmoMarketingConnectors');
const { summarizeMarketingPerformance } = require('../../src/ops/cmoMarketingMetrics');
const { createMarketingWorkspaceRouter } = require('../../src/routes/marketingWorkspace');

function fixtureConnectorConfig(overrides = {}) {
  return {
    marketingConnectorsEnabled: true,
    marketingConnectorsMode: 'fixture',
    marketingConnectors: {
      google_ads: { enabled: true, mode: 'fixture' },
      meta: { enabled: true, mode: 'fixture' },
      linkedin: { enabled: false },
      mail: { enabled: false },
      ...overrides.marketingConnectors,
    },
    ...overrides,
  };
}

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

test('fetchChannelMetrics returns fixture metrics when connector enabled in fixture mode', async () => {
  const result = await fetchChannelMetrics({
    channel: 'google_ads',
    config: fixtureConnectorConfig(),
  });
  assert.equal(result.status, CONNECTOR_STATUS.OK);
  assert.equal(result.mode, 'fixture');
  assert.ok(result.channelBlock?.metrics?.ctr?.fresh);
  assert.equal(result.channelBlock.source, 'google_ads');
});

test('fetchChannelMetrics uses fixture when credentials exist but live fetch disabled', async () => {
  const result = await fetchChannelMetrics({
    channel: 'meta',
    config: fixtureConnectorConfig({
      marketingConnectors: {
        meta: {
          enabled: true,
          mode: 'live',
          accessToken: 'token-123',
          apiBaseUrl: 'https://meta.example.test',
          liveFetch: false,
        },
      },
    }),
  });
  assert.equal(result.status, CONNECTOR_STATUS.OK);
  assert.equal(result.mode, 'fixture');
  assert.match(result.message, /live fetch disabled/i);
});

test('mergeMarketingPerformanceFromConnectors hydrates snapshot without fresh metrics', async () => {
  const merged = await mergeMarketingPerformanceFromConnectors(
    { tenantConfig: { tenantId: 'tenant-a' } },
    { config: fixtureConnectorConfig() }
  );
  assert.equal(merged.merged, true);
  assert.ok(merged.snapshot.marketingPerformance.channels.google_ads);
  assert.ok(merged.snapshot.marketingPerformance.channels.meta);
  assert.equal(snapshotHasFreshMarketingPerformance(merged.snapshot), true);
  const summary = summarizeMarketingPerformance(merged.snapshot);
  assert.equal(summary.status, 'ok');
  assert.ok(summary.freshMetricCount >= 2);
});

test('mergeMarketingPerformanceFromConnectors skips when snapshot already has fresh metrics', async () => {
  const fetchedAt = new Date().toISOString();
  const snapshot = {
    marketingPerformance: {
      channels: {
        google_ads: {
          source: 'google_ads',
          window: '7d',
          fetchedAt,
          fresh: true,
          metrics: {
            ctr: { value: 0.02, source: 'google_ads', window: '7d', fetchedAt, fresh: true },
          },
        },
      },
    },
  };
  const merged = await mergeMarketingPerformanceFromConnectors(snapshot, {
    config: fixtureConnectorConfig(),
  });
  assert.equal(merged.merged, false);
  assert.equal(merged.connectorResults.length, 0);
});

test('SummarizeMarketingPerformanceCapability hydrates from connectors when snapshot is empty', async () => {
  const capability = new SummarizeMarketingPerformanceCapability();
  const result = await capability.execute({
    tenantId: 'tenant-a',
    systemStateSnapshot: {
      appConfig: fixtureConnectorConfig(),
    },
  });
  assert.equal(result.data.status, 'ok');
  assert.ok(result.data.freshMetricCount >= 2);
  assert.ok(result.warnings.some((item) => /Connector hydration/i.test(item)));
});

test('GET /marketing/connectors/status returns connector summary', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    createMarketingWorkspaceRouter({
      authStore: {},
      marketingCampaignDraftsStore: null,
      config: fixtureConnectorConfig(),
      requireAuth: (req, _res, next) => {
        req.auth = { tenantId: 'default', role: 'OWNER' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/marketing/connectors/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.items.length >= 4);
    assert.ok(body.summary.ok >= 2);
  });
});

test('listConnectorStatuses returns not_configured without enabled connectors', async () => {
  const statuses = await listConnectorStatuses({
    config: {
      marketingConnectorsEnabled: false,
      marketingConnectors: {
        google_ads: { enabled: false },
        meta: { enabled: false },
        linkedin: { enabled: false },
        mail: { enabled: false },
      },
    },
  });
  assert.ok(statuses.length >= 4);
  assert.ok(statuses.every((item) => item.status === CONNECTOR_STATUS.NOT_CONFIGURED));
});
