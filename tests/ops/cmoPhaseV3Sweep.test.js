const test = require('node:test');
const assert = require('node:assert/strict');

const {
  publishToExternalChannel,
  resolvePublishLiveEnabled,
  clearPublishIdempotencyCache,
} = require('../../src/ops/cmoPublishConnectors');
const { executePilotChannelPublish } = require('../../src/ops/cmoPublishPolicy');
const {
  mergeConnectorConfig,
  resolveTenantConnectorConfig,
  clearConnectorMetricsCache,
  fetchChannelMetrics,
} = require('../../src/ops/cmoMarketingConnectors');
const { resolveLiveAdapter, canFetchMail } = require('../../src/ops/cmoMarketingConnectorAdapters');
const { runCmoConnectorHealthCheck, CMO_SCHEDULER_JOB_IDS } = require('../../src/ops/cmoSchedulerJobs');
const { GenerateContentSeriesCapability, TRUST_SERIES_THEMES } = require('../../src/capabilities/generateContentSeries');

test('CMO scheduler includes connector health check job', () => {
  assert.ok(CMO_SCHEDULER_JOB_IDS.includes('cmo_connector_health_check'));
});

test('mergeConnectorConfig overlays tenant ad account ids', () => {
  const merged = mergeConnectorConfig(
    { enabled: true, adAccountId: 'global-123', accessToken: 'global-token' },
    { adAccountId: 'tenant-456' }
  );
  assert.equal(merged.adAccountId, 'tenant-456');
  assert.equal(merged.accessToken, 'global-token');
});

test('resolveTenantConnectorConfig reads marketing.connectors', () => {
  const connector = resolveTenantConnectorConfig(
    {
      marketing: {
        connectors: {
          linkedin: { adAccountId: 'tenant-li-1' },
        },
      },
    },
    'linkedin'
  );
  assert.equal(connector.adAccountId, 'tenant-li-1');
});

test('mail live adapter resolves when apiBaseUrl + token exist', () => {
  assert.equal(
    resolveLiveAdapter('mail', {
      apiBaseUrl: 'https://api.mail.example',
      accessToken: 'token',
    }),
    'mail'
  );
  assert.equal(canFetchMail({ apiBaseUrl: 'https://api.mail.example', apiKey: 'key' }), true);
});

test('publishToExternalChannel stays queued when live publish disabled', async () => {
  clearPublishIdempotencyCache();
  const result = await publishToExternalChannel({
    channel: 'linkedin',
    campaign: { id: 'c1', name: 'Launch', payload: { bodyOutline: 'Hej LinkedIn' } },
    tenantId: 'default',
    config: { marketingPublishLiveEnabled: false },
    correlationId: 'idem-1',
  });
  assert.equal(result.status, 'publish_queued');
  assert.equal(result.externalPublishInvoked, false);
});

test('publishToExternalChannel sandbox publishes linkedin when live enabled', async () => {
  clearPublishIdempotencyCache();
  const result = await publishToExternalChannel({
    channel: 'linkedin',
    campaign: { id: 'c2', name: 'Launch 2', payload: { bodyOutline: 'Sandbox post' } },
    tenantId: 'default',
    config: { marketingPublishLiveEnabled: true, marketingPublishSandbox: true },
    correlationId: 'idem-2',
  });
  assert.equal(result.status, 'published');
  assert.equal(result.externalPublishInvoked, true);
  assert.match(result.externalId, /sandbox-linkedin/);
});

test('publishToExternalChannel replays idempotent result', async () => {
  clearPublishIdempotencyCache();
  const config = { marketingPublishLiveEnabled: true, marketingPublishSandbox: true };
  const first = await publishToExternalChannel({
    channel: 'linkedin',
    campaign: { id: 'c3', payload: { bodyOutline: 'Replay' } },
    tenantId: 'default',
    config,
    correlationId: 'idem-3',
  });
  const second = await publishToExternalChannel({
    channel: 'linkedin',
    campaign: { id: 'c3', payload: { bodyOutline: 'Replay' } },
    tenantId: 'default',
    config,
    correlationId: 'idem-3',
  });
  assert.equal(first.externalId, second.externalId);
  assert.equal(second.idempotentReplay, true);
});

test('executePilotChannelPublish audits published sandbox result', async () => {
  clearPublishIdempotencyCache();
  const audits = [];
  const result = await executePilotChannelPublish({
    campaign: { id: 'c4', payload: { bodyOutline: 'Audit me' } },
    channel: 'linkedin',
    tenantId: 'default',
    config: { marketingPublishLiveEnabled: true, marketingPublishSandbox: true },
    authStore: {
      addAuditEvent: async (event) => {
        audits.push(event);
      },
    },
    correlationId: 'audit-1',
  });
  assert.equal(result.status, 'published');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'cmo.pilot_publish.published');
});

test('runCmoConnectorHealthCheck emits executive feed on connector errors', async () => {
  clearConnectorMetricsCache();
  const feedEvents = [];
  const result = await runCmoConnectorHealthCheck({
    tenantId: 'default',
    config: {
      marketingConnectorsEnabled: true,
      marketingConnectorsMode: 'live',
      marketingConnectorsLiveFetch: true,
      marketingConnectors: {
        google_ads: { enabled: true, mode: 'live', accessToken: 'bad' },
        meta: { enabled: false },
        linkedin: { enabled: false },
        mail: { enabled: false },
      },
    },
    executiveDecisionFeed: {
      addFromSchedulerNotification: (payload) => {
        feedEvents.push(payload);
      },
    },
  });
  assert.ok(result.errorCount >= 1);
  assert.equal(feedEvents.length, 1);
  assert.equal(feedEvents[0].eventType, 'review_marketing_connectors');
});

test('fetchChannelMetrics uses fixture cache on second call', async () => {
  clearConnectorMetricsCache();
  const config = {
    marketingConnectorsEnabled: true,
    marketingConnectorsMode: 'fixture',
    marketingConnectors: {
      google_ads: { enabled: true, mode: 'fixture' },
    },
  };
  const first = await fetchChannelMetrics({
    channel: 'google_ads',
    tenantId: 'default',
    config,
    window: '7d',
  });
  const second = await fetchChannelMetrics({
    channel: 'google_ads',
    tenantId: 'default',
    config,
    window: '7d',
  });
  assert.equal(first.status, 'ok');
  assert.equal(second.cacheHit, true);
});

test('GenerateContentSeriesCapability returns trust-themed episodes', async () => {
  const capability = new GenerateContentSeriesCapability();
  const output = await capability.execute({
    input: { seriesName: 'Trust serie', episodeCount: 3, pillar: 'trust' },
    systemStateSnapshot: { tenantConfig: { brandProfile: 'Hair TP Clinic' } },
  });
  assert.equal(output.data.outputType, 'ContentSeries');
  assert.equal(output.data.episodeCount, 3);
  assert.equal(output.data.autoPublish, false);
  assert.ok(TRUST_SERIES_THEMES.length >= 3);
});

test('resolvePublishLiveEnabled respects config flag', () => {
  assert.equal(resolvePublishLiveEnabled({ marketingPublishLiveEnabled: false }), false);
  assert.equal(resolvePublishLiveEnabled({ marketingPublishLiveEnabled: true }), true);
});
