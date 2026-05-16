const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');

test('createCcoCustomerStore throws without filePath', async () => {
  await assert.rejects(() => createCcoCustomerStore({ filePath: '' }), /filePath/i);
  await assert.rejects(() => createCcoCustomerStore({}), /filePath/i);
});

test('peekTenantCustomerState materializes default tenant customer state', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customers-'));
  const filePath = path.join(dir, 'customers.json');
  const store = await createCcoCustomerStore({ filePath });
  const state = await store.peekTenantCustomerState({ tenantId: 'tenant-x' });
  assert.ok(state && typeof state === 'object');
  assert.ok('identityByKey' in state || 'details' in state || 'primaryEmailByKey' in state);
  await fs.rm(dir, { recursive: true, force: true });
});

test('createCcoCustomerStore rejects whitespace-only filePath', async () => {
  await assert.rejects(() => createCcoCustomerStore({ filePath: '   ' }), /filePath/i);
});

test('peekTenantCustomerState and getTenantCustomerState reject blank tenantId', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customers-tenant-'));
  const filePath = path.join(dir, 'customers.json');
  try {
    const store = await createCcoCustomerStore({ filePath });
    await assert.rejects(() => store.peekTenantCustomerState({ tenantId: '' }), /tenantId/i);
    await assert.rejects(() => store.getTenantCustomerState({ tenantId: '  ' }), /tenantId/i);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('tenantId is normalized by trimming for tenant bucket lookup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customers-trim-'));
  const filePath = path.join(dir, 'customers.json');
  try {
    const store = await createCcoCustomerStore({ filePath });
    const spaced = await store.peekTenantCustomerState({ tenantId: '  acme-corp  ' });
    const plain = await store.peekTenantCustomerState({ tenantId: 'acme-corp' });
    assert.deepEqual(spaced, plain);
    assert.equal(spaced.customerSettings.auto_merge, true);
    assert.equal(spaced.customerSettings.strict_email, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('previewTenantCustomerIdentity returns customerState suggestionGroups and duplicateCount', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customers-preview-'));
  const filePath = path.join(dir, 'customers.json');
  try {
    const store = await createCcoCustomerStore({ filePath });
    const preview = await store.previewTenantCustomerIdentity({ tenantId: 't-preview' });
    assert.ok(preview.customerState && typeof preview.customerState === 'object');
    assert.ok(preview.suggestionGroups && typeof preview.suggestionGroups === 'object');
    assert.equal(typeof preview.duplicateCount, 'number');
    assert.ok(preview.duplicateCount >= 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('getTenantCustomerState returns a deep clone independent from later mutations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customers-clone-'));
  const filePath = path.join(dir, 'customers.json');
  try {
    const store = await createCcoCustomerStore({ filePath });
    const snapshot = await store.getTenantCustomerState({ tenantId: 't-clone' });
    snapshot.customerSettings = { auto_merge: false, highlight_duplicates: false, strict_email: true };
    const again = await store.getTenantCustomerState({ tenantId: 't-clone' });
    assert.equal(again.customerSettings.auto_merge, true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
