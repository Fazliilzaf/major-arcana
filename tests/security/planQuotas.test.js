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

test('getQuota: storage växer med tier', () => {
  const free = getQuota('free', 'storageBytes');
  const starter = getQuota('starter', 'storageBytes');
  const pro = getQuota('pro', 'storageBytes');
  assert.ok(free < starter);
  assert.ok(starter < pro);
});

test('PLAN_TIERS frusna (immutable)', () => {
  assert.throws(() => { PLAN_TIERS.free = {}; });
});
