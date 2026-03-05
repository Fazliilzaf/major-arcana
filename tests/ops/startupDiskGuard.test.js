const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runStartupDiskGuard } = require('../../src/ops/startupDiskGuard');

async function createFile(filePath, content = '{}') {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

test('startup disk guard prunes backups/reports and clears stale tmp files', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-disk-guard-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const authTmpPath = path.join(stateRoot, 'auth.json.1234.test.tmp');

  await createFile(path.join(backupDir, 'arcana-state-20260101-000001.json'));
  await createFile(path.join(backupDir, 'arcana-state-20260101-000002.json'));
  await createFile(path.join(backupDir, 'arcana-state-20260101-000003.json'));

  await createFile(path.join(reportsDir, 'Pilot_Scheduler_20260101-000001.json'));
  await createFile(path.join(reportsDir, 'Pilot_Scheduler_20260101-000002.json'));
  await createFile(path.join(reportsDir, 'Pilot_Scheduler_20260101-000003.json'));

  await createFile(authTmpPath, 'temporary');
  const staleAt = new Date(Date.now() - 10 * 60 * 1000);
  await fs.utimes(authTmpPath, staleAt, staleAt);

  const summary = await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir,
      reportsDir,
      backupRetentionMaxFiles: 1,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 1,
      reportRetentionMaxAgeDays: 365,
    },
    logger: {
      warn() {},
    },
  });

  assert.equal(summary.backupPrune.deletedCount, 2);
  assert.equal(summary.reportPrune.deletedCount, 2);
  assert.equal(summary.tempFiles.deletedCount >= 1, true);

  await assert.rejects(fs.stat(authTmpPath), (error) => error && error.code === 'ENOENT');
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('startup disk guard sanitizes oversized state files before boot', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-state-guard-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const analysisPath = path.join(stateRoot, 'capability-analysis.json');

  await createFile(analysisPath, JSON.stringify({ entries: new Array(2000).fill({ a: 'b' }) }));

  const summary = await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir,
      reportsDir,
      capabilityAnalysisStorePath: analysisPath,
      startupStateFileGuardEnabled: true,
      startupCapabilityAnalysisStoreMaxBytes: 512,
      backupRetentionMaxFiles: 1,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 1,
      reportRetentionMaxAgeDays: 365,
    },
    logger: {
      warn() {},
    },
  });

  assert.equal(summary.stateFiles.sanitizedCount, 1);
  const sanitized = summary.stateFiles.sanitized[0] || {};
  assert.equal(sanitized.scope, 'capability_analysis_store');
  assert.equal(Boolean(sanitized.backupPath), true);

  const sanitizedRaw = await fs.readFile(analysisPath, 'utf8');
  const sanitizedJson = JSON.parse(sanitizedRaw);
  assert.equal(Array.isArray(sanitizedJson.entries), true);
  assert.equal(sanitizedJson.entries.length, 0);

  await fs.stat(`${analysisPath}.oversize.bak`);
  await fs.rm(tempDir, { recursive: true, force: true });
});
