function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMailboxIds(values = []) {
  return Array.from(
    new Set(
      asArray(values)
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeFolderTypes(values = []) {
  return Array.from(
    new Set(
      asArray(values)
        .map((item) => normalizeText(item).toLowerCase())
        .filter((item) => ['inbox', 'sent', 'drafts', 'deleted'].includes(item))
    )
  );
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function toDeltaStatusLabel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'delta_armed') return 'DELTA ARMED';
  if (normalized === 'verified_empty') return 'VERIFIED EMPTY';
  if (normalized === 'running') return 'RUNNING';
  if (normalized === 'resync_required') return 'RESYNC REQUIRED';
  if (normalized === 'error') return 'ERROR';
  if (normalized === 'not_ready') return 'NOT READY';
  return 'NOT STARTED';
}

function toAccountStatus(statusByFolderType = {}) {
  const values = Object.values(statusByFolderType || {});
  if (
    values.length > 0 &&
    values.every((item) => item === 'DELTA ARMED' || item === 'VERIFIED EMPTY')
  ) {
    return 'DELTA ARMED';
  }
  if (values.includes('ERROR')) return 'ERROR';
  if (values.includes('RESYNC REQUIRED')) return 'RESYNC REQUIRED';
  if (values.includes('RUNNING')) return 'RUNNING';
  if (values.includes('NOT READY')) return 'NOT READY';
  return 'NOT STARTED';
}

function classifyDeltaError(error = {}) {
  const code = normalizeText(error?.code).toUpperCase();
  if (code === 'GRAPH_DELTA_TOKEN_INVALID') {
    return {
      errorCode: 'delta_token_invalid',
      errorMessage:
        normalizeText(error?.message) ||
        'Graph delta-token ar inte langre giltig och foldern maste resyncas.',
      resyncRequired: true,
    };
  }
  return {
    errorCode: normalizeText(error?.code) || 'delta_sync_error',
    errorMessage: normalizeText(error?.message) || 'delta_request_failed',
    resyncRequired: false,
  };
}

function toFolderMetadata(folderState = {}) {
  const safeFolderState =
    folderState && typeof folderState === 'object' && !Array.isArray(folderState)
      ? folderState
      : {};
  return {
    folderId: normalizeText(safeFolderState.folderId) || null,
    folderName: normalizeText(safeFolderState.folderName) || null,
    wellKnownName: normalizeText(safeFolderState.wellKnownName) || null,
    totalItemCount: Number(safeFolderState.totalItemCount || 0),
    unreadItemCount: Number(safeFolderState.unreadItemCount || 0),
    messageCollectionCount: Number(safeFolderState.messageCollectionCount),
  };
}

function toFolderReportFromCheckpoint(folderType = '', checkpoint = {}, fallback = {}) {
  const safeCheckpoint =
    checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint) ? checkpoint : {};
  const syncStatus = normalizeText(safeCheckpoint.syncStatus);
  const derivedReasonCode =
    normalizeText(safeCheckpoint.lastErrorCode) ||
    normalizeText(fallback.reasonCode) ||
    (syncStatus === 'delta_armed'
      ? 'delta_link_persisted'
      : syncStatus === 'running'
        ? 'delta_round_in_progress'
        : syncStatus === 'resync_required'
          ? 'resync_required'
          : 'delta_not_started');
  const derivedDetail =
    normalizeText(safeCheckpoint.lastErrorMessage) ||
    normalizeText(fallback.detail) ||
    (syncStatus === 'delta_armed'
      ? 'Foldern har ett sparat deltaLink och ar armed for inkrementell sync.'
      : syncStatus === 'running'
        ? 'Foldern har en paagande delta-runda med persisted nextLink.'
        : syncStatus === 'resync_required'
          ? 'Foldern kravde ny backfill eller ny initial delta-runda efter ogiltigt sync-token.'
          : '');
  return {
    folderType,
    status: toDeltaStatusLabel(syncStatus),
    reasonCode: derivedReasonCode,
    detail: derivedDetail,
    pagesFetched: Number(safeCheckpoint.pagesFetched || 0),
    changesApplied: Number(safeCheckpoint.changesApplied || 0),
    upsertsApplied: Number(safeCheckpoint.upsertsApplied || 0),
    deletesApplied: Number(safeCheckpoint.deletesApplied || 0),
    deltaLinkPresent: Boolean(normalizeText(safeCheckpoint.deltaLink)),
    nextPageUrlPresent: Boolean(normalizeText(safeCheckpoint.nextPageUrl)),
    roundType: normalizeText(safeCheckpoint.roundType) || null,
  };
}

function createMicrosoftGraphMailboxTruthDelta({
  connectorFactory,
  store,
  now = () => Date.now(),
} = {}) {
  if (typeof connectorFactory !== 'function') {
    throw new Error('microsoftGraphMailboxTruthDelta connectorFactory saknas.');
  }
  if (
    !store ||
    typeof store.startDeltaRun !== 'function' ||
    typeof store.recordDeltaPage !== 'function' ||
    typeof store.recordDeltaError !== 'function' ||
    typeof store.getFolderState !== 'function' ||
    typeof store.getSyncCheckpoint !== 'function'
  ) {
    throw new Error('microsoftGraphMailboxTruthDelta kräver ett giltigt mailbox truth store.');
  }

  async function runDeltaSync(options = {}) {
    const mailboxIds = normalizeMailboxIds(options.mailboxIds);
    const folderTypes = normalizeFolderTypes(
      options.folderTypes || ['inbox', 'sent', 'drafts', 'deleted']
    );
    if (mailboxIds.length === 0) {
      throw new Error('microsoftGraphMailboxTruthDelta kräver minst ett mailboxId.');
    }

    const pageSize = clampInt(options.pageSize, 1, 500, 200);
    const maxPagesPerFolder = clampInt(options.maxPagesPerFolder, 1, 10000, 1000);
    const mailboxTimeoutMs = clampInt(options.mailboxTimeoutMs, 1000, 15000, 15000);
    const requestMaxRetries = clampInt(options.requestMaxRetries, 0, 6, 2);
    const retryBaseDelayMs = clampInt(options.retryBaseDelayMs, 100, 10000, 500);
    const retryMaxDelayMs = clampInt(options.retryMaxDelayMs, 200, 30000, 5000);
    const resume = options.resume !== false;

    const run = await store.startDeltaRun({
      mailboxIds,
      folderTypes,
      mode: 'mailbox_truth_delta',
    });

    const perMailbox = [];

    try {
      for (const mailboxId of mailboxIds) {
        const connector = connectorFactory(mailboxId);
        const mailboxStatus = {
          mailboxId,
          startedAt: nowIso(),
          folderReports: [],
          affectedConversationIds: [],
        };
        const statusByFolderType = {};

        for (const folderType of folderTypes) {
          const folderState = store.getFolderState(mailboxId, folderType);
          if (normalizeText(folderState?.completenessStatus) !== 'VERIFIED') {
          const report = toFolderReportFromCheckpoint(folderType, null, {
            reasonCode: 'folder_truth_not_verified',
            detail:
                'Foldern ar inte verifierad i mailbox truth-basen och ar inte redo for delta-sync.',
            });
            report.status = 'NOT READY';
            mailboxStatus.folderReports.push(report);
            statusByFolderType[folderType] = report.status;
            continue;
          }

          const checkpoint = resume ? store.getSyncCheckpoint(mailboxId, folderType) : null;
          if (
            normalizeText(folderState?.completenessReason) === 'empty_verified' &&
            (!checkpoint || Object.keys(checkpoint).length === 0)
          ) {
            const report = {
              folderType,
              status: 'VERIFIED EMPTY',
              reasonCode: 'empty_verified',
              detail:
                normalizeText(folderState?.completenessDetail) ||
                'Foldern ar tom och korrekt verifierad som tom.',
              pagesFetched: 0,
              changesApplied: 0,
              upsertsApplied: 0,
              deletesApplied: 0,
              deltaLinkPresent: false,
              nextPageUrlPresent: false,
              roundType: null,
            };
            mailboxStatus.folderReports.push(report);
            statusByFolderType[folderType] = report.status;
            continue;
          }
          if (normalizeText(checkpoint?.syncStatus) === 'resync_required') {
            const report = toFolderReportFromCheckpoint(folderType, checkpoint, {
              reasonCode: 'resync_required',
            });
            mailboxStatus.folderReports.push(report);
            statusByFolderType[folderType] = report.status;
            continue;
          }

          let cursorUrl = resume
            ? normalizeText(checkpoint?.nextPageUrl || checkpoint?.deltaLink)
            : '';
          let roundType = normalizeText(checkpoint?.nextPageUrl)
            ? normalizeText(checkpoint?.roundType) || 'initial_delta_round'
            : normalizeText(checkpoint?.deltaLink)
              ? 'incremental_delta_round'
              : 'initial_delta_round';
          let pagesFetched = 0;
          let lastCheckpoint = checkpoint || null;
          let refreshFolderMetadata = !normalizeText(checkpoint?.nextPageUrl);
          let folderMetadata = toFolderMetadata(folderState);

          try {
            while (pagesFetched < maxPagesPerFolder) {
              const payload = await connector.fetchMailboxTruthFolderDeltaPage({
                userId: mailboxId,
                mailboxId,
                mailboxAddress: mailboxId,
                userPrincipalName: mailboxId,
                folderType,
                cursorUrl,
                folderMetadata,
                refreshFolderMetadata,
                pageSize,
                mailboxTimeoutMs,
                requestMaxRetries,
                retryBaseDelayMs,
                retryMaxDelayMs,
              });
              pagesFetched += 1;
              folderMetadata = payload.folder;
              const persisted = await store.recordDeltaPage({
                runId: run.runId,
                account: payload.account,
                folder: payload.folder,
                changes: payload.changes,
                nextPageUrl: payload?.page?.nextPageUrl,
                deltaLink: payload?.page?.deltaLink,
                sourcePageUrl: payload?.page?.sourcePageUrl,
                pageSize,
                complete: payload?.page?.complete === true,
                roundType,
              });
              lastCheckpoint = persisted?.checkpoint || null;
              const pageConversationIds = Array.isArray(persisted?.affectedConversationIds)
                ? persisted.affectedConversationIds
                : [];
              for (const conversationId of pageConversationIds) {
                if (conversationId) mailboxStatus.affectedConversationIds.push(conversationId);
              }
              cursorUrl = normalizeText(payload?.page?.nextPageUrl);
              refreshFolderMetadata = false;
              if (payload?.page?.complete === true || !cursorUrl) break;
            }
          } catch (error) {
            const classifiedError = classifyDeltaError(error);
            lastCheckpoint = await store.recordDeltaError({
              runId: run.runId,
              account: {
                mailboxId,
                mailboxAddress: mailboxId,
                userPrincipalName: mailboxId,
              },
              folderType,
              errorCode: classifiedError.errorCode,
              errorMessage: classifiedError.errorMessage,
              resyncRequired: classifiedError.resyncRequired,
            });
          }

          const report = toFolderReportFromCheckpoint(folderType, lastCheckpoint);
          report.pagesFetched = pagesFetched || report.pagesFetched;
          mailboxStatus.folderReports.push(report);
          statusByFolderType[folderType] = report.status;
        }

        mailboxStatus.completedAt = nowIso();
        mailboxStatus.accountStatus = toAccountStatus(statusByFolderType);
        mailboxStatus.affectedConversationIds = Array.from(
          new Set(asArray(mailboxStatus.affectedConversationIds).filter(Boolean))
        );
        perMailbox.push(mailboxStatus);
      }

      await store.finishDeltaRun(run.runId, { status: 'completed' });
    } catch (error) {
      await store.finishDeltaRun(run.runId, {
        status: 'failed',
        error: normalizeText(error?.message) || 'unknown_delta_error',
      });
      throw error;
    }

    return {
      runId: run.runId,
      startedAt: run.startedAt,
      completedAt: nowIso(),
      mailboxIds,
      folderTypes,
      pageSize,
      maxPagesPerFolder,
      perMailbox,
      affectedConversationIds: Array.from(
        new Set(
          perMailbox.flatMap((mailbox) => asArray(mailbox?.affectedConversationIds)).filter(Boolean)
        )
      ),
      elapsedMs: Math.max(0, Number(now()) - Date.parse(run.startedAt)),
      sync: store.getDeltaSyncReport({ mailboxIds }),
      completeness: store.getCompletenessReport({ mailboxIds }),
    };
  }

  return {
    runDeltaSync,
  };
}

module.exports = {
  createMicrosoftGraphMailboxTruthDelta,
};
