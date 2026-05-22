const test = require('node:test');
const assert = require('node:assert/strict');

const { BaseCapability } = require('../../src/capabilities/baseCapability');
const { ROLE_OWNER } = require('../../src/security/roles');
const {
  validateCapabilityClass,
  assertCapabilityClass,
} = require('../../src/capabilities/capabilityContract');
const { GdprExportCustomerCapability } = require('../../src/capabilities/gdprCustomer');

test('validateCapabilityClass rejects non-class input', () => {
  const r = validateCapabilityClass({});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /extend BaseCapability/i.test(e)));
});

test('validateCapabilityClass accepts shipped GDPR export capability', () => {
  const r = validateCapabilityClass(GdprExportCustomerCapability);
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('assertCapabilityClass throws aggregated message on invalid definition', () => {
  class BadCap extends BaseCapability {
    static name = '';
    static version = '';
  }
  assert.throws(() => assertCapabilityClass(BadCap), /Invalid capability definition/i);
});

test('assertCapabilityClass returns class when valid', () => {
  class GoodCap extends BaseCapability {
    static name = 'GoodCap';
    static version = '0.0.1';
    static allowedRoles = [ROLE_OWNER];
    static allowedChannels = ['admin'];
    static requiresInputRisk = false;
    static requiresOutputRisk = false;
    static requiresPolicyFloor = false;
    static persistStrategy = 'analysis';
    static auditStrategy = 'always';
    static inputSchema = { type: 'object' };
    static outputSchema = { type: 'object' };
    async execute() {
      return {};
    }
  }
  assert.strictEqual(assertCapabilityClass(GoodCap), GoodCap);
});

test('validateCapabilityClass flags invalid persistStrategy and auditStrategy', () => {
  class BadStrategies extends BaseCapability {
    static name = 'BadStrategies';
    static version = '1.0.0';
    static allowedRoles = [ROLE_OWNER];
    static allowedChannels = ['admin'];
    static requiresInputRisk = false;
    static requiresOutputRisk = false;
    static requiresPolicyFloor = false;
    static persistStrategy = 'wrong';
    static auditStrategy = 'sometimes';
    static inputSchema = { type: 'object' };
    static outputSchema = { type: 'object' };
    async execute() {
      return {};
    }
  }
  const r = validateCapabilityClass(BadStrategies);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /persistStrategy/i.test(e)));
  assert.ok(r.errors.some((e) => /auditStrategy/i.test(e)));
});

test('validateCapabilityClass flags empty allowedRoles', () => {
  class NoRoles extends BaseCapability {
    static name = 'NoRoles';
    static version = '1.0.0';
    static allowedRoles = [];
    static allowedChannels = ['admin'];
    static requiresInputRisk = false;
    static requiresOutputRisk = false;
    static requiresPolicyFloor = false;
    static persistStrategy = 'none';
    static auditStrategy = 'always';
    static inputSchema = { type: 'object' };
    static outputSchema = { type: 'object' };
    async execute() {
      return {};
    }
  }
  const r = validateCapabilityClass(NoRoles);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /allowedRoles/i.test(e)));
});

test('validateCapabilityClass flags non-boolean risk flags', () => {
  class BadRisk extends BaseCapability {
    static name = 'BadRisk';
    static version = '1.0.0';
    static allowedRoles = [ROLE_OWNER];
    static allowedChannels = ['admin'];
    static requiresInputRisk = 'yes';
    static requiresOutputRisk = false;
    static requiresPolicyFloor = false;
    static persistStrategy = 'none';
    static auditStrategy = 'always';
    static inputSchema = { type: 'object' };
    static outputSchema = { type: 'object' };
    async execute() {
      return {};
    }
  }
  const r = validateCapabilityClass(BadRisk);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /requiresInputRisk/i.test(e)));
});
