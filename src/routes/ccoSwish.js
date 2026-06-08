'use strict';

const express = require('express');
const { ROLE_OWNER } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const { createSwishClient, swishConfigured } = require('../infra/swishClient');
const {
  applySwishCallback,
  createSwishPaymentRequest,
  refreshSwishPaymentStatus,
} = require('../ops/ccoSwishPayments');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePayeeAlias(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function createCcoSwishRouter({
  swishStore,
  integrationStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({
          error: error.message,
          metadata: error.metadata || null,
        });
      }
      console.error('[cco-swish]', error);
      return res.status(500).json({ error: 'Kunde inte hantera Swish-integrationen.' });
    }
  }

  router.get('/cco-swish/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const status = await swishStore.getPublicStatus({ tenantId: actor.tenantId });
      return res.json({
        configured: swishConfigured(config),
        ...status,
        callbackUrl: config.swishCallbackUrl,
        apiBaseUrl: config.swishApiBaseUrl,
      });
    })
  );

  router.post('/cco-swish/connect', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      if (!swishConfigured(config)) {
        return res.status(503).json({
          error:
            'Swish är inte konfigurerat. Sätt SWISH_CERT_PATH/SWISH_KEY_PATH eller SWISH_P12_PATH samt SWISH_CALLBACK_URL.',
        });
      }
      const payeeAlias = normalizePayeeAlias(req.body?.payeeAlias);
      if (!payeeAlias) {
        return res
          .status(400)
          .json({ error: 'payeeAlias krävs (10-siffrigt Swish Handelsnummer).' });
      }
      await swishStore.saveConnection({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        connection: {
          payeeAlias,
          connected: true,
          lastError: '',
        },
      });
      if (integrationStore?.setIntegrationConnection) {
        await integrationStore.setIntegrationConnection({
          tenantId: actor.tenantId,
          integrationId: 'swish',
          isConnected: true,
          actorUserId: actor.userId,
        });
      }
      await authStore.addAuditEvent({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'cco.swish.connected',
        outcome: 'success',
        targetType: 'swish_integration',
        targetId: actor.tenantId,
        metadata: { payeeAlias },
      });
      return res.json({
        ok: true,
        payeeAlias,
      });
    })
  );

  router.post('/cco-swish/disconnect', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      await swishStore.clearConnection({ tenantId: actor.tenantId });
      if (integrationStore?.setIntegrationConnection) {
        await integrationStore.setIntegrationConnection({
          tenantId: actor.tenantId,
          integrationId: 'swish',
          isConnected: false,
          actorUserId: actor.userId,
        });
      }
      await authStore.addAuditEvent({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'cco.swish.disconnected',
        outcome: 'success',
        targetType: 'swish_integration',
        targetId: actor.tenantId,
      });
      return res.json({ ok: true });
    })
  );

  router.post('/cco-swish/test', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const connection = await swishStore.getConnection({ tenantId: actor.tenantId });
      if (!connection.payeeAlias) {
        return res.status(503).json({ error: 'Swish är inte anslutet för denna tenant.' });
      }
      const client = createSwishClient(config);
      const result = await client.testConnection();
      return res.json({
        ok: true,
        payeeAlias: connection.payeeAlias,
        detail: result.detail,
      });
    })
  );

  router.post(
    '/cco-swish/payment-request',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const amount = req.body?.amount;
        if (amount === undefined || amount === null || amount === '') {
          return res.status(400).json({ error: 'amount krävs.' });
        }
        const result = await createSwishPaymentRequest({
          config,
          swishStore,
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          amount,
          message: req.body?.message,
          patientId: req.body?.patientId,
          commercialCaseId: req.body?.commercialCaseId,
          payerAlias: req.body?.payerAlias,
          payeePaymentReference: req.body?.payeePaymentReference,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.swish.payment_request',
          outcome: 'success',
          targetType: 'swish_payment',
          targetId: result.payment.id,
          metadata: {
            amount: result.payment.amount,
            patientId: result.payment.patientId || null,
          },
        });
        return res.status(201).json({
          ok: true,
          mode: 'prepare_only',
          requiresHumanAction: true,
          autoExecuted: false,
          payment: result.payment,
          instructionUUID: result.instructionUUID,
          paymentRequestToken: result.paymentRequestToken,
          swishUrl: result.swishUrl,
          message:
            'Swish-förfrågan skapad. Personal skickar/länkar manuellt — ingen automatisk debitering.',
        });
      })
  );

  router.get(
    '/cco-swish/payment-request/:paymentId',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const paymentId = normalizeText(req.params.paymentId);
        const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
        if (refresh) {
          const payment = await refreshSwishPaymentStatus({
            config,
            swishStore,
            tenantId: actor.tenantId,
            paymentId,
          });
          return res.json({ ok: true, payment });
        }
        const payment = await swishStore.getPayment({
          tenantId: actor.tenantId,
          paymentId,
        });
        if (!payment) {
          return res.status(404).json({ error: 'Swish-betalning hittades inte.' });
        }
        return res.json({ ok: true, payment });
      })
  );

  router.get('/cco-swish/payments', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const payments = await swishStore.listPayments({
        tenantId: actor.tenantId,
        limit: req.query.limit,
      });
      return res.json({ ok: true, payments });
    })
  );

  router.post('/cco-swish/callback', async (req, res) => {
    try {
      const instructionUUID = normalizeText(
        req.body?.id || req.body?.paymentRequestId || req.body?.instructionUUID
      );
      if (!instructionUUID) {
        return res.status(400).json({ error: 'Swish callback saknar betalnings-id.' });
      }
      const payment = await applySwishCallback({
        config,
        swishStore,
        instructionUUID,
      });
      return res.json({ ok: true, paymentId: payment.id, status: payment.status });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error('[cco-swish/callback]', error);
      return res.status(500).json({ error: 'Kunde inte hantera Swish-callback.' });
    }
  });

  return router;
}

module.exports = {
  createCcoSwishRouter,
};
