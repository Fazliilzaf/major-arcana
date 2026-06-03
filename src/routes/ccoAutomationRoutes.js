'use strict';

const { getCatalog, isAutomationRunnerEnabled } = require('../ops/ccoAutomationRegistry');
const {
  evaluatePatientSignals,
  loadAgreementContext,
  getTreatmentAgreementStore,
} = require('../ops/ccoAutomationRunner');
const {
  buildKunderReadout,
  loadAssetSignalsIndex,
  loadKunderBookingIndex,
} = require('../ops/ccoKunderEnrichment');

const WORKLIST_QUEUES = Object.freeze({
  health_declaration: 'customer.missing_health_declaration',
  journal: 'customer.missing_journal',
  cooling: ['customer.cooling_off_active', 'customer.cooling_off_passed'],
  agreement: 'customer.missing_agreement_consent_bundle',
  photo_review: 'customer.has_photo_review',
  ready: 'customer.ready_for_treatment',
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ruleIdsForQueue(queue) {
  const key = normalizeText(queue).toLowerCase();
  const mapped = WORKLIST_QUEUES[key];
  if (!mapped) return null;
  return Array.isArray(mapped) ? mapped : [mapped];
}

function attachAutomationRoutes(router, deps) {
  const { patientMasterStore, requireAuth, requireRole, ROLE_OWNER, ROLE_STAFF, config, handle } =
    deps;

  router.get(
    '/cco/automation/catalog',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async () => {
        return res.json(getCatalog());
      })
  );

  router.get(
    '/cco/automation/evaluate',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId krävs.' });
        }
        if (!isAutomationRunnerEnabled()) {
          return res.json({
            enabled: false,
            dryRun: true,
            patientId,
            reason: 'Sätt ENABLE_AUTOMATION_RUNNER=true',
          });
        }

        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patient saknas.' });
        }

        const [assetIndex, bookingBundle] = await Promise.all([
          loadAssetSignalsIndex(config, actor.tenantId),
          loadKunderBookingIndex(config, actor.tenantId, [patient]),
        ]);
        const readout = buildKunderReadout(patient, assetIndex, bookingBundle.index, {});
        const agreementStore = await getTreatmentAgreementStore(config);
        const agreement = await loadAgreementContext(agreementStore, actor.tenantId, patientId);
        const evaluation = evaluatePatientSignals(readout, {
          agreement,
          bookingCoverage: bookingBundle.coverage,
        });
        return res.json({
          patientId,
          readoutSummary: {
            displayName: readout.displayName,
            missingHealthDeclaration: readout.missingHealthDeclaration,
            missingJournal: readout.missingJournal,
            missingAgreement: readout.missingAgreement,
            needsPhotoReview: readout.needsPhotoReview,
          },
          agreementSummary: agreement,
          ...evaluation,
        });
      })
  );

  router.get(
    '/cco/automation/worklists',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const queue = normalizeText(req.query.queue);
        const ruleIds = ruleIdsForQueue(queue);
        if (!ruleIds) {
          return res.status(400).json({
            error: 'Ogiltig queue.',
            allowedQueues: Object.keys(WORKLIST_QUEUES),
          });
        }
        if (!isAutomationRunnerEnabled()) {
          return res.json({
            enabled: false,
            dryRun: true,
            queue,
            items: [],
            reason: 'Sätt ENABLE_AUTOMATION_RUNNER=true',
          });
        }

        const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 200));
        const list = await patientMasterStore.listPatients({
          tenantId: actor.tenantId,
          limit,
          offset: 0,
        });
        const [assetIndex, bookingBundle] = await Promise.all([
          loadAssetSignalsIndex(config, actor.tenantId),
          loadKunderBookingIndex(config, actor.tenantId, list.patients),
        ]);
        const agreementStore = await getTreatmentAgreementStore(config);
        const items = [];

        for (const patient of list.patients) {
          const readout = buildKunderReadout(patient, assetIndex, bookingBundle.index, {});
          const agreement = await loadAgreementContext(
            agreementStore,
            actor.tenantId,
            readout.patientId
          );
          const evaluation = evaluatePatientSignals(readout, {
            agreement,
            bookingCoverage: bookingBundle.coverage,
          });
          const hits = (evaluation.signals || []).filter(
            (signal) => signal.status === 'active' && ruleIds.includes(signal.ruleId)
          );
          if (hits.length) {
            items.push({
              patientId: readout.patientId,
              displayName: readout.displayName,
              signals: hits,
              topSignal: hits[0],
            });
          }
        }

        items.sort((a, b) => (b.topSignal?.priority || 0) - (a.topSignal?.priority || 0));

        return res.json({
          enabled: true,
          dryRun: true,
          queue,
          ruleIds,
          scanned: list.patients.length,
          count: items.length,
          items,
        });
      })
  );
}

module.exports = {
  attachAutomationRoutes,
  WORKLIST_QUEUES,
};
