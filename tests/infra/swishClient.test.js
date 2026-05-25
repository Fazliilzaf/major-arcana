const test = require('node:test');
const assert = require('node:assert/strict');

const { swishConfigured, swishTlsMaterialConfigured } = require('../../src/infra/swishClient');

test('swishTlsMaterialConfigured accepts pem or p12', () => {
  assert.equal(
    swishTlsMaterialConfigured({
      swishCertPath: '/tmp/cert.pem',
      swishKeyPath: '/tmp/key.pem',
    }),
    true
  );
  assert.equal(
    swishTlsMaterialConfigured({
      swishP12Path: '/tmp/merchant.p12',
    }),
    true
  );
  assert.equal(swishTlsMaterialConfigured({}), false);
});

test('swishConfigured requires enabled flag and callback url', () => {
  assert.equal(
    swishConfigured({
      swishEnabled: true,
      swishApiBaseUrl: 'https://mss.cpc.getswish.net/swish-cpcapi',
      swishCertPath: '/tmp/cert.pem',
      swishKeyPath: '/tmp/key.pem',
      swishCallbackUrl: 'https://arcana.example/api/v1/cco-swish/callback',
    }),
    true
  );
  assert.equal(
    swishConfigured({
      swishEnabled: false,
      swishApiBaseUrl: 'https://mss.cpc.getswish.net/swish-cpcapi',
      swishP12Path: '/tmp/merchant.p12',
      swishCallbackUrl: 'https://arcana.example/api/v1/cco-swish/callback',
    }),
    false
  );
});
