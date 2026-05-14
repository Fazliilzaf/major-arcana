const test = require('node:test');
const assert = require('node:assert/strict');

const { TenantUsageMetricsCapability } = require('../../src/capabilities/tenantUsageMetrics');
const { createRuntimeMetricsStore } = require('../../src/ops/runtimeMetrics');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

test('TenantUsageMetricsCapability maps runtime metrics getTenantUsage into totals', async () => {
  const metrics = createRuntimeMetricsStore({ maxSamples: 80, slowRequestMs: 99999 });
  metrics.record({ path: '/api/v1/capabilities/FooCap/run', statusCode: 200, durationMs: 1 });
  metrics.record({ path: '/api/v1/capabilities/FooCap/run', statusCode: 200, durationMs: 1 });
  metrics.record({ path: '/api/v1/auth/session', statusCode: 200, durationMs: 1 });

  const Cap = TenantUsageMetricsCapability;
  const output = await new Cap().execute({
    tenantId: 't-99',
    channel: 'admin',
    requestId: 'req-usage-1',
    correlationId: 'corr-usage-1',
    runtimeMetricsStore: metrics,
    input: { tenantId: 't-99', windowDays: 30 },
  });

  assert.equal(output.warnings.length, 0);
  assert.equal(output.data.tenantId, 't-99');
  assert.equal(output.data.windowDays, 30);
  assert.equal(output.data.totals.capabilityRunsTotal, 2);
  assert.deepEqual(output.data.totals.capabilityRunsByName, { FooCap: 2 });
  assert.equal(output.data.totals.mailboxReadsApprox, Math.floor(3 * 0.15));

  const schemaResult = validateJsonSchema({
    schema: Cap.outputSchema,
    value: output,
  });
  assert.equal(schemaResult.ok, true, JSON.stringify(schemaResult.errors || []));
});

test('TenantUsageMetricsCapability warns when runtimeMetricsStore is missing', async () => {
  const Cap = TenantUsageMetricsCapability;
  const output = await new Cap().execute({
    tenantId: 't-2',
    channel: 'admin',
    input: { windowDays: 7 },
  });

  assert.ok(output.warnings.some((w) => /runtimeMetricsStore/i.test(w)));
  assert.equal(output.data.totals.capabilityRunsTotal, 0);
  assert.deepEqual(output.data.totals.capabilityRunsByName, {});
  assert.equal(output.data.totals.mailboxReadsApprox, 0);
});

test('TenantUsageMetricsCapability: windowDays klampas till 1–365', async () => {
  const Cap = TenantUsageMetricsCapability;
  const low = await new Cap().execute({
    tenantId: 't',
    channel: 'admin',
    runtimeMetricsStore: { async getTenantUsage() { return null; } },
    input: { windowDays: 0 },
  });
  assert.equal(low.data.windowDays, 30);

  const high = await new Cap().execute({
    tenantId: 't',
    channel: 'admin',
    runtimeMetricsStore: { async getTenantUsage() { return null; } },
    input: { windowDays: 900 },
  });
  assert.equal(high.data.windowDays, 365);
});

test('TenantUsageMetricsCapability: data.tenantId fran input eller context', async () => {
  const Cap = TenantUsageMetricsCapability;
  const fromInput = await new Cap().execute({
    tenantId: 'ctx-ignored-for-data',
    channel: 'admin',
    runtimeMetricsStore: { async getTenantUsage() { return null; } },
    input: { tenantId: '  only-input  ' },
  });
  assert.equal(fromInput.data.tenantId, 'only-input');

  const fromContext = await new Cap().execute({
    tenantId: 'from-context',
    channel: 'admin',
    runtimeMetricsStore: { async getTenantUsage() { return null; } },
    input: {},
  });
  assert.equal(fromContext.data.tenantId, 'from-context');
});

test('TenantUsageMetricsCapability: saknad tenant overallt blir okand i data', async () => {
  const Cap = TenantUsageMetricsCapability;
  const out = await new Cap().execute({
    channel: 'admin',
    runtimeMetricsStore: { async getTenantUsage() { return null; } },
    input: { tenantId: '   ' },
  });
  assert.equal(out.data.tenantId, 'okand');
});

test('TenantUsageMetricsCapability: store utan getTenantUsage ger warning', async () => {
  const Cap = TenantUsageMetricsCapability;
  const out = await new Cap().execute({
    tenantId: 't',
    channel: 'admin',
    runtimeMetricsStore: {},
    input: {},
  });
  assert.ok(out.warnings.some((w) => /getTenantUsage saknas/i.test(w)));
});

test('TenantUsageMetricsCapability: getTenantUsage som kastar ger warning', async () => {
  const Cap = TenantUsageMetricsCapability;
  const out = await new Cap().execute({
    tenantId: 't',
    channel: 'admin',
    runtimeMetricsStore: {
      async getTenantUsage() {
        throw new Error('redis offline');
      },
    },
    input: {},
  });
  assert.ok(out.warnings.some((w) => /redis offline/.test(w)));
  assert.equal(out.data.totals.capabilityRunsTotal, 0);
});
