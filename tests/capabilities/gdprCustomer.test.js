const test = require('node:test');
const assert = require('node:assert/strict');

const {
  makePseudonym,
  GdprExportCustomerCapability,
  GdprAnonymizeCustomerCapability,
} = require('../../src/capabilities/gdprCustomer');

test('makePseudonym is deterministic for tenant and customer pair', () => {
  const a = makePseudonym('tenant-1', 'cust-9');
  const b = makePseudonym('tenant-1', 'cust-9');
  assert.equal(a, b);
  assert.match(a, /^anonymized-[0-9a-f]{16}$/);
  assert.notEqual(makePseudonym('tenant-2', 'cust-9'), a);
});

test('makePseudonym trimmar tenant och customerId', () => {
  assert.equal(
    makePseudonym('  tenant-1  ', '  cust-9  '),
    makePseudonym('tenant-1', 'cust-9'),
  );
});

test('GdprExportCustomerCapability: saknad tenantId defaultar till okand', async () => {
  const cap = new GdprExportCustomerCapability();
  const out = await cap.execute({
    channel: 'admin',
    input: { customerId: 'x@y.se' },
    ccoCustomerStore: {
      async peekTenantCustomerState() {
        return { directory: {}, details: {}, primaryEmailByKey: {} };
      },
    },
  });
  assert.equal(out.data.tenantId, 'okand');
  assert.equal(out.metadata.tenantId, 'okand');
});

test('GdprExportCustomerCapability: includeThreads false utelämnar trådsektion', async () => {
  const cap = new GdprExportCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: {
      customerId: 'k@example.com',
      includeThreads: false,
      includeAuditTrail: false,
    },
    ccoCustomerStore: {
      async peekTenantCustomerState() {
        return {
          directory: { key1: { name: 'A' } },
          details: { key1: { emails: ['k@example.com'] } },
          primaryEmailByKey: { key1: 'k@example.com' },
        };
      },
    },
  });
  assert.equal(out.data.sections.threads, undefined);
  assert.equal(out.data.sections.auditTrail, undefined);
  assert.equal(out.data.summary.threadCount, 0);
  assert.equal(out.data.summary.auditCount, 0);
});

test('GdprExportCustomerCapability: includeThreads true utan historyStore ger warning', async () => {
  const cap = new GdprExportCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerId: 'k@example.com', includeThreads: true },
    ccoCustomerStore: {
      async peekTenantCustomerState() {
        return {
          directory: { key1: { name: 'A' } },
          details: { key1: { emails: ['k@example.com'] } },
          primaryEmailByKey: { key1: 'k@example.com' },
        };
      },
    },
  });
  assert.ok(out.warnings.some((w) => /trådar ej hämtade/i.test(w)));
});

test('GdprExportCustomerCapability: peekTenantCustomerState som kastar ger profile-varning', async () => {
  const cap = new GdprExportCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerId: 'any' },
    ccoCustomerStore: {
      async peekTenantCustomerState() {
        throw new Error('store timeout');
      },
    },
  });
  assert.ok(out.warnings.some((w) => /store timeout/.test(w)));
  assert.equal(out.data.sections.profile.error, true);
});

test('GdprAnonymizeCustomerCapability: giltig reason utan extra varning', async () => {
  const cap = new GdprAnonymizeCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerId: 'c1', reason: 'Begäran enligt GDPR artikel 17' },
  });
  assert.equal(out.warnings.length, 0);
  assert.equal(out.data.reason, 'Begäran enligt GDPR artikel 17');
  assert.ok(Array.isArray(out.data.fieldsAnonymized));
  assert.ok(out.data.fieldsAnonymized.length > 0);
});

test('GdprExportCustomerCapability returns warning when customerId missing', async () => {
  const cap = new GdprExportCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerId: '   ' },
  });
  assert.ok(out.warnings.some((w) => /customerId saknas/i.test(w)));
  assert.equal(out.data.summary.threadCount, 0);
});

test('GdprExportCustomerCapability flags missing customer in store', async () => {
  const cap = new GdprExportCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerId: 'unknown@example.com' },
    ccoCustomerStore: {
      async peekTenantCustomerState() {
        return { directory: {}, details: {}, primaryEmailByKey: {} };
      },
    },
  });
  assert.ok(out.warnings.some((w) => /hittades inte/i.test(w)));
  assert.equal(out.data.sections.profile.found, false);
});

test('GdprAnonymizeCustomerCapability warns on short reason', async () => {
  const cap = new GdprAnonymizeCustomerCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerId: 'c1', reason: 'kort' },
  });
  assert.ok(out.warnings.some((w) => /minst 5 tecken/i.test(w)));
  assert.match(out.data.pseudonym, /^anonymized-/);
});
