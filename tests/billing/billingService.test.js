const test = require('node:test');
const assert = require('node:assert/strict');

const { createBillingService } = require('../../src/billing/billingService');
const { planFromPriceId, priceIdFromPlan } = require('../../src/billing/stripeClient');

test('priceIdFromPlan returnerar korrekt price-ID for varje plan', () => {
  assert.equal(priceIdFromPlan('starter'), 'price_starter_monthly');
  assert.equal(priceIdFromPlan('pro'), 'price_pro_monthly');
  assert.equal(priceIdFromPlan('free'), null);
  assert.equal(priceIdFromPlan('enterprise'), null);
});

test('planFromPriceId returnerar korrekt plan for varje price-ID', () => {
  assert.equal(planFromPriceId('price_starter_monthly'), 'starter');
  assert.equal(planFromPriceId('price_pro_monthly'), 'pro');
  assert.equal(planFromPriceId('unknown_price'), null);
});

test('billingService.isAvailable returnerar false utan stripe', () => {
  const service = createBillingService({ stripe: null });
  assert.equal(service.isAvailable(), false);
});

test('billingService.isAvailable returnerar true med stripe', () => {
  const service = createBillingService({ stripe: {} });
  assert.equal(service.isAvailable(), true);
});

test('billingService.getSubscriptionStatus returnerar free utan config', async () => {
  const service = createBillingService({ stripe: null, tenantConfigStore: null });
  const status = await service.getSubscriptionStatus({ tenantId: 'test' });
  assert.equal(status.planTier, 'free');
  assert.equal(status.status, 'active');
});

test('billingService.getSubscriptionStatus laser fran tenantConfigStore', async () => {
  const mockConfig = {
    planTier: 'pro',
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_456',
    billingUpdatedAt: '2026-05-14T00:00:00Z',
  };
  const service = createBillingService({
    stripe: null,
    tenantConfigStore: {
      async getTenantConfig() { return mockConfig; },
    },
  });
  const status = await service.getSubscriptionStatus({ tenantId: 'test-tenant' });
  assert.equal(status.planTier, 'pro');
  assert.equal(status.stripeCustomerId, 'cus_123');
  assert.equal(status.stripeSubscriptionId, 'sub_456');
});

test('billingService.createCustomer kastar utan stripe', async () => {
  const service = createBillingService({ stripe: null });
  await assert.rejects(
    () => service.createCustomer({ tenantId: 'test', email: 'a@b.se' }),
    { message: 'Stripe ej konfigurerat.' }
  );
});

test('billingService.createSubscription kastar utan stripe', async () => {
  const service = createBillingService({ stripe: null });
  await assert.rejects(
    () => service.createSubscription({ tenantId: 'test', customerId: 'cus_1', planTier: 'starter' }),
    { message: 'Stripe ej konfigurerat.' }
  );
});

test('billingService.createSubscription kastar for okand plan', async () => {
  const mockStripe = {
    subscriptions: { create: async () => ({}) },
  };
  const service = createBillingService({ stripe: mockStripe });
  await assert.rejects(
    () => service.createSubscription({ tenantId: 'test', customerId: 'cus_1', planTier: 'nonexistent' }),
    { message: /Ingen Stripe price-ID/ }
  );
});
