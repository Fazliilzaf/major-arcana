'use strict';

const express = require('express');
const { ROLE_OWNER } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createBillingRouter({
  billingService,
  stripeWebhookHandler,
  requireAuth,
  requireRole,
} = {}) {
  const router = express.Router();

  router.get('/billing/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const status = await billingService.getSubscriptionStatus({
        tenantId: req.auth?.activeTenantId,
      });
      return res.json({ ok: true, ...status });
    } catch (error) {
      return res.status(500).json({ error: normalizeText(error?.message) || 'Kunde inte hämta billing-status.' });
    }
  });

  router.post('/billing/customer', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      if (!billingService.isAvailable()) {
        return res.status(503).json({ error: 'Stripe ej konfigurerat.' });
      }
      const result = await billingService.createCustomer({
        tenantId: req.auth?.activeTenantId,
        email: normalizeText(req.body?.email || req.auth?.email),
        name: normalizeText(req.body?.name),
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      return res.status(400).json({ error: normalizeText(error?.message) || 'Kunde inte skapa kund.' });
    }
  });

  router.post('/billing/subscribe', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      if (!billingService.isAvailable()) {
        return res.status(503).json({ error: 'Stripe ej konfigurerat.' });
      }
      const status = await billingService.getSubscriptionStatus({
        tenantId: req.auth?.activeTenantId,
      });
      if (!status.stripeCustomerId) {
        return res.status(400).json({ error: 'Skapa en Stripe-kund först via POST /billing/customer.' });
      }
      const result = await billingService.createSubscription({
        tenantId: req.auth?.activeTenantId,
        customerId: status.stripeCustomerId,
        planTier: normalizeText(req.body?.planTier) || 'starter',
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      return res.status(400).json({ error: normalizeText(error?.message) || 'Kunde inte skapa prenumeration.' });
    }
  });

  router.post('/billing/change-plan', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      if (!billingService.isAvailable()) {
        return res.status(503).json({ error: 'Stripe ej konfigurerat.' });
      }
      const status = await billingService.getSubscriptionStatus({
        tenantId: req.auth?.activeTenantId,
      });
      if (!status.stripeSubscriptionId) {
        return res.status(400).json({ error: 'Ingen aktiv prenumeration.' });
      }
      const result = await billingService.changePlan({
        tenantId: req.auth?.activeTenantId,
        subscriptionId: status.stripeSubscriptionId,
        newPlanTier: normalizeText(req.body?.planTier),
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(400).json({ error: normalizeText(error?.message) || 'Kunde inte byta plan.' });
    }
  });

  router.post('/billing/cancel', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      if (!billingService.isAvailable()) {
        return res.status(503).json({ error: 'Stripe ej konfigurerat.' });
      }
      const status = await billingService.getSubscriptionStatus({
        tenantId: req.auth?.activeTenantId,
      });
      if (!status.stripeSubscriptionId) {
        return res.status(400).json({ error: 'Ingen aktiv prenumeration.' });
      }
      const result = await billingService.cancelSubscription({
        tenantId: req.auth?.activeTenantId,
        subscriptionId: status.stripeSubscriptionId,
        atPeriodEnd: req.body?.atPeriodEnd !== false,
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(400).json({ error: normalizeText(error?.message) || 'Kunde inte avbryta.' });
    }
  });

  router.post('/billing/portal', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      if (!billingService.isAvailable()) {
        return res.status(503).json({ error: 'Stripe ej konfigurerat.' });
      }
      const status = await billingService.getSubscriptionStatus({
        tenantId: req.auth?.activeTenantId,
      });
      if (!status.stripeCustomerId) {
        return res.status(400).json({ error: 'Ingen Stripe-kund.' });
      }
      const result = await billingService.createPortalSession({
        customerId: status.stripeCustomerId,
        returnUrl: normalizeText(req.body?.returnUrl) || normalizeText(req.headers?.referer) || '/',
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(400).json({ error: normalizeText(error?.message) || 'Kunde inte öppna portal.' });
    }
  });

  if (stripeWebhookHandler) {
    router.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
      const signature = req.headers['stripe-signature'];
      const event = stripeWebhookHandler.verifySignature(req.body, signature);
      if (!event) {
        return res.status(400).json({ error: 'Ogiltig webhook-signatur.' });
      }
      try {
        const result = await stripeWebhookHandler.handleEvent(event);
        return res.json({ received: true, ...result });
      } catch (error) {
        console.error('[stripe-webhook] Error:', error?.message);
        return res.status(500).json({ error: 'Webhook-hantering misslyckades.' });
      }
    });
  }

  return router;
}

module.exports = {
  createBillingRouter,
};
