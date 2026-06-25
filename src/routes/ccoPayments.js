'use strict';

const express = require('express');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const { createSwishPaymentRequest } = require('../ops/ccoSwishPayments');
const {
  CONFIRM_TEXT,
  buildCardLinkDraft,
  buildFortnoxInvoiceDraft,
  buildMedicalFinanceInfo,
  requireConfirm,
} = require('../ops/ccoPaymentEndpointContracts');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoPaymentsRouter({ swishStore, authStore, config, requireAuth, requireRole }) {
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
      console.error('[cco-payments]', error);
      return res.status(500).json({ error: 'Kunde inte förbereda betalvägen.' });
    }
  }

  async function audit(actor, action, targetId, metadata = {}) {
    await authStore.addAuditEvent({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      outcome: 'success',
      targetType: 'cco_payment_prepare',
      targetId: targetId || actor.tenantId,
      metadata,
    });
  }

  router.get(
    '/cco-payments/contracts',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async () =>
        res.json({
          ok: true,
          moneySafety:
            'Alla endpoints är prepare/confirm-gated. Ingen endpoint auto-drar kort, överför pengar eller skickar Fortnox-faktura.',
          confirmText: CONFIRM_TEXT,
          endpoints: {
            swish: 'POST /api/v1/cco-payments/swish/payment-request',
            card: 'POST /api/v1/cco-payments/card-link',
            invoice: 'POST /api/v1/cco-payments/invoice-draft',
            medicalFinance: 'POST /api/v1/cco-payments/medical-finance-info',
          },
        })
      )
  );

  router.post(
    '/cco-payments/swish/payment-request',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        requireConfirm('swish', req.body?.confirmText);
        const result = await createSwishPaymentRequest({
          config,
          swishStore,
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          amount: req.body?.amount,
          message: req.body?.message,
          patientId: req.body?.patientId,
          commercialCaseId: req.body?.commercialCaseId,
          payerAlias: req.body?.payerAlias,
          payeePaymentReference: req.body?.payeePaymentReference,
        });
        await audit(actor, 'cco.payment.swish_request_prepared', result.payment.id, {
          patientId: result.payment.patientId || null,
          amount: result.payment.amount,
          commercialCaseId: result.payment.commercialCaseId || null,
        });
        return res.status(201).json({
          ok: true,
          prepared: true,
          requiresHumanSend: true,
          moneySafety: 'Swish-förfrågan är skapad; kunden måste fortfarande godkänna i Swish.',
          payment: result.payment,
          instructionUUID: result.instructionUUID,
          paymentRequestToken: result.paymentRequestToken,
          swishUrl: result.swishUrl,
        });
      })
  );

  router.post(
    '/cco-payments/card-link',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        requireConfirm('card', req.body?.confirmText);
        const draft = buildCardLinkDraft({
          patientId: req.body?.patientId,
          amount: req.body?.amount,
          message: req.body?.message,
          commercialCaseId: req.body?.commercialCaseId,
          returnUrl: req.body?.returnUrl,
        });
        await audit(actor, 'cco.payment.card_link_prepared', draft.ref, {
          patientId: draft.patientId,
          amount: draft.amount,
          provider: draft.provider,
        });
        return res.status(202).json(draft);
      })
  );

  router.post(
    '/cco-payments/invoice-draft',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        requireConfirm('invoice', req.body?.confirmText);
        const draft = buildFortnoxInvoiceDraft({
          patientId: req.body?.patientId,
          amount: req.body?.amount,
          commercialCaseId: req.body?.commercialCaseId,
          fortnoxCustomerNumber: req.body?.fortnoxCustomerNumber,
          description: req.body?.description,
          dueDateIso: req.body?.dueDateIso,
        });
        await audit(actor, 'cco.payment.invoice_draft_prepared', draft.ref, {
          patientId: draft.patientId,
          amount: draft.amount,
          fortnoxCustomerNumber: normalizeText(draft.fortnoxCustomerNumber),
        });
        return res.status(202).json(draft);
      })
  );

  router.post(
    '/cco-payments/medical-finance-info',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        requireConfirm('medicalFinance', req.body?.confirmText);
        const info = buildMedicalFinanceInfo({
          patientId: req.body?.patientId,
          amount: req.body?.amount,
          commercialCaseId: req.body?.commercialCaseId,
        });
        await audit(actor, 'cco.payment.medical_finance_prepared', info.ref, {
          patientId: info.patientId,
        });
        return res.status(202).json(info);
      })
  );

  return router;
}

module.exports = {
  createCcoPaymentsRouter,
};
