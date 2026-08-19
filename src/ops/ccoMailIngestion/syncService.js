const { createCcoMailboxTruthStore } = require('../ccoMailboxTruthStore');
const {
  createMicrosoftGraphMailboxTruthDelta,
} = require('../../infra/microsoftGraphMailboxTruthDelta');
const { processRawMessage } = require('./pipeline');
const { MAILBOX_FOLDER_TYPES } = require('./constants');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createCcoMailIngestionSyncService({
  config = {},
  graphReadConnector = null,
  ingestionStore = null,
  truthStore = null,
  patientDirectoryProvider = null,
  documentTriage = null,
  healthDeclarationIngest = null,
  clientoBookingIngest = null,
  portalNudge = null,
  imapMailboxSync = null,
  logger = console,
} = {}) {
  if (!ingestionStore) {
    throw new Error('createCcoMailIngestionSyncService requires ingestionStore');
  }

  async function openTruthStore() {
    if (truthStore) return truthStore;
    const truthPath = normalizeText(config.ccoMailboxTruthStorePath);
    if (!truthPath) {
      throw new Error('ccoMailboxTruthStorePath missing');
    }
    return createCcoMailboxTruthStore({ filePath: truthPath });
  }

  async function runDeltaSync({
    mailboxIds = [],
    folderTypes = MAILBOX_FOLDER_TYPES,
    pageSize,
    maxPagesPerFolder,
  } = {}) {
    const store = await openTruthStore();
    const delta = createMicrosoftGraphMailboxTruthDelta({
      connectorFactory: () => graphReadConnector,
      store,
    });
    return delta.runDeltaSync({
      mailboxIds,
      folderTypes,
      pageSize,
      maxPagesPerFolder,
    });
  }

  async function ingestTruthMessages({
    mailboxEmail = '',
    importRunId = '',
    sinceIso = null,
    mode = 'read_only',
    folderTypes = MAILBOX_FOLDER_TYPES,
    limit = 0,
    messageIds = null,
  } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    const truth = await openTruthStore();
    const account = ingestionStore.ensureMailAccount({
      email: normalizedMailbox,
      tenantId: config.defaultTenant || 'hair-tp-clinic',
      userId: normalizedMailbox,
      graphUserId: normalizedMailbox,
    });

    const hasMessageIdScope = Array.isArray(messageIds);
    const requestedMessageIds = new Set(
      asArray(messageIds)
        .map((value) => normalizeText(value))
        .filter(Boolean)
    );
    const messages = truth
      .listMessages({
        mailboxIds: [normalizedMailbox],
        folderTypes,
        sinceIso,
        limit: Math.max(0, Number(limit) || 0),
      })
      .filter(
        (message) =>
          !hasMessageIdScope || requestedMessageIds.has(normalizeText(message?.graphMessageId))
      );

    const totalFetched = messages.length;
    let totalSaved = 0;
    let totalDuplicates = 0;
    let saveEvery = 0;

    for (const message of messages) {
      const result = await ingestionStore.saveRawMessageFromTruth({
        truthMessage: message,
        mailAccountId: account.id,
        importRunId,
        dryRun: mode === 'dry_run',
      });
      if (result.duplicate) totalDuplicates += 1;
      else if (result.created) totalSaved += 1;
      saveEvery += 1;
      if (saveEvery >= 100) {
        await ingestionStore.save();
        saveEvery = 0;
      }
    }
    if (saveEvery > 0) {
      await ingestionStore.save();
    }

    return {
      mailboxEmail: normalizedMailbox,
      totalFetched,
      totalSaved,
      totalDuplicates,
      accountId: account.id,
    };
  }

  async function processQueue({ mailboxEmail = '', mode = 'read_only', maxMessages = 25 } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    // Incident 2026-08-18: brödsmulor genom hela batchen. Frysningarna har
    // varit helt tysta — inga loggar, inga timers, ingen exception — vilket
    // gjort att vi bara kunnat resonera oss fram till VAR event-loopen dog.
    // Med en rad före varje steg blir sista raden före tystnaden ett direkt
    // svar istället för en hypotes. Loggar bara id, antal och storlekar,
    // aldrig innehåll (PII).
    logger?.log?.(`[mail-ingestion] processQueue start mailbox=${normalizedMailbox || 'alla'}`);
    const directoryStartedAt = Date.now();
    const patientDirectory =
      typeof patientDirectoryProvider === 'function'
        ? asArray(await patientDirectoryProvider({ mailboxEmail: normalizedMailbox }))
        : [];
    logger?.log?.(
      `[mail-ingestion] patientkatalog laddad n=${patientDirectory.length} (${Date.now() - directoryStartedAt}ms)`
    );

    let processed = 0;
    let failed = 0;
    const results = [];
    const completedIds = [];

    while (processed + failed < maxMessages) {
      const rawMessageId = ingestionStore.dequeueNextRawMessageId({
        mailboxEmail: normalizedMailbox,
      });
      if (!rawMessageId) break;

      const rawMessage = await ingestionStore.hydrateRawMessage(rawMessageId);
      const ledger = ingestionStore.getLedgerByRawMessageId(rawMessageId);
      if (!rawMessage || !ledger) {
        completedIds.push(rawMessageId);
        continue;
      }

      // Sista raden före en eventuell frysning pekar ut exakt vilket
      // meddelande som orsakar den, och hur stort det är.
      const sizeOf = (value) => (typeof value === 'string' ? value.length : 0);
      const rawJson = rawMessage.rawJson || {};
      logger?.log?.(
        `[mail-ingestion] processar raw=${rawMessageId} ` +
          `bodyText=${sizeOf(rawMessage.bodyText)} bodyHtml=${sizeOf(rawMessage.bodyHtml)} ` +
          `rawJson.bodyHtml=${sizeOf(rawJson.bodyHtml)} rawJson.bodyText=${sizeOf(rawJson.bodyText)} ` +
          `rawJson.body.content=${sizeOf((rawJson.body || {}).content)}`
      );
      const messageStartedAt = Date.now();

      try {
        const result = await processRawMessage({
          store: ingestionStore,
          rawMessage,
          ledger,
          mode,
          patientDirectory,
          logger,
          persist: false,
          documentTriage,
          healthDeclarationIngest,
          clientoBookingIngest,
          portalNudge,
          tenantId: config.defaultTenantId || config.defaultTenant || 'hair-tp-clinic',
        });
        results.push(result);
        logger?.log?.(
          `[mail-ingestion] klar raw=${rawMessageId} skipped=${Boolean(result.skipped)} (${Date.now() - messageStartedAt}ms)`
        );
        if (result.skipped) {
          completedIds.push(rawMessageId);
        } else {
          processed += 1;
          completedIds.push(rawMessageId);
        }
      } catch (error) {
        // Tidigare svaldes felet helt tyst (catch (_error) utan logg), vilket
        // gjorde ett kastande meddelande omöjligt att skilja från en frysning.
        logger?.error?.(
          `[mail-ingestion] FEL raw=${rawMessageId} (${Date.now() - messageStartedAt}ms): ${error?.message || error}`
        );
        failed += 1;
        completedIds.push(rawMessageId);
      }
    }

    if (completedIds.length > 0) {
      await ingestionStore.completeQueuedMessages(completedIds, { persist: false });
    }
    logger?.log?.(
      `[mail-ingestion] batch klar processed=${processed} failed=${failed} — sparar state`
    );
    const saveStartedAt = Date.now();
    await ingestionStore.save();
    logger?.log?.(`[mail-ingestion] state sparat (${Date.now() - saveStartedAt}ms)`);

    return { processed, failed, results };
  }

  async function runMailboxImport({
    mailboxEmail = '',
    mode = 'read_only',
    trigger = 'manual',
    skipDelta = false,
    createdBy = 'system',
    folderTypes = MAILBOX_FOLDER_TYPES,
  } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    if (!normalizedMailbox) {
      return { skipped: true, reason: 'mailbox_email_missing' };
    }

    const syncState = ingestionStore.getState()?.mailSyncState?.[normalizedMailbox];
    if (syncState?.paused === true) {
      return { skipped: true, reason: 'mailbox_paused' };
    }

    const account = ingestionStore.ensureMailAccount({
      email: normalizedMailbox,
      tenantId: config.defaultTenant || config.defaultTenantId || 'hair-tp-clinic',
    });
    const importRun = await ingestionStore.startImportRun({
      mailAccountId: account.id,
      mode: trigger === 'webhook' ? 'webhook_trigger' : 'initial_sync',
      createdBy,
    });

    let deltaResult = null;
    try {
      if (!skipDelta && graphReadConnector) {
        deltaResult = await runDeltaSync({
          mailboxIds: [normalizedMailbox],
          folderTypes,
        });
      }

      const ingestResult = await ingestTruthMessages({
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        mode,
        folderTypes,
      });

      await ingestionStore.finishImportRun(importRun.id, {
        status: 'completed',
        totalFetched: ingestResult.totalFetched,
        totalSaved: ingestResult.totalSaved,
        totalDuplicates: ingestResult.totalDuplicates,
        totalProcessed: 0,
        totalFailed: 0,
      });

      await ingestionStore.appendAudit({
        type: 'mail_ingestion_import_completed',
        mailboxEmail: normalizedMailbox,
        trigger,
        mode,
        importRunId: importRun.id,
      });

      return {
        skipped: false,
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        deltaResult,
        ingestResult,
      };
    } catch (error) {
      await ingestionStore.finishImportRun(importRun.id, {
        status: 'failed',
        error: normalizeText(error?.message) || 'import_failed',
      });
      throw error;
    }
  }

  async function runMailboxCycle({
    mailboxEmail = '',
    mode = 'read_only',
    trigger = 'manual',
    skipDelta = false,
    createdBy = 'system',
    folderTypes = MAILBOX_FOLDER_TYPES,
    truthLimit = 0,
    deltaPageSize,
    deltaMaxPagesPerFolder,
  } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    if (!normalizedMailbox) {
      return { skipped: true, reason: 'mailbox_email_missing' };
    }

    const syncState = ingestionStore.getState()?.mailSyncState?.[normalizedMailbox];
    if (syncState?.paused === true) {
      return { skipped: true, reason: 'mailbox_paused' };
    }

    const account = ingestionStore.ensureMailAccount({
      email: normalizedMailbox,
      tenantId: config.defaultTenant || config.defaultTenantId || 'hair-tp-clinic',
    });
    const importRun = await ingestionStore.startImportRun({
      mailAccountId: account.id,
      mode: trigger === 'webhook' ? 'webhook_trigger' : 'delta_sync',
      createdBy,
    });

    let deltaResult = null;
    try {
      if (!skipDelta && graphReadConnector) {
        deltaResult = await runDeltaSync({
          mailboxIds: [normalizedMailbox],
          folderTypes,
          pageSize: deltaPageSize,
          maxPagesPerFolder: deltaMaxPagesPerFolder,
        });
      }

      const ingestResult = await ingestTruthMessages({
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        mode,
        folderTypes,
        limit: truthLimit,
      });

      const processResult =
        mode === 'dry_run'
          ? { processed: 0, failed: 0, results: [] }
          : await processQueue({
              mailboxEmail: normalizedMailbox,
              mode,
              maxMessages: Number(config.ccoMailIngestionMaxProcessPerCycle || 25),
            });

      await ingestionStore.finishImportRun(importRun.id, {
        status: 'completed',
        totalFetched: ingestResult.totalFetched,
        totalSaved: ingestResult.totalSaved,
        totalDuplicates: ingestResult.totalDuplicates,
        totalProcessed: processResult.processed,
        totalFailed: processResult.failed,
      });

      await ingestionStore.appendAudit({
        type: 'mail_ingestion_cycle_completed',
        mailboxEmail: normalizedMailbox,
        trigger,
        mode,
        importRunId: importRun.id,
      });

      return {
        skipped: false,
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        deltaResult,
        ingestResult,
        processResult,
      };
    } catch (error) {
      await ingestionStore.finishImportRun(importRun.id, {
        status: 'failed',
        error: normalizeText(error?.message) || 'cycle_failed',
      });
      throw error;
    }
  }

  async function runImapMailboxCycle({
    mailboxEmail = '',
    mode = 'read_only',
    trigger = 'poller',
    createdBy = 'system',
  } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    if (!normalizedMailbox) return { skipped: true, reason: 'mailbox_email_missing' };
    if (!imapMailboxSync || typeof imapMailboxSync.syncMailbox !== 'function') {
      return { skipped: true, reason: 'cco_imap_sync_unavailable' };
    }
    const configured =
      typeof imapMailboxSync.getConfiguredMailboxIds === 'function'
        ? new Set(imapMailboxSync.getConfiguredMailboxIds())
        : new Set();
    if (!configured.has(normalizedMailbox)) {
      return { skipped: true, reason: 'cco_imap_mailbox_not_configured' };
    }

    const syncState = ingestionStore.getState()?.mailSyncState?.[normalizedMailbox];
    if (syncState?.paused === true) return { skipped: true, reason: 'mailbox_paused' };

    const account = ingestionStore.ensureMailAccount({
      email: normalizedMailbox,
      tenantId: config.defaultTenant || config.defaultTenantId || 'hair-tp-clinic',
      userId: normalizedMailbox,
      graphUserId: `imap:${normalizedMailbox}`,
    });
    const importRun = await ingestionStore.startImportRun({
      mailAccountId: account.id,
      mode: 'imap_uid_sync',
      createdBy,
    });

    try {
      const imapResult = await imapMailboxSync.syncMailbox();
      if (imapResult.mailboxEmail !== normalizedMailbox) {
        throw new Error('cco_imap_mailbox_mismatch');
      }
      const changedMessageIds = asArray(imapResult.changedMessageIds)
        .map((value) => normalizeText(value))
        .filter(Boolean);
      const ingestResult = await ingestTruthMessages({
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        mode,
        folderTypes: ['inbox', 'sent'],
        messageIds: changedMessageIds,
      });
      const processResult =
        mode === 'dry_run'
          ? { processed: 0, failed: 0, results: [] }
          : await processQueue({
              mailboxEmail: normalizedMailbox,
              mode,
              maxMessages: Number(config.ccoMailIngestionMaxProcessPerCycle || 25),
            });
      await ingestionStore.finishImportRun(importRun.id, {
        status: imapResult.ok ? 'completed' : 'completed_with_errors',
        totalFetched: ingestResult.totalFetched,
        totalSaved: ingestResult.totalSaved,
        totalDuplicates: ingestResult.totalDuplicates,
        totalProcessed: processResult.processed,
        totalFailed: processResult.failed,
        error: imapResult.ok
          ? null
          : normalizeText(imapResult.error) || 'imap_sync_completed_with_errors',
      });
      await ingestionStore.appendAudit({
        type: 'cco_imap_mailbox_cycle_completed',
        mailboxEmail: normalizedMailbox,
        trigger,
        mode,
        importRunId: importRun.id,
        folderResults: asArray(imapResult.folders).map((folder) => ({
          folderType: normalizeText(folder?.folderType),
          imported: Number(folder?.imported || 0),
          remainingBacklog: Number(folder?.remainingBacklog || 0),
        })),
      });
      return {
        skipped: false,
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        imapResult,
        ingestResult,
        processResult,
      };
    } catch (error) {
      await ingestionStore.finishImportRun(importRun.id, {
        status: 'failed',
        error: normalizeText(error?.message) || 'cco_imap_cycle_failed',
      });
      throw error;
    }
  }

  return {
    runDeltaSync,
    ingestTruthMessages,
    processQueue,
    runMailboxImport,
    runMailboxCycle,
    runImapMailboxCycle,
  };
}

module.exports = {
  createCcoMailIngestionSyncService,
};
