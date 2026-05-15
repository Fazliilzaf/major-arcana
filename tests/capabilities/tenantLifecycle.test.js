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

test('normalizeTenantId tom eller bara ogiltiga tecken blir tom sträng', () => {
  assert.equal(normalizeTenantId(''), '');
  assert.equal(normalizeTenantId('   '), '');
  assert.equal(normalizeTenantId('@@@'), '');
});

test('TenantCreate: ogiltigt tenantId efter normalisering ger warning och ingen patch', async () => {
  const created = [];
  const stubStore = {
    findTenantConfig: async () => null,
    updateTenantConfig: async (args) => created.push(args),
  };
  const output = await new tenantCreateCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { tenantId: '###', brand: 'X' },
  });
  assert.ok(output.warnings.some((w) => /Ogiltigt tenantId/i.test(w)));
  assert.equal(created.length, 0);
});

test('TenantList: includeDisabled true visar avstängda tenants', async () => {
  const stubStore = {
    listTenants: async () => [
      { tenantId: 'a', brand: 'A', disabled: false },
      { tenantId: 'b', brand: 'B', disabled: true },
    ],
  };
  const output = await new tenantListCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { includeDisabled: true },
  });
  assert.equal(output.data.tenants.length, 2);
  assert.equal(output.data.count, 2);
});

test('TenantList: limit kapar listan', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    tenantId: `t${i}`,
    brand: `Brand ${i}`,
    planTier: 'free',
  }));
  const stubStore = {
    listTenants: async () => many,
  };
  const output = await new tenantListCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: { limit: 4 },
  });
  assert.equal(output.data.tenants.length, 4);
  assert.equal(output.data.count, 4);
});

test('TenantList: listTenants som kastar ger warning', async () => {
  const stubStore = {
    listTenants: async () => {
      throw new Error('db down');
    },
  };
  const output = await new tenantListCapability().execute({
    ...baseContext,
    tenantConfigStore: stubStore,
    input: {},
  });
  assert.equal(output.data.tenants.length, 0);
  assert.ok(output.warnings.some((w) => /db down/.test(w)));
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
