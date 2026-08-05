'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const {
  createMarketingWeeklyReportsStore,
  normalizeReport,
  resolveWeekBoundaries,
} = require('../../src/ops/marketingWeeklyReportsStore');

async function withTempStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-reports-'));
  const filePath = path.join(dir, 'reports.json');
  try {
    const store = createMarketingWeeklyReportsStore({ filePath });
    await run(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('resolveWeekBoundaries returns ISO week boundaries', () => {
  const boundaries = resolveWeekBoundaries('2026-W32');
  assert.equal(boundaries.periodStart, '2026-08-03');
  assert.equal(boundaries.periodEnd, '2026-08-09');
});

test('resolveWeekBoundaries returns null for invalid week', () => {
  assert.equal(resolveWeekBoundaries('invalid'), null);
  assert.equal(resolveWeekBoundaries('2026-W99'), null);
});

test('normalizeReport fills defaults and resolves boundaries', () => {
  const report = normalizeReport({
    tenantId: 'hair-tp-clinic',
    brand: 'hairtpclinic',
    week: '2026-W32',
  });
  assert.equal(report.tenantId, 'hair-tp-clinic');
  assert.equal(report.brand, 'hairtpclinic');
  assert.equal(report.week, '2026-W32');
  assert.equal(report.periodStart, '2026-08-03');
  assert.equal(report.periodEnd, '2026-08-09');
  assert.equal(report.status, 'draft');
  assert.equal(report.createdBy, 'agent');
  assert.ok(report.id);
  assert.ok(report.createdAt);
  assert.ok(report.updatedAt);
});

test('upsertReport creates a new report', async () => {
  await withTempStore(async (store) => {
    const item = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    assert.equal(item.brand, 'hairtpclinic');
    assert.equal(item.status, 'draft');

    const items = await store.listReports({ tenantId: 'hair-tp-clinic' });
    assert.equal(items.length, 1);
    assert.equal(items[0].week, '2026-W32');
  });
});

test('getReport returns stored report by id', async () => {
  await withTempStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const found = await store.getReport({ tenantId: 'hair-tp-clinic', id: created.id });
    assert.equal(found.id, created.id);
    assert.equal(found.week, '2026-W32');
  });
});

test('getReportByWeek returns the matching report', async () => {
  await withTempStore(async (store) => {
    await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const found = await store.getReportByWeek({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    assert.equal(found.week, '2026-W32');
  });
});

test('patchReport updates fields and preserves identity', async () => {
  await withTempStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const updated = await store.patchReport({
      tenantId: 'hair-tp-clinic',
      id: created.id,
      fields: { status: 'final', summary: 'Done' },
      changedBy: 'tester',
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.status, 'final');
    assert.equal(updated.summary, 'Done');
    assert.notEqual(updated.updatedAt, created.updatedAt);
  });
});

test('upsertReport updates existing report by id', async () => {
  await withTempStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const updated = await store.upsertReport({
      id: created.id,
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
      summary: 'Updated summary',
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.summary, 'Updated summary');
    const items = await store.listReports({ tenantId: 'hair-tp-clinic' });
    assert.equal(items.length, 1);
  });
});

test('replaceKpi updates a single channel block', async () => {
  await withTempStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const updated = await store.replaceKpi({
      tenantId: 'hair-tp-clinic',
      id: created.id,
      channel: 'gsc',
      data: { clicks: 100, impressions: 1000 },
    });
    assert.equal(updated.sections.kpi.gsc.clicks, 100);
    assert.equal(updated.sections.kpi.gsc.impressions, 1000);
  });
});

test('deleteReport removes report and returns it', async () => {
  await withTempStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const removed = await store.deleteReport({ tenantId: 'hair-tp-clinic', id: created.id });
    assert.equal(removed.id, created.id);
    const found = await store.getReport({ tenantId: 'hair-tp-clinic', id: created.id });
    assert.equal(found, null);
  });
});

test('listReports filters by brand, week and status', async () => {
  await withTempStore(async (store) => {
    await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    await store.upsertReport({ tenantId: 'hair-tp-clinic', brand: 'curatiio', week: '2026-W32' });
    await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W33',
    });

    const hairtp = await store.listReports({ tenantId: 'hair-tp-clinic', brand: 'hairtpclinic' });
    assert.equal(hairtp.length, 2);

    const w32 = await store.listReports({ tenantId: 'hair-tp-clinic', week: '2026-W32' });
    assert.equal(w32.length, 2);

    const draft = await store.listReports({ tenantId: 'hair-tp-clinic', status: 'draft' });
    assert.equal(draft.length, 3);
  });
});

test('store isolates tenants', async () => {
  await withTempStore(async (store) => {
    await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    await store.upsertReport({ tenantId: 'curatiio', brand: 'curatiio', week: '2026-W32' });

    const hairtp = await store.listReports({ tenantId: 'hair-tp-clinic' });
    assert.equal(hairtp.length, 1);
    assert.equal(hairtp[0].tenantId, 'hair-tp-clinic');
  });
});
