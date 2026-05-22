#!/usr/bin/env node
'use strict';

/**
 * Fas O — marketing connector smoke (staging/prod rollout helper).
 *
 * Kör alltid in-process fixture + hydration. Valfritt HTTP mot körande server
 * och live-fetch om credentials finns i env.
 *
 *   npm run smoke:cmo-connectors
 *   ARCANA_SMOKE_BASE_URL=https://staging.example ARCANA_SMOKE_TOKEN=... npm run smoke:cmo-connectors
 */

const {
  CONNECTOR_STATUS,
  fetchChannelMetrics,
  listConnectorStatuses,
  mergeMarketingPerformanceFromConnectors,
} = require('../src/ops/cmoMarketingConnectors');
const { summarizeMarketingPerformance } = require('../src/ops/cmoMarketingMetrics');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exitCode = 1;
    throw new Error(message);
  }
}

function fixtureConfig(overrides = {}) {
  return {
    marketingConnectorsEnabled: true,
    marketingConnectorsMode: 'fixture',
    marketingConnectorsLiveFetch: false,
    marketingConnectors: {
      google_ads: { enabled: true, mode: 'fixture' },
      meta: { enabled: true, mode: 'fixture' },
      linkedin: { enabled: true, mode: 'fixture' },
      mail: { enabled: false },
      ...overrides.marketingConnectors,
    },
    ...overrides,
  };
}

async function smokeFixtureConnectors() {
  const config = fixtureConfig();
  const statuses = await listConnectorStatuses({ config, window: '7d' });
  const ok = statuses.filter((item) => item.status === CONNECTOR_STATUS.OK);
  assert(ok.length >= 2, `expected >=2 ok fixture connectors, got ${ok.length}`);
  assert(
    ok.every((item) => item.mode === 'fixture'),
    'fixture rollout should not invoke live mode'
  );
  console.log(`OK fixture connectors (${ok.length} ok: ${ok.map((i) => i.channel).join(', ')})`);
}

async function smokeRollbackPath() {
  const config = fixtureConfig({
    marketingConnectorsMode: 'live',
    marketingConnectorsLiveFetch: false,
    marketingConnectors: {
      google_ads: {
        enabled: true,
        mode: 'live',
        accessToken: 'smoke-token',
        customerId: '123',
        developerToken: 'dev',
        liveFetch: false,
      },
    },
  });
  const result = await fetchChannelMetrics({ channel: 'google_ads', config });
  assert(result.status === CONNECTOR_STATUS.OK, 'rollback path should still return fixture ok');
  assert(result.mode === 'fixture', 'LIVE_FETCH=false should force fixture mode');
  console.log('OK rollback path (live credentials + liveFetch off → fixture)');
}

async function smokeAnalyticsHydration() {
  const config = fixtureConfig();
  const merged = await mergeMarketingPerformanceFromConnectors(
    { marketingPerformance: { channels: {} } },
    { config, tenantId: 'default', forceRefresh: true, window: '7d' }
  );
  assert(merged.merged === true, 'connectors should hydrate empty snapshot');
  const summary = summarizeMarketingPerformance({
    marketingPerformance: merged.snapshot.marketingPerformance,
  });
  assert(summary.status === 'ok', `expected analytics ok, got ${summary.status}`);
  assert(summary.freshMetricCount >= 1, 'hydrated metrics should be fresh');
  console.log(`OK analytics hydration (status=${summary.status}, fresh=${summary.freshMetricCount})`);
}

async function smokeDisabledConnectors() {
  const config = {
    marketingConnectorsEnabled: false,
    marketingConnectorsMode: 'off',
  };
  const statuses = await listConnectorStatuses({ config });
  const configured = statuses.filter((item) => item.status !== CONNECTOR_STATUS.NOT_CONFIGURED);
  assert(configured.length === 0, 'disabled connectors should report not_configured');
  console.log('OK connectors disabled (deploy step 1)');
}

async function smokeLiveOptional() {
  const mode = String(process.env.ARCANA_MARKETING_CONNECTORS_MODE || '').toLowerCase();
  const liveFetch = String(process.env.ARCANA_MARKETING_CONNECTORS_LIVE_FETCH || '').toLowerCase() === 'true';
  if (mode !== 'live' || !liveFetch) {
    console.log('SKIP live fetch (set ARCANA_MARKETING_CONNECTORS_MODE=live + LIVE_FETCH=true)');
    return;
  }

  const config = require('../config');
  const appConfig = config.config || config;
  const channels = ['google_ads', 'meta', 'linkedin'].filter((channel) => {
    const block = appConfig.marketingConnectors?.[channel] || appConfig.marketing?.connectors?.[channel];
    return block?.enabled === true || appConfig.marketingConnectorsEnabled === true;
  });

  if (!channels.length) {
    console.log('SKIP live fetch (no enabled channels in config)');
    return;
  }

  let okCount = 0;
  for (const channel of channels) {
    const result = await fetchChannelMetrics({ channel, config: appConfig, window: '7d' });
    console.log(`  live ${channel}: ${result.status} (${result.mode}) ${result.message || ''}`);
    if (result.status === CONNECTOR_STATUS.OK) okCount += 1;
  }
  assert(okCount >= 1, 'live mode requires at least one channel status ok');
  console.log(`OK live connectors (${okCount}/${channels.length} ok)`);
}

async function smokeHttpOptional() {
  const baseUrl = String(process.env.ARCANA_SMOKE_BASE_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.ARCANA_SMOKE_TOKEN || process.env.ARCANA_SMOKE_OWNER_TOKEN || '').trim();
  if (!baseUrl) {
    console.log('SKIP http (set ARCANA_SMOKE_BASE_URL + ARCANA_SMOKE_TOKEN)');
    return;
  }
  assert(token, 'ARCANA_SMOKE_TOKEN required when ARCANA_SMOKE_BASE_URL is set');

  const statusRes = await fetch(`${baseUrl}/api/v1/marketing/connectors/status?window=7d`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  assert(statusRes.ok, `connectors/status HTTP ${statusRes.status}`);
  const statusPayload = await statusRes.json();
  assert(Array.isArray(statusPayload.items), 'connectors/status must return items[]');
  console.log(
    `OK http connectors/status (ok=${statusPayload.summary?.ok ?? '?'}, total=${statusPayload.summary?.total ?? '?'})`
  );

  const analyticsRes = await fetch(`${baseUrl}/api/v1/agents/CMO/run`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ mode: 'analytics', period: 'weekly', channel: 'admin' }),
  });
  assert(analyticsRes.ok, `CMO analytics HTTP ${analyticsRes.status}`);
  const analyticsPayload = await analyticsRes.json();
  const analyticsStatus = analyticsPayload?.output?.data?.status || analyticsPayload?.data?.status;
  console.log(`OK http CMO analytics (status=${analyticsStatus || 'unknown'})`);
}

async function main() {
  console.log('CMO connector smoke — Fas O');
  await smokeDisabledConnectors();
  await smokeFixtureConnectors();
  await smokeRollbackPath();
  await smokeAnalyticsHydration();
  await smokeLiveOptional();
  await smokeHttpOptional();
  if (process.exitCode) process.exit(process.exitCode);
  console.log('CMO connector smoke passed');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
