'use strict';

const express = require('express');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const { listOfferTemplates } = require('../ops/ccoOfferTemplateStore');

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
        const offset = parseIntParam(req.query.offset, 0);
        const query = normalizeText(req.query.q || req.query.query);
        const flags = String(req.query.flags || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const cacheKey = readCache
          ? readCache.buildKey(
              'customers-shell',
              actor.tenantId,
              JSON.stringify({ limit, offset, query, flags })
            )
          : '';

        const build = async () => {
          const [stats, patientsResult] = await Promise.all([
            patientMasterStore.getTenantStats({ tenantId: actor.tenantId }),
            patientMasterStore.listPatients({
              tenantId: actor.tenantId,
              query,
              flags,
              limit,
              offset,
            }),
          ]);
          return {
            stats,
            patients: {
              ...patientsResult,
              patients: patientsResult.patients.map((patient) =>
                patientMasterStore.buildPatientCardReadout(patient)
              ),
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
        const cacheKey = readCache
          ? readCache.buildKey('dashboard-snapshot', actor.tenantId)
          : '';
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
        const cacheKey = readCache
          ? readCache.buildKey('worklist-snapshot', actor.tenantId)
          : '';
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

  return router;
}

module.exports = {
  createCcoStaffRouter,
};
