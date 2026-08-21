'use strict';

/**
 * ORD-103 · Bankavstämning Handelsbanken mot Fortnox-verifikat — routes.
 *
 * POST /cco-cf/bank-import        {csvText} → parse + import
 * GET  /cco-cf/bank-reconciliation → {stats, transactions}
 * POST /cco-cf/bank-reconciliation/fetch-vouchers → hämta verifikat från Fortnox
 * POST /cco-cf/bank-reconciliation/run-matching → matcha
 * POST /cco-cf/bank-transactions/:id/match  {voucherId}
 * POST /cco-cf/bank-transactions/:id/ignore {reason}
 */

const express = require('express');
const { parseHandelsbankenCsv } = require('../cfo/cfoBankReconciliation');
const { createFortnoxClient } = require('../cfo/cfoFortnoxClient');
const { resolveConnectedFortnoxTenantId } = require('../cfo/cfoFortnoxTenantResolve');

function createCfoBankReconciliationRouter({ authStore, reconciliation, fortnoxStore, config }) {
  const router = express.Router();
  const resolvedConfig = config || {};

  async function buildFortnoxClient() {
    if (!fortnoxStore) return null;
    if (!resolvedConfig.fortnoxClientId || !resolvedConfig.fortnoxClientSecret) return null;
    const tenantId = await resolveConnectedFortnoxTenantId(
      fortnoxStore,
      resolvedConfig.defaultTenantId || ''
    );
    return createFortnoxClient({
      clientId: resolvedConfig.fortnoxClientId,
      clientSecret: resolvedConfig.fortnoxClientSecret,
      tenantId,
      getConnection: (input) => fortnoxStore.getConnection(input),
      saveConnection: (input) => fortnoxStore.saveConnection(input),
    });
  }
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';

  router.post('/cco-cf/bank-import', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const csvText = String(req.body?.csvText || '');
      if (!csvText) return res.status(400).json({ ok: false, error: 'csvText krävs' });
      if (csvText.length > 2_000_000)
        return res.status(413).json({ ok: false, error: 'CSV för stor' });
      const transactions = parseHandelsbankenCsv(csvText);
      const importResult = await reconciliation.importTransactions(transactions);
      await reconciliation.persist();
      return res.json({
        ok: true,
        parsed: transactions.length,
        ...importResult,
        stats: reconciliation.stats(),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/cco-cf/bank-reconciliation', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : null;
      return res.json({
        ok: true,
        stats: reconciliation.stats(),
        transactions: reconciliation.listTransactions({ status, limit: 500 }),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-102c · Pyramid för klumpvis granskning (CM-mönstret).
  router.get(
    '/cco-cf/bank-reconciliation/tree',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      try {
        return res.json({
          ok: true,
          stats: reconciliation.stats(),
          ...reconciliation.groupsTree(),
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/bank-reconciliation/fetch-vouchers',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const client = await buildFortnoxClient();
        if (!client)
          return res
            .status(503)
            .json({ ok: false, error: 'Fortnox ej konfigurerat eller ej anslutet' });
        const financialYearDate = req.body?.financialYearDate || null;
        const result = await reconciliation.fetchVouchers(client, {
          financialYearDate,
          bankAccount: req.body?.bankAccount || '1930',
          fromDate: req.body?.fromDate || null,
          toDate: req.body?.toDate || null,
          merge: req.body?.merge === true,
        });
        if (!result.ok) return res.status(502).json(result);
        await reconciliation.persist();
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/bank-reconciliation/run-matching',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const result = reconciliation.runMatching(req.body || {});
        await reconciliation.persist();
        return res.json({ ok: true, ...result, stats: reconciliation.stats() });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/bank-transactions/:id/match',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const voucherId = String(req.body?.voucherId || '').trim();
        if (!voucherId) return res.status(400).json({ ok: false, error: 'voucherId krävs' });
        const tx = reconciliation.confirmMatch(req.params.id, voucherId, {
          actor: req.user?.id || null,
        });
        if (!tx) return res.status(404).json({ ok: false, error: 'transaktion finns ej' });
        if (tx.error) return res.status(409).json({ ok: false, error: tx.error });
        await reconciliation.persist();
        return res.json({ ok: true, transaction: tx });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/bank-transactions/:id/ignore',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const tx = reconciliation.ignoreTransaction(req.params.id, {
          reason: req.body?.reason,
          actor: req.user?.id || null,
        });
        if (!tx) return res.status(404).json({ ok: false, error: 'transaktion finns ej' });
        await reconciliation.persist();
        return res.json({ ok: true, transaction: tx });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createCfoBankReconciliationRouter };
