const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('./ccoMailboxTruthStore');

function normalizeMailboxId(value = '') {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function encodeMailboxId(mailboxId = '') {
  const normalized = normalizeMailboxId(mailboxId);
  if (!normalized) return 'unknown';
  return normalized.replace(/[^a-z0-9]+/g, '_');
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function sliceMonolithStateForMailbox(state = {}, mailboxId = '') {
  const safeMailboxId = normalizeMailboxId(mailboxId);
  const slice = {
    version: state.version || 1,
    createdAt: state.createdAt || new Date().toISOString(),
    updatedAt: state.updatedAt || new Date().toISOString(),
    accounts: {},
    folders: {},
    messages: {},
    conversations: {},
    syncCheckpoints: {},
    syncRuns: [],
  };

  const account = asObject(state.accounts?.[safeMailboxId]);
  if (Object.keys(account).length > 0) {
    slice.accounts[safeMailboxId] = account;
  }

  for (const [folderKey, folder] of Object.entries(asObject(state.folders))) {
    if (normalizeMailboxId(folder?.mailboxId) === safeMailboxId) {
      slice.folders[folderKey] = folder;
    }
  }

  for (const [messageKey, message] of Object.entries(asObject(state.messages))) {
    if (normalizeMailboxId(message?.mailboxId) === safeMailboxId) {
      slice.messages[messageKey] = message;
    }
  }

  for (const [conversationKey, conversation] of Object.entries(asObject(state.conversations))) {
    if (normalizeMailboxId(conversation?.mailboxId) === safeMailboxId) {
      slice.conversations[conversationKey] = conversation;
    }
  }

  for (const [checkpointKey, checkpoint] of Object.entries(asObject(state.syncCheckpoints))) {
    if (normalizeMailboxId(checkpoint?.mailboxId) === safeMailboxId) {
      slice.syncCheckpoints[checkpointKey] = checkpoint;
    }
  }

  return slice;
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function migrateMonolithIfNeeded({ legacyFilePath, mailboxesDir, indexPath }) {
  const legacyPath = path.resolve(String(legacyFilePath || '').trim());
  if (!legacyPath) return { migrated: false, reason: 'no_legacy_path' };

  try {
    await fs.access(legacyPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { migrated: false, reason: 'legacy_missing' };
    throw error;
  }

  const markerPath = path.join(mailboxesDir, '.migration-complete.json');
  try {
    await fs.access(markerPath);
    return { migrated: false, reason: 'already_migrated' };
  } catch {
    // continue
  }

  const monolith = await readJson(legacyPath, null);
  if (!monolith || typeof monolith !== 'object') {
    throw new Error('Mailbox truth monolith kunde inte lasas for sharded migration.');
  }

  const mailboxIds = new Set(
    [
      ...Object.keys(asObject(monolith.accounts)),
      ...Object.values(asObject(monolith.messages)).map((message) =>
        normalizeMailboxId(message?.mailboxId)
      ),
    ].filter(Boolean)
  );

  for (const mailboxId of mailboxIds) {
    const shardPath = path.join(mailboxesDir, `${encodeMailboxId(mailboxId)}.json`);
    try {
      await fs.access(shardPath);
      continue;
    } catch {
      // create shard
    }
    await writeJsonAtomic(shardPath, sliceMonolithStateForMailbox(monolith, mailboxId));
  }

  const index = {
    version: 1,
    migratedFrom: legacyPath,
    migratedAt: new Date().toISOString(),
    syncRuns: asArray(monolith.syncRuns),
  };
  await writeJsonAtomic(indexPath, index);

  const backupPath = `${legacyPath}.migrated.${Date.now()}.bak`;
  await fs.rename(legacyPath, backupPath);
  await writeJsonAtomic(markerPath, {
    migratedAt: index.migratedAt,
    backupPath,
    mailboxCount: mailboxIds.size,
  });

  return {
    migrated: true,
    mailboxCount: mailboxIds.size,
    backupPath,
  };
}

async function createCcoMailboxTruthShardedStore({
  baseDir = '',
  legacyFilePath = '',
  maxSyncRuns = 200,
} = {}) {
  const resolvedBase = path.resolve(String(baseDir || '').trim());
  if (!resolvedBase) {
    throw new Error('ccoMailboxTruthShardedStore baseDir saknas.');
  }
  const mailboxesDir = path.join(resolvedBase, 'mailboxes');
  const indexPath = path.join(resolvedBase, 'index.json');
  await fs.mkdir(mailboxesDir, { recursive: true });

  const migration = await migrateMonolithIfNeeded({
    legacyFilePath,
    mailboxesDir,
    indexPath,
  });
  if (migration.migrated) {
    console.warn(
      '[cco_mailbox_truth_store] Migrerade monolith till sharded store',
      JSON.stringify({
        mailboxCount: migration.mailboxCount,
        backupPath: migration.backupPath,
      })
    );
  }

  const shardCache = new Map();

  async function loadShard(mailboxId = '') {
    const safeMailboxId = normalizeMailboxId(mailboxId);
    if (!safeMailboxId) {
      throw new Error('Mailbox truth shard saknar mailboxId.');
    }
    if (shardCache.has(safeMailboxId)) {
      return shardCache.get(safeMailboxId);
    }
    const shardPath = path.join(mailboxesDir, `${encodeMailboxId(safeMailboxId)}.json`);
    const store = await createCcoMailboxTruthStore({
      filePath: shardPath,
      maxSyncRuns,
      deferConversationRebuild: true,
    });
    shardCache.set(safeMailboxId, store);
    return store;
  }

  async function preloadShards() {
    const entries = await fs.readdir(mailboxesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) {
        continue;
      }
      const shardPath = path.join(mailboxesDir, entry.name);
      const store = await createCcoMailboxTruthStore({
        filePath: shardPath,
        maxSyncRuns,
        deferConversationRebuild: true,
      });
      const report = store.getCompletenessReport({ mailboxIds: [] });
      const mailboxIdsForShard = asArray(report.accountReports)
        .map((account) => normalizeMailboxId(account.mailboxId))
        .filter(Boolean);
      if (mailboxIdsForShard.length === 0) {
        const sample = store.listMessages({ limit: 1 })[0];
        if (sample?.mailboxId) {
          mailboxIdsForShard.push(normalizeMailboxId(sample.mailboxId));
        }
      }
      for (const mailboxId of mailboxIdsForShard) {
        shardCache.set(mailboxId, store);
      }
    }
  }

  await preloadShards();

  function shardFor(mailboxId = '') {
    return shardCache.get(normalizeMailboxId(mailboxId)) || null;
  }

  function listedMailboxIds(requested = []) {
    const ids = asArray(requested)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
    if (ids.length > 0) return [...new Set(ids)];
    return [...shardCache.keys()];
  }

  async function appendSyncRun(run = {}) {
    const index = await readJson(indexPath, { version: 1, syncRuns: [] });
    index.syncRuns = asArray(index.syncRuns);
    index.syncRuns.push(run);
    if (index.syncRuns.length > maxSyncRuns) {
      index.syncRuns = index.syncRuns.slice(index.syncRuns.length - maxSyncRuns);
    }
    index.updatedAt = new Date().toISOString();
    await writeJsonAtomic(indexPath, index);
  }

  async function updateSyncRun(runId = '', patch = {}) {
    const index = await readJson(indexPath, { version: 1, syncRuns: [] });
    const run = asArray(index.syncRuns).find(
      (entry) => String(entry?.runId || '') === String(runId)
    );
    if (!run) return null;
    Object.assign(run, patch);
    index.updatedAt = new Date().toISOString();
    await writeJsonAtomic(indexPath, index);
    return { ...run };
  }

  async function startBackfillRun(options = {}) {
    const run = {
      runId: crypto.randomUUID(),
      mode: 'mailbox_truth_backfill',
      mailboxIds: asArray(options.mailboxIds)
        .map((item) => normalizeMailboxId(item))
        .filter(Boolean),
      folderTypes: asArray(options.folderTypes),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      error: null,
    };
    await appendSyncRun(run);
    return run;
  }

  async function startDeltaRun(options = {}) {
    const run = {
      runId: crypto.randomUUID(),
      mode: 'mailbox_truth_delta',
      mailboxIds: asArray(options.mailboxIds)
        .map((item) => normalizeMailboxId(item))
        .filter(Boolean),
      folderTypes: asArray(options.folderTypes),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      error: null,
    };
    await appendSyncRun(run);
    return run;
  }

  async function finishSyncRun(runId = '', { status = 'completed', error = null } = {}) {
    return updateSyncRun(runId, {
      status: String(status || 'completed'),
      error: error ? String(error) : null,
      completedAt: new Date().toISOString(),
    });
  }

  return {
    filePath: resolvedBase,
    sharded: true,
    migration,
    startBackfillRun,
    startDeltaRun,
    async resetFolder(mailboxId = '', folderType = '') {
      const store = await loadShard(mailboxId);
      return store.resetFolder(mailboxId, folderType);
    },
    async recordFolderPage(args = {}) {
      const mailboxId =
        normalizeMailboxId(args?.account?.mailboxId) || normalizeMailboxId(args?.folder?.mailboxId);
      const store = await loadShard(mailboxId);
      return store.recordFolderPage(args);
    },
    async recordDeltaPage(args = {}) {
      const mailboxId =
        normalizeMailboxId(args?.account?.mailboxId) || normalizeMailboxId(args?.folder?.mailboxId);
      const store = await loadShard(mailboxId);
      return store.recordDeltaPage(args);
    },
    async recordFolderError(args = {}) {
      const store = await loadShard(args?.account?.mailboxId);
      return store.recordFolderError(args);
    },
    async recordDeltaError(args = {}) {
      const store = await loadShard(args?.account?.mailboxId);
      return store.recordDeltaError(args);
    },
    finishBackfillRun: finishSyncRun,
    finishDeltaRun: finishSyncRun,
    getFolderState(mailboxId = '', folderType = '') {
      return shardFor(mailboxId)?.getFolderState(mailboxId, folderType) || null;
    },
    getAccountState(mailboxId = '') {
      return shardFor(mailboxId)?.getAccountState(mailboxId) || null;
    },
    getSyncCheckpoint(mailboxId = '', folderType = '') {
      return shardFor(mailboxId)?.getSyncCheckpoint(mailboxId, folderType) || null;
    },
    listMessages(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const rows = [];
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        rows.push(...store.listMessages({ ...options, mailboxIds: [mailboxId] }));
      }
      rows.sort((left, right) =>
        String(right.lastModifiedAt || right.receivedAt || right.sentAt || '').localeCompare(
          String(left.lastModifiedAt || left.receivedAt || left.sentAt || '')
        )
      );
      const safeLimit = Math.max(0, Number(options.limit) || 0);
      return safeLimit > 0 ? rows.slice(0, safeLimit) : rows;
    },
    toNormalizedModel() {
      const mailboxIds = listedMailboxIds([]);
      const accounts = [];
      const folders = [];
      const messages = [];
      const conversations = [];
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        const model = store.toNormalizedModel();
        accounts.push(...asArray(model.accounts));
        folders.push(...asArray(model.folders));
        messages.push(...asArray(model.messages));
        conversations.push(...asArray(model.conversations));
      }
      return {
        modelVersion: 'cco.mailbox.truth.v1',
        source: 'microsoft-graph-store',
        sourceSnapshotVersion: null,
        timestamps: {
          capturedAt: new Date().toISOString(),
          sourceGeneratedAt: new Date().toISOString(),
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
            (folder) => String(folder?.completenessReason || '') === 'backfill_incomplete'
          ).length,
          sharded: true,
        },
      };
    },
    getCompletenessReport(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const accountReports = [];
      let messageCount = 0;
      let folderCount = 0;
      let conversationCount = 0;
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        const report = store.getCompletenessReport({ mailboxIds: [mailboxId] });
        accountReports.push(...asArray(report.accountReports));
        messageCount += Number(report?.metadata?.messageCount || 0);
        folderCount += Number(report?.metadata?.folderCount || 0);
        conversationCount += Number(report?.metadata?.conversationCount || 0);
      }
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
          storePath: resolvedBase,
          sharded: true,
          accountCount: accountReports.length,
          folderCount,
          messageCount,
          conversationCount,
          updatedAt: new Date().toISOString(),
        },
      };
    },
    getDeltaSyncReport(options = {}) {
      const mailboxIds = listedMailboxIds(options.mailboxIds);
      const accountReports = [];
      let checkpointCount = 0;
      for (const mailboxId of mailboxIds) {
        const store = shardFor(mailboxId);
        if (!store) continue;
        const report = store.getDeltaSyncReport({ mailboxIds: [mailboxId] });
        accountReports.push(...asArray(report.accountReports));
        checkpointCount += Number(report?.metadata?.checkpointCount || 0);
      }
      const overallStatus = accountReports.every(
        (account) => account.accountStatus === 'DELTA ARMED'
      )
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
          storePath: resolvedBase,
          sharded: true,
          checkpointCount,
          updatedAt: new Date().toISOString(),
        },
      };
    },
  };
}

module.exports = {
  createCcoMailboxTruthShardedStore,
  encodeMailboxId,
  sliceMonolithStateForMailbox,
};
