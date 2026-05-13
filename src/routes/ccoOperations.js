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
  OPERATION_STATUSES,
  CLEARANCE_STATUSES,
  OUTCOME_STATUSES,
} = require('../ops/ccoOperationStore');
const { syncPatient360FromOperationCase } = require('../ops/ccoPatient360Bridge');

function toCaseInput(context, body = {}) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    customerId: context.customerId,
    customerName: context.customerName,
    procedureType: normalizeText(body.procedureType),
    operationStatus: normalizeText(body.operationStatus),
    clearanceStatus: normalizeText(body.clearanceStatus),
    outcomeStatus: normalizeText(body.outcomeStatus),
    scheduledForIso: normalizeText(body.scheduledForIso),
    doctorName: normalizeText(body.doctorName),
    theatreName: normalizeText(body.theatreName),
    notes: normalizeText(body.notes),
    nextStep: normalizeText(body.nextStep),
    linkedConsultationCaseId: normalizeText(body.linkedConsultationCaseId),
    requiredActions: Array.isArray(body.requiredActions) ? body.requiredActions : [],
  };
}

function createCcoOperationsRouter({
  operationStore,
  patientSystemStore = null,
  authStore,
  config,
}) {
  const router = express.Router();

  async function syncOperationPatient360(context, operationCase, options = {}) {
    const latestEvent = Array.isArray(operationCase?.events) ? operationCase.events.at(-1) : null;
    return syncPatient360FromOperationCase({
      patientSystemStore,
      context: buildPatient360SyncContext(context),
      operationCase,
      source: options.source || 'cco_operations',
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
      return res.status(500).json({ error: 'Kunde inte hantera operationsytan.' });
    }
  }

  router.get('/cco-operations/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(context, 'Välj en aktiv tråd med kund innan operationsytan används.');
      const operationCase = await operationStore.ensureCase({
        ...toCaseInput(context),
        operationStatus: 'needs_review',
        clearanceStatus: 'pending',
        outcomeStatus: 'unknown',
      });
      const patientRecord = await syncOperationPatient360(context, operationCase, {
        source: 'cco_operations_case_read',
      });
      return res.json({
        operationCase,
        patient360: serializePatient360(patientRecord),
        statuses: {
          operation: OPERATION_STATUSES,
          clearance: CLEARANCE_STATUSES,
          outcome: OUTCOME_STATUSES,
        },
      });
    })
  );

  router.put('/cco-operations/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(context, 'Välj en aktiv tråd med kund innan operationsytan används.');
      const existing = await operationStore.ensureCase({
        ...toCaseInput(context),
        operationStatus: 'needs_review',
        clearanceStatus: 'pending',
        outcomeStatus: 'unknown',
      });
      const operationCase = await operationStore.upsertCase({
        ...existing,
        ...toCaseInput(context, req.body),
        events: [
          ...(Array.isArray(existing.events) ? existing.events : []),
          {
            type: 'operation_case_updated',
            label: 'Operationsärende uppdaterat',
            detail: normalizeText(req.body?.notes) || 'Operationsbedömningen uppdaterades.',
            actorUserId: context.actor.userId,
            actorName: normalizeText(req.body?.ownerName),
          },
        ],
      });
      const patientRecord = await syncOperationPatient360(context, operationCase, {
        source: 'cco_operations_case_update',
        includeTimelineEvent: true,
      });
      return res.json({
        operationCase,
        patient360: serializePatient360(patientRecord),
      });
    })
  );

  return router;
}

module.exports = {
  createCcoOperationsRouter,
};
