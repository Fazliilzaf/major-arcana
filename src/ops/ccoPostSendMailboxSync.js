'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : '';
}

function createPostSendMailboxSync({
  graphReadConnector = null,
  ccoMailboxTruthStore = null,
  runtimeStreamRouter = null,
  lookbackDays = 3,
  logger = console,
  runGraphBackfill = null,
} = {}) {
  const syncLookbackDays = Math.max(1, Math.min(14, Number(lookbackDays) || 3));
  const runBackfill =
    typeof runGraphBackfill === 'function'
      ? runGraphBackfill
      : async (args) => {
          const bootstrapRunner = require('./bootstrapRunner');
          return bootstrapRunner.runGraphBackfill(args);
        };

  return function schedulePostSendMailboxSync({
    mailboxId = '',
    source = 'post_send',
    conversationKey = '',
    draftId = '',
  } = {}) {
    const normalizedMailboxId = normalizeEmail(mailboxId);
    if (!normalizedMailboxId) {
      return { scheduled: false, reason: 'mailbox_missing' };
    }
    if (!graphReadConnector || !ccoMailboxTruthStore) {
      return { scheduled: false, reason: 'graph_read_unavailable', mailboxId: normalizedMailboxId };
    }

    setImmediate(async () => {
      try {
        const result = await runBackfill({
          graphReadConnector,
          ccoMailboxTruthStore,
          mailboxIds: [normalizedMailboxId],
          lookbackDays: syncLookbackDays,
          logger,
        });
        if (runtimeStreamRouter && typeof runtimeStreamRouter.broadcast === 'function') {
          runtimeStreamRouter.broadcast('worklist_updated', {
            source: 'post_send_mailbox_sync',
            trigger: normalizeText(source) || 'post_send',
            mailboxIds: [normalizedMailboxId],
            conversationKey: normalizeText(conversationKey) || null,
            draftId: normalizeText(draftId) || null,
            folderCount: Number(result?.folderCount || 0),
            completedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger?.warn?.('[cco-post-send-sync] mailbox sync failed', error?.message || error);
        if (runtimeStreamRouter && typeof runtimeStreamRouter.broadcast === 'function') {
          runtimeStreamRouter.broadcast('worklist_sync_failed', {
            source: 'post_send_mailbox_sync',
            mailboxIds: [normalizedMailboxId],
            error: String(error?.message || error),
            completedAt: new Date().toISOString(),
          });
        }
      }
    });

    return { scheduled: true, mailboxId: normalizedMailboxId, lookbackDays: syncLookbackDays };
  };
}

module.exports = {
  createPostSendMailboxSync,
  normalizeEmail,
};
