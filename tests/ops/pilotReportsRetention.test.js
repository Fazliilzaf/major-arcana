const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  isSchedulerPilotReportFileName,
  listSchedulerPilotReports,
  pruneSchedulerPilotReports,
} = require('../../src/ops/pilotReports');

test('isSchedulerPilotReportFileName matches scheduler JSON and rejects invalid names', () => {
  assert.equal(isSchedulerPilotReportFileName('Pilot_Scheduler_14d_20260101T000000Z.json'), true);
  assert.equal(isSchedulerPilotReportFileName('Pilot_Scheduler_7d_x.json'), true);
  assert.equal(isSchedulerPilotReportFileName('pilot_manual.json'), false);
  assert.equal(isSchedulerPilotReportFileName('Pilot_Scheduler_14d_x.txt'), false);
  assert.equal(isSchedulerPilotReportFileName(null), false);
  assert.equal(isSchedulerPilotReportFileName('pilot_scheduler_14d_x.json'), false);
  assert.equal(isSchedulerPilotReportFileName('Pilot_Scheduler_14d_x.JSON'), false);
  assert.equal(isSchedulerPilotReportFileName(''), false);
});

test('listSchedulerPilotReports returns newest files first and respects limit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-list-'));
  async function touch(name, mtimeMs) {
    const fp = path.join(dir, name);
    await fs.writeFile(fp, JSON.stringify({ name }), 'utf8');
    const t = new Date(mtimeMs);
    await fs.utimes(fp, t, t);
  }
  try {
    await touch('Pilot_Scheduler_14d_old.json', Date.now() - 60_000);
    await touch('Pilot_Scheduler_14d_mid.json', Date.now() - 30_000);
    await touch('Pilot_Scheduler_14d_new.json', Date.now() - 1000);
    const list = await listSchedulerPilotReports({ reportsDir: dir, limit: 2 });
    assert.equal(list.length, 2);
    assert.equal(list[0].fileName, 'Pilot_Scheduler_14d_new.json');
    assert.equal(list[1].fileName, 'Pilot_Scheduler_14d_mid.json');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneSchedulerPilotReports empty directory reports zero scans', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-empty-'));
  try {
    const out = await pruneSchedulerPilotReports({
      reportsDir: dir,
      maxFiles: 5,
      maxAgeDays: 0,
      dryRun: false,
    });
    assert.equal(out.scannedCount, 0);
    assert.equal(out.deletedCount, 0);
    assert.equal(out.keptCount, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneSchedulerPilotReports falls back to default maxFiles when NaN', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-nan-max-'));
  try {
    const out = await pruneSchedulerPilotReports({
      reportsDir: dir,
      maxFiles: Number.NaN,
      maxAgeDays: 0,
      dryRun: false,
    });
    assert.equal(out.settings.maxFiles, 60);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneSchedulerPilotReports enforces maxFiles by mtime and ignores non-scheduler files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-prune-'));
  const base = { report: true };

  async function writePilot(nameSuffix, mtimeMs) {
    const name = `Pilot_Scheduler_14d_${nameSuffix}.json`;
    const fp = path.join(dir, name);
    await fs.writeFile(fp, JSON.stringify({ ...base, name }), 'utf8');
    const touch = new Date(mtimeMs);
    await fs.utimes(fp, touch, touch);
  }

  await writePilot('oldest', Date.now() - 4 * 60 * 60 * 1000);
  await writePilot('mid', Date.now() - 2 * 60 * 60 * 1000);
  await writePilot('newest', Date.now() - 1 * 60 * 60 * 1000);
  await writePilot('fresh', Date.now() - 30 * 1000);

  await fs.writeFile(path.join(dir, 'noise.json'), JSON.stringify({ other: true }), 'utf8');

  const out = await pruneSchedulerPilotReports({
    reportsDir: dir,
    maxFiles: 2,
    maxAgeDays: 0,
    dryRun: false,
  });

  assert.equal(out.deletedCount, 2);
  assert.equal(out.keptCount, 2);
  const names = (await fs.readdir(dir)).sort();
  assert.deepEqual(
    names.filter((n) => n.startsWith('Pilot_Scheduler_')),
    ['Pilot_Scheduler_14d_fresh.json', 'Pilot_Scheduler_14d_newest.json'].sort()
  );
  assert.ok(names.includes('noise.json'));

  await fs.rm(dir, { recursive: true, force: true });
});

test('pruneSchedulerPilotReports dryRun does not delete', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-prune-dry-'));
  const fp = path.join(dir, 'Pilot_Scheduler_14d_old.json');
  await fs.writeFile(fp, '{}', 'utf8');
  const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
  await fs.utimes(fp, old, old);
  const out = await pruneSchedulerPilotReports({
    reportsDir: dir,
    maxFiles: 10,
    maxAgeDays: 30,
    dryRun: true,
  });
  assert.equal(out.dryRun, true);
  assert.equal(out.deletedCount, 1);
  await fs.access(fp);
  await fs.rm(dir, { recursive: true, force: true });
});

test('listSchedulerPilotReports clamps limit 0 up to 1', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-limit-zero-'));
  try {
    for (const [name, ageMs] of [
      ['Pilot_Scheduler_14d_a.json', Date.now() - 5000],
      ['Pilot_Scheduler_14d_b.json', Date.now() - 1000],
    ]) {
      const fp = path.join(dir, name);
      await fs.writeFile(fp, '{}', 'utf8');
      const t = new Date(ageMs);
      await fs.utimes(fp, t, t);
    }
    const list = await listSchedulerPilotReports({ reportsDir: dir, limit: 0 });
    assert.equal(list.length, 1);
    assert.equal(list[0].fileName, 'Pilot_Scheduler_14d_b.json');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('listSchedulerPilotReports NaN limit falls back to cap 20', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-limit-nan-'));
  try {
    for (let i = 0; i < 25; i += 1) {
      const name = `Pilot_Scheduler_14d_${String(i).padStart(3, '0')}.json`;
      const fp = path.join(dir, name);
      await fs.writeFile(fp, JSON.stringify({ i }), 'utf8');
      const t = new Date(Date.now() - i * 1000);
      await fs.utimes(fp, t, t);
    }
    const nanList = await listSchedulerPilotReports({ reportsDir: dir, limit: Number.NaN });
    assert.equal(nanList.length, 20);
    const wideList = await listSchedulerPilotReports({ reportsDir: dir, limit: 25 });
    assert.equal(wideList.length, 25);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneSchedulerPilotReports clamps maxFiles to 10000 and maxAgeDays to 3650', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-clamp-settings-'));
  try {
    const hi = await pruneSchedulerPilotReports({
      reportsDir: dir,
      maxFiles: 999_999,
      maxAgeDays: 20_000,
      dryRun: false,
    });
    assert.equal(hi.settings.maxFiles, 10_000);
    assert.equal(hi.settings.maxAgeDays, 3650);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneSchedulerPilotReports uses default maxAgeDays when NaN', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-age-nan-'));
  try {
    const out = await pruneSchedulerPilotReports({
      reportsDir: dir,
      maxFiles: 10,
      maxAgeDays: Number.NaN,
      dryRun: false,
    });
    assert.equal(out.settings.maxAgeDays, 45);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('pruneSchedulerPilotReports maps maxFiles 0 to minimum 1', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-maxfiles-zero-'));
  try {
    const out = await pruneSchedulerPilotReports({
      reportsDir: dir,
      maxFiles: 0,
      maxAgeDays: 0,
      dryRun: false,
    });
    assert.equal(out.settings.maxFiles, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('listSchedulerPilotReports klampar limit till högst 200', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pilot-limit-200-'));
  try {
    for (let i = 0; i < 205; i += 1) {
      const name = `Pilot_Scheduler_14d_${String(i).padStart(3, '0')}.json`;
      const fp = path.join(dir, name);
      await fs.writeFile(fp, '{}', 'utf8');
      const t = new Date(Date.now() - i * 50);
      await fs.utimes(fp, t, t);
    }
    const list = await listSchedulerPilotReports({ reportsDir: dir, limit: 300 });
    assert.equal(list.length, 200);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
