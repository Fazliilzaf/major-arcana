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
const { createGoogleAdsAdapter } = require('../cfo/vendors/googleAds');

function createCfoBankReconciliationRouter({
  authStore,
  reconciliation,
  fortnoxStore,
  fortnoxMatchJobStore,
  expenseStore,
  googleAdsConnectorStore,
  recurringVendorMap,
  config,
  auditLog = null,
}) {
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

  async function buildFortnoxClientAndConnection() {
    const client = await buildFortnoxClient();
    if (!client || !fortnoxStore) return { client: null, connection: null };
    const tenantId = await resolveConnectedFortnoxTenantId(
      fortnoxStore,
      resolvedConfig.defaultTenantId || ''
    );
    const connection = await fortnoxStore.getConnection({ tenantId });
    return { client, connection };
  }

  // ORD-103b · Bakgrundskörning för Fortnox-verifikathämtning.
  // Återanvänder samma generiska jobbstore som kortavstämningen.
  async function runBankVoucherFetchJob({ onProgress, ...params }) {
    const client = await buildFortnoxClient();
    if (!client) {
      return { ok: false, error: 'Fortnox ej konfigurerat eller ej anslutet' };
    }
    const result = await reconciliation.fetchVouchers(client, { ...params, onProgress });
    if (!result.ok) return result;
    await reconciliation.persist();
    return { ok: true, ...result };
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

      let autoBookResult = null;
      if (resolvedConfig.cfoBankIncomeAutoBookEnabled) {
        const { client, connection } = await buildFortnoxClientAndConnection();
        if (client && connection) {
          autoBookResult = await reconciliation.autoBookIncomeTransactions(client, connection, {
            accounts: resolvedConfig.cfoBankIncomeAccounts,
            dryRun: false,
            auditLog,
          });
        } else {
          autoBookResult = { ok: false, reason: 'fortnox_not_connected_or_configured' };
        }
      }

      return res.json({
        ok: true,
        parsed: transactions.length,
        ...importResult,
        stats: reconciliation.stats(),
        autoBook: autoBookResult,
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

  function extractBankFetchParams(req) {
    return {
      financialYearDate: req.body?.financialYearDate || null,
      bankAccount: req.body?.bankAccount || '1930',
      fromDate: req.body?.fromDate || null,
      toDate: req.body?.toDate || null,
      merge: req.body?.merge === true,
    };
  }

  router.post(
    '/cco-cf/bank-reconciliation/fetch-vouchers/job',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (!fortnoxMatchJobStore) {
          return res.status(503).json({ ok: false, error: 'Fortnox-jobbstore saknas' });
        }
        const tenantId = req.auth?.tenantId || req.currentMembership?.tenantId || null;
        const userId = req.auth?.userId || req.currentUser?.id || null;
        const actor = { userId, role: ROLE_OWNER };
        const params = extractBankFetchParams(req);
        const job = await fortnoxMatchJobStore.start({
          tenantId,
          actor,
          dryRun: false,
          params,
          run: (jobParams) => {
            const { onProgress, ...rest } = jobParams;
            return runBankVoucherFetchJob({ ...rest, onProgress });
          },
        });
        return res.json({ ok: true, jobId: job.id, status: job.status });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.get(
    '/cco-cf/bank-reconciliation/fetch-vouchers/job/:jobId',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      try {
        if (!fortnoxMatchJobStore) {
          return res.status(503).json({ ok: false, error: 'Fortnox-jobbstore saknas' });
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

  // ORD-103b · SSE-progress för bankavstämningsverifikathämtning.
  router.get(
    '/cco-cf/bank-reconciliation/fetch-vouchers/job/:jobId/stream',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) => {
      try {
        if (!fortnoxMatchJobStore) {
          return res.status(503).json({ ok: false, error: 'Fortnox-jobbstore saknas' });
        }
        const job = fortnoxMatchJobStore.get(req.params.jobId);
        if (!job) {
          return res.status(404).json({ ok: false, error: 'Jobb finns inte' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
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

        const heartbeatTimer = setInterval(() => {
          sendEvent('heartbeat', { at: new Date().toISOString() });
        }, 30000);

        req.on('close', cleanup);
        req.on('error', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);

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

  // ORD-103c: rensa dubletter som uppstått vid tidigare importer.
  router.post(
    '/cco-cf/bank-reconciliation/dedupe',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const result = reconciliation.removeDuplicateTransactions();
        await reconciliation.persist();
        return res.json({ ok: true, ...result, stats: reconciliation.stats() });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-103d · Auto-bokför omatchade bankinkomster i Fortnox.
  router.post(
    '/cco-cf/bank-reconciliation/auto-book-income',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const { client, connection } = await buildFortnoxClientAndConnection();
        if (!client || !connection) {
          return res
            .status(503)
            .json({ ok: false, error: 'Fortnox ej konfigurerat eller ej anslutet' });
        }
        const dryRun = req.body?.dryRun !== false;
        const result = await reconciliation.autoBookIncomeTransactions(client, connection, {
          accounts: resolvedConfig.cfoBankIncomeAccounts,
          dryRun,
          auditLog,
        });
        await reconciliation.persist();
        return res.json({ ok: true, ...result, stats: reconciliation.stats() });
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

  // ORD-103e · Återkommande kostnader: generera och bokför förslag.
  router.post(
    '/cco-cf/bank-reconciliation/suggestions',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const result = reconciliation.suggestExpenseCategories({
          vendorMap: recurringVendorMap || { rules: [] },
          minConfidence: Number(req.body?.minConfidence) || 0.5,
        });
        await reconciliation.persist();
        return res.json({ ok: true, ...result, stats: reconciliation.stats() });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/bank-transactions/:id/apply-suggestion',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (!expenseStore || typeof expenseStore.createExpense !== 'function') {
          return res.status(503).json({ ok: false, error: 'Expense store är inte konfigurerat' });
        }
        const userId = req.auth?.userId || req.currentUser?.id || req.user?.id || null;
        const result = await reconciliation.applySuggestion(req.params.id, {
          actor: { userId, role: ROLE_OWNER },
          expenseStore,
        });
        await reconciliation.persist();
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.post(
    '/cco-cf/bank-reconciliation/suggestions/apply-all',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (!expenseStore || typeof expenseStore.createExpense !== 'function') {
          return res.status(503).json({ ok: false, error: 'Expense store är inte konfigurerat' });
        }
        const userId = req.auth?.userId || req.currentUser?.id || req.user?.id || null;
        const result = await reconciliation.applyAllSuggestions({
          actor: { userId, role: ROLE_OWNER },
          expenseStore,
          minConfidence:
            req.body?.minConfidence !== undefined && req.body?.minConfidence !== null
              ? Number(req.body.minConfidence)
              : 0.9,
        });
        await reconciliation.persist();
        return res.json({ ok: true, ...result, stats: reconciliation.stats() });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-102d-2 · Google Ads spend-widget.
  router.get(
    '/cco-cf/bank-reconciliation/google-ads-spend',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (!googleAdsConnectorStore) {
          return res
            .status(503)
            .json({ ok: false, error: 'Google Ads-connector store är inte konfigurerat' });
        }
        const adapter = createGoogleAdsAdapter({ connectorStore: googleAdsConnectorStore });
        const result = await adapter.fetchCampaignSpend({
          fromDate: req.query.fromDate,
          toDate: req.query.toDate,
        });
        if (!result.ok) {
          return res.status(502).json(result);
        }
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createCfoBankReconciliationRouter };
