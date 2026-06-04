const { createCcoMailboxTruthStore } = require('../ccoMailboxTruthStore');
const { createMicrosoftGraphMailboxTruthDelta } = require('../../infra/microsoftGraphMailboxTruthDelta');
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

  async function runDeltaSync({ mailboxIds = [], folderTypes = MAILBOX_FOLDER_TYPES } = {}) {
    const store = await openTruthStore();
    const delta = createMicrosoftGraphMailboxTruthDelta({
      connectorFactory: () => graphReadConnector,
      store,
    });
    return delta.runDeltaSync({
      mailboxIds,
      folderTypes,
    });
  }

  async function ingestTruthMessages({
    mailboxEmail = '',
    importRunId = '',
    sinceIso = null,
    mode = 'read_only',
    folderTypes = MAILBOX_FOLDER_TYPES,
  } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    const truth = await openTruthStore();
    const account = ingestionStore.ensureMailAccount({
      email: normalizedMailbox,
      tenantId: config.defaultTenant || 'hair-tp-clinic',
      userId: normalizedMailbox,
      graphUserId: normalizedMailbox,
    });

    const messages = truth.listMessages({
      mailboxIds: [normalizedMailbox],
      folderTypes,
      sinceIso,
      limit: 0,
    });

    let totalFetched = messages.length;
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

  async function processQueue({
    mailboxEmail = '',
    mode = 'read_only',
    maxMessages = 25,
  } = {}) {
    const normalizedMailbox = normalizeEmail(mailboxEmail);
    const patientDirectory =
      typeof patientDirectoryProvider === 'function'
        ? asArray(await patientDirectoryProvider({ mailboxEmail: normalizedMailbox }))
        : [];

    let processed = 0;
    let failed = 0;
    const results = [];
    const completedIds = [];

    while (processed + failed < maxMessages) {
      const rawMessageId = ingestionStore.dequeueNextRawMessageId({
        mailboxEmail: normalizedMailbox,
      });
      if (!rawMessageId) break;

      const rawMessage = ingestionStore.getRawMessage(rawMessageId);
      const ledger = ingestionStore.getLedgerByRawMessageId(rawMessageId);
      if (!rawMessage || !ledger) {
        completedIds.push(rawMessageId);
        continue;
      }

      try {
        const result = await processRawMessage({
          store: ingestionStore,
          rawMessage,
          ledger,
          mode,
          patientDirectory,
          logger,
          persist: false,
        });
        results.push(result);
        if (result.skipped) {
          completedIds.push(rawMessageId);
        } else {
          processed += 1;
          completedIds.push(rawMessageId);
        }
      } catch (_error) {
        failed += 1;
        completedIds.push(rawMessageId);
      }
    }

    if (completedIds.length > 0) {
      await ingestionStore.completeQueuedMessages(completedIds, { persist: false });
    }
    await ingestionStore.save();

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
        });
      }

      const ingestResult = await ingestTruthMessages({
        mailboxEmail: normalizedMailbox,
        importRunId: importRun.id,
        mode,
        folderTypes,
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

  return {
    runDeltaSync,
    ingestTruthMessages,
    processQueue,
    runMailboxImport,
    runMailboxCycle,
  };
}

module.exports = {
  createCcoMailIngestionSyncService,
};
