const test = require('node:test');
const assert = require('node:assert/strict');

const { isEnabled, runBootstrap, getBootstrapStatus, STATUS, scheduleBootstrap } = require('../../src/ops/bootstrapRunner');

function envSnapshot(key) {
  return Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
}

async function withEnv(key, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, key);
  const prev = envSnapshot(key);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (had) process.env[key] = prev;
    else delete process.env[key];
  }
}

test('isEnabled only when ARCANA_BOOTSTRAP_MAILBOX_BACKFILL is literally true', async () => {
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', undefined, async () => {
    assert.equal(isEnabled(), false);
  });
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', 'false', async () => {
    assert.equal(isEnabled(), false);
  });
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', 'TRUE', async () => {
    assert.equal(isEnabled(), true);
  });
});

test('runBootstrap returns skipped status when bootstrap env disabled', async () => {
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', undefined, async () => {
    const status = await runBootstrap({ tenantId: 'any-tenant' });
    assert.equal(status.status, STATUS.skipped);
    assert.equal(status.enabled, false);
    assert.ok(Array.isArray(status.stages));
    assert.ok(status.stages.some((s) => s.name === 'skipped'));
  });
});

test('getBootstrapStatus returns a plain serializable snapshot', () => {
  const snap = getBootstrapStatus();
  assert.ok(snap && typeof snap === 'object');
  assert.ok(Object.values(STATUS).includes(snap.status));
  const roundTrip = JSON.parse(JSON.stringify(snap));
  assert.equal(roundTrip.status, snap.status);
});

test('isEnabled requires exact lowercase true without surrounding whitespace', async () => {
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', '  true  ', async () => {
    assert.equal(isEnabled(), false);
  });
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', 'true', async () => {
    assert.equal(isEnabled(), true);
  });
});

test('runBootstrap completes with skipped graph stage when enabled but deps missing', async () => {
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', 'true', async () => {
    const status = await runBootstrap({ tenantId: 'unit-test-tenant' });
    assert.equal(status.status, STATUS.completed);
    assert.equal(status.enabled, true);
    assert.equal(status.result.tenantId, 'unit-test-tenant');
    assert.ok(status.stages.some((s) => s.name === 'graph_backfill_skipped'));
    assert.ok(status.stages.some((s) => s.name === 'done'));
    assert.equal(status.result.graphBackfill, null);
  });
});

test('scheduleBootstrap records skipped when bootstrap is disabled', async () => {
  await withEnv('ARCANA_BOOTSTRAP_MAILBOX_BACKFILL', undefined, async () => {
    scheduleBootstrap({ tenantId: 'ignored' });
    const snap = getBootstrapStatus();
    assert.equal(snap.status, STATUS.skipped);
    assert.equal(snap.enabled, false);
    assert.ok(snap.stages.some((s) => s.name === 'skipped'));
  });
});
