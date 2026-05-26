const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { buildDedupeKeyFromTruthMessage } = require('./dedupe');
const {
  FILTER_VERSION,
  IMPORT_RUN_STATUSES,
  MATCH_VERSION,
  PROCESSOR_VERSION,
} = require('./constants');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function createEmptyState() {
  return {
    modelVersion: 'cco.mail.ingestion.v1',
    updatedAt: nowIso(),
    mailAccounts: {},
    mailFolders: {},
    mailImportRuns: {},
    importRunOrder: [],
    mailRawMessages: {},
    mailAttachments: {},
    mailProcessingLedger: {},
    mailPatientMatches: {},
    mailActions: {},
    mailSyncState: {},
    mailReprocessJobs: {},
    processingQueue: [],
    dedupeIndex: {},
    graphSubscriptions: {},
    auditEvents: [],
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function createCcoMailIngestionStore({ filePath } = {}) {
  const resolvedPath = normalizeText(filePath);
  if (!resolvedPath) {
    throw new Error('createCcoMailIngestionStore requires filePath.');
  }

  let state = createEmptyState();
  state = { ...createEmptyState(), ...(await readJson(resolvedPath, createEmptyState())) };
  state.updatedAt = nowIso();

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  function getAccountByEmail(email = '') {
    const normalized = normalizeEmail(email);
    return Object.values(state.mailAccounts).find((item) => normalizeEmail(item.email) === normalized) || null;
  }

  function ensureMailAccount({
    email = '',
    displayName = '',
    tenantId = '',
    userId = '',
    graphUserId = '',
    enabled = true,
  } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    const existing = getAccountByEmail(normalizedEmail);
    if (existing) {
      existing.displayName = normalizeText(displayName) || existing.displayName;
      existing.tenantId = normalizeText(tenantId) || existing.tenantId;
      existing.userId = normalizeText(userId) || existing.userId;
      existing.graphUserId = normalizeText(graphUserId) || existing.graphUserId;
      existing.enabled = enabled !== false;
      existing.updatedAt = nowIso();
      state.mailAccounts[existing.id] = existing;
      return existing;
    }
    const account = {
      id: crypto.randomUUID(),
      provider: 'microsoft_graph',
      email: normalizedEmail,
      displayName: normalizeText(displayName) || normalizedEmail,
      tenantId: normalizeText(tenantId),
      userId: normalizeText(userId) || normalizedEmail,
      graphUserId: normalizeText(graphUserId) || normalizedEmail,
      status: 'active',
      lastSyncAt: null,
      enabled: enabled !== false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.mailAccounts[account.id] = account;
    if (!state.mailSyncState[normalizedEmail]) {
      state.mailSyncState[normalizedEmail] = {
        mailboxEmail: normalizedEmail,
        paused: false,
        lastDeltaSyncAt: null,
        lastWebhookAt: null,
        lastError: null,
        lastImportRunId: null,
        processorVersion: PROCESSOR_VERSION,
        filterVersion: FILTER_VERSION,
        matchVersion: MATCH_VERSION,
      };
    }
    return account;
  }

  function upsertMailFolder({
    mailAccountId = '',
    graphFolderId = '',
    displayName = '',
    wellKnownName = '',
    deltaLink = '',
    enabled = true,
  } = {}) {
    const folderKey = `${normalizeText(mailAccountId)}:${normalizeText(graphFolderId) || normalizeText(wellKnownName)}`;
    const existing = Object.values(state.mailFolders).find(
      (item) =>
        item.mailAccountId === mailAccountId &&
        (normalizeText(item.graphFolderId) === normalizeText(graphFolderId) ||
          normalizeText(item.wellKnownName) === normalizeText(wellKnownName))
    );
    const folder = existing || {
      id: crypto.randomUUID(),
      mailAccountId,
      createdAt: nowIso(),
    };
    folder.graphFolderId = normalizeText(graphFolderId) || folder.graphFolderId || null;
    folder.displayName = normalizeText(displayName) || folder.displayName || wellKnownName;
    folder.wellKnownName = normalizeText(wellKnownName) || folder.wellKnownName || null;
    folder.deltaLink = normalizeText(deltaLink) || folder.deltaLink || null;
    folder.lastSyncedAt = folder.lastSyncedAt || null;
    folder.enabled = enabled !== false;
    folder.updatedAt = nowIso();
    state.mailFolders[folder.id] = folder;
    return folder;
  }

  async function startImportRun({
    mailAccountId = '',
    mode = 'delta_sync',
    createdBy = 'system',
  } = {}) {
    const run = {
      id: crypto.randomUUID(),
      mailAccountId,
      mode: normalizeText(mode) || 'delta_sync',
      status: 'running',
      startedAt: nowIso(),
      finishedAt: null,
      totalFetched: 0,
      totalSaved: 0,
      totalDuplicates: 0,
      totalProcessed: 0,
      totalFailed: 0,
      createdBy: normalizeText(createdBy) || 'system',
      error: null,
    };
    state.mailImportRuns[run.id] = run;
    state.importRunOrder.unshift(run.id);
    if (state.importRunOrder.length > 200) {
      state.importRunOrder = state.importRunOrder.slice(0, 200);
    }
    await save();
    return run;
  }

  async function finishImportRun(runId = '', patch = {}) {
    const run = asObject(state.mailImportRuns[normalizeText(runId)]);
    if (!run.id) return null;
    Object.assign(run, patch, {
      finishedAt: nowIso(),
      status: normalizeText(patch.status) || 'completed',
    });
    state.mailImportRuns[run.id] = run;
    const account = asObject(state.mailAccounts[run.mailAccountId]);
    if (account.id) {
      account.lastSyncAt = nowIso();
      account.updatedAt = nowIso();
      state.mailAccounts[account.id] = account;
    }
    await save();
    return run;
  }

  function getLedgerByRawMessageId(rawMessageId = '') {
    return (
      Object.values(state.mailProcessingLedger).find((item) => item.rawMessageId === rawMessageId) ||
      null
    );
  }

  function shouldSkipProcessing(ledger = {}) {
    const status = normalizeText(ledger.status);
    if (!status || status === 'FAILED') return false;
    if (status === 'REPROCESS_REQUESTED') return false;
    return (
      normalizeText(ledger.processorVersion) === PROCESSOR_VERSION &&
      normalizeText(ledger.filterVersion) === FILTER_VERSION &&
      normalizeText(ledger.matchVersion) === MATCH_VERSION &&
      ['COMPLETED', 'DUPLICATE_SKIPPED', 'ACTION_CREATED', 'MATCHED', 'UNMATCHED', 'NEEDS_REVIEW', 'SECURITY_REVIEW'].includes(
        status
      )
    );
  }

  async function saveRawMessageFromTruth({
    truthMessage = {},
    mailAccountId = '',
    importRunId = '',
    dryRun = false,
  } = {}) {
    const dedupeKey = buildDedupeKeyFromTruthMessage(truthMessage);
    const existingRawId = state.dedupeIndex[dedupeKey];
    if (existingRawId && state.mailRawMessages[existingRawId]) {
      const existingLedger = getLedgerByRawMessageId(existingRawId);
      if (
        existingLedger &&
        !shouldSkipProcessing(existingLedger) &&
        !state.processingQueue.includes(existingRawId)
      ) {
        state.processingQueue.push(existingRawId);
        await save();
      }
      return {
        rawMessage: state.mailRawMessages[existingRawId],
        duplicate: true,
        created: false,
        ledger: existingLedger,
      };
    }

    const from = asObject(truthMessage.from);
    const rawMessage = {
      id: crypto.randomUUID(),
      mailAccountId,
      folderId: normalizeText(truthMessage.folderId) || null,
      graphMessageId: normalizeText(truthMessage.graphMessageId) || null,
      immutableGraphId:
        normalizeText(truthMessage.immutableGraphId) ||
        normalizeText(truthMessage.graphMessageId) ||
        null,
      internetMessageId: normalizeText(truthMessage.internetMessageId) || null,
      conversationId:
        normalizeText(truthMessage.conversationId) ||
        normalizeText(truthMessage.mailboxConversationId) ||
        null,
      subject: normalizeText(truthMessage.subject) || '',
      fromEmail: normalizeEmail(from.address || truthMessage.fromEmail),
      fromName: normalizeText(from.name || truthMessage.fromName) || '',
      toEmails: asArray(truthMessage.toRecipients)
        .map((item) => normalizeEmail(item?.address || item?.email || item))
        .filter(Boolean),
      ccEmails: asArray(truthMessage.ccRecipients)
        .map((item) => normalizeEmail(item?.address || item?.email || item))
        .filter(Boolean),
      receivedDateTime:
        normalizeText(truthMessage.receivedAt || truthMessage.receivedDateTime) || null,
      sentDateTime: normalizeText(truthMessage.sentAt || truthMessage.sentDateTime) || null,
      hasAttachments: truthMessage.hasAttachments === true,
      bodyPreview: normalizeText(truthMessage.bodyPreview) || '',
      bodyText: normalizeText(truthMessage.bodyText) || normalizeText(truthMessage.bodyPreview),
      bodyHtmlStored: false,
      rawJson: cloneJson(truthMessage),
      importRunId,
      dedupeKey,
      mailboxId: normalizeEmail(truthMessage.mailboxId),
      folderType: normalizeText(truthMessage.folderType) || 'unknown',
      truthMessageKey: `${normalizeEmail(truthMessage.mailboxId)}:${normalizeText(truthMessage.graphMessageId)}`,
      createdAt: nowIso(),
    };

    if (dryRun) {
      return { rawMessage, duplicate: false, created: false, dryRun: true };
    }

    state.mailRawMessages[rawMessage.id] = rawMessage;
    state.dedupeIndex[dedupeKey] = rawMessage.id;

    const ledger = {
      id: crypto.randomUUID(),
      rawMessageId: rawMessage.id,
      dedupeKey,
      status: 'RAW_SAVED',
      processedAt: null,
      processorVersion: PROCESSOR_VERSION,
      filterVersion: FILTER_VERSION,
      matchVersion: MATCH_VERSION,
      patientMatchStatus: null,
      patientId: null,
      actionCreatedId: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      lockedAt: null,
      completedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.mailProcessingLedger[ledger.id] = ledger;

    if (!state.processingQueue.includes(rawMessage.id)) {
      state.processingQueue.push(rawMessage.id);
    }

    return { rawMessage, ledger, duplicate: false, created: true };
  }

  async function updateLedger(ledgerId = '', patch = {}, { persist = true } = {}) {
    const ledger = asObject(state.mailProcessingLedger[normalizeText(ledgerId)]);
    if (!ledger.id) return null;
    Object.assign(ledger, patch, { updatedAt: nowIso() });
    state.mailProcessingLedger[ledger.id] = ledger;
    if (persist) {
      await save();
    }
    return ledger;
  }

  async function appendAudit(event = {}, { persist = true } = {}) {
    state.auditEvents.unshift({
      id: crypto.randomUUID(),
      at: nowIso(),
      ...event,
    });
    if (state.auditEvents.length > 5000) {
      state.auditEvents = state.auditEvents.slice(0, 5000);
    }
    if (persist) {
      await save();
    }
  }

  async function resetMailboxLocalState({
    mailboxEmail = '',
    hardResetRaw = false,
    actorUserId = 'system',
  } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    const account = getAccountByEmail(normalized);
    const removedRawIds = new Set();

    for (const [rawId, rawMessage] of Object.entries(state.mailRawMessages)) {
      if (normalizeEmail(rawMessage.mailboxId) !== normalized && normalizeEmail(account?.email) !== normalized) {
        continue;
      }
      if (hardResetRaw) {
        removedRawIds.add(rawId);
        delete state.mailRawMessages[rawId];
        if (state.dedupeIndex[rawMessage.dedupeKey]) {
          delete state.dedupeIndex[rawMessage.dedupeKey];
        }
      }
    }

    state.processingQueue = state.processingQueue.filter((rawId) => !removedRawIds.has(rawId));

    for (const [ledgerId, ledger] of Object.entries(state.mailProcessingLedger)) {
      const raw = state.mailRawMessages[ledger.rawMessageId];
      if (!raw && !removedRawIds.has(ledger.rawMessageId)) continue;
      if (raw && normalizeEmail(raw.mailboxId) !== normalized) continue;
      if (hardResetRaw || removedRawIds.has(ledger.rawMessageId)) {
        delete state.mailProcessingLedger[ledgerId];
      }
    }

    for (const folder of Object.values(state.mailFolders)) {
      if (account && folder.mailAccountId === account.id) {
        folder.deltaLink = null;
        folder.lastSyncedAt = null;
        folder.updatedAt = nowIso();
      }
    }

    if (state.mailSyncState[normalized]) {
      state.mailSyncState[normalized] = {
        ...state.mailSyncState[normalized],
        lastDeltaSyncAt: null,
        lastWebhookAt: null,
        lastError: null,
        lastImportRunId: null,
        paused: false,
      };
    }

    await appendAudit({
      type: 'mail_ingestion_reset',
      mailboxEmail: normalized,
      hardResetRaw,
      actorUserId,
    });
    await save();
    return { mailboxEmail: normalized, hardResetRaw, removedRawCount: removedRawIds.size };
  }

  function buildDashboardSummary({ mailboxEmail = '' } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    const ledgers = Object.values(state.mailProcessingLedger);
    const rawMessages = Object.values(state.mailRawMessages).filter((item) => {
      if (!normalized) return true;
      return normalizeEmail(item.mailboxId) === normalized;
    });
    const filteredLedgers = ledgers.filter((ledger) => {
      const raw = state.mailRawMessages[ledger.rawMessageId];
      if (!raw) return false;
      if (!normalized) return true;
      return normalizeEmail(raw.mailboxId) === normalized;
    });

    const countByStatus = (status) =>
      filteredLedgers.filter((item) => normalizeText(item.status) === status).length;

    const processedCount = filteredLedgers.filter((ledger) => shouldSkipProcessing(ledger)).length;

    const account = normalized ? getAccountByEmail(normalized) : null;
    const syncState = normalized ? asObject(state.mailSyncState[normalized]) : null;
    const recentRuns = state.importRunOrder
      .map((runId) => state.mailImportRuns[runId])
      .filter(Boolean)
      .filter((run) => !account || run.mailAccountId === account.id)
      .slice(0, 20);

    return {
      generatedAt: nowIso(),
      mailboxEmail: normalized || null,
      account,
      syncState,
      queueLength: state.processingQueue.length,
      counts: {
        rawMessages: rawMessages.length,
        duplicates: countByStatus('DUPLICATE_SKIPPED'),
        processed: processedCount,
        failed: countByStatus('FAILED'),
        needsReview: countByStatus('NEEDS_REVIEW'),
        matched: countByStatus('MATCHED'),
        unmatched: countByStatus('UNMATCHED'),
        queued: state.processingQueue.length,
      },
      versions: {
        processorVersion: PROCESSOR_VERSION,
        filterVersion: FILTER_VERSION,
        matchVersion: MATCH_VERSION,
      },
      recentRuns,
      lastError: syncState?.lastError || null,
      graphSubscriptions: Object.values(state.graphSubscriptions),
    };
  }

  function listNeedsReview({ mailboxEmail = '', limit = 50 } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    return Object.values(state.mailProcessingLedger)
      .filter((ledger) => normalizeText(ledger.status) === 'NEEDS_REVIEW')
      .map((ledger) => {
        const raw = state.mailRawMessages[ledger.rawMessageId];
        const match = Object.values(state.mailPatientMatches).find(
          (item) => item.rawMessageId === ledger.rawMessageId
        );
        return { ledger, rawMessage: raw || null, patientMatch: match || null };
      })
      .filter((row) => {
        if (!normalized) return true;
        return normalizeEmail(row.rawMessage?.mailboxId) === normalized;
      })
      .slice(0, safeLimit);
  }

  function dequeueNextRawMessageId({ mailboxEmail = '' } = {}) {
    const normalized = normalizeEmail(mailboxEmail);
    for (const rawMessageId of state.processingQueue) {
      const raw = state.mailRawMessages[rawMessageId];
      if (!raw) continue;
      if (normalized && normalizeEmail(raw.mailboxId) !== normalized) continue;
      const ledger = Object.values(state.mailProcessingLedger).find(
        (item) => item.rawMessageId === rawMessageId
      );
      if (ledger && shouldSkipProcessing(ledger)) {
        continue;
      }
      return rawMessageId;
    }
    return null;
  }

  async function completeQueuedMessage(rawMessageId = '') {
    state.processingQueue = state.processingQueue.filter((item) => item !== rawMessageId);
    await save();
  }

  async function saveGraphSubscription(subscription = {}) {
    const id = normalizeText(subscription.id);
    if (!id) return null;
    state.graphSubscriptions[id] = {
      ...subscription,
      updatedAt: nowIso(),
    };
    await save();
    return state.graphSubscriptions[id];
  }

  async function savePatientMatch(record = {}, { persist = true } = {}) {
    const rawMessageId = normalizeText(record.rawMessageId);
    if (!rawMessageId) return null;
    const id = normalizeText(record.id) || `${rawMessageId}:match`;
    state.mailPatientMatches[id] = {
      ...record,
      id,
      updatedAt: nowIso(),
    };
    if (persist) {
      await save();
    }
    return state.mailPatientMatches[id];
  }

  async function completeQueuedMessages(rawMessageIds = [], { persist = true } = {}) {
    const remove = new Set(asArray(rawMessageIds).filter(Boolean));
    if (remove.size === 0) return;
    state.processingQueue = state.processingQueue.filter((item) => !remove.has(item));
    if (persist) {
      await save();
    }
  }

  return {
    filePath: resolvedPath,
    save,
    ensureMailAccount,
    upsertMailFolder,
    startImportRun,
    finishImportRun,
    saveRawMessageFromTruth,
    updateLedger,
    getLedgerByRawMessageId,
    shouldSkipProcessing,
    appendAudit,
    resetMailboxLocalState,
    buildDashboardSummary,
    listNeedsReview,
    dequeueNextRawMessageId,
    completeQueuedMessage,
    completeQueuedMessages,
    saveGraphSubscription,
    getAccountByEmail,
    savePatientMatch,
    getState: () => cloneJson(state),
  };
}

module.exports = {
  createCcoMailIngestionStore,
  PROCESSOR_VERSION,
  FILTER_VERSION,
  MATCH_VERSION,
};
