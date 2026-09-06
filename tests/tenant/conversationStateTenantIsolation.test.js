'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-state-tenant-'));
  return { dir, filePath: path.join(dir, 'states.json') };
}

function writeHandled(store, tenantId, key) {
  return store.writeConversationState({
    tenantId,
    canonicalConversationKey: key,
    actionState: 'handled',
    needsReplyStatusOverride: 'handled',
    actionByUserId: 'u1',
  });
}

test('T-001/T-002: canonical skrivning läses tillbaka under samma canonical tenant', async () => {
  const { filePath } = makeStore();
  const store = await createCcoConversationStateStore({ filePath });
  await writeHandled(store, 'hair-tp-clinic', 'conv-1');

  const state = store.getActiveState({
    tenantId: 'hair-tp-clinic',
    canonicalConversationKey: 'conv-1',
  });
  assert.ok(state, 'canonical read ska hitta state');
  assert.equal(state.tenantId, 'hair-tp-clinic');
  assert.equal(state.actionState, 'handled');
});

test("T-011: 'cco' och canonical är TVÅ skilda nycklar (parallell truth skapas inte av canonical skrivning)", async () => {
  const { filePath } = makeStore();
  const store = await createCcoConversationStateStore({ filePath });
  await writeHandled(store, 'hair-tp-clinic', 'conv-1');

  // Under 'cco' finns inget — en reader som frågar 'cco' ser inget state.
  assert.equal(store.getActiveState({ tenantId: 'cco', canonicalConversationKey: 'conv-1' }), null);
  // Och om en legacy 'cco'-skrivning existerar bredvid, är det en SEPARAT post.
  await writeHandled(store, 'cco', 'conv-1');
  const canonical = store.getActiveState({
    tenantId: 'hair-tp-clinic',
    canonicalConversationKey: 'conv-1',
  });
  const legacy = store.getActiveState({ tenantId: 'cco', canonicalConversationKey: 'conv-1' });
  assert.ok(canonical);
  assert.ok(legacy);
  assert.notEqual(canonical.key, legacy.key);
});

test('T-015: reload bevarar canonical tenant', async () => {
  const { filePath } = makeStore();
  const store = await createCcoConversationStateStore({ filePath });
  await writeHandled(store, 'hair-tp-clinic', 'conv-1');

  // Ny instans på samma fil = process-omstart.
  const reloaded = await createCcoConversationStateStore({ filePath });
  const state = reloaded.getActiveState({
    tenantId: 'hair-tp-clinic',
    canonicalConversationKey: 'conv-1',
  });
  assert.ok(state, 'reload ska bevara canonical tenant');
  assert.equal(state.tenantId, 'hair-tp-clinic');
});

test('T-017: Hair TP och Curatiio med SAMMA conversation key är isolerade', async () => {
  const { filePath } = makeStore();
  const store = await createCcoConversationStateStore({ filePath });
  await writeHandled(store, 'hair-tp-clinic', 'shared-key');
  await writeHandled(store, 'curatiio', 'shared-key');

  const hair = store.getActiveState({
    tenantId: 'hair-tp-clinic',
    canonicalConversationKey: 'shared-key',
  });
  const curatiio = store.getActiveState({
    tenantId: 'curatiio',
    canonicalConversationKey: 'shared-key',
  });
  assert.ok(hair);
  assert.ok(curatiio);
  assert.equal(hair.tenantId, 'hair-tp-clinic');
  assert.equal(curatiio.tenantId, 'curatiio');
  assert.notEqual(hair.key, curatiio.key);

  // Cross-tenant: en tenant ser INTE den andres state.
  const hairStates = store.getActiveStatesForTenant({ tenantId: 'hair-tp-clinic' });
  const curatiioStates = store.getActiveStatesForTenant({ tenantId: 'curatiio' });
  assert.equal(hairStates.length, 1);
  assert.equal(curatiioStates.length, 1);
  assert.ok(hairStates.every((s) => s.tenantId === 'hair-tp-clinic'));
  assert.ok(curatiioStates.every((s) => s.tenantId === 'curatiio'));
});

test('T-009/T-014: främmande tenant läcker inget state', async () => {
  const { filePath } = makeStore();
  const store = await createCcoConversationStateStore({ filePath });
  await writeHandled(store, 'hair-tp-clinic', 'conv-1');

  assert.equal(
    store.getActiveState({ tenantId: 'curatiio', canonicalConversationKey: 'conv-1' }),
    null
  );
  assert.equal(store.getActiveStatesForTenant({ tenantId: 'curatiio' }).length, 0);
});
