'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  tenantListCapability,
  tenantCreateCapability,
  tenantDisableCapability,
  normalizeTenantId,
} = require('../../src/capabilities/tenantLifecycle');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

const baseContext = {
  tenantId: 'super-admin',
  actor: { id: 'admin-1', role: 'OWNER' },
  channel: 'admin',
  requestId: 'req-1',
  correlationId: 'corr-1',
};

test('normalizeTenantId konverterar till kebab-case', () => {
  assert.equal(normalizeTenantId('Acme Clinic'), 'acme-clinic');
  assert.equal(normalizeTenantId('hair_TP_Klinik!'), 'hair-tp-klinik');
  assert.equal(normalizeTenantId('  --foo--  '), 'foo');
});

test('TenantList: utan store returnerar tom lista + warning', async () => {
  const output = await new tenantListCapability().execute({ ...baseContext, input: {} });
  assert.equal(output.data.tenants.length, 0);
  assert.ok(output.warnings.some((w) => w.includes('Stub')));
});

test('TenantList: med stub-store returnerar tenants', async () => {
  const stubStore = {
    listTenants: async () => [
      { tenantId: 'a', brand: 'Acme', planTier: 'free' },
      { tenantId: 'b', brand: 'Beta', planTier: 'pro', disabled: true },
    ],
  };
  const output = await new tenantListCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { includeDisabled: false },
  });
  assert.equal(output.data.tenants.length, 1);
  assert.equal(output.data.tenants[0].tenantId, 'a');
});

test('TenantCreate: skapar ny tenant via stub-store', async () => {
  const created = [];
  const stubStore = {
    findTenantConfig: async () => null,
    updateTenantConfig: async (args) => created.push(args),
  };
  const output = await new tenantCreateCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { tenantId: 'New Clinic', brand: 'New Clinic AB', planTier: 'starter' },
  });
  assert.equal(output.data.tenantId, 'new-clinic');
  assert.equal(output.data.alreadyExists, false);
  assert.equal(created.length, 1);
  assert.equal(created[0].patch.brand, 'New Clinic AB');
});

test('TenantCreate: existing tenant ger alreadyExists=true', async () => {
  const stubStore = {
    findTenantConfig: async () => ({ tenantId: 'existing' }),
  };
  const output = await new tenantCreateCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { tenantId: 'Existing', brand: 'X' },
  });
  assert.equal(output.data.alreadyExists, true);
  assert.ok(output.warnings.some((w) => w.includes('finns redan')));
});

test('TenantDisable: kräver reason', async () => {
  const inputResult = validateJsonSchema({
    schema: tenantDisableCapability.inputSchema,
    value: { tenantId: 'foo' },
  });
  assert.equal(inputResult.ok, false);
});

test('TenantDisable: reason >5 tecken accepteras', async () => {
  const updates = [];
  const stubStore = {
    updateTenantConfig: async (args) => updates.push(args),
  };
  const output = await new tenantDisableCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { tenantId: 'foo-clinic', reason: 'Avtal upphört' },
  });
  assert.equal(output.data.disabled, true);
  assert.equal(output.data.reason, 'Avtal upphört');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.disabled, true);
});

test('TenantList output schema-validation', async () => {
  const output = await new tenantListCapability().execute({ ...baseContext, input: {} });
  const result = validateJsonSchema({
    schema: tenantListCapability.outputSchema,
    value: output,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});
