const fs = require('node:fs/promises');
const path = require('node:path');

const { pruneBackups } = require('./stateBackup');
const { pruneSchedulerPilotReports } = require('./pilotReports');

const TMP_FILE_PATTERN = /\.tmp$/i;
const OVERSIZE_BAK_PATTERN = /\.oversize\.bak$/i;
const MB = 1024 * 1024;

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

async function pruneTempFilesInDirectory({
  directoryPath,
  olderThanMs = 5 * 60 * 1000,
}) {
  const nowMs = Date.now();
  const deleted = [];
  await fs.mkdir(directoryPath, { recursive: true });
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
  await fs.mkdir(directoryPath, { recursive: true });
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!OVERSIZE_BAK_PATTERN.test(entry.name)) continue;
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

      const backupPath = `${absoluteFilePath}.oversize.bak`;
      try {
        await fs.unlink(backupPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }

      await fs.rename(absoluteFilePath, backupPath);
      await fs.writeFile(absoluteFilePath, JSON.stringify(guard.fallback, null, 2), 'utf8');
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
    stateGuardBackups: {
      deletedCount: 0,
      reclaimedBytes: 0,
      deleted: [],
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
  }

  summary.reclaimedBytes += Number(summary.tempFiles.reclaimedBytes || 0);
  summary.reclaimedBytes += Number(summary.stateGuardBackups.reclaimedBytes || 0);
  summary.finishedAt = new Date().toISOString();

  if (
    Number(summary.reclaimedBytes || 0) > 0 ||
    Number(summary.tempFiles.deletedCount || 0) > 0 ||
    summary.errors.length > 0
  ) {
    const reclaimedMb = Number((Number(summary.reclaimedBytes || 0) / (1024 * 1024)).toFixed(2));
    const sanitizedStateFiles = Number(summary.stateFiles?.sanitizedCount || 0);
    logger?.warn?.(
      `[startup-disk-guard] reclaimed=${reclaimedMb}MB backupsDeleted=${
        summary.backupPrune?.deletedCount || 0
      } reportsDeleted=${summary.reportPrune?.deletedCount || 0} tmpDeleted=${
        summary.tempFiles.deletedCount
      } oversizeBakDeleted=${
        summary.stateGuardBackups.deletedCount
      } sanitizedStateFiles=${sanitizedStateFiles} errors=${summary.errors.length}`
    );
  }

  return summary;
}

module.exports = {
  runStartupDiskGuard,
};
