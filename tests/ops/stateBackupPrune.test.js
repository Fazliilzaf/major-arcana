const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeBackupFileName,
  pruneBackups,
  getStateFileMap,
  resolveBackupFilePath,
  createStateBackup,
  listBackups,
  readBackupBundle,
  inspectBackupRestore,
  restoreFromBackup,
  buildStateManifest,
} = require('../../src/ops/stateBackup');

test('normalizeBackupFileName accepts arcana-state JSON only', () => {
  assert.equal(normalizeBackupFileName('arcana-state-20260101-120000.json'), 'arcana-state-20260101-120000.json');
  assert.throws(() => normalizeBackupFileName('other.json'), /Ogiltigt/);
  assert.throws(() => normalizeBackupFileName('arcana-state-bad name.json'), /otillåtna/i);
});

test('normalizeBackupFileName trimmar giltigt filnamn', () => {
  assert.equal(
    normalizeBackupFileName('  arcana-state-20260101-120000.json  '),
    'arcana-state-20260101-120000.json'
  );
});

test('normalizeBackupFileName returnerar tom sträng för bara whitespace', () => {
  assert.equal(normalizeBackupFileName('   '), '');
  assert.equal(normalizeBackupFileName('\t'), '');
});

test('resolveBackupFilePath trimmar fileName vid join', () => {
  const joined = resolveBackupFilePath({
    backupDir: '/tmp/backups',
    fileName: '  arcana-state-20260201-153045.json  ',
  });
  assert.equal(joined, path.join('/tmp/backups', 'arcana-state-20260201-153045.json'));
});

test('pruneBackups keeps newest arcana-state files up to maxFiles', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-prune-'));

  async function writeBackup(suffix, mtimeMs) {
    const name = `arcana-state-20260101-${suffix}.json`;
    const fp = path.join(dir, name);
    await fs.writeFile(fp, JSON.stringify({ ok: true, suffix }), 'utf8');
    const touch = new Date(mtimeMs);
    await fs.utimes(fp, touch, touch);
  }

  await writeBackup('000001', Date.now() - 5 * 60 * 60 * 1000);
  await writeBackup('000002', Date.now() - 3 * 60 * 60 * 1000);
  await writeBackup('000003', Date.now() - 1 * 60 * 60 * 1000);
  await writeBackup('000004', Date.now() - 10 * 1000);

  await fs.writeFile(path.join(dir, 'readme.txt'), 'keep', 'utf8');

  const out = await pruneBackups({
    backupDir: dir,
    maxFiles: 2,
    maxAgeDays: 0,
    dryRun: false,
  });

  assert.equal(out.deletedCount, 2);
  assert.equal(out.keptCount, 2);
  const names = (await fs.readdir(dir)).sort();
  assert.deepEqual(
    names.filter((n) => n.startsWith('arcana-state-')),
    ['arcana-state-20260101-000003.json', 'arcana-state-20260101-000004.json'].sort()
  );
  assert.ok(names.includes('readme.txt'));

  await fs.rm(dir, { recursive: true, force: true });
});

test('pruneBackups dryRun reports age-based deletes without unlink', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-prune-dry-'));
  const fp = path.join(dir, 'arcana-state-19990101-000000.json');
  await fs.writeFile(fp, '{}', 'utf8');
  const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
  await fs.utimes(fp, old, old);

  const out = await pruneBackups({
    backupDir: dir,
    maxFiles: 10,
    maxAgeDays: 30,
    dryRun: true,
  });

  assert.equal(out.dryRun, true);
  assert.equal(out.deletedCount, 1);
  await fs.access(fp);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getStateFileMap drops empty paths and keeps configured stores', () => {
  const map = getStateFileMap({
    authStorePath: '/data/auth.json',
    templateStorePath: '',
    tenantConfigStorePath: '  /data/tenant.json  ',
    memoryStorePath: null,
    ccoHistoryStorePath: '/data/history.json',
    ccoNoteStorePath: undefined,
  });
  assert.equal(map.auth, '/data/auth.json');
  assert.equal(map.tenantConfig, '  /data/tenant.json  ');
  assert.equal(map.ccoHistory, '/data/history.json');
  assert.equal(map.templates, undefined);
  assert.equal(map.ccoNotes, undefined);
});

test('resolveBackupFilePath joins backupDir with validated fileName', () => {
  const joined = resolveBackupFilePath({
    backupDir: '/var/backups/arcana',
    fileName: 'arcana-state-20260201-153045.json',
  });
  assert.equal(joined, path.join('/var/backups/arcana', 'arcana-state-20260201-153045.json'));
});

test('resolveBackupFilePath throws when fileName missing', () => {
  assert.throws(
    () => resolveBackupFilePath({ backupDir: '/tmp', fileName: '' }),
    /fileName saknas/i,
  );
});

test('createStateBackup captures store metadata and listBackups returns newest first', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-create-'));
  const backupDir = path.join(dir, 'backups');
  const stateA = path.join(dir, 'auth.json');
  const stateB = path.join(dir, 'tenant.json');
  await fs.writeFile(stateA, JSON.stringify({ a: 1 }), 'utf8');
  await fs.writeFile(stateB, JSON.stringify({ b: 2 }), 'utf8');

  const first = await createStateBackup({
    stateFileMap: { auth: stateA, tenantConfig: stateB },
    backupDir,
    createdBy: 'test',
  });
  await new Promise((r) => setTimeout(r, 5));
  await createStateBackup({
    stateFileMap: { auth: stateA, tenantConfig: stateB },
    backupDir,
    createdBy: 'test',
  });

  assert.equal(first.fileName.startsWith('arcana-state-'), true);
  assert.equal(first.stores.length, 2);

  const listed = await listBackups({ backupDir, limit: 1 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].fileName.startsWith('arcana-state-'), true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readBackupBundle rejects invalid backup format', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-invalid-'));
  const fp = path.join(dir, 'arcana-state-bad.json');
  await fs.writeFile(fp, JSON.stringify({ format: 'wrong', stores: {} }), 'utf8');
  await assert.rejects(() => readBackupBundle(fp), /Ogiltigt backupformat/i);
  await fs.rm(dir, { recursive: true, force: true });
});

test('inspectBackupRestore and restoreFromBackup report missing stores correctly', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-restore-'));
  const backupDir = path.join(dir, 'backups');
  const authPath = path.join(dir, 'auth.json');
  const tenantPath = path.join(dir, 'tenant.json');
  await fs.writeFile(authPath, JSON.stringify({ auth: true }, null, 2), 'utf8');

  const backup = await createStateBackup({
    stateFileMap: { auth: authPath },
    backupDir,
    createdBy: 'test',
  });

  const inspect = await inspectBackupRestore({
    backupFilePath: backup.filePath,
    stateFileMap: { auth: authPath, tenantConfig: tenantPath },
  });
  const tenantInspect = inspect.stores.find((s) => s.name === 'tenantConfig');
  assert.equal(tenantInspect.existsInBackup, false);
  assert.equal(tenantInspect.willRestore, false);

  await fs.writeFile(authPath, JSON.stringify({ auth: false }, null, 2), 'utf8');
  const restored = await restoreFromBackup({
    backupFilePath: backup.filePath,
    stateFileMap: { auth: authPath, tenantConfig: tenantPath },
  });
  const authRow = restored.stores.find((s) => s.name === 'auth');
  const tenantRow = restored.stores.find((s) => s.name === 'tenantConfig');
  assert.equal(authRow.restored, true);
  assert.equal(tenantRow.restored, false);
  assert.equal(tenantRow.reason, 'missing_in_backup');

  await fs.rm(dir, { recursive: true, force: true });
});

test('createStateBackup rejects missing backupDir', async () => {
  await assert.rejects(
    () => createStateBackup({ stateFileMap: { a: '/tmp/x.json' }, backupDir: '' }),
    /backupDir saknas/i
  );
});

test('readBackupBundle rejects backup without stores object', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-no-stores-'));
  const fp = path.join(dir, 'arcana-state-no-stores.json');
  await fs.writeFile(
    fp,
    JSON.stringify({ format: 'arcana_state_backup', version: 1, stores: null }),
    'utf8'
  );
  await assert.rejects(() => readBackupBundle(fp), /Backup saknar stores/i);
  await fs.rm(dir, { recursive: true, force: true });
});

test('buildStateManifest reports exists, sha256 and parseError per store file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-manifest-'));
  const good = path.join(dir, 'good.json');
  const missing = path.join(dir, 'missing.json');
  const bad = path.join(dir, 'bad.json');
  await fs.writeFile(good, JSON.stringify({ ok: true }, null, 2), 'utf8');
  await fs.writeFile(bad, '{broken-json', 'utf8');
  const manifest = await buildStateManifest({
    stateFileMap: { goodStore: good, missingStore: missing, badStore: bad },
  });
  assert.ok(manifest.generatedAt);
  assert.equal(manifest.stores.length, 3);
  const goodRow = manifest.stores.find((s) => s.name === 'goodStore');
  assert.equal(goodRow.exists, true);
  assert.equal(goodRow.parseError, null);
  assert.equal(typeof goodRow.sha256, 'string');
  assert.equal(goodRow.sha256.length, 64);
  const miss = manifest.stores.find((s) => s.name === 'missingStore');
  assert.equal(miss.exists, false);
  assert.equal(miss.sha256, null);
  const badRow = manifest.stores.find((s) => s.name === 'badStore');
  assert.equal(badRow.exists, true);
  assert.ok(badRow.parseError);
  await fs.rm(dir, { recursive: true, force: true });
});

test('listBackups clamps limit between 1 and 200', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-list-limit-'));
  for (let i = 0; i < 3; i += 1) {
    const fp = path.join(dir, `arcana-state-2026010${i}-12000${i}.json`);
    await fs.writeFile(fp, '{}', 'utf8');
  }
  const all = await listBackups({ backupDir: dir, limit: 9999 });
  assert.equal(all.length, 3);
  const slice = await listBackups({ backupDir: dir, limit: 2 });
  assert.equal(slice.length, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test('inspectBackupRestore and restoreFromBackup handle parse_error_in_backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-parse-err-'));
  const corrupt = path.join(dir, 'corrupt.json');
  const okSource = path.join(dir, 'ok-source.json');
  await fs.writeFile(corrupt, '{ not json', 'utf8');
  await fs.writeFile(okSource, JSON.stringify({ restored: true }, null, 2), 'utf8');
  const backup = await createStateBackup({
    stateFileMap: { bad: corrupt, ok: okSource },
    backupDir: path.join(dir, 'bk'),
    createdBy: 'test',
  });
  const outBad = path.join(dir, 'out-bad.json');
  const outOk = path.join(dir, 'out-ok.json');
  await fs.writeFile(outOk, JSON.stringify({ before: 1 }), 'utf8');

  const inspect = await inspectBackupRestore({
    backupFilePath: backup.filePath,
    stateFileMap: { bad: outBad, ok: outOk },
  });
  const badIns = inspect.stores.find((s) => s.name === 'bad');
  assert.equal(badIns.existsInBackup, true);
  assert.equal(badIns.willRestore, false);

  const restored = await restoreFromBackup({
    backupFilePath: backup.filePath,
    stateFileMap: { bad: outBad, ok: outOk },
  });
  const badRow = restored.stores.find((s) => s.name === 'bad');
  const okRow = restored.stores.find((s) => s.name === 'ok');
  assert.equal(badRow.restored, false);
  assert.equal(badRow.reason, 'parse_error_in_backup');
  assert.equal(okRow.restored, true);
  const diskOk = JSON.parse(await fs.readFile(outOk, 'utf8'));
  assert.equal(diskOk.restored, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listBackups clamps limit 0 up to 1', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-list-zero-'));
  try {
    for (const [name, ageMs] of [
      ['arcana-state-20260101-000099.json', Date.now() - 5000],
      ['arcana-state-20260101-000100.json', Date.now() - 1000],
    ]) {
      const fp = path.join(dir, name);
      await fs.writeFile(fp, '{}', 'utf8');
      const t = new Date(ageMs);
      await fs.utimes(fp, t, t);
    }
    const list = await listBackups({ backupDir: dir, limit: 0 });
    assert.equal(list.length, 1);
    assert.equal(list[0].fileName, 'arcana-state-20260101-000100.json');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('listBackups NaN limit falls back to cap 20', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-list-nan-'));
  try {
    for (let i = 0; i < 25; i += 1) {
      const name = `arcana-state-202602${String(i).padStart(2, '0')}-120${String(i).padStart(3, '0')}.json`;
      const fp = path.join(dir, name);
      await fs.writeFile(fp, JSON.stringify({ i }), 'utf8');
      const t = new Date(Date.now() - i * 1000);
      await fs.utimes(fp, t, t);
    }
    const nanList = await listBackups({ backupDir: dir, limit: Number.NaN });
    assert.equal(nanList.length, 20);
    const wideList = await listBackups({ backupDir: dir, limit: 25 });
    assert.equal(wideList.length, 25);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneBackups clamps maxFiles to 10000 and maxAgeDays to 3650', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-prune-clamp-'));
  try {
    const out = await pruneBackups({
      backupDir: dir,
      maxFiles: 999_999,
      maxAgeDays: 20_000,
      dryRun: false,
    });
    assert.equal(out.settings.maxFiles, 10_000);
    assert.equal(out.settings.maxAgeDays, 3650);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneBackups uses default maxAgeDays when NaN', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-age-nan-'));
  try {
    const out = await pruneBackups({
      backupDir: dir,
      maxFiles: 10,
      maxAgeDays: Number.NaN,
      dryRun: false,
    });
    assert.equal(out.settings.maxAgeDays, 30);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneBackups maps maxFiles 0 to minimum 1', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-maxfiles-zero-'));
  try {
    const out = await pruneBackups({
      backupDir: dir,
      maxFiles: 0,
      maxAgeDays: 0,
      dryRun: false,
    });
    assert.equal(out.settings.maxFiles, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneBackups falls back to default maxFiles when NaN', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-backup-maxfiles-nan-'));
  try {
    const out = await pruneBackups({
      backupDir: dir,
      maxFiles: Number.NaN,
      maxAgeDays: 0,
      dryRun: false,
    });
    assert.equal(out.settings.maxFiles, 50);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
