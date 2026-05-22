'use strict';

const { planFromPriceId, priceIdFromPlan } = require('./stripeClient');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createBillingService({ stripe = null, tenantConfigStore = null, authStore = null } = {}) {
  function isAvailable() {
    return Boolean(stripe);
  }

  async function createCustomer({ tenantId, email, name, metadata = {} } = {}) {
    if (!stripe) throw new Error('Stripe ej konfigurerat.');
    const safeTenantId = normalizeText(tenantId);
    if (!safeTenantId) throw new Error('tenantId krävs.');

    const customer = await stripe.customers.create({
      email: normalizeText(email) || undefined,
      name: normalizeText(name) || safeTenantId,
      metadata: {
        tenantId: safeTenantId,
        source: 'arcana_billing',
        ...metadata,
      },
    });

    if (tenantConfigStore && typeof tenantConfigStore.updateTenantConfig === 'function') {
      await tenantConfigStore.updateTenantConfig({
        tenantId: safeTenantId,
        patch: {
          stripeCustomerId: customer.id,
          billingUpdatedAt: new Date().toISOString(),
        },
        actorUserId: 'billing_service',
      });
    }

    return {
      customerId: customer.id,
      tenantId: safeTenantId,
      email: customer.email,
    };
  }

  async function createSubscription({ tenantId, customerId, planTier = 'starter' } = {}) {
    if (!stripe) throw new Error('Stripe ej konfigurerat.');
    const priceId = priceIdFromPlan(planTier);
    if (!priceId) throw new Error(`Ingen Stripe price-ID för plan: ${planTier}`);
    const safeCustomerId = normalizeText(customerId);
    if (!safeCustomerId) throw new Error('customerId krävs.');

    const subscription = await stripe.subscriptions.create({
      customer: safeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        tenantId: normalizeText(tenantId),
        planTier,
        source: 'arcana_billing',
      },
    });

    if (tenantConfigStore && typeof tenantConfigStore.updateTenantConfig === 'function') {
      await tenantConfigStore.updateTenantConfig({
        tenantId: normalizeText(tenantId),
        patch: {
          stripeSubscriptionId: subscription.id,
          planTier,
          subscriptionStatus: subscription.status,
          billingUpdatedAt: new Date().toISOString(),
        },
        actorUserId: 'billing_service',
      });
    }

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      planTier,
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret || null,
    };
  }

  async function changePlan({ tenantId, subscriptionId, newPlanTier } = {}) {
    if (!stripe) throw new Error('Stripe ej konfigurerat.');
    const priceId = priceIdFromPlan(newPlanTier);
    if (!priceId) throw new Error(`Ingen Stripe price-ID för plan: ${newPlanTier}`);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItemId = subscription.items.data[0]?.id;
    if (!currentItemId) throw new Error('Ingen aktiv subscription item.');

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: currentItemId, price: priceId }],
      proration_behavior: 'create_prorations',
      metadata: {
        tenantId: normalizeText(tenantId),
        planTier: newPlanTier,
        changedAt: new Date().toISOString(),
      },
    });

    if (tenantConfigStore && typeof tenantConfigStore.updateTenantConfig === 'function') {
      await tenantConfigStore.updateTenantConfig({
        tenantId: normalizeText(tenantId),
        patch: {
          planTier: newPlanTier,
          subscriptionStatus: updated.status,
          billingUpdatedAt: new Date().toISOString(),
        },
        actorUserId: 'billing_service',
      });
    }

    return {
      subscriptionId: updated.id,
      status: updated.status,
      planTier: newPlanTier,
    };
  }

  async function cancelSubscription({ tenantId, subscriptionId, atPeriodEnd = true } = {}) {
    if (!stripe) throw new Error('Stripe ej konfigurerat.');

    let result;
    if (atPeriodEnd) {
      result = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        metadata: { cancelledAt: new Date().toISOString() },
      });
    } else {
      result = await stripe.subscriptions.cancel(subscriptionId);
    }

    if (tenantConfigStore && typeof tenantConfigStore.updateTenantConfig === 'function') {
      await tenantConfigStore.updateTenantConfig({
        tenantId: normalizeText(tenantId),
        patch: {
          subscriptionStatus: atPeriodEnd ? 'cancel_at_period_end' : 'canceled',
          billingUpdatedAt: new Date().toISOString(),
        },
        actorUserId: 'billing_service',
      });
    }

    return {
      subscriptionId: result.id,
      status: result.status,
      cancelAtPeriodEnd: result.cancel_at_period_end,
    };
  }

  async function getSubscriptionStatus({ tenantId } = {}) {
    if (!tenantConfigStore) return { planTier: 'free', status: 'active' };
    const config = await tenantConfigStore.getTenantConfig(normalizeText(tenantId));
    return {
      planTier: normalizeText(config?.planTier) || 'free',
      status: normalizeText(config?.subscriptionStatus) || 'active',
      stripeCustomerId: normalizeText(config?.stripeCustomerId) || null,
      stripeSubscriptionId: normalizeText(config?.stripeSubscriptionId) || null,
      billingUpdatedAt: normalizeText(config?.billingUpdatedAt) || null,
    };
  }

  async function createPortalSession({ customerId, returnUrl } = {}) {
    if (!stripe) throw new Error('Stripe ej konfigurerat.');
    const session = await stripe.billingPortal.sessions.create({
      customer: normalizeText(customerId),
      return_url: normalizeText(returnUrl) || '/',
    });
    return { url: session.url };
  }

  return {
    isAvailable,
    createCustomer,
    createSubscription,
    changePlan,
    cancelSubscription,
    getSubscriptionStatus,
    createPortalSession,
  };
}

module.exports = {
  createBillingService,
};
