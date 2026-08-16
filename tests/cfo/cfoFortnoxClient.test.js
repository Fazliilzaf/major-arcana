const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFortnoxAuthUrl, createFortnoxClient } = require('../../src/cfo/cfoFortnoxClient');

test('buildFortnoxAuthUrl includes oauth parameters', () => {
  const url = new URL(
    buildFortnoxAuthUrl({
      clientId: 'client-id',
      redirectUri: 'https://arcana.example/api/v1/cco-fortnox/oauth/callback',
      scope: 'customer invoice payment bookkeeping',
      state: 'state-token',
    })
  );

  assert.equal(url.hostname, 'apps.fortnox.se');
  assert.equal(url.pathname, '/oauth-v1/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://arcana.example/api/v1/cco-fortnox/oauth/callback'
  );
  assert.equal(url.searchParams.get('scope'), 'customer invoice payment bookkeeping');
  assert.equal(url.searchParams.get('state'), 'state-token');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
});

async function withMockFetch(t, mockImplementation) {
  const originalFetch = global.fetch;
  global.fetch = mockImplementation;
  t.after(() => {
    global.fetch = originalFetch;
  });
}

function createTestClient(t, fetchImpl) {
  withMockFetch(t, fetchImpl);
  return createFortnoxClient({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tenantId: 'tenant-1',
    getConnection: async () => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    saveConnection: async () => {},
  });
}

test('getVoucher calls Fortnox with series and number', async (t) => {
  let capturedUrl = null;
  const client = createTestClient(t, async (url, options) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({ Voucher: { DocumentNumber: '2056', VoucherSeries: 'A' } }),
    };
  });

  const result = await client.getVoucher('A', 2056);
  assert.equal(capturedUrl, 'https://api.fortnox.se/3/vouchers/A/2056');
  assert.equal(result.Voucher.DocumentNumber, '2056');
});

test('getVoucher defaults to series A when series is empty', async (t) => {
  let capturedUrl = null;
  const client = createTestClient(t, async (url, options) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({ Voucher: { DocumentNumber: '2056', VoucherSeries: 'A' } }),
    };
  });

  await client.getVoucher('', 2056);
  assert.equal(capturedUrl, 'https://api.fortnox.se/3/vouchers/A/2056');
});

test('listVouchers calls Fortnox with financialyeardate and pagination', async (t) => {
  let capturedUrl = null;
  const client = createTestClient(t, async (url, options) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        Vouchers: [{ DocumentNumber: '1', VoucherSeries: { Name: 'A' } }],
        MetaInformation: { TotalResources: 1 },
      }),
    };
  });

  const result = await client.listVouchers({ financialYearDate: '2026-01-01', page: 2, limit: 50 });
  assert.equal(
    capturedUrl,
    'https://api.fortnox.se/3/vouchers?financialyeardate=2026-01-01&limit=50&page=2'
  );
  assert.equal(result.Vouchers.length, 1);
  assert.equal(result.MetaInformation.TotalResources, 1);
});

test('listVouchers uses sensible defaults', async (t) => {
  let capturedUrl = null;
  const client = createTestClient(t, async (url, options) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({ Vouchers: [], MetaInformation: { TotalResources: 0 } }),
    };
  });

  await client.listVouchers();
  assert.equal(capturedUrl, 'https://api.fortnox.se/3/vouchers?limit=100&page=1');
});
