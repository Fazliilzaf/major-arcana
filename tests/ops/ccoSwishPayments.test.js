const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatSwishAmount,
  mapSwishPaymentStatus,
  normalizeSwishMessage,
  normalizeSwishPhone,
} = require('../../src/ops/ccoSwishPayments');
const {
  buildSwishDeepLink,
  extractPaymentIdFromLocation,
} = require('../../src/infra/swishClient');

test('formatSwishAmount returns two decimals', () => {
  assert.equal(formatSwishAmount(100), '100.00');
  assert.equal(formatSwishAmount('49.5'), '49.50');
});

test('formatSwishAmount rejects invalid values', () => {
  assert.throws(() => formatSwishAmount(0), /amount/i);
  assert.throws(() => formatSwishAmount('abc'), /amount/i);
});

test('normalizeSwishPhone converts Swedish numbers', () => {
  assert.equal(normalizeSwishPhone('070-123 45 67'), '46701234567');
  assert.equal(normalizeSwishPhone('46701234567'), '46701234567');
});

test('normalizeSwishMessage truncates to 50 chars', () => {
  const long = 'x'.repeat(80);
  assert.equal(normalizeSwishMessage(long).length, 50);
});

test('mapSwishPaymentStatus reads remote payload', () => {
  const mapped = mapSwishPaymentStatus({
    status: 'PAID',
    paymentReference: 'ABC123',
    datePaid: '2026-05-20T10:00:00.000Z',
  });
  assert.equal(mapped.status, 'PAID');
  assert.equal(mapped.paymentReference, 'ABC123');
  assert.equal(mapped.paidAt, '2026-05-20T10:00:00.000Z');
});

test('extractPaymentIdFromLocation parses Swish location header', () => {
  assert.equal(
    extractPaymentIdFromLocation(
      'https://mss.cpc.getswish.net/swish-cpcapi/api/v2/paymentrequests/ABC123DEF456'
    ),
    'ABC123DEF456'
  );
});

test('buildSwishDeepLink includes token and callback', () => {
  const url = buildSwishDeepLink({
    paymentRequestToken: 'token123',
    callbackUrl: 'https://arcana.example/api/v1/cco-swish/callback',
  });
  assert.match(url, /^swish:\/\/paymentrequest\?/);
  assert.match(url, /token=token123/);
  assert.match(url, /callbackurl=/);
});
