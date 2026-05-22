const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchChannelMetrics, CONNECTOR_STATUS } = require('../../src/ops/cmoMarketingConnectors');
const {
  fetchGoogleAdsMetrics,
  fetchMetaMetrics,
  fetchLinkedInMetrics,
  resolveLiveAdapter,
  buildNormalizedMetrics,
} = require('../../src/ops/cmoMarketingConnectorAdapters');

function createMockFetch(handlers = {}) {
  return async (url, options = {}) => {
    const key = String(url);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (key.includes(pattern)) {
        return handler(url, options);
      }
    }
    throw new Error(`Unexpected fetch URL: ${key}`);
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('resolveLiveAdapter detects platform credentials', () => {
  assert.equal(
    resolveLiveAdapter('google_ads', {
      customerId: '1234567890',
      accessToken: 'token',
      developerToken: 'dev',
    }),
    'google_ads'
  );
  assert.equal(
    resolveLiveAdapter('meta', { adAccountId: '998877', accessToken: 'token' }),
    'meta'
  );
  assert.equal(
    resolveLiveAdapter('linkedin', { adAccountId: '509567876', accessToken: 'token' }),
    'linkedin'
  );
  assert.equal(resolveLiveAdapter('google_ads', { accessToken: 'token' }), null);
});

test('fetchGoogleAdsMetrics maps GAQL search response', async () => {
  const mockFetch = createMockFetch({
    'googleads.googleapis.com': async (_url, options) => {
      assert.match(options.headers['developer-token'], /dev-token/);
      return jsonResponse({
        results: [
          {
            metrics: {
              impressions: 50000,
              clicks: 900,
              costMicros: 2_400_000_000,
              ctr: 0.018,
              averageCpc: 2_666_666,
              conversions: 25,
            },
          },
        ],
      });
    },
  });

  const metrics = await fetchGoogleAdsMetrics({
    connector: {
      customerId: '1234567890',
      accessToken: 'oauth-token',
      developerToken: 'dev-token',
    },
    fetchImpl: mockFetch,
  });

  assert.equal(metrics.impressions, 50000);
  assert.equal(metrics.clicks, 900);
  assert.equal(metrics.spend, 2400);
  assert.ok(metrics.metrics.ctr > 0);
  assert.ok(metrics.metrics.cpc > 0);
});

test('fetchMetaMetrics maps Graph insights response', async () => {
  const mockFetch = createMockFetch({
    'graph.facebook.com': async (url) => {
      assert.match(String(url), /act_123456789\/insights/);
      return jsonResponse({
        data: [
          {
            impressions: '64000',
            clicks: '1344',
            spend: '980.12',
            ctr: '2.1',
            cpc: '0.729',
            actions: [{ action_type: 'lead', value: '42' }],
          },
        ],
      });
    },
  });

  const metrics = await fetchMetaMetrics({
    connector: {
      adAccountId: '123456789',
      accessToken: 'meta-token',
    },
    fetchImpl: mockFetch,
  });

  assert.equal(metrics.impressions, 64000);
  assert.equal(metrics.clicks, 1344);
  assert.equal(metrics.spend, 980.12);
  assert.ok(metrics.metrics.ctr < 0.05);
  assert.ok(metrics.metrics.cpa > 0);
});

test('fetchLinkedInMetrics maps adAnalytics response', async () => {
  const mockFetch = createMockFetch({
    'api.linkedin.com/rest/adAnalytics': async (url) => {
      assert.match(decodeURIComponent(String(url)), /509567876/);
      return jsonResponse({
        elements: [
          {
            impressions: 18000,
            clicks: 576,
            costInLocalCurrency: 520.5,
            externalWebsiteConversions: 14,
          },
        ],
      });
    },
  });

  const metrics = await fetchLinkedInMetrics({
    connector: {
      adAccountId: '509567876',
      accessToken: 'linkedin-token',
    },
    fetchImpl: mockFetch,
  });

  assert.equal(metrics.impressions, 18000);
  assert.equal(metrics.clicks, 576);
  assert.equal(metrics.spend, 520.5);
  assert.ok(metrics.metrics.conversionRate > 0);
});

test('fetchChannelMetrics uses live Google Ads adapter when configured', async () => {
  const mockFetch = createMockFetch({
    'googleads.googleapis.com': async () =>
      jsonResponse({
        results: [
          {
            metrics: {
              impressions: 1000,
              clicks: 50,
              costMicros: 250_000_000,
              ctr: 0.05,
              averageCpc: 5_000_000,
              conversions: 3,
            },
          },
        ],
      }),
  });

  const result = await fetchChannelMetrics({
    channel: 'google_ads',
    fetchImpl: mockFetch,
    config: {
      marketingConnectorsEnabled: true,
      marketingConnectorsMode: 'live',
      marketingConnectorsLiveFetch: true,
      marketingConnectors: {
        google_ads: {
          enabled: true,
          mode: 'live',
          liveFetch: true,
          customerId: '1234567890',
          accessToken: 'oauth-token',
          developerToken: 'dev-token',
        },
      },
    },
  });

  assert.equal(result.status, CONNECTOR_STATUS.OK);
  assert.equal(result.mode, 'live');
  assert.equal(result.adapter, 'google_ads');
  assert.equal(result.channelBlock.metrics.ctr.source, 'google_ads');
});

test('buildNormalizedMetrics derives ctr/cpc/conversionRate when missing', () => {
  const normalized = buildNormalizedMetrics({
    impressions: 1000,
    clicks: 50,
    spend: 200,
    conversions: 5,
  });
  assert.equal(normalized.metrics.ctr, 0.05);
  assert.equal(normalized.metrics.cpc, 4);
  assert.equal(normalized.metrics.cpa, 40);
  assert.equal(normalized.metrics.conversionRate, 0.1);
});
