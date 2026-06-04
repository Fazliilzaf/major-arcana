const fs = require('node:fs/promises');
const path = require('node:path');

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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function statSafe(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      sizeBytes: Number(stat.size || 0),
      mtime: stat.mtime.toISOString(),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, sizeBytes: 0, mtime: null };
    throw error;
  }
}

async function findLatestMigratedBackup(stateRoot) {
  const entries = await fs.readdir(stateRoot);
  const candidates = entries
    .filter((name) => /^cco-mailbox-truth\.json\.migrated\.\d+\.bak$/.test(name))
    .sort((left, right) => {
      const leftTs = Number(left.match(/\.(\d+)\.bak$/)?.[1] || 0);
      const rightTs = Number(right.match(/\.(\d+)\.bak$/)?.[1] || 0);
      return rightTs - leftTs;
    });
  return candidates[0] ? path.join(stateRoot, candidates[0]) : null;
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function countMessagesInState(state = {}) {
  return Object.keys(asObject(state.messages)).length;
}

async function inspectMailboxTruthLayout(config = {}) {
  const stateRoot = config.stateRoot;
  const shardDir = path.join(config.ccoMailboxTruthShardDir, 'mailboxes');
  const legacyPath = config.ccoMailboxTruthStorePath;

  const files = [
    { label: 'legacy', filePath: legacyPath },
    { label: 'legacy_oversize_bak', filePath: `${legacyPath}.oversize.bak` },
    { label: 'shard_index', filePath: path.join(config.ccoMailboxTruthShardDir, 'index.json') },
    {
      label: 'migration_marker',
      filePath: path.join(shardDir, '.migration-complete.json'),
    },
  ];

  const fileStats = [];
  for (const entry of files) {
    const stat = await statSafe(entry.filePath);
    fileStats.push({ ...entry, ...stat });
  }

  const migratedBackup = await findLatestMigratedBackup(stateRoot);
  let migratedBackupStat = null;
  if (migratedBackup) {
    migratedBackupStat = { filePath: migratedBackup, ...(await statSafe(migratedBackup)) };
  }

  const shards = [];
  let shardEntries = [];
  try {
    shardEntries = await fs.readdir(shardDir);
  } catch {
    shardEntries = [];
  }

  for (const entry of shardEntries.filter(
    (name) => name.endsWith('.json') && !name.startsWith('.')
  )) {
    const filePath = path.join(shardDir, entry);
    const stat = await statSafe(filePath);
    let messageCount = null;
    let parseError = null;
    try {
      const parsed = await readJson(filePath);
      messageCount = countMessagesInState(parsed);
    } catch (error) {
      parseError = error?.message || 'parse_error';
    }
    shards.push({
      fileName: entry,
      filePath,
      sizeBytes: stat.sizeBytes,
      mtime: stat.mtime,
      messageCount,
      parseError,
    });
  }

  let backupMailboxCounts = [];
  if (migratedBackup) {
    try {
      const monolith = await readJson(migratedBackup);
      const mailboxIds = [
        ...Object.keys(asObject(monolith.accounts)),
        ...Object.values(asObject(monolith.messages)).map((message) =>
          normalizeMailboxId(message?.mailboxId)
        ),
      ]
        .map(normalizeMailboxId)
        .filter(Boolean);
      backupMailboxCounts = [...new Set(mailboxIds)].sort().map((mailboxId) => ({
        mailboxId,
        messageCount: countMessagesInState(sliceMonolithStateForMailbox(monolith, mailboxId)),
      }));
    } catch (error) {
      backupMailboxCounts = [{ error: error?.message || 'backup_parse_failed' }];
    }
  }

  return {
    stateRoot,
    legacyPath,
    shardDir,
    files: fileStats,
    migratedBackup: migratedBackupStat,
    shards,
    backupMailboxCounts,
  };
}

async function restoreMailboxTruthShards({
  config = {},
  backupPath = '',
  mailboxIds = [],
  apply = false,
} = {}) {
  const resolvedBackupPath =
    String(backupPath || '').trim() || (await findLatestMigratedBackup(config.stateRoot));
  if (!resolvedBackupPath) {
    throw new Error('Ingen migrated backup hittades.');
  }

  const shardDir = path.join(config.ccoMailboxTruthShardDir, 'mailboxes');
  const monolith = await readJson(resolvedBackupPath);
  const backupMailboxes = [
    ...Object.keys(asObject(monolith.accounts)),
    ...Object.values(asObject(monolith.messages)).map((message) =>
      normalizeMailboxId(message?.mailboxId)
    ),
  ]
    .map(normalizeMailboxId)
    .filter(Boolean);
  const uniqueBackupMailboxes = [...new Set(backupMailboxes)];
  const targets =
    asArray(mailboxIds).map(normalizeMailboxId).filter(Boolean).length > 0
      ? asArray(mailboxIds).map(normalizeMailboxId).filter(Boolean)
      : uniqueBackupMailboxes;

  const actions = [];
  for (const mailboxId of targets) {
    const shardPath = path.join(shardDir, `${encodeMailboxId(mailboxId)}.json`);
    const backupCount = countMessagesInState(sliceMonolithStateForMailbox(monolith, mailboxId));
    const currentStat = await statSafe(shardPath);
    let currentCount = 0;
    let currentParseError = null;
    if (currentStat.exists) {
      try {
        const current = await readJson(shardPath);
        currentCount = countMessagesInState(current);
      } catch (error) {
        currentParseError = error?.message || 'parse_error';
        currentCount = -1;
      }
    }

    const shouldRestore =
      backupCount > 0 && (currentCount <= 0 || (currentCount >= 0 && backupCount > currentCount));
    const action = {
      mailboxId,
      shardPath,
      backupCount,
      currentCount,
      currentParseError,
      shouldRestore,
      restored: false,
      preRestoreBackupPath: null,
    };

    if (apply && shouldRestore) {
      const slice = sliceMonolithStateForMailbox(monolith, mailboxId);
      if (currentStat.exists) {
        action.preRestoreBackupPath = `${shardPath}.pre-restore.${Date.now()}.bak`;
        await fs.rename(shardPath, action.preRestoreBackupPath);
      }
      await writeJsonAtomic(shardPath, slice);
      action.restored = true;
    }

    actions.push(action);
  }

  return {
    dryRun: !apply,
    backupPath: resolvedBackupPath,
    targets,
    actions,
    restartRequired: apply && actions.some((action) => action.restored),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  inspectMailboxTruthLayout,
  restoreMailboxTruthShards,
  findLatestMigratedBackup,
  sliceMonolithStateForMailbox,
};
