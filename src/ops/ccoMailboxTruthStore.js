const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  buildMailboxTruthConversations,
  toMailboxConversationId,
} = require('../infra/microsoftGraphMailboxTruth');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function normalizeIdentityCarrier(value = {}) {
  const safeValue = asObject(value);
  const customerIdentity = asObject(safeValue.customerIdentity || safeValue.identity);
  const hardConflictSignals = asArray(safeValue.hardConflictSignals).filter(
    (item) => item !== null && item !== undefined
  );
  const mergeReviewDecisionsByPairId = asObject(safeValue.mergeReviewDecisionsByPairId);
  const identityProvenance = asObject(safeValue.identityProvenance || safeValue.provenance);

  return {
    customerIdentity: Object.keys(customerIdentity).length ? cloneJson(customerIdentity) : null,
    hardConflictSignals: hardConflictSignals.length ? cloneJson(hardConflictSignals) : [],
    mergeReviewDecisionsByPairId: Object.keys(mergeReviewDecisionsByPairId).length
      ? cloneJson(mergeReviewDecisionsByPairId)
      : {},
    identityProvenance: Object.keys(identityProvenance).length ? cloneJson(identityProvenance) : null,
  };
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeFolderType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['inbox', 'sent', 'drafts', 'deleted'].includes(normalized)) return normalized;
  return 'unknown';
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

function isJsonSyntaxError(error) {
  return error instanceof SyntaxError || String(error?.name || '') === 'SyntaxError';
}

async function nextCorruptBackupPath(filePath) {
  const basePath = `${filePath}.corrupt.bak`;
  try {
    await fs.access(basePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return basePath;
    throw error;
  }
  return `${filePath}.${Date.now()}.corrupt.bak`;
}

async function recoverCorruptJsonFile(filePath, fallbackValue, scopeLabel = 'json_store') {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const backupPath = await nextCorruptBackupPath(filePath);
  await fs.rename(filePath, backupPath);
  await writeJsonAtomic(filePath, fallbackValue);
  console.warn(
    `[${scopeLabel}] korrupt JSON upptäcktes och återställdes automatiskt`,
    JSON.stringify({ filePath, backupPath })
  );
  return cloneJson(fallbackValue);
}

async function readJsonWithRecovery(filePath, fallbackValue, scopeLabel = 'json_store') {
  try {
    return await readJson(filePath, fallbackValue);
  } catch (error) {
    if (!isJsonSyntaxError(error)) throw error;
    return recoverCorruptJsonFile(filePath, fallbackValue, scopeLabel);
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  // Keep this store compact: the mailbox truth file can grow very large, and
  // pretty-printing the full state pushes JSON serialization close to V8's
  // string-size limits during backfill refreshes.
  await fs.writeFile(tmpPath, `${JSON.stringify(data)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createEmptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    accounts: {},
    folders: {},
    messages: {},
    conversations: {},
    syncCheckpoints: {},
    syncRuns: [],
  };
}

function toFolderKey(mailboxId = '', folderType = '') {
  const safeMailboxId = normalizeMailboxId(mailboxId);
  const safeFolderType = normalizeFolderType(folderType);
  if (!safeMailboxId || safeFolderType === 'unknown') return '';
  return `${safeMailboxId}:${safeFolderType}`;
}

function toMessageKey(mailboxId = '', graphMessageId = '') {
  const safeMailboxId = normalizeMailboxId(mailboxId);
  const safeGraphMessageId = normalizeText(graphMessageId);
  if (!safeMailboxId || !safeGraphMessageId) return '';
  return `${safeMailboxId}:${safeGraphMessageId}`;
}

function toSyncCheckpointKey(mailboxId = '', folderType = '') {
  return toFolderKey(mailboxId, folderType);
}

function serializeComparableMessage(message = {}) {
  const safeMessage = asObject(message);
  const { persistedAt, ...rest } = safeMessage;
  return JSON.stringify(rest);
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

function deriveFolderCompleteness(folder = {}) {
  const safeFolder = asObject(folder);
  const fetchStatus = normalizeText(safeFolder.fetchStatus) || 'success';
  const totalItemCount = toNumber(safeFolder.totalItemCount, 0);
  const messageCollectionCount = toNumber(safeFolder.messageCollectionCount, NaN);
  const materializedMessageCount = toNumber(safeFolder.materializedMessageCount, 0);
  const nextPageUrl = normalizeText(safeFolder.nextPageUrl);
  const expectedItemCount = Number.isFinite(messageCollectionCount)
    ? messageCollectionCount
    : totalItemCount;

  if (fetchStatus === 'error') {
    return {
      status: 'BROKEN',
      reasonCode: normalizeText(safeFolder.errorCode) || 'fetch_error',
      detail:
        normalizeText(safeFolder.errorMessage) ||
        'Foldern kunde inte backfillas fran Microsoft Graph.',
    };
  }
  if (nextPageUrl) {
    return {
      status: 'PARTIAL',
      reasonCode: 'backfill_incomplete',
      detail: `Foldern ar delvis materialiserad (${materializedMessageCount}/${expectedItemCount}) och har fortsatt backfill-cursor.`,
    };
  }
  if (expectedItemCount === 0 && materializedMessageCount === 0) {
    return {
      status: 'VERIFIED',
      reasonCode: 'empty_verified',
      detail: 'Foldern ar tom och korrekt verifierad som tom.',
    };
  }
  if (materializedMessageCount >= expectedItemCount && expectedItemCount >= 0) {
    if (
      Number.isFinite(messageCollectionCount) &&
      Number.isFinite(totalItemCount) &&
      messageCollectionCount !== totalItemCount
    ) {
      return {
        status: 'VERIFIED',
        reasonCode: 'verified_message_collection_count',
        detail: `Foldern ar komplett materialiserad mot Graph messages collection (${materializedMessageCount}/${messageCollectionCount}) trots folder total ${totalItemCount}.`,
      };
    }
    return {
      status: 'VERIFIED',
      reasonCode: 'verified',
      detail: `Foldern ar komplett materialiserad (${materializedMessageCount}/${expectedItemCount}).`,
    };
  }
  return {
    status: 'PARTIAL',
    reasonCode: 'count_mismatch',
    detail: `Foldern ar materialiserad till ${materializedMessageCount}/${expectedItemCount} utan fortsatt cursor.`,
  };
}

function toMessageSortIso(message = {}) {
  return (
    normalizeText(message.lastModifiedAt) ||
    normalizeText(message.receivedAt) ||
    normalizeText(message.sentAt) ||
    normalizeText(message.createdAt) ||
    ''
  );
}

function hydrateStoredMessage(message = {}, fallbackMailboxId = '') {
  const safeMessage = asObject(message);
  const mailboxId =
    normalizeMailboxId(safeMessage.mailboxId || fallbackMailboxId) || null;
  const graphMessageId = normalizeText(safeMessage.graphMessageId) || null;
  if (!mailboxId || !graphMessageId) return null;
  const conversationId = normalizeText(safeMessage.conversationId) || null;
  const internetMessageId = normalizeText(safeMessage.internetMessageId) || null;
  const mailboxConversationId =
    normalizeText(safeMessage.mailboxConversationId) ||
    toMailboxConversationId({
      mailboxId,
      conversationId,
      internetMessageId,
      graphMessageId,
    });

  // SLIMMA — body-fält tas aldrig in i truth-store (lagras separat eller fetchas
  // on-demand). Detta håller filen liten så vi inte får OOM vid JSON.parse.
  // bodyPreview cap:as till 500 tecken (räcker för worklist-preview).
  const {
    body, bodyHtml, uniqueBody, body_text, body_html, mailDocument,
    ...rest
  } = safeMessage;
  if (rest.bodyPreview && typeof rest.bodyPreview === 'string' && rest.bodyPreview.length > 500) {
    rest.bodyPreview = rest.bodyPreview.slice(0, 500);
  }

  return {
    ...rest,
    mailboxId,
    mailboxConversationId,
  };
}

function mergeConversationIdentityCarrier(messages = [], existingConversation = {}) {
  const firstCarrier = asArray(messages).find((message) => {
    const carrier = normalizeIdentityCarrier(message);
    return (
      Boolean(carrier.customerIdentity) ||
      carrier.hardConflictSignals.length > 0 ||
      Object.keys(carrier.mergeReviewDecisionsByPairId || {}).length > 0 ||
      Boolean(carrier.identityProvenance)
    );
  });
  const carried = normalizeIdentityCarrier(firstCarrier || existingConversation);
  return {
    ...existingConversation,
    ...carried,
  };
}

async function createCcoMailboxTruthStore({
  filePath = '',
  maxSyncRuns = 200,
} = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('ccoMailboxTruthStore filePath saknas.');
  const keepRuns = Math.max(10, Math.min(2000, Number(maxSyncRuns) || 200));
  const state = await readJsonWithRecovery(
    resolvedPath,
    createEmptyState(),
    'cco_mailbox_truth_store'
  );
  if (!state.version) state.version = 1;
  if (!state.createdAt) state.createdAt = nowIso();
  if (!state.accounts || typeof state.accounts !== 'object' || Array.isArray(state.accounts)) {
    state.accounts = {};
  }
  if (!state.folders || typeof state.folders !== 'object' || Array.isArray(state.folders)) {
    state.folders = {};
  }
  if (!state.messages || typeof state.messages !== 'object' || Array.isArray(state.messages)) {
    state.messages = {};
  }
  if (!state.conversations || typeof state.conversations !== 'object' || Array.isArray(state.conversations)) {
    state.conversations = {};
  }
  if (!state.syncCheckpoints || typeof state.syncCheckpoints !== 'object' || Array.isArray(state.syncCheckpoints)) {
    state.syncCheckpoints = {};
  }
  if (!Array.isArray(state.syncRuns)) state.syncRuns = [];

  let initialStateMutated = false;
  const mailboxIdsToRebuild = new Set();
  const shouldRebuildAllConversations =
    Object.keys(state.conversations).length === 0 && Object.keys(state.messages).length > 0;

  for (const [messageKey, rawMessage] of Object.entries(state.messages)) {
    const hydratedMessage = hydrateStoredMessage(rawMessage);
    if (!hydratedMessage) {
      delete state.messages[messageKey];
      initialStateMutated = true;
      continue;
    }
    if (
      normalizeText(rawMessage?.mailboxConversationId) !== hydratedMessage.mailboxConversationId ||
      normalizeMailboxId(rawMessage?.mailboxId) !== hydratedMessage.mailboxId
    ) {
      state.messages[messageKey] = hydratedMessage;
      initialStateMutated = true;
    }
    if (shouldRebuildAllConversations || !Object.keys(state.conversations).length) {
      mailboxIdsToRebuild.add(hydratedMessage.mailboxId);
    }
  }

  for (const [folderKey, rawFolder] of Object.entries(state.folders)) {
    const safeFolder = asObject(rawFolder);
    const completeness = deriveFolderCompleteness(safeFolder);
    if (
      normalizeText(safeFolder.completenessStatus) !== completeness.status ||
      normalizeText(safeFolder.completenessReason) !== completeness.reasonCode ||
      normalizeText(safeFolder.completenessDetail) !== completeness.detail
    ) {
      state.folders[folderKey] = {
        ...safeFolder,
        completenessStatus: completeness.status,
        completenessReason: completeness.reasonCode,
        completenessDetail: completeness.detail,
      };
      initialStateMutated = true;
    }
  }

  async function save() {
    state.updatedAt = nowIso();
    if (state.syncRuns.length > keepRuns) {
      state.syncRuns = state.syncRuns.slice(state.syncRuns.length - keepRuns);
    }
    await writeJsonAtomic(resolvedPath, state);
  }

  function ensureAccount(account = {}) {
    const safeAccount = asObject(account);
    const mailboxId = normalizeMailboxId(safeAccount.mailboxId || safeAccount.mailboxAddress);
    if (!mailboxId) throw new Error('Mailbox truth account saknar mailboxId.');
    const existing = asObject(state.accounts[mailboxId]);
    const next = {
      mailboxId,
      graphUserId: normalizeText(safeAccount.graphUserId) || existing.graphUserId || null,
      mailboxAddress:
        normalizeText(safeAccount.mailboxAddress).toLowerCase() ||
        existing.mailboxAddress ||
        mailboxId,
      userPrincipalName:
        normalizeText(safeAccount.userPrincipalName).toLowerCase() ||
        existing.userPrincipalName ||
        mailboxId,
      createdAt: existing.createdAt || nowIso(),
      updatedAt: nowIso(),
      lastBackfillRunId: existing.lastBackfillRunId || null,
      lastBackfillCompletedAt: existing.lastBackfillCompletedAt || null,
    };
    state.accounts[mailboxId] = next;
    return next;
  }

  function rebuildMailboxConversations(mailboxId = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    const mailboxMessages = Object.values(state.messages).filter(
      (message) => normalizeMailboxId(message.mailboxId) === safeMailboxId
    );
    for (const key of Object.keys(state.conversations)) {
      if (normalizeMailboxId(state.conversations[key]?.mailboxId) === safeMailboxId) {
        delete state.conversations[key];
      }
    }
    const rebuilt = buildMailboxTruthConversations(mailboxMessages);
    for (const conversation of rebuilt) {
      state.conversations[conversation.mailboxConversationId] = {
        ...mergeConversationIdentityCarrier(
          mailboxMessages.filter(
            (message) => normalizeText(message.mailboxConversationId) === conversation.mailboxConversationId
          ),
          conversation
        ),
      };
    }
  }

  function recomputeFolderMessageCount(mailboxId = '', folderType = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    const safeFolderType = normalizeFolderType(folderType);
    return Object.values(state.messages).filter(
      (message) =>
        normalizeMailboxId(message.mailboxId) === safeMailboxId &&
        normalizeFolderType(message.folderType) === safeFolderType
    ).length;
  }

  if (mailboxIdsToRebuild.size > 0) {
    for (const mailboxId of mailboxIdsToRebuild) {
      rebuildMailboxConversations(mailboxId);
    }
    initialStateMutated = true;
  }

  async function resetFolder(mailboxId = '', folderType = '') {
    const folderKey = toFolderKey(mailboxId, folderType);
    if (folderKey) delete state.folders[folderKey];
    const safeMailboxId = normalizeMailboxId(mailboxId);
    const safeFolderType = normalizeFolderType(folderType);
    for (const messageKey of Object.keys(state.messages)) {
      const message = state.messages[messageKey];
      if (
        normalizeMailboxId(message.mailboxId) === safeMailboxId &&
        normalizeFolderType(message.folderType) === safeFolderType
      ) {
        delete state.messages[messageKey];
      }
    }
    rebuildMailboxConversations(safeMailboxId);
    await save();
  }

  async function startSyncRun({
    mailboxIds = [],
    folderTypes = [],
    mode = 'folder_backfill',
  } = {}) {
    const run = {
      runId: crypto.randomUUID(),
      mode: normalizeText(mode) || 'folder_backfill',
      mailboxIds: asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean),
      folderTypes: asArray(folderTypes).map((item) => normalizeFolderType(item)).filter((item) => item !== 'unknown'),
      startedAt: nowIso(),
      completedAt: null,
      status: 'running',
      error: null,
    };
    state.syncRuns.push(run);
    await save();
    return run;
  }

  async function startBackfillRun(options = {}) {
    return startSyncRun({
      ...options,
      mode: normalizeText(options.mode) || 'folder_backfill',
    });
  }

  async function startDeltaRun(options = {}) {
    return startSyncRun({
      ...options,
      mode: normalizeText(options.mode) || 'mailbox_truth_delta',
    });
  }

  async function recordFolderPage({
    runId = '',
    account = {},
    folder = {},
    messages = [],
    nextPageUrl = null,
    sourcePageUrl = '',
    pageSize = 0,
    complete = false,
  } = {}) {
    const safeAccount = ensureAccount(account);
    const safeFolder = asObject(folder);
    const folderType = normalizeFolderType(safeFolder.folderType);
    const folderKey = toFolderKey(safeAccount.mailboxId, folderType);
    if (!folderKey) {
      throw new Error('Mailbox truth folder page saknar giltig mailboxId/folderType.');
    }

    for (const rawMessage of asArray(messages)) {
      const safeMessage = asObject(rawMessage);
      const messageKey = toMessageKey(safeAccount.mailboxId, safeMessage.graphMessageId);
      if (!messageKey) continue;
      state.messages[messageKey] = hydrateStoredMessage(
        {
          ...safeMessage,
          mailboxConversationId:
            normalizeText(safeMessage.mailboxConversationId) ||
            toMailboxConversationId({
              mailboxId: safeAccount.mailboxId,
              conversationId: safeMessage.conversationId,
              internetMessageId: safeMessage.internetMessageId,
              graphMessageId: safeMessage.graphMessageId,
            }),
        },
        safeAccount.mailboxId
      ) || {
        ...safeMessage,
        mailboxId: safeAccount.mailboxId,
        mailboxAddress: safeAccount.mailboxAddress,
        userPrincipalName: safeAccount.userPrincipalName,
        graphUserId: safeAccount.graphUserId,
        folderType,
        persistedAt: nowIso(),
      };
    }

    const materializedMessageCount = recomputeFolderMessageCount(safeAccount.mailboxId, folderType);
    const next = {
      mailboxId: safeAccount.mailboxId,
      graphUserId: safeAccount.graphUserId,
      folderId: normalizeText(safeFolder.folderId) || null,
      folderName: normalizeText(safeFolder.folderName) || null,
      folderType,
      wellKnownName: normalizeText(safeFolder.wellKnownName) || null,
      fetchStatus: 'success',
      totalItemCount: toNumber(safeFolder.totalItemCount, 0),
      unreadItemCount: toNumber(safeFolder.unreadItemCount, 0),
      messageCollectionCount: toNumber(safeFolder.messageCollectionCount, NaN),
      materializedMessageCount,
      nextPageUrl: normalizeText(nextPageUrl) || null,
      syncState: complete ? 'complete' : 'backfilling',
      lastBackfillRunId: normalizeText(runId) || null,
      lastBackfillStartedAt:
        state.folders[folderKey]?.lastBackfillStartedAt || nowIso(),
      lastBackfillUpdatedAt: nowIso(),
      lastBackfillCompletedAt: complete ? nowIso() : null,
      pagesFetched: toNumber(state.folders[folderKey]?.pagesFetched, 0) + 1,
      pageSize: toNumber(pageSize, 0),
      lastSourcePageUrl: normalizeText(sourcePageUrl) || null,
      errorCode: null,
      errorMessage: null,
    };
    const completeness = deriveFolderCompleteness(next);
    next.completenessStatus = completeness.status;
    next.completenessReason = completeness.reasonCode;
    next.completenessDetail = completeness.detail;
    state.folders[folderKey] = next;

    state.accounts[safeAccount.mailboxId] = {
      ...safeAccount,
      lastBackfillRunId: normalizeText(runId) || safeAccount.lastBackfillRunId || null,
      lastBackfillCompletedAt: complete ? nowIso() : safeAccount.lastBackfillCompletedAt || null,
      updatedAt: nowIso(),
    };

    rebuildMailboxConversations(safeAccount.mailboxId);
    await save();
    return { ...next };
  }

  async function recordDeltaPage({
    runId = '',
    account = {},
    folder = {},
    changes = [],
    nextPageUrl = null,
    deltaLink = null,
    sourcePageUrl = '',
    pageSize = 0,
    complete = false,
    roundType = 'initial_delta_round',
  } = {}) {
    const safeAccount = ensureAccount(account);
    const safeFolder = asObject(folder);
    const folderType = normalizeFolderType(safeFolder.folderType);
    const folderKey = toFolderKey(safeAccount.mailboxId, folderType);
    const checkpointKey = toSyncCheckpointKey(safeAccount.mailboxId, folderType);
    if (!folderKey || !checkpointKey) {
      throw new Error('Mailbox truth delta page saknar giltig mailboxId/folderType.');
    }

    const existingFolder = asObject(state.folders[folderKey]);
    const previousCheckpoint = asObject(state.syncCheckpoints[checkpointKey]);
    const safeRunId = normalizeText(runId) || null;
    let upsertsApplied = 0;
    let deletesApplied = 0;

    for (const rawChange of asArray(changes)) {
      const safeChange = asObject(rawChange);
      const changeType = normalizeText(safeChange.changeType).toLowerCase();
      const graphMessageId = normalizeText(
        safeChange.graphMessageId || safeChange?.message?.graphMessageId
      );
      const messageKey = toMessageKey(safeAccount.mailboxId, graphMessageId);
      if (!messageKey) continue;

      if (changeType === 'deleted') {
        const existingMessage = hydrateStoredMessage(
          state.messages[messageKey],
          safeAccount.mailboxId
        );
        if (
          existingMessage &&
          normalizeFolderType(existingMessage.folderType) === folderType
        ) {
          delete state.messages[messageKey];
          deletesApplied += 1;
        }
        continue;
      }

      if (changeType !== 'upsert') continue;
      const hydrated = hydrateStoredMessage(
        {
          ...asObject(safeChange.message),
          mailboxId: safeAccount.mailboxId,
          mailboxAddress: safeAccount.mailboxAddress,
          userPrincipalName: safeAccount.userPrincipalName,
          graphUserId: safeAccount.graphUserId,
          folderType,
          persistedAt: nowIso(),
        },
        safeAccount.mailboxId
      );
      if (!hydrated) continue;
      const existingMessage = hydrateStoredMessage(
        state.messages[messageKey],
        safeAccount.mailboxId
      );
      const changed =
        !existingMessage ||
        serializeComparableMessage(existingMessage) !== serializeComparableMessage(hydrated);
      state.messages[messageKey] = hydrated;
      if (changed) upsertsApplied += 1;
    }

    const materializedMessageCount = recomputeFolderMessageCount(safeAccount.mailboxId, folderType);
    const nextFolder = {
      ...existingFolder,
      mailboxId: safeAccount.mailboxId,
      graphUserId: safeAccount.graphUserId,
      folderId:
        normalizeText(safeFolder.folderId) || existingFolder.folderId || null,
      folderName:
        normalizeText(safeFolder.folderName) || existingFolder.folderName || null,
      folderType,
      wellKnownName:
        normalizeText(safeFolder.wellKnownName) || existingFolder.wellKnownName || null,
      fetchStatus: normalizeText(existingFolder.fetchStatus) || 'success',
      totalItemCount: toNumber(
        safeFolder.totalItemCount,
        toNumber(existingFolder.totalItemCount, 0)
      ),
      unreadItemCount: toNumber(
        safeFolder.unreadItemCount,
        toNumber(existingFolder.unreadItemCount, 0)
      ),
      messageCollectionCount: toNumber(
        safeFolder.messageCollectionCount,
        toNumber(existingFolder.messageCollectionCount, Number.NaN)
      ),
      materializedMessageCount,
      lastDeltaRunId: safeRunId,
      lastDeltaRoundType: normalizeText(roundType) || null,
      lastDeltaAppliedAt: nowIso(),
    };
    state.folders[folderKey] = nextFolder;

    const safeDeltaLink = normalizeText(deltaLink) || null;
    const safeNextPageUrl = normalizeText(nextPageUrl) || null;
    const nextCheckpoint = {
      mailboxId: safeAccount.mailboxId,
      folderType,
      lastRunId: safeRunId,
      roundType: normalizeText(roundType) || 'initial_delta_round',
      syncStatus:
        safeNextPageUrl
          ? 'running'
          : safeDeltaLink
            ? 'delta_armed'
            : 'error',
      deltaLink:
        safeNextPageUrl
          ? normalizeText(previousCheckpoint.deltaLink) || null
          : safeDeltaLink,
      nextPageUrl: safeNextPageUrl,
      lastAttemptedAt:
        previousCheckpoint.lastAttemptedAt && previousCheckpoint.lastRunId === safeRunId
          ? previousCheckpoint.lastAttemptedAt
          : nowIso(),
      lastUpdatedAt: nowIso(),
      lastSuccessfulAt: nowIso(),
      lastCompletedAt:
        complete && !safeNextPageUrl && safeDeltaLink ? nowIso() : null,
      pageSize: toNumber(pageSize, 0),
      pagesFetched:
        previousCheckpoint.lastRunId === safeRunId
          ? toNumber(previousCheckpoint.pagesFetched, 0) + 1
          : 1,
      changesApplied:
        (previousCheckpoint.lastRunId === safeRunId
          ? toNumber(previousCheckpoint.changesApplied, 0)
          : 0) +
        upsertsApplied +
        deletesApplied,
      upsertsApplied:
        (previousCheckpoint.lastRunId === safeRunId
          ? toNumber(previousCheckpoint.upsertsApplied, 0)
          : 0) + upsertsApplied,
      deletesApplied:
        (previousCheckpoint.lastRunId === safeRunId
          ? toNumber(previousCheckpoint.deletesApplied, 0)
          : 0) + deletesApplied,
      lastSourcePageUrl: normalizeText(sourcePageUrl) || null,
      lastErrorCode:
        !safeNextPageUrl && !safeDeltaLink ? 'missing_delta_link' : null,
      lastErrorMessage:
        !safeNextPageUrl && !safeDeltaLink
          ? 'Graph delta-rundan avslutades utan deltaLink eller fortsatt nextLink.'
          : null,
    };
    state.syncCheckpoints[checkpointKey] = nextCheckpoint;

    rebuildMailboxConversations(safeAccount.mailboxId);
    await save();
    return {
      folder: { ...nextFolder },
      checkpoint: { ...nextCheckpoint },
    };
  }

  async function recordFolderError({
    runId = '',
    account = {},
    folderType = '',
    errorCode = '',
    errorMessage = '',
  } = {}) {
    const safeAccount = ensureAccount(account);
    const safeFolderType = normalizeFolderType(folderType);
    const folderKey = toFolderKey(safeAccount.mailboxId, safeFolderType);
    const next = {
      ...(state.folders[folderKey] || {}),
      mailboxId: safeAccount.mailboxId,
      graphUserId: safeAccount.graphUserId,
      folderType: safeFolderType,
      fetchStatus: 'error',
      syncState: 'error',
      nextPageUrl: null,
      lastBackfillRunId: normalizeText(runId) || null,
      lastBackfillStartedAt:
        state.folders[folderKey]?.lastBackfillStartedAt || nowIso(),
      lastBackfillUpdatedAt: nowIso(),
      lastBackfillCompletedAt: nowIso(),
      errorCode: normalizeText(errorCode) || 'fetch_error',
      errorMessage: normalizeText(errorMessage) || 'request_failed',
    };
    const completeness = deriveFolderCompleteness(next);
    next.completenessStatus = completeness.status;
    next.completenessReason = completeness.reasonCode;
    next.completenessDetail = completeness.detail;
    state.folders[folderKey] = next;
    await save();
    return { ...next };
  }

  async function recordDeltaError({
    runId = '',
    account = {},
    folderType = '',
    errorCode = '',
    errorMessage = '',
    resyncRequired = false,
  } = {}) {
    const safeAccount = ensureAccount(account);
    const safeFolderType = normalizeFolderType(folderType);
    const checkpointKey = toSyncCheckpointKey(safeAccount.mailboxId, safeFolderType);
    const previousCheckpoint = asObject(state.syncCheckpoints[checkpointKey]);
    const nextCheckpoint = {
      mailboxId: safeAccount.mailboxId,
      folderType: safeFolderType,
      lastRunId: normalizeText(runId) || null,
      roundType:
        normalizeText(previousCheckpoint.roundType) || 'incremental_delta_round',
      syncStatus: resyncRequired ? 'resync_required' : 'error',
      deltaLink: resyncRequired
        ? null
        : normalizeText(previousCheckpoint.deltaLink) || null,
      nextPageUrl: null,
      lastAttemptedAt:
        previousCheckpoint.lastAttemptedAt && previousCheckpoint.lastRunId === normalizeText(runId)
          ? previousCheckpoint.lastAttemptedAt
          : nowIso(),
      lastUpdatedAt: nowIso(),
      lastSuccessfulAt: normalizeText(previousCheckpoint.lastSuccessfulAt) || null,
      lastCompletedAt: nowIso(),
      pageSize: toNumber(previousCheckpoint.pageSize, 0),
      pagesFetched:
        previousCheckpoint.lastRunId === normalizeText(runId)
          ? toNumber(previousCheckpoint.pagesFetched, 0)
          : 0,
      changesApplied:
        previousCheckpoint.lastRunId === normalizeText(runId)
          ? toNumber(previousCheckpoint.changesApplied, 0)
          : 0,
      upsertsApplied:
        previousCheckpoint.lastRunId === normalizeText(runId)
          ? toNumber(previousCheckpoint.upsertsApplied, 0)
          : 0,
      deletesApplied:
        previousCheckpoint.lastRunId === normalizeText(runId)
          ? toNumber(previousCheckpoint.deletesApplied, 0)
          : 0,
      lastSourcePageUrl: normalizeText(previousCheckpoint.lastSourcePageUrl) || null,
      lastErrorCode: normalizeText(errorCode) || 'delta_sync_error',
      lastErrorMessage: normalizeText(errorMessage) || 'delta_request_failed',
    };
    state.syncCheckpoints[checkpointKey] = nextCheckpoint;
    await save();
    return { ...nextCheckpoint };
  }

  async function finishSyncRun(runId = '', { status = 'completed', error = null } = {}) {
    const safeRunId = normalizeText(runId);
    const run = state.syncRuns.find((entry) => normalizeText(entry.runId) === safeRunId);
    if (!run) return null;
    run.status = normalizeText(status) || 'completed';
    run.error = normalizeText(error) || null;
    run.completedAt = nowIso();
    await save();
    return { ...run };
  }

  async function finishBackfillRun(runId = '', options = {}) {
    return finishSyncRun(runId, options);
  }

  async function finishDeltaRun(runId = '', options = {}) {
    return finishSyncRun(runId, options);
  }

  function getFolderState(mailboxId = '', folderType = '') {
    const folderKey = toFolderKey(mailboxId, folderType);
    return folderKey ? { ...(state.folders[folderKey] || {}) } : null;
  }

  function getAccountState(mailboxId = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    return safeMailboxId ? { ...(state.accounts[safeMailboxId] || {}) } : null;
  }

  function getSyncCheckpoint(mailboxId = '', folderType = '') {
    const checkpointKey = toSyncCheckpointKey(mailboxId, folderType);
    return checkpointKey ? { ...(state.syncCheckpoints[checkpointKey] || {}) } : null;
  }

  function listMessages({
    mailboxIds = [],
    folderTypes = [],
    sinceIso = null,
    untilIso = null,
    limit = 0,
  } = {}) {
    const safeMailboxIds = asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean);
    const mailboxIdSet = safeMailboxIds.length > 0 ? new Set(safeMailboxIds) : null;
    const safeFolderTypes = asArray(folderTypes)
      .map((item) => normalizeFolderType(item))
      .filter((item) => item !== 'unknown');
    const folderTypeSet = safeFolderTypes.length > 0 ? new Set(safeFolderTypes) : null;
    const safeSinceIso = normalizeText(sinceIso);
    const safeUntilIso = normalizeText(untilIso);
    const sinceMs = safeSinceIso ? Date.parse(safeSinceIso) : NaN;
    const untilMs = safeUntilIso ? Date.parse(safeUntilIso) : NaN;
    const safeLimit = Math.max(0, Number(limit) || 0);

    const rows = Object.values(state.messages)
      .filter((message) => {
        const safeMessage = asObject(message);
        const mailboxId = normalizeMailboxId(safeMessage.mailboxId);
        const folderType = normalizeFolderType(safeMessage.folderType);
        if (mailboxIdSet && !mailboxIdSet.has(mailboxId)) return false;
        if (folderTypeSet && !folderTypeSet.has(folderType)) return false;
        const sortIso = toMessageSortIso(safeMessage);
        const sortMs = Date.parse(sortIso);
        if (Number.isFinite(sinceMs) && (!Number.isFinite(sortMs) || sortMs < sinceMs)) return false;
        if (Number.isFinite(untilMs) && (!Number.isFinite(sortMs) || sortMs > untilMs)) return false;
        return true;
      })
      .map((message) => {
        const { persistedAt, ...rest } = asObject(message);
        return { ...rest };
      })
      .sort((left, right) => toMessageSortIso(right).localeCompare(toMessageSortIso(left)));

    return safeLimit > 0 ? rows.slice(0, safeLimit) : rows;
  }

  function toNormalizedModel() {
    const accounts = Object.values(state.accounts)
      .map((account) => ({ ...account }))
      .sort((left, right) => String(left.mailboxId || '').localeCompare(String(right.mailboxId || '')));
    const folders = Object.values(state.folders)
      .map((folder) => ({ ...folder }))
      .sort((left, right) => {
        const mailboxSort = String(left.mailboxId || '').localeCompare(String(right.mailboxId || ''));
        if (mailboxSort !== 0) return mailboxSort;
        return String(left.folderType || '').localeCompare(String(right.folderType || ''));
      });
    const messages = Object.values(state.messages)
      .map((message) => {
        const { persistedAt, ...rest } = message;
        return { ...rest };
      })
      .sort((left, right) => String(right.lastModifiedAt || right.receivedAt || right.sentAt || '').localeCompare(String(left.lastModifiedAt || left.receivedAt || left.sentAt || '')));
    const conversations = Object.values(state.conversations)
      .map((conversation) => ({ ...conversation }))
      .sort((left, right) => String(right.latestMessageAt || '').localeCompare(String(left.latestMessageAt || '')));

    return {
      modelVersion: 'cco.mailbox.truth.v1',
      source: 'microsoft-graph-store',
      sourceSnapshotVersion: null,
      timestamps: {
        capturedAt: state.updatedAt || null,
        sourceGeneratedAt: state.updatedAt || null,
      },
      accounts,
      folders,
      messages,
      conversations,
      metadata: {
        accountCount: accounts.length,
        folderCount: folders.length,
        messageCount: messages.length,
        conversationCount: conversations.length,
        truncatedFolderCount: folders.filter(
          (folder) => normalizeText(folder.completenessReason) === 'backfill_incomplete'
        ).length,
      },
    };
  }

  function getCompletenessReport({ mailboxIds = [] } = {}) {
    const requestedMailboxIds = asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean);
    const effectiveMailboxIds = requestedMailboxIds.length > 0
      ? requestedMailboxIds
      : Object.keys(state.accounts).map((item) => normalizeMailboxId(item)).filter(Boolean);

    const accountReports = effectiveMailboxIds.map((mailboxId) => {
      const account = asObject(state.accounts[mailboxId]);
      const statusByFolderType = {};
      const reasonByFolderType = {};
      const detailByFolderType = {};
      const folderCounts = [];

      for (const folderType of ['inbox', 'sent', 'drafts', 'deleted']) {
        const folderKey = toFolderKey(mailboxId, folderType);
        const folder = asObject(state.folders[folderKey]);
        if (!folderKey || Object.keys(folder).length === 0) {
          statusByFolderType[folderType] = 'NOT VERIFIED';
          reasonByFolderType[folderType] = 'folder_not_backfilled';
          detailByFolderType[folderType] = 'Foldern har inte backfillats till persistence-lagret ännu.';
          continue;
        }
        statusByFolderType[folderType] = normalizeText(folder.completenessStatus) || 'NOT VERIFIED';
        reasonByFolderType[folderType] = normalizeText(folder.completenessReason) || 'unknown';
        detailByFolderType[folderType] = normalizeText(folder.completenessDetail) || '';
        folderCounts.push({
          folderType,
          totalItemCount: toNumber(folder.totalItemCount, 0),
          messageCollectionCount: toNumber(folder.messageCollectionCount, NaN),
          unreadItemCount: toNumber(folder.unreadItemCount, 0),
          materializedMessageCount: toNumber(folder.materializedMessageCount, 0),
          nextPageUrlPresent: Boolean(normalizeText(folder.nextPageUrl)),
          fetchStatus: normalizeText(folder.fetchStatus) || 'success',
        });
      }

      const statuses = Object.values(statusByFolderType);
      const accountStatus = statuses.includes('BROKEN')
        ? 'BROKEN'
        : statuses.includes('PARTIAL')
          ? 'PARTIAL'
          : statuses.includes('NOT VERIFIED')
            ? 'NOT VERIFIED'
            : 'VERIFIED';

      return {
        mailboxId,
        mailboxAddress: normalizeText(account.mailboxAddress).toLowerCase() || mailboxId,
        accountStatus,
        statusByFolderType,
        reasonByFolderType,
        detailByFolderType,
        folderCounts,
      };
    });

    const overallStatus = accountReports.every((account) => account.accountStatus === 'VERIFIED')
      ? 'VERIFIED'
      : accountReports.some((account) => account.accountStatus === 'BROKEN')
        ? 'BROKEN'
        : accountReports.some((account) => account.accountStatus === 'PARTIAL')
          ? 'PARTIAL'
          : 'NOT VERIFIED';

    return {
      overallStatus,
      accountReports,
      metadata: {
        storePath: resolvedPath,
        accountCount: accountReports.length,
        folderCount: Object.keys(state.folders).length,
        messageCount: Object.keys(state.messages).length,
        conversationCount: Object.keys(state.conversations).length,
        updatedAt: state.updatedAt || null,
      },
    };
  }

  function getDeltaSyncReport({ mailboxIds = [] } = {}) {
    const requestedMailboxIds = asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean);
    const effectiveMailboxIds = requestedMailboxIds.length > 0
      ? requestedMailboxIds
      : Object.keys(state.accounts).map((item) => normalizeMailboxId(item)).filter(Boolean);

    const accountReports = effectiveMailboxIds.map((mailboxId) => {
      const account = asObject(state.accounts[mailboxId]);
      const statusByFolderType = {};
      const reasonByFolderType = {};
      const detailByFolderType = {};
      const checkpointsByFolderType = {};

      for (const folderType of ['inbox', 'sent', 'drafts', 'deleted']) {
        const folder = asObject(state.folders[toFolderKey(mailboxId, folderType)]);
        const checkpoint = asObject(state.syncCheckpoints[toSyncCheckpointKey(mailboxId, folderType)]);

        if (!folder || Object.keys(folder).length === 0) {
          statusByFolderType[folderType] = 'NOT READY';
          reasonByFolderType[folderType] = 'folder_not_backfilled';
          detailByFolderType[folderType] =
            'Foldern saknar verifierad mailbox truth-bas och kan inte delta-synkas ännu.';
          checkpointsByFolderType[folderType] = null;
          continue;
        }

        if (normalizeText(folder.completenessStatus) !== 'VERIFIED') {
          statusByFolderType[folderType] = 'NOT READY';
          reasonByFolderType[folderType] = 'folder_truth_not_verified';
          detailByFolderType[folderType] =
            normalizeText(folder.completenessDetail) ||
            'Foldern ar inte verifierad i mailbox truth-basen och ar darfor inte redo for delta.';
          checkpointsByFolderType[folderType] = null;
          continue;
        }

        if (normalizeText(folder.completenessReason) === 'empty_verified' && (!checkpoint || Object.keys(checkpoint).length === 0)) {
          statusByFolderType[folderType] = 'VERIFIED EMPTY';
          reasonByFolderType[folderType] = 'empty_verified';
          detailByFolderType[folderType] =
            normalizeText(folder.completenessDetail) ||
            'Foldern ar tom och korrekt verifierad som tom.';
          checkpointsByFolderType[folderType] = null;
          continue;
        }

        if (!checkpoint || Object.keys(checkpoint).length === 0) {
          statusByFolderType[folderType] = 'NOT STARTED';
          reasonByFolderType[folderType] = 'delta_not_started';
          detailByFolderType[folderType] =
            'Foldern ar verifierad men har ingen persisted delta-checkpoint ännu.';
          checkpointsByFolderType[folderType] = null;
          continue;
        }

        const syncStatus = normalizeText(checkpoint.syncStatus) || 'not_started';
        statusByFolderType[folderType] = toDeltaStatusLabel(syncStatus);
        reasonByFolderType[folderType] =
          normalizeText(checkpoint.lastErrorCode) ||
          (syncStatus === 'delta_armed'
            ? 'delta_link_persisted'
            : syncStatus === 'running'
              ? 'delta_round_in_progress'
              : syncStatus === 'resync_required'
                ? 'resync_required'
                : 'delta_not_started');
        detailByFolderType[folderType] =
          normalizeText(checkpoint.lastErrorMessage) ||
          (syncStatus === 'delta_armed'
            ? 'Foldern har ett sparat deltaLink och ar armed for inkrementell sync.'
            : syncStatus === 'running'
              ? 'Foldern har en paagande delta-runda med persisted nextLink.'
              : syncStatus === 'resync_required'
                ? 'Foldern kravde ny backfill eller ny initial delta-runda efter ogiltigt sync-token.'
                : 'Foldern har ingen full delta-arming ännu.');
        checkpointsByFolderType[folderType] = {
          ...checkpoint,
          deltaLinkPresent: Boolean(normalizeText(checkpoint.deltaLink)),
          nextPageUrlPresent: Boolean(normalizeText(checkpoint.nextPageUrl)),
        };
      }

      const statuses = Object.values(statusByFolderType);
      const accountStatus = statuses.every(
        (status) => status === 'DELTA ARMED' || status === 'VERIFIED EMPTY'
      )
        ? 'DELTA ARMED'
        : statuses.includes('ERROR')
          ? 'ERROR'
          : statuses.includes('RESYNC REQUIRED')
            ? 'RESYNC REQUIRED'
            : statuses.includes('RUNNING')
              ? 'RUNNING'
              : statuses.includes('NOT READY')
                ? 'NOT READY'
                : 'NOT STARTED';

      return {
        mailboxId,
        mailboxAddress: normalizeText(account.mailboxAddress).toLowerCase() || mailboxId,
        accountStatus,
        statusByFolderType,
        reasonByFolderType,
        detailByFolderType,
        checkpointsByFolderType,
      };
    });

    const overallStatus = accountReports.every((account) => account.accountStatus === 'DELTA ARMED')
      ? 'DELTA ARMED'
      : accountReports.some((account) => account.accountStatus === 'ERROR')
        ? 'ERROR'
        : accountReports.some((account) => account.accountStatus === 'RESYNC REQUIRED')
          ? 'RESYNC REQUIRED'
          : accountReports.some((account) => account.accountStatus === 'RUNNING')
            ? 'RUNNING'
            : accountReports.some((account) => account.accountStatus === 'NOT READY')
              ? 'NOT READY'
              : 'NOT STARTED';

    return {
      overallStatus,
      accountReports,
      metadata: {
        storePath: resolvedPath,
        checkpointCount: Object.keys(state.syncCheckpoints).length,
        updatedAt: state.updatedAt || null,
      },
    };
  }

  if (initialStateMutated) {
    await save();
  } else {
    state.updatedAt = nowIso();
  }

  return {
    filePath: resolvedPath,
    startBackfillRun,
    startDeltaRun,
    resetFolder,
    recordFolderPage,
    recordDeltaPage,
    recordFolderError,
    recordDeltaError,
    finishBackfillRun,
    finishDeltaRun,
    getFolderState,
    getAccountState,
    getSyncCheckpoint,
    listMessages,
    toNormalizedModel,
    getCompletenessReport,
    getDeltaSyncReport,
  };
}

module.exports = {
  createCcoMailboxTruthStore,
};
