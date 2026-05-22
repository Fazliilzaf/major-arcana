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

test('startup disk guard prunes stale oversize backup files', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-oversize-bak-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const staleBakPath = path.join(stateRoot, 'memory.json.oversize.bak');

  await createFile(staleBakPath, JSON.stringify({ stale: true }));
  const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await fs.utimes(staleBakPath, staleAt, staleAt);

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

  assert.equal(summary.stateGuardBackups.deletedCount, 1);
  await assert.rejects(fs.stat(staleBakPath), (error) => error && error.code === 'ENOENT');
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('startup disk guard utan config loggar fel och avslutar tidigt', async () => {
  const summary = await runStartupDiskGuard({ config: null, logger: { warn() {} } });
  assert.equal(summary.errors.length >= 1, true);
  assert.ok(summary.errors.some((e) => e.scope === 'startup_disk_guard'));
  assert.equal(summary.stateFiles, null);
});

test('startup disk guard avvisar icke-objekt config', async () => {
  for (const bad of [undefined, 'path-only', 42]) {
    const summary = await runStartupDiskGuard({ config: bad, logger: { warn() {} } });
    assert.ok(summary.errors.some((e) => e.scope === 'startup_disk_guard'), String(bad));
    assert.equal(summary.stateFiles, null);
  }
});

test('startup disk guard tar bort gamla .tmp oavsett versaler och lämnar färska .tmp', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-tmp-cases-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const staleUpper = path.join(stateRoot, 'draft.TMP');
  const freshLower = path.join(stateRoot, 'active.tmp');

  await createFile(staleUpper, 'stale');
  const staleAt = new Date(Date.now() - 10 * 60 * 1000);
  await fs.utimes(staleUpper, staleAt, staleAt);

  await createFile(freshLower, 'fresh');
  const now = new Date();
  await fs.utimes(freshLower, now, now);

  const summary = await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir,
      reportsDir,
      backupRetentionMaxFiles: 10,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 10,
      reportRetentionMaxAgeDays: 365,
    },
    logger: { warn() {} },
  });

  assert.ok(summary.tempFiles.deletedCount >= 1);
  await assert.rejects(fs.stat(staleUpper), (error) => error && error.code === 'ENOENT');
  await fs.stat(freshLower);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('startup disk guard skippar state file guard när startupStateFileGuardEnabled är false', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-guard-off-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const analysisPath = path.join(stateRoot, 'capability-analysis.json');
  await createFile(analysisPath, JSON.stringify({ entries: new Array(500).fill({ x: 1 }) }));

  const summary = await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir,
      reportsDir,
      capabilityAnalysisStorePath: analysisPath,
      startupStateFileGuardEnabled: false,
      startupCapabilityAnalysisStoreMaxBytes: 64,
      backupRetentionMaxFiles: 10,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 10,
      reportRetentionMaxAgeDays: 365,
    },
    logger: { warn() {} },
  });

  assert.equal(summary.stateFiles.enabled, false);
  assert.equal(summary.stateFiles.checkedCount, 0);
  assert.equal(summary.stateFiles.sanitizedCount, 0);
  const raw = await fs.readFile(analysisPath, 'utf8');
  assert.ok(JSON.parse(raw).entries.length >= 400);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('startup disk guard deduplicerar skannade kataloger när stateRoot och backupDir är samma', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-dedupe-'));
  const stateRoot = path.join(tempDir, 'state');
  const reportsDir = path.join(stateRoot, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });

  const summary = await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir: stateRoot,
      reportsDir,
      backupRetentionMaxFiles: 10,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 10,
      reportRetentionMaxAgeDays: 365,
    },
    logger: { warn() {} },
  });

  const dirs = summary.tempFiles.scannedDirectories;
  assert.equal(new Set(dirs).size, dirs.length);
  assert.equal(dirs.length, 2);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('startup disk guard raderar inte färska oversize.bak-filer', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-fresh-bak-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const freshBak = path.join(stateRoot, 'memory.json.oversize.bak');
  await createFile(freshBak, '{}');
  const now = new Date();
  await fs.utimes(freshBak, now, now);

  const summary = await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir,
      reportsDir,
      backupRetentionMaxFiles: 10,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 10,
      reportRetentionMaxAgeDays: 365,
    },
    logger: { warn() {} },
  });

  assert.equal(summary.stateGuardBackups.deletedCount, 0);
  await fs.stat(freshBak);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('startup disk guard raderar inte gamla filer som inte slutar på .tmp', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-startup-notmp-'));
  const stateRoot = path.join(tempDir, 'state');
  const backupDir = path.join(stateRoot, 'backups');
  const reportsDir = path.join(stateRoot, 'reports');
  const other = path.join(stateRoot, 'keep-old.txt');
  await createFile(other, 'x');
  const staleAt = new Date(Date.now() - 10 * 60 * 1000);
  await fs.utimes(other, staleAt, staleAt);

  await runStartupDiskGuard({
    config: {
      stateRoot,
      backupDir,
      reportsDir,
      backupRetentionMaxFiles: 10,
      backupRetentionMaxAgeDays: 365,
      reportRetentionMaxFiles: 10,
      reportRetentionMaxAgeDays: 365,
    },
    logger: { warn() {} },
  });

  await fs.stat(other);

  await fs.rm(tempDir, { recursive: true, force: true });
});
