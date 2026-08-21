'use strict';

/**
 * ORD-102 · Kortavstämning — routes.
 *
 * POST /cco-cf/card-import        {csvText, cardRef} → parse + import + matchning
 * GET  /cco-cf/card-reconciliation → {stats, unmatched, suggestions}
 * POST /cco-cf/card-transactions/:id/match  {expenseId}
 * POST /cco-cf/card-transactions/:id/ignore {reason}
 *
 * Monteras under /api/v1 EFTER requireCcoAuthenticated-bryggan (samma mönster
 * som cfoVoucherSync). OWNER-krav på alla vägar — avstämning är ägararbete.
 */

const express = require('express');
const { parseAmexCsv } = require('../cfo/cfoCardReconciliation');

function createCfoCardReconciliationRouter({ authStore, reconciliation }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';

  router.post('/cco-cf/card-import', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const csvText = String(req.body?.csvText || '');
      const cardRef = String(req.body?.cardRef || '').trim();
      if (!csvText || !cardRef) {
        return res.status(400).json({ ok: false, error: 'csvText och cardRef krävs' });
      }
      if (csvText.length > 2_000_000) {
        return res.status(413).json({ ok: false, error: 'CSV för stor (max 2 MB)' });
      }
      const { transactions, skipped } = parseAmexCsv(csvText, { cardRef });
      const importResult = await reconciliation.importTransactions(transactions);
      const matchResult = await reconciliation.runMatching();
      return res.json({
        ok: true,
        parsed: transactions.length,
        skipped,
        ...importResult,
        ...matchResult,
        stats: reconciliation.stats(),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/cco-cf/card-reconciliation', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : null;
      return res.json({
        ok: true,
        stats: reconciliation.stats(),
        transactions: reconciliation.listTransactions({
          status,
          limit: Math.min(500, Number(req.query.limit) || 200),
        }),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post(
    '/cco-cf/card-transactions/:id/match',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const expenseId = String(req.body?.expenseId || '').trim();
        if (!expenseId) return res.status(400).json({ ok: false, error: 'expenseId krävs' });
        const tx = await reconciliation.confirmMatch(req.params.id, expenseId, {
          actor: req.user?.id || null,
        });
        if (!tx) return res.status(404).json({ ok: false, error: 'transaktion finns ej' });
        // Bugbot PR #1466: dubbelmatchning avvisas — en utgift, en dragning
        if (tx.error) return res.status(409).json({ ok: false, error: tx.error });
        return res.json({ ok: true, transaction: tx });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/card-transactions/:id/ignore',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const tx = await reconciliation.ignoreTransaction(req.params.id, {
          reason: req.body?.reason,
          actor: req.user?.id || null,
        });
        if (!tx) return res.status(404).json({ ok: false, error: 'transaktion finns ej' });
        return res.json({ ok: true, transaction: tx });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createCfoCardReconciliationRouter };
