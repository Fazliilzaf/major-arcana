const assert = require('node:assert/strict');
const test = require('node:test');

const {
  shouldBypassOwnerLoginRateLimit,
} = require('../../src/security/ownerLoginRateLimit');

test('configured owner bypasses login rate limiting with normalized exact email match', () => {
  assert.equal(
    shouldBypassOwnerLoginRateLimit({
      loginEmail: ' FAZLI@HAIRTPCLINIC.COM ',
      configuredOwnerEmail: 'fazli@hairtpclinic.com',
    }),
    true
  );
});

test('non-owner and missing owner configuration keep login rate limiting', () => {
  assert.equal(
    shouldBypassOwnerLoginRateLimit({
      loginEmail: 'staff@hairtpclinic.com',
      configuredOwnerEmail: 'fazli@hairtpclinic.com',
    }),
    false
  );
  assert.equal(
    shouldBypassOwnerLoginRateLimit({
      loginEmail: 'fazli@hairtpclinic.com',
      configuredOwnerEmail: '',
    }),
    false
  );
});
