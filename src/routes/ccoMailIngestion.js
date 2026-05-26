'use strict';

const express = require('express');
const { ROLE_OWNER } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createCcoMailIngestionRouter({
  config,
  authStore,
  requireAuth,
  requireRole,
  ingestionStore,
  syncService,
  ingestionWorker,
  graphNotifications,
  logger = console,
}) {
  const router = express.Router();

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({
          error: error.message,
          metadata: error.metadata || null,
        });
      }
      logger?.error?.('[cco-mail-ingestion]', error);
      return res.status(500).json({ error: 'Kunde inte hantera mail-ingestion.' });
    }
  }

  router.get('/cco/mail-ingestion/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async () => {
      const mailboxEmail = normalizeEmail(req.query.mailboxEmail);
      return res.json({
        ok: true,
        enabled: config.ccoMailIngestionEnabled === true,
        mode: config.ccoMailIngestionMode || 'read_only',
        webhookEnabled: config.graphChangeNotificationsEnabled === true,
        webhookUrl: graphNotifications?.buildWebhookUrl?.(config) || null,
        dashboard: ingestionStore.buildDashboardSummary({ mailboxEmail }),
      });
    })
  );

  router.get('/cco/mail-ingestion/dashboard/readout', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async () => {
      const mailboxEmail = normalizeEmail(req.query.mailboxEmail);
      const dashboard = ingestionStore.buildDashboardSummary({ mailboxEmail });
      const needsReview = ingestionStore.listNeedsReview({ mailboxEmail, limit: 25 });
      const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><title>CCO Mail Ingestion</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;max-width:960px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}code{background:#f5f5f5;padding:2px 4px}</style>
</head><body>
<h1>CCO Mail Ingestion Dashboard</h1>
<p>Read-only auditvy. Microsoft Outlook rörs inte här.</p>
<p><strong>Mailbox:</strong> ${escapeHtml(mailboxEmail || 'alla')} · <strong>Mode:</strong> ${escapeHtml(config.ccoMailIngestionMode || 'read_only')}</p>
<h2>Status</h2>
<ul>
  <li>Raw messages: ${Number(dashboard.counts?.rawMessages || 0)}</li>
  <li>Processed: ${Number(dashboard.counts?.processed || 0)}</li>
  <li>Duplicates: ${Number(dashboard.counts?.duplicates || 0)}</li>
  <li>Needs review: ${Number(dashboard.counts?.needsReview || 0)}</li>
  <li>Failed: ${Number(dashboard.counts?.failed || 0)}</li>
  <li>Queue: ${Number(dashboard.queueLength || 0)}</li>
</ul>
<h2>Needs review</h2>
<table><thead><tr><th>Subject</th><th>From</th><th>Status</th><th>Received</th></tr></thead><tbody>
${needsReview
  .map(
    (row) => `<tr>
      <td>${escapeHtml(row.rawMessage?.subject || '')}</td>
      <td>${escapeHtml(row.rawMessage?.fromEmail || '')}</td>
      <td>${escapeHtml(row.ledger?.status || '')}</td>
      <td>${escapeHtml(row.rawMessage?.receivedDateTime || '')}</td>
    </tr>`
  )
  .join('')}
</tbody></table>
</body></html>`;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.send(html);
    })
  );

  router.post('/cco/mail-ingestion/sync', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const mailboxEmail = normalizeEmail(req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox);
      if (!mailboxEmail) {
        return res.status(400).json({ error: 'mailboxEmail krävs.' });
      }
      const mode = normalizeText(req.body?.mode) || config.ccoMailIngestionMode || 'read_only';
      const asyncMode = req.body?.async !== false;
      if (asyncMode && ingestionWorker) {
        const job = ingestionWorker.enqueueImportJob({
          mailboxEmail,
          mode,
          trigger: 'manual_async',
          createdBy: actor.userId || actor.email || 'owner',
          skipDelta: req.body?.skipDelta === true,
        });
        return res.status(202).json({
          ok: true,
          accepted: true,
          jobId: job.id,
          mailboxEmail,
          message: 'Import körs i bakgrunden. Processing sker via kö-jobb.',
        });
      }
      const result = await syncService.runMailboxImport({
        mailboxEmail,
        mode,
        trigger: 'manual',
        createdBy: actor.userId || actor.email || 'owner',
        skipDelta: req.body?.skipDelta === true,
      });
      return res.json({ ok: true, result });
    })
  );

  router.post('/cco/mail-ingestion/process', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async () => {
      const mailboxEmail = normalizeEmail(req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox);
      if (!mailboxEmail) {
        return res.status(400).json({ error: 'mailboxEmail krävs.' });
      }
      if (!ingestionWorker) {
        return res.status(503).json({ error: 'Mail ingestion worker saknas.' });
      }
      const result = await ingestionWorker.runProcessBatch({
        mailboxEmail,
        mode: normalizeText(req.body?.mode) || config.ccoMailIngestionMode || 'read_only',
        maxMessages: Number(req.body?.maxMessages || config.ccoMailIngestionQueueBatchSize || 75),
      });
      return res.json({ ok: true, result, dashboard: ingestionStore.buildDashboardSummary({ mailboxEmail }) });
    })
  );

  router.post('/cco/mail-ingestion/process-all', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async () => {
      const mailboxEmail = normalizeEmail(req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox);
      if (!mailboxEmail || !ingestionWorker) {
        return res.status(400).json({ error: 'mailboxEmail krävs och worker måste finnas.' });
      }
      const mode = normalizeText(req.body?.mode) || config.ccoMailIngestionMode || 'read_only';
      await ingestionWorker.ensureQueueIntegrity({ mailboxEmail });
      const job = ingestionWorker.enqueueProcessDrain({
        mailboxEmail,
        mode,
        maxBatches: Number(req.body?.maxBatches || 500),
      });
      return res.status(202).json({
        ok: true,
        accepted: true,
        jobId: job.id,
        mailboxEmail,
        queueLength: ingestionStore.buildDashboardSummary({ mailboxEmail }).queueLength,
        message: 'Processing körs i bakgrunden tills kön är tom.',
      });
    })
  );

  router.post('/cco/mail-ingestion/reset', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const mailboxEmail = normalizeEmail(req.body?.mailboxEmail);
      if (!mailboxEmail) {
        return res.status(400).json({ error: 'mailboxEmail krävs.' });
      }
      const result = await ingestionStore.resetMailboxLocalState({
        mailboxEmail,
        hardResetRaw: req.body?.hardResetRaw === true,
        actorUserId: actor.userId || actor.email || 'owner',
      });
      return res.json({ ok: true, result });
    })
  );

  router.post('/cco/mail-ingestion/subscriptions/ensure', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async () => {
      if (!config.graphChangeNotificationsEnabled) {
        return res.status(503).json({ error: 'Graph change notifications är avstängda i config.' });
      }
      const mailboxEmail = normalizeEmail(req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox);
      const subscription = await graphNotifications.createInboxSubscription({
        mailboxEmail,
        graphUserId: mailboxEmail,
      });
      return res.json({ ok: true, subscription });
    })
  );

  router.all('/cco/mail-ingestion/graph/webhook', async (req, res) => {
    try {
      const validationToken = normalizeText(req.query.validationToken);
      if (validationToken) {
        const token = await graphNotifications.handleValidationRequest(validationToken);
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        return res.status(200).send(token);
      }

      if (!config.graphChangeNotificationsEnabled) {
        return res.status(503).json({ error: 'webhook_disabled' });
      }

      const result = await graphNotifications.handleNotifications(req.body || {});
      return res.status(202).json({ ok: true, ...result });
    } catch (error) {
      logger?.error?.('[cco-mail-ingestion/webhook]', error);
      return res.status(500).json({ error: 'webhook_failed' });
    }
  });

  return router;
}

module.exports = {
  createCcoMailIngestionRouter,
};
