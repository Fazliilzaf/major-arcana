const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTenantConfigStore } = require('../../src/tenant/configStore');

async function makeStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-tenant-config-'));
  const filePath = path.join(dir, 'tenant-config.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createTenantConfigStore({ filePath, defaultBrand: 'hair-tp-clinic' });
  return { store, filePath };
}

test('getTenantConfig seeds default config and trims tenant id', async (t) => {
  const { store } = await makeStore(t);
  const cfg = await store.getTenantConfig('  tenant-a  ');

  assert.equal(cfg.tenantId, 'tenant-a');
  assert.equal(cfg.brandProfile, 'hair-tp-clinic');
  assert.equal(cfg.riskSensitivityModifier, 0);
  assert.equal(cfg.riskThresholdVersion, 1);
  assert.equal(Array.isArray(cfg.riskThresholdHistory), true);
  assert.equal(cfg.riskThresholdHistory.length, 1);
  assert.equal(cfg.riskThresholdHistory[0].version, 1);
  assert.equal(cfg.riskThresholdHistory[0].changeSource, 'seed');
});

test('updateTenantConfig appends risk threshold history when modifier changes', async (t) => {
  const { store } = await makeStore(t);
  await store.getTenantConfig('tenant-risk');

  const updated = await store.updateTenantConfig({
    tenantId: 'tenant-risk',
    actorUserId: 'operator-1',
    patch: { riskSensitivityModifier: 7.777 },
    riskChangeMeta: {
      changeSource: '  Manual_UI ',
      note: 'x'.repeat(600),
      rollbackFromVersion: '1',
    },
  });

  assert.equal(updated.riskSensitivityModifier, 7.78);
  assert.equal(updated.riskThresholdVersion, 2);
  assert.equal(updated.riskThresholdHistory.length, 2);
  const latest = updated.riskThresholdHistory[1];
  assert.equal(latest.version, 2);
  assert.equal(latest.changedBy, 'operator-1');
  assert.equal(latest.changeSource, 'manual_ui');
  assert.equal(latest.rollbackFromVersion, 1);
  assert.equal(latest.note.length, 280);
});

test('listRiskThresholdVersions clamps limit and returns newest first', async (t) => {
  const { store } = await makeStore(t);
  await store.getTenantConfig('tenant-limit');
  await store.updateTenantConfig({
    tenantId: 'tenant-limit',
    patch: { riskSensitivityModifier: 1 },
  });
  await store.updateTenantConfig({
    tenantId: 'tenant-limit',
    patch: { riskSensitivityModifier: 2 },
  });

  const bounded = await store.listRiskThresholdVersions({ tenantId: 'tenant-limit', limit: 0 });
  assert.equal(bounded.length, 1);
  assert.equal(bounded[0].version, 3);

  const fallback = await store.listRiskThresholdVersions({ tenantId: 'tenant-limit', limit: 'nope' });
  assert.equal(fallback.length, 3);
  assert.equal(fallback[0].version, 3);
  assert.equal(fallback[1].version, 2);
  assert.equal(fallback[2].version, 1);
});

test('getRiskThresholdVersion validates version and returns null when missing', async (t) => {
  const { store } = await makeStore(t);
  await store.getTenantConfig('tenant-version');
  await assert.rejects(
    () => store.getRiskThresholdVersion({ tenantId: 'tenant-version', version: 0 }),
    /version måste vara ett positivt heltal\./
  );
  const missing = await store.getRiskThresholdVersion({ tenantId: 'tenant-version', version: 99 });
  assert.equal(missing, null);
});

test('getTenantConfig and updateTenantConfig reject blank or non-string tenantId', async (t) => {
  const { store } = await makeStore(t);
  await assert.rejects(() => store.getTenantConfig(''), /tenantId saknas/);
  await assert.rejects(() => store.getTenantConfig('   '), /tenantId saknas/);
  await assert.rejects(() => store.getTenantConfig(null), /tenantId saknas/);
  await assert.rejects(
    () => store.updateTenantConfig({ tenantId: '', patch: { assistantName: 'X' } }),
    /tenantId saknas/
  );
});

test('updateTenantConfig isolates tenants when patching assistantName', async (t) => {
  const { store } = await makeStore(t);
  const beforeB = (await store.getTenantConfig('tenant-b-only')).assistantName;
  await store.getTenantConfig('tenant-a-only');
  await store.updateTenantConfig({
    tenantId: 'tenant-a-only',
    patch: { assistantName: 'Alpha Assistant' },
  });
  const a = await store.getTenantConfig('tenant-a-only');
  const b = await store.getTenantConfig('tenant-b-only');
  assert.equal(a.assistantName, 'Alpha Assistant');
  assert.equal(b.assistantName, beforeB);
});

test('updateTenantConfig clamps riskSensitivityModifier to -10..10', async (t) => {
  const { store } = await makeStore(t);
  await store.getTenantConfig('tenant-risk-clamp');
  const high = await store.updateTenantConfig({
    tenantId: 'tenant-risk-clamp',
    patch: { riskSensitivityModifier: 99.99 },
  });
  assert.equal(high.riskSensitivityModifier, 10);
  const low = await store.updateTenantConfig({
    tenantId: 'tenant-risk-clamp',
    patch: { riskSensitivityModifier: -50 },
  });
  assert.equal(low.riskSensitivityModifier, -10);
});
