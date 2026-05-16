const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  inspectBackupRestore,
  readBackupBundle,
  restoreFromBackup,
} = require('../../src/ops/stateBackup');

function minimalBackupPayload(overrides = {}) {
  const base = {
    format: 'arcana_state_backup',
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'restore-drill-test',
    stores: {
      auth: {
        filePath: '/virtual/auth.json',
        exists: true,
        sizeBytes: 2,
        mtime: new Date().toISOString(),
        sha256: '00',
        parseError: null,
        data: { auditEvents: [] },
      },
      templates: {
        filePath: '/virtual/templates.json',
        exists: true,
        sizeBytes: 2,
        mtime: new Date().toISOString(),
        sha256: '11',
        parseError: null,
        data: { versions: {} },
      },
    },
  };
  return { ...base, ...overrides, stores: { ...base.stores, ...(overrides.stores || {}) } };
}

test('inspectBackupRestore flags willRestore and unknownStores', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-restore-inspect-'));
  const backupPath = path.join(dir, 'arcana-state-20260101-000001.json');
  const payload = minimalBackupPayload({
    stores: {
      ...minimalBackupPayload().stores,
      orphan: {
        filePath: '/virtual/orphan.json',
        exists: true,
        sizeBytes: 1,
        mtime: new Date().toISOString(),
        sha256: 'aa',
        parseError: null,
        data: {},
      },
    },
  });
  await fs.writeFile(backupPath, JSON.stringify(payload), 'utf8');

  const authLive = path.join(dir, 'live-auth.json');
  const templatesLive = path.join(dir, 'live-templates.json');
  await fs.writeFile(authLive, '{}', 'utf8');
  await fs.writeFile(templatesLive, '{}', 'utf8');

  const preview = await inspectBackupRestore({
    backupFilePath: backupPath,
    stateFileMap: {
      auth: authLive,
      templates: templatesLive,
    },
  });

  assert.equal(preview.format, 'arcana_state_backup');
  assert.deepEqual(preview.unknownStores.sort(), ['orphan']);
  const byName = Object.fromEntries(preview.stores.map((s) => [s.name, s]));
  assert.equal(byName.auth.existsInBackup, true);
  assert.equal(byName.auth.willRestore, true);
  assert.equal(byName.templates.existsInBackup, true);
  assert.equal(byName.templates.willRestore, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('inspectBackupRestore willRestore false when backup store has parseError', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-restore-parse-'));
  const backupPath = path.join(dir, 'arcana-state-20260101-000002.json');
  const payload = minimalBackupPayload({
    stores: {
      auth: {
        filePath: '/virtual/auth.json',
        exists: true,
        sizeBytes: 1,
        mtime: new Date().toISOString(),
        sha256: 'bad',
        parseError: 'Unexpected token',
        data: null,
      },
    },
  });
  await fs.writeFile(backupPath, JSON.stringify(payload), 'utf8');

  const authLive = path.join(dir, 'live-auth.json');
  await fs.writeFile(authLive, '{}', 'utf8');

  const preview = await inspectBackupRestore({
    backupFilePath: backupPath,
    stateFileMap: { auth: authLive },
  });

  const row = preview.stores[0];
  assert.equal(row.name, 'auth');
  assert.equal(row.existsInBackup, true);
  assert.equal(row.parseError, 'Unexpected token');
  assert.equal(row.willRestore, false);

  await fs.rm(dir, { recursive: true, force: true });
});

test('restoreFromBackup writes backup data to temp paths and skips parse_error_in_backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-restore-write-'));
  const backupPath = path.join(dir, 'arcana-state-20260101-000003.json');
  const goodData = { hello: 'world' };
  const payload = minimalBackupPayload({
    stores: {
      auth: {
        filePath: '/virtual/auth.json',
        exists: true,
        sizeBytes: 10,
        mtime: new Date().toISOString(),
        sha256: 'ok',
        parseError: null,
        data: goodData,
      },
      templates: {
        filePath: '/virtual/templates.json',
        exists: true,
        sizeBytes: 1,
        mtime: new Date().toISOString(),
        sha256: 'x',
        parseError: 'broken json in source',
        data: null,
      },
    },
  });
  await fs.writeFile(backupPath, JSON.stringify(payload), 'utf8');

  const authOut = path.join(dir, 'out-auth.json');
  const templatesOut = path.join(dir, 'out-templates.json');
  const memoryOut = path.join(dir, 'out-memory.json');

  const restore = await restoreFromBackup({
    backupFilePath: backupPath,
    stateFileMap: {
      auth: authOut,
      templates: templatesOut,
      memory: memoryOut,
    },
  });

  const byName = Object.fromEntries(restore.stores.map((s) => [s.name, s]));
  assert.equal(byName.auth.restored, true);
  const rawAuth = JSON.parse(await fs.readFile(authOut, 'utf8'));
  assert.deepEqual(rawAuth, goodData);

  assert.equal(byName.templates.restored, false);
  assert.equal(byName.templates.reason, 'parse_error_in_backup');

  assert.equal(byName.memory.restored, false);
  assert.equal(byName.memory.reason, 'missing_in_backup');

  await fs.rm(dir, { recursive: true, force: true });
});

test('readBackupBundle rejects non-arcana payload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-restore-badfmt-'));
  const backupPath = path.join(dir, 'arcana-state-20260101-000004.json');
  await fs.writeFile(backupPath, JSON.stringify({ format: 'other', stores: {} }), 'utf8');

  await assert.rejects(() => readBackupBundle(backupPath), /Ogiltigt backupformat/);

  await fs.rm(dir, { recursive: true, force: true });
});
