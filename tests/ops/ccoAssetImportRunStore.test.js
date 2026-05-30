'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoAssetImportRunStore,
  VALID_SOURCE_SYSTEMS,
  VALID_MODES,
  COUNTER_NAMES,
} = require('../../src/ops/ccoAssetImportRunStore');

function makeMemoryAuditLog() {
  const events = [];
  return { events, append: (e) => events.push(e) };
}

async function makeStore() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-asset-run-store-'));
  const filePath = path.join(tmp, 'cco-asset-import-runs.json');
  const audit = makeMemoryAuditLog();
  const store = await createCcoAssetImportRunStore({ filePath, auditLog: audit });
  return { tmp, filePath, audit, store };
}

test('exports canonical enums per owner-spec', () => {
  assert.deepEqual([...VALID_SOURCE_SYSTEMS].sort(), ['drive', 'meridiq', 'old_cco']);
  assert.deepEqual([...VALID_MODES].sort(), ['full', 'incremental', 'review_resolve']);
  assert.equal(COUNTER_NAMES.length, 6);
  assert.ok(COUNTER_NAMES.includes('totalLinkOnlyBlockers'));
});

test('startRun returns UUID, persists, and emits asset.import_run_started', async () => {
  const { tmp, store, audit, filePath } = await makeStore();
  try {
    const runId = await store.startRun({
      sourceSystem: 'drive',
      mode: 'full',
      createdBy: 'owner-1',
    });
    assert.ok(runId);
    assert.match(
      runId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    const run = store.getRun(runId);
    assert.equal(run.sourceSystem, 'drive');
    assert.equal(run.mode, 'full');
    assert.equal(run.totalDiscovered, 0);
    assert.equal(run.finishedAt, null);
    assert.equal(run.createdBy, 'owner-1');

    const ev = audit.events.find((e) => e.action === 'asset.import_run_started');
    assert.ok(ev);
    assert.equal(ev.detail.sourceSystem, 'drive');
    assert.equal(ev.target.kind, 'asset_import_run');

    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(Object.keys(raw.items).length, 1);
    assert.equal(raw.schemaVersion, '1.0.0');

    // invalid enum rejects
    await assert.rejects(
      () => store.startRun({ sourceSystem: 'sharepoint', mode: 'full' }),
      /invalid sourceSystem/
    );
    await assert.rejects(
      () => store.startRun({ sourceSystem: 'drive', mode: 'banana' }),
      /invalid mode/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('incrementCounter only accepts known counters and rejects closed runs', async () => {
  const { tmp, store } = await makeStore();
  try {
    const runId = await store.startRun({ sourceSystem: 'meridiq', mode: 'incremental' });
    await store.incrementCounter(runId, 'totalDiscovered', 5);
    await store.incrementCounter(runId, 'totalImported');
    await store.incrementCounter(runId, 'totalLinkOnlyBlockers', 3);

    const run = store.getRun(runId);
    assert.equal(run.totalDiscovered, 5);
    assert.equal(run.totalImported, 1);
    assert.equal(run.totalLinkOnlyBlockers, 3);

    await assert.rejects(
      () => store.incrementCounter(runId, 'totalBananas', 1),
      /invalid counter/
    );
    await assert.rejects(
      () => store.incrementCounter('nope', 'totalDiscovered', 1),
      /hittades inte/
    );
    await assert.rejects(
      () => store.incrementCounter(runId, 'totalImported', 'NaN'),
      /numerisk/
    );

    await store.finishRun(runId);
    await assert.rejects(
      () => store.incrementCounter(runId, 'totalImported', 1),
      /redan stängd/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('finishRun sets finishedAt, is idempotent, emits asset.import_run_finished', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const runId = await store.startRun({ sourceSystem: 'old_cco', mode: 'review_resolve' });
    await store.incrementCounter(runId, 'totalDiscovered', 10);
    await store.incrementCounter(runId, 'totalImported', 7);
    const finished = await store.finishRun(runId);
    assert.ok(finished.finishedAt);
    // Idempotent
    const again = await store.finishRun(runId);
    assert.equal(again.finishedAt, finished.finishedAt);

    const ev = audit.events.find((e) => e.action === 'asset.import_run_finished');
    assert.ok(ev);
    assert.equal(ev.detail.totalDiscovered, 10);
    assert.equal(ev.detail.totalImported, 7);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('listRecentRuns sorts desc by startedAt and stats counts active vs finished', async () => {
  const { tmp, store } = await makeStore();
  try {
    const r1 = await store.startRun({ sourceSystem: 'drive', mode: 'full' });
    // ensure ordering with a tiny wait
    await new Promise((res) => setTimeout(res, 5));
    const r2 = await store.startRun({ sourceSystem: 'meridiq', mode: 'incremental' });
    await store.finishRun(r1);

    const recent = store.listRecentRuns();
    assert.equal(recent.length, 2);
    // r2 is newer => first
    assert.equal(recent[0].id, r2);
    assert.equal(recent[1].id, r1);

    const s = store.stats();
    assert.equal(s.total, 2);
    assert.equal(s.active, 1);
    assert.equal(s.finished, 1);
    assert.equal(s.bySourceSystem.drive, 1);
    assert.equal(s.bySourceSystem.meridiq, 1);
    assert.equal(s.byMode.full, 1);
    assert.equal(s.byMode.incremental, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('store persists across re-open', async () => {
  const { tmp, store, filePath } = await makeStore();
  try {
    const id = await store.startRun({ sourceSystem: 'drive', mode: 'full' });
    await store.incrementCounter(id, 'totalImported', 42);
    const re = await createCcoAssetImportRunStore({ filePath });
    assert.equal(re.getRun(id).totalImported, 42);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
