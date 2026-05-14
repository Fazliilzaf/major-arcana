const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createMessageIntelligenceStore } = require('../../src/ops/messageIntelligenceStore');

test('upsertEnrichment and getEnrichment round-trip; bad keys return null', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  assert.equal(await store.upsertEnrichment({ tenantId: '', mailboxId: 'm', graphMessageId: 'g', enrichment: {} }), null);
  assert.equal(store.getEnrichment({ tenantId: 't1', mailboxId: 'm1', graphMessageId: '' }), null);

  const merged = await store.upsertEnrichment({
    tenantId: 't1',
    mailboxId: 'mb@x.se',
    graphMessageId: 'gm-1',
    source: 'backfill',
    enrichment: { engineVersion: 'det-1.0.0', tone: { tone: 'neutral' } },
  });
  assert.equal(merged.source, 'backfill');
  assert.equal(merged.engineVersion, 'det-1.0.0');

  const got = store.getEnrichment({ tenantId: 't1', mailboxId: 'mb@x.se', graphMessageId: 'gm-1' });
  assert.equal(got.tone.tone, 'neutral');

  await store.flush();
  await fs.rm(dir, { recursive: true, force: true });
});

test('listEnrichments and countEnrichments respect tenant and mailbox filters', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel2-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  await store.upsertEnrichment({
    tenantId: 'ta',
    mailboxId: 'box-a',
    graphMessageId: 'g1',
    enrichment: { x: 1 },
  });
  await store.upsertEnrichment({
    tenantId: 'ta',
    mailboxId: 'box-b',
    graphMessageId: 'g2',
    enrichment: { x: 2 },
  });
  await store.upsertEnrichment({
    tenantId: 'tb',
    mailboxId: 'box-a',
    graphMessageId: 'g3',
    enrichment: { x: 3 },
  });

  assert.equal(store.countEnrichments({ tenantId: 'ta' }), 2);
  assert.equal(store.countEnrichments({}), 3);

  const limited = store.listEnrichments({ tenantId: 'ta', mailboxIds: ['box-a'], limit: 10 });
  assert.equal(limited.length, 1);
  assert.equal(limited[0].graphMessageId, 'g1');

  await fs.rm(dir, { recursive: true, force: true });
});

test('recordRun updates backfill vs delta timestamps; blank tenant returns null', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel3-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  assert.equal(await store.recordRun({ tenantId: '  ', processed: 1 }), null);

  await store.recordRun({ tenantId: 't1', runType: 'backfill', processed: 3 });
  let info = store.getRunInfo('t1');
  assert.ok(info.lastBackfillRunAt);
  assert.equal(info.processedTotal, 3);

  await store.recordRun({ tenantId: 't1', runType: 'delta', processed: 2 });
  info = store.getRunInfo('t1');
  assert.ok(info.lastDeltaRunAt);
  assert.equal(info.processedTotal, 5);

  await store.flush();
  const reloaded = await createMessageIntelligenceStore({ filePath });
  assert.equal(reloaded.getRunInfo('t1').processedTotal, 5);

  await fs.rm(dir, { recursive: true, force: true });
});

test('upsertEnrichment preserves existing fields and updates source/updatedAt', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel4-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  await store.upsertEnrichment({
    tenantId: 't1',
    mailboxId: 'mb',
    graphMessageId: 'g1',
    source: 'backfill',
    enrichment: { engineVersion: 'det-1.0.0', tone: { tone: 'neutral' }, customA: 1 },
  });
  const first = store.getEnrichment({ tenantId: 't1', mailboxId: 'mb', graphMessageId: 'g1' });
  await new Promise((r) => setTimeout(r, 5));
  await store.upsertEnrichment({
    tenantId: 't1',
    mailboxId: 'mb',
    graphMessageId: 'g1',
    source: 'delta',
    enrichment: { tone: { tone: 'anxious' }, customB: 2 },
  });
  const second = store.getEnrichment({ tenantId: 't1', mailboxId: 'mb', graphMessageId: 'g1' });
  assert.equal(second.source, 'delta');
  assert.equal(second.customA, 1);
  assert.equal(second.customB, 2);
  assert.equal(second.tone.tone, 'anxious');
  assert.equal(Date.parse(second.updatedAt) >= Date.parse(first.updatedAt), true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listEnrichments limit stops early and mailboxIds are trimmed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel5-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  await store.upsertEnrichment({ tenantId: 't1', mailboxId: 'a', graphMessageId: 'g1', enrichment: { x: 1 } });
  await store.upsertEnrichment({ tenantId: 't1', mailboxId: 'a', graphMessageId: 'g2', enrichment: { x: 2 } });
  await store.upsertEnrichment({ tenantId: 't1', mailboxId: 'b', graphMessageId: 'g3', enrichment: { x: 3 } });

  const rows = store.listEnrichments({ tenantId: 't1', mailboxIds: [' a '], limit: 1 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mailboxId, 'a');

  await fs.rm(dir, { recursive: true, force: true });
});

test('getRunInfo returns null for blank tenant and object for existing tenant', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel6-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  assert.equal(store.getRunInfo('   '), null);
  await store.recordRun({ tenantId: 'tenant-x', runType: 'delta', processed: 1 });
  const info = store.getRunInfo('tenant-x');
  assert.equal(info.tenantId, 'tenant-x');
  assert.equal(info.processedTotal, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listEnrichments treats non-array mailboxIds as no mailbox filter', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel-mailbox-type-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  await store.upsertEnrichment({ tenantId: 't1', mailboxId: 'box-a', graphMessageId: 'g1', enrichment: { x: 1 } });
  await store.upsertEnrichment({ tenantId: 't1', mailboxId: 'box-b', graphMessageId: 'g2', enrichment: { x: 2 } });

  const rows = store.listEnrichments({ tenantId: 't1', mailboxIds: 'not-an-array', limit: 20 });
  assert.equal(rows.length, 2);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listEnrichments returns copies so mutating listed engineVersion does not alter store', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel-copy-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  await store.upsertEnrichment({
    tenantId: 't1',
    mailboxId: 'mb',
    graphMessageId: 'g1',
    enrichment: { engineVersion: 'orig-1' },
  });

  const listed = store.listEnrichments({ tenantId: 't1' });
  listed[0].engineVersion = 'TAMPERED';
  const got = store.getEnrichment({ tenantId: 't1', mailboxId: 'mb', graphMessageId: 'g1' });
  assert.equal(got.engineVersion, 'orig-1');

  await fs.rm(dir, { recursive: true, force: true });
});

test('upsertEnrichment trims tenantId mailboxId graphMessageId on stored record', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel-trim-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  const merged = await store.upsertEnrichment({
    tenantId: '  tenant-z  ',
    mailboxId: '  desk@clinic.se ',
    graphMessageId: '  gm-99 ',
    enrichment: { engineVersion: 'v1' },
    source: 'delta',
  });

  assert.equal(merged.tenantId, 'tenant-z');
  assert.equal(merged.mailboxId, 'desk@clinic.se');
  assert.equal(merged.graphMessageId, 'gm-99');

  const got = store.getEnrichment({
    tenantId: 'tenant-z',
    mailboxId: 'desk@clinic.se',
    graphMessageId: 'gm-99',
  });
  assert.ok(got);

  await fs.rm(dir, { recursive: true, force: true });
});

test('enrichment persists across store instances after flush', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel-reload-'));
  const filePath = path.join(dir, 'intel.json');

  const a = await createMessageIntelligenceStore({ filePath });
  await a.upsertEnrichment({
    tenantId: 't-re',
    mailboxId: 'm@x.se',
    graphMessageId: 'g-re',
    enrichment: { engineVersion: 'persist-v', intent: { intent: 'booking_request' } },
  });
  await a.flush();

  const b = await createMessageIntelligenceStore({ filePath });
  const got = b.getEnrichment({ tenantId: 't-re', mailboxId: 'm@x.se', graphMessageId: 'g-re' });
  assert.ok(got);
  assert.equal(got.engineVersion, 'persist-v');
  assert.equal(got.intent.intent, 'booking_request');

  await fs.rm(dir, { recursive: true, force: true });
});

test('recordRun treats non-finite processed as zero increment', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mintel-processed-'));
  const filePath = path.join(dir, 'intel.json');
  const store = await createMessageIntelligenceStore({ filePath });

  await store.recordRun({ tenantId: 't-proc', runType: 'backfill', processed: 4 });
  await store.recordRun({ tenantId: 't-proc', runType: 'backfill', processed: NaN });
  const info = store.getRunInfo('t-proc');
  assert.equal(info.processedTotal, 4);

  await fs.rm(dir, { recursive: true, force: true });
});
