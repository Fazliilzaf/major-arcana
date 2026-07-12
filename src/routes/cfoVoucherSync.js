'use strict';

/**
 * ORD-67 · CF.9 — Fortnox voucher-sync: dryRun-rapport + gated skarp körning.
 *
 * Ägar-beslut 2026-07-13: "GO + dryRun först" — verifikat-payloads granskas
 * (av Fazli/revisorn) INNAN någon write tänds.
 *
 * Skarp körning kräver ALLA tre:
 *  1. ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED=true (Render-env, default AV)
 *  2. Fortnox-OAuth ansluten — och med **bookkeeping-scope** (dagens anslutning
 *     har "customer invoice payment" → om-anslutning krävs, se ORD-67-ordern)
 *  3. Denna POST /run körs manuellt av OWNER (ingen scheduler)
 *
 * dryRun (GET /dry-run) fungerar utan allt ovan — bygger payloads, skriver inget.
 */

const express = require('express');
const { createFortnoxClient } = require('../cfo/cfoFortnoxClient');
const { createCfoFortnoxVoucherSync } = require('../cfo/cfoFortnoxVoucherSync');
const { resolveConnectedFortnoxTenantId } = require('../cfo/cfoFortnoxTenantResolve');

function createCfoVoucherSyncRouter({
  authStore,
  cfoExpenseStore,
  fortnoxStore = null,
  config = {},
  auditLog = null,
}) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';

  async function buildSync() {
    let fortnoxClient = null;
    let connectionProbe = null;
    if (fortnoxStore) {
      const tenantId = await resolveConnectedFortnoxTenantId(
        fortnoxStore,
        config.defaultTenantId || ''
      );
      connectionProbe = {
        getConnection: () => fortnoxStore.getConnection({ tenantId }),
      };
      if (config.fortnoxClientId && config.fortnoxClientSecret) {
        fortnoxClient = createFortnoxClient({
          clientId: config.fortnoxClientId,
          clientSecret: config.fortnoxClientSecret,
          tenantId,
          getConnection: (input) => fortnoxStore.getConnection(input),
          saveConnection: (input) => fortnoxStore.saveConnection(input),
        });
      }
    }
    return createCfoFortnoxVoucherSync({
      expenseStore: cfoExpenseStore,
      fortnoxStore: connectionProbe,
      fortnoxClient,
      auditLog,
    });
  }

  // DryRun-rapport: verifikat-förslag för alla exporterade expenses som väntar
  // på Fortnox-sync. Skriver INGENTING — granskningsunderlag för ägare/revisor.
  router.get(
    '/cco-cf/voucher-sync/dry-run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      try {
        const sync = await buildSync();
        const pending = await sync.listPendingExpenses();
        const payloads = pending.map((e) => sync.buildVoucherPayload(e));
        return res.json({
          ok: true,
          dryRun: true,
          pendingCount: pending.length,
          payloads,
          note: 'Inget skrivet till Fortnox. Skarp körning kräver env-gate + bookkeeping-scope + POST /run.',
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // Skarp körning — fail-closed i cfoFortnoxVoucherSync (env-gate + OAuth-gate).
  router.post(
    '/cco-cf/voucher-sync/run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      try {
        const sync = await buildSync();
        const result = await sync.run({ dryRun: req.body?.dryRun === true });
        const status = result.ok ? 200 : 409;
        return res.status(status).json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createCfoVoucherSyncRouter };
