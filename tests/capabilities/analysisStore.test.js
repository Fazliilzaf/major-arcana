const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');

test('createCapabilityAnalysisStore append list and getSummary', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-analysis-'));
  const filePath = path.join(dir, 'analysis.json');
  const store = await createCapabilityAnalysisStore({ filePath, maxEntries: 500 });

  await store.append({
    tenantId: 't-a',
    capability: { name: 'CapOne', version: '1.0.0', persistStrategy: 'analysis' },
    decision: 'allow',
    input: { x: 1 },
    output: { y: 2 },
    actor: { id: 'u1', role: 'OWNER' },
  });
  await store.append({
    tenantId: 't-a',
    capabilityName: 'CapTwo',
    capabilityVersion: '2.0.0',
    persistStrategy: 'analysis',
    decision: 'BLOCK',
    input: {},
    output: {},
  });
  await store.append({
    tenantId: 't-b',
    capability: { name: 'CapOne', version: '1.0.0', persistStrategy: 'analysis' },
    decision: 'allow',
  });

  const forTenant = await store.list({ tenantId: 't-a', limit: 10 });
  assert.equal(forTenant.length, 2);

  const capOne = await store.list({ tenantId: 't-a', capabilityName: 'capone', limit: 5 });
  assert.equal(capOne.length, 1);
  assert.equal(capOne[0].capability.name, 'CapOne');

  const summary = await store.getSummary({ tenantId: 't-a' });
  assert.equal(summary.total, 2);
  assert.equal(summary.byCapability.CapOne, 1);
  assert.equal(summary.byCapability.CapTwo, 1);

  const store2 = await createCapabilityAnalysisStore({ filePath, maxEntries: 500 });
  const again = await store2.list({ tenantId: 't-a', limit: 10 });
  assert.equal(again.length, 2);

  await fs.rm(dir, { recursive: true, force: true });
});

test('createCapabilityAnalysisStore trims entries to maxEntries on save', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-analysis-cap-'));
  const filePath = path.join(dir, 'analysis-cap.json');
  const store = await createCapabilityAnalysisStore({ filePath, maxEntries: 100 });

  for (let i = 0; i < 101; i += 1) {
    await store.append({
      tenantId: 't-one',
      capabilityName: 'CapRepeat',
      capabilityVersion: '1.0.0',
      persistStrategy: 'analysis',
      decision: 'allow',
      input: { i },
      output: {},
    });
  }

  const reopened = await createCapabilityAnalysisStore({ filePath, maxEntries: 100 });
  const listed = await reopened.list({ tenantId: 't-one', limit: 200 });
  assert.equal(listed.length, 100);

  await fs.rm(dir, { recursive: true, force: true });
});

test('createCapabilityAnalysisStore list without tenantId returns cross-tenant slice', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-analysis-all-'));
  const filePath = path.join(dir, 'analysis-all.json');
  const store = await createCapabilityAnalysisStore({ filePath, maxEntries: 500 });

  await store.append({
    tenantId: 't-alpha',
    capabilityName: 'CapX',
    persistStrategy: 'analysis',
    decision: 'allow',
  });
  await store.append({
    tenantId: 't-beta',
    capabilityName: 'CapY',
    persistStrategy: 'analysis',
    decision: 'deny',
  });

  const all = await store.list({ limit: 10 });
  assert.equal(all.length, 2);
  const tenantIds = new Set(all.map((e) => e.tenantId));
  assert.ok(tenantIds.has('t-alpha'));
  assert.ok(tenantIds.has('t-beta'));

  await fs.rm(dir, { recursive: true, force: true });
});

test('createCapabilityAnalysisStore append normalizes blank decision to unknown', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-analysis-dec-'));
  const filePath = path.join(dir, 'analysis-dec.json');
  const store = await createCapabilityAnalysisStore({ filePath, maxEntries: 500 });

  await store.append({
    tenantId: 't-z',
    capabilityName: 'CapZ',
    persistStrategy: 'analysis',
    decision: '  \t  ',
    input: {},
    output: {},
  });

  const rows = await store.list({ tenantId: 't-z', limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].decision, 'unknown');

  await fs.rm(dir, { recursive: true, force: true });
});

test('createCapabilityAnalysisStore list returns newest entries first', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-analysis-order-'));
  const filePath = path.join(dir, 'analysis-order.json');
  const store = await createCapabilityAnalysisStore({ filePath, maxEntries: 500 });

  await store.append({
    tenantId: 't-sort',
    capabilityName: 'CapOld',
    persistStrategy: 'analysis',
    decision: 'allow',
    input: { seq: 1 },
    output: {},
  });
  await new Promise((r) => setTimeout(r, 15));
  await store.append({
    tenantId: 't-sort',
    capabilityName: 'CapNew',
    persistStrategy: 'analysis',
    decision: 'allow',
    input: { seq: 2 },
    output: {},
  });

  const rows = await store.list({ tenantId: 't-sort', limit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].input.seq, 2);
  assert.equal(rows[1].input.seq, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('createCapabilityAnalysisStore append lowercases decision', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-analysis-dec2-'));
  const filePath = path.join(dir, 'analysis-dec2.json');
  const store = await createCapabilityAnalysisStore({ filePath, maxEntries: 500 });

  await store.append({
    tenantId: 't-d',
    capabilityName: 'CapD',
    persistStrategy: 'analysis',
    decision: 'BLOCK',
    input: {},
    output: {},
  });

  const rows = await store.list({ tenantId: 't-d', limit: 5 });
  assert.equal(rows[0].decision, 'block');

  await fs.rm(dir, { recursive: true, force: true });
});
