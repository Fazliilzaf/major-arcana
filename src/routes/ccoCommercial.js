const express = require('express');
const {
  WORKSPACE_ID,
  normalizeText,
  resolveCcoRouteActor,
  buildCcoRouteContext,
  requireCcoRouteContext,
  serializePatient360,
  buildPatient360SyncContext,
} = require('./ccoRouteShared');

const {
  COMMERCIAL_STATUSES,
  QUOTE_STATUSES,
  PAYMENT_STATUSES,
} = require('../ops/ccoCommercialStore');
const { syncPatient360FromCommercialCase } = require('../ops/ccoPatient360Bridge');

function toCaseInput(context, body = {}) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    customerId: context.customerId,
    customerName: context.customerName,
    offerType: normalizeText(body.offerType),
    commercialStatus: normalizeText(body.commercialStatus),
    quoteStatus: normalizeText(body.quoteStatus),
    paymentStatus: normalizeText(body.paymentStatus),
    quotedAmount: normalizeText(body.quotedAmount),
    depositAmount: normalizeText(body.depositAmount),
    dueDateIso: normalizeText(body.dueDateIso),
    notes: normalizeText(body.notes),
    nextStep: normalizeText(body.nextStep),
    linkedOperationCaseId: normalizeText(body.linkedOperationCaseId),
    requiredActions: Array.isArray(body.requiredActions) ? body.requiredActions : [],
  };
}

function createCcoCommercialRouter({
  commercialStore,
  patientSystemStore = null,
  authStore,
  config,
}) {
  const router = express.Router();

  async function syncCommercialPatient360(context, commercialCase, options = {}) {
    const latestEvent = Array.isArray(commercialCase?.events) ? commercialCase.events.at(-1) : null;
    return syncPatient360FromCommercialCase({
      patientSystemStore,
      context: buildPatient360SyncContext(context),
      commercialCase,
      source: options.source || 'cco_commercial',
      includeTimelineEvent: options.includeTimelineEvent === true,
      event: options.event || latestEvent,
    });
  }

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      const context = buildCcoRouteContext(req, actor);
      return await run(context);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera offert- och betalningsytan.' });
    }
  }

  router.get('/cco-commercial/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(
        context,
        'Välj en aktiv tråd med kund innan offert- och betalningsytan används.'
      );
      const commercialCase = await commercialStore.ensureCase({
        ...toCaseInput(context),
        commercialStatus: 'needs_review',
        quoteStatus: 'missing',
        paymentStatus: 'pending',
      });
      const patientRecord = await syncCommercialPatient360(context, commercialCase, {
        source: 'cco_commercial_case_read',
      });
      return res.json({
        commercialCase,
        patient360: serializePatient360(patientRecord),
        statuses: {
          commercial: COMMERCIAL_STATUSES,
          quote: QUOTE_STATUSES,
          payment: PAYMENT_STATUSES,
        },
      });
    })
  );

  router.put('/cco-commercial/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(
        context,
        'Välj en aktiv tråd med kund innan offert- och betalningsytan används.'
      );
      const existing = await commercialStore.ensureCase({
        ...toCaseInput(context),
        commercialStatus: 'needs_review',
        quoteStatus: 'missing',
        paymentStatus: 'pending',
      });
      const commercialCase = await commercialStore.upsertCase({
        ...existing,
        ...toCaseInput(context, req.body),
        events: [
          ...(Array.isArray(existing.events) ? existing.events : []),
          {
            type: 'commercial_case_updated',
            label: 'Offert- och betalningsärende uppdaterat',
            detail: normalizeText(req.body?.notes) || 'Det kommersiella läget uppdaterades.',
            actorUserId: context.actor.userId,
            actorName: normalizeText(req.body?.ownerName),
          },
        ],
      });
      const patientRecord = await syncCommercialPatient360(context, commercialCase, {
        source: 'cco_commercial_case_update',
        includeTimelineEvent: true,
      });
      return res.json({
        commercialCase,
        patient360: serializePatient360(patientRecord),
      });
    })
  );

  return router;
}

module.exports = {
  createCcoCommercialRouter,
};
