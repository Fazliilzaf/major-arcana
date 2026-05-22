const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMacroStore } = require('../../src/ops/ccoMacroStore');

test('createCcoMacroStore rejects empty or whitespace filePath', async () => {
  await assert.rejects(() => createCcoMacroStore({ filePath: '' }), /filePath/i);
  await assert.rejects(() => createCcoMacroStore({ filePath: '  \n\t' }), /filePath/i);
});

test('listTenantMacros seeds default macros', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  const macros = await store.listTenantMacros({ tenantId: 't1' });
  assert.ok(macros.length >= 2);
  const booking = macros.find((m) => m.id === 'booking-flow');
  assert.ok(booking);
  assert.equal(booking.trigger, 'manual');
  assert.ok(Array.isArray(booking.actions));
  assert.equal(booking.actions[0].type, 'template');

  await fs.rm(dir, { recursive: true, force: true });
});

test('listTenantMacros throws when tenantId is blank', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro-tenant-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  await assert.rejects(() => store.listTenantMacros({ tenantId: '' }), /tenantId/i);
  await assert.rejects(() => store.listTenantMacros({ tenantId: '   ' }), /tenantId/i);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runMacro returns null when macroId is unknown', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro-run-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  await store.listTenantMacros({ tenantId: 't1' });
  const ran = await store.runMacro({ tenantId: 't1', macroId: 'unknown-macro-id' });
  assert.equal(ran, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('deleteMacro returns false when macroId is unknown', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro-del-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  await store.listTenantMacros({ tenantId: 't1' });
  const before = await store.listTenantMacros({ tenantId: 't1' });
  const deleted = await store.deleteMacro({ tenantId: 't1', macroId: 'no-such-macro' });
  assert.equal(deleted, false);
  const after = await store.listTenantMacros({ tenantId: 't1' });
  assert.equal(after.length, before.length);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listTenantMacros returns copies so mutating listed macro name does not stick', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro-clone-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  const first = await store.listTenantMacros({ tenantId: 't1' });
  first[0].name = 'TAMPERED_NAME_SHOULD_NOT_PERSIST';
  const second = await store.listTenantMacros({ tenantId: 't1' });
  assert.notEqual(second[0].name, 'TAMPERED_NAME_SHOULD_NOT_PERSIST');

  await fs.rm(dir, { recursive: true, force: true });
});

test('macros persist across store instances after saveMacro', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro-reload-'));
  const filePath = path.join(dir, 'macros.json');

  const first = await createCcoMacroStore({ filePath });
  await first.saveMacro({
    tenantId: 'tenant-reload',
    macro: { id: 'persist-macro', name: 'Persisted title', trigger: 'manual', actions: [] },
  });

  const second = await createCcoMacroStore({ filePath });
  const list = await second.listTenantMacros({ tenantId: 'tenant-reload' });
  const found = list.find((m) => m.id === 'persist-macro');
  assert.ok(found);
  assert.equal(found.name, 'Persisted title');

  await fs.rm(dir, { recursive: true, force: true });
});

test('saveMacro upserts and normalizes action types', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro2-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  const created = await store.saveMacro({
    tenantId: 't1',
    macro: {
      id: 'custom-1',
      name: ' Test ',
      trigger: 'AUTO',
      actions: [{ type: 'INVALID', config: { x: 1 } }, { type: 'tag', config: { tag: 'x' } }],
    },
  });
  assert.equal(created.name, 'Test');
  assert.equal(created.trigger, 'auto');
  assert.equal(created.actions[0].type, 'template');
  assert.equal(created.actions[1].type, 'tag');

  const updated = await store.saveMacro({
    tenantId: 't1',
    macro: { id: 'custom-1', name: 'Renamed', trigger: 'manual', actions: [] },
  });
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.trigger, 'manual');

  await fs.rm(dir, { recursive: true, force: true });
});

test('runMacro increments runCount; deleteMacro removes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-macro3-'));
  const filePath = path.join(dir, 'macros.json');
  const store = await createCcoMacroStore({ filePath });

  await store.listTenantMacros({ tenantId: 't1' });
  const ran = await store.runMacro({ tenantId: 't1', macroId: 'booking-flow' });
  assert.ok(ran);
  assert.equal(ran.runCount, 1);
  assert.ok(ran.lastRunAt);

  const again = await store.runMacro({ tenantId: 't1', macroId: 'booking-flow' });
  assert.equal(again.runCount, 2);

  const deleted = await store.deleteMacro({ tenantId: 't1', macroId: 'vip-greeting' });
  assert.equal(deleted, true);
  const list = await store.listTenantMacros({ tenantId: 't1' });
  assert.ok(!list.some((m) => m.id === 'vip-greeting'));

  await fs.rm(dir, { recursive: true, force: true });
});
