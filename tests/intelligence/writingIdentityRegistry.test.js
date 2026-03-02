const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidEmail,
  resolveMailboxIdentityKey,
  resolveWritingIdentityProfile,
} = require('../../src/intelligence/writingIdentityRegistry');

test('Writing identity rejects GUID mailbox ids as identity keys', () => {
  const guid = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
  const identityKey = resolveMailboxIdentityKey({
    mailboxAddress: '',
    userPrincipalName: '',
    mailboxId: guid,
  });
  assert.equal(identityKey, null);

  const profile = resolveWritingIdentityProfile(
    { mailboxId: guid },
    { fallbackToTenantToneStyle: false }
  );
  assert.equal(profile, null);
});

test('Writing identity resolves known mailbox email profiles', () => {
  assert.equal(isValidEmail('egzona@hairtpclinic.com'), true);
  const profile = resolveWritingIdentityProfile(
    { mailboxAddress: 'egzona@hairtpclinic.com' },
    { fallbackToTenantToneStyle: false }
  );

  assert.equal(profile !== null, true);
  assert.equal(profile.greetingStyle, 'Hej,');
  assert.equal(profile.formalityLevel >= 0, true);
  assert.equal(profile.formalityLevel <= 10, true);
});

test('Writing identity lookup uses mailboxAddress before UPN and mailboxId', () => {
  const identityKey = resolveMailboxIdentityKey({
    mailboxAddress: 'contact@hairtpclinic.com',
    userPrincipalName: 'egzona@hairtpclinic.com',
    mailboxId: 'fazli@hairtpclinic.com',
  });
  assert.equal(identityKey, 'contact@hairtpclinic.com');
});
