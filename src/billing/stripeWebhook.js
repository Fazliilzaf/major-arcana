'use strict';

const { planFromPriceId } = require('./stripeClient');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createStripeWebhookHandler({
  stripe = null,
  webhookSecret = '',
  tenantConfigStore = null,
  authStore = null,
} = {}) {
  const safeSecret = normalizeText(webhookSecret || process.env.STRIPE_WEBHOOK_SECRET);

  function verifySignature(rawBody, signature) {
    if (!stripe || !safeSecret) return null;
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, safeSecret);
    } catch (error) {
      return null;
    }
  }

  async function writeAudit({ tenantId, action, outcome, metadata }) {
    if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
    await authStore.addAuditEvent({
      tenantId: normalizeText(tenantId) || 'billing',
      actorUserId: 'stripe_webhook',
      action,
      outcome,
      targetType: 'billing',
      targetId: normalizeText(metadata?.subscriptionId || metadata?.customerId || ''),
      metadata,
    });
  }

  async function handleEvent(event) {
    if (!event || !event.type) return { handled: false, reason: 'invalid_event' };
    const eventType = normalizeText(event.type);
    const data = event.data?.object || {};

    switch (eventType) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscriptionId = normalizeText(data.id);
        const customerId = normalizeText(data.customer);
        const status = normalizeText(data.status);
        const priceId = normalizeText(data.items?.data?.[0]?.price?.id);
        const planTier = planFromPriceId(priceId) || 'free';
        const tenantId = normalizeText(data.metadata?.tenantId);

        if (tenantId && tenantConfigStore) {
          await tenantConfigStore.updateTenantConfig({
            tenantId,
            patch: {
              planTier,
              subscriptionStatus: status,
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: customerId,
              billingUpdatedAt: new Date().toISOString(),
            },
            actorUserId: 'stripe_webhook',
          });
        }

        await writeAudit({
          tenantId,
          action: `billing.subscription.${eventType === 'customer.subscription.created' ? 'created' : 'updated'}`,
          outcome: 'success',
          metadata: { subscriptionId, customerId, status, planTier, priceId },
        });

        return { handled: true, action: eventType, tenantId, planTier, status };
      }

      case 'customer.subscription.deleted': {
        const tenantId = normalizeText(data.metadata?.tenantId);
        const subscriptionId = normalizeText(data.id);

        if (tenantId && tenantConfigStore) {
          await tenantConfigStore.updateTenantConfig({
            tenantId,
            patch: {
              planTier: 'free',
              subscriptionStatus: 'canceled',
              billingUpdatedAt: new Date().toISOString(),
            },
            actorUserId: 'stripe_webhook',
          });
        }

        await writeAudit({
          tenantId,
          action: 'billing.subscription.deleted',
          outcome: 'success',
          metadata: { subscriptionId, tenantId },
        });

        return { handled: true, action: eventType, tenantId, planTier: 'free' };
      }

      case 'invoice.paid': {
        const tenantId = normalizeText(data.subscription_details?.metadata?.tenantId || data.metadata?.tenantId);
        const invoiceId = normalizeText(data.id);
        const amountPaid = data.amount_paid || 0;

        await writeAudit({
          tenantId,
          action: 'billing.invoice.paid',
          outcome: 'success',
          metadata: { invoiceId, amountPaid, currency: data.currency, tenantId },
        });

        return { handled: true, action: eventType, tenantId, invoiceId };
      }

      case 'invoice.payment_failed': {
        const tenantId = normalizeText(data.subscription_details?.metadata?.tenantId || data.metadata?.tenantId);
        const invoiceId = normalizeText(data.id);

        await writeAudit({
          tenantId,
          action: 'billing.invoice.payment_failed',
          outcome: 'error',
          metadata: { invoiceId, tenantId, attemptCount: data.attempt_count },
        });

        return { handled: true, action: eventType, tenantId, invoiceId };
      }

      default:
        return { handled: false, reason: 'unhandled_event_type', eventType };
    }
  }

  return {
    verifySignature,
    handleEvent,
    isAvailable: () => Boolean(stripe && safeSecret),
  };
}

module.exports = {
  createStripeWebhookHandler,
};
