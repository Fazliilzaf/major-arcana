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
  CONSULTATION_STATUSES,
  CLINICAL_STATUSES,
  DOCUMENT_STATUSES,
  CONSENT_STATUSES,
} = require('../ops/ccoConsultationStore');
const { syncPatient360FromConsultationCase } = require('../ops/ccoPatient360Bridge');

function toCaseInput(context, body = {}) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    customerId: context.customerId,
    customerName: context.customerName,
    consultationType: normalizeText(body.consultationType),
    requestedTreatment: normalizeText(body.requestedTreatment),
    consultationStatus: normalizeText(body.consultationStatus),
    clinicalStatus: normalizeText(body.clinicalStatus),
    documentStatus: normalizeText(body.documentStatus),
    consentStatus: normalizeText(body.consentStatus),
    treatmentPlanStatus: normalizeText(body.treatmentPlanStatus),
    notes: normalizeText(body.notes),
    requiredActions: Array.isArray(body.requiredActions) ? body.requiredActions : [],
  };
}

function createCcoConsultationsRouter({
  consultationStore,
  patientSystemStore = null,
  authStore,
  config,
}) {
  const router = express.Router();

  async function syncConsultationPatient360(context, consultationCase, options = {}) {
    const latestEvent = Array.isArray(consultationCase?.events)
      ? consultationCase.events.at(-1)
      : null;
    return syncPatient360FromConsultationCase({
      patientSystemStore,
      context: buildPatient360SyncContext(context),
      consultationCase,
      source: options.source || 'cco_consultations',
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
      return res.status(500).json({ error: 'Kunde inte hantera konsultationsytan.' });
    }
  }

  router.get('/cco-consultations/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(
        context,
        'Välj en aktiv tråd med kund innan konsultationsytan används.'
      );
      const consultationCase = await consultationStore.ensureCase({
        ...toCaseInput(context),
        consultationStatus: 'needs_review',
        clinicalStatus: 'inactive',
        documentStatus: 'inactive',
        consentStatus: 'required',
      });
      const patientRecord = await syncConsultationPatient360(context, consultationCase, {
        source: 'cco_consultations_case_read',
      });
      return res.json({
        consultationCase,
        patient360: serializePatient360(patientRecord),
        statuses: {
          consultation: CONSULTATION_STATUSES,
          clinical: CLINICAL_STATUSES,
          documents: DOCUMENT_STATUSES,
          consent: CONSENT_STATUSES,
        },
      });
    })
  );

  router.put('/cco-consultations/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(
        context,
        'Välj en aktiv tråd med kund innan konsultationsytan används.'
      );
      const existing = await consultationStore.ensureCase({
        ...toCaseInput(context),
        consultationStatus: 'needs_review',
        consentStatus: 'required',
      });
      const consultationCase = await consultationStore.upsertCase({
        ...existing,
        ...toCaseInput(context, req.body),
        events: [
          ...(Array.isArray(existing.events) ? existing.events : []),
          {
            type: 'consultation_case_updated',
            label: 'Konsultationsärende uppdaterat',
            detail: normalizeText(req.body?.notes) || 'Konsultationsbedömningen uppdaterades.',
            actorUserId: context.actor.userId,
            actorName: normalizeText(req.body?.ownerName),
          },
        ],
      });
      const patientRecord = await syncConsultationPatient360(context, consultationCase, {
        source: 'cco_consultations_case_update',
        includeTimelineEvent: true,
      });
      return res.json({
        consultationCase,
        patient360: serializePatient360(patientRecord),
      });
    })
  );

  router.post('/cco-consultations/document-check', async (req, res) =>
    handle(req, res, async (context) => {
      requireCcoRouteContext(
        context,
        'Välj en aktiv tråd med kund innan konsultationsytan används.'
      );
      const consultationCase = await consultationStore.recordDocumentCheck({
        ...toCaseInput(context, req.body),
        actorUserId: context.actor.userId,
        actorName: normalizeText(req.body?.ownerName),
        detail: normalizeText(req.body?.detail),
      });
      const patientRecord = await syncConsultationPatient360(context, consultationCase, {
        source: 'cco_consultations_document_check',
        includeTimelineEvent: true,
        event: Array.isArray(consultationCase.events) ? consultationCase.events.at(-1) : null,
      });
      return res.json({
        consultationCase,
        patient360: serializePatient360(patientRecord),
      });
    })
  );

  return router;
}

module.exports = {
  createCcoConsultationsRouter,
};
