const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');
const { runDigestForTenant, runDailyDigestForAllTenants } = require('../../src/ops/dailyDigestRunner');

test('runDigestForTenant throws without tenantId', async () => {
  await assert.rejects(
    () => runDigestForTenant({ tenantId: '  ', tenantConfig: {} }),
    /tenantId/i,
  );
});

test('runDigestForTenant trims tenantId in dryRun result', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun-trim-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: '  tenant-trim  ',
    tenantConfig: {
      digest: { enabled: true, recipients: ['ops@example.com'] },
      brand: { name: 'Clinic' },
    },
    tenantConfigStore,
    ccoHistoryStore,
    forceSend: true,
    dryRun: true,
  });

  assert.equal(r.tenantId, 'tenant-trim');

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant uses recipientsOverride when provided as array', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun-override-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: { enabled: true, recipients: ['ignored@example.com'] },
    },
    tenantConfigStore,
    ccoHistoryStore,
    recipientsOverride: ['only@override.com', ' second@override.com '],
    forceSend: true,
    dryRun: true,
  });

  assert.deepEqual(r.recipients, ['only@override.com', ' second@override.com ']);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant falls back to sv copy when locale is unknown', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun-locale-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: { enabled: true, recipients: ['ops@example.com'], locale: 'xx-YY' },
      brand: { name: 'Lokal' },
    },
    tenantConfigStore,
    ccoHistoryStore,
    forceSend: true,
    dryRun: true,
  });

  assert.match(r.subject, /Daglig översikt/);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant sets senderMailboxId from brand preferredMailbox when digest omits sender', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun-sender-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: { enabled: true, recipients: ['ops@example.com'] },
      brand: { preferredMailbox: 'desk@clinic.se' },
    },
    tenantConfigStore,
    ccoHistoryStore,
    forceSend: true,
    dryRun: false,
  });

  assert.equal(r.senderMailboxId, 'desk@clinic.se');
  assert.equal(r.sent, false);
  assert.equal(r.skipped, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant captures error when sendNewMessage throws', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun-graph-err-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: { enabled: true, recipients: ['ops@example.com'] },
    },
    tenantConfigStore,
    ccoHistoryStore,
    graphSendConnector: {
      sendNewMessage: async () => {
        throw new Error('graph mailbox unavailable');
      },
    },
    forceSend: true,
    dryRun: false,
    logger: { warn: () => {} },
  });

  assert.equal(r.sent, false);
  assert.match(r.error, /graph mailbox unavailable/);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant skipped when digest disabled and not forced', async () => {
  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: { digest: { enabled: false, recipients: ['a@b.co'] } },
    forceSend: false,
  });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'digest_disabled');
});

test('runDigestForTenant skipped when no recipients even if forced', async () => {
  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: { digest: { enabled: true, recipients: [] } },
    forceSend: true,
  });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'no_recipients');
});

test('runDigestForTenant dryRun with forceSend builds digest without sending', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: {
        enabled: true,
        recipients: ['ops@example.com'],
        locale: 'en',
      },
      brand: { displayName: 'Clinic X' },
    },
    tenantConfigStore,
    ccoHistoryStore,
    forceSend: true,
    dryRun: true,
  });

  assert.equal(r.dryRun, true);
  assert.match(r.subject, /Daily summary/);
  assert.ok(r.htmlLength > 0);
  assert.ok(r.textLength > 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant persists lastSentAt on successful send', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun2-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });

  let capturedPatch = null;
  const tenantConfigStore = {
    getTenantConfig: async () => ({}),
    updateTenantConfig: async ({ patch }) => {
      capturedPatch = patch;
    },
  };

  const graphSendConnector = {
    sendNewMessage: async () => ({ id: 'graph-msg-1' }),
  };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: {
        enabled: true,
        recipients: ['lead@example.com'],
        locale: 'sv',
      },
      brand: { name: 'Demo' },
    },
    tenantConfigStore,
    ccoHistoryStore,
    graphSendConnector,
    forceSend: true,
    dryRun: false,
  });

  assert.equal(r.sent, true);
  assert.ok(capturedPatch?.digest?.lastSentAt);
  assert.equal(capturedPatch.digest.lastError, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDigestForTenant skips send when graphSendConnector missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun3-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });
  const tenantConfigStore = { getTenantConfig: async () => ({}) };

  const r = await runDigestForTenant({
    tenantId: 't1',
    tenantConfig: {
      digest: { enabled: true, recipients: ['x@y.z'] },
    },
    tenantConfigStore,
    ccoHistoryStore,
    forceSend: true,
    dryRun: false,
  });

  assert.equal(r.sent, false);
  assert.equal(r.skipped, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('runDailyDigestForAllTenants returns early when listTenants missing', async () => {
  const r = await runDailyDigestForAllTenants({
    tenantConfigStore: {},
    ccoHistoryStore: null,
  });
  assert.equal(r.skipped, true);
  assert.match(String(r.reason), /listTenants/i);
});

test('runDailyDigestForAllTenants marks disabled tenants and digest_disabled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ddrun4-'));
  const histPath = path.join(dir, 'history.json');
  const ccoHistoryStore = await createCcoHistoryStore({ filePath: histPath });

  const r = await runDailyDigestForAllTenants({
    tenantConfigStore: {
      listTenants: async () => [
        { tenantId: 't-off', disabled: true },
        { tenantId: 't-plain', digest: { enabled: false } },
      ],
      getTenantConfig: async () => ({}),
    },
    ccoHistoryStore,
    forceSend: false,
    dryRun: true,
  });

  assert.equal(r.results.length, 2);
  assert.equal(r.results[0].reason, 'tenant_disabled');
  assert.equal(r.results[1].reason, 'digest_disabled');

  await fs.rm(dir, { recursive: true, force: true });
});
