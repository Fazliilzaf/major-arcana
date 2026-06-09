'use strict';

const express = require('express');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const {
  getMedicalFinanceInfo,
  getPaymentPrepareContracts,
  prepareCardPaymentLink,
  prepareInvoiceDraft,
  prepareSwishPayment,
} = require('../ops/ccoPatientPaymentPrepare');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoPatientPaymentsRouter({
  patientMasterStore,
  swishStore = null,
  commercialStore = null,
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
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error('[cco-patient-payments]', error);
      return res.status(500).json({ error: 'Kunde inte hantera betalningsförberedelse.' });
    }
  }

  router.post(
    '/cco-patient-master/payment/prepare-swish',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!swishStore) {
          return res.status(503).json({ error: 'Swish-store saknas på servern.' });
        }
        const payload = await prepareSwishPayment({
          body: req.body,
          actor,
          config,
          swishStore,
          patientMasterStore,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_payment.prepare_swish',
          outcome: 'success',
          targetType: 'cco_patient_payment',
          targetId: payload.payment?.id || actor.tenantId,
          metadata: {
            patientId: normalizeText(req.body?.patientId),
            amount: payload.payment?.amount || null,
            autoExecuted: false,
          },
        });
        return res.status(201).json(payload);
      })
  );

  router.post(
    '/cco-patient-master/payment/prepare-card-link',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const payload = await prepareCardPaymentLink({
          body: req.body,
          actor,
          config,
          patientMasterStore,
          integrationStore,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_payment.prepare_card_link',
          outcome: 'success',
          targetType: 'cco_patient_payment',
          targetId: payload.paymentLinkId,
          metadata: {
            patientId: normalizeText(req.body?.patientId),
            autoExecuted: false,
          },
        });
        return res.status(201).json(payload);
      })
  );

  router.post(
    '/cco-patient-master/payment/prepare-invoice',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const payload = await prepareInvoiceDraft({
          body: req.body,
          actor,
          patientMasterStore,
          commercialStore,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_payment.prepare_invoice',
          outcome: 'success',
          targetType: 'cco_patient_payment',
          targetId: payload.invoiceDraftRef,
          metadata: {
            patientId: normalizeText(req.body?.patientId),
            autoExecuted: false,
            fortnoxWriteSupported: false,
          },
        });
        return res.status(201).json(payload);
      })
  );

  router.get(
    '/cco-patient-master/payment/medical-finance-info',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => handle(req, res, async () => res.json(getMedicalFinanceInfo()))
  );

  router.get(
    '/cco-patient-master/payment/contracts',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => handle(req, res, async () => res.json(getPaymentPrepareContracts()))
  );

  return router;
}

module.exports = {
  createCcoPatientPaymentsRouter,
};
