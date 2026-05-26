const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFortnoxAuthUrl } = require('../../src/infra/fortnoxClient');

test('buildFortnoxAuthUrl includes oauth parameters', () => {
  const url = new URL(
    buildFortnoxAuthUrl({
      clientId: 'client-id',
      redirectUri: 'https://arcana.example/api/v1/cco-fortnox/oauth/callback',
      scope: 'customer invoice',
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
  assert.equal(url.searchParams.get('scope'), 'customer invoice');
  assert.equal(url.searchParams.get('state'), 'state-token');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
});
