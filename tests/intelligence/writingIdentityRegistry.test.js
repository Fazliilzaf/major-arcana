const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveTenantToneStyleProfile,
  isValidEmail,
  normalizeMailboxAddress,
  resolveMailboxIdentityKey,
  resolveWritingIdentityProfile,
  toWritingProfile,
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

test('normalizeMailboxAddress trims and lowercases', () => {
  assert.equal(normalizeMailboxAddress('  Egzona@HairTpClinic.Com  '), 'egzona@hairtpclinic.com');
});

test('resolveMailboxIdentityKey falls back to UPN and mailboxId aliases', () => {
  const fromUpn = resolveMailboxIdentityKey({
    mailboxAddress: 'not-an-email',
    userPrincipalName: ' OWNER@clinic.se ',
  });
  assert.equal(fromUpn, 'owner@clinic.se');

  const fromAliasId = resolveMailboxIdentityKey({
    sourceMailboxId: 'Inbox@clinic.se',
  });
  assert.equal(fromAliasId, 'inbox@clinic.se');
});

test('resolveWritingIdentityProfile supports overrides via profilesByMailbox map', () => {
  const profile = resolveWritingIdentityProfile('new.agent@clinic.se', {
    overrides: {
      profilesByMailbox: {
        'new.agent@clinic.se': {
          profile: { greetingStyle: 'Hello', sentenceLength: 'long', warmthIndex: 9 },
        },
      },
    },
  });
  assert.equal(profile.greetingStyle, 'Hello');
  assert.equal(profile.sentenceLength, 'long');
  assert.equal(profile.warmthIndex, 9);
});

test('resolveWritingIdentityProfile supports overrides array and tenant tone fallback', () => {
  const fromArray = resolveWritingIdentityProfile({ mailbox: 'array@clinic.se' }, {
    overrides: [
      {
        mailboxAddress: 'array@clinic.se',
        profile: { ctaStyle: 'structured', formalityLevel: 8 },
      },
    ],
  });
  assert.equal(fromArray.ctaStyle, 'structured');
  assert.equal(fromArray.formalityLevel, 8);

  const fallback = resolveWritingIdentityProfile('unknown@clinic.se', {
    fallbackToTenantToneStyle: true,
    tenantToneStyle: 'Kort och koncis',
  });
  assert.equal(fallback.sentenceLength, 'short');
  assert.equal(fallback.formalityLevel, 7);
});

test('toWritingProfile clamps ranges and defaults invalid fields', () => {
  const profile = toWritingProfile({
    formalityLevel: 999,
    warmthIndex: -5,
    sentenceLength: 'invalid',
    ctaStyle: '',
    emojiUsage: 'yes',
  });
  assert.equal(profile.formalityLevel, 10);
  assert.equal(profile.warmthIndex, 0);
  assert.equal(profile.sentenceLength, 'medium');
  assert.equal(profile.ctaStyle, 'balanced');
  assert.equal(profile.emojiUsage, false);
});

test('deriveTenantToneStyleProfile returns null for empty tone string', () => {
  assert.equal(deriveTenantToneStyleProfile(''), null);
  assert.equal(deriveTenantToneStyleProfile('   \t'), null);
  assert.equal(deriveTenantToneStyleProfile(null), null);
});

test('deriveTenantToneStyleProfile maps warm and formal tone keywords', () => {
  const warm = deriveTenantToneStyleProfile('Vi vill vara empatiska mot patienten');
  assert.equal(warm.ctaStyle, 'calm-guiding');
  assert.equal(warm.warmthIndex, 7);

  const formal = deriveTenantToneStyleProfile('Professionell och saklig kommunikation');
  assert.equal(formal.ctaStyle, 'structured');
  assert.equal(formal.formalityLevel, 8);

  const generic = deriveTenantToneStyleProfile('Neutral beskrivning utan nyckelord');
  assert.equal(generic.ctaStyle, 'balanced');
  assert.equal(generic.formalityLevel, 6);
});

test('deriveTenantToneStyleProfile matches omhandertagande utan diakritik', () => {
  const p = deriveTenantToneStyleProfile('Omhandertagande service');
  assert.equal(p.ctaStyle, 'calm-guiding');
  assert.equal(p.sentenceLength, 'medium');
});

test('isValidEmail rejects local-part spaces missing dot in domain and overlong addresses', () => {
  assert.equal(isValidEmail('bad local@clinic.se'), false);
  assert.equal(isValidEmail('user@nodot'), false);
  const longLocal = `${'a'.repeat(318)}@x.co`;
  assert.ok(longLocal.length > 320);
  assert.equal(isValidEmail(longLocal), false);
  assert.equal(isValidEmail('ok@clinic.se'), true);
});

test('resolveWritingIdentityProfile skips override array entries without matching mailbox', () => {
  const profile = resolveWritingIdentityProfile(
    { mailboxAddress: 'target@clinic.se' },
    {
      overrides: [
        { mailboxAddress: 'other@clinic.se', profile: { greetingStyle: 'Wrong' } },
        { mailboxAddress: 'target@clinic.se', profile: { greetingStyle: 'Picked' } },
      ],
    }
  );
  assert.equal(profile.greetingStyle, 'Picked');
});

test('toWritingProfile treats array source like empty object', () => {
  const p = toWritingProfile([]);
  assert.equal(p.greetingStyle, 'Hej,');
  assert.equal(p.closingStyle, 'Vänliga hälsningar');
});

test('resolveMailboxIdentityKey reads fromAddress and mailboxEmail aliases', () => {
  assert.equal(
    resolveMailboxIdentityKey({ fromAddress: '  Alias@Clinic.SE ', mailboxAddress: '' }),
    'alias@clinic.se'
  );
  assert.equal(
    resolveMailboxIdentityKey({ mailboxEmail: 'x@y.co', mailboxAddress: '' }),
    'x@y.co'
  );
});

test('resolveWritingIdentityProfile accepts string identity for known mailbox', () => {
  const p = resolveWritingIdentityProfile('fazli@hairtpclinic.com', {
    fallbackToTenantToneStyle: false,
  });
  assert.equal(p.sentenceLength, 'short');
  assert.equal(p.formalityLevel, 8);
});

test('resolveWritingIdentityProfile resolves overrides object keyed by mailbox', () => {
  const p = resolveWritingIdentityProfile('Agent@Clinic.SE', {
    overrides: {
      'agent@clinic.se': { profile: { greetingStyle: 'Hi,' } },
    },
  });
  assert.equal(p.greetingStyle, 'Hi,');
});

test('resolveWritingIdentityProfile returns null for unknown mailbox without fallback', () => {
  assert.equal(
    resolveWritingIdentityProfile('nobody@example.com', { fallbackToTenantToneStyle: false }),
    null
  );
});
