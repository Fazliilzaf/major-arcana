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
 *     har "customer invoice payment bookkeeping" → om-anslutning krävs, se ORD-67-ordern)
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
  // Bugbot (PR #835): in-process-körlås — överlappande OWNER-anrop 409:ar i
  // stället för att processa samma pending-kö parallellt. 'syncing'-statusen
  // i storen skyddar dessutom över processgränser.
  let runInProgress = false;
  router.post(
    '/cco-cf/voucher-sync/run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      if (runInProgress) {
        return res
          .status(409)
          .json({ ok: false, error: 'run_in_progress — vänta tills pågående körning är klar' });
      }
      runInProgress = true;
      try {
        const sync = await buildSync();
        const result = await sync.run({ dryRun: req.body?.dryRun === true });
        const status = result.ok ? 200 : 409;
        return res.status(status).json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      } finally {
        runInProgress = false;
      }
    }
  );

  // ORD-CM-16 · Ägar-styrd gate-override (GET/POST/DELETE). Env-editorn i
  // Render är maskinellt onåbar — detta är den granskningsbara vägen att tända
  // gaten efter ägar-GO. Allt audit-loggas; DELETE återgår till env-styrning.
  const fs = require('fs');
  const path = require('path');
  function overridePath() {
    const root = process.env.ARCANA_STATE_ROOT || '/var/data';
    return (
      process.env.ARCANA_CFO_VOUCHER_SYNC_OVERRIDE_PATH ||
      path.join(root, 'voucher-sync-override.json')
    );
  }
  function auditGate(action, req, extra = {}) {
    if (auditLog && typeof auditLog.append === 'function') {
      try {
        auditLog.append({
          action,
          actor: {
            role: req.ccoUser?.role || req.auth?.role || 'owner',
            userId: req.ccoUser?.userId || req.auth?.userId || null,
            email: req.ccoUser?.email || null,
          },
          detail: { actorEmail: req.ccoUser?.email || 'okänd', ...extra },
        });
      } catch {
        /* audit är best-effort */
      }
    }
  }
  router.get('/cco-cf/voucher-sync/override', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const p = overridePath();
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      return res.json({
        ok: true,
        exists: true,
        voucherSyncEnabled: parsed?.voucherSyncEnabled === true,
        path: p,
      });
    } catch {
      return res.json({ ok: true, exists: false, voucherSyncEnabled: false, path: p });
    }
  });
  router.post(
    '/cco-cf/voucher-sync/override',
    requireAuth,
    requireRole(ROLE_OWNER),
    express.json(),
    (req, res) => {
      if (req.body?.voucherSyncEnabled !== true) {
        return res
          .status(400)
          .json({ ok: false, error: 'kräver { voucherSyncEnabled: true } — explicit ägar-GO' });
      }
      const p = overridePath();
      try {
        fs.writeFileSync(
          p,
          JSON.stringify(
            {
              voucherSyncEnabled: true,
              setBy: req.ccoUser?.email || 'owner',
              setAt: new Date().toISOString(),
            },
            null,
            2
          ) + '\n',
          'utf8'
        );
      } catch (err) {
        return res
          .status(500)
          .json({ ok: false, error: 'kunde inte skriva override: ' + err.message });
      }
      auditGate('cf.fortnox.voucher_gate_override_set', req, { path: p });
      return res.json({ ok: true, voucherSyncEnabled: true, path: p });
    }
  );
  router.delete(
    '/cco-cf/voucher-sync/override',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      const p = overridePath();
      try {
        fs.writeFileSync(
          p,
          JSON.stringify(
            {
              voucherSyncEnabled: false,
              clearedBy: req.ccoUser?.email || 'owner',
              clearedAt: new Date().toISOString(),
            },
            null,
            2
          ) + '\n',
          'utf8'
        );
      } catch (err) {
        return res
          .status(500)
          .json({ ok: false, error: 'kunde inte skriva override: ' + err.message });
      }
      auditGate('cf.fortnox.voucher_gate_override_cleared', req, { path: p });
      return res.json({ ok: true, voucherSyncEnabled: false, path: p });
    }
  );
  // ORD-CM-19 · Ägar-regeln: auto-godkänn poster med full beviskedja +
  // leverantörsprejudikat (ägar-GO 2026-07-18 "du godkänner regeln, inte posterna").
  router.post(
    '/cco-cf/expenses/auto-approve',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      try {
        const { autoApproveExpenses } = require('../cfo/cfoExpenseAutoApprove');
        const result = await autoApproveExpenses({
          expenseStore: cfoExpenseStore,
          actor: req.ccoUser?.email ? `auto-regel (${req.ccoUser.email})` : 'auto-regel',
          auditLog,
        });
        auditGate('cf.fortnox.auto_approve_run', req, {
          approved: result.approved,
          skipped: result.skipped,
        });
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-CM-17 · återställ error-poster till pending (transient fel åtgärdat,
  // t.ex. om-ansluten OAuth). Owner-only + audit; rör aldrig synced/syncing.
  router.post(
    '/cco-cf/voucher-sync/retry-errors',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      try {
        const errored = cfoExpenseStore.listExpenses({ fortnoxSyncStatus: 'error', limit: 1000 });
        const results = [];
        for (const e of errored) {
          await cfoExpenseStore.markFortnoxRetry({
            id: e.id,
            actor: req.ccoUser?.email || 'owner',
          });
          results.push(e.id);
        }
        auditGate('cf.fortnox.voucher_retry_errors', req, { count: results.length });
        return res.json({ ok: true, retried: results.length, expenseIds: results });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // Skip-knapp: ägaren kan flytta privat/avvisad/annan post ur pending-kön.
  // Sätter fortnoxSyncStatus='skip' + exportPending=false. Återställs ej automatiskt.
  router.post(
    '/cco-cf/voucher-sync/skip',
    requireAuth,
    requireRole(ROLE_OWNER),
    express.json(),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      const expenseIds = req.body?.expenseIds;
      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res
          .status(400)
          .json({ ok: false, error: 'expenseIds måste vara en icke-tom array' });
      }
      const results = [];
      const errors = [];
      for (const id of expenseIds) {
        try {
          const e = await cfoExpenseStore.markFortnoxSkip({
            id,
            reason: req.body?.reason || 'owner-skip',
            actor: req.ccoUser?.email || 'owner',
          });
          results.push({ id, status: e.fortnoxSyncStatus });
        } catch (err) {
          errors.push({ id, error: err.message });
        }
      }
      auditGate('cf.fortnox.voucher_skip', req, { count: results.length, errors: errors.length });
      return res.json({ ok: errors.length === 0, skipped: results.length, results, errors });
    }
  );

  // ORD-CM-30 · Syncing-limbo-avstämning: söker verifikatet i Fortnox
  // (Description "CF <id>") för poster som fastnat i 'syncing'.
  // dryRun (default) = enbart rapport. dryRun=false: träff → synced med
  // verifikat-nr; ingen träff → pending (nästa run bokar). Källfakta, aldrig gissning.
  router.post(
    '/cco-cf/voucher-sync/resolve-syncing',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore)
        return res.status(503).json({ ok: false, error: 'expense store ej monterad' });
      try {
        const dryRun = req.body?.dryRun !== false;
        const sync = await buildSync();
        const result = await sync.resolveSyncing({ dryRun });
        auditGate('cf.fortnox.voucher_resolve_syncing', req, {
          dryRun,
          count: result.count,
        });
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.delete(
    '/cco-cf/voucher-sync/override',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      const p = overridePath();
      try {
        fs.unlinkSync(p);
      } catch (err) {
        if (err.code !== 'ENOENT') return res.status(500).json({ ok: false, error: err.message });
      }
      auditGate('cf.fortnox.voucher_gate_override_removed', req, { path: p });
      return res.json({ ok: true, voucherSyncEnabled: false });
    }
  );

  return router;
}

module.exports = { createCfoVoucherSyncRouter };
