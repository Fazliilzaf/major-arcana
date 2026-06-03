'use strict';

const express = require('express');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const { listOfferTemplates } = require('../ops/ccoOfferTemplateStore');
const {
  buildKunderReadout,
  computeSegmentStats,
  filterPatientsBySegment,
  loadAssetSignalsIndex,
  loadKunderBookingIndex,
} = require('../ops/ccoKunderEnrichment');
const { resolveStaffOwnership } = require('../ops/ccoKunderStaffOwner');
const { isAutomationRunnerEnabled } = require('../ops/ccoAutomationRegistry');
const {
  evaluatePatientSignals,
  getTreatmentAgreementStore,
  loadAgreementContext,
} = require('../ops/ccoAutomationRunner');
const { attachAutomationRoutes } = require('./ccoAutomationRoutes');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIntParam(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function createCcoStaffRouter({
  patientMasterStore,
  readCache = null,
  dashboardSnapshot = null,
  worklistSnapshot = null,
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
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera staff-endpoint.' });
    }
  }

  router.get(
    '/cco/staff/customers-shell',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const limit = parseIntParam(req.query.limit, 60);
        const offsetVal = parseIntParam(req.query.offset, 0);
        const query = normalizeText(req.query.q || req.query.query);
        const segment = normalizeText(req.query.segment);
        const includeAutomation = String(req.query.includeAutomation || '') === '1';
        const flags = String(req.query.flags || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const cacheKey = readCache
          ? readCache.buildKey(
              'customers-shell',
              actor.tenantId,
              JSON.stringify({
                limit,
                offset: offsetVal,
                query,
                flags,
                segment,
                includeAutomation,
                assignedOwner: normalizeText(req.query.assignedOwner),
                actorUserId: actor.userId,
              })
            )
          : '';

        const build = async () => {
          const allForStats = (
            await patientMasterStore.listPatients({
              tenantId: actor.tenantId,
              limit: 50_000,
              offset: 0,
            })
          ).patients;

          const staffOwnership = resolveStaffOwnership({
            queryAssigned: req.query.assignedOwner,
            actor,
            user: req.currentUser,
            patients: allForStats,
          });
          const assignedOwner = staffOwnership.assignedOwner;
          const segmentOpts = { assignedOwner };

          const [assetIndex, bookingBundle] = await Promise.all([
            loadAssetSignalsIndex(config, actor.tenantId),
            loadKunderBookingIndex(config, actor.tenantId, allForStats),
          ]);
          const bookingIndex = bookingBundle.index;
          const bookingCoverage = bookingBundle.coverage || 'missing';

          const baseList = await patientMasterStore.listPatients({
            tenantId: actor.tenantId,
            query,
            flags,
            limit: 50_000,
            offset: 0,
          });
          let rows = baseList.patients;
          if (segment) {
            rows = filterPatientsBySegment(
              rows,
              segment,
              assetIndex,
              bookingIndex,
              bookingCoverage,
              segmentOpts
            );
          }

          let segmentStats;
          const statsCacheKey = readCache
            ? readCache.buildKey(
                'customers-shell-segments',
                actor.tenantId,
                bookingCoverage,
                String(bookingBundle.sources?.engineBookings ?? 0),
                assignedOwner
              )
            : '';
          if (readCache && statsCacheKey) {
            const wrapped = await readCache.wrap(statsCacheKey, 120_000, async () =>
              computeSegmentStats(
                allForStats,
                assetIndex,
                bookingIndex,
                bookingCoverage,
                segmentOpts
              )
            );
            segmentStats = wrapped.value;
          } else {
            segmentStats = computeSegmentStats(
              allForStats,
              assetIndex,
              bookingIndex,
              bookingCoverage,
              segmentOpts
            );
          }

          const start = Math.max(0, offsetVal);
          const max = Math.max(1, Math.min(20000, limit));
          const page = rows.slice(start, start + max);

          const [stats] = await Promise.all([
            patientMasterStore.getTenantStats({ tenantId: actor.tenantId }),
          ]);

          const enrichedStats = {
            ...stats,
            kunderPanel: segmentStats.panel,
            bookingSources: bookingBundle.sources || {},
            bookingCoverage,
          };

          let readouts = page.map((patient) =>
            buildKunderReadout(patient, assetIndex, bookingIndex, segmentOpts)
          );

          let automationMeta = null;
          if (includeAutomation) {
            if (!isAutomationRunnerEnabled()) {
              automationMeta = {
                enabled: false,
                dryRun: true,
                reason: 'ENABLE_AUTOMATION_RUNNER är inte true',
              };
            } else {
              const agreementStore = await getTreatmentAgreementStore(config);
              readouts = [];
              for (const patient of page) {
                const readout = buildKunderReadout(patient, assetIndex, bookingIndex, segmentOpts);
                const agreement = await loadAgreementContext(
                  agreementStore,
                  actor.tenantId,
                  readout.patientId
                );
                const evaluation = evaluatePatientSignals(readout, {
                  agreement,
                  bookingCoverage,
                });
                readouts.push({
                  ...readout,
                  automationSignals: evaluation.signals,
                  automationTop: evaluation.topSignal,
                });
              }
              automationMeta = { enabled: true, dryRun: true, version: '2.0.0-b-sprint' };
            }
          }

          return {
            stats: enrichedStats,
            segmentStats,
            staffOwnership,
            bookingCoverage,
            automation: automationMeta,
            patients: {
              total: rows.length,
              offset: start,
              limit: max,
              patients: readouts,
            },
            offerTemplates: { templates: listOfferTemplates() },
            provider: 'customers-shell',
          };
        };

        if (readCache && cacheKey) {
          const { value, cacheHit } = await readCache.wrap(cacheKey, 45_000, build);
          return res.json({ ...value, cacheHit });
        }
        const payload = await build();
        return res.json({ ...payload, cacheHit: false });
      })
  );

  router.get(
    '/cco/staff/dashboard-snapshot',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const cacheKey = readCache ? readCache.buildKey('dashboard-snapshot', actor.tenantId) : '';
        if (readCache && cacheKey) {
          const cached = await readCache.get(cacheKey);
          if (cached) return res.json({ snapshot: cached, cacheHit: true });
        }
        const snapshot =
          dashboardSnapshot && typeof dashboardSnapshot.loadTenantSnapshot === 'function'
            ? await dashboardSnapshot.loadTenantSnapshot(actor.tenantId)
            : null;
        if (!snapshot) {
          return res.status(404).json({ error: 'Dashboard-snapshot saknas ännu.' });
        }
        if (readCache && cacheKey) {
          await readCache.set(cacheKey, snapshot, 60_000);
        }
        return res.json({ snapshot, cacheHit: false });
      })
  );

  router.get(
    '/cco/staff/worklist-snapshot',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const cacheKey = readCache ? readCache.buildKey('worklist-snapshot', actor.tenantId) : '';
        if (readCache && cacheKey) {
          const cached = await readCache.get(cacheKey);
          if (cached) return res.json({ snapshot: cached, cacheHit: true });
        }
        const snapshot =
          worklistSnapshot && typeof worklistSnapshot.loadTenantSnapshot === 'function'
            ? await worklistSnapshot.loadTenantSnapshot(actor.tenantId)
            : null;
        if (!snapshot) {
          return res.status(404).json({ error: 'Worklist-snapshot saknas ännu.' });
        }
        if (readCache && cacheKey) {
          await readCache.set(cacheKey, snapshot, 30_000);
        }
        return res.json({ snapshot, cacheHit: false });
      })
  );

  attachAutomationRoutes(router, {
    patientMasterStore,
    requireAuth,
    requireRole,
    ROLE_OWNER,
    ROLE_STAFF,
    config,
    handle,
  });

  return router;
}

module.exports = {
  createCcoStaffRouter,
};
