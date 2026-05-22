const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function isSchedulerPilotReportFileName(fileName) {
  return (
    typeof fileName === 'string' &&
    fileName.startsWith('Pilot_Scheduler_') &&
    fileName.endsWith('.json')
  );
}

async function listSchedulerPilotReports({ reportsDir, limit = 20 }) {
  const clampedLimit = normalizeLimit(limit, 20);
  await fs.mkdir(reportsDir, { recursive: true });
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isSchedulerPilotReportFileName(entry.name))
    .map((entry) => entry.name);

  const withStats = [];
  for (const fileName of files) {
    const filePath = path.join(reportsDir, fileName);
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

async function pruneSchedulerPilotReports({
  reportsDir,
  maxFiles = 60,
  maxAgeDays = 45,
  dryRun = false,
}) {
  const maxFilesInt = Number.isFinite(Number(maxFiles))
    ? Math.max(1, Math.min(10000, Number.parseInt(String(maxFiles), 10)))
    : 60;
  const maxAgeDaysInt = Number.isFinite(Number(maxAgeDays))
    ? Math.max(0, Math.min(3650, Number.parseInt(String(maxAgeDays), 10)))
    : 45;

  await fs.mkdir(reportsDir, { recursive: true });
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isSchedulerPilotReportFileName(entry.name))
    .map((entry) => entry.name);

  const withStats = [];
  for (const fileName of files) {
    const filePath = path.join(reportsDir, fileName);
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

module.exports = {
  isSchedulerPilotReportFileName,
  listSchedulerPilotReports,
  pruneSchedulerPilotReports,
};
