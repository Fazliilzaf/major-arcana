const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCfoFortnoxStore } = require('../../src/cfo/cfoFortnoxStore');

test('createCfoFortnoxStore rejects empty filePath', async () => {
  await assert.rejects(() => createCfoFortnoxStore({ filePath: '' }), /filePath/i);
});

test('fortnox store saves connection and exposes public status', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-fortnox-'));
  const filePath = path.join(dir, 'fortnox.json');
  const store = await createCfoFortnoxStore({ filePath });

  const initial = await store.getPublicStatus({ tenantId: 'tenant-a' });
  assert.equal(initial.connected, false);

  await store.saveConnection({
    tenantId: 'tenant-a',
    actorUserId: 'owner-1',
    connection: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      scope: 'customer invoice',
    },
  });

  const connected = await store.getPublicStatus({ tenantId: 'tenant-a' });
  assert.equal(connected.connected, true);
  assert.equal(connected.scope, 'customer invoice');

  await store.clearConnection({ tenantId: 'tenant-a' });
  const cleared = await store.getPublicStatus({ tenantId: 'tenant-a' });
  assert.equal(cleared.connected, false);

  await fs.rm(dir, { recursive: true, force: true });
});

test('fortnox store oauth state is single-use', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-fortnox-oauth-'));
  const filePath = path.join(dir, 'fortnox.json');
  const store = await createCfoFortnoxStore({ filePath });

  const state = await store.createOAuthState({
    tenantId: 'tenant-a',
    actorUserId: 'owner-1',
  });
  assert.ok(state);

  const first = await store.consumeOAuthState(state);
  assert.deepEqual(first, { tenantId: 'tenant-a', actorUserId: 'owner-1' });

  const second = await store.consumeOAuthState(state);
  assert.equal(second, null);

  await fs.rm(dir, { recursive: true, force: true });
});
