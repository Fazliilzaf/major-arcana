const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function normalizeLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function normalizeBackupFileName(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (!normalized.startsWith('arcana-state-') || !normalized.endsWith('.json')) {
    throw new Error('Ogiltigt backup-filnamn.');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('Backup-filnamn innehåller otillåtna tecken.');
  }
  return normalized;
}

function resolveBackupFilePath({ backupDir, fileName }) {
  const normalizedFileName = normalizeBackupFileName(fileName);
  if (!normalizedFileName) {
    throw new Error('fileName saknas.');
  }
  return path.join(backupDir, normalizedFileName);
}

function getStateFileMap(config) {
  return {
    auth: config.authStorePath,
    templates: config.templateStorePath,
    tenantConfig: config.tenantConfigStorePath,
    memory: config.memoryStorePath,
  };
}

async function readStoreFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : null;
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      filePath,
      sizeBytes: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256: sha256(raw),
      raw,
      parsed,
      parseError: null,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        exists: false,
        filePath,
        sizeBytes: 0,
        mtime: null,
        sha256: null,
        raw: '',
        parsed: null,
        parseError: null,
      };
    }
    if (error instanceof SyntaxError) {
      const raw = await fs.readFile(filePath, 'utf8');
      const stat = await fs.stat(filePath);
      return {
        exists: true,
        filePath,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        sha256: sha256(raw),
        raw,
        parsed: null,
        parseError: error.message,
      };
    }
    throw error;
  }
}

async function buildStateManifest({ stateFileMap }) {
  const entries = Object.entries(stateFileMap || {});
  const stores = [];
  for (const [name, filePath] of entries) {
    const store = await readStoreFile(filePath);
    stores.push({
      name,
      filePath: store.filePath,
      exists: store.exists,
      sizeBytes: store.sizeBytes,
      mtime: store.mtime,
      sha256: store.sha256,
      parseError: store.parseError,
    });
  }
  return {
    generatedAt: nowIso(),
    stores,
  };
}

async function ensureDir(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function createStateBackup({ stateFileMap, backupDir, createdBy = 'system' }) {
  if (!backupDir) throw new Error('backupDir saknas.');
  await ensureDir(backupDir);

  const stores = {};
  for (const [name, filePath] of Object.entries(stateFileMap || {})) {
    const store = await readStoreFile(filePath);
    stores[name] = {
      filePath: store.filePath,
      exists: store.exists,
      sizeBytes: store.sizeBytes,
      mtime: store.mtime,
      sha256: store.sha256,
      parseError: store.parseError,
      data: store.parsed,
    };
  }

  const payload = {
    format: 'arcana_state_backup',
    version: 1,
    createdAt: nowIso(),
    createdBy,
    stores,
  };

  const filename = `arcana-state-${formatTimestamp()}.json`;
  const absolutePath = path.join(backupDir, filename);
  await fs.writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');

  const stat = await fs.stat(absolutePath);
  return {
    filePath: absolutePath,
    fileName: filename,
    sizeBytes: stat.size,
    createdAt: payload.createdAt,
    stores: Object.keys(stores).map((name) => ({
      name,
      exists: Boolean(stores[name]?.exists),
      sizeBytes: Number(stores[name]?.sizeBytes || 0),
      sha256: stores[name]?.sha256 || null,
      parseError: stores[name]?.parseError || null,
    })),
  };
}

async function listBackups({ backupDir, limit = 20 }) {
  const clampedLimit = normalizeLimit(limit, 20);
  await ensureDir(backupDir);
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('arcana-state-') && entry.name.endsWith('.json'))
    .map((entry) => entry.name);

  const withStats = [];
  for (const fileName of files) {
    const filePath = path.join(backupDir, fileName);
    const stat = await fs.stat(filePath);
    withStats.push({
      fileName,
      filePath,
      sizeBytes: stat.size,
      mtime: stat.mtime.toISOString(),
    });
  }

  withStats.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return withStats.slice(0, clampedLimit);
}

async function pruneBackups({
  backupDir,
  maxFiles = 50,
  maxAgeDays = 30,
  dryRun = false,
}) {
  const maxFilesInt = Number.isFinite(Number(maxFiles))
    ? Math.max(1, Math.min(10000, Number.parseInt(String(maxFiles), 10)))
    : 50;
  const maxAgeDaysInt = Number.isFinite(Number(maxAgeDays))
    ? Math.max(0, Math.min(3650, Number.parseInt(String(maxAgeDays), 10)))
    : 30;

  await ensureDir(backupDir);
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('arcana-state-') && entry.name.endsWith('.json'))
    .map((entry) => entry.name);

  const withStats = [];
  for (const fileName of files) {
    const filePath = path.join(backupDir, fileName);
    const stat = await fs.stat(filePath);
    withStats.push({
      fileName,
      filePath,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      mtime: stat.mtime.toISOString(),
    });
  }

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const now = Date.now();
  const byName = new Map(withStats.map((item) => [item.fileName, item]));
  const deleteReasonsByFile = new Map();

  if (maxAgeDaysInt > 0) {
    const maxAgeMs = maxAgeDaysInt * 24 * 60 * 60 * 1000;
    for (const item of withStats) {
      if (now - item.mtimeMs > maxAgeMs) {
        deleteReasonsByFile.set(item.fileName, 'max_age_days');
      }
    }
  }

  const keptAfterAge = withStats.filter((item) => !deleteReasonsByFile.has(item.fileName));
  if (keptAfterAge.length > maxFilesInt) {
    const overflow = keptAfterAge.slice(maxFilesInt);
    for (const item of overflow) {
      if (!deleteReasonsByFile.has(item.fileName)) {
        deleteReasonsByFile.set(item.fileName, 'max_files');
      }
    }
  }

  const deleted = [];
  for (const [fileName, reason] of deleteReasonsByFile.entries()) {
    const item = byName.get(fileName);
    if (!item) continue;
    if (!dryRun) {
      await fs.unlink(item.filePath);
    }
    deleted.push({
      fileName: item.fileName,
      filePath: item.filePath,
      sizeBytes: item.sizeBytes,
      mtime: item.mtime,
      reason,
    });
  }

  deleted.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return {
    dryRun: Boolean(dryRun),
    scannedCount: withStats.length,
    deletedCount: deleted.length,
    keptCount: withStats.length - deleted.length,
    settings: {
      maxFiles: maxFilesInt,
      maxAgeDays: maxAgeDaysInt,
    },
    deleted,
  };
}

async function inspectBackupRestore({ backupFilePath, stateFileMap }) {
  const payload = await readBackupBundle(backupFilePath);
  const backupStores = payload?.stores && typeof payload.stores === 'object' ? payload.stores : {};
  const targetStores = stateFileMap && typeof stateFileMap === 'object' ? stateFileMap : {};

  const stores = Object.entries(targetStores).map(([name, filePath]) => {
    const backupStore = backupStores[name] || null;
    const existsInBackup = Boolean(backupStore?.exists);
    const hasParseError = Boolean(backupStore?.parseError);

    return {
      name,
      filePath,
      backupFilePath: backupStore?.filePath || null,
      existsInBackup,
      parseError: backupStore?.parseError || null,
      backupSha256: backupStore?.sha256 || null,
      backupSizeBytes: Number(backupStore?.sizeBytes || 0),
      willRestore: existsInBackup && !hasParseError,
    };
  });

  const unknownStores = Object.keys(backupStores).filter(
    (name) => !Object.prototype.hasOwnProperty.call(targetStores, name)
  );

  return {
    format: payload.format,
    version: payload.version,
    createdAt: payload.createdAt || null,
    createdBy: payload.createdBy || null,
    unknownStores,
    stores,
  };
}

async function readBackupBundle(backupFilePath) {
  const raw = await fs.readFile(backupFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.format !== 'arcana_state_backup') {
    throw new Error('Ogiltigt backupformat.');
  }
  if (!parsed.stores || typeof parsed.stores !== 'object') {
    throw new Error('Backup saknar stores.');
  }
  return parsed;
}

async function writeJsonAtomic(filePath, data) {
  const directoryPath = path.dirname(filePath);
  await ensureDir(directoryPath);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function restoreFromBackup({ backupFilePath, stateFileMap }) {
  const payload = await readBackupBundle(backupFilePath);
  const result = [];

  for (const [name, filePath] of Object.entries(stateFileMap || {})) {
    const store = payload.stores[name];
    if (!store || !store.exists) {
      result.push({ name, filePath, restored: false, reason: 'missing_in_backup' });
      continue;
    }
    if (store.parseError) {
      result.push({ name, filePath, restored: false, reason: 'parse_error_in_backup' });
      continue;
    }
    await writeJsonAtomic(filePath, store.data ?? {});
    result.push({
      name,
      filePath,
      restored: true,
      sha256: sha256(JSON.stringify(store.data ?? {}, null, 2)),
    });
  }

  return {
    restoredAt: nowIso(),
    backupFilePath,
    stores: result,
  };
}

module.exports = {
  getStateFileMap,
  normalizeBackupFileName,
  resolveBackupFilePath,
  buildStateManifest,
  createStateBackup,
  listBackups,
  pruneBackups,
  inspectBackupRestore,
  readBackupBundle,
  restoreFromBackup,
};
