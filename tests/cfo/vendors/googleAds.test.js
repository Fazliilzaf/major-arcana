'use strict';

// ORD-102d-2 · Google Ads spend-widget — tester.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleAdsAdapter } = require('../../../src/cfo/vendors/googleAds');

function mockConnectorStore({
  connected = true,
  expired = false,
  accessToken = 'test-token',
} = {}) {
  return {
    isConnected: () => connected,
    isTokenExpired: () => expired,
    getAccessToken: () => accessToken,
    getRefreshToken: () => 'refresh-token',
    updateAccessToken: async () => {},
    getCustomerIds: () => ['1234567890'],
  };
}

test('fetchCampaignSpend: summerar spend per konto, månad och campaign', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map(),
    text: async () =>
      [
        JSON.stringify({
          results: [
            {
              customer: { id: '1234567890' },
              campaign: { id: '1', name: 'Kampanj A' },
              segments: { date: '2026-08-01' },
              metrics: { costMicros: 1_500_000 },
            },
            {
              customer: { id: '1234567890' },
              campaign: { id: '1', name: 'Kampanj A' },
              segments: { date: '2026-08-15' },
              metrics: { costMicros: 2_500_000 },
            },
            {
              customer: { id: '1234567890' },
              campaign: { id: '2', name: 'Kampanj B' },
              segments: { date: '2026-09-01' },
              metrics: { costMicros: 1_000_000 },
            },
          ],
        }),
      ].join('\n'),
  });

  const adapter = createGoogleAdsAdapter({
    developerToken: 'dev-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    connectorStore: mockConnectorStore(),
  });

  const result = await adapter.fetchCampaignSpend({
    fromDate: '2026-08-01',
    toDate: '2026-09-30',
  });

  global.fetch = originalFetch;

  assert.equal(result.ok, true);
  assert.equal(result.accounts.length, 1);
  const account = result.accounts[0];
  assert.equal(account.customerId, '1234567890');
  assert.equal(account.totalSpendSek, 5);
  assert.equal(account.byMonth.length, 2);
  assert.equal(account.byMonth[0].month, '2026-08');
  assert.equal(account.byMonth[0].spendSek, 4);
  assert.equal(account.byMonth[1].month, '2026-09');
  assert.equal(account.byMonth[1].spendSek, 1);
  assert.equal(account.campaigns.length, 2);
  const campaignA = account.campaigns.find((c) => c.campaignId === '1');
  assert.ok(campaignA);
  assert.equal(campaignA.name, 'Kampanj A');
  assert.equal(campaignA.spendSek, 4);
});

test('fetchCampaignSpend: okonfigurerad adapter returnerar fel', async () => {
  const adapter = createGoogleAdsAdapter({ connectorStore: null });
  const result = await adapter.fetchCampaignSpend({ fromDate: '2026-01-01', toDate: '2026-01-31' });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('inte konfigurerad'));
  assert.deepEqual(result.accounts, []);
});

test('fetchCampaignSpend: saknade datum returnerar fel', async () => {
  const adapter = createGoogleAdsAdapter({
    developerToken: 'dev-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    connectorStore: mockConnectorStore(),
  });
  const result = await adapter.fetchCampaignSpend({});
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('fromDate/toDate'));
  assert.deepEqual(result.accounts, []);
});

test('fetchCampaignSpend: permission denied markerar needsBasicAccess', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    headers: new Map(),
    text: async () =>
      JSON.stringify({
        error: {
          code: 403,
          message:
            'The developer does not have permission to access this account. Permission denied',
          status: 'PERMISSION_DENIED',
        },
      }),
  });

  const adapter = createGoogleAdsAdapter({
    developerToken: 'dev-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    connectorStore: mockConnectorStore(),
  });

  const result = await adapter.fetchCampaignSpend({
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
  });

  global.fetch = originalFetch;

  assert.equal(result.ok, false);
  assert.equal(result.needsBasicAccess, true);
  assert.ok(result.error.toLowerCase().includes('permission'));
});
