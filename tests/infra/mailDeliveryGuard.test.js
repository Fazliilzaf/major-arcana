const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldSkipLiveMailSend,
  isReservedMailDomain,
  isNonDeliverableRecipient,
  isVerifyLocalPart,
  parseEmailAddress,
} = require('../../src/infra/mailDeliveryGuard');

test('parseEmailAddress handles display-name format', () => {
  assert.deepEqual(parseEmailAddress('Plan A Verify <plan-a-1@example.com>'), {
    local: 'plan-a-1',
    domain: 'example.com',
  });
});

test('isReservedMailDomain matches RFC 2606 domains and subdomains', () => {
  assert.equal(isReservedMailDomain('example.com'), true);
  assert.equal(isReservedMailDomain('mail.example.com'), true);
  assert.equal(isReservedMailDomain('example.net'), true);
  assert.equal(isReservedMailDomain('foo.test'), true);
  assert.equal(isReservedMailDomain('hairtpclinic.com'), false);
});

test('isVerifyLocalPart matches prod verify script prefixes', () => {
  assert.equal(isVerifyLocalPart('plan-a-123'), true);
  assert.equal(isVerifyLocalPart('bokning-journal-1779662391531'), true);
  assert.equal(isVerifyLocalPart('resend-domain-verify-123'), true);
  assert.equal(isVerifyLocalPart('anna.svensson'), false);
});

test('shouldSkipLiveMailSend blocks example.com recipients', () => {
  const result = shouldSkipLiveMailSend(['patient@example.com']);
  assert.equal(result.skip, true);
  assert.equal(result.reason, 'reserved_domain');
});

test('shouldSkipLiveMailSend allows real clinic recipients', () => {
  const result = shouldSkipLiveMailSend(['patient@hairtpclinic.com']);
  assert.equal(result.skip, false);
});

test('isNonDeliverableRecipient blocks verify prefix on real domain', () => {
  assert.equal(isNonDeliverableRecipient('booking-mail-verify-1@hairtpclinic.com'), true);
});
