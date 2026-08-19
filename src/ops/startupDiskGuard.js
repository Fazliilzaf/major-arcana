const fs = require('node:fs/promises');
const path = require('node:path');

const { ensureDirectoryWithRetry } = require('./persistentDir');
const { pruneBackups } = require('./stateBackup');
const { pruneSchedulerPilotReports } = require('./pilotReports');

const TMP_FILE_PATTERN = /\.tmp$/i;
// ORD-71: legacy `.oversize.bak` (no timestamp) is never auto-pruned — prod rescue backup
// must survive until rotation is verified and ops removes it manually.
const OVERSIZE_BAK_PRUNE_PATTERN = /\.oversize-\d{8}T\d{6}\.\d{3}Z\.bak$/i;
// Atomic write temp files produced by writeJsonAtomic-style helpers across the codebase.
// Format: ${filePath}.${process.pid}.${crypto.randomUUID()}.tmp
const ATOMIC_TMP_PID_UUID_PATTERN =
  /^(.+)\.(\d+)\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.tmp$/i;
// Some legacy atomic helpers use: ${filePath}.${process.pid}.tmp
const ATOMIC_TMP_PID_PATTERN = /^(.+)\.(\d+)\.tmp$/i;
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

// Engångsbackuper från migreringar och restore-körningar. De skrivs bredvid
// sin källfil, aldrig i backupDir, så pruneBackups() har aldrig sett dem. Mätt
// på prod 2026-08-19: 2,38 GB i tre mönster, varav en .migrated.-fil från
// shardningen tre månader tidigare.
//
// Varje mönster måste innehålla en MARKÖR (pre-, migrated., archived-). Det är
// det som gör regeln säker: en levande statefil heter cco-mailbox-truth.json
// och saknar markör, så den kan aldrig matcha oavsett ålder.
//
// Åldern läses från mtime, inte från tidsstämpeln i namnet. Namnen har minst
// fyra olika format (epoch-ms, ISO, ISO med bindestreck) och en parser för dem
// alla vore mer kod med fler sätt att ha fel — mtime är samma källa som de
// befintliga svepen redan litar på.
const RETAINABLE_BACKUP_PATTERNS = [
  // src/ops/ccoMailboxTruthBodyMigration.js  → <shard>.<epoch>.pre-body-migration.bak
  // scripts/backfill-journal-pdfs.js         → <fil>.pre-pdf-backfill-<ts>.bak
  // scripts/backfill-cliento-...js           → <fil>.pre-sourceid-backfill-<ISO>.json
  /\.pre-[a-z0-9-]+\.(?:bak|json)$/i,
  // src/ops/ccoMailboxTruthRestore.js        → <shard>.pre-restore.<epoch>.bak
  /\.pre-restore\.\d+\.bak$/i,
  // src/ops/ccoMailboxTruthShardedStore.js   → <legacy>.migrated.<epoch>.bak
  /\.migrated\.\d+\.bak$/i,
  // Manuellt skapade arkiv (ingen kodväg i repot, men 0,32 GB låg på prod).
  /\.archived-[a-z0-9-]*\.(?:bak|json)$/i,
];

function isRetainableBackupFileName(fileName = '') {
  const name = String(fileName || '');
  // ORD-71: en .bak utan markör rörs aldrig automatiskt. Samma princip här —
  // matchar inget mönster, då lämnar vi filen i fred.
  return RETAINABLE_BACKUP_PATTERNS.some((pattern) => pattern.test(name));
}

function toPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.max(1, Number(fallback) || 1);
  return parsed;
}

function asDirectory(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized ? path.resolve(normalized) : '';
}

function buildDirectorySet(config = {}) {
  const unique = new Set();
  const candidates = [config.stateRoot, config.backupDir, config.reportsDir];
  for (const candidate of candidates) {
    const absolute = asDirectory(candidate);
    if (absolute) unique.add(absolute);
  }
  return [...unique];
}

async function pruneTempFilesInDirectory({ directoryPath, olderThanMs = 5 * 60 * 1000 }) {
  const nowMs = Date.now();
  const deleted = [];
  await ensureDirectoryWithRetry(directoryPath);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!TMP_FILE_PATTERN.test(entry.name)) continue;
    const filePath = path.join(directoryPath, entry.name);
    let stat = null;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!stat) continue;
    const ageMs = nowMs - Number(stat.mtimeMs || 0);
    if (ageMs < olderThanMs) continue;
    try {
      await fs.unlink(filePath);
      deleted.push({
        directoryPath,
        fileName: entry.name,
        filePath,
        sizeBytes: Number(stat.size || 0),
      });
    } catch {
      // Ignore in startup guard; a concurrent process may have removed the file.
    }
  }
  return deleted;
}

async function pruneOversizeBackupsInDirectory({
  directoryPath,
  olderThanMs = 24 * 60 * 60 * 1000,
}) {
  const nowMs = Date.now();
  const deleted = [];
  await ensureDirectoryWithRetry(directoryPath);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!OVERSIZE_BAK_PRUNE_PATTERN.test(entry.name)) continue;
    const filePath = path.join(directoryPath, entry.name);
    let stat = null;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!stat) continue;
    const ageMs = nowMs - Number(stat.mtimeMs || 0);
    if (ageMs < olderThanMs) continue;
    try {
      await fs.unlink(filePath);
      deleted.push({
        directoryPath,
        fileName: entry.name,
        filePath,
        sizeBytes: Number(stat.size || 0),
      });
    } catch {
      // Ignore cleanup errors; file can be concurrently removed.
    }
  }
  return deleted;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH = no such process → definitely dead.
    // EPERM or anything else means a process exists that we cannot signal;
    // treat it as alive to avoid deleting an in-use temp file.
    if (error && error.code === 'ESRCH') return false;
    return true;
  }
}

function parseAtomicTmpFileName(fileName) {
  let match = fileName.match(ATOMIC_TMP_PID_UUID_PATTERN);
  if (match) {
    return {
      baseName: match[1],
      pid: Number.parseInt(match[2], 10),
      hasUuid: true,
    };
  }
  match = fileName.match(ATOMIC_TMP_PID_PATTERN);
  if (match) {
    return {
      baseName: match[1],
      pid: Number.parseInt(match[2], 10),
      hasUuid: false,
    };
  }
  return null;
}

async function scanDirectoryRecursively({ directoryPath, onFile, maxDepth, currentDepth = 0 }) {
  if (currentDepth > maxDepth) return;
  await ensureDirectoryWithRetry(directoryPath);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await scanDirectoryRecursively({
        directoryPath: fullPath,
        onFile,
        maxDepth,
        currentDepth: currentDepth + 1,
      });
    } else if (entry.isFile()) {
      await onFile({ filePath: fullPath, fileName: entry.name, directoryPath });
    }
  }
}

async function cleanupOrphanedAtomicTmpFiles({
  directoryPath,
  currentPid = process.pid,
  maxDepth = 3,
}) {
  const deleted = [];
  await scanDirectoryRecursively({
    directoryPath,
    maxDepth,
    async onFile({ filePath, fileName }) {
      const parsed = parseAtomicTmpFileName(fileName);
      if (!parsed) return;
      if (!Number.isFinite(parsed.pid) || parsed.pid <= 0) return;

      // At boot, any temp file carrying our own pid cannot belong to us yet —
      // it is leftover from a previous process instance that reused our pid
      // or from a crash before rename(). Safe to delete.
      if (parsed.pid !== currentPid && isProcessAlive(parsed.pid)) {
        return;
      }

      try {
        const stat = await fs.stat(filePath);
        await fs.unlink(filePath);
        deleted.push({
          directoryPath,
          fileName,
          filePath,
          sizeBytes: Number(stat.size || 0),
          pid: parsed.pid,
          reason: parsed.pid === currentPid ? 'own_process_boot' : 'dead_pid',
        });
      } catch {
        // Ignore in startup guard; a concurrent process may have removed the file.
      }
    },
  });
  return deleted;
}

async function pruneRetainableBackupsInDirectory({
  directoryPath,
  olderThanMs = 30 * DAY_MS,
  maxDepth = 3,
  dryRun = false,
  nowMs = Date.now(),
}) {
  const deleted = [];
  const kept = [];
  // Rekursivt, till skillnad från pruneOversizeBackupsInDirectory: migrerings-
  // backuperna ligger bredvid shardarna i en underkatalog till stateRoot, så en
  // platt readdir() hade missat exakt de filer som väger mest.
  await scanDirectoryRecursively({
    directoryPath,
    maxDepth,
    async onFile({ filePath, fileName, directoryPath: parentPath }) {
      if (!isRetainableBackupFileName(fileName)) return;
      let stat = null;
      try {
        stat = await fs.stat(filePath);
      } catch {
        return;
      }
      if (!stat) return;
      const ageMs = nowMs - Number(stat.mtimeMs || 0);
      const sizeBytes = Number(stat.size || 0);
      const record = {
        directoryPath: parentPath,
        fileName,
        filePath,
        sizeBytes,
        ageDays: Number((ageMs / DAY_MS).toFixed(1)),
      };
      if (ageMs < olderThanMs) {
        kept.push({ ...record, reason: 'too_young' });
        return;
      }
      if (dryRun) {
        deleted.push({ ...record, dryRun: true });
        return;
      }
      try {
        await fs.unlink(filePath);
        deleted.push(record);
      } catch {
        // Startsvep: en parallell process kan redan ha tagit filen.
      }
    },
  });
  return { deleted, kept };
}

function buildTimestampedOversizeBackupPath(filePath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '');
  return `${filePath}.oversize-${stamp}.bak`;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildAuthStoreGuardFallback({ fallback, backupPath }) {
  const base = safeObject(fallback);
  const preserved = {
    users: safeObject(base.users),
    memberships: safeObject(base.memberships),
    sessions: {},
    pendingLogins: {},
    pendingMfaChallenges: {},
    auditEvents: [],
  };
  return readJsonFile(backupPath).then((parsed) => {
    if (!parsed || typeof parsed !== 'object') return preserved;
    return {
      ...preserved,
      users: safeObject(parsed.users),
      memberships: safeObject(parsed.memberships),
    };
  });
}

async function buildGuardFallback({ guard, backupPath }) {
  if (guard.scope === 'auth_store') {
    return buildAuthStoreGuardFallback({ fallback: guard.fallback, backupPath });
  }
  return guard.fallback;
}

function buildStateFileGuards(config = {}) {
  const ts = new Date().toISOString();
  return [
    {
      scope: 'auth_store',
      filePath: config.authStorePath,
      maxBytes: toPositiveInt(config.startupAuthStoreMaxBytes, 25 * MB),
      fallback: {
        users: {},
        memberships: {},
        sessions: {},
        pendingLogins: {},
        pendingMfaChallenges: {},
        auditEvents: [],
      },
    },
    {
      scope: 'memory_store',
      filePath: config.memoryStorePath,
      maxBytes: toPositiveInt(config.startupMemoryStoreMaxBytes, 180 * MB),
      fallback: { conversations: {} },
    },
    {
      scope: 'capability_analysis_store',
      filePath: config.capabilityAnalysisStorePath,
      maxBytes: toPositiveInt(config.startupCapabilityAnalysisStoreMaxBytes, 220 * MB),
      fallback: {
        version: 1,
        createdAt: ts,
        updatedAt: ts,
        entries: [],
      },
    },
    {
      scope: 'cco_history_store',
      filePath: config.ccoHistoryStorePath,
      maxBytes: toPositiveInt(config.startupCcoHistoryStoreMaxBytes, 250 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, mailboxes: {}, messages: [] },
    },
    {
      scope: 'cco_mailbox_truth_store',
      filePath: config.ccoMailboxTruthStorePath,
      maxBytes: toPositiveInt(config.startupCcoMailboxTruthStoreMaxBytes, 2 * 1024 * 1024 * 1024),
      fallback: {
        version: 1,
        createdAt: ts,
        updatedAt: ts,
        accounts: {},
        folders: {},
        messages: {},
        conversations: {},
        syncCheckpoints: {},
        syncRuns: [],
      },
    },
    {
      scope: 'cco_note_store',
      filePath: config.ccoNoteStorePath,
      maxBytes: toPositiveInt(config.startupCcoNoteStoreMaxBytes, 12 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, notes: [] },
    },
    {
      scope: 'cco_followup_store',
      filePath: config.ccoFollowUpStorePath,
      maxBytes: toPositiveInt(config.startupCcoFollowUpStoreMaxBytes, 12 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, followUps: [] },
    },
    {
      scope: 'cco_workspace_prefs_store',
      filePath: config.ccoWorkspacePrefsStorePath,
      maxBytes: toPositiveInt(config.startupCcoWorkspacePrefsStoreMaxBytes, 4 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, preferences: [] },
    },
    {
      scope: 'cco_portal_store',
      filePath: config.ccoPortalStorePath,
      maxBytes: toPositiveInt(config.startupCcoPortalStoreMaxBytes, 12 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, tenants: {} },
    },
    {
      scope: 'template_store',
      filePath: config.templateStorePath,
      maxBytes: toPositiveInt(config.startupTemplateStoreMaxBytes, 80 * MB),
      fallback: { templates: {}, evaluations: [] },
    },
    {
      scope: 'tenant_config_store',
      filePath: config.tenantConfigStorePath,
      maxBytes: toPositiveInt(config.startupTenantConfigStoreMaxBytes, 25 * MB),
      fallback: { tenants: {} },
    },
    {
      scope: 'patient_signal_store',
      filePath: config.patientSignalStorePath,
      maxBytes: toPositiveInt(config.startupPatientSignalStoreMaxBytes, 80 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, events: [] },
    },
    {
      scope: 'slo_ticket_store',
      filePath: config.sloTicketStorePath,
      maxBytes: toPositiveInt(config.startupSloTicketStoreMaxBytes, 30 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, tickets: [] },
    },
    {
      scope: 'release_governance_store',
      filePath: config.releaseGovernanceStorePath,
      maxBytes: toPositiveInt(config.startupReleaseGovernanceStoreMaxBytes, 25 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, cycles: [] },
    },
    {
      scope: 'secret_rotation_store',
      filePath: config.secretRotationStorePath,
      maxBytes: toPositiveInt(config.startupSecretRotationStoreMaxBytes, 10 * MB),
      fallback: { version: 1, createdAt: ts, updatedAt: ts, secrets: {} },
    },
  ];
}

async function sanitizeOversizedStateFiles({ config }) {
  const guardsEnabled = config.startupStateFileGuardEnabled !== false;
  const summary = {
    enabled: guardsEnabled,
    checkedCount: 0,
    sanitizedCount: 0,
    checked: [],
    sanitized: [],
    errors: [],
  };
  if (!guardsEnabled) return summary;

  const guards = buildStateFileGuards(config);
  for (const guard of guards) {
    const absoluteFilePath = String(guard.filePath || '').trim()
      ? path.resolve(String(guard.filePath || '').trim())
      : '';
    if (!absoluteFilePath) continue;
    summary.checkedCount += 1;
    try {
      const stat = await fs.stat(absoluteFilePath);
      const sizeBytes = Number(stat.size || 0);
      summary.checked.push({
        scope: guard.scope,
        filePath: absoluteFilePath,
        sizeBytes,
        maxBytes: guard.maxBytes,
      });
      if (sizeBytes <= guard.maxBytes) continue;

      const backupPath = buildTimestampedOversizeBackupPath(absoluteFilePath);
      await fs.rename(absoluteFilePath, backupPath);
      const fallbackPayload = await buildGuardFallback({ guard, backupPath });
      await fs.writeFile(absoluteFilePath, JSON.stringify(fallbackPayload, null, 2), 'utf8');
      summary.sanitizedCount += 1;
      summary.sanitized.push({
        scope: guard.scope,
        filePath: absoluteFilePath,
        backupPath,
        previousSizeBytes: sizeBytes,
        maxBytes: guard.maxBytes,
      });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      summary.errors.push({
        scope: guard.scope,
        filePath: absoluteFilePath,
        message: error?.message || 'state file guard failed',
        code: error?.code || null,
      });
    }
  }

  return summary;
}

async function runStartupDiskGuard({ config, logger = console } = {}) {
  const summary = {
    startedAt: new Date().toISOString(),
    backupPrune: null,
    reportPrune: null,
    tempFiles: {
      scannedDirectories: [],
      deletedCount: 0,
      reclaimedBytes: 0,
      deleted: [],
    },
    atomicTmpFiles: {
      scannedDirectories: [],
      deletedCount: 0,
      reclaimedBytes: 0,
      deleted: [],
    },
    stateGuardBackups: {
      deletedCount: 0,
      reclaimedBytes: 0,
      deleted: [],
    },
    retainableBackups: {
      enabled: false,
      dryRun: false,
      retentionDays: 0,
      scannedDirectories: [],
      deletedCount: 0,
      reclaimedBytes: 0,
      keptCount: 0,
      deleted: [],
      kept: [],
    },
    stateFiles: null,
    reclaimedBytes: 0,
    errors: [],
  };
  if (!config || typeof config !== 'object') {
    summary.errors.push({ scope: 'startup_disk_guard', message: 'config saknas' });
    return summary;
  }

  try {
    summary.stateFiles = await sanitizeOversizedStateFiles({ config });
  } catch (error) {
    summary.errors.push({
      scope: 'state_file_guard',
      message: error?.message || 'state file guard failed',
      code: error?.code || null,
    });
  }
  if (Array.isArray(summary.stateFiles?.errors) && summary.stateFiles.errors.length > 0) {
    summary.errors.push(...summary.stateFiles.errors);
  }

  try {
    summary.backupPrune = await pruneBackups({
      backupDir: config.backupDir,
      maxFiles: config.backupRetentionMaxFiles,
      maxAgeDays: config.backupRetentionMaxAgeDays,
      dryRun: false,
    });
    summary.reclaimedBytes += (summary.backupPrune.deleted || []).reduce(
      (acc, item) => acc + Number(item?.sizeBytes || 0),
      0
    );
  } catch (error) {
    summary.errors.push({
      scope: 'backup_prune',
      message: error?.message || 'backup prune failed',
      code: error?.code || null,
    });
  }

  try {
    summary.reportPrune = await pruneSchedulerPilotReports({
      reportsDir: config.reportsDir,
      maxFiles: config.reportRetentionMaxFiles,
      maxAgeDays: config.reportRetentionMaxAgeDays,
      dryRun: false,
    });
    summary.reclaimedBytes += (summary.reportPrune.deleted || []).reduce(
      (acc, item) => acc + Number(item?.sizeBytes || 0),
      0
    );
  } catch (error) {
    summary.errors.push({
      scope: 'report_prune',
      message: error?.message || 'report prune failed',
      code: error?.code || null,
    });
  }

  const atomicTmpCleanupEnabled = config.startupAtomicTmpCleanupEnabled !== false;
  const atomicTmpMaxDepth = toPositiveInt(config.startupAtomicTmpCleanupMaxDepth, 3);
  const retainableEnabled = config.startupStateBackupRetentionEnabled !== false;
  const retainableDryRun = config.startupStateBackupRetentionDryRun === true;
  const retainableDays = toPositiveInt(config.startupStateBackupRetentionDays, 30);
  summary.retainableBackups.enabled = retainableEnabled;
  summary.retainableBackups.dryRun = retainableDryRun;
  summary.retainableBackups.retentionDays = retainableDays;
  const directories = buildDirectorySet(config);
  for (const directoryPath of directories) {
    try {
      const deleted = await pruneTempFilesInDirectory({ directoryPath });
      summary.tempFiles.scannedDirectories.push(directoryPath);
      summary.tempFiles.deleted.push(...deleted);
      summary.tempFiles.deletedCount += deleted.length;
      summary.tempFiles.reclaimedBytes += deleted.reduce(
        (acc, item) => acc + Number(item?.sizeBytes || 0),
        0
      );
    } catch (error) {
      summary.errors.push({
        scope: 'temp_prune',
        directoryPath,
        message: error?.message || 'temp prune failed',
        code: error?.code || null,
      });
    }
    if (atomicTmpCleanupEnabled) {
      try {
        const deletedAtomic = await cleanupOrphanedAtomicTmpFiles({
          directoryPath,
          maxDepth: atomicTmpMaxDepth,
        });
        summary.atomicTmpFiles.scannedDirectories.push(directoryPath);
        summary.atomicTmpFiles.deleted.push(...deletedAtomic);
        summary.atomicTmpFiles.deletedCount += deletedAtomic.length;
        summary.atomicTmpFiles.reclaimedBytes += deletedAtomic.reduce(
          (acc, item) => acc + Number(item?.sizeBytes || 0),
          0
        );
      } catch (error) {
        summary.errors.push({
          scope: 'atomic_tmp_prune',
          directoryPath,
          message: error?.message || 'atomic tmp prune failed',
          code: error?.code || null,
        });
      }
    }
    try {
      const deletedBackups = await pruneOversizeBackupsInDirectory({ directoryPath });
      summary.stateGuardBackups.deleted.push(...deletedBackups);
      summary.stateGuardBackups.deletedCount += deletedBackups.length;
      summary.stateGuardBackups.reclaimedBytes += deletedBackups.reduce(
        (acc, item) => acc + Number(item?.sizeBytes || 0),
        0
      );
    } catch (error) {
      summary.errors.push({
        scope: 'oversize_bak_prune',
        directoryPath,
        message: error?.message || 'oversize backup prune failed',
        code: error?.code || null,
      });
    }
    if (retainableEnabled) {
      try {
        const { deleted, kept } = await pruneRetainableBackupsInDirectory({
          directoryPath,
          olderThanMs: retainableDays * DAY_MS,
          maxDepth: atomicTmpMaxDepth,
          dryRun: retainableDryRun,
        });
        summary.retainableBackups.scannedDirectories.push(directoryPath);
        summary.retainableBackups.deleted.push(...deleted);
        summary.retainableBackups.kept.push(...kept);
        summary.retainableBackups.deletedCount += deleted.length;
        summary.retainableBackups.keptCount += kept.length;
        summary.retainableBackups.reclaimedBytes += deleted.reduce(
          (acc, item) => acc + Number(item?.sizeBytes || 0),
          0
        );
      } catch (error) {
        summary.errors.push({
          scope: 'state_backup_retention',
          directoryPath,
          message: error?.message || 'state backup retention failed',
          code: error?.code || null,
        });
      }
    }
  }

  summary.reclaimedBytes += Number(summary.tempFiles.reclaimedBytes || 0);
  summary.reclaimedBytes += Number(summary.atomicTmpFiles.reclaimedBytes || 0);
  summary.reclaimedBytes += Number(summary.stateGuardBackups.reclaimedBytes || 0);
  // Vid torrkörning har ingenting raderats. Att räkna in kandidaternas storlek
  // i reclaimedBytes vore en direkt felrapport till den som läser loggen.
  if (!retainableDryRun) {
    summary.reclaimedBytes += Number(summary.retainableBackups.reclaimedBytes || 0);
  }
  summary.finishedAt = new Date().toISOString();

  if (
    Number(summary.reclaimedBytes || 0) > 0 ||
    Number(summary.tempFiles.deletedCount || 0) > 0 ||
    Number(summary.atomicTmpFiles.deletedCount || 0) > 0 ||
    Number(summary.retainableBackups.deletedCount || 0) > 0 ||
    summary.errors.length > 0
  ) {
    const reclaimedMb = Number((Number(summary.reclaimedBytes || 0) / (1024 * 1024)).toFixed(2));
    const sanitizedStateFiles = Number(summary.stateFiles?.sanitizedCount || 0);
    logger?.warn?.(
      `[startup-disk-guard] reclaimed=${reclaimedMb}MB backupsDeleted=${
        summary.backupPrune?.deletedCount || 0
      } reportsDeleted=${summary.reportPrune?.deletedCount || 0} tmpDeleted=${
        summary.tempFiles.deletedCount
      } atomicTmpDeleted=${summary.atomicTmpFiles.deletedCount} oversizeBakDeleted=${
        summary.stateGuardBackups.deletedCount
      } sanitizedStateFiles=${sanitizedStateFiles} stateBackups${
        retainableDryRun ? 'DryRunCandidates' : 'Deleted'
      }=${summary.retainableBackups.deletedCount} stateBackupsKept=${
        summary.retainableBackups.keptCount
      } errors=${summary.errors.length}`
    );
  }

  return summary;
}

module.exports = {
  runStartupDiskGuard,
  buildTimestampedOversizeBackupPath,
  sanitizeOversizedStateFiles,
  cleanupOrphanedAtomicTmpFiles,
  pruneRetainableBackupsInDirectory,
  isRetainableBackupFileName,
};
