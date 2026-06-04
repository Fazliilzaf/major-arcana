const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readHoneypotValue,
  assertPublicWebAbuseGuard,
} = require('../../src/security/publicWebAbuseGuard');

test('readHoneypotValue flaggar ifyllda honeypot-fält', () => {
  assert.equal(readHoneypotValue({ website: 'spam.example' }), 'spam.example');
  assert.equal(readHoneypotValue({ company_url: 'x' }), 'x');
  assert.equal(readHoneypotValue({ contact: { email: 'a@b.com' } }), '');
});

test('assertPublicWebAbuseGuard nekar honeypot utan Turnstile', async () => {
  const req = { headers: {}, ip: '127.0.0.1' };
  const blocked = await assertPublicWebAbuseGuard(req, { website: 'bot' }, { turnstileSecret: '' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'abuse_detected');

  const allowed = await assertPublicWebAbuseGuard(req, { contact: { email: 'a@b.com' } }, {
    turnstileSecret: '',
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.turnstile, 'disabled');
});
