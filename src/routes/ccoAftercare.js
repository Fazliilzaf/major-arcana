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
  AFTERCARE_STATUSES,
  CONTACT_STATUSES,
  OUTCOME_STATUSES,
  buildAftercareCaseReadout,
} = require('../ops/ccoAftercareStore');
const { syncPatient360FromAftercareCase } = require('../ops/ccoPatient360Bridge');

function toCaseInput(context, body = {}) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    customerId: context.customerId,
    customerName: context.customerName,
    category: normalizeText(body.category),
    aftercareStatus: normalizeText(body.aftercareStatus),
    contactStatus: normalizeText(body.contactStatus),
    outcomeStatus: normalizeText(body.outcomeStatus),
    scheduledForIso: normalizeText(body.scheduledForIso),
    doctorName: normalizeText(body.doctorName),
    reminderLeadMinutes: body.reminderLeadMinutes,
    notes: normalizeText(body.notes),
    nextStep: normalizeText(body.nextStep),
    linkedFollowUpId: normalizeText(body.linkedFollowUpId),
    requiredActions: Array.isArray(body.requiredActions) ? body.requiredActions : [],
  };
}

function toActionInput(context, body = {}) {
  return {
    ...toCaseInput(context, body),
    actionKey: normalizeText(body.action || body.actionKey),
    actorUserId: context.actor.userId,
    actorName: normalizeText(body.actorName || body.ownerName),
  };
}

function createCcoAftercareRouter({
  aftercareStore,
  patientSystemStore = null,
  authStore,
  config,
}) {
  const router = express.Router();

  async function syncAftercarePatient360(context, aftercareCase, options = {}) {
    const latestEvent = Array.isArray(aftercareCase?.events) ? aftercareCase.events.at(-1) : null;
    return syncPatient360FromAftercareCase({
      patientSystemStore,
      context: buildPatient360SyncContext(context),
      aftercareCase,
      source: options.source || 'cco_aftercare',
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
      return res.status(500).json({ error: 'Kunde inte hantera eftervårdsytan.' });
    }
  }

  router.get('/cco-aftercare/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(context, 'Välj en aktiv tråd med kund innan eftervårdsytan används.');
      const aftercareCase = await aftercareStore.ensureCase({
        ...toCaseInput(context),
        aftercareStatus: 'needs_review',
        contactStatus: 'pending',
        outcomeStatus: 'unknown',
      });
      const patientRecord = await syncAftercarePatient360(context, aftercareCase, {
        source: 'cco_aftercare_case_read',
      });
      return res.json({
        aftercareCase,
        aftercareReadout: buildAftercareCaseReadout(aftercareCase),
        patient360: serializePatient360(patientRecord),
        statuses: {
          aftercare: AFTERCARE_STATUSES,
          contact: CONTACT_STATUSES,
          outcome: OUTCOME_STATUSES,
        },
      });
    })
  );

  router.put('/cco-aftercare/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(context, 'Välj en aktiv tråd med kund innan eftervårdsytan används.');
      const existing = await aftercareStore.ensureCase({
        ...toCaseInput(context),
        aftercareStatus: 'needs_review',
        contactStatus: 'pending',
        outcomeStatus: 'unknown',
      });
      const aftercareCase = await aftercareStore.upsertCase({
        ...existing,
        ...toCaseInput(context, req.body),
        events: [
          ...(Array.isArray(existing.events) ? existing.events : []),
          {
            type: 'aftercare_case_updated',
            label: 'Eftervårdsärende uppdaterat',
            detail: normalizeText(req.body?.notes) || 'Eftervårdsbedömningen uppdaterades.',
            actorUserId: context.actor.userId,
            actorName: normalizeText(req.body?.ownerName),
          },
        ],
      });
      const patientRecord = await syncAftercarePatient360(context, aftercareCase, {
        source: 'cco_aftercare_case_update',
        includeTimelineEvent: true,
      });
      return res.json({
        aftercareCase,
        aftercareReadout: buildAftercareCaseReadout(aftercareCase),
        patient360: serializePatient360(patientRecord),
      });
    })
  );

  router.post('/cco-aftercare/case/action', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(context, 'Välj en aktiv tråd med kund innan eftervårdsytan används.');
      const aftercareCase = await aftercareStore.applyCaseAction(toActionInput(context, req.body));
      const patientRecord = await syncAftercarePatient360(context, aftercareCase, {
        source: 'cco_aftercare_case_action',
        includeTimelineEvent: true,
      });
      return res.json({
        aftercareCase,
        aftercareReadout: buildAftercareCaseReadout(aftercareCase),
        patient360: serializePatient360(patientRecord),
        message: 'Eftervårdsåtgärden sparades.',
      });
    })
  );

  return router;
}

module.exports = {
  createCcoAftercareRouter,
};
