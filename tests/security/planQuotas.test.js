'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLAN_TIERS,
  getPlanTier,
  getQuota,
  checkQuota,
  isFeatureEnabled,
} = require('../../src/security/planQuotas');

test('PLAN_TIERS innehåller free/starter/pro/enterprise', () => {
  for (const t of ['free', 'starter', 'pro', 'enterprise']) {
    assert.ok(PLAN_TIERS[t], `${t} saknas`);
  }
});

test('getPlanTier: okänd tier faller tillbaka till free', () => {
  assert.equal(getPlanTier('xyz').name, 'Free');
  assert.equal(getPlanTier('').name, 'Free');
});

test('getPlanTier: default och nullish blir free-tier', () => {
  assert.equal(getPlanTier().name, 'Free');
  assert.equal(getPlanTier(undefined).name, 'Free');
  assert.equal(getPlanTier(null).name, 'Free');
});

test('getPlanTier: case-insensitive', () => {
  assert.equal(getPlanTier('PRO').name, 'Pro');
  assert.equal(getPlanTier('Enterprise').name, 'Enterprise');
});

test('checkQuota: under limit → allowed=true', () => {
  const result = checkQuota({ planTier: 'free', usageCount: 100, quotaKey: 'capabilityRunsPerMonth' });
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 900);
  assert.equal(result.limit, 1000);
});

test('checkQuota: över limit → allowed=false', () => {
  const result = checkQuota({ planTier: 'free', usageCount: 1500, quotaKey: 'capabilityRunsPerMonth' });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
});

test('checkQuota: default parametrar använder free capabilityRuns', () => {
  const r = checkQuota();
  assert.equal(r.planTier, 'free');
  assert.equal(r.limit, 1000);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 1000);
});

test('checkQuota: exakt på gränsen → allowed=false (strikt <)', () => {
  const at = checkQuota({ planTier: 'free', usageCount: 1000, quotaKey: 'capabilityRunsPerMonth' });
  assert.equal(at.allowed, false);
  assert.equal(at.remaining, 0);
  const under = checkQuota({ planTier: 'free', usageCount: 999, quotaKey: 'capabilityRunsPerMonth' });
  assert.equal(under.allowed, true);
  assert.equal(under.remaining, 1);
});

test('checkQuota: enterprise har obegränsat', () => {
  const result = checkQuota({ planTier: 'enterprise', usageCount: 999999999, quotaKey: 'capabilityRunsPerMonth' });
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, Infinity);
});

test('isFeatureEnabled: aiAdvanced är false på free, true på starter+', () => {
  assert.equal(isFeatureEnabled({ planTier: 'free', feature: 'ai-advanced' }), false);
  assert.equal(isFeatureEnabled({ planTier: 'starter', feature: 'ai-advanced' }), true);
  assert.equal(isFeatureEnabled({ planTier: 'pro', feature: 'ai-advanced' }), true);
  assert.equal(isFeatureEnabled({ planTier: 'enterprise', feature: 'ai-advanced' }), true);
});

test('isFeatureEnabled: customBranding är false på free', () => {
  assert.equal(isFeatureEnabled({ planTier: 'free', feature: 'custom-branding' }), false);
  assert.equal(isFeatureEnabled({ planTier: 'starter', feature: 'custom-branding' }), true);
});

test('isFeatureEnabled: okänd feature-flagga tillåts (ingen quota-nyckel)', () => {
  assert.equal(isFeatureEnabled({ planTier: 'free', feature: 'made-up-capability' }), true);
  assert.equal(isFeatureEnabled({ planTier: 'free', feature: '' }), true);
});

test('isFeatureEnabled: tomt anrop tillåter okänd feature via default', () => {
  assert.equal(isFeatureEnabled(), true);
});

test('isFeatureEnabled: ai-summary är true även på free', () => {
  assert.equal(isFeatureEnabled({ planTier: 'free', feature: 'ai-summary' }), true);
});

test('getQuota: saknad nyckel ger undefined', () => {
  assert.equal(getQuota('free', 'nonexistentQuota'), undefined);
});

test('getQuota: storage växer med tier', () => {
  const free = getQuota('free', 'storageBytes');
  const starter = getQuota('starter', 'storageBytes');
  const pro = getQuota('pro', 'storageBytes');
  assert.ok(free < starter);
  assert.ok(starter < pro);
});

test('getQuota: teamSeats följer tier', () => {
  assert.equal(getQuota('free', 'teamSeats'), 2);
  assert.equal(getQuota('starter', 'teamSeats'), 5);
  assert.equal(getQuota('pro', 'teamSeats'), 20);
  assert.equal(getQuota('enterprise', 'teamSeats'), -1);
});

test('getPlanTier: numerisk eller object-nyckel faller tillbaka till free', () => {
  assert.equal(getPlanTier(123).name, 'Free');
  assert.equal(getPlanTier({ tier: 'pro' }).name, 'Free');
});

test('checkQuota: negativ usageCount ger fler remaining men fortfarande allowed', () => {
  const r = checkQuota({ planTier: 'free', usageCount: -5, quotaKey: 'capabilityRunsPerMonth' });
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 1005);
});

test('PLAN_TIERS frusna (immutable)', () => {
  assert.throws(() => { PLAN_TIERS.free = {}; });
});

test('checkQuota: enterprise obegränsat även för andra -1-quotas', () => {
  const result = checkQuota({
    planTier: 'enterprise',
    usageCount: 123456,
    quotaKey: 'mailboxReadsPerMonth',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.limit, -1);
  assert.equal(result.remaining, Infinity);
});

test('checkQuota: okänd quotaKey ger NaN remaining och allowed=false', () => {
  const result = checkQuota({
    planTier: 'free',
    usageCount: 10,
    quotaKey: 'doesNotExist',
  });
  assert.equal(result.allowed, false);
  assert.equal(Number.isNaN(result.remaining), true);
  assert.equal(result.limit, undefined);
});
