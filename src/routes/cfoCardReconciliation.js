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
const { autoFetchVendorInvoices } = require('../cfo/cfoVendorInvoiceFetch');
const { bulkImportReceipts } = require('../cfo/cfoBulkReceiptImport');
const { runFortnoxCardMatch } = require('../cfo/cfoFortnoxCardMatch');
const { createFortnoxClient } = require('../cfo/cfoFortnoxClient');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

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
  fortnoxStore = null,
  fortnoxMatchJobStore = null,
  googleAdsConnectorStore = null,
  config = null,
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

  // ORD-102d-2 · vendor API auto-hämta (Google Ads, Meta, Apple, Microsoft m.fl.)
  router.post(
    '/cco-cf/card-reconciliation/vendor-fetch',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const threshold = Number.isFinite(Number(req.body?.threshold))
          ? Number(req.body.threshold)
          : 1000;
        const actor = { userId: req.user?.id || null, role: ROLE_OWNER };
        const result = await autoFetchVendorInvoices({
          reconciliation,
          expenseStore,
          receiptStore,
          config,
          connectorStore: googleAdsConnectorStore,
          actor,
          threshold,
          fromDate: req.body?.fromDate || null,
          toDate: req.body?.toDate || null,
        });
        if (auditLog && typeof auditLog.append === 'function') {
          auditLog.append({
            action: 'cf.card.vendor_fetch',
            actor,
            target: { kind: 'card_reconciliation' },
            detail: {
              threshold,
              matched: result.matched,
              scanned: result.scanned,
              configuredVendors: result.configuredVendors,
            },
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

  // ORD-102 steg 3 · läs redan bokade verifikat från Fortnox och matcha mot
  // omatchade korttransaktioner. Inga writes till Fortnox; markerar endast
  // korttransaktioner som hanterade vid entydig belopp+datum-träff.
  // Körningen är asynkron eftersom Fortnox API:et begränsas till ~100
  // anrop/minut och en full avstämning kan ta flera minuter.
  async function runFortnoxMatchJob({ tenantId, actor, dryRun, autoApply, params, onProgress }) {
    if (!fortnoxStore || !config?.fortnoxClientId || !config?.fortnoxClientSecret) {
      return { ok: false, error: 'Fortnox är inte konfigurerat' };
    }
    const fortnoxClient = createFortnoxClient({
      clientId: config.fortnoxClientId,
      clientSecret: config.fortnoxClientSecret,
      tenantId,
      getConnection: (input) => fortnoxStore.getConnection(input),
      saveConnection: (input) => fortnoxStore.saveConnection(input),
    });

    const result = await runFortnoxCardMatch({
      fortnoxClient,
      reconciliation,
      financialYearDate: params.financialYearDate,
      fromDate: params.fromDate,
      toDate: params.toDate,
      dryRun,
      autoApply,
      actor,
      amountTolerance: params.amountTolerance,
      dateToleranceDays: params.dateToleranceDays,
      onProgress,
    });

    if (auditLog && typeof auditLog.append === 'function') {
      auditLog.append({
        action: 'cf.card.fortnox_match',
        actor,
        target: { kind: 'card_reconciliation' },
        detail: {
          dryRun: result.dryRun,
          autoApplied: result.autoApplied,
          matched: result.matched,
          suggestions: result.suggestions,
          vouchersRead: result.vouchersRead,
          financialYearDate: params.financialYearDate || null,
          fromDate: params.fromDate || null,
          toDate: params.toDate || null,
        },
      });
    }

    return result;
  }

  function extractFortnoxMatchParams(req) {
    const financialYearDate = normalizeText(req.body?.financialYearDate) || undefined;
    const fromDate = normalizeText(req.body?.fromDate) || undefined;
    const toDate = normalizeText(req.body?.toDate) || undefined;
    const amountTolerance = Number.isFinite(Number(req.body?.amountTolerance))
      ? Number(req.body.amountTolerance)
      : 1;
    const dateToleranceDays = Number.isFinite(Number(req.body?.dateToleranceDays))
      ? Number(req.body.dateToleranceDays)
      : 7;
    return { financialYearDate, fromDate, toDate, amountTolerance, dateToleranceDays };
  }

  router.post(
    '/cco-cf/card-reconciliation/fortnox-match',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (!fortnoxMatchJobStore) {
          return res.status(503).json({ ok: false, error: 'Fortnox-match-jobbstore saknas' });
        }
        const tenantId = req.auth?.tenantId || req.currentMembership?.tenantId || null;
        const userId = req.auth?.userId || req.currentUser?.id || null;
        const actor = { userId, role: ROLE_OWNER };
        const dryRun = req.body?.dryRun !== false;
        const autoApply = req.body?.autoApply === true;
        const params = extractFortnoxMatchParams(req);
        const job = await fortnoxMatchJobStore.start({
          tenantId,
          actor,
          dryRun,
          params,
          run: (jobParams) => {
            const { onProgress, ...rest } = jobParams;
            return runFortnoxMatchJob({
              tenantId,
              actor,
              dryRun,
              autoApply,
              params: rest,
              onProgress,
            });
          },
        });
        return res.json({ ok: true, jobId: job.id, status: job.status, dryRun });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.get(
    '/cco-cf/card-reconciliation/fortnox-match/job/:jobId',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      try {
        if (!fortnoxMatchJobStore) {
          return res.status(503).json({ ok: false, error: 'Fortnox-match-jobbstore saknas' });
        }
        const job = fortnoxMatchJobStore.get(req.params.jobId);
        if (!job) {
          return res.status(404).json({ ok: false, error: 'Jobb finns inte' });
        }
        return res.json({ ok: true, job });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-102 steg 3 · SSE-progress för Fortnox-kortmatch.
  // Ersätter 2-sekunderspollningen med en ström av progress- och complete-event.
  router.get(
    '/cco-cf/card-reconciliation/fortnox-match/job/:jobId/stream',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      try {
        if (!fortnoxMatchJobStore) {
          return res.status(503).json({ ok: false, error: 'Fortnox-match-jobbstore saknas' });
        }
        const job = fortnoxMatchJobStore.get(req.params.jobId);
        if (!job) {
          return res.status(404).json({ ok: false, error: 'Jobb finns inte' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Render: disable proxy buffering
        res.flushHeaders?.();

        let alive = true;
        function sendEvent(eventName, payload) {
          if (!alive) return;
          try {
            res.write(`event: ${eventName}\n`);
            res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
          } catch (_e) {
            cleanup();
          }
        }

        function cleanup() {
          if (!alive) return;
          alive = false;
          try {
            fortnoxMatchJobStore.unsubscribe(job.id, onUpdate);
          } catch (_e) {}
          try {
            clearInterval(heartbeatTimer);
          } catch (_e) {}
          try {
            res.end();
          } catch (_e) {}
        }

        function onUpdate(snapshot) {
          if (!alive) return;
          const terminal = ['completed', 'failed'].includes(snapshot.status);
          sendEvent('progress', {
            jobId: snapshot.id,
            status: snapshot.status,
            progress: snapshot.progress,
            result: snapshot.result,
            error: snapshot.error,
            finishedAt: snapshot.finishedAt,
          });
          if (terminal) {
            sendEvent(snapshot.status === 'failed' ? 'error' : 'complete', {
              jobId: snapshot.id,
              status: snapshot.status,
              result: snapshot.result,
              error: snapshot.error,
            });
            cleanup();
          }
        }

        fortnoxMatchJobStore.subscribe(job.id, onUpdate);

        // Heartbeat håller anslutningen vid liv genom proxy-timeouts.
        const heartbeatTimer = setInterval(() => {
          sendEvent('heartbeat', { at: new Date().toISOString() });
        }, 30000);

        req.on('close', cleanup);
        req.on('error', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);

        // Skicka aktuellt tillstånd direkt vid anslutning.
        sendEvent('progress', {
          jobId: job.id,
          status: job.status,
          progress: job.progress,
          result: job.result,
          error: job.error,
          finishedAt: job.finishedAt,
        });
      } catch (err) {
        if (!res.headersSent) {
          return res.status(500).json({ ok: false, error: err.message });
        }
        try {
          res.end();
        } catch (_e) {}
      }
    }
  );

  return router;
}

module.exports = { createCfoCardReconciliationRouter };
