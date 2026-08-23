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
const multer = require('multer');
const { parseAmexCsv } = require('../cfo/cfoCardReconciliation');
const { findInvoiceForTransaction, autoFetchInvoices } = require('../cfo/cfoInvoiceFetch');
const { bulkImportReceipts } = require('../cfo/cfoBulkReceiptImport');

function createCfoCardReconciliationRouter({
  authStore,
  reconciliation,
  expenseStore = null,
  receiptStore = null,
  cmStore = null,
  secureStorage = null,
  mailboxTruthStore = null,
  graphReadConnector = null,
  auditLog = null,
}) {
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

  // ORD-102c · Pyramid för klumpvis granskning (CM-mönstret).
  router.get(
    '/cco-cf/card-reconciliation/tree',
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
    '/cco-cf/card-transactions/:id/unmatch',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const tx = await reconciliation.unmatchTransaction(req.params.id, {
          actor: req.user?.id || null,
          reason: req.body?.reason,
        });
        if (!tx) return res.status(404).json({ ok: false, error: 'transaktion finns ej' });
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

  // ORD-102d · auto-hämta underlag för en specifik omatchad transaktion
  router.post(
    '/cco-cf/card-transactions/:id/fetch-invoice',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const tx = reconciliation
          .listTransactions({ status: 'unmatched' })
          .find((t) => t.id === req.params.id);
        if (!tx)
          return res
            .status(404)
            .json({ ok: false, error: 'transaktion finns ej eller är redan matchad' });
        const actor = { userId: req.user?.id || null, role: ROLE_OWNER };
        const result = await findInvoiceForTransaction(tx, {
          expenseStore,
          receiptStore,
          cmStore,
          secureStorage,
          mailboxTruthStore,
          graphReadConnector,
          actor,
          mailboxIds: req.body?.mailboxIds || null,
          reconciliation,
        });
        if (result.matched && result.expenseId) {
          const confirmed = await reconciliation.confirmMatch(tx.id, result.expenseId, { actor });
          if (confirmed?.error) {
            result.matchConfirmed = false;
            result.matchError = confirmed.error;
          } else {
            result.matchConfirmed = true;
            result.transaction = confirmed;
          }
        }
        if (auditLog && typeof auditLog.append === 'function') {
          auditLog.append({
            action: 'cf.card.fetch_invoice',
            actor,
            target: { kind: 'card_transaction', id: tx.id },
            detail: {
              matched: result.matched,
              source: result.source,
              expenseId: result.expenseId,
              evidence: result.evidence,
            },
          });
        }
        return res.json({ ok: true, result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-102d · bulk auto-hämta för alla omatchade över tröskel
  router.post(
    '/cco-cf/card-reconciliation/auto-fetch',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const threshold = Number.isFinite(Number(req.body?.threshold))
          ? Number(req.body.threshold)
          : 1000;
        const actor = { userId: req.user?.id || null, role: ROLE_OWNER };
        const result = await autoFetchInvoices({
          reconciliation,
          expenseStore,
          receiptStore,
          cmStore,
          secureStorage,
          mailboxTruthStore,
          graphReadConnector,
          actor,
          threshold,
          mailboxIds: req.body?.mailboxIds || null,
        });
        if (auditLog && typeof auditLog.append === 'function') {
          auditLog.append({
            action: 'cf.card.auto_fetch',
            actor,
            target: { kind: 'card_reconciliation' },
            detail: { threshold, matched: result.matched, scanned: result.scanned },
          });
        }
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-102i · bulkimport av externa kvitton/fakturor (PDF)
  const receiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, cb) => {
      const ok = /pdf/i.test(file.mimetype || '') || /\.pdf$/i.test(file.originalname || '');
      cb(ok ? null : new Error('Endast PDF-filer stöds'), ok);
    },
  });

  router.post(
    '/cco-cf/card-reconciliation/bulk-import-receipts',
    requireAuth,
    requireRole(ROLE_OWNER),
    receiptUpload.array('files'),
    async (req, res) => {
      try {
        if (!expenseStore || !receiptStore) {
          return res.status(503).json({ ok: false, error: 'CFO-store saknas' });
        }
        if (!Array.isArray(req.files) || req.files.length === 0) {
          return res.status(400).json({ ok: false, error: 'Inga filer mottagna' });
        }
        const actor = { userId: req.user?.id || null, role: ROLE_OWNER };
        const result = await bulkImportReceipts({
          files: req.files,
          actor,
          receiptStore,
          expenseStore,
          reconciliation,
        });
        if (auditLog && typeof auditLog.append === 'function') {
          auditLog.append({
            action: 'cf.card.bulk_import_receipts',
            actor,
            target: { kind: 'card_reconciliation' },
            detail: {
              imported: result.imported,
              expensesCreated: result.expensesCreated,
              matched: result.matched,
              errors: result.errors,
            },
          });
        }
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createCfoCardReconciliationRouter };
