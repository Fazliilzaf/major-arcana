'use strict';

const express = require('express');
const { ROLE_OWNER } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const {
  NON_PATIENT_MAILBOX_IDS,
  runUnmatchedResolutionSweep,
  summarizeReviewGroups,
} = require('../ops/ccoMailIngestion/resolveUnmatched');
const { resolveIngestMailboxAllowlist } = require('../ops/ccoMailboxAllowlist');

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
  patientMasterStore = null,
  mailboxAllowlist = null,
  logger = console,
}) {
  const router = express.Router();

  // Konversationer Fas 1 — ingest-endpoints gate:as mot mailbox-allowlisten
  // (curated default / ARCANA_MAILBOX_ALLOWLIST). Ingestion får aldrig startas
  // mot en icke-allowlistad brevlåda.
  const allowlistedMailboxes = new Set(
    (Array.isArray(mailboxAllowlist) && mailboxAllowlist.length > 0
      ? mailboxAllowlist
      : resolveIngestMailboxAllowlist({
          envAllowlist: process.env.ARCANA_MAILBOX_ALLOWLIST,
          schedulerHistoryMailboxIds: config?.schedulerCcoHistoryMailboxIds,
        }).mailboxIds
    ).map((email) => normalizeEmail(email))
  );

  function assertAllowlistedMailbox(mailboxEmail) {
    const normalized = normalizeEmail(mailboxEmail);
    if (allowlistedMailboxes.has(normalized)) return;
    // Non-patient mailboxes (t.ex. info@fazli.se) får sweepas även om de inte
    // ingår i kundkonversations-allowlistan — de dismissas direkt som non-patient.
    if (NON_PATIENT_MAILBOX_IDS.includes(normalized)) return;
    const error = new Error(
      `Brevlådan ${mailboxEmail} är inte allowlistad för CCO-ingestion. ` +
        'Lägg till den via ARCANA_MAILBOX_ALLOWLIST om den ska ingå.'
    );
    error.statusCode = 403;
    error.metadata = { mailboxEmail, allowlisted: [...allowlistedMailboxes] };
    throw error;
  }

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

  function requireOwnerAck(req, action) {
    if (req.body?.ownerAck !== true) {
      const error = new Error('Åtgärden kräver explicit ägarbekräftelse.');
      error.statusCode = 409;
      error.metadata = { ownerAckRequired: true, action };
      throw error;
    }
  }

  async function recordOwnerAck(actor, action, metadata = {}) {
    await authStore.addAuditEvent({
      tenantId: actor.tenantId || config.defaultTenantId || 'hair-tp-clinic',
      actorUserId: actor.userId || actor.email || 'owner',
      action: 'cco.mail.ingestion.owner_ack',
      outcome: 'success',
      targetType: 'cco_mail_ingestion_action',
      targetId: action,
      metadata,
    });
  }

  function getStoreActivationStatus() {
    const deferred = ingestionStore?.deferred === true;
    const loaded =
      typeof ingestionStore?._isLoaded === 'function' ? ingestionStore._isLoaded() : !deferred;
    return {
      deferred,
      loaded,
      disabled: Boolean(ingestionStore?.disabled),
      reason: ingestionStore?.reason || null,
      filePath: ingestionStore?.filePath || null,
    };
  }

  router.get('/cco/mail-ingestion/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async () => {
      const mailboxEmail = normalizeEmail(req.query.mailboxEmail);
      return res.json({
        ok: true,
        enabled: config.ccoMailIngestionEnabled === true,
        mode: config.ccoMailIngestionMode || 'read_only',
        webhookEnabled: config.graphChangeNotificationsEnabled === true,
        webhookReady: graphNotifications?.isWebhookReady?.() === true,
        webhookUrl: graphNotifications?.buildWebhookUrl?.(config) || null,
        graphSubscriptions: graphNotifications?.listSubscriptions?.() || [],
        allowlistedMailboxes: [...allowlistedMailboxes],
        jobs: ingestionWorker?.listJobs?.() || [],
        store: getStoreActivationStatus(),
        dashboard: ingestionStore.buildDashboardSummary({ mailboxEmail }),
      });
    })
  );

  router.post(
    '/cco/mail-ingestion/activate',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (config.ccoMailIngestionEnabled !== true) {
          return res.status(503).json({
            ok: false,
            error: 'Mail-ingestion är inte aktiverat i konfigurationen.',
          });
        }
        requireOwnerAck(req, 'cco.mail.ingestion.activate');
        if (typeof ingestionStore?._load !== 'function') {
          return res.json({
            ok: true,
            activated: true,
            store: getStoreActivationStatus(),
            message: 'Mail-ingestion store är redan aktiv (ingen deferred fasad).',
          });
        }
        const before = getStoreActivationStatus();
        if (before.loaded) {
          return res.json({
            ok: true,
            activated: true,
            store: before,
            message: 'Mail-ingestion store är redan laddad.',
          });
        }
        await recordOwnerAck(actor, 'cco.mail.ingestion.activate', {
          filePath: before.filePath,
          previousReason: before.reason,
        });
        await ingestionStore._load();
        const after = getStoreActivationStatus();
        await authStore.addAuditEvent({
          tenantId: actor.tenantId || config.defaultTenantId || 'hair-tp-clinic',
          actorUserId: actor.userId || actor.email || 'owner',
          action: 'cco.mail.ingestion.activate',
          outcome: 'success',
          targetType: 'cco_mail_ingestion_store',
          targetId: after.filePath || 'deferred_store',
          metadata: {
            filePath: after.filePath,
            previousReason: before.reason,
          },
        });
        return res.json({
          ok: true,
          activated: true,
          store: after,
          dashboard: ingestionStore.buildDashboardSummary({}),
        });
      })
  );

  router.get(
    '/cco/mail-ingestion/dashboard/readout',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async () => {
        const mailboxEmail = normalizeEmail(req.query.mailboxEmail);
        const dashboard = ingestionStore.buildDashboardSummary({ mailboxEmail });
        const needsReview = ingestionStore.listNeedsReview({ mailboxEmail, limit: 25 });
        const unmatched = ingestionStore.listReviewQueue
          ? ingestionStore.listReviewQueue({ mailboxEmail, statuses: ['UNMATCHED'], limit: 25 })
          : [];
        const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><title>CCO Mail Ingestion</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;max-width:960px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}code{background:#f5f5f5;padding:2px 4px}.note{background:#f7f7f7;padding:12px;border-radius:8px;margin:12px 0}</style>
</head><body>
<h1>CCO Mail Ingestion Dashboard</h1>
<p>Read-only auditvy. Microsoft Outlook rörs inte här.</p>
<div class="note"><strong>Transport:</strong> Graph delta + scheduler (webhooks av medvetet tills pipelinen är stabil).</div>
<p><strong>Mailbox:</strong> ${escapeHtml(mailboxEmail || 'alla')} · <strong>Mode:</strong> ${escapeHtml(config.ccoMailIngestionMode || 'read_only')}</p>
<h2>Status</h2>
<ul>
  <li>Raw messages: ${Number(dashboard.counts?.rawMessages || 0)}</li>
  <li>Processed: ${Number(dashboard.counts?.processed || 0)}</li>
  <li>Duplicates: ${Number(dashboard.counts?.duplicates || 0)}</li>
  <li>Needs review: ${Number(dashboard.counts?.needsReview || 0)}</li>
  <li>Unmatched: ${Number(dashboard.counts?.unmatched || 0)}</li>
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
<h2>Unmatched</h2>
<table><thead><tr><th>Subject</th><th>Counterparty</th><th>Folder</th><th>Received</th><th>Link</th></tr></thead><tbody>
${unmatched
  .map(
    (row) => `<tr>
      <td>${escapeHtml(row.rawMessage?.subject || '')}</td>
      <td>${escapeHtml(row.reviewSummary?.counterpartyEmail || row.rawMessage?.fromEmail || '')}</td>
      <td>${escapeHtml(row.rawMessage?.folderType || '')}</td>
      <td>${escapeHtml(row.rawMessage?.receivedDateTime || '')}</td>
      <td><code>PATCH /api/v1/cco/mail-ingestion/link-patient</code></td>
    </tr>`
  )
  .join('')}
</tbody></table>
</body></html>`;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.send(html);
      })
  );

  router.get(
    '/cco/mail-ingestion/review-queue/summary',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async () => {
        const mailboxEmail = normalizeEmail(req.query.mailboxEmail);
        const rows = ingestionStore.listReviewQueue({
          mailboxEmail,
          statuses: ['UNMATCHED'],
          limit: 10000,
        });
        const groups = summarizeReviewGroups(rows);
        return res.json({
          ok: true,
          mailboxEmail: mailboxEmail || null,
          totalUnmatched: rows.length,
          uniqueCounterparties: groups.length,
          nonPatientCount: groups
            .filter((item) => item.nonPatient)
            .reduce((sum, item) => sum + item.count, 0),
          patientLikeCount: groups
            .filter((item) => !item.nonPatient)
            .reduce((sum, item) => sum + item.count, 0),
          groups: groups.slice(0, 100),
        });
      })
  );

  router.post(
    '/cco/mail-ingestion/resolve-unmatched-sweep',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const mailboxEmail = normalizeEmail(
          req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox
        );
        if (!mailboxEmail) {
          return res.status(400).json({ error: 'mailboxEmail krävs.' });
        }
        const dryRun = req.body?.dryRun === true;
        if (!dryRun) {
          requireOwnerAck(req, 'cco.mail.ingestion.resolve_unmatched_sweep');
          await recordOwnerAck(actor, 'cco.mail.ingestion.resolve_unmatched_sweep', {
            mailboxEmail,
            dryRun,
          });
        }
        const result = await runUnmatchedResolutionSweep({
          ingestionStore,
          patientMasterStore,
          tenantId: config.defaultTenantId || config.defaultTenant || 'hair-tp-clinic',
          mailboxEmail,
          actorUserId: actor.userId || actor.email || 'owner',
          autoEnrichPatientEmails: req.body?.autoEnrichPatientEmails !== false,
          dryRun,
        });
        if (
          !dryRun &&
          ingestionWorker &&
          Number(result.linked || 0) + Number(result.dismissed || 0) > 0
        ) {
          await ingestionStore.requestReprocessUnmatched({
            mailboxEmail,
            includeOldMatchVersion: false,
          });
        }
        return res.json({
          ok: true,
          dryRun,
          result,
          dashboard: ingestionStore.buildDashboardSummary({ mailboxEmail }),
        });
      })
  );

  router.get(
    '/cco/mail-ingestion/review-queue',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async () => {
        const mailboxEmail = normalizeEmail(req.query.mailboxEmail);
        const status = normalizeText(req.query.status || 'all').toLowerCase();
        const limit = Number(req.query.limit || 50);
        const statuses =
          status === 'unmatched'
            ? ['UNMATCHED']
            : status === 'needs_review'
              ? ['NEEDS_REVIEW', 'SECURITY_REVIEW']
              : ['UNMATCHED', 'NEEDS_REVIEW', 'SECURITY_REVIEW'];
        const rows = ingestionStore.listReviewQueue({ mailboxEmail, statuses, limit });
        return res.json({
          ok: true,
          mailboxEmail: mailboxEmail || null,
          status,
          count: rows.length,
          rows,
        });
      })
  );

  router.patch(
    '/cco/mail-ingestion/link-patient',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const rawMessageId = normalizeText(req.body?.rawMessageId);
        const patientId = normalizeText(req.body?.patientId);
        if (!rawMessageId || !patientId) {
          return res.status(400).json({ error: 'rawMessageId och patientId krävs.' });
        }
        const result = await ingestionStore.linkPatientToMessage({
          rawMessageId,
          patientId,
          actorUserId: actor.userId || actor.email || 'owner',
          linkedReason: normalizeText(req.body?.reason) || 'manual_link',
          force: req.body?.force === true,
          canForce: true,
        });
        return res.json({ ok: true, result });
      })
  );

  router.post(
    '/cco/mail-ingestion/reprocess-unmatched',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const mailboxEmail = normalizeEmail(
          req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox
        );
        if (!mailboxEmail) {
          return res.status(400).json({ error: 'mailboxEmail krävs.' });
        }
        requireOwnerAck(req, 'cco.mail.ingestion.reprocess_unmatched');
        await recordOwnerAck(actor, 'cco.mail.ingestion.reprocess_unmatched', { mailboxEmail });
        const result = await ingestionStore.requestReprocessUnmatched({
          mailboxEmail,
          includeOldMatchVersion: req.body?.includeOldMatchVersion !== false,
        });
        if (ingestionWorker && Number(result.requeued || 0) > 0) {
          ingestionWorker.enqueueProcessDrain({
            mailboxEmail,
            mode: config.ccoMailIngestionMode || 'read_only',
          });
        }
        return res.json({
          ok: true,
          mailboxEmail,
          ...result,
          dashboard: ingestionStore.buildDashboardSummary({ mailboxEmail }),
        });
      })
  );

  router.post('/cco/mail-ingestion/sync', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const mailboxEmail = normalizeEmail(
        req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox
      );
      if (!mailboxEmail) {
        return res.status(400).json({ error: 'mailboxEmail krävs.' });
      }
      assertAllowlistedMailbox(mailboxEmail);
      requireOwnerAck(req, 'cco.mail.ingestion.sync');
      await recordOwnerAck(actor, 'cco.mail.ingestion.sync', { mailboxEmail });
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

  router.post(
    '/cco/mail-ingestion/process',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async () => {
        const mailboxEmail = normalizeEmail(
          req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox
        );
        if (!mailboxEmail) {
          return res.status(400).json({ error: 'mailboxEmail krävs.' });
        }
        assertAllowlistedMailbox(mailboxEmail);
        if (!ingestionWorker) {
          return res.status(503).json({ error: 'Mail ingestion worker saknas.' });
        }
        const result = await ingestionWorker.runProcessBatch({
          mailboxEmail,
          mode: normalizeText(req.body?.mode) || config.ccoMailIngestionMode || 'read_only',
          maxMessages: Number(req.body?.maxMessages || config.ccoMailIngestionQueueBatchSize || 75),
        });
        return res.json({
          ok: true,
          result,
          dashboard: ingestionStore.buildDashboardSummary({ mailboxEmail }),
        });
      })
  );

  router.post(
    '/cco/mail-ingestion/process-all',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const mailboxEmail = normalizeEmail(
          req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox
        );
        if (!mailboxEmail || !ingestionWorker) {
          return res.status(400).json({ error: 'mailboxEmail krävs och worker måste finnas.' });
        }
        assertAllowlistedMailbox(mailboxEmail);
        requireOwnerAck(req, 'cco.mail.ingestion.process_all');
        await recordOwnerAck(actor, 'cco.mail.ingestion.process_all', { mailboxEmail });
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

  /* Konversationer Fas 1 — historisk backfill (read-only).
   * Kedjar full import (delta + ingest av all truth-historik) med process-
   * drain genom befintliga pipelinen (brusfilter/dedupe/kundmatchning/
   * conflict-review/needsReply). mode hårdlåses till read_only i workern —
   * ett ev. mode i request-body ignoreras. Allowlist-gated. */
  router.post(
    '/cco/mail-ingestion/backfill',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const mailboxEmail = normalizeEmail(
          req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox
        );
        if (!mailboxEmail) {
          return res.status(400).json({ error: 'mailboxEmail krävs.' });
        }
        assertAllowlistedMailbox(mailboxEmail);
        requireOwnerAck(req, 'cco.mail.ingestion.backfill');
        await recordOwnerAck(actor, 'cco.mail.ingestion.backfill', { mailboxEmail });
        if (!ingestionWorker || typeof ingestionWorker.enqueueBackfillJob !== 'function') {
          return res.status(503).json({ error: 'Mail ingestion worker saknas.' });
        }
        const job = ingestionWorker.enqueueBackfillJob({
          mailboxEmail,
          maxBatches: Number(req.body?.maxBatches || 500),
          createdBy: actor.userId || actor.email || 'owner',
        });
        return res.status(202).json({
          ok: true,
          accepted: true,
          jobId: job.id,
          mailboxEmail,
          mode: 'read_only',
          message: 'Historisk backfill körs i bakgrunden (import + processning, read-only).',
        });
      })
  );

  router.post('/cco/mail-ingestion/reset', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const mailboxEmail = normalizeEmail(req.body?.mailboxEmail);
      if (!mailboxEmail) {
        return res.status(400).json({ error: 'mailboxEmail krävs.' });
      }
      requireOwnerAck(req, 'cco.mail.ingestion.reset');
      await recordOwnerAck(actor, 'cco.mail.ingestion.reset', {
        mailboxEmail,
        hardResetRaw: req.body?.hardResetRaw === true,
      });
      const result = await ingestionStore.resetMailboxLocalState({
        mailboxEmail,
        hardResetRaw: req.body?.hardResetRaw === true,
        actorUserId: actor.userId || actor.email || 'owner',
      });
      return res.json({ ok: true, result });
    })
  );

  router.post(
    '/cco/mail-ingestion/subscriptions/ensure',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async () => {
        if (!config.graphChangeNotificationsEnabled) {
          return res
            .status(503)
            .json({ error: 'Graph change notifications är avstängda i config.' });
        }
        if (!graphNotifications?.isWebhookReady?.()) {
          return res.status(503).json({ error: 'Graph webhook saknar säker konfiguration.' });
        }
        const requested = Array.isArray(req.body?.mailboxIds)
          ? req.body.mailboxIds
          : [req.body?.mailboxEmail || config.ccoMailIngestionDefaultMailbox];
        const mailboxIds = [...new Set(requested.map(normalizeEmail).filter(Boolean))];
        for (const mailboxEmail of mailboxIds) assertAllowlistedMailbox(mailboxEmail);
        const result = await graphNotifications.ensureInboxSubscriptions({
          mailboxEmails: mailboxIds,
        });
        return res.json({
          ok: true,
          ...result,
          subscription: result.results?.[0]?.subscription || null,
        });
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
      if (!graphNotifications?.isWebhookReady?.()) {
        return res.status(503).json({ error: 'webhook_not_ready' });
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
