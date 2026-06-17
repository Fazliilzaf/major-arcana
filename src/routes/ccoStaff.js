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
const { getBookingSignals } = require('../ops/ccoKunderBookingEnrichment');
const { resolveScheduledTodayBooking, resolveTodayEncounter } = require('../ops/ccoActiveVisit');
const { resolveStaffOwnership } = require('../ops/ccoKunderStaffOwner');
const { isAutomationRunnerEnabled } = require('../ops/ccoAutomationRegistry');
const {
  evaluatePatientSignals,
  getTreatmentAgreementStore,
  getTemplateVersionApprovalStore,
  loadAgreementContext,
} = require('../ops/ccoAutomationRunner');
const { attachAutomationRoutes } = require('./ccoAutomationRoutes');
const {
  applyFasAReadoutFields,
  loadFasAContextForPatients,
} = require('../ops/ccoKunderFasAReadiness');
const { buildSmartNextStepReadout } = require('../ops/ccoSmartNextStepStore');

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
  treatmentEncounterStore = null,
  documentInstanceStore = null,
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
                segmentOpts,
                bookingBundle
              )
            );
            segmentStats = wrapped.value;
          } else {
            segmentStats = computeSegmentStats(
              allForStats,
              assetIndex,
              bookingIndex,
              bookingCoverage,
              segmentOpts,
              bookingBundle
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

          const fasAMap = await loadFasAContextForPatients({
            config,
            tenantId: actor.tenantId,
            patients: page,
            patientMasterStore,
          });

          let readouts = [];
          for (const patient of page) {
            const patientId = normalizeText(patient.id);
            const fasA = fasAMap.get(patientId);
            const readout = buildKunderReadout(patient, assetIndex, bookingIndex, {
              ...segmentOpts,
              fasA,
            });
            readouts.push(readout);
          }

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
              const templateApprovalStore = await getTemplateVersionApprovalStore(config);
              const instancesByPatient = new Map();
              if (documentInstanceStore?.listForTenant) {
                const allInstances = await documentInstanceStore.listForTenant({
                  tenantId: actor.tenantId,
                });
                for (const instance of allInstances) {
                  const pid = normalizeText(instance.patientId);
                  if (!pid) continue;
                  if (!instancesByPatient.has(pid)) instancesByPatient.set(pid, []);
                  instancesByPatient.get(pid).push(instance);
                }
              }
              const enriched = [];
              for (const readout of readouts) {
                const agreement = await loadAgreementContext(
                  agreementStore,
                  templateApprovalStore,
                  actor.tenantId,
                  readout.patientId
                );
                applyFasAReadoutFields(readout, fasAMap.get(readout.patientId), agreement);
                const smartNext = buildSmartNextStepReadout({
                  card: readout,
                  instances: instancesByPatient.get(readout.patientId) || [],
                });
                Object.assign(readout, smartNext);
                const evaluation = evaluatePatientSignals(readout, {
                  agreement,
                  bookingCoverage,
                  documentReadiness: smartNext.documentReadiness,
                });
                enriched.push({
                  ...readout,
                  automationSignals: evaluation.signals,
                  automationTop: evaluation.topSignal,
                });
              }
              readouts = enriched;
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

  router.post(
    '/cco/staff/watch-checkin',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.body?.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId saknas.' });
        }
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!patient) {
          return res.status(404).json({ error: 'patient_not_found' });
        }
        const checkedInAt = new Date().toISOString();
        let persistedEncounter = null;
        let persisted = false;
        let reason = null;
        if (treatmentEncounterStore?.upsertEncounter) {
          try {
            const bookingIndex = await loadKunderBookingIndex(config, actor.tenantId, [patient]);
            const signals = getBookingSignals(bookingIndex.index, patient.id);
            const bookingContext = {
              upcomingBookings: signals.upcomingBookings || [],
              historyBookings: signals.historyBookings || [],
            };
            const scheduledBooking = resolveScheduledTodayBooking(bookingContext);
            const visitEncounters = await treatmentEncounterStore.listByPatient({
              tenantId: actor.tenantId,
              patientId,
              limit: 20,
            });
            const encounter = resolveTodayEncounter(visitEncounters, {
              scheduledBooking,
              cardEncounterId: signals.encounterId,
            });
            if (encounter || scheduledBooking) {
              const base = encounter || {};
              persistedEncounter = await treatmentEncounterStore.upsertEncounter({
                ...base,
                tenantId: actor.tenantId,
                patientId,
                bookingId:
                  normalizeText(req.body?.bookingId) ||
                  normalizeText(base.bookingId) ||
                  normalizeText(scheduledBooking?.id || scheduledBooking?.bookingId),
                serviceLabel:
                  normalizeText(base.serviceLabel) ||
                  normalizeText(scheduledBooking?.serviceName || scheduledBooking?.title),
                resourceLabel:
                  normalizeText(base.resourceLabel) ||
                  normalizeText(scheduledBooking?.resourceLabel || scheduledBooking?.staff),
                startsAt:
                  normalizeText(base.startsAt) ||
                  normalizeText(scheduledBooking?.startsAt || scheduledBooking?.startAt),
                status:
                  normalizeText(base.status) === 'in_progress' ||
                  normalizeText(base.status) === 'completed'
                    ? base.status
                    : 'checked_in',
                metadata: {
                  ...(base.metadata || {}),
                  checkedInAt: normalizeText(base.metadata?.checkedInAt) || checkedInAt,
                  checkedInSource: 'v9_watch_swipe',
                },
              });
              persisted = true;
            } else {
              reason = 'no_today_booking';
            }
          } catch (error) {
            console.warn('[cco/staff/watch-checkin] persist failed', error);
            reason = 'persist_failed';
          }
        } else {
          reason = 'encounter_store_unavailable';
        }
        return res.json({
          ok: true,
          patientId,
          bookingId:
            normalizeText(req.body?.bookingId) ||
            normalizeText(persistedEncounter?.bookingId) ||
            null,
          checkedInAt,
          source: 'v9_watch_swipe',
          persisted,
          reason,
          encounterId: normalizeText(persistedEncounter?.encounterId) || null,
        });
      })
  );

  router.post(
    '/cco/staff/watch-complete-visit',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.body?.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId saknas.' });
        }
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!patient) {
          return res.status(404).json({ error: 'patient_not_found' });
        }
        const completedAt = new Date().toISOString();
        let persistedEncounter = null;
        let persisted = false;
        let reason = null;
        if (treatmentEncounterStore?.upsertEncounter) {
          try {
            const bookingIndex = await loadKunderBookingIndex(config, actor.tenantId, [patient]);
            const signals = getBookingSignals(bookingIndex.index, patient.id);
            const bookingContext = {
              upcomingBookings: signals.upcomingBookings || [],
              historyBookings: signals.historyBookings || [],
            };
            const scheduledBooking = resolveScheduledTodayBooking(bookingContext);
            const visitEncounters = await treatmentEncounterStore.listByPatient({
              tenantId: actor.tenantId,
              patientId,
              limit: 20,
            });
            const encounter = resolveTodayEncounter(visitEncounters, {
              scheduledBooking,
              cardEncounterId: signals.encounterId,
            });
            if (encounter || scheduledBooking) {
              const base = encounter || {};
              persistedEncounter = await treatmentEncounterStore.upsertEncounter({
                ...base,
                tenantId: actor.tenantId,
                patientId,
                bookingId:
                  normalizeText(req.body?.bookingId) ||
                  normalizeText(base.bookingId) ||
                  normalizeText(scheduledBooking?.id || scheduledBooking?.bookingId),
                serviceLabel:
                  normalizeText(base.serviceLabel) ||
                  normalizeText(scheduledBooking?.serviceName || scheduledBooking?.title),
                resourceLabel:
                  normalizeText(base.resourceLabel) ||
                  normalizeText(scheduledBooking?.resourceLabel || scheduledBooking?.staff),
                startsAt:
                  normalizeText(base.startsAt) ||
                  normalizeText(scheduledBooking?.startsAt || scheduledBooking?.startAt),
                status: 'completed',
                metadata: {
                  ...(base.metadata || {}),
                  completedAt,
                  completedSource: 'v9_active_visit',
                },
              });
              persisted = true;
            } else {
              reason = 'no_today_booking';
            }
          } catch (error) {
            console.warn('[cco/staff/watch-complete-visit] persist failed', error);
            reason = 'persist_failed';
          }
        } else {
          reason = 'encounter_store_unavailable';
        }
        return res.json({
          ok: true,
          patientId,
          bookingId:
            normalizeText(req.body?.bookingId) ||
            normalizeText(persistedEncounter?.bookingId) ||
            null,
          completedAt,
          source: 'v9_active_visit',
          persisted,
          reason,
          encounterId: normalizeText(persistedEncounter?.encounterId) || null,
        });
      })
  );

  router.post(
    '/cco/staff/watch-sms',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.body?.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId saknas.' });
        }
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!patient) {
          return res.status(404).json({ error: 'patient_not_found' });
        }
        const phone = normalizeText(
          patient.primaryPhone || (Array.isArray(patient.phones) ? patient.phones[0] : '')
        );
        const { sendSms, isConfigured, buildBookingReminderSms } = require('../sms/smsConnector');
        if (!isConfigured()) {
          return res.json({
            ok: false,
            dryRun: true,
            error: 'sms_not_configured',
            message: 'SMS-provider saknas — dry-run.',
          });
        }
        if (!phone) {
          return res.status(400).json({ error: 'missing_phone' });
        }
        const startsAt = normalizeText(req.body?.startsAt);
        const startDate = startsAt ? new Date(startsAt) : null;
        const date =
          startDate && !Number.isNaN(startDate.getTime())
            ? startDate.toLocaleDateString('sv-SE')
            : 'snart';
        const time =
          startDate && !Number.isNaN(startDate.getTime())
            ? startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
            : '';
        const message = buildBookingReminderSms({
          patientName: normalizeText(patient.displayName) || 'där',
          serviceName: normalizeText(req.body?.treatmentLabel) || 'besök',
          date,
          time,
        });
        const result = await sendSms({ to: phone, message });
        if (!result.ok) {
          return res.status(502).json({ error: result.error || 'sms_failed', details: result });
        }
        return res.json({ ok: true, dryRun: false, messageId: result.messageId, to: phone });
      })
  );

  attachAutomationRoutes(router, {
    patientMasterStore,
    documentInstanceStore,
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
